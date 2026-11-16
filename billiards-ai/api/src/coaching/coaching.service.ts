// 추천 경로·피드백 조회: 샷 + 목표 핸디(요청 또는 플레이어 프로필) → 난이도별 추천과 실행 코칭
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveLevel, type CoachingQuery } from './coaching-level.js';
import {
  COACHING_DISCLAIMER,
  LEVEL_HANDICAP_LABEL,
  type FeedbackItem,
  type FeedbackResponse,
  type RecommendedRouteDto,
  type RouteResponse,
} from './coaching.types.js';
import { measurePlayed } from './played-route.js';
import {
  buildCorrection,
  buildFeedbackItems,
  buildRuleRoutes,
  classifyFailure,
  easierThan,
} from './route-rules.js';
import { mapStoredRoutes } from './stored-route.js';
import {
  startLayout,
  toBallPaths,
  type BallName,
} from '../trajectory/trajectory.js';
import type { ShotGeometry } from './route-rules.js';

@Injectable()
export class CoachingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 샷·플레이어를 읽어 난이도와 실패 유형을 정한다 */
  private async context(shotId: number, query: CoachingQuery) {
    const shot = await this.prisma.shot.findUnique({
      where: { id: shotId },
      select: {
        result: true,
        failReason: true,
        scoreConfirmed: true,
        cueBall: true,
        player: true,
        match: { select: { firstPlayerId: true, secondPlayerId: true } },
        trajectories: {
          select: {
            ball: true,
            startFrame: true,
            step: true,
            points: true,
            estimated: true,
          },
        },
        events: {
          select: { kind: true, frameNo: true, target: true },
          orderBy: { seq: 'asc' },
        },
      },
    });
    if (!shot) throw new NotFoundException(`샷 ${shotId}이 없습니다`);

    // 요청의 level/handicap이 프로필보다 앞서므로, 필요할 때만 프로필을 읽는다.
    // playerId가 없으면 이 샷을 친 선수(경기에 연결된 선공/후공 프로필)를 쓴다.
    let player = null;
    const linked =
      shot.player === 'first'
        ? shot.match?.firstPlayerId
        : shot.match?.secondPlayerId;
    const playerId = query.playerId ?? linked ?? undefined;
    if (
      playerId !== undefined &&
      query.level === undefined &&
      query.handicap === undefined
    ) {
      player = await this.prisma.player.findUnique({
        where: { id: playerId },
        select: { coachingLevel: true, targetHandicap: true },
      });
      if (!player && query.playerId !== undefined) {
        throw new NotFoundException(`플레이어 ${query.playerId}가 없습니다`);
      }
    } else if (query.playerId !== undefined) {
      // level/handicap이 함께 오면 프로필은 쓰지 않지만, 잘못된 번호는 알려 준다
      const exists = await this.prisma.player.count({
        where: { id: query.playerId },
      });
      if (!exists) {
        throw new NotFoundException(`플레이어 ${query.playerId}가 없습니다`);
      }
    }
    // 샷 시작 배치: 궤적이 있으면 추천 경로 좌표·방향을 계산한다
    const paths = toBallPaths(shot.trajectories ?? []);
    const layout = startLayout(paths);
    const geometry: ShotGeometry | null =
      layout && (shot.cueBall === 'white' || shot.cueBall === 'yellow')
        ? { layout, cueBall: shot.cueBall as BallName }
        : null;
    // 실제로 친 경로 (교정 코칭용). 수구 궤적 행의 시작 프레임·간격으로 사건 프레임을 맞춘다
    const cueRow = shot.trajectories?.find((t) => t.ball === shot.cueBall);
    const played =
      geometry && paths && cueRow
        ? measurePlayed(
            paths,
            shot.events ?? [],
            geometry.cueBall,
            cueRow.startFrame,
            cueRow.step,
          )
        : null;
    return {
      resolved: resolveLevel(query, player),
      classification: classifyFailure(shot),
      geometry,
      played,
    };
  }

  async route(shotId: number, query: CoachingQuery): Promise<RouteResponse> {
    const { resolved, classification, geometry, played } = await this.context(
      shotId,
      query,
    );
    const base = {
      shotId,
      level: resolved.level,
      levelSource: resolved.levelSource,
      targetHandicap: resolved.targetHandicap,
      layout: geometry?.layout ?? null,
      targetHandicapLabel: LEVEL_HANDICAP_LABEL[resolved.level],
      disclaimer: COACHING_DISCLAIMER,
    };

    // 추천은 실패한 샷에만 만든다
    if (classification === 'success' || classification === 'unknown') {
      return {
        ...base,
        applicable: false,
        reason:
          classification === 'success' ? 'shot_succeeded' : 'result_unknown',
        failure: null,
        playedRoute: null,
        routes: [],
      };
    }
    const playedRoute = geometry
      ? buildCorrection(played, geometry, resolved.level)
      : null;
    const routes = await this.routesFor(
      shotId,
      classification,
      resolved.level,
      geometry,
    );
    return {
      ...base,
      applicable: true,
      reason: null,
      failure: classification,
      playedRoute,
      routes: easierThan(routes, playedRoute?.correction ?? null),
    };
  }

  async feedback(
    shotId: number,
    query: CoachingQuery,
  ): Promise<FeedbackResponse> {
    const { resolved, classification, geometry, played } = await this.context(
      shotId,
      query,
    );
    const base = {
      shotId,
      level: resolved.level,
      levelSource: resolved.levelSource,
      targetHandicapLabel: LEVEL_HANDICAP_LABEL[resolved.level],
      disclaimer: COACHING_DISCLAIMER,
    };
    if (classification === 'success' || classification === 'unknown') {
      return { ...base, applicable: false, items: [] };
    }

    const routes = await this.routesFor(
      shotId,
      classification,
      resolved.level,
      geometry,
    );
    // A안: 내가 친 경로 교정을 먼저 말하고, 다른 경로는 교정보다 쉬울 때만 이어서 말한다
    const playedRoute = geometry
      ? buildCorrection(played, geometry, resolved.level)
      : null;
    const items: FeedbackItem[] = [
      ...(playedRoute
        ? [
            {
              kind: 'correction',
              source: 'auto' as const,
              targetHandicap: resolved.targetHandicap,
              message: playedRoute.message,
            },
          ]
        : []),
      // 교정이 있으면 요약·권장 실행 문장도 교정 경로 기준으로 만든다
      ...buildFeedbackItems(
        classification,
        resolved.level,
        playedRoute?.correction
          ? [
              playedRoute.correction.route,
              ...easierThan(routes, playedRoute.correction),
            ]
          : routes,
        resolved.targetHandicap,
      ),
    ];

    // 저장된 피드백(사람이 쓴 것 포함): 핸디 지정이 없거나 요청 핸디와 같은 것만
    const stored = await this.prisma.feedback.findMany({
      where: {
        shotId,
        OR: [
          { targetHandicap: null },
          ...(resolved.targetHandicap !== null
            ? [{ targetHandicap: resolved.targetHandicap }]
            : []),
        ],
      },
      orderBy: { id: 'asc' },
      select: { kind: true, source: true, targetHandicap: true, message: true },
    });
    const storedItems: FeedbackItem[] = stored.map((f) => ({
      kind: f.kind,
      source: f.source === 'user' ? 'user' : 'auto',
      targetHandicap: f.targetHandicap,
      message: f.message,
    }));
    return { ...base, applicable: true, items: [...items, ...storedItems] };
  }

  /** 분석기가 저장해 둔 경로가 있으면 그것을, 없으면 규칙 예시를 쓴다 */
  private async routesFor(
    shotId: number,
    failure: Parameters<typeof buildRuleRoutes>[0],
    level: Parameters<typeof buildRuleRoutes>[1],
    geometry: ShotGeometry | null,
  ): Promise<RecommendedRouteDto[]> {
    const rows = await this.prisma.recommendedRoute.findMany({
      where: { shotId },
      orderBy: { rank: 'asc' },
    });
    const stored = mapStoredRoutes(rows, level);
    return stored.length > 0
      ? stored
      : buildRuleRoutes(failure, level, geometry);
  }
}
