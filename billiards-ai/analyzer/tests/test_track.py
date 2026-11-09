"""궤적 추적 테스트: 빈칸 채우기, 튄 값 제거, 움직임 구간 찾기를 확인한다."""
import numpy as np
import pytest

from analyzer.track import fill_gaps, find_moves


def line(start: tuple, end: tuple, frames: int) -> np.ndarray:
    return np.linspace(start, end, frames)


def test_fill_gaps_interpolates_hidden_frames():
    points = line((0.1, 0.1), (0.2, 0.2), 11)
    points[4:7] = np.nan
    filled, estimated = fill_gaps(points)
    assert filled[5] == pytest.approx((0.15, 0.15))
    assert estimated.tolist() == [False] * 4 + [True] * 3 + [False] * 4


def test_single_wrong_detection_is_removed():
    points = np.full((30, 2), 0.5)
    points[15] = (0.95, 0.05)
    filled, estimated = fill_gaps(points)
    assert filled[15] == pytest.approx((0.5, 0.5))
    assert estimated[15]


def test_short_burst_of_wrong_detections_is_removed():
    points = np.full((80, 2), 0.5)
    points[30:40] = (0.95, 0.05)
    filled, estimated = fill_gaps(points)
    assert filled[35] == pytest.approx((0.5, 0.5))
    assert estimated[30:40].all()


def test_wrong_first_detection_is_removed():
    points = np.full((30, 2), 0.5)
    points[0] = (0.95, 0.05)
    filled, estimated = fill_gaps(points)
    assert filled[0] == pytest.approx((0.5, 0.5))
    assert estimated[0]


def test_ball_replaced_while_hidden_is_kept():
    points = np.vstack([np.full((40, 2), 0.2), np.full((3, 2), np.nan), np.full((40, 2), 0.8)])
    filled, _ = fill_gaps(points)
    assert filled[-1] == pytest.approx((0.8, 0.8))
    assert filled[0] == pytest.approx((0.2, 0.2))


def test_fast_real_movement_is_kept():
    points = line((0.1, 0.5), (0.9, 0.5), 21)  # 프레임당 0.04
    _, estimated = fill_gaps(points)
    assert not estimated.any()


def test_all_missing_does_not_crash():
    points = np.full((5, 2), np.nan)
    _, estimated = fill_gaps(points)
    assert estimated.all()


def three_balls(moving: np.ndarray) -> np.ndarray:
    frames = len(moving)
    return np.stack([moving, np.full((frames, 2), 0.2), np.full((frames, 2), 0.8)], axis=1)


def test_find_moves_finds_one_shot():
    white = np.vstack([np.full((50, 2), 0.3), line((0.3, 0.3), (0.7, 0.6), 60), np.full((80, 2), (0.7, 0.6))])
    moves = find_moves(three_balls(white))
    assert len(moves) == 1
    begin, end = moves[0]
    assert abs(begin - 50) <= 5
    assert abs(end - 110) <= 5


def test_find_moves_ignores_jitter():
    rng = np.random.default_rng(1)
    white = 0.5 + rng.normal(0, 0.0002, (200, 2))
    assert find_moves(three_balls(white)) == []


def test_find_moves_separates_two_shots():
    white = np.vstack([
        np.full((30, 2), 0.2),
        line((0.2, 0.2), (0.5, 0.2), 40),
        np.full((100, 2), (0.5, 0.2)),
        line((0.5, 0.2), (0.5, 0.7), 40),
        np.full((30, 2), (0.5, 0.7)),
    ])
    assert len(find_moves(three_balls(white))) == 2
