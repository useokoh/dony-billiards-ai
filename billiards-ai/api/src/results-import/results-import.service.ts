// 분석 결과 JSON을 SQLite에 저장한다. (DB 저장은 백엔드만 맡는다: Docs/기술스택.md 1장)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { recountMatchScores } from '../scoring/score.js';
import {
  buildShotEvents,
  buildTrajectoryRows,
  confirmationKey,
  estimateFps,
  judgeFields,
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
  trajectories: number; // 궤적이 들어간 샷 수
  replaced: boolean; // 같은 영상의 이전 기록을 지우고 다시 넣었는지
  results: { success: number; fail: number; unknown: number }; // 자동 확정 결과
  restoredConfirmations: number; // 이전 기록에서 옮긴 사람 확인 수
  lostConfirmations: number; // 같은 샷을 찾지 못해 옮기지 못한 사람 확인 수
  score: { scoreFirst: number; scoreSecond: number };
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

    // 샷별 궤적 (analyzer.trajectory 결과). 없으면 궤적 없이 가져온다
    const trajectoryFile = join(
      projectRoot,
      'data/results/trajectories',
      `${stem}.json`,
    );
    const trajectories = buildTrajectoryRows(
      existsSync(trajectoryFile)
        ? JSON.parse(readFileSync(trajectoryFile, 'utf8'))
        : null,
      data.shots,
    );

    const tableId = await this.ensureDefaultTable();

    // 여러 테이블에 나눠 쓰므로 하나라도 실패하면 전부 되돌린다.
    return this.prisma.$transaction(
      async (tx) => {
        // 지우기 전에 사람이 확인한 득점 기록을 시작 프레임 기준으로 보관한다
        const previous = await tx.shot.findMany({
          where: { match: { videoPath }, scoreConfirmed: { not: null } },
          select: { startFrame: true, scoreConfirmed: true },
        });
        const kept = new Map(
          previous.map((p) => [
            confirmationKey(p.startFrame),
            p.scoreConfirmed,
          ]),
        );

        // 경기에 연결한 플레이어도 옮긴다
        const previousMatch = await tx.match.findFirst({
          where: { videoPath },
          orderBy: { id: 'desc' },
          select: {
            firstPlayer: true,
            secondPlayer: true,
            firstPlayerId: true,
            secondPlayerId: true,
          },
        });

        // 같은 영상을 다시 가져오면 이전 경기를 지우고 새로 넣는다. (하위 행은 Cascade로 같이 삭제)
        const removed = await tx.match.deleteMany({ where: { videoPath } });

        const match = await tx.match.create({
          data: {
            tableId,
            playedAt: playedAtFromFileName(data.video) ?? new Date(),
            firstCueBall: data.shots[0]?.cue_ball ?? null,
            ...previousMatch,
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
        let restored = 0;
        const results = { success: 0, fail: 0, unknown: 0 };
        for (const s of data.shots) {
          const judge = judgeFields(s);
          results[judge.result as keyof typeof results] += 1;
          const key = confirmationKey(s.start_frame);
          const scoreConfirmed = kept.get(key) ?? null;
          if (kept.has(key)) restored += 1;

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
              scoreCandidate: s.score_candidate,
              // ⑨ 득점 자동 확정 (analyzer/judge.py)과 이전에 사람이 확인한 값
              ...judge,
              scoreConfirmed,
              events: { create: shotEvents },
              trajectories: trajectories.has(s.shot_no)
                ? { create: trajectories.get(s.shot_no) }
                : undefined,
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

        // 점수: 사람 확인 > 자동 확정 기준으로 이닝별·경기 전체를 센다
        const { match: score } = await recountMatchScores(tx, match.id);

        return {
          matchId: match.id,
          video: data.video,
          innings: inningNos.length,
          shots: data.shots.length,
          events,
          clips,
          trajectories: trajectories.size,
          replaced: removed.count > 0,
          results,
          restoredConfirmations: restored,
          lostConfirmations: kept.size - restored,
          score,
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
