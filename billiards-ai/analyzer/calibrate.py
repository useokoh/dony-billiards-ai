"""1-① 당구대 펴기: 비스듬한 화면을 위에서 본 직사각형으로 변환한다."""
from collections.abc import Iterable

import cv2
import numpy as np

# 펼친 당구대 크기(px). 공이 움직이는 안쪽 면 기준이며 실제 비율 2:1을 따른다.
TABLE_W = 1480
TABLE_H = 740
# 쿠션에 붙은 공이 잘리지 않도록 안쪽 면 바깥으로 남기는 여백(px)
MARGIN = 24

# 파란 천의 HSV 범위 (소스 영상 측정값: H 105, S 207, V 200 내외)
FELT_LOW = (95, 120, 80)
FELT_HIGH = (125, 255, 255)
# 안쪽 면 경계선(쿠션과 천 사이의 어두운 선)을 찾을 구간: 천 가장자리에서 안쪽으로 몇 px
SEAM_SEARCH = (12, 48)


def felt_mask(frame: np.ndarray) -> np.ndarray:
    """천으로 보이는 픽셀만 255인 마스크를 만든다."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, FELT_LOW, FELT_HIGH)


def _seam_points(frame: np.ndarray, side: str) -> np.ndarray:
    """한 변을 따라 안쪽 경계선 위의 점들을 찾는다. 팔이 가린 곳은 나중에 직선 맞춤에서 걸러진다."""
    mask = felt_mask(frame)
    value = cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[:, :, 2], (3, 3), 0)
    horizontal = side in ("left", "right")  # 왼쪽·오른쪽 변은 행을 따라 찾는다
    if horizontal:
        mask, value = mask.T, value.T  # 위쪽·아래쪽 변과 같은 코드로 처리
    from_end = side in ("right", "bottom")
    if from_end:
        mask, value = mask[::-1], value[::-1]

    has_felt = mask > 0
    # 대부분의 줄에 천이 있는 칸 범위만 사용한다. 팔이 있어도 줄 전체에는 영향이 적다.
    lines = np.where(has_felt.mean(axis=0) > 0.5)[0]
    points = []
    for line in lines[40:-40:12]:
        felt_at = np.where(has_felt[:, line])[0]
        if len(felt_at) == 0:
            continue
        start = felt_at[0] + SEAM_SEARCH[0]
        window = value[start : felt_at[0] + SEAM_SEARCH[1], line]
        if len(window) == 0:
            continue
        depth = start + int(np.argmin(window))
        if from_end:
            depth = mask.shape[0] - 1 - depth
        points.append((depth, line) if horizontal else (line, depth))
    return np.array(points, dtype=np.float32)


def _fit_line(points: np.ndarray) -> np.ndarray:
    """튀는 점의 영향을 줄여 직선을 맞추고 ax + by + c = 0 형태로 돌려준다."""
    vx, vy, x0, y0 = cv2.fitLine(points, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    return np.array([vy, -vx, vx * y0 - vy * x0])


def _intersect(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    point = np.cross(a, b)
    return point[:2] / point[2]


def find_corners(frames: Iterable[np.ndarray]) -> np.ndarray:
    """여러 장면에서 안쪽 면의 네 모서리를 찾아 중앙값을 돌려준다 (좌상, 우상, 우하, 좌하).

    카메라가 고정되어 있다는 가정을 쓰며, 사람이 가린 장면의 영향을 중앙값으로 줄인다.
    """
    results = []
    for frame in frames:
        lines = {side: _fit_line(_seam_points(frame, side)) for side in ("top", "right", "bottom", "left")}
        results.append([
            _intersect(lines["top"], lines["left"]),
            _intersect(lines["top"], lines["right"]),
            _intersect(lines["bottom"], lines["right"]),
            _intersect(lines["bottom"], lines["left"]),
        ])
    if not results:
        raise ValueError("모서리를 찾을 장면이 없습니다.")
    return np.median(np.array(results, dtype=np.float32), axis=0)


def table_transform(corners: np.ndarray) -> np.ndarray:
    """네 모서리를 펼친 당구대 좌표로 옮기는 투시 변환 행렬을 만든다."""
    target = np.array(
        [
            [MARGIN, MARGIN],
            [MARGIN + TABLE_W, MARGIN],
            [MARGIN + TABLE_W, MARGIN + TABLE_H],
            [MARGIN, MARGIN + TABLE_H],
        ],
        dtype=np.float32,
    )
    return cv2.getPerspectiveTransform(np.asarray(corners, dtype=np.float32), target)


def warp_table(frame: np.ndarray, transform: np.ndarray) -> np.ndarray:
    """장면을 위에서 본 당구대 이미지로 편다."""
    size = (TABLE_W + MARGIN * 2, TABLE_H + MARGIN * 2)
    return cv2.warpPerspective(frame, transform, size)
