"""샷별 궤적 내보내기: track.npz에서 샷 구간(시작~공이 모두 멈춤)의 공 3개 좌표를 잘라 JSON으로 저장한다.

화면에서 실제 경로를 그리고, 추천 경로 계산에 샷 시작 배치를 쓰기 위한 것이다.
analyzer.shots 를 먼저 실행한 뒤 사용한다:
    .venv/bin/python -m analyzer.trajectory data/videos/영상파일.MP4

결과: data/results/trajectories/영상이름.json
좌표는 당구대 안쪽 기준 0~1 (x: 장쿠션 방향, y: 단쿠션 방향). 화면에는 2:1 비율로 그린다.
"""
import argparse
import json
from pathlib import Path

import numpy as np

STEP = 2  # 몇 프레임마다 저장할지 (30fps → 15점/초, 그림에는 충분)
DIGITS = 4  # 좌표 소수 자리 (0.0001 ≈ 0.15px)


def rest_frame(times: np.ndarray, shot: dict) -> int:
    """공이 모두 멈춘 프레임. rest_sec가 없으면 샷 끝 프레임."""
    if shot.get("rest_sec") is None:
        return int(shot["end_frame"])
    return max(int(shot["end_frame"]), int(np.searchsorted(times, shot["rest_sec"])))


def shot_trajectory(times: np.ndarray, positions: np.ndarray, estimated: np.ndarray, balls: list[str], shot: dict, step: int = STEP) -> dict:
    """샷 하나의 공별 좌표 배열. 마지막 프레임(멈춘 위치)은 step과 상관없이 넣는다."""
    begin = int(shot["start_frame"])
    end = min(rest_frame(times, shot), len(positions) - 1)
    frames = list(range(begin, end + 1, step))
    if frames[-1] != end:
        frames.append(end)
    out = {}
    for b, name in enumerate(balls):
        pts = np.round(positions[frames, b], DIGITS)
        out[name] = {
            "points": pts.tolist(),
            "estimated": [int(v) for v in estimated[frames, b]],
        }
    return {"shot_no": shot["shot_no"], "start_frame": begin, "step": step, "last_frame": end, "balls": out}


def export(track_file: Path, shots_file: Path, step: int = STEP) -> dict:
    data = json.loads(shots_file.read_text(encoding="utf-8"))
    with np.load(track_file) as t:
        times, positions, estimated = t["times"], t["positions"], t["estimated"]
        balls = [str(b) for b in t["balls"]]
    return {
        "video": data["video"],
        "step": step,
        "shots": [shot_trajectory(times, positions, estimated, balls, s, step) for s in data["shots"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="샷별 궤적을 JSON으로 저장합니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--tracks", type=Path, default=Path("data/results/tracks"))
    parser.add_argument("--shots", type=Path, default=Path("data/results/shots"))
    parser.add_argument("--out", type=Path, default=Path("data/results/trajectories"))
    args = parser.parse_args()

    stem = args.video.stem
    track, shots = args.tracks / stem / "track.npz", args.shots / f"{stem}.json"
    for f, step in ((track, "analyzer.track"), (shots, "analyzer.shots")):
        if not f.exists():
            raise SystemExit(f"{f} 이 없습니다. 먼저 {step} 를 실행해 주세요.")
    result = export(track, shots)
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / f"{stem}.json"
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    points = sum(len(s["balls"][b]["points"]) for s in result["shots"] for b in s["balls"])
    print(f"샷 {len(result['shots'])}개, 좌표 {points}개, {target.stat().st_size / 1e6:.1f}MB → {target}")


if __name__ == "__main__":
    main()
