// 경기 조회: 경기 목록, 경기 정보, 이닝별 샷 요약
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isScored, scoreSource } from '../scoring/score.js';

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
  firstPlayerId?: number | null;
  secondPlayerId?: number | null;
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
    firstPlayerId: m.firstPlayerId ?? null,
    secondPlayerId: m.secondPlayerId ?? null,
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

export interface MatchPlayersInput {
  firstPlayerId?: number | null;
  secondPlayerId?: number | null;
}

/** PATCH /api/matches/:id/players 본문: 보낸 쪽만 바꾼다. null은 연결 해제 */
export function parseMatchPlayersBody(body: unknown): MatchPlayersInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('본문은 JSON 객체여야 합니다');
  }
  const b = body as Record<string, unknown>;
  const out: MatchPlayersInput = {};
  for (const key of ['firstPlayerId', 'secondPlayerId'] as const) {
    if (!(key in b)) continue;
    const v = b[key];
    if (
      v !== null &&
      !(typeof v === 'number' && Number.isInteger(v) && v > 0)
    ) {
      throw new BadRequestException(
        `${key}는 1 이상의 정수 또는 null이어야 합니다`,
      );
    }
    out[key] = v;
  }
  if (!('firstPlayerId' in out) && !('secondPlayerId' in out)) {
    throw new BadRequestException(
      'firstPlayerId 또는 secondPlayerId가 필요합니다',
    );
  }
  if (out.firstPlayerId != null && out.firstPlayerId === out.secondPlayerId) {
    throw new BadRequestException(
      '선공과 후공에 같은 플레이어를 넣을 수 없습니다',
    );
  }
  return out;
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 경기 목록 (최근 경기 먼저). 카드에 쓰는 득점 후보 수를 함께 센다 */
  async list() {
    const [rows, candidates] = await Promise.all([
      this.prisma.match.findMany({
        include: matchInclude,
        orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.shot.groupBy({
        by: ['matchId'],
        where: { scoreCandidate: true },
        _count: { _all: true },
      }),
    ]);
    const candidateCount = new Map(
      candidates.map((c) => [c.matchId, c._count._all]),
    );
    return rows.map((m) => ({
      ...toMatchSummary(m),
      candidateCount: candidateCount.get(m.id) ?? 0,
    }));
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
    const rows = await this.prisma.inning.findMany({
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
            failReason: true,
            scoreCandidate: true,
            scoreConfirmed: true,
            scoreBasis: true,
            scoreConfidence: true,
          },
        },
      },
    });
    // 화면이 같은 규칙으로 표시하도록 최종 득점 여부를 함께 준다 (사람 확인 > 자동 확정)
    return rows.map((inning) => ({
      ...inning,
      shots: inning.shots.map((s) => ({
        ...s,
        scored: isScored(s),
        scoredBy: scoreSource(s),
      })),
    }));
  }

  /**
   * 경기에 선공·후공 플레이어 프로필을 연결한다. 표시 이름(firstPlayer/secondPlayer)도 함께 맞춘다.
   * 연결하면 그 선수의 샷 코칭이 프로필의 목표 핸디로 자동으로 정해진다.
   */
  async setPlayers(id: number, input: MatchPlayersInput) {
    const current = await this.prisma.match.findUnique({
      where: { id },
      select: { firstPlayerId: true, secondPlayerId: true },
    });
    if (!current) throw new NotFoundException(`경기 ${id}이 없습니다`);
    const first =
      'firstPlayerId' in input ? input.firstPlayerId : current.firstPlayerId;
    const second =
      'secondPlayerId' in input ? input.secondPlayerId : current.secondPlayerId;
    if (first != null && first === second) {
      throw new BadRequestException(
        '선공과 후공에 같은 플레이어를 넣을 수 없습니다',
      );
    }

    const ids = [first, second].filter((v): v is number => v != null);
    const players = await this.prisma.player.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const name = new Map(players.map((p) => [p.id, p.name]));
    for (const pid of ids) {
      if (!name.has(pid))
        throw new NotFoundException(`플레이어 ${pid}가 없습니다`);
    }
    await this.prisma.match.update({
      where: { id },
      data: {
        firstPlayerId: first ?? null,
        secondPlayerId: second ?? null,
        firstPlayer: first != null ? name.get(first)! : null,
        secondPlayer: second != null ? name.get(second)! : null,
      },
    });
    return this.findOne(id);
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
