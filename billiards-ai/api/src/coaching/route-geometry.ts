// 추천 경로 계산: 샷 시작 배치에서 실측 모델(route-model.ts)로 수구를 굴려 보며 득점 경로를 찾는다.
//
// 1) 첫 목적구를 맞히는 두께(자르는 각)를 0.5°씩 바꿔 가며
// 2) 충돌 뒤 꺾임(실측 중앙값)과 쿠션 반사(실측 표)로 수구를 굴려
// 3) 쿠션 3회 이상 뒤 두 번째 목적구에 닿는 두께 범위(허용 폭)를 모은다.
// 4) 허용 폭 안에서 겨냥·쿠션 오차를 무작위로 넣어 다시 굴려 기대 성공률을 구한다(몬테카를로).
// 5) 1적구가 멈출 곳을 추정해 다음 배치가 좋은지 본다(참고).
//
// 회전량·속도를 직접 다루지 않고, 선수들이 평소 쓰는 회전이 섞인 실측 중앙값을 쓴다.
// 그래서 결과는 "이 당구대에서 보통 이렇게 굴러간다"는 권장값이며 실제 회전·힘의 판정이 아니다.
import type { BallName, Point } from '../trajectory/trajectory.js';
import type {
  CoachingLevel,
  RailKind,
  Strength,
  Thickness,
} from './coaching.types.js';
import {
  bounceAngle,
  deflectionForCut,
  objectTravel,
  type RouteModel,
} from './route-model.js';

// 당구대 안쪽 1480×740px, 공 반지름 18px (analyzer/calibrate.py, detect.py)
const W = 1480;
const H = 740;
const R = 18;
const PX_TO_M = 2.84 / W; // 대대 안쪽 장쿠션 약 2.84m
const HIT_TOL = R; // 두 번째 목적구 판정 여유 (analyzer/route_model.py와 같음)
const MAX_LEN = 6000; // 수구가 굴러갈 최대 거리(px, 장쿠션 약 4배)
const MAX_CUSHIONS = 6;
const CUT_STEP = 0.5;
const MAX_CUT = 80;
const SAMPLES = 160;
const ALT_MAX_CUSHIONS = 5; // 비교 후보의 최대 쿠션 수 (두 번째 목적구 전)

/** 실행 오차 가정 (표준편차, 도). 측정값이 아니라 난이도별 가정이다 */
export const EXECUTION_SD: Record<
  CoachingLevel,
  { aim: number; deflection: number }
> = {
  beginner: { aim: 3.0, deflection: 6.0 },
  intermediate: { aim: 2.0, deflection: 4.0 },
  advanced: { aim: 1.2, deflection: 2.5 },
};

export type Rail = 'top' | 'bottom' | 'left' | 'right';
export const RAIL_KIND: Record<Rail, RailKind> = {
  top: 'long',
  bottom: 'long',
  left: 'short',
  right: 'short',
};

type V = [number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
const len = (a: V) => Math.hypot(a[0], a[1]);
const unit = (a: V): V => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l] : a;
};
const rot = (a: V, deg: number): V => {
  const r = (deg * Math.PI) / 180;
  return [
    a[0] * Math.cos(r) - a[1] * Math.sin(r),
    a[0] * Math.sin(r) + a[1] * Math.cos(r),
  ];
};
const toPx = ([x, y]: Point): V => [x * W, y * H];
const toNorm = ([x, y]: V): Point => [round(x / W), round(y / H)];
const round = (n: number) => Math.round(n * 10000) / 10000;

/** 결정적 난수 (같은 배치면 같은 결과) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(r(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** 쿠션에서 방향 바꾸기. law가 null이면 거울 반사. noise는 나간 각에 더할 오차(도) */
export function bounce(
  d: V,
  rail: Rail,
  model: RouteModel | null,
  noise = 0,
): V {
  const horizontal = rail === 'top' || rail === 'bottom';
  const t = horizontal ? d[0] : d[1];
  const n = horizontal ? d[1] : d[0];
  let t2: number;
  let n2: number;
  if (!model) {
    t2 = t;
    n2 = -n;
  } else {
    const alpha = (Math.atan2(Math.abs(t), Math.abs(n)) * 180) / Math.PI;
    const law = horizontal ? model.bounce.long : model.bounce.short;
    const beta = Math.max(-80, Math.min(85, bounceAngle(law, alpha) + noise));
    const b = (Math.abs(beta) * Math.PI) / 180;
    const sign = beta >= 0 ? Math.sign(t) || 1 : -(Math.sign(t) || 1);
    t2 = sign * Math.sin(b);
    n2 = -Math.sign(n) * Math.cos((beta * Math.PI) / 180);
  }
  return horizontal ? [t2, n2] : [n2, t2];
}

export interface SimResult {
  cushionsBeforeHit: number | null; // 두 번째 목적구에 닿기 전 쿠션 수 (못 닿으면 null)
  rails: Rail[];
  banks: V[];
  hitPoint: V | null;
  length: number;
}

/** 수구를 start에서 d 방향으로 굴린다. 실측 표(model) 또는 거울 반사(null) */
export function simulate(
  start: V,
  dir: V,
  target: V,
  model: RouteModel | null,
  noise?: () => number,
): SimResult {
  let p = start;
  let d = unit(dir);
  const rails: Rail[] = [];
  const banks: V[] = [];
  let travelled = 0;
  for (let i = 0; i <= MAX_CUSHIONS; i++) {
    let tWall = Infinity;
    let rail: Rail = 'top';
    if (d[0] > 1e-9) [tWall, rail] = [(W - R - p[0]) / d[0], 'right'];
    else if (d[0] < -1e-9) [tWall, rail] = [(R - p[0]) / d[0], 'left'];
    if (d[1] > 1e-9) {
      const t = (H - R - p[1]) / d[1];
      if (t < tWall) [tWall, rail] = [t, 'bottom'];
    } else if (d[1] < -1e-9) {
      const t = (R - p[1]) / d[1];
      if (t < tWall) [tWall, rail] = [t, 'top'];
    }
    // 이 구간에서 두 번째 목적구에 닿는지
    const rel = sub(target, p);
    const along = dot(rel, d);
    if (
      along > 0 &&
      along <= tWall &&
      len(sub(rel, mul(d, along))) <= 2 * R + HIT_TOL
    ) {
      return {
        cushionsBeforeHit: rails.length,
        rails,
        banks,
        hitPoint: add(p, mul(d, along)),
        length: travelled + along,
      };
    }
    travelled += tWall;
    if (travelled > MAX_LEN || !Number.isFinite(tWall)) break;
    p = add(p, mul(d, tWall));
    banks.push(p);
    rails.push(rail);
    d = unit(bounce(d, rail, model, noise ? noise() : 0));
  }
  return {
    cushionsBeforeHit: null,
    rails,
    banks,
    hitPoint: null,
    length: travelled,
  };
}

/** 두께(자르는 각) 하나로 친 결과 */
interface Shot {
  cut: number; // 부호 있음: + = 1적구가 왼쪽(반시계)으로 밀려 남
  ghost: V; // 수구가 1적구에 닿는 순간 수구 중심
  objectDir: V; // 1적구가 밀려 나가는 방향
  departure: V; // 충돌 뒤 수구 방향
  sim: SimResult;
}

/** 수구 C가 1적구 O를 자르는 각 cut으로 칠 때 (공 지름만큼 앞의 '가상 공' 위치를 반복해서 맞춘다) */
function strike(
  C: V,
  O: V,
  target: V,
  cut: number,
  model: RouteModel,
  noise?: { deflection: number; bounce: () => number },
): Shot {
  let d = unit(sub(O, C));
  let n = rot(d, cut);
  let G = sub(O, mul(n, 2 * R));
  for (let i = 0; i < 3; i++) {
    d = unit(sub(G, C));
    n = rot(d, cut);
    G = sub(O, mul(n, 2 * R));
  }
  const defl =
    deflectionForCut(model, Math.abs(cut)) + (noise?.deflection ?? 0);
  // 수구는 1적구가 밀려 나간 반대쪽으로 꺾인다
  const departure = rot(d, -Math.sign(cut || 1) * defl);
  return {
    cut,
    ghost: G,
    objectDir: n,
    departure,
    sim: simulate(G, departure, target, model, noise?.bounce),
  };
}

/** 수구 → 가상 공 직선이 다른 공에 막히는지 */
function blocked(C: V, G: V, other: V): boolean {
  const d = unit(sub(G, C));
  const along = dot(sub(other, C), d);
  if (along <= 0 || along >= len(sub(G, C))) return false;
  return len(sub(sub(other, C), mul(d, along))) < 2 * R;
}

/** 꺾이는 방향의 합으로 화면 기준 진행 방향을 정한다 (y는 아래로) */
export function turnDirection(
  points: Point[],
): 'clockwise' | 'counterclockwise' | null {
  let sum = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const d1 = [(b[0] - a[0]) * 2, b[1] - a[1]];
    const d2 = [(c[0] - b[0]) * 2, c[1] - b[1]];
    sum += Math.sign(d1[0] * d2[1] - d1[1] * d2[0]);
  }
  if (sum === 0) return null;
  return sum > 0 ? 'clockwise' : 'counterclockwise';
}

/** 두께 비율(0~1) → 표시 단계 */
export function thicknessBucket(f: number): Thickness {
  if (f < 0.375) return '1/4';
  if (f < 0.625) return '1/2';
  if (f < 0.875) return '3/4';
  return 'full';
}

/** 경로 길이(장쿠션 길이 배수)로 권장 강약을 정하는 규칙 */
export function strengthForLength(lengthPx: number): Strength {
  const lengths = lengthPx / W;
  if (lengths < 2.8) return 'soft';
  if (lengths < 4) return 'medium';
  return 'firm';
}

export interface NextLayout {
  cueEnd: Point;
  objectBallEnd: Point;
  secondBall: Point;
  spreadM: number; // 세 공 사이 가장 먼 거리 (m)
  rating: 'good' | 'normal' | 'hard';
}

/** 1적구가 실측 이동 거리만큼 거울 반사로 굴러간 곳 (참고용 추정) */
function objectEnd(O: V, dir: V, thickness: number, model: RouteModel): V {
  let remaining = objectTravel(model, thickness) * H;
  let p = O;
  let d = unit(dir);
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const tx =
      d[0] > 0
        ? (W - R - p[0]) / d[0]
        : d[0] < 0
          ? (R - p[0]) / d[0]
          : Infinity;
    const ty =
      d[1] > 0
        ? (H - R - p[1]) / d[1]
        : d[1] < 0
          ? (R - p[1]) / d[1]
          : Infinity;
    const t = Math.min(tx, ty);
    if (t >= remaining) return add(p, mul(d, remaining));
    p = add(p, mul(d, t));
    remaining -= t;
    d = tx < ty ? [-d[0], d[1]] : [d[0], -d[1]];
  }
  return p;
}

export interface PlannedRoute {
  points: Point[]; // 수구, 첫 목적구 접점(가상 공), 쿠션 접점들, 두 번째 목적구 접점
  rails: Rail[];
  firstObjectBall: BallName;
  secondObjectBall: BallName;
  cutDeg: number; // 자르는 각 (0 = 정면)
  deflectionDeg: number;
  thickness: Thickness;
  thicknessFraction: number;
  windowDeg: number; // 득점이 되는 자르는 각 허용 폭
  direction: 'clockwise' | 'counterclockwise' | null;
  lengthPx: number;
  strength: Strength;
  expectedSuccess: number; // 0~1, 실행 오차 가정을 넣은 몬테카를로
  nextLayout: NextLayout;
}

interface Window {
  first: BallName;
  second: BallName;
  rails: Rail[];
  shots: Shot[];
}

/** 모든 첫 목적구 × 두께를 굴려 득점 구간(같은 쿠션 순서로 이어진 두께 범위)을 모은다 */
function scoringWindows(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  model: RouteModel,
): Window[] {
  const C = toPx(layout[cueBall]);
  const objects = (['white', 'yellow', 'red'] as BallName[]).filter(
    (b) => b !== cueBall,
  );
  const windows: Window[] = [];
  for (const first of objects) {
    const second = objects.find((b) => b !== first)!;
    const O = toPx(layout[first]);
    const T = toPx(layout[second]);
    let current: Window | null = null;
    for (let cut = -MAX_CUT; cut <= MAX_CUT; cut += CUT_STEP) {
      const s = strike(C, O, T, cut, model);
      const ok =
        s.sim.cushionsBeforeHit !== null &&
        s.sim.cushionsBeforeHit >= 3 &&
        !blocked(C, s.ghost, T);
      const key = ok ? s.sim.rails.join(',') : null;
      if (ok && current && current.rails.join(',') === key) {
        current.shots.push(s);
      } else {
        if (current) windows.push(current);
        current = ok ? { first, second, rails: s.sim.rails, shots: [s] } : null;
      }
    }
    if (current) windows.push(current);
  }
  return windows;
}

/** 허용 폭 가운데를 겨냥했을 때, 실행 오차를 넣고 다시 굴려 성공 비율을 센다 */
function expectedSuccess(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  w: Window,
  aim: number,
  model: RouteModel,
  level: CoachingLevel,
): number {
  const C = toPx(layout[cueBall]);
  const O = toPx(layout[w.first]);
  const T = toPx(layout[w.second]);
  const sd = EXECUTION_SD[level];
  const seed = Math.round((C[0] + O[0] * 3 + T[1] * 7 + aim * 11) * 1000);
  const r = rng(seed);
  let ok = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const s = strike(C, O, T, aim + gauss(r) * sd.aim, model, {
      deflection: gauss(r) * sd.deflection,
      bounce: () =>
        (gauss(r) *
          (model.bounce.long.residual_sd + model.bounce.short.residual_sd)) /
        2,
    });
    if (s.sim.cushionsBeforeHit !== null && s.sim.cushionsBeforeHit >= 3)
      ok += 1;
  }
  return Math.round((ok / SAMPLES) * 100) / 100;
}

function toPlan(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  w: Window,
  model: RouteModel,
  level: CoachingLevel,
): PlannedRoute {
  const mid = w.shots[Math.floor(w.shots.length / 2)];
  const C = toPx(layout[cueBall]);
  const f = 1 - Math.sin((Math.abs(mid.cut) * Math.PI) / 180);
  const points = [C, mid.ghost, ...mid.sim.banks, mid.sim.hitPoint!].map(
    toNorm,
  );
  const O = toPx(layout[w.first]);
  const obEnd = objectEnd(O, mid.objectDir, f, model);
  const cueEnd = mid.sim.hitPoint!;
  const T = toPx(layout[w.second]);
  const spread =
    Math.max(len(sub(obEnd, cueEnd)), len(sub(obEnd, T)), len(sub(cueEnd, T))) *
    PX_TO_M;
  return {
    points,
    rails: w.rails,
    firstObjectBall: w.first,
    secondObjectBall: w.second,
    cutDeg: Math.round(Math.abs(mid.cut) * 10) / 10,
    deflectionDeg: Math.round(deflectionForCut(model, Math.abs(mid.cut))),
    thickness: thicknessBucket(f),
    thicknessFraction: Math.round(f * 100) / 100,
    windowDeg: Math.round(w.shots.length * CUT_STEP * 10) / 10,
    direction: turnDirection(points),
    lengthPx: Math.round(mid.sim.length),
    strength: strengthForLength(mid.sim.length),
    expectedSuccess: expectedSuccess(layout, cueBall, w, mid.cut, model, level),
    nextLayout: {
      cueEnd: toNorm(cueEnd),
      objectBallEnd: toNorm(obEnd),
      secondBall: layout[w.second],
      spreadM: Math.round(spread * 100) / 100,
      rating: spread < 0.9 ? 'good' : spread < 1.5 ? 'normal' : 'hard',
    },
  };
}

/** 쿠션 순서가 order(장·단)로 시작하는지 */
function matchesOrder(rails: Rail[], order: RailKind[]): boolean {
  return order.every(
    (k, i) => rails[i] !== undefined && RAIL_KIND[rails[i]] === k,
  );
}

/** 기대 성공률이 가장 높은 구간 (같으면 허용 폭이 넓은 것) */
function best(windows: Window[], score: (w: Window) => number): Window | null {
  let top: Window | null = null;
  let topScore = -1;
  for (const w of windows) {
    const s = score(w);
    if (
      s > topScore ||
      (s === topScore && top && w.shots.length > top.shots.length)
    ) {
      top = w;
      topScore = s;
    }
  }
  return top;
}

/**
 * 쿠션 순서(order)에 맞는 경로 하나. order가 비면 아무 순서나.
 * 허용 폭이 넓은 상위 몇 개만 몬테카를로로 평가해 계산량을 줄인다.
 */
export function planRoute(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  order: RailKind[],
  model: RouteModel,
  level: CoachingLevel = 'beginner',
  maxCushionsOverride?: number,
): PlannedRoute | null {
  // 순서가 정해진 경로는 쿠션 수를 그 순서 + 1까지만 (초급의 "단순한 기본 경로" 원칙)
  const maxCushions =
    maxCushionsOverride ?? (order.length ? order.length + 1 : ALT_MAX_CUSHIONS);
  const ws = scoringWindows(layout, cueBall, model).filter(
    (w) =>
      w.rails.length <= maxCushions &&
      (order.length === 0 || matchesOrder(w.rails, order)),
  );
  if (!ws.length) return null;
  const top = [...ws]
    .sort((a, b) => b.shots.length - a.shots.length)
    .slice(0, 4);
  const chosen = best(top, (w) => {
    const mid = w.shots[Math.floor(w.shots.length / 2)];
    return expectedSuccess(layout, cueBall, w, mid.cut, model, level);
  });
  return chosen ? toPlan(layout, cueBall, chosen, model, level) : null;
}

/**
 * 고급 비교용: 서로 다른 (첫 목적구 × 쿠션 순서) 후보를 기대 성공률 순으로 count개.
 */
export function planAlternatives(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  model: RouteModel,
  level: CoachingLevel,
  count = 3,
): PlannedRoute[] {
  const ws = scoringWindows(layout, cueBall, model).filter(
    (w) => w.rails.length <= ALT_MAX_CUSHIONS,
  );
  // 같은 첫 목적구 + 같은 쿠션 순서(장·단)는 하나로 (가장 넓은 구간)
  const byKey = new Map<string, Window>();
  for (const w of ws) {
    const key = `${w.first}:${w.rails.map((r) => RAIL_KIND[r]).join('-')}:${w.rails[0]}`;
    const prev = byKey.get(key);
    if (!prev || w.shots.length > prev.shots.length) byKey.set(key, w);
  }
  const candidates = [...byKey.values()]
    .sort((a, b) => b.shots.length - a.shots.length)
    .slice(0, 8)
    .map((w) => toPlan(layout, cueBall, w, model, level));
  return candidates
    .sort(
      (a, b) =>
        b.expectedSuccess - a.expectedSuccess || b.windowDeg - a.windowDeg,
    )
    .slice(0, count);
}

export { simulate as simulateCue, PX_TO_M };
