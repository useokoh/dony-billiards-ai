// 터미널에서 분석 결과 JSON을 DB에 넣는 명령
// 사용법 (api 폴더에서):
//   npm run import:results                         → data/results/shots/*.json 전부
//   npm run import:results -- ../data/results/shots/파일.json  → 지정한 파일만
import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ResultsImportModule } from '../results-import/results-import.module.js';
import { ResultsImportService } from '../results-import/results-import.service.js';

// 이 파일은 빌드 후 api/dist/cli/에 있으므로 세 단계 위가 billiards-ai 폴더이다.
const PROJECT_ROOT = resolve(import.meta.dirname, '../../..');

async function main() {
  const args = process.argv.slice(2);
  const shotsDir = join(PROJECT_ROOT, 'data/results/shots');
  const files = args.length
    ? args.map((f) => resolve(f))
    : readdirSync(shotsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(shotsDir, f));

  if (!files.length) {
    console.log(`가져올 JSON이 없습니다: ${shotsDir}`);
    return;
  }

  const app = await NestFactory.createApplicationContext(ResultsImportModule, {
    logger: ['error', 'warn'],
  });
  const importer = app.get(ResultsImportService);

  let failed = 0;
  for (const file of files) {
    try {
      const r = await importer.importFile(file, PROJECT_ROOT);
      console.log(
        `${r.replaced ? '다시 저장' : '저장'}: ${r.video} → 경기 ${r.matchId}, ` +
          `이닝 ${r.innings}, 샷 ${r.shots}, 사건 ${r.events}, 샷 영상 ${r.clips}`,
      );
    } catch (err) {
      failed += 1;
      console.error(`실패: ${file}\n  ${(err as Error).message}`);
    }
  }
  await app.close();
  if (failed) process.exitCode = 1;
}

await main();
