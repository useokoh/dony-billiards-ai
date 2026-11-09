import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MatchesService } from './matches.service.js';

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
    match: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    inning: { findMany: vi.fn() },
  };
  const service = new MatchesService(prisma as unknown as PrismaService);

  it('목록에 이닝 수와 샷 수를 넣는다', async () => {
    prisma.match.findMany.mockResolvedValue([row]);
    const [m] = await service.list();
    expect(m).toMatchObject({ id: 3, inningCount: 25, shotCount: 102 });
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
