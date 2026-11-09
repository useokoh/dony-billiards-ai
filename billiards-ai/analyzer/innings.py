"""4-① 이닝 정리: 샷 목록에 이닝, 선공·후공, 순번을 붙인다.

3쿠션 대회 방식으로, 선공과 후공이 한 번씩 차례를 마치면 1이닝이다.
선수마다 수구가 정해져 있으므로 수구가 바뀌면 다음 선수의 차례로 본다.
영상의 첫 샷을 친 선수를 선공으로 간주한다.
"""


def assign_innings(shots: list[dict]) -> list[dict]:
    """샷마다 inning_no, player, shot_no_in_turn, shot_no_in_inning을 채워 돌려준다."""
    if not shots:
        return []
    first_cue = shots[0]["cue_ball"]
    inning = 1
    in_turn = 0
    in_inning = 0
    previous_cue = None
    result = []
    for shot in shots:
        cue = shot["cue_ball"]
        if cue != previous_cue:
            in_turn = 0
            if previous_cue is not None and cue == first_cue:
                inning += 1
                in_inning = 0
        in_turn += 1
        in_inning += 1
        previous_cue = cue
        result.append(
            {
                **shot,
                "inning_no": inning,
                "player": "first" if cue == first_cue else "second",
                "shot_no_in_turn": in_turn,
                "shot_no_in_inning": in_inning,
            }
        )
    return result


def shot_label(shot: dict) -> str:
    """화면에 보여 줄 이름을 만든다. 예: 3이닝 후공 2번째 샷"""
    player = "선공" if shot["player"] == "first" else "후공"
    return f"{shot['inning_no']}이닝 {player} {shot['shot_no_in_turn']}번째 샷"
