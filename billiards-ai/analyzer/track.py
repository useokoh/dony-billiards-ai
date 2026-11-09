"""2단계 궤적 추적: 영상 전체에서 공 3개의 위치를 기록하고 이동 경로를 그림으로 저장한다.

실행:
    .venv/bin/python -m analyzer.track data/videos/영상파일.MP4

결과 (data/results/tracks/영상이름/):
    track.npz        프레임별 시간, 공 좌표(0~1), 추정 여부, 보정 전 좌표
    all_paths.jpg    영상 전체 경로
    moves/*.jpg      공이 움직인 구간별 경로
"""
import argparse
import multiprocessing as mp
import os
import time
from pathlib import Path

import cv2
import numpy as np

from analyzer.calibrate import MARGIN, TABLE_H, TABLE_W, find_corners, table_transform, warp_table
from analyzer.detect import DRAW_COLORS, detect_balls

BALLS = ("white", "yellow", "red")
CHUNK_FRAMES = 3000  # 작업 프로세스 하나가 한 번에 처리할 프레임 수
# 공이 한 프레임에 움직일 수 있는 최대 거리 (안쪽 면 너비 대비). 초속 약 10m, 30fps 기준
MAX_STEP = 0.12
# 움직임으로 볼 프레임당 거리 (안쪽 면 너비 대비). 측정 잡음보다 충분히 크게 둔다.
MIN_TRUSTED_RUN = 30  # 이 프레임 수 이상 이어지면 앞뒤와 끊겨도 실제 위치로 믿는다
MOVING_STEP = 0.0012
MOVE_END_GAP = 20  # 이만큼 멈춰 있어야 움직임이 끝났다고 본다 (프레임)
MIN_MOVE_FRAMES = 8  # 이보다 짧은 움직임은 잡음으로 본다 (프레임)
MIN_MOVE_DISTANCE = 0.01  # 이보다 적게 움직인 구간은 잡음으로 본다 (안쪽 면 너비 대비)


def _read_chunk(job: tuple) -> tuple[int, np.ndarray, np.ndarray]:
    """영상의 한 구간을 읽어 프레임별 시간과 공 좌표를 돌려준다. 못 찾은 공은 NaN이다."""
    path, start, count, transform = job
    cv2.setNumThreads(1)  # 작업 프로세스끼리 CPU를 두고 경쟁하지 않게 한다.
    video = cv2.VideoCapture(path)
    video.set(cv2.CAP_PROP_POS_FRAMES, start)
    times = np.full(count, np.nan)
    positions = np.full((count, len(BALLS), 2), np.nan)
    for i in range(count):
        ok, frame = video.read()
        if not ok:
            break
        times[i] = video.get(cv2.CAP_PROP_POS_MSEC) / 1000
        balls = detect_balls(warp_table(frame, transform))
        for b, name in enumerate(BALLS):
            if name in balls:
                positions[i, b] = (balls[name].x, balls[name].y)
    video.release()
    return start, times, positions


def _reject_jumps(points: np.ndarray) -> np.ndarray:
    """앞뒤 위치와 맞지 않게 튄 값을 지운다.

    위치가 이어지는 프레임끼리 묶은 뒤, 길게 이어지는 묶음은 믿고, 짧은 묶음은 믿을 수 있는
    앞 위치와 이어질 때만 남긴다. 공이 가려진 사이 옮겨진 경우는 긴 묶음이 되어 유지된다.
    """
    result = points.copy()
    aspect = np.array([1.0, TABLE_H / TABLE_W])
    valid = np.where(~np.isnan(result[:, 0]))[0]
    if valid.size == 0:
        return result

    def connected(a: int, b: int) -> bool:
        return np.linalg.norm((result[a] - result[b]) * aspect) <= MAX_STEP * abs(b - a)

    runs = [[valid[0]]]
    for index in valid[1:]:
        if connected(runs[-1][-1], index):
            runs[-1].append(index)
        else:
            runs.append([index])

    # 기준이 될 첫 묶음: 충분히 긴 첫 묶음, 없으면 가장 긴 묶음
    long_runs = [i for i, run in enumerate(runs) if len(run) >= MIN_TRUSTED_RUN]
    anchor = long_runs[0] if long_runs else max(range(len(runs)), key=lambda i: len(runs[i]))

    # 기준보다 앞쪽 묶음은 뒤 위치와, 뒤쪽 묶음은 앞 위치와 이어질 때만 남긴다.
    first_kept = runs[anchor][0]
    for run in reversed(runs[:anchor]):
        if connected(run[-1], first_kept):
            first_kept = run[0]
        else:
            result[run] = np.nan
    last_kept = runs[anchor][-1]
    for run in runs[anchor + 1 :]:
        if len(run) >= MIN_TRUSTED_RUN or connected(last_kept, run[0]):
            last_kept = run[-1]
        else:
            result[run] = np.nan
    return result


def fill_gaps(points: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """못 찾은 프레임을 앞뒤 위치로 채운다. (채운 좌표, 추정 여부)를 돌려준다."""
    cleaned = _reject_jumps(points)
    estimated = np.isnan(cleaned[:, 0])
    frames = np.arange(len(cleaned))
    known = ~estimated
    filled = cleaned.copy()
    if known.any():
        for axis in range(2):
            filled[:, axis] = np.interp(frames, frames[known], cleaned[known, axis])
    return filled, estimated


def find_moves(positions: np.ndarray) -> list[tuple[int, int]]:
    """공이 하나라도 움직인 구간의 (시작 프레임, 끝 프레임) 목록을 찾는다."""
    aspect = np.array([1.0, TABLE_H / TABLE_W])
    # 측정 잡음을 줄이기 위해 3프레임 간격 이동량을 쓴다.
    steps = np.linalg.norm((positions[3:] - positions[:-3]) * aspect, axis=2) / 3
    moving = (steps > MOVING_STEP).any(axis=1)
    moves = []
    start = None
    still = 0
    for i, is_moving in enumerate(moving):
        if is_moving:
            if start is None:
                start = i
            still = 0
        elif start is not None:
            still += 1
            if still >= MOVE_END_GAP:
                moves.append((start, i - still + 3))
                start = None
    if start is not None:
        moves.append((start, len(moving) + 2))

    kept = []
    for begin, end in moves:
        travelled = np.linalg.norm(np.diff(positions[begin : end + 1], axis=0) * aspect, axis=2).sum(axis=0).max()
        if end - begin >= MIN_MOVE_FRAMES and travelled >= MIN_MOVE_DISTANCE:
            kept.append((begin, end))
    return kept


def _to_px(point: np.ndarray) -> tuple[int, int]:
    return round(MARGIN + point[0] * TABLE_W), round(MARGIN + point[1] * TABLE_H)


def draw_paths(background: np.ndarray, positions: np.ndarray, thickness: int = 2) -> np.ndarray:
    """공별 색으로 이동 경로를 그린다. 끝 위치에는 원을 표시한다."""
    image = background.copy()
    for b, name in enumerate(BALLS):
        pts = np.array([_to_px(p) for p in positions[:, b]], np.int32)
        cv2.polylines(image, [pts.reshape(-1, 1, 2)], False, (0, 0, 0), thickness + 2, cv2.LINE_AA)
        cv2.polylines(image, [pts.reshape(-1, 1, 2)], False, DRAW_COLORS[name], thickness, cv2.LINE_AA)
        cv2.circle(image, tuple(int(v) for v in pts[-1]), 20, (0, 0, 0), 4, cv2.LINE_AA)
        cv2.circle(image, tuple(int(v) for v in pts[-1]), 20, DRAW_COLORS[name], 2, cv2.LINE_AA)
    return image


def _read_table_at(path: str, frame_no: int, transform: np.ndarray) -> np.ndarray:
    video = cv2.VideoCapture(path)
    video.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
    ok, frame = video.read()
    video.release()
    if not ok:
        raise SystemExit(f"프레임을 읽을 수 없습니다: {frame_no}")
    return warp_table(frame, transform)


def main() -> None:
    parser = argparse.ArgumentParser(description="영상 전체의 공 궤적을 기록합니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--out", type=Path, default=Path("data/results/tracks"))
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    parser.add_argument("--reuse", action="store_true", help="저장된 좌표로 후처리만 다시 실행")
    args = parser.parse_args()
    path = str(args.video)

    video = cv2.VideoCapture(path)
    if not video.isOpened():
        raise SystemExit(f"영상을 열 수 없습니다: {path}")
    total = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    picks = []
    for i in range(10):
        video.set(cv2.CAP_PROP_POS_FRAMES, total * (i + 1) // 11)
        ok, frame = video.read()
        if ok:
            picks.append(frame)
    video.release()
    transform = table_transform(find_corners(picks))

    out_dir = args.out / args.video.stem
    saved = out_dir / "track.npz"
    began = time.time()
    if args.reuse and saved.exists():
        # 공 찾기를 다시 하지 않고 저장된 좌표로 후처리만 다시 한다.
        with np.load(saved) as data:
            times, raw = data["times"], data["raw"]
    else:
        jobs = [(path, start, min(CHUNK_FRAMES, total - start), transform) for start in range(0, total, CHUNK_FRAMES)]
        times = np.full(total, np.nan)
        raw = np.full((total, len(BALLS), 2), np.nan)
        with mp.get_context("spawn").Pool(args.workers) as pool:
            for done, (start, chunk_times, chunk_positions) in enumerate(pool.imap_unordered(_read_chunk, jobs), 1):
                times[start : start + len(chunk_times)] = chunk_times
                raw[start : start + len(chunk_positions)] = chunk_positions
                print(f"진행 {done / len(jobs):.0%} ({time.time() - began:.0f}초)", flush=True)

    read = ~np.isnan(times)
    if not read.all():
        print(f"경고: 읽지 못한 프레임 {np.count_nonzero(~read)}개")
    positions = np.zeros_like(raw)
    estimated = np.zeros(raw.shape[:2], bool)
    for b in range(len(BALLS)):
        positions[:, b], estimated[:, b] = fill_gaps(raw[:, b])

    moves_dir = out_dir / "moves"
    moves_dir.mkdir(parents=True, exist_ok=True)
    for old in moves_dir.glob("*.jpg"):
        old.unlink()
    moves = find_moves(positions)
    np.savez_compressed(out_dir / "track.npz", times=times, positions=positions, estimated=estimated, raw=raw, balls=np.array(BALLS), moves=np.array(moves))

    middle = _read_table_at(path, total // 2, transform)
    cv2.imwrite(str(out_dir / "all_paths.jpg"), draw_paths(middle, positions, thickness=1))
    # 검토용으로 구간을 고르게 골라 그림을 저장한다.
    for index in np.linspace(0, len(moves) - 1, min(24, len(moves)), dtype=int) if moves else []:
        begin, end = moves[index]
        table = _read_table_at(path, begin, transform)
        name = f"{index:04d}_{times[begin]:07.1f}s_{times[end] - times[begin]:04.1f}s.jpg"
        cv2.imwrite(str(moves_dir / name), draw_paths(table, positions[begin : end + 1]), [cv2.IMWRITE_JPEG_QUALITY, 85])

    seconds = time.time() - began
    print(f"프레임 {total}개, 처리 시간 {seconds / 60:.1f}분 (재생 시간 {np.nanmax(times) / 60:.1f}분)")
    for b, name in enumerate(BALLS):
        print(f"  {name}: 직접 찾음 {1 - estimated[:, b].mean():.1%}, 최장 공백 {_longest_gap(estimated[:, b])}프레임")
    print(f"움직임 구간 {len(moves)}개")
    print(f"결과: {out_dir}")


def _longest_gap(flags: np.ndarray) -> int:
    longest = current = 0
    for flag in flags:
        current = current + 1 if flag else 0
        longest = max(longest, current)
    return longest


if __name__ == "__main__":
    main()
