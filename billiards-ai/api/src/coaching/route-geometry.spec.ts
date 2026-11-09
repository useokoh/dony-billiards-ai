import {
  bounce,
  planAlternatives,
  planRoute,
  simulate,
  strengthForLength,
  thicknessBucket,
  turnDirection,
} from './route-geometry.js';
import { buildRuleRoutes } from './route-rules.js';
import { DEFAULT_ROUTE_MODEL as model } from './route-model.default.js';
import type { Point } from '../trajectory/trajectory.js';

describe('bounce', () => {
  it('거울 반사: 수직 성분만 뒤집힌다', () => {
    expect(bounce([1, -1], 'top', null)).toEqual([1, 1]);
    expect(bounce([1, 1], 'right', null)).toEqual([-1, 1]);
  });
  it('실측 표: 쿠션을 따라 같은 쪽으로 가고, 45°로 들어오면 더 눕게 나간다', () => {
    const [t, n] = bounce([Math.SQRT1_2, -Math.SQRT1_2], 'top', model);
    expect(t).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(0);
    const beta = (Math.atan2(t, n) * 180) / Math.PI;
    expect(beta).toBeGreaterThan(50); // 실측 표: 45° → 약 58°
  });
});

describe('simulate', () => {
  it('쿠션 없이 바로 맞는 경우', () => {
    const r = simulate([200, 370], [1, 0], [600, 370], null);
    expect(r.cushionsBeforeHit).toBe(0);
    expect(r.hitPoint![0]).toBeCloseTo(600 - 0, -2);
  });
  it('쿠션 접점은 쿠션 위(공 반지름 안쪽)에 있다', () => {
    const r = simulate([300, 300], [1, -0.6], [-999, -999], null);
    expect(r.cushionsBeforeHit).toBeNull();
    expect(r.banks.length).toBeGreaterThan(2);
    for (const [x, y] of r.banks) {
      const onRail =
        Math.abs(y - 18) < 1e-6 ||
        Math.abs(y - 722) < 1e-6 ||
        Math.abs(x - 18) < 1e-6 ||
        Math.abs(x - 1462) < 1e-6;
      expect(onRail).toBe(true);
    }
  });
});

describe('표시 변환', () => {
  it('두께 단계', () => {
    expect(thicknessBucket(0.2)).toBe('1/4');
    expect(thicknessBucket(0.5)).toBe('1/2');
    expect(thicknessBucket(0.8)).toBe('3/4');
    expect(thicknessBucket(0.95)).toBe('full');
  });
  it('경로 길이로 강약', () => {
    expect(strengthForLength(1480 * 2)).toBe('soft');
    expect(strengthForLength(1480 * 3.5)).toBe('medium');
    expect(strengthForLength(1480 * 4.5)).toBe('firm');
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
  it('3쿠션 이상 뒤 두 번째 목적구에 닿는 경로와 비교 값', () => {
    const r = planRoute(layout, 'white', [], model, 'intermediate')!;
    expect(r).not.toBeNull();
    expect(r.rails.length).toBeGreaterThanOrEqual(3);
    expect(r.points[0]).toEqual(layout.white);
    expect(r.points).toHaveLength(r.rails.length + 3);
    expect(r.firstObjectBall).not.toBe(r.secondObjectBall);
    expect(r.expectedSuccess).toBeGreaterThanOrEqual(0);
    expect(r.expectedSuccess).toBeLessThanOrEqual(1);
    expect(r.windowDeg).toBeGreaterThan(0);
    expect(['good', 'normal', 'hard']).toContain(r.nextLayout.rating);
    for (const [x, y] of r.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
  it('같은 배치는 같은 결과 (결정적 난수)', () => {
    expect(planRoute(layout, 'white', [], model, 'beginner')).toEqual(
      planRoute(layout, 'white', [], model, 'beginner'),
    );
  });
  it('쿠션 순서를 지정하면 그 순서로 시작한다', () => {
    const r = planRoute(layout, 'white', ['long', 'short', 'long'], model);
    if (r) {
      expect(r.rails.length).toBeLessThanOrEqual(4);
      expect(['top', 'bottom']).toContain(r.rails[0]);
      expect(['left', 'right']).toContain(r.rails[1]);
    }
  });
  it('실행 오차가 작은(고급) 쪽이 기대 성공률이 같거나 높다', () => {
    const b = planRoute(layout, 'white', [], model, 'beginner')!;
    const a = planRoute(layout, 'white', [], model, 'advanced')!;
    expect(a.expectedSuccess).toBeGreaterThanOrEqual(b.expectedSuccess - 0.05);
  });
});

describe('planAlternatives (고급 비교)', () => {
  it('기대 성공률 순, 첫 목적구·쿠션 순서가 겹치지 않는다', () => {
    const alts = planAlternatives(layout, 'white', model, 'advanced');
    expect(alts.length).toBeGreaterThan(0);
    for (let i = 1; i < alts.length; i++) {
      expect(alts[i - 1].expectedSuccess).toBeGreaterThanOrEqual(
        alts[i].expectedSuccess,
      );
    }
    const keys = alts.map((a) => `${a.firstObjectBall}:${a.rails.join(',')}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildRuleRoutes + 배치', () => {
  const geometry = { layout, cueBall: 'white' as const };
  it('초급: 템플릿 경로에 실측 보정 좌표·기대 성공률·모델 신뢰도', () => {
    const [top] = buildRuleRoutes(
      'not_enough_cushions',
      'beginner',
      geometry,
      model,
    );
    if (top.points) {
      expect(top.confidence).toBe(model.validation.path.table.reproduce_rate);
      expect(top.expectedSuccess).not.toBeNull();
      expect(top.comparison!.windowDeg).toBeGreaterThan(0);
      const h = top.executionHint!;
      expect(h.firstBallThickness.basis).toBe('layout');
      expect(h.spin.side).toBe(
        h.cushionPlan.direction === 'clockwise' ? 'right' : 'left',
      );
      expect(h.basis).toBe('recommended');
      expect(h.verified).toBe(false);
    }
  });
  it('고급: 계산한 후보끼리 기대 성공률로 비교', () => {
    const routes = buildRuleRoutes(
      'not_enough_cushions',
      'advanced',
      geometry,
      model,
    );
    expect(routes.length).toBeGreaterThan(0);
    expect(
      routes.every((r) => r.expectedSuccess !== null && r.comparison !== null),
    ).toBe(true);
    expect(routes[0].description).toMatch(/먼저 →/);
  });
  it('무회전 템플릿은 방향이 정해져도 회전을 넣지 않는다', () => {
    const [top] = buildRuleRoutes('no_first_hit', 'beginner', geometry, model);
    expect(top.executionHint!.spin.side).toBe('none');
  });
  it('배치가 없으면 좌표·기대 성공률 null', () => {
    const [top] = buildRuleRoutes(
      'not_enough_cushions',
      'advanced',
      null,
      model,
    );
    expect(top.points).toBeNull();
    expect(top.expectedSuccess).toBeNull();
    expect(top.executionHint!.firstObjectBall).toBeNull();
  });
});

describe('템플릿 순서로 경로가 없을 때', () => {
  it('4쿠션 이내 다른 순서로 대신 권하고 이유를 밝힌다', () => {
    const geometry = { layout, cueBall: 'white' as const };
    const [top] = buildRuleRoutes(
      'not_enough_cushions',
      'beginner',
      geometry,
      model,
    );
    // 이 배치는 장·단·장 4쿠션 이내 득점 경로가 없다 (planRoute 결과로 확인)
    expect(
      planRoute(layout, 'white', ['long', 'short', 'long'], model, 'beginner'),
    ).toBeNull();
    expect(top.points).not.toBeNull();
    expect(top.cushionCount).toBeLessThanOrEqual(4);
    expect(top.description).toMatch(/먼저 →/);
    expect(top.rationale).toContain('대신');
    expect(top.executionHint!.cushionPlan.order).toHaveLength(top.cushionCount);
  });
});
