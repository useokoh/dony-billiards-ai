// 분석 결과 JSON을 SQLite에 저장한다. (DB 저장은 백엔드만 맡는다: Docs/기술스택.md 1장)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildShotEvents,
  estimateFps,
  playedAtFromFileName,
  validateResultFile,
} from './result-mapper.js';

// 기본 매장·당구대: 아직 매장 등록 화면이 없어서 가져오기 때 하나 만들어 둔다.
const DEFAULT_STORE = '테스트 매장';
const DEFAULT_TABLE = '1번 당구대';

export interface ImportSummary {
  matchId: number;
  video: string;
  innings: number;
  shots: number;
  events: number;
  clips: number;
  replaced: boolean; // 같은 영상의 이전 기록을 지우고 다시 넣었는지
}

/** ffprobe로 영상의 fps와 길이를 읽는다. 실패하면 null. */
function probeVideo(
  videoFile: string,
): { fps: number; durationSec: number } | null {
  const result = spawnSync(
    process.env.FFPROBE_PATH ?? 'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=avg_frame_rate:format=duration',
      '-of',
      'json',
      videoFile,
    ],
    { encoding: 'utf8', timeout: 20000 },
  );
  if (result.status !== 0) return null;
  try {
    const info = JSON.parse(result.stdout);
    const [num, den] = String(info.streams[0].avg_frame_rate)
      .split('/')
      .map(Number);
    const fps = den ? num / den : num;
    const durationSec = Number(info.format.duration);
    return Number.isFinite(fps) && fps > 0 ? { fps, durationSec } : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ResultsImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param resultFile data/results/shots/*.json 경로
   * @param projectRoot billiards-ai 폴더 (DB에는 이 폴더 기준 상대 경로를 저장)
   */
  async importFile(
    resultFile: string,
    projectRoot: string,
  ): Promise<ImportSummary> {
    const data = validateResultFile(
      JSON.parse(readFileSync(resultFile, 'utf8')),
      resultFile,
    );
    const videoPath = `data/videos/${data.video}`;
    const stem = data.video.replace(/\.[^.]+$/, '');

    const probe = probeVideo(join(projectRoot, videoPath));
    const fps = probe?.fps ?? estimateFps(data.shots);
    if (!fps) throw new Error(`${resultFile}: fps를 알 수 없습니다.`);

    const tableId = await this.ensureDefaultTable();

    // 여러 테이블에 나눠 쓰므로 하나라도 실패하면 전부 되돌린다.
    return this.prisma.$transaction(
      async (tx) => {
        // 같은 영상을 다시 가져오면 이전 경기를 지우고 새로 넣는다. (하위 행은 Cascade로 같이 삭제)
        const removed = await tx.match.deleteMany({ where: { videoPath } });

        const match = await tx.match.create({
          data: {
            tableId,
            playedAt: playedAtFromFileName(data.video) ?? new Date(),
            firstCueBall: data.shots[0]?.cue_ball ?? null,
            videoPath,
            fps,
            durationSec: probe?.durationSec ?? null,
            trackPath: `data/results/tracks/${stem}/track.npz`,
            status: 'done',
            progress: 100,
          },
        });

        // 이닝 먼저 만들고, 이닝 번호 → id 표를 만든다.
        const inningNos = [...new Set(data.shots.map((s) => s.inning_no))].sort(
          (a, b) => a - b,
        );
        const inningIds = new Map<number, number>();
        for (const inningNo of inningNos) {
          const inning = await tx.inning.create({
            data: { matchId: match.id, inningNo },
          });
          inningIds.set(inningNo, inning.id);
        }

        let events = 0;
        let clips = 0;
        for (const s of data.shots) {
          const shotEvents = buildShotEvents(s, fps);
          events += shotEvents.length;
          if (s.clip) clips += 1;

          await tx.shot.create({
            data: {
              matchId: match.id,
              inningId: inningIds.get(s.inning_no)!,
              shotNo: s.shot_no,
              shotNoInInning: s.shot_no_in_inning,
              shotNoInTurn: s.shot_no_in_turn,
              player: s.player,
              cueBall: s.cue_ball,
              startFrame: s.start_frame,
              endFrame: s.end_frame,
              startSec: s.start_sec,
              endSec: s.end_sec,
              restSec: s.rest_sec ?? null,
              cushionCount: s.cushion_count,
              cushionsBeforeSecondHit: s.cushions_before_second_hit ?? null,
              hitOrder: JSON.stringify(s.hit_order),
              // result, failReason은 5단계(실패 원인)에서 채운다. 지금은 기본값 unknown.
              scoreCandidate: s.score_candidate,
              events: { create: shotEvents },
              clip: s.clip
                ? {
                    create: {
                      matchId: match.id,
                      filePath: s.clip.path,
                      startSec: s.clip.start_sec,
                      endSec:
                        Math.round(
                          (s.clip.start_sec + s.clip.length_sec) * 100,
                        ) / 100,
                    },
                  }
                : undefined,
            },
          });
        }

        return {
          matchId: match.id,
          video: data.video,
          innings: inningNos.length,
          shots: data.shots.length,
          events,
          clips,
          replaced: removed.count > 0,
        };
      },
      { timeout: 60000 },
    );
  }

  /** 기본 매장과 당구대를 찾고, 없으면 만든다. 당구대 id를 돌려준다. */
  private async ensureDefaultTable(): Promise<number> {
    const store =
      (await this.prisma.store.findFirst({ where: { name: DEFAULT_STORE } })) ??
      (await this.prisma.store.create({ data: { name: DEFAULT_STORE } }));
    const table =
      (await this.prisma.billiardTable.findFirst({
        where: { storeId: store.id, name: DEFAULT_TABLE },
      })) ??
      (await this.prisma.billiardTable.create({
        data: { storeId: store.id, name: DEFAULT_TABLE },
      }));
    return table.id;
  }
}
