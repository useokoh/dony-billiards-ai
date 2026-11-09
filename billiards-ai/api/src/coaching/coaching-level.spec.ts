import { BadRequestException } from '@nestjs/common';
import {
  levelFromHandicap,
  parseCoachingQuery,
  resolveLevel,
} from './coaching-level.js';

describe('levelFromHandicap', () => {
  it('초급 20 / 중급 27 / 고급 27+ 경계', () => {
    expect(levelFromHandicap(15)).toBe('beginner');
    expect(levelFromHandicap(20)).toBe('beginner');
    expect(levelFromHandicap(21)).toBe('intermediate');
    expect(levelFromHandicap(27)).toBe('intermediate');
    expect(levelFromHandicap(28)).toBe('advanced');
    expect(levelFromHandicap(40)).toBe('advanced');
  });
});

describe('parseCoachingQuery', () => {
  it('빈 쿼리는 빈 객체', () => {
    expect(parseCoachingQuery({})).toEqual({});
    expect(parseCoachingQuery(undefined)).toEqual({});
  });
  it('올바른 값을 숫자·열거형으로 바꾼다', () => {
    expect(
      parseCoachingQuery({ level: 'advanced', handicap: '30', playerId: '2' }),
    ).toEqual({ level: 'advanced', handicap: 30, playerId: 2 });
  });
  it.each([
    { level: 'expert' },
    { handicap: 'abc' },
    { handicap: '' },
    { handicap: '20.5' },
    { handicap: '-1' },
    { handicap: '100' },
    { playerId: '0' },
    { playerId: 'x' },
    { handicap: ['1', '2'] },
  ])('잘못된 값은 400: %j', (q) => {
    expect(() => parseCoachingQuery(q)).toThrow(BadRequestException);
  });
});

describe('resolveLevel', () => {
  const player = { coachingLevel: 'intermediate', targetHandicap: 20 };
  it('요청 level이 가장 우선', () => {
    expect(resolveLevel({ level: 'advanced', handicap: 20 }, player)).toEqual({
      level: 'advanced',
      levelSource: 'query-level',
      targetHandicap: 20,
    });
  });
  it('요청 handicap이 프로필보다 우선', () => {
    expect(resolveLevel({ handicap: 30 }, player)).toMatchObject({
      level: 'advanced',
      levelSource: 'query-handicap',
      targetHandicap: 30,
    });
  });
  it('프로필의 직접 조정 난이도가 목표 핸디 계산값보다 우선', () => {
    expect(resolveLevel({}, player)).toMatchObject({
      level: 'intermediate',
      levelSource: 'player',
      targetHandicap: 20,
    });
  });
  it('프로필에 난이도가 없으면 목표 핸디로 계산', () => {
    expect(
      resolveLevel({}, { coachingLevel: null, targetHandicap: 27 }),
    ).toMatchObject({ level: 'intermediate', levelSource: 'player' });
  });
  it('아무 정보도 없으면 초급 기본값', () => {
    expect(resolveLevel({}, null)).toEqual({
      level: 'beginner',
      levelSource: 'default',
      targetHandicap: null,
    });
    expect(
      resolveLevel({}, { coachingLevel: null, targetHandicap: null }),
    ).toMatchObject({ levelSource: 'default' });
  });
});
