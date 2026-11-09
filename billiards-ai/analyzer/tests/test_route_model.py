"""추천 경로 모델 보정 테스트."""
import json
import math
from pathlib import Path

import numpy as np
import pytest

from analyzer.route_model import bounce_dir, build_model, fit_table, measure, rail_angles, simulate, table_beta


def test_rail_angles_reflection_and_reverse():
    # 위 쿠션: 오른쪽 위로 45° 들어와 오른쪽 아래로 나감
    assert rail_angles("top", np.array([1.0, -1.0]), np.array([1.0, 1.0])) == pytest.approx((45.0, 45.0))
    # 쿠션을 따라 되돌아가면 나간 각은 음수
    a, b = rail_angles("top", np.array([1.0, -1.0]), np.array([-1.0, 2.0]))
    assert b < 0
    # 수직 성분이 같은 방향이면 반사가 아니다
    assert rail_angles("top", np.array([1.0, -1.0]), np.array([1.0, -1.0])) is None


def test_fit_table_and_interpolation():
    alphas = [5, 6, 7, 15, 16, 17, 25, 26, 27]
    betas = [10, 10, 10, 20, 20, 20, 30, 30, 30]
    law = fit_table(alphas, betas)
    assert law["table"] == [[5, 10.0], [15, 20.0], [25, 30.0]]
    assert table_beta(10, law) == pytest.approx(15.0)
    assert law["residual_sd"] == pytest.approx(0.0)


def test_bounce_mirror_and_table():
    assert bounce_dir(np.array([1.0, -1.0]), "top", None).tolist() == [1.0, 1.0]
    law = {"long": {"table": [[5, 5], [85, 85]]}, "short": {"table": [[5, 5], [85, 85]]}}
    d = bounce_dir(np.array([1.0, -1.0]), "top", law)  # 표가 거울 반사와 같으면 결과도 같다
    assert d[0] == pytest.approx(1.0) and d[1] == pytest.approx(1.0)


def test_simulate_counts_cushions_before_hit():
    n, banks = simulate([200, 370], [1, 0], [600, 370], [0, 0], None)
    assert n == 0 and banks == []
    # 위 쿠션 한 번 맞고 아래쪽 목표로
    n, banks = simulate([200, 400], [1, -1], [200 + 2 * (400 - 18), 400], [0, 0], None)
    assert n == 1 and banks[0][1] == pytest.approx(18)


REAL = sorted(Path("data/results/shots").glob("*.json"))


@pytest.mark.skipif(not REAL, reason="분석 결과 없음")
def test_real_videos_table_beats_mirror():
    ms = []
    for i, f in enumerate(REAL):
        track = Path("data/results/tracks") / f.stem / "track.npz"
        if track.exists():
            ms.append(measure(track, f, video=i))
    if not ms:
        pytest.skip("궤적 없음")
    v = build_model(ms)["validation"]
    assert v["per_bounce"]["table"]["median_deg"] < v["per_bounce"]["mirror"]["median_deg"]
    assert v["path"]["table"]["reproduce_rate"] > v["path"]["mirror"]["reproduce_rate"]
