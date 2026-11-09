// 샷 시작 배치로 추천 경로 좌표를 계산한다 (거울 반사 방법, 무회전·이상적인 반사 가정)
//
// 경로 모양: 수구 → 첫 목적구(접촉) → 쿠션 1 → 쿠션 2 → 쿠션 3 → 두 번째 목적구
// 쿠션에서 들어온 각 = 나간 각이라고 보고, 두 번째 목적구를 쿠션 기준으로 차례로 접어 펴서 직선으로 잇는다.
// 실제 공은 회전·속도·쿠션 탄성 때문에 이 선에서 벗어나므로, 결과는 "참고용 기하 경로"다.
import type { BallName, Point } from '../trajectory/trajectory.js';
import type { RailKind, Thickness } from './coaching.types.js';

// 당구대 안쪽 1480×740px, 공 반지름 18px (analyzer/calibrate.py, detect.py)
const TABLE_W = 1480;
const TABLE_H = 740;
const RX = 18 / TABLE_W; // 공 중심이 닿을 수 있는 쿠션 위치 (0~1 좌표)
const RY = 18 / TABLE_H;
/** 첫 목적구에 맞은 뒤 수구가 꺾일 수 있는 최대 각 (도). 그보다 크면 끌어치기 등 특수 기술이 필요 */
const MAX_DEFLECTION = 80;

export type Rail = 'top' | 'bottom' | 'left' | 'right';
const RAIL_KIND: Record<Rail, RailKind> = {
  top: 'long',
  bottom: 'long',
  left: 'short',
  right: 'short',
};

function reflect([x, y]: Point, rail: Rail): Point {
  switch (rail) {
    case 'top':
      return [x, 2 * RY - y];
    case 'bottom':
      return [x, 2 * (1 - RY) - y];
    case 'left':
      return [2 * RX - x, y];
    case 'right':
      return [2 * (1 - RX) - x, y];
  }
}

/** 실제 길이 비율로 거리 (가로가 세로의 2배) */
export function distance(a: Point, b: Point): number {
  return Math.hypot((a[0] - b[0]) * 2, a[1] - b[1]);
}

/** a→b 직선이 쿠션 선과 만나는 점. 구간 안(0<t≤1)이고 쿠션 길이 안이어야 한다 */
function hitRail(a: Point, b: Point, rail: Rail): Point | null {
  const horizontal = rail === 'top' || rail === 'bottom';
  const line = { top: RY, bottom: 1 - RY, left: RX, right: 1 - RX }[rail];
  const [ai, bi] = horizontal ? [a[1], b[1]] : [a[0], b[0]];
  if (bi === ai) return null;
  const t = (line - ai) / (bi - ai);
  if (t <= 1e-6 || t > 1) return null;
  const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const other = horizontal ? p[0] : p[1];
  const [lo, hi] = horizontal ? [RX, 1 - RX] : [RY, 1 - RY];
  return other >= lo && other <= hi ? p : null;
}

/** start에서 rails 순서로 반사해 target에 닿는 쿠션 접점들. 불가능하면 null */
export function bankPoints(
  start: Point,
  target: Point,
  rails: Rail[],
): Point[] | null {
  let image = target;
  for (const r of [...rails].reverse()) image = reflect(image, r);
  const points: Point[] = [];
  let current = start;
  for (const r of rails) {
    const p = hitRail(current, image, r);
    if (!p) return null;
    points.push(p);
    current = p;
    image = reflect(image, r);
  }
  return points;
}

/** 쿠션 종류 순서(장·단)에 맞는 실제 쿠션 조합. 같은 쿠션을 연달아 쓰지 않는다 */
export function railSequences(order: RailKind[]): Rail[][] {
  const byKind: Record<RailKind, Rail[]> = {
    long: ['top', 'bottom'],
    short: ['left', 'right'],
  };
  let seqs: Rail[][] = [[]];
  for (const kind of order) {
    seqs = seqs.flatMap((s) =>
      byKind[kind].filter((r) => r !== s[s.length - 1]).map((r) => [...s, r]),
    );
  }
  return seqs;
}

/** 두 방향 사이 각 (도) */
function angleBetween(u: Point, v: Point): number {
  const dot = u[0] * 2 * v[0] * 2 + u[1] * v[1];
  const len = Math.hypot(u[0] * 2, u[1]) * Math.hypot(v[0] * 2, v[1]);
  if (len === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180) / Math.PI;
}

/**
 * 꺾인 각 → 첫 목적구 두께 (무회전 기준: 수구는 접선 방향으로 나가므로 꺾인 각 θ일 때 두께 ≈ 1 − cos θ)
 * 회전을 주면 꺾이는 각이 달라지므로 참고값이다.
 */
export function thicknessFromDeflection(deg: number): Thickness {
  const f = 1 - Math.cos((deg * Math.PI) / 180);
  if (f < 0.375) return '1/4';
  if (f < 0.625) return '1/2';
  if (f < 0.875) return '3/4';
  return 'full';
}

/** 화면 기준(y 아래로) 진행 방향: 꺾이는 방향의 합으로 정한다 */
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

export interface PlannedRoute {
  points: Point[]; // 수구, 첫 목적구, 쿠션 접점들, 두 번째 목적구
  rails: Rail[];
  firstObjectBall: BallName;
  secondObjectBall: BallName;
  deflectionDeg: number;
  thickness: Thickness;
  direction: 'clockwise' | 'counterclockwise' | null;
  length: number; // 첫 목적구 이후 경로 길이 (당구대 세로 = 1)
}

/**
 * 가능한 모든 (첫 목적구 × 쿠션 조합) 중 꺾임이 무리 없고 경로가 가장 짧은 것을 고른다.
 * 짧을수록 회전·속도 오차가 덜 쌓이므로 성공 가능성이 높다고 본다.
 */
export function planRoute(
  layout: Record<BallName, Point>,
  cueBall: BallName,
  order: RailKind[],
): PlannedRoute | null {
  const cue = layout[cueBall];
  const objects = (['white', 'yellow', 'red'] as BallName[]).filter(
    (b) => b !== cueBall,
  );
  let best: PlannedRoute | null = null;
  for (const first of objects) {
    const second = objects.find((b) => b !== first)!;
    const p1 = layout[first];
    const p2 = layout[second];
    for (const rails of order.length ? railSequences(order) : [[]]) {
      const banks = bankPoints(p1, p2, rails);
      if (!banks) continue;
      const next = banks[0] ?? p2;
      const deflection = angleBetween(
        [p1[0] - cue[0], p1[1] - cue[1]],
        [next[0] - p1[0], next[1] - p1[1]],
      );
      if (deflection > MAX_DEFLECTION) continue;
      const after = [p1, ...banks, p2];
      let length = 0;
      for (let i = 1; i < after.length; i++)
        length += distance(after[i - 1], after[i]);
      if (best && best.length <= length) continue;
      const points = [cue, ...after];
      best = {
        points: points.map(([x, y]) => [round(x), round(y)] as Point),
        rails,
        firstObjectBall: first,
        secondObjectBall: second,
        deflectionDeg: Math.round(deflection),
        thickness: thicknessFromDeflection(deflection),
        direction: turnDirection(points),
        length: round(length),
      };
    }
  }
  return best;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

export { RAIL_KIND };
