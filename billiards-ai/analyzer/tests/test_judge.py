"""⑨ 득점 자동 확정 테스트: 물리 판정 + 차례 신호."""
import json
from pathlib import Path

import pytest

from analyzer.judge import fail_reason, judge_shot, judge_shots, summary


def shot(cue="white", candidate=False, hits=(), before=None):
    return {"cue_ball": cue, "score_candidate": candidate, "hit_order": list(hits), "cushions_before_second_hit": before}


SCORE = dict(candidate=True, hits=("red", "yellow"), before=3)


def test_agree_score():
    r = judge_shot(shot(**SCORE), shot("white"))
    assert r == {"result": "success", "fail_reason": None, "score_basis": "agree", "score_confidence": 0.95}


def test_agree_miss_with_reason():
    r = judge_shot(shot(hits=("red",)), shot("yellow"))
    assert (r["result"], r["fail_reason"], r["score_basis"]) == ("fail", "no_second_hit", "agree")


def test_turn_overrides_physics_when_player_continues():
    # 물리 판정은 놓쳤지만 같은 선수가 이어 침 → 득점 (실제 영상2-샷62, 65 사례)
    r = judge_shot(shot(hits=("yellow",)), shot("white"))
    assert (r["result"], r["fail_reason"], r["score_basis"]) == ("success", None, "turn")
    assert r["score_confidence"] < 0.95


def test_turn_overrides_physics_when_turn_changes():
    # 물리 판정은 득점 조건을 채웠지만 차례가 바뀜 → 실패, 원인 미상
    r = judge_shot(shot(**SCORE), shot("yellow"))
    assert (r["result"], r["fail_reason"], r["score_basis"]) == ("fail", None, "turn")


def test_last_shot_uses_physics_only():
    assert judge_shot(shot(**SCORE), None)["score_basis"] == "physics"
    assert judge_shot(shot(), None)["result"] == "fail"


@pytest.mark.parametrize(
    ("hits", "before", "reason"),
    [((), None, "no_first_hit"), (("red",), None, "no_second_hit"), (("red", "yellow"), 2, "not_enough_cushions"), (("red", "yellow"), 3, None)],
)
def test_fail_reason(hits, before, reason):
    assert fail_reason(shot(hits=hits, before=before)) == reason


def test_judge_shots_keeps_fields_and_counts():
    shots = [shot("white", **SCORE), shot("white"), shot("yellow")]
    shots[0]["shot_no"] = 1
    judged = judge_shots(shots)
    assert judged[0]["shot_no"] == 1
    assert [s["result"] for s in judged] == ["success", "fail", "fail"]
    assert summary(judged)["result:fail"] == 2
    assert judge_shots([]) == []


# ── 실제 영상 회귀: 사람이 확인한 15건 전부와 일치해야 한다 (분석 결과가 없으면 건너뜀) ──
REVIEWED = json.loads((Path(__file__).parent / "data" / "reviewed_shots.json").read_text(encoding="utf-8"))["shots"]


@pytest.mark.parametrize("item", REVIEWED, ids=lambda r: r["label"])
def test_reviewed_shot_result(item):
    source = Path("data/results/shots") / f"{item['video']}.json"
    if not source.exists():
        pytest.skip("분석 결과 없음")
    shots = judge_shots(json.loads(source.read_text(encoding="utf-8"))["shots"])
    s = min(shots, key=lambda s: abs(s["start_sec"] - item["start_sec"]))
    assert abs(s["start_sec"] - item["start_sec"]) < 2
    assert (s["result"] == "success") == item["score"], item.get("note", "")
