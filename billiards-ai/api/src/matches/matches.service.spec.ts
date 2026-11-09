import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { BadRequestException } from '@nestjs/common';
import { MatchesService, parseMatchPlayersBody } from './matches.service.js';

describe('MatchesService', () => {
  const row = {
    id: 3,
    playedAt: new Date('2026-11-01T19:38:23'),
    firstPlayer: null,
    secondPlayer: null,
    firstCueBall: 'white',
    scoreFirst: 0,
    scoreSecond: 0,
    status: 'done',
    progress: 100,
    fps: 30.1,
    durationSec: 2897.8,
    errorMessage: null,
    table: { id: 1, name: '1번' },
    _count: { innings: 25, shots: 102 },
  };
  const prisma = {
    shot: { groupBy: vi.fn() },
    match: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    player: { findMany: vi.fn() },
    inning: { findMany: vi.fn() },
  };
  const service = new MatchesService(prisma as unknown as PrismaService);

  it('목록에 이닝 수와 샷 수를 넣는다', async () => {
    prisma.match.findMany.mockResolvedValue([row]);
    prisma.shot.groupBy.mockResolvedValue([
      { matchId: 3, _count: { _all: 4 } },
    ]);
    const [m] = await service.list();
    expect(m).toMatchObject({
      id: 3,
      inningCount: 25,
      shotCount: 102,
      candidateCount: 4,
    });
    expect(m).not.toHaveProperty('_count');
  });

  it('상세에 영상 주소를 넣는다', async () => {
    prisma.match.findUnique.mockResolvedValue(row);
    expect(await service.findOne(3)).toMatchObject({
      fps: 30.1,
      videoUrl: '/api/matches/3/video',
    });
  });

  it('없는 경기는 404', async () => {
    prisma.match.findUnique.mockResolvedValue(null);
    prisma.match.count.mockResolvedValue(0);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    await expect(service.innings(999)).rejects.toThrow(NotFoundException);
    await expect(service.videoPath(999)).rejects.toThrow(NotFoundException);
  });
});

describe('parseMatchPlayersBody', () => {
  it('보낸 쪽만, null은 해제', () => {
    expect(parseMatchPlayersBody({ firstPlayerId: 1 })).toEqual({
      firstPlayerId: 1,
    });
    expect(parseMatchPlayersBody({ secondPlayerId: null })).toEqual({
      secondPlayerId: null,
    });
  });
  it.each([
    {},
    { firstPlayerId: 0 },
    { firstPlayerId: '1' },
    { firstPlayerId: 2, secondPlayerId: 2 },
    null,
  ])('잘못된 본문은 400: %j', (b) =>
    expect(() => parseMatchPlayersBody(b)).toThrow(BadRequestException),
  );
});

describe('MatchesService.setPlayers', () => {
  const prisma = {
    match: { findUnique: vi.fn(), update: vi.fn() },
    player: { findMany: vi.fn() },
  };
  const service = new MatchesService(prisma as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());

  it('없는 경기·플레이어는 404', async () => {
    prisma.match.findUnique.mockResolvedValue(null);
    await expect(service.setPlayers(1, { firstPlayerId: 1 })).rejects.toThrow(
      NotFoundException,
    );
    prisma.match.findUnique.mockResolvedValue({
      firstPlayerId: null,
      secondPlayerId: null,
    });
    prisma.player.findMany.mockResolvedValue([]);
    await expect(service.setPlayers(1, { firstPlayerId: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });
  it('기존 연결과 합쳐 같은 선수가 양쪽이면 400', async () => {
    prisma.match.findUnique.mockResolvedValue({
      firstPlayerId: 3,
      secondPlayerId: null,
    });
    await expect(service.setPlayers(1, { secondPlayerId: 3 })).rejects.toThrow(
      BadRequestException,
    );
  });
  it('연결하면서 표시 이름도 맞춘다', async () => {
    prisma.match.findUnique.mockResolvedValue({
      firstPlayerId: null,
      secondPlayerId: 4,
    });
    prisma.player.findMany.mockResolvedValue([
      { id: 2, name: '도니' },
      { id: 4, name: '상대' },
    ]);
    vi.spyOn(service, 'findOne').mockResolvedValue({} as never);
    await service.setPlayers(1, { firstPlayerId: 2 });
    expect(prisma.match.update.mock.calls[0][0].data).toEqual({
      firstPlayerId: 2,
      secondPlayerId: 4,
      firstPlayer: '도니',
      secondPlayer: '상대',
    });
  });
});
