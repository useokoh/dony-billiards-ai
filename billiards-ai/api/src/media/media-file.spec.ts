import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { resolveMediaPath } from './media-file.js';

describe('resolveMediaPath', () => {
  // 임시 billiards-ai 폴더: data/clips/a.mp4, 그리고 data 밖에 secret.txt
  const root = mkdtempSync(join(tmpdir(), 'media-'));
  mkdirSync(join(root, 'data/clips'), { recursive: true });
  writeFileSync(join(root, 'data/clips/a.mp4'), 'x');
  writeFileSync(join(root, 'secret.txt'), 'x');

  it('data 안의 파일은 절대 경로로 돌려준다', () => {
    expect(resolveMediaPath('data/clips/a.mp4', root)).toBe(
      join(root, 'data/clips/a.mp4'),
    );
  });

  it('data 밖으로 나가는 경로는 거부한다', () => {
    expect(() => resolveMediaPath('data/../secret.txt', root)).toThrow(
      NotFoundException,
    );
    expect(() => resolveMediaPath('/etc/passwd', root)).toThrow(
      NotFoundException,
    );
    expect(() => resolveMediaPath('data', root)).toThrow(NotFoundException);
  });

  it('없는 파일은 404', () => {
    expect(() => resolveMediaPath('data/clips/none.mp4', root)).toThrow(
      NotFoundException,
    );
  });
});
