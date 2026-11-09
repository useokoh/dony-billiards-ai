// 분석 JSON → DB 행 변환 (DB 없이 테스트할 수 있도록 순수 함수로 분리)
import type { Ball, ResultFileJson, ShotJson } from './result-file.types.js';

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
