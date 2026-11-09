import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CoachingService } from './coaching.service.js';

describe('CoachingService', () => {
  const prisma = {
    shot: { findUnique: vi.fn() },
    player: { findUnique: vi.fn(), count: vi.fn() },
    recommendedRoute: { findMany: vi.fn() },
    feedback: { findMany: vi.fn() },
  };
  const service = new CoachingService(prisma as unknown as PrismaService);
  const failShot = {
    result: 'fail',
    failReason: 'not_enough_cushions',
    scoreConfirmed: null,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.shot.findUnique.mockResolvedValue(failShot);
    prisma.recommendedRoute.findMany.mockResolvedValue([]);
    prisma.feedback.findMany.mockResolvedValue([]);
  });

  it('없는 샷은 404', async () => {
    prisma.shot.findUnique.mockResolvedValue(null);
    await expect(service.route(9, {})).rejects.toThrow(NotFoundException);
    await expect(service.feedback(9, {})).rejects.toThrow(NotFoundException);
  });

  it('없는 플레이어는 404', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    await expect(service.route(1, { playerId: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('핸디 20 요청 → 초급 규칙 예시, 프로필은 읽지 않는다', async () => {
    const r = await service.route(1, { handicap: 20 });
    expect(r).toMatchObject({
      level: 'beginner',
      levelSource: 'query-handicap',
      targetHandicap: 20,
      targetHandicapLabel: '20',
      applicable: true,
      failure: 'not_enough_cushions',
    });
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0].source).toBe('rule_template');
    expect(r.disclaimer).toContain('권장값');
    expect(prisma.player.findUnique).not.toHaveBeenCalled();
  });

  it('같은 샷도 목표 핸디가 높아지면 추천이 늘어난다', async () => {
    const lv = async (handicap: number) =>
      (await service.route(1, { handicap })).routes.length;
    expect([await lv(20), await lv(27), await lv(30)]).toEqual([1, 2, 3]);
  });

  it('플레이어 프로필의 목표 핸디를 쓴다', async () => {
    prisma.player.findUnique.mockResolvedValue({
      coachingLevel: null,
      targetHandicap: 27,
    });
    const r = await service.route(1, { playerId: 2 });
    expect(r).toMatchObject({
      level: 'intermediate',
      levelSource: 'player',
      targetHandicapLabel: '27',
    });
  });

  it('playerId가 없으면 이 샷을 친 선수의 연결된 프로필을 쓴다', async () => {
    prisma.shot.findUnique.mockResolvedValue({
      ...failShot,
      player: 'second',
      match: { firstPlayerId: 1, secondPlayerId: 9 },
    });
    prisma.player.findUnique.mockResolvedValue({
      coachingLevel: null,
      targetHandicap: 30,
    });
    const r = await service.route(1, {});
    expect(prisma.player.findUnique.mock.calls[0][0].where).toEqual({ id: 9 });
    expect(r).toMatchObject({ level: 'advanced', levelSource: 'player' });
  });

  it('연결된 프로필이 지워졌으면 기본값으로 (404 아님)', async () => {
    prisma.shot.findUnique.mockResolvedValue({
      ...failShot,
      player: 'first',
      match: { firstPlayerId: 1, secondPlayerId: null },
    });
    prisma.player.findUnique.mockResolvedValue(null);
    expect((await service.route(1, {})).levelSource).toBe('default');
  });

  it('level과 잘못된 playerId가 함께 오면 404', async () => {
    prisma.player.count.mockResolvedValue(0);
    await expect(
      service.route(1, { level: 'beginner', playerId: 77 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('궤적이 있으면 배치로 경로 좌표를 계산한다', async () => {
    const t = (ball: string, p: number[]) => ({
      ball,
      startFrame: 1,
      step: 2,
      points: JSON.stringify([p]),
      estimated: '[0]',
    });
    prisma.shot.findUnique.mockResolvedValue({
      ...failShot,
      cueBall: 'white',
      trajectories: [
        t('white', [0.2, 0.7]),
        t('yellow', [0.45, 0.5]),
        t('red', [0.8, 0.3]),
      ],
    });
    const r = await service.route(1, { level: 'beginner' });
    expect(r.layout).toEqual({
      white: [0.2, 0.7],
      yellow: [0.45, 0.5],
      red: [0.8, 0.3],
    });
    expect(r.routes[0].pointsBasis).toBe('mirror_geometry');
    expect(r.routes[0].points).toHaveLength(6);
  });

  it('성공·미확정 샷은 추천 대상이 아니다', async () => {
    prisma.shot.findUnique.mockResolvedValue({
      ...failShot,
      result: 'success',
      failReason: null,
    });
    expect(await service.route(1, {})).toMatchObject({
      applicable: false,
      reason: 'shot_succeeded',
      routes: [],
    });
    prisma.shot.findUnique.mockResolvedValue({
      ...failShot,
      result: 'unknown',
      failReason: null,
    });
    expect(await service.route(1, {})).toMatchObject({
      applicable: false,
      reason: 'result_unknown',
    });
    expect((await service.feedback(1, {})).items).toEqual([]);
  });

  it('저장된 추천 경로가 있으면 규칙 예시 대신 쓴다', async () => {
    prisma.recommendedRoute.findMany.mockResolvedValue([
      {
        rank: 1,
        points: '[[0,0],[1,1]]',
        cushionCount: 3,
        description: '분석기 경로',
        difficulty: 'beginner',
        executionHint: null,
        confidence: 0.5,
      },
    ]);
    const r = await service.route(1, { level: 'beginner' });
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]).toMatchObject({ source: 'stored', confidence: 0.5 });
  });

  it('피드백: 규칙 문장 뒤에 저장된 피드백을 붙이고, 핸디가 다른 것은 거른다', async () => {
    prisma.feedback.findMany.mockResolvedValue([
      {
        kind: 'summary',
        source: 'user',
        targetHandicap: null,
        message: '코치 메모',
      },
    ]);
    const f = await service.feedback(1, { handicap: 20 });
    expect(f.items.map((i) => i.kind)).toEqual([
      'route',
      'execution',
      'summary',
    ]);
    expect(f.items[2]).toMatchObject({ source: 'user', message: '코치 메모' });
    expect(prisma.feedback.findMany.mock.calls[0][0].where).toEqual({
      shotId: 1,
      OR: [{ targetHandicap: null }, { targetHandicap: 20 }],
    });
    await service.feedback(1, { level: 'advanced' }); // 핸디 미지정 → 공통 피드백만
    expect(prisma.feedback.findMany.mock.calls[1][0].where.OR).toEqual([
      { targetHandicap: null },
    ]);
  });
});
