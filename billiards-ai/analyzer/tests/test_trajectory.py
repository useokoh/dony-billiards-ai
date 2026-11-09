"""샷별 궤적 내보내기 테스트."""
import numpy as np

from analyzer.trajectory import rest_frame, shot_trajectory

BALLS = ["white", "yellow", "red"]


def make_track(n=20):
    times = np.arange(n) / 10
    positions = np.zeros((n, 3, 2))
    positions[:, 0, 0] = np.linspace(0, 1, n)  # 흰공만 움직임
    estimated = np.zeros((n, 3), dtype=bool)
    estimated[5, 0] = True
    return times, positions, estimated


def test_rest_frame_uses_rest_sec_and_never_before_end():
    times, _, _ = make_track()
    assert rest_frame(times, {"end_frame": 5, "rest_sec": 1.2}) == 12
    assert rest_frame(times, {"end_frame": 15, "rest_sec": 0.3}) == 15
    assert rest_frame(times, {"end_frame": 7, "rest_sec": None}) == 7


def test_shot_trajectory_slices_and_keeps_last_frame():
    times, positions, estimated = make_track()
    t = shot_trajectory(times, positions, estimated, BALLS, {"shot_no": 3, "start_frame": 2, "end_frame": 8, "rest_sec": 0.9}, step=2)
    white = t["balls"]["white"]
    assert t["start_frame"] == 2 and t["last_frame"] == 9 and t["step"] == 2
    assert len(white["points"]) == len(white["estimated"]) == 5  # 2,4,6,8 + 마지막 9
    assert white["points"][-1][0] == round(9 / 19, 4)
    assert white["estimated"] == [0, 0, 0, 0, 0]
    assert t["balls"]["red"]["points"][0] == [0.0, 0.0]


def test_estimated_flag_follows_frames():
    times, positions, estimated = make_track()
    t = shot_trajectory(times, positions, estimated, BALLS, {"shot_no": 1, "start_frame": 1, "end_frame": 9, "rest_sec": None}, step=4)
    assert t["balls"]["white"]["estimated"] == [0, 1, 0]  # 1, 5, 9
