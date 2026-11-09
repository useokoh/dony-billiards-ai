"""공 찾기 테스트: 위치를 아는 가상 당구대 이미지로 결과를 확인한다."""
import cv2
import numpy as np
import pytest

from analyzer.calibrate import MARGIN, TABLE_H, TABLE_W, find_corners, table_transform, warp_table
from analyzer.detect import BALL_RADIUS, detect_balls

FELT_BGR = (200, 100, 30)
WHITE_BGR = (215, 235, 240)
YELLOW_BGR = (30, 190, 245)
RED_BGR = (35, 25, 200)


def blank_table() -> np.ndarray:
    size = (TABLE_H + MARGIN * 2, TABLE_W + MARGIN * 2, 3)
    return np.full(size, FELT_BGR, np.uint8)


def add_ball(image: np.ndarray, x: float, y: float, color: tuple) -> None:
    center = (round(MARGIN + x * TABLE_W), round(MARGIN + y * TABLE_H))
    cv2.circle(image, center, BALL_RADIUS, color, -1, cv2.LINE_AA)


def three_ball_table() -> np.ndarray:
    image = blank_table()
    add_ball(image, 0.2, 0.3, WHITE_BGR)
    add_ball(image, 0.6, 0.7, YELLOW_BGR)
    add_ball(image, 0.8, 0.1, RED_BGR)
    return image


def test_finds_three_balls_at_known_positions():
    balls = detect_balls(three_ball_table())
    assert set(balls) == {"white", "yellow", "red"}
    assert (balls["white"].x, balls["white"].y) == pytest.approx((0.2, 0.3), abs=0.005)
    assert (balls["yellow"].x, balls["yellow"].y) == pytest.approx((0.6, 0.7), abs=0.005)
    assert (balls["red"].x, balls["red"].y) == pytest.approx((0.8, 0.1), abs=0.005)


def test_spots_on_ball_do_not_break_detection():
    image = three_ball_table()
    center = (round(MARGIN + 0.8 * TABLE_W), round(MARGIN + 0.1 * TABLE_H))
    cv2.circle(image, center, 3, (20, 20, 20), -1)
    assert "red" in detect_balls(image)


def test_ignores_white_cue_stick():
    image = three_ball_table()
    cv2.line(image, (500, 100), (900, 400), WHITE_BGR, 14)
    balls = detect_balls(image)
    assert balls["white"].x == pytest.approx(0.2, abs=0.005)


def test_finds_motion_blurred_ball():
    image = blank_table()
    cv2.line(image, (600, 300), (660, 300), WHITE_BGR, BALL_RADIUS * 2)
    ball = detect_balls(image)["white"]
    assert (ball.px, ball.py) == pytest.approx((630, 300), abs=3)


def test_round_ball_beats_blurred_shape():
    image = three_ball_table()
    cv2.line(image, (600, 300), (660, 300), WHITE_BGR, BALL_RADIUS * 2)
    assert detect_balls(image)["white"].x == pytest.approx(0.2, abs=0.005)


def test_finds_ball_touching_cue():
    image = blank_table()
    add_ball(image, 0.5, 0.5, WHITE_BGR)
    center_x = round(MARGIN + 0.5 * TABLE_W)
    center_y = round(MARGIN + 0.5 * TABLE_H)
    cv2.line(image, (center_x + BALL_RADIUS - 2, center_y), (center_x + 400, center_y + 200), WHITE_BGR, 14)
    assert (detect_balls(image)["white"].x, detect_balls(image)["white"].y) == pytest.approx((0.5, 0.5), abs=0.005)


def test_cue_alone_is_not_a_ball():
    image = blank_table()
    cv2.line(image, (300, 300), (900, 500), WHITE_BGR, 14)
    assert "white" not in detect_balls(image)


def test_wide_white_shirt_is_not_a_ball():
    image = blank_table()
    cv2.rectangle(image, (300, 300), (600, 600), WHITE_BGR, -1)
    assert "white" not in detect_balls(image)


def test_missing_ball_is_left_out():
    image = blank_table()
    add_ball(image, 0.5, 0.5, YELLOW_BGR)
    assert set(detect_balls(image)) == {"yellow"}


def test_ball_touching_cushion_is_found():
    image = blank_table()
    cv2.circle(image, (MARGIN + BALL_RADIUS, MARGIN + BALL_RADIUS), BALL_RADIUS, RED_BGR, -1, cv2.LINE_AA)
    assert "red" in detect_balls(image)


def test_transform_maps_corners_to_table_edges():
    corners = np.array([[180, 183], [1665, 185], [1667, 925], [179, 927]], dtype=np.float32)
    mapped = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), table_transform(corners)).reshape(-1, 2)
    assert mapped[0] == pytest.approx((MARGIN, MARGIN), abs=0.01)
    assert mapped[2] == pytest.approx((MARGIN + TABLE_W, MARGIN + TABLE_H), abs=0.01)


def test_find_corners_on_synthetic_frame():
    frame = np.full((1080, 1920, 3), (60, 60, 60), np.uint8)
    cv2.rectangle(frame, (150, 155), (1695, 958), FELT_BGR, -1)
    # 안쪽 면 경계선을 어두운 선으로 그린다.
    cv2.rectangle(frame, (180, 185), (1665, 925), (110, 55, 15), 3)
    corners = find_corners([frame])
    expected = np.array([[180, 185], [1665, 185], [1665, 925], [180, 925]], dtype=np.float32)
    assert np.abs(corners - expected).max() < 3
    assert warp_table(frame, table_transform(corners)).shape[:2] == (TABLE_H + MARGIN * 2, TABLE_W + MARGIN * 2)
