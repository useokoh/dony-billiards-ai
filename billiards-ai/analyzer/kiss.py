"""쫑(수구와 1적구가 다시 부딪힘, 1적구가 2적구를 건드림) 예측을 위한 운동 측정과 검증.

쫑은 위치만으로 알 수 없고 "같은 시각에 같은 자리"여야 일어난다. 그래서 공 속도를 잰다.
- 감속: 사건 없는 구간에서 프레임마다 줄어드는 속도 (px/프레임²)
- 쿠션 속도 유지율: 쿠션 뒤 속도 / 쿠션 앞 속도
- 충돌 직후 1적구/수구 속도 비 (두께 구간별)
- 충돌 직후 수구 속도 분포 (세기 구간 기준)

검증: 실제 샷의 충돌 직후 조건(위치·방향·속도)으로 두 공을 프레임마다 굴려 쫑을 예측하고,
궤적에서 실제로 다시 가까워졌는지와 비교한다. route_model.py가 호출한다.
"""
import math

import numpy as np

from analyzer.calibrate import TABLE_H, TABLE_W
from analyzer.detect import BALL_RADIUS

R = float(BALL_RADIUS)
KISS_DIST = 2 * R + 4  # 공 중심 거리가 이 안이면 닿은 것으로 본다(px)
SEPARATE = 2 * R + 10  # 충돌 직후 이만큼 떨어진 뒤부터 쫑을 센다
HIT_DIST = 3 * R  # 수구가 2적구에 닿았다고 보는 거리 (route_model.HIT_TOLERANCE와 같음)
NEAR, SPAN = 4, 8
MAX_FRAMES = 450  # 15초
# 쫑 위험 시뮬레이션의 흔들림 (백엔드 route-geometry.ts와 같은 값). 이 값으로 아래 검증을 했다
SPEED_SD = 0.15  # 수구 출발 속도 (로그 표준편차)
RATIO_SD = 0.2  # 1적구/수구 속도 비 (로그 표준편차)
DECEL_SD = 0.3  # 감속 (로그 표준편차)
DIR_SD = 1.5  # 수구 출발 방향 (도)
BOUNCE_SCALE = 0.5  # 쿠션 반사 잔차에 곱하는 비율
RISK_SAMPLES = 120
THICK_BINS = [0, 0.25, 0.5, 0.75, 1.01]
BALL_INDEX = {"white": 0, "yellow": 1, "red": 2}


def speed(path: np.ndarray, a: int, b: int) -> float | None:
    if a < 0 or b >= len(path) or b <= a:
        return None
    return float(np.linalg.norm(path[b] - path[a]) / (b - a))


def measure_kinematics(px: np.ndarray, shots: list[dict], video: int, labels: dict[int, bool] | None = None) -> dict:
    """labels: 사람이 웹에서 기록한 쫑 여부 {샷 시작 프레임: True/False}. 있으면 궤적 추정보다 우선한다"""
    out = {"decel": [], "retention": [], "ratio": [], "cue_speed": [], "items": [], "paths": []}
    for s in shots:
        cue = px[:, BALL_INDEX[s["cue_ball"]]]
        hits, cushions = s["hit_frames"], s["cushion_frames"]
        events = sorted([s["start_frame"], *hits, *cushions, s["end_frame"]])
        # 감속: 사건 사이 24프레임 이상 비어 있는 구간
        for a, b in zip(events, events[1:]):
            if b - a >= 24:
                v1, v2 = speed(cue, a + 2, a + 6), speed(cue, b - 6, b - 2)
                if v1 and v2 is not None and v1 > 3:
                    out["decel"].append((v1 - v2) / (b - a - 8))
        # 쿠션 속도 유지율
        for c in cushions:
            if any(abs(e - c) <= NEAR + SPAN + 2 for e in hits + cushions if e != c):
                continue
            v1, v2 = speed(cue, c - NEAR - SPAN, c - NEAR), speed(cue, c + NEAR, c + NEAR + SPAN)
            if v1 and v2 and v1 > 3:
                out["retention"].append(v2 / v1)
        if not hits:
            continue
        h = hits[0]
        obj = px[:, BALL_INDEX[s["hit_order"][0]]]
        vc, vo = speed(cue, h + NEAR, h + NEAR + SPAN), speed(obj, h + NEAR, h + NEAR + SPAN)
        d_in = cue[h - NEAR] - cue[h - NEAR - SPAN] if h - NEAR - SPAN >= 0 else None
        d_obj = obj[h + NEAR + SPAN] - obj[h - 1] if h + NEAR + SPAN < len(obj) else None
        if not (vc and vo and vc > 1 and vo > 0.5 and d_in is not None and d_obj is not None):
            continue
        if np.linalg.norm(d_in) < 12 or np.linalg.norm(d_obj) < 12:
            continue
        cos = float(np.dot(d_in, d_obj) / np.linalg.norm(d_in) / np.linalg.norm(d_obj))
        cut = math.degrees(math.acos(max(-1.0, min(1.0, cos))))
        out["ratio"].append((1 - math.sin(math.radians(cut)), vo / vc))
        out["cue_speed"].append(vc)
        # 세기 기준용: 첫 충돌 뒤 실제 경로(쿠션 접점으로 나눈 구간 길이). 백엔드와 같은 공식으로 필요 속도를 계산한다
        stop = hits[1] if len(hits) > 1 else int(s["end_frame"])
        marks = [h + NEAR] + [c for c in cushions if h + NEAR < c < stop] + [stop]
        segs = [float(np.linalg.norm(cue[b] - cue[a])) for a, b in zip(marks, marks[1:])]
        if all(x > 0 for x in segs):
            out["paths"].append(segs)
        # 검증용: 실제로 쫑이 났는지 (떨어진 뒤 다시 닿음, 두 번째 맞힘 전까지)
        end = hits[1] if len(hits) > 1 else int(s["end_frame"])
        later = [e for e in hits[1:] + cushions if e > h + NEAR + 2]
        if not later or end - h < 10:
            continue
        human = (labels or {}).get(int(s["start_frame"]))
        actual = human if human is not None else actual_kiss(cue, obj, h, end)
        # 1적구-2적구 쫑: 수구가 2적구를 맞히기 전에 2적구가 움직이기 시작함
        actual_ot = False
        if len(hits) > 1:
            tgt = px[:, BALL_INDEX[s["hit_order"][1]]]
            moved = np.linalg.norm(tgt[h:end] - tgt[s["start_frame"]], axis=1)
            actual_ot = bool((moved > 6).any())
        target = px[s["start_frame"], BALL_INDEX[s["hit_order"][1]]].tolist() if len(hits) > 1 else None
        chord = cue[min(later)] - cue[h + NEAR]
        if np.linalg.norm(chord) < 12:
            continue
        out["items"].append({
            "video": video,
            "cue": cue[h + NEAR].tolist(), "cue_dir": (chord / np.linalg.norm(chord)).tolist(), "cue_speed": vc,
            "obj": obj[h + NEAR].tolist(), "obj_dir": (d_obj / np.linalg.norm(d_obj)).tolist(), "obj_speed": vo,
            "target": target, "frames": int(end - h - NEAR), "actual": actual, "actual_ot": actual_ot,
            "label": "human" if human is not None else "trajectory",
        })
    return out


def roll(start, d, v, kin: dict, bounce=None, frames: int = MAX_FRAMES) -> list[np.ndarray]:
    """공을 프레임마다 굴린 위치들. 쿠션에서는 bounce(d, rail)로 방향을 바꾸고 속도를 줄인다(없으면 거울 반사)"""
    p, d = np.array(start, float), np.array(d, float) / max(np.linalg.norm(d), 1e-9)
    lo, hi = np.array([R, R]), np.array([TABLE_W - R, TABLE_H - R])
    out = [p.copy()]
    for _ in range(frames):
        if v <= 0:
            break
        q = p + d * v
        for axis, rails in ((0, ("left", "right")), (1, ("top", "bottom"))):
            if q[axis] < lo[axis] or q[axis] > hi[axis]:
                rail = rails[0] if q[axis] < lo[axis] else rails[1]
                q[axis] = 2 * (lo[axis] if q[axis] < lo[axis] else hi[axis]) - q[axis]
                if bounce is None:
                    d[axis] = -d[axis]
                else:
                    d = bounce(d, rail)
                    d = d / max(np.linalg.norm(d), 1e-9)
                v *= kin["retention"]
        p = q
        v -= kin["decel"]
        out.append(p.copy())
    return out


def predict_kiss(cue_path: list[np.ndarray], obj_path: list[np.ndarray], target=None, frames: int | None = None) -> str | None:
    """같은 프레임에 두 공이 다시 닿으면 쫑. 수구가 2적구에 닿으면(득점) 그 뒤는 보지 않는다.
    1적구가 2적구를 먼저 건드려도 쫑으로 본다(2적구가 움직여 경로가 무너짐).
    돌려주는 값: "cue_object"(수구-1적구 재충돌), "object_target"(1적구-2적구), None(쫑 없음)"""
    n = len(cue_path) if frames is None else min(len(cue_path), frames)
    apart = False
    for i in range(n):
        c = cue_path[i]
        o = obj_path[min(i, len(obj_path) - 1)]
        if target is not None:
            if np.linalg.norm(c - np.array(target)) <= HIT_DIST:
                return None
            if np.linalg.norm(o - np.array(target)) < KISS_DIST:
                return "object_target"
        d = np.linalg.norm(c - o)
        if d > SEPARATE:
            apart = True
        elif apart and d < KISS_DIST:
            return "cue_object"
    return None


def actual_kiss(cue: np.ndarray, obj: np.ndarray, h: int, end: int) -> bool:
    """궤적에서 실제 쫑: 첫 접촉(충돌 프레임 앞뒤에서 가장 가까운 순간) 뒤 떨어졌다가 다시 닿음.
    충돌 프레임이 실제 접촉보다 1~2프레임 앞에 찍히는 경우가 있어 첫 접촉을 따로 찾는다."""
    lo, hi = max(h - 3, 0), min(h + 6, end)
    if hi <= lo:
        return False
    first = lo + int(np.argmin(np.linalg.norm(cue[lo:hi] - obj[lo:hi], axis=1)))
    dist = np.linalg.norm(cue[first:end] - obj[first:end], axis=1)
    apart = np.nonzero(dist > SEPARATE)[0]
    return bool(len(apart) and (dist[apart[0]:] < KISS_DIST).any())


END_SPEED = 3.0  # 백엔드 route-geometry.ts와 같은 값


def required_speed(segs: list[float], decel: float, retention: float) -> float:
    """경로 끝에서 END_SPEED가 남도록 거꾸로 계산한 출발 속도 (백엔드 requiredSpeed와 같은 공식)"""
    v = END_SPEED
    for i in range(len(segs) - 1, -1, -1):
        v = math.sqrt(v * v + 2 * decel * segs[i])
        if i > 0:
            v /= retention
    return v


def summarize(m: dict) -> dict:
    ratio = np.array(m["ratio"]) if m["ratio"] else np.zeros((0, 2))
    table = []
    for lo, hi in zip(THICK_BINS, THICK_BINS[1:]):
        sel = (ratio[:, 0] >= lo) & (ratio[:, 0] < hi) if len(ratio) else np.array([], bool)
        if sel.sum() >= 10:
            table.append({"lo": lo, "hi": min(hi, 1.0), "median": round(float(np.median(ratio[sel, 1])), 2), "n": int(sel.sum())})
    cs = np.array(m["cue_speed"]) if m["cue_speed"] else np.array([20.0])
    decel = round(float(np.median(m["decel"])), 4) if m["decel"] else 0.04
    retention = round(float(np.median(m["retention"])), 3) if m["retention"] else 0.8
    req = np.array([required_speed(p, decel, retention) for p in m.get("paths", [])]) if m.get("paths") else cs
    return {
        "decel": decel,
        "retention": retention,
        # 실제 샷의 실제 경로에 같은 공식을 적용한 필요 속도 분포 (세기 기준: 하위·상위 1/3 지점)
        "required_speed_quantiles": [round(float(q), 1) for q in np.percentile(req, [33, 67])],
        "speed_ratio_by_thickness": table,
        "cue_speed_quantiles": [round(float(q), 1) for q in np.percentile(cs, [33, 67])],
        "n": {"decel": len(m["decel"]), "retention": len(m["retention"]), "ratio": len(m["ratio"])},
    }


def validate_kiss(items: list[dict], kin: dict, bounce) -> dict:
    """쫑 종류별 예측 vs 실제. 기준선은 '쫑은 없다'고 항상 예측하는 것(이전 방식)"""
    conf = {k: {"tp": 0, "fp": 0, "fn": 0, "tn": 0} for k in ("cue_object", "object_target")}
    for it in items:
        cue = roll(it["cue"], it["cue_dir"], it["cue_speed"], kin, bounce, it["frames"])
        obj = roll(it["obj"], it["obj_dir"], it["obj_speed"], kin, None, it["frames"])
        pred = predict_kiss(cue, obj, it["target"], it["frames"])
        for kind, actual in (("cue_object", it["actual"]), ("object_target", it.get("actual_ot", False))):
            p = pred == kind
            conf[kind]["tp" if p and actual else "fp" if p else "fn" if actual else "tn"] += 1
    return {"confusion": conf}


def kiss_risk(it: dict, kin: dict, bounce_fn, bounce_sd: float, rng: np.random.Generator, samples: int = RISK_SAMPLES) -> float:
    """조건을 실측 범위 안에서 흔들어 여러 번 굴렸을 때 수구-1적구 쫑이 나는 비율"""
    hits = 0
    for _ in range(samples):
        k = {"decel": kin["decel"] * math.exp(rng.normal(0, DECEL_SD)), "retention": kin["retention"]}

        def noisy(d, rail):
            v = bounce_fn(d, rail)
            a = math.radians(rng.normal(0, bounce_sd * BOUNCE_SCALE))
            return np.array([math.cos(a) * v[0] - math.sin(a) * v[1], math.sin(a) * v[0] + math.cos(a) * v[1]])

        a0 = math.radians(rng.normal(0, DIR_SD))
        cd = np.array(it["cue_dir"])
        cd = np.array([math.cos(a0) * cd[0] - math.sin(a0) * cd[1], math.sin(a0) * cd[0] + math.cos(a0) * cd[1]])
        cue = roll(it["cue"], cd, it["cue_speed"] * math.exp(rng.normal(0, SPEED_SD)), k, noisy, it["frames"])
        obj = roll(it["obj"], it["obj_dir"], it["obj_speed"] * math.exp(rng.normal(0, RATIO_SD)), k, None, it["frames"])
        if predict_kiss(cue, obj, it["target"], it["frames"]) == "cue_object":
            hits += 1
    return hits / samples


def auc(scores: list[float], labels: list[bool]) -> float | None:
    pos = [s for s, l in zip(scores, labels) if l]
    neg = [s for s, l in zip(scores, labels) if not l]
    if not pos or not neg:
        return None
    wins = sum(1.0 if p > n else 0.5 if p == n else 0.0 for p in pos for n in neg)
    return round(wins / (len(pos) * len(neg)), 3)
