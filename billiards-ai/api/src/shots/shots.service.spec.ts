import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  parseConfirmBody,
  parseHitOrder,
  ShotsService,
} from './shots.service.js';

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
    scoreBasis: 'agree',
    scoreConfidence: 0.95,
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
    expect(s).toMatchObject({
      scored: true,
      scoredBy: 'auto',
      scoreBasis: 'agree',
    });
    expect(s.matchVideo).toEqual({
      url: '/api/matches/3/video',
      startSec: 3.3,
    });
  });

  it('득점 인정 후 자동 확정 + 사람 확인으로 점수를 다시 센다', async () => {
    const tx = {
      shot: {
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([
          {
            inningId: 5,
            player: 'first',
            result: 'success',
            scoreConfirmed: null,
          },
          {
            inningId: 5,
            player: 'second',
            result: 'fail',
            scoreConfirmed: true,
          },
          {
            inningId: 6,
            player: 'first',
            result: 'success',
            scoreConfirmed: false,
          },
        ]),
      },
      inning: { update: vi.fn() },
      match: { update: vi.fn() },
    };
    const p = {
      ...prisma,
      shot: {
        findUnique: vi.fn().mockResolvedValue({ matchId: 3, inningId: 5 }),
      },
      $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    };
    const svc = new ShotsService(p as unknown as PrismaService);
    const r = await svc.confirm(7, true);
    expect(tx.shot.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { scoreConfirmed: true },
    });
    expect(r.scores).toEqual({
      inning: { scoreFirst: 1, scoreSecond: 1 },
      match: { scoreFirst: 1, scoreSecond: 1 },
    });
    expect(tx.inning.update).toHaveBeenCalledTimes(2);
    expect(tx.match.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { scoreFirst: 1, scoreSecond: 1 },
    });
  });

  it('없는 샷과 없는 샷 영상은 404', async () => {
    prisma.shot.findUnique.mockResolvedValue(null);
    prisma.clip.findUnique.mockResolvedValue(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    await expect(service.clipPath(999)).rejects.toThrow(NotFoundException);
  });
});

describe('parseConfirmBody', () => {
  it('true, false, null만 받는다', () => {
    expect(parseConfirmBody({ scoreConfirmed: true })).toBe(true);
    expect(parseConfirmBody({ scoreConfirmed: false })).toBe(false);
    expect(parseConfirmBody({ scoreConfirmed: null })).toBeNull();
  });
  it('다른 값은 400', () => {
    for (const body of [
      undefined,
      {},
      { scoreConfirmed: 'yes' },
      { scoreConfirmed: 1 },
    ]) {
      expect(() => parseConfirmBody(body)).toThrow(BadRequestException);
    }
  });
});
