// 샷 조회: 샷 상세(사건 순서, 실패 원인, 영상 위치)
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** hitOrder는 DB에 JSON 문자열로 저장되어 있어 배열로 바꾼다. 깨진 값이면 null */
export function parseHitOrder(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ShotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: number) {
    const s = await this.prisma.shot.findUnique({
      where: { id },
      include: {
        inning: { select: { inningNo: true } },
        events: {
          orderBy: { seq: 'asc' },
          select: {
            seq: true,
            kind: true,
            frameNo: true,
            tSec: true,
            target: true,
          },
        },
        clip: { select: { startSec: true, endSec: true } },
      },
    });
    if (!s) throw new NotFoundException(`샷 ${id}이 없습니다`);

    return {
      id: s.id,
      matchId: s.matchId,
      inningNo: s.inning.inningNo,
      shotNo: s.shotNo,
      shotNoInInning: s.shotNoInInning,
      shotNoInTurn: s.shotNoInTurn,
      player: s.player,
      cueBall: s.cueBall,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
      startSec: s.startSec,
      endSec: s.endSec,
      restSec: s.restSec,
      cushionCount: s.cushionCount,
      cushionsBeforeSecondHit: s.cushionsBeforeSecondHit,
      hitOrder: parseHitOrder(s.hitOrder),
      result: s.result,
      failReason: s.failReason,
      scoreCandidate: s.scoreCandidate,
      scoreConfirmed: s.scoreConfirmed,
      events: s.events,
      // 샷 영상 (따로 잘라 둔 파일). 없으면 아래 경기 영상의 startSec부터 재생
      clip: s.clip
        ? {
            url: `/api/shots/${s.id}/clip`,
            startSec: s.clip.startSec,
            endSec: s.clip.endSec,
          }
        : null,
      matchVideo: {
        url: `/api/matches/${s.matchId}/video`,
        startSec: s.startSec,
      },
    };
  }

  /** 샷 영상의 저장 경로 */
  async clipPath(id: number): Promise<string> {
    const clip = await this.prisma.clip.findUnique({
      where: { shotId: id },
      select: { filePath: true },
    });
    if (!clip) throw new NotFoundException(`샷 ${id}의 영상이 없습니다`);
    return clip.filePath;
  }
}
