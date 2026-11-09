// 환경 점검 API: DB, Python(OpenCV), FFmpeg가 동작하는지 알려 준다.
import { spawnSync } from 'node:child_process';
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// 외부 프로그램을 실행해 결과 첫 줄을 돌려준다. 실패하면 null.
function runTool(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) return null;
  return result.stdout.split('\n')[0].trim();
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const stores = await this.prisma.store.count();
    return {
      api: 'ok',
      database: { ok: true, stores },
      opencv: runTool(process.env.PYTHON_PATH ?? 'python3', [
        '-c',
        'import cv2; print(cv2.__version__)',
      ]),
      ffmpeg: runTool(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-version']),
    };
  }
}
