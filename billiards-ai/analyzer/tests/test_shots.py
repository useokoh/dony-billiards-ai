"""샷 판정 테스트: 경로를 직접 만들어 쿠션 횟수와 충돌 순서를 확인한다."""
import numpy as np

from analyzer.calibrate import TABLE_H, TABLE_W
from analyzer.detect import BALL_RADIUS
from analyzer.shots import find_rest, analyze_move, count_cushions, find_contact, find_cue_ball, turn_agreement

R = BALL_RADIUS


def segments(*points, step: float = 15.0) -> np.ndarray:
    """점들을 일정한 속도로 잇는 경로를 만든다."""
    path = [np.array(points[0], float)]
    for target in points[1:]:
        target = np.array(target, float)
        while np.linalg.norm(target - path[-1]) > step:
            path.append(path[-1] + (target - path[-1]) / np.linalg.norm(target - path[-1]) * step)
        path.append(target)
    return np.array(path)


def still(point, frames: int) -> np.ndarray:
    return np.tile(np.array(point, float), (frames, 1))


def test_counts_three_cushions():
    path = segments((400, 300), (TABLE_W - R, 500), (900, TABLE_H - R), (R, 400), (300, 300))
    assert len(count_cushions(path)) == 3


def test_straight_path_has_no_cushion():
    assert count_cushions(segments((200, 300), (1200, 400))) == []


def test_direction_change_in_middle_is_not_cushion():
    assert count_cushions(segments((200, 300), (700, 400), (300, 500))) == []


def test_corner_counts_two_cushions():
    path = segments((800, 400), (TABLE_W - R, TABLE_H - R), (800, 300))
    assert len(count_cushions(path)) == 2


def test_fast_ball_cushion_is_counted():
    path = segments((300, 300), (TABLE_W - R, 400), (300, 500), step=80)
    assert len(count_cushions(path)) == 1


def test_slow_ball_stopping_near_cushion_is_not_counted():
    assert count_cushions(np.vstack([segments((1300, 370), (TABLE_W - R - 2, 370), step=2), still((TABLE_W - R - 2, 370), 30)])) == []


def test_contact_requires_object_to_react():
    cue = segments((200, 300), (900, 300))
    frames = len(cue)
    assert find_contact(cue, still((500, 320), frames)) is None


def test_contact_found_when_object_moves():
    cue = segments((200, 300), (500, 300), (300, 500))
    contact = len(segments((200, 300), (500, 300))) - 1
    other = np.vstack([still((535, 300), contact + 1), segments((535, 300), (900, 300), step=10)])[: len(cue)]
    found = find_contact(cue, other)
    assert found is not None and abs(found - contact) <= 2


def test_near_miss_with_center_jitter_is_not_contact():
    cue = segments((200, 300), (900, 300), step=8)
    other = still((500, 332), len(cue))
    index = np.argmin(np.linalg.norm(cue - other, axis=1))
    other[index - 2 : index + 3] += (2.0, -2.0)  # 붙어 보일 때 중심이 잠깐 흔들림
    assert find_contact(cue, other) is None


def test_cue_stopping_against_object_is_contact():
    cue = np.vstack([segments((200, 300), (468, 300), step=4), still((468, 300), 20)])
    assert find_contact(cue, still((500, 300), len(cue))) is not None


def test_small_move_is_not_a_shot():
    white = np.vstack([still((300, 300), 5), segments((300, 300), (312, 303), step=3), still((312, 303), 20)])
    frames = len(white)
    assert analyze_move({"white": white, "yellow": still((600, 300), frames), "red": still((900, 300), frames)}) is None


def test_cue_ball_is_first_to_move():
    white = segments((200, 300), (900, 300))
    yellow = np.vstack([still((600, 300), 10), segments((600, 300), (1000, 300), step=8)])[: len(white)]
    red = still((100, 100), len(white))
    assert find_cue_ball({"white": white, "yellow": yellow, "red": red}) == "white"


def test_red_moving_first_is_not_a_shot():
    red = segments((200, 300), (900, 300))
    assert find_cue_ball({"white": still((100, 100), len(red)), "yellow": still((100, 600), len(red)), "red": red}) is None


def build_shot(cushion_points: list) -> dict:
    """노란 공 → 쿠션들 → 빨간 공 순서의 흰공 샷을 만든다."""
    to_yellow = segments((200, 200), (500, 200))
    to_red = segments((500, 200), *cushion_points, (1000, 500))
    white = np.vstack([to_yellow, to_red[1:]])
    frames = len(white)
    yellow_hit = len(to_yellow) - 1
    yellow = np.vstack([still((535, 200), yellow_hit + 1), segments((535, 200), (800, 100), step=6)])
    red = np.vstack([still((1035, 500), frames - 1), segments((1035, 500), (1300, 600), step=6)])
    white = np.vstack([white, still(white[-1], len(red) - frames)])
    yellow = np.vstack([yellow, still(yellow[-1], max(0, len(red) - len(yellow)))])[: len(red)]
    return analyze_move({"white": white, "yellow": yellow, "red": red})


def test_full_shot_with_three_cushions_is_score_candidate():
    result = build_shot([(TABLE_W - R, 300), (1100, TABLE_H - R), (R, 500)])
    assert result["cue_ball"] == "white"
    assert result["hit_order"] == ["yellow", "red"]
    assert result["cushions_before_second_hit"] == 3
    assert result["score_candidate"]


def test_two_cushions_before_second_hit_is_not_score_candidate():
    result = build_shot([(TABLE_W - R, 300), (1100, TABLE_H - R)])
    assert result["cushions_before_second_hit"] == 2
    assert not result["score_candidate"]


def test_turn_agreement_counts():
    shots = [
        {"cue_ball": "white", "score_candidate": True},
        {"cue_ball": "white", "score_candidate": False},
        {"cue_ball": "yellow", "score_candidate": True},
        {"cue_ball": "white", "score_candidate": False},
    ]
    assert turn_agreement(shots) == {"score_same": 1, "score_changed": 1, "miss_same": 0, "miss_changed": 1}


def test_find_rest_waits_for_slow_rolling_ball():
    rolling = np.vstack([segments((500, 300), (560, 300), step=1.0), still((560, 300), 40)])
    pixels = np.stack([rolling, still((100, 100), len(rolling)), still((900, 600), len(rolling))], axis=1)
    rest = find_rest(pixels, end=0, limit=len(rolling) - 1)
    assert abs(rest - 60) <= 15


def test_find_rest_stops_before_next_shot():
    rolling = segments((100, 300), (1300, 300), step=1.0)
    pixels = np.stack([rolling, rolling, rolling], axis=1)
    assert find_rest(pixels, end=0, limit=200) <= 200
