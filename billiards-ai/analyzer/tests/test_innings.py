"""이닝 정리와 샷 영상 구간 테스트."""
from analyzer.clips import clip_name, clip_range
from analyzer.innings import assign_innings, shot_label


def shots(cues: str) -> list[dict]:
    names = {"w": "white", "y": "yellow"}
    return [{"shot_no": i + 1, "cue_ball": names[c]} for i, c in enumerate(cues)]


def summary(result: list[dict]) -> list[tuple]:
    return [(s["inning_no"], s["player"], s["shot_no_in_turn"]) for s in result]


def test_turns_alternate_within_inning():
    assert summary(assign_innings(shots("wywy"))) == [(1, "first", 1), (1, "second", 1), (2, "first", 1), (2, "second", 1)]


def test_scoring_player_keeps_turn_in_same_inning():
    result = assign_innings(shots("wwwyyw"))
    assert summary(result) == [
        (1, "first", 1), (1, "first", 2), (1, "first", 3),
        (1, "second", 1), (1, "second", 2),
        (2, "first", 1),
    ]
    assert [s["shot_no_in_inning"] for s in result] == [1, 2, 3, 4, 5, 1]


def test_first_shooter_can_be_yellow():
    result = assign_innings(shots("ywy"))
    assert summary(result) == [(1, "first", 1), (1, "second", 1), (2, "first", 1)]


def test_no_shots():
    assert assign_innings([]) == []


def test_label():
    assert shot_label(assign_innings(shots("wyy"))[2]) == "1이닝 후공 2번째 샷"


def test_clip_runs_until_balls_stop():
    assert clip_range(100.0, 112.5) == (99.0, 14.5)


def test_clip_does_not_start_before_video():
    assert clip_range(0.4, 5.0) == (0.0, 6.0)


def test_clip_is_cut_at_video_end():
    assert clip_range(100.0, 103.5, video_duration=104.0) == (99.0, 5.0)


def test_clip_length_is_capped():
    assert clip_range(100.0, 200.0) == (99.0, 30.0)


def test_clip_name_keeps_order():
    shot = {**assign_innings(shots("wy"))[1], "shot_no": 45}
    assert clip_name(shot) == "이닝001_후공_샷01_045.mp4"
