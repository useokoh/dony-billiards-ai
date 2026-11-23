// 경기 조회: 경기 목록, 경기 정보, 이닝별 샷 요약, 경기 삭제
import { readdirSync, rmSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { projectRoot } from '../media/media-file.js';
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

/**
 * 경기 하나가 data/ 아래에 남기는 파일들 (분석 결과는 영상 이름을 그대로 쓴다).
 * data/ 밖을 가리키는 경로는 지우지 않도록 걸러 낸다.
 */
export function matchFiles(
  root: string,
  videoPath: string,
  checkFiles: string[] = [],
): string[] {
  const data = resolve(root, 'data') + sep;
  const stem = basename(videoPath, extname(videoPath));
  const paths = [
    videoPath,
    `data/results/clips/${stem}`,
    `data/results/detect/${stem}`,
    `data/results/tracks/${stem}`,
    `data/results/shots/${stem}.json`,
    `data/results/trajectories/${stem}.json`,
    ...checkFiles
      .filter((f) => f.startsWith(`${stem}_`))
      .map((f) => `data/results/check/${f}`),
  ];
  return paths
    .map((p) => resolve(root, p))
    .filter((p) => p.startsWith(data) && basename(p) !== '');
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 경기 목록 (최근 경기 먼저). 카드에 쓰는 득점 후보 수와 확인 필요 샷 수를 함께 센다 */
  async list() {
    const [rows, candidates, reviews] = await Promise.all([
      this.prisma.match.findMany({
        include: matchInclude,
        orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.shot.groupBy({
        by: ['matchId'],
        where: { scoreCandidate: true },
        _count: { _all: true },
      }),
      // 웹 샷 목록의 "확인 필요"와 같은 기준: 사람이 아직 안 봤고, 자동 판정 근거가 엇갈렸거나 판정을 못 한 샷
      this.prisma.shot.groupBy({
        by: ['matchId'],
        where: {
          scoreConfirmed: null,
          OR: [
            {
              scoreBasis: { in: ['turn', 'physics'] },
              result: { in: ['success', 'fail'] },
            },
            { result: { notIn: ['success', 'fail'] } },
          ],
        },
        _count: { _all: true },
      }),
    ]);
    const reviewCount = new Map(reviews.map((c) => [c.matchId, c._count._all]));
    const candidateCount = new Map(
      candidates.map((c) => [c.matchId, c._count._all]),
    );
    return rows.map((m) => ({
      ...toMatchSummary(m),
      candidateCount: candidateCount.get(m.id) ?? 0,
      reviewCount: reviewCount.get(m.id) ?? 0,
    }));
  }

  /**
   * 경기 삭제: DB 기록(이닝·샷·궤적·피드백은 함께 지워짐)과 원본 영상·분석 결과 파일을 지운다.
   * 되돌릴 수 없으므로 화면에서 한 번 더 묻는다.
   */
  async remove(id: number) {
    const m = await this.prisma.match.findUnique({
      where: { id },
      select: { videoPath: true },
    });
    if (!m) throw new NotFoundException(`경기 ${id}이 없습니다`);
    // 같은 영상을 쓰는 다른 경기가 있으면 파일은 남긴다 (DB만 지움)
    const shared = await this.prisma.match.count({
      where: { videoPath: m.videoPath, id: { not: id } },
    });
    await this.prisma.match.delete({ where: { id } });
    const root = projectRoot();
    let check: string[] = [];
    try {
      check = readdirSync(join(root, 'data/results/check'));
    } catch {
      // 확인용 이미지 폴더가 없으면 지울 것도 없다
    }
    const files = shared ? [] : matchFiles(root, m.videoPath, check);
    for (const f of files) rmSync(f, { recursive: true, force: true });
    return { id, deletedFiles: files.length };
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
