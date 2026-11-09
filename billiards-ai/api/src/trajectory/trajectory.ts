// 궤적 DB 행 → 화면용 좌표, 샷 시작 배치(공 3개의 처음 위치)
// 좌표는 당구대 안쪽 기준 0~1 (x: 장쿠션 방향 1480px, y: 단쿠션 방향 740px)

export type BallName = 'white' | 'yellow' | 'red';
export type Point = [number, number];

export interface TrajectoryDbRow {
  ball: string;
  startFrame: number;
  step: number;
  points: string;
  estimated: string | null;
}

export interface BallPath {
  points: Point[];
  estimated: number[]; // 1 = 보간한 점
}

export type Layout = Record<BallName, Point>;

const BALLS: BallName[] = ['white', 'yellow', 'red'];

function parse<T>(
  json: string | null,
  check: (v: unknown) => v is T,
): T | null {
  if (!json) return null;
  try {
    const v: unknown = JSON.parse(json);
    return check(v) ? v : null;
  } catch {
    return null;
  }
}

const isPoints = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      p.every((n) => typeof n === 'number' && Number.isFinite(n)),
  );
const isFlags = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => n === 0 || n === 1);

/** 궤적 행들 → 공별 경로. 깨진 행은 빼고, 공이 하나도 없으면 null */
export function toBallPaths(
  rows: TrajectoryDbRow[],
): Partial<Record<BallName, BallPath>> | null {
  const out: Partial<Record<BallName, BallPath>> = {};
  for (const r of rows) {
    if (!BALLS.includes(r.ball as BallName)) continue;
    const points = parse(r.points, isPoints);
    if (!points || points.length === 0) continue;
    const flags = parse(r.estimated, isFlags);
    out[r.ball as BallName] = {
      points,
      estimated:
        flags && flags.length === points.length ? flags : points.map(() => 0),
    };
  }
  return Object.keys(out).length ? out : null;
}

/** 샷 시작 때 공 3개 위치. 공 하나라도 없으면 null (추천 경로 좌표를 계산하지 않는다) */
export function startLayout(
  paths: Partial<Record<BallName, BallPath>> | null,
): Layout | null {
  if (!paths) return null;
  const w = paths.white?.points[0];
  const y = paths.yellow?.points[0];
  const r = paths.red?.points[0];
  return w && y && r ? { white: w, yellow: y, red: r } : null;
}
