// 분석 JSON → DB 행 변환 (DB 없이 테스트할 수 있도록 순수 함수로 분리)
import type {
  Ball,
  ResultFileJson,
  ShotJson,
  TrajectoryFileJson,
} from './result-file.types.js';

export interface ShotEventRow {
  seq: number;
  kind: 'cushion' | 'hit';
  frameNo: number;
  tSec: number;
  target: Ball | null;
}

/**
 * 영상 파일 이름 끝의 yyMMddHHmmss를 촬영 시각으로 읽는다.
 * 예: 72448_31041_261101193823.MP4 → 2026-11-01 19:38:23 (Mac 현지 시각)
 * 형식이 다르면 null.
 */
export function playedAtFromFileName(fileName: string): Date | null {
  const m = /(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.[^.]+$/.exec(fileName);
  if (!m) return null;
  const [yy, MM, dd, HH, mm, ss] = m.slice(1).map(Number);
  const date = new Date(2000 + yy, MM - 1, dd, HH, mm, ss);
  // 13월, 32일처럼 맞지 않는 값이면 Date가 날짜를 넘겨 버리므로 되돌려 확인한다.
  if (date.getMonth() !== MM - 1 || date.getDate() !== dd) return null;
  return date;
}

/**
 * ffprobe를 못 쓸 때 쓰는 예비 fps 계산.
 * start_sec가 소수 둘째 자리로 반올림돼 있어 프레임 번호가 가장 큰 샷으로 나눠 오차를 줄인다.
 */
export function estimateFps(shots: ShotJson[]): number | null {
  const last = shots.reduce<ShotJson | null>(
    (best, s) => (best && best.start_frame >= s.start_frame ? best : s),
    null,
  );
  if (!last || last.start_sec <= 0) return null;
  return last.start_frame / last.start_sec;
}

/** 쿠션 접촉과 공 맞힘을 프레임 순서대로 합친다. 같은 프레임이면 맞힘을 먼저 둔다. */
export function buildShotEvents(shot: ShotJson, fps: number): ShotEventRow[] {
  const hits = shot.hit_frames.map((frameNo, i) => ({
    kind: 'hit' as const,
    frameNo,
    target: shot.hit_order[i] ?? null,
  }));
  const cushions = shot.cushion_frames.map((frameNo) => ({
    kind: 'cushion' as const,
    frameNo,
    target: null,
  }));
  return [...hits, ...cushions]
    .sort((a, b) => a.frameNo - b.frameNo || (a.kind === 'hit' ? -1 : 1))
    .map((e, i) => ({
      seq: i + 1,
      kind: e.kind,
      frameNo: e.frameNo,
      tSec: Math.round((e.frameNo / fps) * 100) / 100,
      target: e.target,
    }));
}

/** 가져오기 전에 꼭 필요한 값이 있는지 확인한다. 문제가 있으면 이유를 담아 오류를 던진다. */
export function validateResultFile(
  data: unknown,
  source: string,
): ResultFileJson {
  const d = data as Partial<ResultFileJson>;
  if (!d || typeof d.video !== 'string' || !Array.isArray(d.shots)) {
    throw new Error(`${source}: video 또는 shots 항목이 없습니다.`);
  }
  for (const s of d.shots) {
    if (typeof s.shot_no !== 'number' || typeof s.inning_no !== 'number') {
      throw new Error(
        `${source}: shot_no 또는 inning_no가 없는 샷이 있습니다.`,
      );
    }
    if (s.hit_frames.length !== s.hit_order.length) {
      throw new Error(
        `${source}: 샷 ${s.shot_no}의 hit_frames와 hit_order 길이가 다릅니다.`,
      );
    }
  }
  return d as ResultFileJson;
}

export interface JudgeFields {
  result: string;
  failReason: string | null;
  scoreBasis: string | null;
  scoreConfidence: number | null;
}

const RESULTS = ['success', 'fail'];
const FAIL_REASONS = ['no_first_hit', 'no_second_hit', 'not_enough_cushions'];
const BASES = ['agree', 'turn', 'physics'];

/** 분석기의 득점 자동 확정 값 → DB 값. 없거나 모르는 값이면 판정 전(unknown)으로 둔다 */
export function judgeFields(shot: ShotJson): JudgeFields {
  if (!shot.result || !RESULTS.includes(shot.result)) {
    return {
      result: 'unknown',
      failReason: null,
      scoreBasis: null,
      scoreConfidence: null,
    };
  }
  const c = shot.score_confidence;
  return {
    result: shot.result,
    failReason:
      shot.result === 'fail' &&
      shot.fail_reason &&
      FAIL_REASONS.includes(shot.fail_reason)
        ? shot.fail_reason
        : null,
    scoreBasis:
      shot.score_basis && BASES.includes(shot.score_basis)
        ? shot.score_basis
        : null,
    scoreConfidence: typeof c === 'number' && c >= 0 && c <= 1 ? c : null,
  };
}

/** 다시 가져오기 때 사람이 확인한 기록을 옮기기 위한 열쇠: 시작 프레임 (샷 번호는 바뀔 수 있다) */
export function confirmationKey(startFrame: number): string {
  return String(startFrame);
}

export interface TrajectoryRow {
  ball: string;
  startFrame: number;
  step: number;
  points: string;
  estimated: string;
}

const BALL_NAMES = ['white', 'yellow', 'red'];

/**
 * 궤적 파일 → 샷 번호별 Trajectory 행. 시작 프레임이 다른 샷(분석을 다시 돌려 어긋난 파일)은 넣지 않는다.
 * 좌표가 0~1 범위의 [x, y]가 아니거나 estimated 길이가 다르면 그 공은 건너뛴다.
 */
export function buildTrajectoryRows(
  file: TrajectoryFileJson | null,
  shots: ShotJson[],
): Map<number, TrajectoryRow[]> {
  const out = new Map<number, TrajectoryRow[]>();
  if (!file || !Array.isArray(file.shots)) return out;
  const startByShot = new Map(shots.map((s) => [s.shot_no, s.start_frame]));
  for (const t of file.shots) {
    if (startByShot.get(t.shot_no) !== t.start_frame) continue;
    const rows: TrajectoryRow[] = [];
    for (const ball of BALL_NAMES) {
      const b = t.balls?.[ball];
      if (!b || !Array.isArray(b.points) || b.points.length === 0) continue;
      const valid = b.points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every((n) => typeof n === 'number' && n >= 0 && n <= 1),
      );
      if (!valid || b.estimated?.length !== b.points.length) continue;
      rows.push({
        ball,
        startFrame: t.start_frame,
        step: t.step,
        points: JSON.stringify(b.points),
        estimated: JSON.stringify(b.estimated),
      });
    }
    if (rows.length) out.set(t.shot_no, rows);
  }
  return out;
}
