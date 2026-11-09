// 플레이어 프로필: 현재·목표 핸디와 코칭 난이도 (목표 핸디별 코칭의 입력)
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isCoachingLevel,
  isValidHandicap,
  levelFromHandicap,
} from '../coaching/coaching-level.js';
import { COACHING_LEVELS } from '../coaching/coaching.types.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PlayerInput {
  name?: string;
  currentHandicap?: number | null;
  targetHandicap?: number | null;
  coachingLevel?: string | null;
}

/**
 * 본문 검사. 생성(partial=false)은 name 필수, 수정(partial=true)은 보낸 필드만 반영한다.
 * 핸디는 0~99 정수 또는 null(지우기), coachingLevel은 beginner|intermediate|advanced 또는 null.
 */
export function parsePlayerBody(body: unknown, partial: boolean): PlayerInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('본문은 JSON 객체여야 합니다');
  }
  const b = body as Record<string, unknown>;
  const out: PlayerInput = {};

  if ('name' in b) {
    if (typeof b.name !== 'string' || b.name.trim() === '') {
      throw new BadRequestException(
        'name은 비어 있지 않은 문자열이어야 합니다',
      );
    }
    out.name = b.name.trim();
  } else if (!partial) {
    throw new BadRequestException('name이 필요합니다');
  }

  for (const key of ['currentHandicap', 'targetHandicap'] as const) {
    if (key in b) {
      const v = b[key];
      if (v !== null && !isValidHandicap(v)) {
        throw new BadRequestException(
          `${key}는 0~99 정수 또는 null이어야 합니다`,
        );
      }
      out[key] = v;
    }
  }

  if ('coachingLevel' in b) {
    const v = b.coachingLevel;
    if (v !== null && !isCoachingLevel(v)) {
      throw new BadRequestException(
        `coachingLevel은 ${COACHING_LEVELS.join(', ')} 또는 null이어야 합니다`,
      );
    }
    out.coachingLevel = v;
  }
  return out;
}

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.player.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const p = await this.prisma.player.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`플레이어 ${id}가 없습니다`);
    return p;
  }

  /** coachingLevel을 따로 주지 않으면 목표 핸디에서 계산해 저장한다 */
  create(input: PlayerInput) {
    const coachingLevel =
      input.coachingLevel ??
      (input.targetHandicap != null
        ? levelFromHandicap(input.targetHandicap)
        : null);
    return this.prisma.player.create({
      data: {
        name: input.name as string,
        currentHandicap: input.currentHandicap ?? null,
        targetHandicap: input.targetHandicap ?? null,
        coachingLevel,
      },
    });
  }

  /**
   * 보낸 필드만 바꾼다. 목표 핸디를 바꾸면서 coachingLevel을 보내지 않으면
   * 난이도도 새 목표 핸디에서 다시 계산한다(null이면 난이도도 비운다).
   */
  async update(id: number, input: PlayerInput) {
    await this.findOne(id);
    const data: PlayerInput = { ...input };
    if ('targetHandicap' in input && !('coachingLevel' in input)) {
      data.coachingLevel =
        input.targetHandicap != null
          ? levelFromHandicap(input.targetHandicap)
          : null;
    }
    return this.prisma.player.update({ where: { id }, data });
  }
}
