// 실제로 친 경로 읽기: 샷 궤적과 사건(충돌·쿠션)에서 첫 목적구, 친 두께(자르는 각), 쿠션 순서,
// 2적구를 얼마나 아깝게 놓쳤는지를 잰다. 교정 코칭(route-geometry.ts planCorrection)의 입력이다.
import type { BallName, BallPath, Point } from '../trajectory/trajectory.js';
import type { Rail } from './route-geometry.js';

// 당구대 안쪽 1480×740px, 공 반지름 18px (route-geometry.ts와 같은 값)
const W = 1480;
const H = 740;
const R = 18;
const PX_TO_M = 2.84 / W;
const APPROACH_SAMPLES = 2; // 충돌 몇 점 앞까지를 수구 진행 방향에 쓰는지
const OBJECT_SAMPLES = 6; // 충돌 뒤 몇 점까지를 1적구가 밀려 나간 방향에 쓰는지
const MIN_OBJECT_MOVE = 4; // 1적구가 이만큼(px)도 안 움직이면 방향을 잴 수 없다
const STOPPED_SHORT_M = 0.3; // 2적구에 가장 가까이 간 뒤 이만큼도 못 가고 멈추면 힘 부족으로 본다

export interface ShotEventInput {
  kind: string; // hit, cushion
  frameNo: number;
  target: string | null;
}

export interface PlayedRoute {
  firstObjectBall: BallName;
  secondObjectBall: BallName;
  /** 부호 있는 자르는 각(도). route-geometry의 cut과 같은 규칙: 수구 진행 방향에서 1적구 방향까지 */
  cutDeg: number;
  thicknessFraction: number; // 0~1 (1 = 정면)
  rails: Rail[]; // 첫 목적구를 맞힌 뒤 두 번째 목적구 전까지(못 맞혔으면 끝까지) 닿은 쿠션
  secondHit: boolean;
  /** 2적구를 못 맞혔을 때, 가장 가까이 갔을 때 두 공 표면 사이 거리(m) */
  missGapM: number | null;
  /** 2적구에 가장 가까이 간 뒤 수구가 더 굴러간 거리(m). 짧으면 힘 부족 */
  travelAfterClosestM: number | null;
  stoppedShort: boolean;
}

type V = [number, number];
const toPx = ([x, y]: Point): V => [x * W, y * H];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 공이 닿은 쿠션: 그 순간 수구 위치에서 가장 가까운 벽 */
function nearestRail([x, y]: V): Rail {
  const options: [number, Rail][] = [
    [y, 'top'],
    [H - y, 'bottom'],
    [x, 'left'],
    [W - x, 'right'],
  ];
  return options.sort((a, b) => a[0] - b[0])[0][1];
}

/**
 * 실제로 친 경로를 잰다. 첫 목적구를 못 맞혔거나, 쿠션을 먼저 맞히고 들어갔거나,
 * 1적구 방향을 잴 수 없으면 null.
 * @param startFrame 궤적 첫 점의 프레임, step 점 사이 프레임 간격 (DB trajectories 행 값)
 */
export function measurePlayed(
  paths: Partial<Record<BallName, BallPath>>,
  events: ShotEventInput[],
  cueBall: BallName,
  startFrame: number,
  step: number,
): PlayedRoute | null {
  const hits = events.filter((e) => e.kind === 'hit' && e.target);
  const first = hits[0];
  if (!first) return null;
  const firstBall = first.target as BallName;
  const secondBall = (['white', 'yellow', 'red'] as BallName[]).find(
    (b) => b !== cueBall && b !== firstBall,
  );
  const cue = paths[cueBall]?.points.map(toPx);
  const obj = paths[firstBall]?.points.map(toPx);
  const other = secondBall ? paths[secondBall]?.points.map(toPx) : undefined;
  if (!secondBall || !cue || !obj || !other) return null;

  const at = (frame: number, n: number) =>
    Math.min(n - 1, Math.max(0, Math.round((frame - startFrame) / step)));
  const hitIdx = at(first.frameNo, cue.length);
  const cushions = events.filter((e) => e.kind === 'cushion');
  // shortcut: 쿠션을 먼저 맞히고 들어가는 샷은 직접 맞히는 경로만 계산하는 모델로 교정할 수 없어 건너뛴다.
  if (cushions.some((c) => c.frameNo < first.frameNo)) return null;

  // 직접 맞히는 샷은 출발부터 충돌까지 직선이므로 긴 구간으로 방향을 재야 흔들림이 적다.
  // 충돌 순간 점은 이미 꺾였을 수 있어 몇 점 앞까지만 쓴다.
  // 빠른 샷은 출발 몇 프레임 만에 맞혀서 그 앞 점이 아직 출발 전일 수 있다: 움직인 점이 나올 때까지 뒤로 민다.
  let j = Math.max(1, hitIdx - APPROACH_SAMPLES);
  while (j < hitIdx && dist(cue[j], cue[0]) < MIN_OBJECT_MOVE) j += 1;
  const approach = sub(cue[j], cue[0]);
  // 1적구는 멈춰 있던 처음 위치에서 충돌 뒤 몇 점까지 곧게 밀려 나간다.
  const objMove = sub(
    obj[Math.min(obj.length - 1, hitIdx + OBJECT_SAMPLES)],
    obj[0],
  );
  if (Math.hypot(...approach) < 1 || Math.hypot(...objMove) < MIN_OBJECT_MOVE)
    return null;
  const cutDeg =
    (Math.atan2(
      approach[0] * objMove[1] - approach[1] * objMove[0],
      approach[0] * objMove[0] + approach[1] * objMove[1],
    ) *
      180) /
    Math.PI;

  const second = hits.find((h) => h.target === secondBall);
  const rails = cushions
    .filter(
      (c) =>
        c.frameNo > first.frameNo && (!second || c.frameNo < second.frameNo),
    )
    .map((c) => nearestRail(cue[at(c.frameNo, cue.length)]));

  let missGapM: number | null = null;
  let travelAfterClosestM: number | null = null;
  if (!second) {
    let closest = hitIdx;
    let best = Infinity;
    for (let i = hitIdx; i < cue.length; i++) {
      const d = dist(cue[i], other[Math.min(i, other.length - 1)]);
      if (d < best) [best, closest] = [d, i];
    }
    let travel = 0;
    for (let i = closest + 1; i < cue.length; i++)
      travel += dist(cue[i], cue[i - 1]);
    missGapM = Math.round(Math.max(0, best - 2 * R) * PX_TO_M * 100) / 100;
    travelAfterClosestM = Math.round(travel * PX_TO_M * 100) / 100;
  }

  return {
    firstObjectBall: firstBall,
    secondObjectBall: secondBall,
    cutDeg: Math.round(cutDeg * 10) / 10,
    thicknessFraction:
      Math.round(
        (1 - Math.sin((Math.min(90, Math.abs(cutDeg)) * Math.PI) / 180)) * 100,
      ) / 100,
    rails,
    secondHit: Boolean(second),
    missGapM,
    travelAfterClosestM,
    stoppedShort:
      travelAfterClosestM !== null && travelAfterClosestM < STOPPED_SHORT_M,
  };
}
