import { BadRequestException } from '@nestjs/common';
import { parseProgress, safeVideoName } from './uploads.service.js';

describe('safeVideoName', () => {
  const none = () => false;

  it('keeps the shooting time in the name', () => {
    expect(safeVideoName('72448_31041_261101193823.MP4', none)).toBe(
      '72448_31041_261101193823.MP4',
    );
  });

  it('replaces characters unsafe for paths', () => {
    expect(safeVideoName('../경기 영상.mp4', none)).toBe('________.mp4');
  });

  it('adds a number when the name is taken', () => {
    const taken = new Set(['game.mp4', 'game-2.mp4']);
    expect(safeVideoName('game.mp4', (n) => taken.has(n))).toBe('game-3.mp4');
  });

  it('rejects files that are not videos', () => {
    expect(() => safeVideoName('notes.txt', none)).toThrow(BadRequestException);
    expect(() => safeVideoName('video', none)).toThrow(BadRequestException);
  });
});

describe('parseProgress', () => {
  it('reads the percent from track output', () => {
    expect(parseProgress('진행 37% (75초)')).toBe(37);
  });

  it('ignores other lines', () => {
    expect(parseProgress('움직임 구간 104개')).toBeNull();
  });
});
