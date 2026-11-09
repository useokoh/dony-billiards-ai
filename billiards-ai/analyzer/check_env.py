"""분석 환경 점검: 영상을 읽고 FFmpeg를 실행할 수 있는지 확인한다.

실행: .venv/bin/python -m analyzer.check_env data/videos/영상파일.MP4
"""
import shutil
import subprocess
import sys
from pathlib import Path

import cv2


def check_video(path: Path, out_dir: Path) -> None:
    """영상 정보를 출력하고 가운데 장면 1장을 저장한다."""
    video = cv2.VideoCapture(str(path))
    if not video.isOpened():
        raise SystemExit(f"영상을 열 수 없습니다: {path}")
    fps = video.get(cv2.CAP_PROP_FPS)
    frames = int(video.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"{path.name}: {width}x{height}, {fps:.2f}fps, {frames / fps / 60:.1f}분")
    video.set(cv2.CAP_PROP_POS_FRAMES, frames // 2)
    ok, frame = video.read()
    video.release()
    if not ok:
        raise SystemExit(f"프레임을 읽을 수 없습니다: {path}")
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"{path.stem}_middle.jpg"
    cv2.imwrite(str(target), frame)
    print(f"장면 저장: {target}")


def main() -> None:
    print(f"OpenCV {cv2.__version__}")
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("FFmpeg를 찾을 수 없습니다.")
    version = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True, check=True)
    print(version.stdout.splitlines()[0])
    for arg in sys.argv[1:]:
        check_video(Path(arg), Path("data/results/check"))


if __name__ == "__main__":
    main()
