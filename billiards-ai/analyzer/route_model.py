"""⑩ 추천 경로 모델 보정: 실제 경기 영상에서 이 당구대의 공 움직임을 재서 경로 계산 값을 맞춘다.

거울 반사(들어온 각 = 나간 각)만으로 그린 경로는 실제와 다르다. 쿠션 탄성, 회전, 속도 때문이다.
이 프로그램은 분석이 끝난 영상들에서 다음을 측정한다.

1. 쿠션 반사 법칙: 수구가 쿠션에 들어온 각 α와 나간 각 β (쿠션에 수직인 선 기준, 도)
   → 장쿠션·단쿠션별로 α 10° 구간마다 β의 중앙값 표를 만든다(사이 값은 직선 보간).
   교차 검증(영상 하나로 만들고 다른 영상으로 검사)에서 직선 β = a·α + b(오차 중앙값 5.0°)보다
   표 방식(2.7°)이 정확했고, 거울 반사는 14.0°였다 (2026-11-09).
2. 첫 목적구 충돌: 두께(자르는 각 c)에 따라 수구가 꺾이는 각 δ → 구간별 중앙값 표
3. 1적구가 맞은 뒤 굴러간 거리 → 두께 구간별 중앙값 (다음 배치 예상용)
4. 검증(교차 검증): 득점한 샷에서 수구가 첫 목적구를 맞고 첫 쿠션으로 간 실제 직선 방향으로
   경로를 다시 굴려, 쿠션 3회 뒤 두 번째 목적구까지 재현되는지(재현율)를 모델별로 잰다.

결과: data/results/route_model.json (백엔드 추천 경로 계산이 읽는다)
    .venv/bin/python -m analyzer.route_model
"""
import argparse
import json
import math
from datetime import date
from pathlib import Path

import numpy as np

from analyzer.calibrate import TABLE_H, TABLE_W
from analyzer.detect import BALL_RADIUS

R = float(BALL_RADIUS)
BALL_INDEX = {"white": 0, "yellow": 1, "red": 2}
NEAR = 4  # 사건 앞뒤로 방향을 잴 때 건너뛸 프레임 (충돌 순간의 흔들림 제외)
SPAN = 8  # 방향을 재는 구간 길이(프레임)
MIN_MOVE = 12.0  # 방향을 믿으려면 그 구간에서 움직여야 하는 거리(px)
CLEAR = NEAR + SPAN + 2  # 측정 구간 안에 다른 사건이 없어야 한다
CUT_BINS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]
THICK_BINS = [0, 0.25, 0.5, 0.75, 1.01]
HIT_TOLERANCE = R  # 재현 판정: 두 번째 목적구 중심과의 거리 ≤ 2R + 이 값
MAX_CUSHIONS = 6


def unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def angle_deg(u: np.ndarray, v: np.ndarray) -> float:
    c = float(np.dot(unit(u), unit(v)))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def direction(path: np.ndarray, a: int, b: int) -> np.ndarray | None:
    """path[a] → path[b] 방향. 범위를 벗어나거나 거의 안 움직였으면 None"""
    if a < 0 or b >= len(path) or a >= b:
        return None
    v = path[b] - path[a]
    return v if np.linalg.norm(v) >= MIN_MOVE else None


def nearest_rail(p: np.ndarray) -> str:
    gaps = {"top": p[1], "bottom": TABLE_H - p[1], "left": p[0], "right": TABLE_W - p[0]}
    return min(gaps, key=gaps.get)


def rail_angles(rail: str, d_in: np.ndarray, d_out: np.ndarray) -> tuple[float, float] | None:
    """쿠션에 수직인 선 기준 (들어온 각, 나간 각). 나간 각은 쿠션을 따라 같은 쪽으로 가면 +"""
    horizontal = rail in ("top", "bottom")
    t_in, n_in = (d_in[0], d_in[1]) if horizontal else (d_in[1], d_in[0])
    t_out, n_out = (d_out[0], d_out[1]) if horizontal else (d_out[1], d_out[0])
    # 들어올 때와 나갈 때 수직 성분 부호가 반대여야 실제 반사다
    if n_in * n_out >= 0 or abs(n_in) < 1e-6 or abs(n_out) < 1e-6:
        return None
    alpha = math.degrees(math.atan(abs(t_in) / abs(n_in)))
    beta = math.degrees(math.atan(abs(t_out) / abs(n_out)))
    if t_in * t_out < 0:
        beta = -beta  # 쿠션을 따라 되돌아감 (강한 역회전)
    return alpha, beta


ANGLE_BINS = list(range(0, 91, 10))


def fit_table(alphas: list[float], betas: list[float]) -> dict:
    """α 구간별 β 중앙값 표 + 잔차의 강건한 표준편차(1.4826 × MAD). 표본 3개 미만 구간은 뺀다"""
    a, b = np.array(alphas), np.array(betas)
    table = []
    for lo, hi in zip(ANGLE_BINS, ANGLE_BINS[1:]):
        m = (a >= lo) & (a < hi)
        if m.sum() >= 3:
            table.append([lo + 5, round(float(np.median(b[m])), 2)])
    law = {"table": table, "n": len(alphas)}
    resid = b - np.array([table_beta(x, law) for x in a])
    law["residual_sd"] = round(float(1.4826 * np.median(np.abs(resid - np.median(resid)))), 2)
    return law


def table_beta(alpha: float, law: dict) -> float:
    xs = [t[0] for t in law["table"]]
    ys = [t[1] for t in law["table"]]
    return float(np.interp(alpha, xs, ys))


def deflection_sd(cuts: list[float], deflections: list[float]) -> float:
    """두께 구간 중앙값에서 벗어난 정도 (강건 표준편차, 도). 회전을 다르게 쓴 영향이 섞여 있다"""
    c, d = np.array(cuts), np.array(deflections)
    resid = []
    for lo, hi in zip(CUT_BINS, CUT_BINS[1:]):
        m = (c >= lo) & (c < hi)
        if m.sum() >= 3:
            resid.extend(d[m] - np.median(d[m]))
    r = np.array(resid)
    return round(float(1.4826 * np.median(np.abs(r))), 2) if len(r) else 0.0


def binned_median(xs: list[float], ys: list[float], bins: list[float], digits: int = 1) -> list[dict]:
    out = []
    x, y = np.array(xs), np.array(ys)
    for lo, hi in zip(bins, bins[1:]):
        m = (x >= lo) & (x < hi)
        if m.sum() >= 3:
            out.append({"lo": lo, "hi": min(hi, bins[-1]), "median": round(float(np.median(y[m])), digits), "n": int(m.sum())})
    return out


def events_near(frames: list[int], f: int, exclude: int | None = None) -> bool:
    return any(abs(e - f) <= CLEAR for e in frames if e != exclude)


def measure(track: Path, shots_file: Path, video: int = 0) -> dict:
    """영상 1개에서 쿠션 반사, 충돌 꺾임, 1적구 이동 거리, 검증용 샷을 모은다."""
    with np.load(track) as t:
        px = t["positions"] * np.array([TABLE_W, TABLE_H])
    shots = json.loads(shots_file.read_text(encoding="utf-8"))["shots"]
    out = {"bounce": {"long": ([], []), "short": ([], [])}, "cut": ([], []), "travel": ([], []), "validate": []}
    for s in shots:
        cue = px[:, BALL_INDEX[s["cue_ball"]]]
        hits, cushions = s["hit_frames"], s["cushion_frames"]
        events = hits + cushions
        # 1) 쿠션 반사
        for c in cushions:
            if events_near(events, c, exclude=c):
                continue
            d_in = direction(cue, c - NEAR - SPAN, c - NEAR)
            d_out = direction(cue, c + NEAR, c + NEAR + SPAN)
            if d_in is None or d_out is None:
                continue
            rail = nearest_rail(cue[c])
            ang = rail_angles(rail, d_in, d_out)
            if ang:
                kind = "long" if rail in ("top", "bottom") else "short"
                out["bounce"][kind][0].append(ang[0])
                out["bounce"][kind][1].append(ang[1])
                out.setdefault("bounce_video", {"long": [], "short": []})[kind].append(video)
        if not hits:
            continue
        # 2) 첫 목적구 충돌: 자르는 각 c(수구 진행 방향과 1적구가 밀려 나간 방향 사이)와 수구 꺾임 δ
        h = hits[0]
        obj = px[:, BALL_INDEX[s["hit_order"][0]]]
        # 충돌 전 구간에 다른 사건이 없어야 들어온 방향을 믿을 수 있다
        if not any(h - CLEAR <= e < h for e in events):
            d_in = direction(cue, h - NEAR - SPAN, h - NEAR)
            # 나간 방향: 충돌 직후의 휘는 구간 대신, 다음 사건(쿠션·두 번째 공)까지의 직선
            later = [e for e in events if e > h + NEAR + 2]
            d_out = direction(cue, h + NEAR, min(later)) if later else None
            d_obj = direction(obj, h - 1, h + NEAR + SPAN)
            if d_in is not None and d_out is not None and d_obj is not None:
                cut = angle_deg(d_in, d_obj)
                if cut < 89:
                    out["cut"][0].append(cut)
                    out["cut"][1].append(angle_deg(d_in, d_out))
                    # 3) 1적구 이동 거리 (샷 끝까지 경로 길이)
                    end = int(s["end_frame"])
                    seg = obj[h : end + 1]
                    travel = float(np.linalg.norm(np.diff(seg, axis=0), axis=1).sum())
                    out["travel"][0].append(1 - math.sin(math.radians(cut)))
                    out["travel"][1].append(travel / TABLE_H)  # 당구대 세로 = 1
        # 4) 검증용: 득점 샷에서 첫 충돌 뒤 실제 출발 방향과 실제 쿠션 접점
        if s.get("result") == "success" and len(s["hit_order"]) == 2 and (s.get("cushions_before_second_hit") or 0) >= 3:
            after = [c for c in cushions if c > h]
            if not after:
                continue
            # 첫 충돌 직후 회전으로 휘는 구간을 피해, 출발점 → 첫 쿠션 접점 직선을 출발 방향으로 쓴다
            chord = cue[after[0]] - cue[h + NEAR]
            if np.linalg.norm(chord) < MIN_MOVE:
                continue
            second = px[s["start_frame"], BALL_INDEX[s["hit_order"][1]]]
            out["validate"].append({
                "video": video,
                "start": cue[h + NEAR].tolist(),
                "dir": unit(chord).tolist(),
                "target": second.tolist(),
                "obstacle": obj[h + NEAR].tolist(),
                "actual_banks": [cue[c].tolist() for c in after[:3]],
            })
    return out


# ── 경로 시뮬레이션 (백엔드 route-geometry.ts와 같은 규칙) ─────────────────────

def bounce_dir(d: np.ndarray, rail: str, law: dict | None) -> np.ndarray:
    """쿠션에서 방향을 바꾼다. law가 없으면 거울 반사"""
    horizontal = rail in ("top", "bottom")
    t, n = (d[0], d[1]) if horizontal else (d[1], d[0])
    if law is None:
        t2, n2 = t, -n
    else:
        kind = "long" if horizontal else "short"
        alpha = math.degrees(math.atan2(abs(t), abs(n)))
        k = law[kind]
        beta = table_beta(alpha, k) if "table" in k else k["a"] * alpha + k["b"]
        beta = max(-80.0, min(85.0, beta))
        speed = math.hypot(t, n)
        t2 = math.copysign(speed * math.sin(math.radians(abs(beta))), t if beta >= 0 else -t)
        n2 = -math.copysign(speed * math.cos(math.radians(beta)), n)
    return np.array([t2, n2]) if horizontal else np.array([n2, t2])


def simulate(start, d, target, obstacle, law, max_len=6000.0):
    """수구를 굴려 (두 번째 목적구에 닿았을 때 쿠션 수, 쿠션 접점들)을 돌려준다. 못 닿으면 (None, 접점)"""
    p, d = np.array(start, float), unit(np.array(d, float))
    target, obstacle = np.array(target, float), np.array(obstacle, float)
    banks, travelled = [], 0.0
    lo, hi = np.array([R, R]), np.array([TABLE_W - R, TABLE_H - R])
    for _ in range(MAX_CUSHIONS + 1):
        # 다음 쿠션까지 거리
        ts = []
        for axis in (0, 1):
            if d[axis] > 1e-9:
                ts.append(((hi[axis] - p[axis]) / d[axis], axis, "right" if axis == 0 else "bottom"))
            elif d[axis] < -1e-9:
                ts.append(((lo[axis] - p[axis]) / d[axis], axis, "left" if axis == 0 else "top"))
        t_wall, _, rail = min(ts)
        # 이 구간에서 두 번째 목적구에 닿는지
        rel = target - p
        along = float(np.dot(rel, d))
        if 0 < along <= t_wall:
            off = float(np.linalg.norm(rel - along * d))
            if off <= 2 * R + HIT_TOLERANCE:
                return len(banks), banks
        travelled += t_wall
        if travelled > max_len:
            break
        p = p + d * t_wall
        banks.append(p.tolist())
        d = unit(bounce_dir(d, rail, law))
    return None, banks


def validate(items: list[dict], law: dict | None) -> dict:
    reproduced, errors = 0, []
    for it in items:
        n, banks = simulate(it["start"], it["dir"], it["target"], it["obstacle"], law)
        if n is not None and n >= 3:
            reproduced += 1
        for pred, actual in zip(banks[:3], it["actual_banks"]):
            errors.append(float(np.linalg.norm(np.array(pred) - np.array(actual))))
    # px → cm: 대대 안쪽 장쿠션 약 284cm
    cm = 284 / TABLE_W
    return {
        "reproduce_rate": round(reproduced / max(len(items), 1), 3),
        "bank_error_cm_median": round(float(np.median(errors)) * cm, 1) if errors else None,
        "n": len(items),
    }


def build_model(measurements: list[dict]) -> dict:
    """전체 데이터로 표를 만들고, 성능 수치는 영상별 교차 검증으로 잰다"""
    bounce = {k: [[], [], []] for k in ("long", "short")}  # α, β, 영상
    cut, travel, items = ([], []), ([], []), []
    for m in measurements:
        for kind in ("long", "short"):
            bounce[kind][0] += m["bounce"][kind][0]
            bounce[kind][1] += m["bounce"][kind][1]
            bounce[kind][2] += m.get("bounce_video", {}).get(kind, [0] * len(m["bounce"][kind][0]))
        for key, dst in (("cut", cut), ("travel", travel)):
            dst[0].extend(m[key][0])
            dst[1].extend(m[key][1])
        items.extend(m["validate"])

    def law_from(videos_out: set[int]) -> dict:
        law = {}
        for kind, (a, b, v) in bounce.items():
            keep = [i for i, vid in enumerate(v) if vid not in videos_out]
            law[kind] = fit_table([a[i] for i in keep], [b[i] for i in keep])
        return law

    videos = sorted({it["video"] for it in items} | {v for k in bounce for v in bounce[k][2]})
    # 쿠션 1회 반사 오차 (교차 검증)
    per_bounce = {"mirror": [], "table": []}
    path = {"mirror": [], "table": []}
    for test in videos:
        law = law_from({test}) if len(videos) > 1 else law_from(set())
        for kind, (a, b, v) in bounce.items():
            for alpha, beta, vid in zip(a, b, v):
                if vid == test:
                    per_bounce["mirror"].append(abs(alpha - beta))
                    per_bounce["table"].append(abs(table_beta(alpha, law[kind]) - beta))
        held = [it for it in items if it["video"] == test]
        path["mirror"].append(validate(held, None))
        path["table"].append(validate(held, law))

    def pool(results: list[dict]) -> dict:
        n = sum(r["n"] for r in results)
        rate = sum(r["reproduce_rate"] * r["n"] for r in results) / max(n, 1)
        errs = [r["bank_error_cm_median"] for r in results if r["bank_error_cm_median"] is not None]
        return {"reproduce_rate": round(rate, 3), "bank_error_cm_median": round(float(np.mean(errs)), 1) if errs else None, "n": n}

    def angle_stats(e: list[float]) -> dict:
        x = np.array(e)
        return {"median_deg": round(float(np.median(x)), 1), "within_5deg": round(float((x < 5).mean()), 2), "within_10deg": round(float((x < 10).mean()), 2), "n": len(x)}

    return {
        "version": 2,
        "generated": date.today().isoformat(),
        "units": "각도는 도, 거리는 당구대 세로 길이 = 1",
        "bounce": law_from(set()),
        "deflection_by_cut": binned_median(*cut, CUT_BINS),
        "deflection_residual_sd": deflection_sd(*cut),
        "object_travel_by_thickness": binned_median(*travel, THICK_BINS, digits=2),
        "validation": {
            "method": "영상별 교차 검증 (한 영상으로 표를 만들고 다른 영상으로 검사)",
            "videos": len(videos),
            "per_bounce": {k: angle_stats(v) for k, v in per_bounce.items()},
            "path": {k: pool(v) for k, v in path.items()},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="실제 영상으로 추천 경로 모델을 보정합니다.")
    parser.add_argument("--tracks", type=Path, default=Path("data/results/tracks"))
    parser.add_argument("--shots", type=Path, default=Path("data/results/shots"))
    parser.add_argument("--out", type=Path, default=Path("data/results/route_model.json"))
    args = parser.parse_args()

    measurements = []
    for i, shots_file in enumerate(sorted(args.shots.glob("*.json"))):
        track = args.tracks / shots_file.stem / "track.npz"
        if track.exists():
            measurements.append(measure(track, shots_file, video=i))
    if not measurements:
        raise SystemExit("궤적과 샷 결과가 있는 영상이 없습니다.")
    model = build_model(measurements)
    args.out.write_text(json.dumps(model, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: model[k] for k in ("bounce", "deflection_by_cut", "object_travel_by_thickness", "validation")}, ensure_ascii=False, indent=1))
    print(f"결과: {args.out}")


if __name__ == "__main__":
    main()
