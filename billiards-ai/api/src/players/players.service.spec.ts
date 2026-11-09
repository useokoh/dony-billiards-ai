import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { parsePlayerBody, PlayersService } from './players.service.js';

describe('parsePlayerBody', () => {
  it('생성: name 필수, 이름은 공백 제거', () => {
    expect(
      parsePlayerBody({ name: ' 도니 ', targetHandicap: 20 }, false),
    ).toEqual({
      name: '도니',
      targetHandicap: 20,
    });
    expect(() => parsePlayerBody({}, false)).toThrow(BadRequestException);
  });
  it('수정: 보낸 필드만 통과, null로 지우기 허용', () => {
    expect(parsePlayerBody({ targetHandicap: null }, true)).toEqual({
      targetHandicap: null,
    });
    expect(parsePlayerBody({}, true)).toEqual({});
  });
  it.each([
    [{ name: '' }],
    [{ name: 3 }],
    [{ name: 'a', targetHandicap: 20.5 }],
    [{ name: 'a', targetHandicap: '20' }],
    [{ name: 'a', currentHandicap: -1 }],
    [{ name: 'a', coachingLevel: 'expert' }],
    [[]],
    [null],
  ])('잘못된 본문은 400: %j', (body) => {
    expect(() => parsePlayerBody(body, false)).toThrow(BadRequestException);
  });
});

describe('PlayersService', () => {
  const prisma = {
    player: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const service = new PlayersService(prisma as unknown as PrismaService);
  beforeEach(() => vi.resetAllMocks());

  it('난이도를 생략하면 목표 핸디에서 계산해 저장', async () => {
    await service.create({ name: 'a', targetHandicap: 27 });
    expect(prisma.player.create.mock.calls[0][0].data).toEqual({
      name: 'a',
      currentHandicap: null,
      targetHandicap: 27,
      coachingLevel: 'intermediate',
    });
  });
  it('직접 준 난이도가 계산값보다 우선', async () => {
    await service.create({
      name: 'a',
      targetHandicap: 27,
      coachingLevel: 'advanced',
    });
    expect(prisma.player.create.mock.calls[0][0].data.coachingLevel).toBe(
      'advanced',
    );
  });
  it('핸디 없이 만들면 난이도도 null', async () => {
    await service.create({ name: 'a' });
    expect(prisma.player.create.mock.calls[0][0].data).toMatchObject({
      targetHandicap: null,
      coachingLevel: null,
    });
  });

  it('없는 플레이어는 404', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    await expect(service.update(1, { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
  });
  it('수정: 목표 핸디만 바꾸면 난이도 재계산, 같이 보내면 그 값 유지', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 1 });
    await service.update(1, { targetHandicap: 30 });
    expect(prisma.player.update.mock.calls[0][0].data).toEqual({
      targetHandicap: 30,
      coachingLevel: 'advanced',
    });
    await service.update(1, { targetHandicap: 30, coachingLevel: 'beginner' });
    expect(prisma.player.update.mock.calls[1][0].data.coachingLevel).toBe(
      'beginner',
    );
    await service.update(1, { name: '새이름' });
    expect(prisma.player.update.mock.calls[2][0].data).toEqual({
      name: '새이름',
    });
    await service.update(1, { targetHandicap: null });
    expect(prisma.player.update.mock.calls[3][0].data.coachingLevel).toBeNull();
  });
});
