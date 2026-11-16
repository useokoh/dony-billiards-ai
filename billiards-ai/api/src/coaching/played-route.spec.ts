import type { BallPath, Point } from '../trajectory/trajectory.js';
import { measurePlayed, type ShotEventInput } from './played-route.js';
import { planCorrection, type Rail } from './route-geometry.js';
import { buildCorrection, easierThan } from './route-rules.js';
import type { RecommendedRouteDto } from './coaching.types.js';
import { loadRouteModel } from './route-model.js';

const W = 1480;
const H = 740;
const px = ([x, y]: Point): Point => [x / W, y / H];
const path = (pts: Point[]): BallPath => ({
  points: pts.map(px),
  estimated: pts.map(() => 0),
});

/** 수구가 (200,370)에서 오른쪽으로 굴러 (600,370)에서 1적구를 맞히고, 1적구는 cut 방향으로 밀려 나간다 */
function directShot(cutDeg: number) {
  const cue: Point[] = [];
  for (let x = 200; x <= 600; x += 40) cue.push([x, 370]);
  const hitIdx = cue.length - 1;
  for (let k = 1; k <= 20; k++) cue.push([600 + k * 5, 370 - k * 8]); // 충돌 뒤 꺾임
  const r = (cutDeg * Math.PI) / 180;
  const obj: Point[] = cue.map((_, i) =>
    i <= hitIdx
      ? [636, 370]
      : [
          636 + Math.cos(r) * 12 * (i - hitIdx),
          370 + Math.sin(r) * 12 * (i - hitIdx),
        ],
  );
  const other: Point[] = cue.map(() => [1300, 200]);
  return { cue, obj, other, hitIdx };
}

const events = (
  hitIdx: number,
  extra: ShotEventInput[] = [],
): ShotEventInput[] => [
  { kind: 'hit', frameNo: hitIdx, target: 'red' },
  ...extra,
];

describe('measurePlayed', () => {
  it('reads the cut angle the player actually hit', () => {
    const { cue, obj, other, hitIdx } = directShot(30);
    const p = measurePlayed(
      { white: path(cue), red: path(obj), yellow: path(other) },
      events(hitIdx),
      'white',
      0,
      1,
    );
    expect(p).not.toBeNull();
    expect(p!.firstObjectBall).toBe('red');
    expect(p!.secondObjectBall).toBe('yellow');
    expect(p!.cutDeg).toBeCloseTo(30, 0);
    expect(p!.secondHit).toBe(false);
  });

  it('reports the miss distance and a short-stopping cue ball', () => {
    const { cue, obj, hitIdx } = directShot(30);
    // 마지막 점 바로 옆에 2적구: 가장 가까이 간 뒤 더 굴러가지 않았다
    const last = cue[cue.length - 1];
    const other: Point[] = cue.map(() => [last[0] + 46, last[1]]);
    const p = measurePlayed(
      { white: path(cue), red: path(obj), yellow: path(other) },
      events(hitIdx),
      'white',
      0,
      1,
    )!;
    expect(p.missGapM).toBeCloseTo(0.02, 2); // 46px - 공 지름 36px = 10px ≈ 2cm
    expect(p.stoppedShort).toBe(true);
  });

  it('cannot measure a shot without a first hit or with a cushion first', () => {
    const { cue, obj, other, hitIdx } = directShot(30);
    const paths = { white: path(cue), red: path(obj), yellow: path(other) };
    expect(measurePlayed(paths, [], 'white', 0, 1)).toBeNull();
    expect(
      measurePlayed(
        paths,
        events(hitIdx, [{ kind: 'cushion', frameNo: 2, target: null }]),
        'white',
        0,
        1,
      ),
    ).toBeNull();
  });
});

describe('planCorrection on a real failed shot (영상1 shot 663)', () => {
  // 실제 실패 샷: 노란공으로 빨간공을 37.9° 잘라 쳐 장·장·장·단 쿠션을 돌았고, 2적구 5cm 앞에서 멈췄다
  const layout = {
    white: [0.0252, 0.0623] as Point,
    yellow: [0.1834, 0.0986] as Point,
    red: [0.387, 0.5986] as Point,
  };
  const rails: Rail[] = ['right', 'bottom', 'top', 'left'];
  const model = loadRouteModel();

  it('keeps the played route and only changes the thickness', () => {
    const plan = planCorrection(
      layout,
      'yellow',
      'red',
      rails,
      37.9,
      model,
      'beginner',
    );
    expect(plan).not.toBeNull();
    expect(plan!.firstObjectBall).toBe('red');
    expect(plan!.rails.slice(0, 2)).toEqual(rails.slice(0, 2));
    expect(Math.abs(plan!.cutDeg - 37.9)).toBeLessThan(15);
  });

  it('builds a correction message with thickness and strength advice', () => {
    const dto = buildCorrection(
      {
        firstObjectBall: 'red',
        secondObjectBall: 'white',
        cutDeg: 37.9,
        thicknessFraction: 0.39,
        rails,
        secondHit: false,
        missGapM: 0.05,
        travelAfterClosestM: 0.1,
        stoppedShort: true,
      },
      { layout, cueBall: 'yellow' },
      'beginner',
      model,
    );
    expect(dto.reason).toBeNull();
    expect(dto.correction?.stronger).toBe(true);
    expect(dto.correction?.route.executionHint?.strength.label).toBe(
      '한 단계 더 세게',
    );
    expect(dto.message).toContain('친 경로');
    expect(dto.message).toContain('5cm');
  });

  it('explains when the played route cannot be measured', () => {
    const dto = buildCorrection(
      null,
      { layout, cueBall: 'yellow' },
      'beginner',
      model,
    );
    expect(dto).toMatchObject({
      played: null,
      correction: null,
      reason: 'not_measured',
    });
  });
});

describe('easierThan', () => {
  const route = (rank: number, referenceSuccess: number) =>
    ({
      rank,
      comparison: { referenceSuccess },
    }) as unknown as RecommendedRouteDto;
  const correction = { route: route(0, 0.4) } as never;

  it('keeps only routes clearly easier than the correction and renumbers them', () => {
    const kept = easierThan(
      [route(1, 0.42), route(2, 0.5), route(3, 0.3)],
      correction,
    );
    expect(kept.map((r) => [r.rank, r.comparison!.referenceSuccess])).toEqual([
      [1, 0.5],
    ]);
  });

  it('keeps all routes when there is no correction', () => {
    expect(easierThan([route(1, 0.1)], null)).toHaveLength(1);
  });
});
