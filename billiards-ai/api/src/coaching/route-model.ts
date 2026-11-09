// 추천 경로 모델: 실제 영상에서 잰 쿠션 반사·충돌 꺾임·1적구 이동 거리 (analyzer/route_model.py)
// 이 모델로 수구를 굴려 보며 추천 경로를 찾는다 (route-geometry.ts).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFAULT_ROUTE_MODEL } from './route-model.default.js';

export interface BounceLaw {
  table: [number, number][]; // [들어온 각 구간 중심, 나간 각 중앙값] (쿠션 수직선 기준, 도)
  residual_sd: number; // 표에서 벗어나는 정도 (도)
  n: number;
}

export interface Bin {
  lo: number;
  hi: number;
  median: number;
  n: number;
}

interface PathValidation {
  reproduce_rate: number;
  bank_error_cm_median: number | null;
  n: number;
}

export interface RouteModel {
  version: number;
  generated: string;
  bounce: { long: BounceLaw; short: BounceLaw };
  deflection_by_cut: Bin[]; // 자르는 각(도) → 수구 꺾임 각(도)
  deflection_residual_sd: number;
  object_travel_by_thickness: Bin[]; // 두께(0~1) → 1적구 이동 거리(당구대 세로 = 1)
  validation: {
    method: string;
    videos: number;
    per_bounce: Record<
      string,
      {
        median_deg: number;
        within_5deg: number;
        within_10deg: number;
        n: number;
      }
    >;
    path: { mirror: PathValidation; table: PathValidation };
  };
}

/** 구간 표를 직선 보간한다. 표 바깥은 끝 값 */
export function interp(x: number, xs: number[], ys: number[]): number {
  if (xs.length === 0) return x;
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

/** 쿠션에 α로 들어온 공이 나가는 각 β (실측 표) */
export function bounceAngle(law: BounceLaw, alpha: number): number {
  return interp(
    alpha,
    law.table.map((t) => t[0]),
    law.table.map((t) => t[1]),
  );
}

/** 표본이 적은(7개 미만) 구간은 빼고 보간 */
function binsCurve(bins: Bin[], minN = 7) {
  const ok = bins.filter((b) => b.n >= minN);
  const use = ok.length >= 2 ? ok : bins;
  return {
    xs: use.map((b) => (b.lo + b.hi) / 2),
    ys: use.map((b) => b.median),
  };
}

/** 자르는 각(도, 0 = 정면) → 수구가 꺾이는 각(도). 실측 중앙값이라 선수들이 평소 쓰는 회전이 섞여 있다 */
export function deflectionForCut(model: RouteModel, cutDeg: number): number {
  const { xs, ys } = binsCurve(model.deflection_by_cut);
  return interp(cutDeg, xs, ys);
}

/** 두께(0~1) → 1적구가 굴러가는 거리 (당구대 세로 = 1) */
export function objectTravel(model: RouteModel, thickness: number): number {
  const { xs, ys } = binsCurve(model.object_travel_by_thickness, 5);
  return interp(thickness, xs, ys);
}

function isModel(v: unknown): v is RouteModel {
  const m = v as RouteModel;
  return (
    !!m &&
    Array.isArray(m.bounce?.long?.table) &&
    Array.isArray(m.bounce?.short?.table) &&
    m.bounce.long.table.length >= 2 &&
    m.bounce.short.table.length >= 2 &&
    Array.isArray(m.deflection_by_cut) &&
    Array.isArray(m.object_travel_by_thickness) &&
    typeof m.validation?.path?.table?.reproduce_rate === 'number'
  );
}

let cached: RouteModel | null = null;

/** data/results/route_model.json(다시 측정한 값)이 있으면 그것, 없거나 형식이 다르면 기본값 */
export function loadRouteModel(): RouteModel {
  if (cached) return cached;
  const file = join(
    resolve(process.env.PROJECT_ROOT ?? '..'),
    'data/results/route_model.json',
  );
  try {
    if (existsSync(file)) {
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (isModel(parsed)) {
        cached = {
          ...parsed,
          deflection_residual_sd: parsed.deflection_residual_sd ?? 0,
        };
        return cached;
      }
    }
  } catch {
    // 읽을 수 없으면 기본값
  }
  cached = DEFAULT_ROUTE_MODEL;
  return cached;
}

/** 시험용: 캐시를 비운다 */
export function resetRouteModelCache() {
  cached = null;
}
