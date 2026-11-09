import { makeHint } from './route-rules.js';
import { mapStoredRoutes, parseExecutionHint } from './stored-route.js';

const hint = makeHint({
  thickness: '1/2',
  order: ['long', 'short', 'long'],
  side: 'right',
  tip: 'center',
  amount: 'light',
  strength: 'medium',
});
const row = (over: Record<string, unknown> = {}) => ({
  rank: 1,
  points: '[[0.1,0.2],[0.5,0.9]]',
  cushionCount: 3,
  description: '저장된 경로',
  difficulty: 'beginner' as string | null,
  executionHint: JSON.stringify(hint) as string | null,
  confidence: 0.6 as number | null,
  ...over,
});

describe('parseExecutionHint', () => {
  it('올바른 JSON을 읽는다', () => {
    expect(parseExecutionHint(JSON.stringify(hint))).toEqual(hint);
  });
  it('저장값의 verified:true를 믿지 않고 권장값 표시로 고정한다', () => {
    const forged = { ...hint, verified: true, basis: 'observed' };
    const parsed = parseExecutionHint(JSON.stringify(forged))!;
    expect(parsed.verified).toBe(false);
    expect(parsed.basis).toBe('recommended');
  });
  it('깨졌거나 형태가 다르면 null', () => {
    expect(parseExecutionHint(null)).toBeNull();
    expect(parseExecutionHint('not json')).toBeNull();
    expect(parseExecutionHint('[]')).toBeNull();
    expect(parseExecutionHint('{"spin":{}}')).toBeNull();
    const bad = { ...hint, spin: { ...hint.spin, side: 'up' } };
    expect(parseExecutionHint(JSON.stringify(bad))).toBeNull();
  });
});

describe('mapStoredRoutes', () => {
  it('난이도 범위로 거르고 순위를 다시 매긴다', () => {
    const rows = [
      row({ rank: 3, difficulty: 'advanced', description: 'C' }),
      row({ rank: 1, difficulty: 'beginner', description: 'A' }),
      row({ rank: 2, difficulty: 'intermediate', description: 'B' }),
    ];
    expect(mapStoredRoutes(rows, 'beginner').map((r) => r.description)).toEqual(
      ['A'],
    );
    expect(
      mapStoredRoutes(rows, 'intermediate').map((r) => [r.rank, r.description]),
    ).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
    expect(mapStoredRoutes(rows, 'advanced')).toHaveLength(3);
  });
  it('난이도 미지정 행은 모든 레벨에서 보인다', () => {
    const [r] = mapStoredRoutes([row({ difficulty: null })], 'advanced');
    expect(r.difficulty).toBe('advanced');
  });
  it('깨진 좌표·범위 밖 신뢰도는 null로 안전하게', () => {
    const [r] = mapStoredRoutes(
      [row({ points: '[[1,"a"]]', confidence: 7 })],
      'beginner',
    );
    expect(r.points).toBeNull();
    expect(r.confidence).toBeNull();
    expect(r.source).toBe('stored');
  });
  it('정상 좌표를 그대로 준다', () => {
    const [r] = mapStoredRoutes([row()], 'beginner');
    expect(r.points).toEqual([
      [0.1, 0.2],
      [0.5, 0.9],
    ]);
    expect(r.executionHint).toEqual(hint);
  });
});
