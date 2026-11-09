// 목표 핸디 ↔ 코칭 난이도 변환과 요청 파라미터 해석
import { BadRequestException } from '@nestjs/common';
import {
  COACHING_LEVELS,
  type CoachingLevel,
  type LevelSource,
} from './coaching.types.js';

/** 초급 20 이하 / 중급 21~27 / 고급 27 초과 */
export function levelFromHandicap(handicap: number): CoachingLevel {
  if (handicap <= 20) return 'beginner';
  if (handicap <= 27) return 'intermediate';
  return 'advanced';
}

export function isCoachingLevel(value: unknown): value is CoachingLevel {
  return COACHING_LEVELS.includes(value as CoachingLevel);
}

/** 핸디는 0~99 정수만 받는다 */
export function isValidHandicap(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 99
  );
}

export interface CoachingQuery {
  level?: CoachingLevel;
  handicap?: number;
  playerId?: number;
}

/**
 * ?level=beginner&handicap=20&playerId=3 같은 쿼리를 검사한다.
 * 값이 잘못되면 400. (class-validator를 쓰지 않아 직접 검사)
 */
export function parseCoachingQuery(
  query: Record<string, unknown> | undefined,
): CoachingQuery {
  const q = query ?? {};
  const result: CoachingQuery = {};

  if (q.level !== undefined) {
    if (!isCoachingLevel(q.level)) {
      throw new BadRequestException(
        `level은 ${COACHING_LEVELS.join(', ')} 중 하나여야 합니다`,
      );
    }
    result.level = q.level;
  }
  if (q.handicap !== undefined) {
    const n = typeof q.handicap === 'string' ? Number(q.handicap) : NaN;
    if (q.handicap === '' || !isValidHandicap(n)) {
      throw new BadRequestException('handicap은 0~99 정수여야 합니다');
    }
    result.handicap = n;
  }
  if (q.playerId !== undefined) {
    const n = typeof q.playerId === 'string' ? Number(q.playerId) : NaN;
    if (q.playerId === '' || !Number.isInteger(n) || n < 1) {
      throw new BadRequestException('playerId는 1 이상의 정수여야 합니다');
    }
    result.playerId = n;
  }
  return result;
}

export interface ResolvedLevel {
  level: CoachingLevel;
  levelSource: LevelSource;
  targetHandicap: number | null;
}

interface PlayerLevelInfo {
  coachingLevel: string | null;
  targetHandicap: number | null;
}

/**
 * 난이도 결정 우선순위: 요청 level > 요청 handicap > 플레이어 프로필 > 기본(초급).
 * 요청 단위 값이 프로필보다 앞서므로, 한 번만 다른 난이도로 보고 싶을 때 쓸 수 있다.
 */
export function resolveLevel(
  query: CoachingQuery,
  player: PlayerLevelInfo | null,
): ResolvedLevel {
  if (query.level) {
    return {
      level: query.level,
      levelSource: 'query-level',
      targetHandicap: query.handicap ?? null,
    };
  }
  if (query.handicap !== undefined) {
    return {
      level: levelFromHandicap(query.handicap),
      levelSource: 'query-handicap',
      targetHandicap: query.handicap,
    };
  }
  if (player) {
    // 프로필의 coachingLevel(직접 조정값)이 목표 핸디 계산값보다 우선
    if (isCoachingLevel(player.coachingLevel)) {
      return {
        level: player.coachingLevel,
        levelSource: 'player',
        targetHandicap: player.targetHandicap,
      };
    }
    if (player.targetHandicap !== null) {
      return {
        level: levelFromHandicap(player.targetHandicap),
        levelSource: 'player',
        targetHandicap: player.targetHandicap,
      };
    }
  }
  return { level: 'beginner', levelSource: 'default', targetHandicap: null };
}
