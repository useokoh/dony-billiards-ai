import {
  bankPoints,
  planRoute,
  railSequences,
  thicknessFromDeflection,
  turnDirection,
} from './route-geometry.js';
import { buildRuleRoutes } from './route-rules.js';
import type { Point } from '../trajectory/trajectory.js';

const RY = 18 / 740;
const RX = 18 / 1480;

describe('bankPoints', () => {
  it('한 쿠션 반사: 입사각 = 반사각', () => {
    const a: Point = [0.2, 0.6];
    const b: Point = [0.7, 0.4];
    const [p] = bankPoints(a, b, ['top'])!;
    expect(p[1]).toBeCloseTo(RY);
    // 실제 길이 비율(가로 2배)에서 기울기가 대칭이어야 한다
    const inSlope = ((p[0] - a[0]) * 2) / (a[1] - p[1]);
    const outSlope = ((b[0] - p[0]) * 2) / (b[1] - p[1]);
    expect(inSlope).toBeCloseTo(outSlope);
  });
  it('세 쿠션 접점이 모두 쿠션 위에 있다', () => {
    const pts = bankPoints([0.3, 0.3], [0.6, 0.7], ['top', 'right', 'bottom'])!;
    expect(pts).toHaveLength(3);
    expect(pts[0][1]).toBeCloseTo(RY);
    expect(pts[1][0]).toBeCloseTo(1 - RX);
    expect(pts[2][1]).toBeCloseTo(1 - RY);
  });
  it('불가능한 반사는 null', () => {
    // 같은 쪽 쿠션을 거쳐 바로 옆 점으로 가는 건 가능하지만, 반대쪽을 향하면 쿠션에 닿지 않는다
    expect(bankPoints([0.5, 0.5], [0.5, 0.5], ['left', 'left'])).toBeNull();
  });
});

describe('railSequences', () => {
  it('장-단-장 조합 8개(같은 장쿠션으로 돌아오는 경우 포함), 같은 쿠션 연속 없음', () => {
    const seqs = railSequences(['long', 'short', 'long']);
    expect(seqs).toHaveLength(8);
    for (const s of seqs) expect(s[0]).not.toBe(s[1]);
    for (const s of seqs) {
      expect(s[0] === 'top' || s[0] === 'bottom').toBe(true);
      expect(s[1] === 'left' || s[1] === 'right').toBe(true);
    }
  });
});

describe('두께·방향 변환', () => {
  it('꺾임이 작을수록 얇게', () => {
    expect(thicknessFromDeflection(20)).toBe('1/4');
    expect(thicknessFromDeflection(60)).toBe('1/2');
    expect(thicknessFromDeflection(75)).toBe('3/4');
    expect(thicknessFromDeflection(89)).toBe('full');
  });
  it('화면 기준(y 아래로) 오른쪽 → 아래는 시계 방향', () => {
    expect(
      turnDirection([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toBe('clockwise');
    expect(
      turnDirection([
        [0, 0],
        [1, 0],
        [1, -1],
      ]),
    ).toBe('counterclockwise');
    expect(
      turnDirection([
        [0, 0],
        [1, 0],
      ]),
    ).toBeNull();
  });
});

const layout = {
  white: [0.2, 0.7] as Point,
  yellow: [0.45, 0.5] as Point,
  red: [0.8, 0.3] as Point,
};

describe('planRoute', () => {
  it('수구 → 첫 목적구 → 쿠션 3개 → 두 번째 목적구, 꺾임 80° 이하', () => {
    const r = planRoute(layout, 'white', ['long', 'short', 'long'])!;
    expect(r).not.toBeNull();
    expect(r.points).toHaveLength(6);
    expect(r.points[0]).toEqual(layout.white);
    expect(r.points[1]).toEqual(layout[r.firstObjectBall]);
    expect(r.points[5]).toEqual(layout[r.secondObjectBall]);
    expect(r.firstObjectBall).not.toBe(r.secondObjectBall);
    expect(r.deflectionDeg).toBeLessThanOrEqual(80);
    expect(r.direction).not.toBeNull();
    for (const [x, y] of r.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe('buildRuleRoutes + 배치', () => {
  const geometry = { layout, cueBall: 'white' as const };
  it('배치가 있으면 좌표·첫 목적구·방향·순회전을 채운다', () => {
    const [top] = buildRuleRoutes('not_enough_cushions', 'beginner', geometry);
    const h = top.executionHint!;
    expect(top.points).not.toBeNull();
    expect(top.pointsBasis).toBe('mirror_geometry');
    expect(top.confidence).toBe(0.35);
    expect(h.firstObjectBall).not.toBeNull();
    expect(h.firstBallThickness.basis).toBe('layout');
    expect(h.cushionPlan.direction).not.toBeNull();
    expect(h.spin.side).toBe(
      h.cushionPlan.direction === 'clockwise' ? 'right' : 'left',
    );
    expect(h.basis).toBe('recommended');
    expect(h.verified).toBe(false);
  });
  it('얇은 두께 변형은 기본 경로보다 얇다(또는 이미 가장 얇음)', () => {
    const [basic, thin] = buildRuleRoutes(
      'not_enough_cushions',
      'intermediate',
      geometry,
    );
    const order = ['1/4', '1/2', '3/4', 'full'];
    const b = order.indexOf(basic.executionHint!.firstBallThickness.fraction);
    const t = order.indexOf(thin.executionHint!.firstBallThickness.fraction);
    expect(t).toBe(Math.max(0, b - 1));
  });
  it('무회전 경로는 방향이 정해져도 회전을 넣지 않는다', () => {
    const [top] = buildRuleRoutes('no_first_hit', 'beginner', geometry);
    expect(top.executionHint!.spin.side).toBe('none');
  });
  it('배치가 없으면 예전처럼 좌표 null', () => {
    const [top] = buildRuleRoutes('not_enough_cushions', 'beginner', null);
    expect(top.points).toBeNull();
    expect(top.executionHint!.firstObjectBall).toBeNull();
  });
});
