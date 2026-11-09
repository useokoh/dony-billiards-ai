import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { parseHitOrder, ShotsService } from './shots.service.js';

describe('parseHitOrder', () => {
  it('JSON 배열을 바꾼다', () => {
    expect(parseHitOrder('["red","yellow"]')).toEqual(['red', 'yellow']);
  });
  it('비었거나 깨진 값은 null', () => {
    expect(parseHitOrder(null)).toBeNull();
    expect(parseHitOrder('not json')).toBeNull();
    expect(parseHitOrder('{"a":1}')).toBeNull();
  });
});

describe('ShotsService', () => {
  // DB 대신 필요한 함수만 흉내 낸다
  const shotRow = {
    id: 7,
    matchId: 3,
    shotNo: 7,
    shotNoInInning: 1,
    shotNoInTurn: 1,
    player: 'first',
    cueBall: 'white',
    startFrame: 100,
    endFrame: 300,
    startSec: 3.3,
    endSec: 10,
    restSec: 9.5,
    cushionCount: 3,
    cushionsBeforeSecondHit: 3,
    hitOrder: '["red","yellow"]',
    result: 'success',
    failReason: null,
    scoreCandidate: true,
    scoreConfirmed: null,
    inning: { inningNo: 2 },
    events: [{ seq: 1, kind: 'hit', frameNo: 120, tSec: 4, target: 'red' }],
    clip: null,
  };
  const prisma = {
    shot: { findUnique: vi.fn() },
    clip: { findUnique: vi.fn() },
  };
  const service = new ShotsService(prisma as unknown as PrismaService);

  it('샷 상세를 화면용으로 바꾼다', async () => {
    prisma.shot.findUnique.mockResolvedValue(shotRow);
    const s = await service.findOne(7);
    expect(s.inningNo).toBe(2);
    expect(s.hitOrder).toEqual(['red', 'yellow']);
    expect(s.clip).toBeNull();
    expect(s.matchVideo).toEqual({
      url: '/api/matches/3/video',
      startSec: 3.3,
    });
  });

  it('없는 샷과 없는 샷 영상은 404', async () => {
    prisma.shot.findUnique.mockResolvedValue(null);
    prisma.clip.findUnique.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    await expect(service.clipPath(999)).rejects.toThrow(NotFoundException);
  });
});
