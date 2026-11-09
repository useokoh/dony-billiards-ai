// 영상 파일 보내기: DB에 저장된 상대 경로(billiards-ai 기준)를 실제 파일로 바꿔 전송한다.
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';

/** billiards-ai 폴더. api 폴더에서 실행하므로 기본값은 '..' */
export function projectRoot(): string {
  return resolve(process.env.PROJECT_ROOT ?? '..');
}

/**
 * DB의 상대 경로를 절대 경로로 바꾼다.
 * data/ 폴더 밖을 가리키거나 파일이 없으면 404.
 */
export function resolveMediaPath(
  storedPath: string,
  root = projectRoot(),
): string {
  const dataDir = resolve(root, 'data');
  const full = resolve(root, storedPath);
  const rel = relative(dataDir, full);
  // '../'로 빠져나가거나 다른 드라이브(절대 경로)면 거부
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new NotFoundException('영상 파일을 찾을 수 없습니다');
  }
  if (!existsSync(full)) {
    throw new NotFoundException('영상 파일을 찾을 수 없습니다');
  }
  return full;
}

/**
 * 영상 전송. Express sendFile이 Range 요청(구간 이동)을 자동으로 처리한다.
 * 확장자가 대문자(.MP4)여도 video/mp4로 보낸다.
 */
export function sendVideo(res: Response, fullPath: string): void {
  res.type('video/mp4');
  res.sendFile(fullPath, (err) => {
    // 재생 중 사용자가 영상을 닫으면 연결이 끊겨 오류가 나는데, 정상 상황이라 무시한다.
    if (err && !res.headersSent) {
      res
        .status(404)
        .json({ statusCode: 404, message: '영상을 보낼 수 없습니다' });
    }
  });
}
