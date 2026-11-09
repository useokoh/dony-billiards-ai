import { isScored, scoreSource, tallyScores } from './score.js';

describe('isScored / scoreSource', () => {
  it('사람 확인이 자동 확정보다 우선', () => {
    expect(isScored({ result: 'fail', scoreConfirmed: true })).toBe(true);
    expect(isScored({ result: 'success', scoreConfirmed: false })).toBe(false);
    expect(scoreSource({ result: 'success', scoreConfirmed: false })).toBe(
      'human',
    );
  });
  it('확인이 없으면 자동 확정 결과', () => {
    expect(isScored({ result: 'success', scoreConfirmed: null })).toBe(true);
    expect(isScored({ result: 'fail', scoreConfirmed: null })).toBe(false);
    expect(scoreSource({ result: 'fail', scoreConfirmed: null })).toBe('auto');
  });
  it('판정 전(unknown)은 득점이 아니다', () => {
    expect(isScored({ result: 'unknown', scoreConfirmed: null })).toBe(false);
    expect(scoreSource({ result: 'unknown', scoreConfirmed: null })).toBe(
      'none',
    );
  });
});

describe('tallyScores', () => {
  it('이닝별·경기 점수를 센다 (득점 없는 이닝도 0으로 포함)', () => {
    const { innings, match } = tallyScores([
      { inningId: 1, player: 'first', result: 'success', scoreConfirmed: null },
      { inningId: 1, player: 'first', result: 'fail', scoreConfirmed: true },
      {
        inningId: 1,
        player: 'second',
        result: 'success',
        scoreConfirmed: false,
      },
      {
        inningId: 2,
        player: 'second',
        result: 'success',
        scoreConfirmed: null,
      },
      { inningId: 3, player: 'first', result: 'fail', scoreConfirmed: null },
    ]);
    expect(innings.get(1)).toEqual({ scoreFirst: 2, scoreSecond: 0 });
    expect(innings.get(2)).toEqual({ scoreFirst: 0, scoreSecond: 1 });
    expect(innings.get(3)).toEqual({ scoreFirst: 0, scoreSecond: 0 });
    expect(match).toEqual({ scoreFirst: 2, scoreSecond: 1 });
  });
});
