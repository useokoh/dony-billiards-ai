"""4-② 샷별 영상: 샷 시작 1초 전부터 공이 모두 멈춘 1초 뒤까지 잘라 저장하고 JSON에 위치를 기록한다.

analyzer.shots 를 먼저 실행한 뒤 사용한다:
    .venv/bin/python -m analyzer.clips data/videos/영상파일.MP4

결과: data/results/clips/영상이름/이닝003_선공_샷02_045.mp4
"""
import argparse
import json
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

LEAD_SECONDS = 1.0  # 샷 시작 전에 포함할 시간
TAIL_SECONDS = 1.0  # 공이 모두 멈춘 뒤 포함할 시간
MAX_CLIP_SECONDS = 30.0  # 판정 오류로 구간이 지나치게 길어져도 이 길이를 넘기지 않는다


def clip_range(start_sec: float, end_sec: float, video_duration: float | None = None) -> tuple[float, float]:
    """잘라 낼 (시작 시간, 길이)를 계산한다. 영상 앞뒤를 벗어나지 않게 맞춘다.

    end_sec는 공이 모두 멈춘 시간이다 (샷 JSON의 rest_sec).
    """
    begin = max(0.0, start_sec - LEAD_SECONDS)
    length = min(end_sec + TAIL_SECONDS - begin, MAX_CLIP_SECONDS)
    if video_duration is not None:
        length = min(length, max(0.0, video_duration - begin))
    return round(begin, 3), round(length, 3)


def clip_name(shot: dict) -> str:
    player = "선공" if shot["player"] == "first" else "후공"
    return f"이닝{shot['inning_no']:03d}_{player}_샷{shot['shot_no_in_turn']:02d}_{shot['shot_no']:03d}.mp4"


def video_duration(path: Path) -> float:
    output = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(output.stdout.strip())


def cut_clip(video: Path, target: Path, begin: float, length: float) -> None:
    """재인코딩으로 잘라 시작점을 정확히 맞춘다. 웹에서 바로 재생되도록 설정하고 소리는 뺀다."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", str(begin), "-i", str(video), "-t", str(length),
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
         "-an", "-movflags", "+faststart", "-threads", "2", str(target)],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="샷별 영상을 만듭니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--shots", type=Path, default=Path("data/results/shots"))
    parser.add_argument("--out", type=Path, default=Path("data/results/clips"))
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) // 2))
    args = parser.parse_args()

    if not shutil.which("ffmpeg"):
        raise SystemExit("FFmpeg를 찾을 수 없습니다.")
    source = args.shots / f"{args.video.stem}.json"
    if not source.exists():
        raise SystemExit(f"샷 파일이 없습니다. 먼저 analyzer.shots 를 실행해 주세요: {source}")
    data = json.loads(source.read_text(encoding="utf-8"))
    shots = data["shots"]
    duration = video_duration(args.video)

    out_dir = args.out / args.video.stem
    if out_dir.exists():
        shutil.rmtree(out_dir)  # 샷 번호가 바뀌면 이전 영상이 남지 않도록 비운다.
    out_dir.mkdir(parents=True)

    def work(shot: dict) -> None:
        begin, length = clip_range(shot["start_sec"], shot["rest_sec"], duration)
        target = out_dir / clip_name(shot)
        cut_clip(args.video, target, begin, length)
        shot["clip"] = {"path": str(target), "start_sec": begin, "length_sec": length}

    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(work, shots))

    source.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"영상 {len(shots)}개 저장: {out_dir}")


if __name__ == "__main__":
    main()
