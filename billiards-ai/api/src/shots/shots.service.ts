// 샷 조회: 샷 상세(사건 순서, 실패 원인, 자동 득점 확정, 영상 위치)와 사람의 득점 인정/불인정
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { isScored, recountMatchScores, scoreSource } from '../scoring/score.js';
import { startLayout, toBallPaths } from '../trajectory/trajectory.js';

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

/**
 * PATCH 본문 검사: { "scoreConfirmed": true | false | null }
 * true = 득점 인정, false = 불인정, null = 확인 취소
 */
export function parseConfirmBody(body: unknown): boolean | null {
  if (typeof body === 'object' && body !== null && 'scoreConfirmed' in body) {
    const v = (body as { scoreConfirmed: unknown }).scoreConfirmed;
    if (v === true || v === false || v === null) return v;
  }
  throw new BadRequestException(
    'scoreConfirmed는 true, false, null 중 하나여야 합니다',
  );
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
      // 자동 확정: 물리 판정 + 차례 신호 (analyzer/judge.py). 사람 확인이 있으면 그것이 우선
      scoreBasis: s.scoreBasis,
      scoreConfidence: s.scoreConfidence,
      scored: isScored(s),
      scoredBy: scoreSource(s),
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

  /**
   * 샷 궤적: 공별 좌표(0~1)와 샷 시작 배치. 궤적을 아직 가져오지 않았으면 balls = null
   * 시간은 startFrame + i * step 프레임 (마지막 점은 공이 멈춘 프레임)
   */
  async trajectory(id: number) {
    const s = await this.prisma.shot.findUnique({
      where: { id },
      select: {
        startFrame: true,
        match: { select: { fps: true } },
        trajectories: {
          select: {
            ball: true,
            startFrame: true,
            step: true,
            points: true,
            estimated: true,
          },
        },
      },
    });
    if (!s) throw new NotFoundException(`샷 ${id}이 없습니다`);
    const balls = toBallPaths(s.trajectories);
    return {
      shotId: id,
      startFrame: s.trajectories[0]?.startFrame ?? s.startFrame,
      step: s.trajectories[0]?.step ?? null,
      fps: s.match.fps,
      // 화면 비율: 당구대 안쪽 가로:세로 = 2:1
      aspect: 2,
      balls,
      layout: startLayout(balls),
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

  /**
   * 득점 인정/불인정을 저장하고, 경기의 이닝별·전체 점수를 다시 계산한다.
   * 점수는 사람이 확인한 값(scoreConfirmed)이 있으면 그것, 없으면 자동 확정 결과(result)로 센다.
   * null을 보내면 사람 확인을 취소하고 자동 확정 결과로 돌아간다.
   */
  async confirm(id: number, scoreConfirmed: boolean | null) {
    const shot = await this.prisma.shot.findUnique({
      where: { id },
      select: { matchId: true, inningId: true },
    });
    if (!shot) throw new NotFoundException(`샷 ${id}이 없습니다`);

    const scores = await this.prisma.$transaction(async (tx) => {
      await tx.shot.update({ where: { id }, data: { scoreConfirmed } });
      const { innings, match } = await recountMatchScores(tx, shot.matchId);
      return {
        inning: innings.get(shot.inningId) ?? { scoreFirst: 0, scoreSecond: 0 },
        match,
      };
    });

    return { id, scoreConfirmed, scores };
  }
}
