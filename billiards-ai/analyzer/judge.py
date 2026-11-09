"""⑨ 득점 자동 확정: 샷마다 result(success/fail), 실패 원인, 판정 근거와 신뢰도를 정한다.

두 가지 증거를 합친다.
1. 물리 판정(score_candidate): 쿠션 횟수와 공 맞힘 순서를 3쿠션 규칙에 대입한 값
2. 차례 신호: 3쿠션은 득점하면 같은 선수가 이어 치고, 못 하면 수구가 바뀐다.
   다음 샷의 수구가 같으면 득점, 바뀌면 실패로 본다.

차례 신호는 공끼리 닿았는지를 영상으로 판정하는 것보다 틀릴 일이 적다
(사람 확인 15건 중 물리 판정 13건, 차례 신호 15건 일치. Docs/worklog/ball-detection.md).
그래서 둘이 다르면 차례 신호를 따르고 신뢰도를 낮춘다. 다음 샷이 없는 영상의 마지막 샷은
물리 판정만 쓴다. 사람이 웹에서 인정/불인정하면 그 값이 이 판정보다 앞선다(API 쪽).

analyzer.shots 결과에 덧붙여 쓴다 (analyzer.shots가 자동으로 호출하며, 따로 다시 실행할 수도 있다):
    .venv/bin/python -m analyzer.judge data/videos/영상파일.MP4
"""
import argparse
import json
from pathlib import Path

SCORE_CUSHIONS = 3  # 두 번째 목적구 전에 필요한 쿠션 수

# 판정 근거별 신뢰도 (0~1). 사람 확인 결과가 쌓이면 다시 맞춘다.
CONFIDENCE = {
    "agree": 0.95,  # 물리 판정과 차례 신호가 같음
    "turn": 0.75,  # 둘이 달라 차례 신호를 따름
    "physics": 0.6,  # 다음 샷이 없어 물리 판정만 씀
}


def fail_reason(shot: dict) -> str | None:
    """물리 판정 값에서 실패 원인을 찾는다. 물리 판정상 득점 조건을 채웠으면 None(원인 미상)."""
    hits = shot.get("hit_order") or []
    if len(hits) == 0:
        return "no_first_hit"
    if len(hits) == 1:
        return "no_second_hit"
    before = shot.get("cushions_before_second_hit")
    if before is None or before < SCORE_CUSHIONS:
        return "not_enough_cushions"
    return None


def judge_shot(shot: dict, following: dict | None) -> dict:
    """샷 하나의 득점 여부를 확정한다. following은 같은 영상의 다음 샷(없으면 None)."""
    physics = bool(shot["score_candidate"])
    if following is None:
        scored, basis = physics, "physics"
    else:
        continued = following["cue_ball"] == shot["cue_ball"]
        scored = continued
        basis = "agree" if continued == physics else "turn"
    return {
        "result": "success" if scored else "fail",
        "fail_reason": None if scored else fail_reason(shot),
        "score_basis": basis,
        "score_confidence": CONFIDENCE[basis],
    }


def judge_shots(shots: list[dict]) -> list[dict]:
    """샷 목록 전체에 result, fail_reason, score_basis, score_confidence를 붙여 돌려준다."""
    return [
        {**shot, **judge_shot(shot, shots[i + 1] if i + 1 < len(shots) else None)}
        for i, shot in enumerate(shots)
    ]


def summary(shots: list[dict]) -> dict:
    """판정 결과를 센다 (출력·검증용)."""
    counts: dict[str, int] = {}
    for s in shots:
        for key in (f"result:{s['result']}", f"basis:{s['score_basis']}"):
            counts[key] = counts.get(key, 0) + 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="샷 JSON에 득점 여부를 자동 확정해 기록합니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--shots", type=Path, default=Path("data/results/shots"))
    args = parser.parse_args()

    source = args.shots / f"{args.video.stem}.json"
    if not source.exists():
        raise SystemExit(f"샷 결과가 없습니다. 먼저 analyzer.shots 를 실행해 주세요: {source}")
    data = json.loads(source.read_text(encoding="utf-8"))
    data["shots"] = judge_shots(data["shots"])
    data["judge_summary"] = summary(data["shots"])
    source.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"샷 {len(data['shots'])}개 판정: {data['judge_summary']}")
    print(f"결과: {source}")


if __name__ == "__main__":
    main()
