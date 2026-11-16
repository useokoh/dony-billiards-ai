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
const SAMPLES = 400; // 기대 성공률 시뮬레이션 횟수 (표준오차 약 ±2.5%p)
const DIR_STEP = 0.5; // 방향 허용 폭을 잴 간격(도)
const DIR_MAX = 20;
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

const END_SPEED = 3; // 두 번째 목적구에 닿을 때 남아 있어야 할 속도 (px/프레임, 약 0.17m/s)
const FPS = 30; // 측정한 영상의 프레임 수

/**
 * 필요한 수구 출발 속도(px/프레임): 두 번째 목적구에 닿을 때 END_SPEED가 남도록, 경로를 거꾸로 따라가며
 * 구간마다 감속(v² += 2·감속·거리)과 쿠션마다 속도 손실(÷ 유지율)을 되돌린다. 실측 운동 값이 없으면 null
 */
export function requiredSpeed(
  segmentLengths: number[],
  model: RouteModel,
): number | null {
  const k = model.kinematics;
  if (!k || !(k.decel > 0) || !(k.retention > 0)) return null;
  let v = END_SPEED;
  for (let i = segmentLengths.length - 1; i >= 0; i--) {
    v = Math.sqrt(v * v + 2 * k.decel * segmentLengths[i]);
    if (i > 0) v /= k.retention; // 구간 사이마다 쿠션 하나
  }
  return v;
}

/**
 * 필요한 출발 속도를 "실제 샷들이 실제로 필요로 했던 속도"(같은 공식으로 계산) 분포의 하위·상위 1/3 지점과 비교해
 * 세기를 정한다. 같은 계산법끼리 비교하므로 감속·쿠션 손실 추정의 치우침이 상쇄된다.
 */
export function strengthForSpeed(speed: number, model: RouteModel): Strength {
  const k = model.kinematics!;
  const [q33, q67] = k.required_speed_quantiles ?? k.cue_speed_quantiles;
  if (speed < q33) return 'soft';
  if (speed < q67) return 'medium';
  return 'firm';
}

/** px/프레임 → m/s */
export const speedToMps = (v: number) =>
  Math.round(v * PX_TO_M * FPS * 10) / 10;

/** (예비) 실측 운동 값이 없을 때: 경로 길이(장쿠션 길이 배수)로 권장 강약을 정하는 규칙 */
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

/** 1적구가 실측 이동 거리만큼 거울 반사로 굴러간 길 (꺾이는 점들, 마지막이 예상 정지 위치. 참고용 추정) */
function objectPath(O: V, dir: V, thickness: number, model: RouteModel): V[] {
  let remaining = objectTravel(model, thickness) * H;
  let p = O;
  let d = unit(dir);
  const path: V[] = [O];
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
    if (t >= remaining) {
      path.push(add(p, mul(d, remaining)));
      return path;
    }
    p = add(p, mul(d, t));
    path.push(p);
    remaining -= t;
    d = tx < ty ? [-d[0], d[1]] : [d[0], -d[1]];
  }
  return path;
}

export interface PlannedRoute {
  points: Point[]; // 수구, 첫 목적구 접점(가상 공), 쿠션 접점들, 두 번째 목적구 접점
  rails: Rail[];
  firstObjectBall: BallName;
  secondObjectBall: BallName;
  cutDeg: number; // 자르는 각 (0 = 정면)
  /** 치는 사람이 볼 때 1적구의 어느 쪽을 맞히는지 (화면 기준 시계 방향으로 밀리면 왼쪽) */
  contactSide: 'left' | 'right';
  deflectionDeg: number;
  thickness: Thickness;
  thicknessFraction: number;
  windowDeg: number; // 득점이 되는 자르는 각 허용 폭
  directionWindowDeg: number; // 충돌 뒤 수구 방향 허용 폭 (쉬움의 기준)
  direction: 'clockwise' | 'counterclockwise' | null;
  lengthPx: number;
  strength: Strength;
  /** 필요한 수구 출발 속도 (m/s). 실측 운동 값이 없으면 null */
  cueSpeedMps: number | null;
  objectPath: Point[]; // 1적구 예상 진행선 (참고)
  expectedSuccess: number; // 0~1, 요청 난이도의 실행 오차 가정을 넣은 몬테카를로
  /** 0~1, 초급 실행 오차로 잰 성공률. 난이도와 상관없는 공통 "쉬움" 지수 (경로끼리 공정하게 비교) */
  referenceSuccess: number;
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
  // 같은 샷의 모든 후보에 같은 난수열을 쓴다 (짝지은 비교: 후보 사이 차이의 잡음이 줄어든다)
  const seed = Math.round(
    (toPx(layout.white)[0] +
      toPx(layout.yellow)[1] * 3 +
      toPx(layout.red)[0] * 7) *
      1000,
  );
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

/**
 * 방향 허용 폭: 겨냥한 두께 그대로, 충돌 뒤 수구 방향만 ±로 틀었을 때 득점이 유지되는 범위(도).
 * 실측상 꺾임 각은 두께에 둔감해서, 쉬움을 가르는 것은 두께 폭보다 이 값이다.
 */
function directionWindow(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  w: Window,
  cut: number,
  model: RouteModel,
): number {
  const C = toPx(layout[cueBall]);
  const O = toPx(layout[w.first]);
  const T = toPx(layout[w.second]);
  const scores = (off: number) => {
    const s = strike(C, O, T, cut, model, { deflection: off, bounce: () => 0 });
    return s.sim.cushionsBeforeHit !== null && s.sim.cushionsBeforeHit >= 3;
  };
  let width = 0;
  for (const sign of [1, -1]) {
    for (let off = DIR_STEP; off <= DIR_MAX; off += DIR_STEP) {
      if (!scores(sign * off)) break;
      width += DIR_STEP;
    }
  }
  return scores(0) ? width + DIR_STEP : 0;
}

function toPlan(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  w: Window,
  model: RouteModel,
  level: CoachingLevel,
  aim: Shot = w.shots[Math.floor(w.shots.length / 2)], // 겨냥할 두께 (기본: 허용 폭 가운데)
): PlannedRoute {
  const mid = aim;
  const C = toPx(layout[cueBall]);
  const f = 1 - Math.sin((Math.abs(mid.cut) * Math.PI) / 180);
  const points = [C, mid.ghost, ...mid.sim.banks, mid.sim.hitPoint!].map(
    toNorm,
  );
  const O = toPx(layout[w.first]);
  const obPath = objectPath(O, mid.objectDir, f, model);
  const obEnd = obPath[obPath.length - 1];
  const cueEnd = mid.sim.hitPoint!;
  const T = toPx(layout[w.second]);
  const spread =
    Math.max(len(sub(obEnd, cueEnd)), len(sub(obEnd, T)), len(sub(cueEnd, T))) *
    PX_TO_M;
  // 구간 길이: 가상 공 → 쿠션 접점들 → 두 번째 목적구 접점
  const cuePts = [mid.ghost, ...mid.sim.banks, mid.sim.hitPoint!];
  const segs = cuePts.slice(1).map((p, k) => len(sub(p, cuePts[k])));
  const speed = requiredSpeed(segs, model);
  const expected = expectedSuccess(layout, cueBall, w, mid.cut, model, level);
  const reference =
    level === 'beginner'
      ? expected
      : expectedSuccess(layout, cueBall, w, mid.cut, model, 'beginner');
  return {
    points,
    rails: w.rails,
    firstObjectBall: w.first,
    secondObjectBall: w.second,
    cutDeg: Math.round(Math.abs(mid.cut) * 10) / 10,
    // 1적구가 진행 방향 오른쪽(화면 시계 방향)으로 밀려 나가려면 수구가 1적구의 왼쪽을 맞혀야 한다
    contactSide: mid.cut > 0 ? 'left' : 'right',
    deflectionDeg: Math.round(deflectionForCut(model, Math.abs(mid.cut))),
    thickness: thicknessBucket(f),
    thicknessFraction: Math.round(f * 100) / 100,
    windowDeg: Math.round(w.shots.length * CUT_STEP * 10) / 10,
    directionWindowDeg: directionWindow(layout, cueBall, w, mid.cut, model),
    direction: turnDirection(points),
    lengthPx: Math.round(mid.sim.length),
    strength:
      speed !== null
        ? strengthForSpeed(speed, model)
        : strengthForLength(mid.sim.length),
    cueSpeedMps: speed !== null ? speedToMps(speed) : null,
    expectedSuccess: expected,
    referenceSuccess: reference,
    objectPath: obPath.map(toNorm),
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

/** 첫 목적구 + 쿠션 순서(장·단)가 같으면 같은 경로로 본다 */
export function routeKey(
  p: Pick<PlannedRoute, 'firstObjectBall' | 'rails'>,
): string {
  return `${p.firstObjectBall}:${p.rails.map((r) => RAIL_KIND[r]).join('-')}`;
}

/**
 * 후보 모음: 서로 다른 (첫 목적구 × 쿠션 순서) 경로를, 요청 난이도의 실행 오차로 평가해 기대 성공률 순으로.
 * 모든 난이도가 같은 모음에서 고른다 (난이도마다 고르는 기준만 다르다).
 */
export function candidatePlans(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  model: RouteModel,
  level: CoachingLevel,
  maxCushions = ALT_MAX_CUSHIONS,
  limit = 10,
): PlannedRoute[] {
  const ws = scoringWindows(layout, cueBall, model).filter(
    (w) => w.rails.length <= maxCushions,
  );
  const byKey = new Map<string, Window>();
  for (const w of ws) {
    const key = routeKey({ firstObjectBall: w.first, rails: w.rails });
    const prev = byKey.get(key);
    if (!prev || w.shots.length > prev.shots.length) byKey.set(key, w);
  }
  return [...byKey.values()]
    .sort((a, b) => b.shots.length - a.shots.length)
    .slice(0, limit)
    .map((w) => toPlan(layout, cueBall, w, model, level))
    .sort(
      (a, b) =>
        b.expectedSuccess - a.expectedSuccess ||
        b.directionWindowDeg - a.directionWindowDeg ||
        a.rails.length - b.rails.length,
    );
}

/** 고급 비교용: 후보 모음의 앞에서 count개 */
export function planAlternatives(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  model: RouteModel,
  level: CoachingLevel,
  count = 3,
): PlannedRoute[] {
  return candidatePlans(layout, cueBall, model, level).slice(0, count);
}

/**
 * 내가 친 경로 교정: 실제로 친 첫 목적구·쿠션 순서·맞힌 쪽은 그대로 두고, 득점이 되는 두께 중
 * 실제 두께에 가장 가까운 것을 찾는다. 허용 폭 가장자리는 조금만 어긋나도 실패하므로
 * 폭이 넉넉하면 바깥 1/4은 빼고 고른다. 같은 경로로 득점이 안 되면 null.
 */
export function planCorrection(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  first: BallName,
  playedRails: Rail[],
  playedCut: number,
  model: RouteModel,
  level: CoachingLevel,
  edgeMargin = 0.25, // 허용 폭 양쪽에서 빼고 고를 비율 (0 = 가장자리까지)
): PlannedRoute | null {
  // 같은 경로 = 첫 목적구가 같고, 친 쿠션 순서의 앞 두 개(친 만큼)가 같다
  const prefix = playedRails.slice(0, 2);
  let chosen: { w: Window; shot: Shot; gap: number } | null = null;
  for (const w of scoringWindows(layout, cueBall, model)) {
    if (w.first !== first || !prefix.every((r, i) => w.rails[i] === r))
      continue;
    const n = w.shots.length;
    const cut = n >= 4 ? Math.floor(n * edgeMargin) : 0;
    const inner = w.shots.slice(cut, n - cut);
    for (const shot of inner) {
      // 1적구의 반대쪽을 맞히는 것은 다른 경로다
      if (
        Math.abs(playedCut) >= 1 &&
        Math.sign(shot.cut) !== Math.sign(playedCut)
      )
        continue;
      const gap = Math.abs(shot.cut - playedCut);
      if (!chosen || gap < chosen.gap) chosen = { w, shot, gap };
    }
  }
  return chosen
    ? toPlan(layout, cueBall, chosen.w, model, level, chosen.shot)
    : null;
}

export { matchesOrder };
export { simulate as simulateCue, PX_TO_M };
