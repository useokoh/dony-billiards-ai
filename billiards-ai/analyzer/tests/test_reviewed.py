"""실제 영상 회귀 테스트: 사용자가 확인한 샷과 판정을 비교한다. 분석 결과가 없으면 건너뛴다."""
import json
from pathlib import Path

import numpy as np
import pytest

from analyzer.shots import analyze_track

REVIEWED = json.loads((Path(__file__).parent / "data" / "reviewed_shots.json").read_text(encoding="utf-8"))["shots"]
# 궤적만으로 판정할 수 없다고 확인된 샷 (Docs/worklog/ball-detection.md)
KNOWN_LIMITS = {"영상2-샷62", "영상2-샷65"}


def judged(video: str):
    track = Path("data/results/tracks") / video / "track.npz"
    if not track.exists():
        pytest.skip("분석 결과 없음")
    with np.load(track) as data:
        return analyze_track(data["times"], data["positions"], data["moves"], data["estimated"])[0]


@pytest.mark.parametrize("item", [r for r in REVIEWED if r["label"] not in KNOWN_LIMITS], ids=lambda r: r["label"])
def test_reviewed_shot(item):
    shots = judged(item["video"])
    shot = min(shots, key=lambda s: abs(s["start_sec"] - item["start_sec"]))
    assert abs(shot["start_sec"] - item["start_sec"]) < 2
    assert shot["score_candidate"] == item["score"], item.get("note", "")
