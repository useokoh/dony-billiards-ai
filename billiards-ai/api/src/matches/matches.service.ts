// 경기 조회: 경기 목록, 경기 정보, 이닝별 샷 요약
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// 목록과 상세에서 같이 쓰는 조회 조건
const matchInclude = {
  table: { select: { id: true, name: true } },
  _count: { select: { innings: true, shots: true } },
} as const;

type MatchRow = {
  id: number;
  playedAt: Date;
  firstPlayer: string | null;
  secondPlayer: string | null;
  firstCueBall: string | null;
  scoreFirst: number;
  scoreSecond: number;
  status: string;
  progress: number;
  table: { id: number; name: string };
  _count: { innings: number; shots: number };
};

/** DB 행 → 경기 요약 (목록용) */
export function toMatchSummary(m: MatchRow) {
  return {
    id: m.id,
    playedAt: m.playedAt,
    firstPlayer: m.firstPlayer,
    secondPlayer: m.secondPlayer,
    firstCueBall: m.firstCueBall,
    scoreFirst: m.scoreFirst,
    scoreSecond: m.scoreSecond,
    status: m.status,
    progress: m.progress,
    table: m.table,
    inningCount: m._count.innings,
    shotCount: m._count.shots,
  };
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 경기 목록 (최근 경기 먼저) */
  async list() {
    const rows = await this.prisma.match.findMany({
      include: matchInclude,
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toMatchSummary);
  }

  /** 경기 1개: 요약 + 영상 길이, fps, 오류 내용, 영상 주소 */
  async findOne(id: number) {
    const m = await this.prisma.match.findUnique({
      where: { id },
      include: matchInclude,
    });
    if (!m) throw new NotFoundException(`경기 ${id}이 없습니다`);
    return {
      ...toMatchSummary(m),
      fps: m.fps,
      durationSec: m.durationSec,
      errorMessage: m.errorMessage,
      videoUrl: `/api/matches/${m.id}/video`,
    };
  }

  /** 이닝별 샷 목록 (화면의 이닝 목록용, 상세 정보는 /api/shots/:id) */
  async innings(matchId: number) {
    await this.ensureExists(matchId);
    return this.prisma.inning.findMany({
      where: { matchId },
      orderBy: { inningNo: 'asc' },
      select: {
        id: true,
        inningNo: true,
        scoreFirst: true,
        scoreSecond: true,
        shots: {
          orderBy: { shotNo: 'asc' },
          select: {
            id: true,
            shotNo: true,
            shotNoInInning: true,
            player: true,
            cueBall: true,
            startSec: true,
            endSec: true,
            cushionCount: true,
            cushionsBeforeSecondHit: true,
            result: true,
            scoreCandidate: true,
            scoreConfirmed: true,
          },
        },
      },
    });
  }

  /** 경기 원본 영상의 저장 경로 */
  async videoPath(id: number): Promise<string> {
    const m = await this.prisma.match.findUnique({
      where: { id },
      select: { videoPath: true },
    });
    if (!m) throw new NotFoundException(`경기 ${id}이 없습니다`);
    return m.videoPath;
  }

  private async ensureExists(id: number) {
    const count = await this.prisma.match.count({ where: { id } });
    if (count === 0) throw new NotFoundException(`경기 ${id}이 없습니다`);
  }
}
