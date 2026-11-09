"""1-② 공 찾기: 펼친 당구대 이미지에서 흰공·노란공·빨간공의 위치를 찾는다.

여러 장면을 표본으로 검사하고 표시 이미지를 저장한다:
    .venv/bin/python -m analyzer.detect data/videos/영상파일.MP4 --samples 60
"""
import argparse
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from analyzer.calibrate import MARGIN, TABLE_H, TABLE_W, find_corners, table_transform, warp_table

# 펼친 이미지에서의 공 반지름(px). 소스 영상 측정값 기준
BALL_RADIUS = 18
BALL_AREA = math.pi * BALL_RADIUS**2

# 공별 HSV 범위. 흰공은 크림색이라 채도를 조금 허용한다.
COLOR_RANGES = {
    "white": [((0, 0, 150), (179, 90, 255))],
    "yellow": [((16, 110, 130), (36, 255, 255))],
    "red": [((0, 90, 45), (12, 255, 255)), ((165, 90, 45), (179, 255, 255))],
}
# 화면에 표시할 색 (BGR). 공과 구분되도록 흰공은 검은 테두리를 함께 그린다.
DRAW_COLORS = {"white": (255, 255, 255), "yellow": (0, 220, 255), "red": (40, 40, 230)}


@dataclass
class Ball:
    """찾은 공 하나. x, y는 안쪽 면 기준 0~1 좌표, px, py는 펼친 이미지 좌표이다."""

    name: str
    x: float
    y: float
    px: float
    py: float
    radius: float
    score: float


def _color_mask(hsv: np.ndarray, ranges: list) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], np.uint8)
    for low, high in ranges:
        mask |= cv2.inRange(hsv, low, high)
    # 공에 찍힌 점 때문에 생긴 구멍을 메우고 작은 잡음을 없앤다.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def _score_contour(contour: np.ndarray) -> tuple[float, float, float, float] | None:
    """공처럼 보이는 윤곽이면 (중심 x, 중심 y, 반지름, 점수)를 돌려준다. 아니면 None."""
    area = cv2.contourArea(contour)
    # 멈춘 공은 원형이지만, 빠르게 움직이는 공은 길게 번져 면적이 커질 수 있다.
    if not 0.3 * BALL_AREA <= area <= 5.0 * BALL_AREA:
        return None
    perimeter = cv2.arcLength(contour, True)
    if perimeter == 0:
        return None
    (cx, cy), radius = cv2.minEnclosingCircle(contour)
    # 안쪽 면에서 공 중심이 있을 수 없는 위치(쿠션 위)는 제외한다.
    slack = BALL_RADIUS * 0.4
    if not (MARGIN - slack <= cx <= MARGIN + TABLE_W + slack and MARGIN - slack <= cy <= MARGIN + TABLE_H + slack):
        return None

    roundness = 4 * math.pi * area / perimeter**2
    fill = area / (math.pi * radius**2)
    if roundness >= 0.6 and fill >= 0.6 and area <= 1.9 * BALL_AREA:
        return cx, cy, radius, roundness * fill

    # 번진 공: 폭은 공과 비슷하고 길이만 긴 모양. 큐처럼 가는 물체는 폭에서 걸러진다.
    # 둥근 후보가 있으면 항상 그쪽이 선택되도록 점수를 낮게 준다.
    (rx, ry), (w, h), _ = cv2.minAreaRect(contour)
    short, long = sorted((w, h))
    if BALL_RADIUS * 1.3 <= short <= BALL_RADIUS * 2.6 and long <= BALL_RADIUS * 8 and area / (w * h) >= 0.65:
        return rx, ry, short / 2, 0.1
    return None


def _find_attached_ball(mask: np.ndarray) -> tuple[float, float, float, float] | None:
    """큐처럼 같은 색 물체에 붙어 윤곽이 합쳐진 공을 찾는다.

    합쳐진 덩어리 안에서 공 크기만큼 두꺼운 지점을 찾고, 그 주변이 대부분 비어 있는지 확인한다.
    옷처럼 넓은 영역은 주변도 같은 색이므로 걸러진다.
    """
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    size = BALL_RADIUS * 2 + 1
    peaks = (distance == cv2.dilate(distance, np.ones((size, size), np.uint8))) & (distance >= BALL_RADIUS * 0.75) & (distance <= BALL_RADIUS * 1.25)
    height, width = mask.shape
    yy, xx = np.ogrid[:height, :width]
    best = None
    for py, px in np.argwhere(peaks)[:20]:
        if not (MARGIN <= px <= MARGIN + TABLE_W and MARGIN <= py <= MARGIN + TABLE_H):
            continue
        squared = (xx - px) ** 2 + (yy - py) ** 2
        ring = (squared >= (BALL_RADIUS * 1.3) ** 2) & (squared <= (BALL_RADIUS * 1.7) ** 2)
        ring_filled = np.count_nonzero(mask[ring]) / max(np.count_nonzero(ring), 1)
        if ring_filled <= 0.3 and (best is None or ring_filled < best[0]):
            best = (ring_filled, float(px), float(py), float(distance[py, px]))
    if best is None:
        return None
    return best[1], best[2], best[3], 0.05


def detect_balls(table: np.ndarray) -> dict[str, Ball]:
    """펼친 당구대 이미지에서 공을 찾는다. 찾지 못한 공은 결과에 포함되지 않는다."""
    hsv = cv2.cvtColor(table, cv2.COLOR_BGR2HSV)
    found: dict[str, Ball] = {}
    for name, ranges in COLOR_RANGES.items():
        mask = _color_mask(hsv, ranges)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        scored = [s for s in map(_score_contour, contours) if s is not None]
        # 독립된 공 모양이 없을 때만 다른 물체에 붙은 공을 찾는다.
        attached = _find_attached_ball(mask) if not scored else None
        if attached is not None:
            scored = [attached]
        if not scored:
            continue
        cx, cy, radius, score = max(scored, key=lambda s: s[3])
        found[name] = Ball(
            name=name,
            x=float(np.clip((cx - MARGIN) / TABLE_W, 0, 1)),
            y=float(np.clip((cy - MARGIN) / TABLE_H, 0, 1)),
            px=float(cx),
            py=float(cy),
            radius=float(radius),
            score=float(score),
        )
    return found


def draw_balls(table: np.ndarray, balls: dict[str, Ball]) -> np.ndarray:
    """찾은 공에 색깔 원과 이름을 그린 이미지를 돌려준다."""
    image = table.copy()
    for ball in balls.values():
        center = (round(ball.px), round(ball.py))
        radius = round(ball.radius) + 8
        cv2.circle(image, center, radius + 2, (0, 0, 0), 2, cv2.LINE_AA)
        cv2.circle(image, center, radius, DRAW_COLORS[ball.name], 3, cv2.LINE_AA)
        cv2.putText(image, ball.name, (center[0] + radius + 6, center[1] + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.putText(image, ball.name, (center[0] + radius + 6, center[1] + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.7, DRAW_COLORS[ball.name], 2, cv2.LINE_AA)
    return image


def _read_frame(video: cv2.VideoCapture, frame_no: int) -> np.ndarray | None:
    video.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
    ok, frame = video.read()
    return frame if ok else None


def main() -> None:
    parser = argparse.ArgumentParser(description="영상 표본 장면에서 공 3개를 찾아 표시합니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--samples", type=int, default=60, help="검사할 장면 수")
    parser.add_argument("--out", type=Path, default=Path("data/results/detect"))
    args = parser.parse_args()

    video = cv2.VideoCapture(str(args.video))
    if not video.isOpened():
        raise SystemExit(f"영상을 열 수 없습니다: {args.video}")
    total = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = video.get(cv2.CAP_PROP_FPS)

    picks = [read for read in (_read_frame(video, total * (i + 1) // 11) for i in range(10)) if read is not None]
    corners = find_corners(picks)
    transform = table_transform(corners)
    print("모서리(좌상, 우상, 우하, 좌하):", np.round(corners, 1).tolist())

    out_dir = args.out / args.video.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {"white": 0, "yellow": 0, "red": 0}
    all_three = 0
    read_count = 0
    for i in range(args.samples):
        frame_no = total * (i + 1) // (args.samples + 1)
        frame = _read_frame(video, frame_no)
        if frame is None:
            continue
        read_count += 1
        table = warp_table(frame, transform)
        balls = detect_balls(table)
        for name in balls:
            counts[name] += 1
        complete = len(balls) == 3
        all_three += complete
        label = "ok" if complete else "miss"
        cv2.imwrite(str(out_dir / f"{i:03d}_{frame_no / fps:07.1f}s_{label}.jpg"), draw_balls(table, balls), [cv2.IMWRITE_JPEG_QUALITY, 80])
    video.release()

    if read_count == 0:
        raise SystemExit("읽을 수 있는 장면이 없습니다.")
    print(f"장면 {read_count}개 중 공 3개 모두 찾음: {all_three}개 ({all_three / read_count:.0%})")
    for name, count in counts.items():
        print(f"  {name}: {count}개 ({count / read_count:.0%})")
    print(f"표시 이미지: {out_dir}")


if __name__ == "__main__":
    main()
