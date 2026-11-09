"""3단계 샷 판정: 궤적에서 샷, 수구, 쿠션 횟수, 충돌 순서를 찾아 JSON으로 저장한다.

먼저 analyzer.track 을 실행한 뒤 사용한다:
    .venv/bin/python -m analyzer.shots data/videos/영상파일.MP4

결과: data/results/shots/영상이름.json
"""
import argparse
import json
from pathlib import Path

import numpy as np

from analyzer.calibrate import TABLE_H, TABLE_W
from analyzer.detect import BALL_RADIUS
from analyzer.innings import assign_innings
from analyzer.judge import judge_shots, summary

BALLS = ("white", "yellow", "red")
CUE_BALLS = ("white", "yellow")
BALL_DIAMETER = BALL_RADIUS * 2

# 공이 움직이기 시작했다고 볼 프레임당 이동량(px)
START_SPEED = 2.0
# 수구와 목적구 중심이 이 거리 안으로 들어오면 충돌 후보로 본다(px)
CONTACT_DISTANCE = BALL_DIAMETER * 1.2
CONTACT_PER_SPEED = 0.6  # 프레임당 속도 1px마다 넓히는 후보 거리(px)
# 멈춰 있던 목적구가 충돌로 인정받으려면 밀려야 하는 거리(px)
CONTACT_PUSH = 4.0
STILL_SPEED = 1.0  # 이보다 느리면 멈춰 있는 공으로 본다(px/프레임)
MOVING_SPEED_CHANGE = 2.0  # 움직이던 목적구의 속도 변화 기준(px/프레임)
# 멈춰 있던 목적구가 움직이기 시작할 때 수구가 이 거리 안이면 수구가 친 것으로 본다(px)
WAKE_MAX_DISTANCE = BALL_DIAMETER * 4
STOPPED_SPEED = 0.5  # 수구가 멈춘 것으로 보는 속도(px/프레임)
MIN_CUE_TRAVEL = BALL_DIAMETER  # 수구가 이만큼도 안 움직이면 샷이 아니다(px)
MAX_ESTIMATED_CUE = 0.3  # 수구 위치 중 추정 비율이 이보다 크면 샷이 아니다
MIN_SHOT_FRAMES = 90  # 약 3초
# 쿠션 판정: 벽까지 거리가 이 값 + 속도 비례분 안에서 방향이 바뀌면 쿠션으로 센다(px)
CUSHION_BAND = BALL_RADIUS + 14
CUSHION_BAND_PER_SPEED = 0.6
CUSHION_TURN_WINDOW = 3  # 방향 전환을 확인할 앞뒤 프레임 수
CUSHION_MIN_TURN = 1.5  # 벽 쪽으로 들어오고 나간 최소 거리(px)
CUSHION_MIN_GAP = 6  # 같은 벽의 연속 판정을 하나로 묶는 간격(프레임)
SCORE_CUSHIONS = 3
AFTER_MOVE = 15  # 움직임이 끝난 뒤 더 살펴볼 프레임 수
# 공이 실제로 멈춘 것으로 보는 기준: REST_WINDOW 프레임 동안 모든 공의 이동이 REST_SHIFT px 이하
REST_WINDOW = 15
REST_SHIFT = 3.0
REST_MAX_FRAMES = 600  # 구간 끝에서 최대 20초까지만 찾는다


def to_px(positions: np.ndarray) -> np.ndarray:
    """0~1 좌표를 펼친 당구대 px 좌표로 바꾼다. 거리를 가로·세로 똑같이 재기 위함이다."""
    return positions * np.array([TABLE_W, TABLE_H])


def first_moving_frame(path: np.ndarray) -> int | None:
    """공이 처음으로 계속 움직이는 프레임을 찾는다. 잠깐 튄 잡음은 무시한다."""
    if len(path) < 4:
        return None
    moving = np.linalg.norm(np.diff(path, axis=0), axis=1) > START_SPEED
    for i in range(len(moving) - 2):
        if moving[i : i + 3].all():
            return i
    return None


def find_cue_ball(paths: dict[str, np.ndarray]) -> str | None:
    """가장 먼저 움직인 공을 찾는다. 빨간 공이 먼저면 샷이 아니므로 None을 돌려준다."""
    starts = {name: first_moving_frame(path) for name, path in paths.items()}
    moved = {name: frame for name, frame in starts.items() if frame is not None}
    if not moved:
        return None
    first = min(moved, key=moved.get)
    return first if first in CUE_BALLS else None


def count_cushions(path: np.ndarray) -> list[int]:
    """공이 쿠션에 닿은 프레임 목록을 돌려준다. 네 벽을 각각 검사한다."""
    speed = np.linalg.norm(np.gradient(path, axis=0), axis=1)
    walls = [path[:, 0], TABLE_W - path[:, 0], path[:, 1], TABLE_H - path[:, 1]]
    window = CUSHION_TURN_WINDOW
    hits: list[int] = []
    for distance in walls:
        last = -CUSHION_MIN_GAP
        for i in range(window, len(path) - window):
            if distance[i] > CUSHION_BAND + speed[i] * CUSHION_BAND_PER_SPEED:
                continue
            if distance[i] != distance[i - window : i + window + 1].min():
                continue
            if distance[i - window] - distance[i] < CUSHION_MIN_TURN or distance[i + window] - distance[i] < CUSHION_MIN_TURN:
                continue
            if i - last >= CUSHION_MIN_GAP:
                hits.append(i)
            last = i
    return sorted(hits)


def _closest_approach(cue: np.ndarray, other: np.ndarray) -> np.ndarray:
    """프레임 사이 이동까지 고려한 두 공의 최소 거리. 빠른 공이 건너뛰는 충돌도 잡기 위함이다."""
    relative = cue - other
    start, step = relative[:-1], np.diff(relative, axis=0)
    lengths = (step * step).sum(axis=1)
    t = np.where(lengths > 0, -(start * step).sum(axis=1) / np.where(lengths > 0, lengths, 1), 0)
    t = np.clip(t, 0, 1)
    return np.linalg.norm(start + step * t[:, None], axis=1)


def _push(other: np.ndarray, i: int) -> float:
    """i 프레임 전후로 공이 놓인 위치가 얼마나 달라졌는지 잰다.

    공이 붙어 보이면 번짐 때문에 중심이 잠깐 흔들리므로, 전후 위치의 중앙값을 비교한다.
    """
    before = np.median(other[max(0, i - 12) : max(1, i - 1)], axis=0)
    after = np.median(other[min(i + 3, len(other) - 1) : i + 11], axis=0)
    return float(np.linalg.norm(after - before))


def find_contact(cue: np.ndarray, other: np.ndarray, third: np.ndarray | None = None) -> int | None:
    """수구가 목적구에 처음 닿은 프레임을 찾는다. 가까이 지나가기만 한 경우는 제외한다.

    영상에서 공이 붙어 보여도 실제로 안 맞은 경우가 많아 거리만으로는 판단하지 않는다.
    - 멈춰 있던 목적구: 실제로 밀렸을 때만 인정한다. 빠른 공은 번져 중심이 어긋나므로
      빠를수록 후보 거리를 넓히고, 움직이기 시작한 프레임을 충돌 시점으로 쓴다.
    - 이미 움직이던 목적구: 속도가 변했을 때 인정한다.
    - 수구가 목적구에 붙어 멈춤: 아주 느리게 닿으면 목적구가 밀리지 않으므로 따로 인정한다.
    """
    distance = _closest_approach(cue, other)
    relative_speed = np.linalg.norm(np.diff(cue - other, axis=0), axis=1)
    close = distance <= CONTACT_DISTANCE + relative_speed * CONTACT_PER_SPEED
    velocity = np.gradient(other, axis=0)
    wake = first_moving_frame(other)
    found = []
    for i in np.where(close)[0]:
        recent = np.linalg.norm(velocity[max(0, i - 6) : i], axis=1).mean() if i > 0 else 0.0
        if recent < STILL_SPEED:
            if _push(other, i) >= CONTACT_PUSH:
                # 충돌 직전 프레임이 먼저 후보가 되므로 실제로 움직인 시점으로 맞춘다.
                found.append(int(wake) if wake is not None and i <= wake <= i + 10 else int(i))
                break
        else:
            before = velocity[max(0, i - 3) : i].mean(axis=0)
            after = velocity[i + 1 : i + 5].mean(axis=0) if i + 1 < len(velocity) else np.zeros(2)
            if np.linalg.norm(after - before) >= MOVING_SPEED_CHANGE:
                found.append(int(i))
                break

    # 공이 번지면 거리 측정이 크게 빗나가므로, 수구가 가장 가까운 공이면 수구가 친 것으로 본다.
    if wake is not None and wake > 0 and _push(other, wake) >= CONTACT_PUSH:
        window = range(max(0, wake - 3), min(len(distance), wake + 2))
        to_cue = min(distance[i] for i in window)
        to_third = min(_closest_approach(third, other)[i] for i in window) if third is not None else np.inf
        if to_cue <= WAKE_MAX_DISTANCE and to_cue <= to_third:
            found.append(int(wake))

    final_speed = np.linalg.norm(np.diff(cue[-10:], axis=0), axis=1).mean()
    if final_speed < STOPPED_SPEED and np.linalg.norm(cue[-1] - other[-1]) <= BALL_DIAMETER:
        found.append(int(np.where(distance > BALL_DIAMETER)[0][-1]) + 1 if (distance > BALL_DIAMETER).any() else 0)
    return min(found) if found else None


def analyze_move(paths: dict[str, np.ndarray], estimated: dict[str, np.ndarray] | None = None) -> dict | None:
    """한 움직임 구간을 판정한다. 샷이 아니면 None을 돌려준다.

    estimated는 공별로 위치를 직접 찾지 못하고 추정한 프레임 표시이다.
    """
    cue_name = find_cue_ball(paths)
    if cue_name is None:
        return None
    cue = paths[cue_name]
    # 수구 위치 대부분이 추정이면 사람이 가린 사이 공을 옮긴 경우이다.
    if estimated is not None and estimated[cue_name].mean() > MAX_ESTIMATED_CUE:
        return None
    # 손이나 큐가 공을 건드렸거나 가려서 생긴 작은 움직임은 샷이 아니다.
    if np.linalg.norm(cue - cue[0], axis=1).max() < MIN_CUE_TRAVEL:
        return None
    contacts = {}
    for name, path in paths.items():
        if name == cue_name:
            continue
        third = next(paths[n] for n in paths if n not in (cue_name, name))
        frame = find_contact(cue, path, third)
        if frame is not None:
            contacts[name] = frame
    order = sorted(contacts, key=contacts.get)
    cushions = count_cushions(cue)
    # 아무것도 맞히지 않은 짧은 움직임은 공을 손으로 옮기거나 놓는 동작이다.
    if not order and not cushions and len(cue) < MIN_SHOT_FRAMES:
        return None
    second_hit = contacts[order[1]] if len(order) == 2 else None
    before_second = sum(c < second_hit for c in cushions) if second_hit is not None else None
    return {
        "cue_ball": cue_name,
        "cushion_count": len(cushions),
        "cushion_frames": cushions,
        "hit_order": order,
        "hit_frames": [contacts[name] for name in order],
        "cushions_before_second_hit": before_second,
        "score_candidate": before_second is not None and before_second >= SCORE_CUSHIONS,
    }


def find_rest(pixels: np.ndarray, end: int, limit: int) -> int:
    """움직임 구간이 끝난 뒤 공 3개가 실제로 멈춘 프레임을 찾는다.

    구간 판정은 천천히 구르는 공을 멈춘 것으로 보므로, 더 엄격한 기준으로 다시 찾는다.
    limit(다음 샷 직전)을 넘지 않는다.
    """
    span = REST_WINDOW
    for i in range(end, max(end, limit - span)):
        shift = np.linalg.norm(pixels[i + span] - pixels[i], axis=1).max()
        if shift <= REST_SHIFT:
            return i
    return max(end, limit - span)


def analyze_track(times: np.ndarray, positions: np.ndarray, moves: np.ndarray, estimated: np.ndarray | None = None) -> tuple[list[dict], list[dict]]:
    """움직임 구간 전체를 판정해 (샷 목록, 샷이 아닌 구간 목록)을 돌려준다."""
    pixels = to_px(positions)
    shots, others = [], []
    for index, (begin, end) in enumerate(moves):
        begin, end = int(begin), int(end)
        next_start = int(moves[index + 1][0]) if index + 1 < len(moves) else len(pixels) - 1
        rest = find_rest(pixels, end, min(next_start, end + REST_MAX_FRAMES))
        # 끝에 아주 느리게 밀린 공도 잡도록 구간보다 조금 더 본다.
        paths = {name: pixels[begin : end + 1 + AFTER_MOVE, b] for b, name in enumerate(BALLS)}
        flags = {name: estimated[begin : end + 1, b] for b, name in enumerate(BALLS)} if estimated is not None else None
        result = analyze_move(paths, flags)
        span = {
            "start_frame": begin, "end_frame": end, "start_sec": round(float(times[begin]), 2), "end_sec": round(float(times[end]), 2),
            "rest_sec": round(float(times[rest]), 2),
        }
        if result is None:
            others.append(span)
            continue
        result["cushion_frames"] = [begin + f for f in result["cushion_frames"]]
        result["hit_frames"] = [begin + f for f in result["hit_frames"]]
        shots.append({"shot_no": len(shots) + 1, **span, **result})
    return shots, others


def turn_agreement(shots: list[dict]) -> dict:
    """득점 후보 판정이 실제 차례와 맞는지 센다.

    3쿠션은 득점하면 같은 선수가 이어 치고, 못 하면 수구가 바뀐다. 다음 샷의 수구는
    쿠션·충돌 판정과 따로 얻는 정보라 판정 결과를 검증하는 기준으로 쓸 수 있다.
    """
    counts = {"score_same": 0, "score_changed": 0, "miss_same": 0, "miss_changed": 0}
    for shot, following in zip(shots, shots[1:]):
        kind = "score" if shot["score_candidate"] else "miss"
        turn = "same" if shot["cue_ball"] == following["cue_ball"] else "changed"
        counts[f"{kind}_{turn}"] += 1
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="궤적에서 샷과 쿠션 횟수를 판정합니다.")
    parser.add_argument("video", type=Path)
    parser.add_argument("--tracks", type=Path, default=Path("data/results/tracks"))
    parser.add_argument("--out", type=Path, default=Path("data/results/shots"))
    args = parser.parse_args()

    track = args.tracks / args.video.stem / "track.npz"
    if not track.exists():
        raise SystemExit(f"궤적 파일이 없습니다. 먼저 analyzer.track 을 실행해 주세요: {track}")
    with np.load(track) as data:
        shots, others = analyze_track(data["times"], data["positions"], data["moves"], data["estimated"])

    shots = judge_shots(assign_innings(shots))  # ⑨ 득점 자동 확정
    agreement = turn_agreement(shots)
    args.out.mkdir(parents=True, exist_ok=True)
    target = args.out / f"{args.video.stem}.json"
    target.write_text(
        json.dumps({"video": args.video.name, "shots": shots, "other_moves": others, "turn_agreement": agreement, "judge_summary": summary(shots)}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    total = sum(agreement.values())
    matched = agreement["score_same"] + agreement["miss_changed"]
    print(f"샷 {len(shots)}개, 샷이 아닌 구간 {len(others)}개")
    print(f"평균 쿠션 {np.mean([s['cushion_count'] for s in shots]):.1f}회, 득점 후보 {sum(s['score_candidate'] for s in shots)}개")
    print(f"다음 차례와 일치: {matched}/{total} ({matched / max(total, 1):.0%}) {agreement}")
    print(f"득점 확정: {summary(shots)}")
    print(f"이닝 {max((s['inning_no'] for s in shots), default=0)}개")
    print(f"결과: {target}")


if __name__ == "__main__":
    main()
