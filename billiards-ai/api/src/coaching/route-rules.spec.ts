import type { CoachingLevel, FailureKind } from './coaching.types.js';
import {
  buildFeedbackItems,
  buildRuleRoutes,
  classifyFailure,
  makeHint,
} from './route-rules.js';

const FAILURES: FailureKind[] = [
  'no_first_hit',
  'no_second_hit',
  'not_enough_cushions',
  'unspecified',
];
const LEVELS: CoachingLevel[] = ['beginner', 'intermediate', 'advanced'];

describe('classifyFailure', () => {
  const base = { result: 'fail', failReason: null, scoreConfirmed: null };
  it('분석기 실패 원인을 그대로 쓴다', () => {
    expect(classifyFailure({ ...base, failReason: 'no_second_hit' })).toBe(
      'no_second_hit',
    );
  });
  it('원인이 없거나 모르는 값이면 unspecified', () => {
    expect(classifyFailure(base)).toBe('unspecified');
    expect(classifyFailure({ ...base, failReason: 'weird' })).toBe(
      'unspecified',
    );
  });
  it('성공·미확정은 추천 대상이 아니다', () => {
    expect(classifyFailure({ ...base, result: 'success' })).toBe('success');
    expect(classifyFailure({ ...base, result: 'unknown' })).toBe('unknown');
  });
  it('사람이 인정하면 실패 판정이어도 성공, 불인정하면 성공 판정이어도 실패', () => {
    expect(
      classifyFailure({
        ...base,
        failReason: 'no_first_hit',
        scoreConfirmed: true,
      }),
    ).toBe('success');
    expect(
      classifyFailure({
        result: 'success',
        failReason: null,
        scoreConfirmed: false,
      }),
    ).toBe('unspecified');
  });
});

describe('buildRuleRoutes', () => {
  it.each(FAILURES.flatMap((f) => LEVELS.map((l) => [f, l] as const)))(
    '%s × %s: 순위·권장값 계약을 지킨다',
    (failure, level) => {
      const routes = buildRuleRoutes(failure, level);
      expect(routes.length).toBeGreaterThan(0);
      routes.forEach((r, i) => {
        expect(r.rank).toBe(i + 1);
        expect(r.source).toBe('rule_template');
        expect(r.points).toBeNull(); // 공 시작 위치 없이 좌표를 만들지 않는다
        expect(r.confidence).toBeNull();
        const h = r.executionHint!;
        expect(h.basis).toBe('recommended');
        expect(h.verified).toBe(false);
        expect(h.cushionPlan.direction).toBeNull();
        expect(r.cushionCount).toBe(h.cushionPlan.order.length);
        expect(h.firstBallThickness.label).not.toBe('');
        expect(h.spin.label).not.toBe('');
        expect(h.strength.label).not.toBe('');
      });
    },
  );

  it('난이도가 높을수록 비교 후보가 늘어난다', () => {
    const n = (l: CoachingLevel) =>
      buildRuleRoutes('not_enough_cushions', l).length;
    expect(n('beginner')).toBe(1);
    expect(n('intermediate')).toBe(2);
    expect(n('advanced')).toBe(3);
  });

  it('초급 1순위는 회전 의존이 낮은 기본 경로(장→단→장, 1/2 두께, 약한 회전)', () => {
    const [top] = buildRuleRoutes('not_enough_cushions', 'beginner');
    expect(top.difficulty).toBe('beginner');
    expect(top.executionHint!.cushionPlan.order).toEqual([
      'long',
      'short',
      'long',
    ]);
    expect(top.executionHint!.firstBallThickness.fraction).toBe('1/2');
    expect(top.executionHint!.spin.amount).toBe('light');
  });

  it('중급은 기본 경로와 회전·두께 조절 경로를 함께 비교한다', () => {
    const routes = buildRuleRoutes('not_enough_cushions', 'intermediate');
    expect(routes.map((r) => r.difficulty)).toEqual([
      'beginner',
      'intermediate',
    ]);
    expect(routes[0].executionHint!.firstBallThickness.fraction).not.toBe(
      routes[1].executionHint!.firstBallThickness.fraction,
    );
  });

  it('첫 목적구 실패는 무회전 기본 경로부터', () => {
    const [top] = buildRuleRoutes('no_first_hit', 'beginner');
    expect(top.executionHint!.spin.side).toBe('none');
  });
});

describe('makeHint', () => {
  it('회전량이 none이면 방향도 none으로 맞춘다', () => {
    const h = makeHint({
      thickness: 'full',
      order: [],
      side: 'right',
      tip: 'upper',
      amount: 'none',
      strength: 'soft',
    });
    expect(h.spin.side).toBe('none');
    expect(h.spin.label).toContain('회전 없이');
    expect(h.cushionPlan.label).toBe('첫 목적구를 직접 맞히기');
  });
});

describe('buildFeedbackItems', () => {
  const feedback = (level: CoachingLevel, handicap: number | null) =>
    buildFeedbackItems(
      'not_enough_cushions',
      level,
      buildRuleRoutes('not_enough_cushions', level),
      handicap,
    );

  it('초급: 경로 + 실행값, 권장값 안내 포함', () => {
    const items = feedback('beginner', 20);
    expect(items.map((i) => i.kind)).toEqual(['route', 'execution']);
    expect(items[0].message).toContain('목표 핸디 20');
    expect(items[0].message).toContain('장쿠션 → 단쿠션 → 장쿠션');
    expect(items[1].message).toContain('1/2 두께');
    expect(items[1].message).toContain('권장값');
    expect(items.every((i) => i.source === 'auto')).toBe(true);
  });
  it('중급은 이유, 고급은 후보 비교까지 설명이 늘어난다', () => {
    expect(feedback('intermediate', 27).map((i) => i.kind)).toEqual([
      'route',
      'execution',
      'summary',
    ]);
    const adv = feedback('advanced', null);
    expect(adv.map((i) => i.kind)).toEqual([
      'route',
      'execution',
      'summary',
      'summary',
    ]);
    expect(adv[0].message).toContain('목표 핸디 27+');
    expect(adv[3].message).toContain('후보 비교');
  });
  it('실제 회전·힘을 단정하는 표현을 쓰지 않는다', () => {
    const all = LEVELS.flatMap((l) => feedback(l, null)).map((i) => i.message);
    for (const m of all)
      expect(m).not.toMatch(/(회전|힘|당점|강도)[^.]*(썼|사용했|줬|주었)/);
  });
  it('경로가 없으면 빈 목록', () => {
    expect(buildFeedbackItems('unspecified', 'beginner', [], null)).toEqual([]);
  });
});
