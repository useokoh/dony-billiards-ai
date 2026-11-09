import {
  buildShotEvents,
  estimateFps,
  playedAtFromFileName,
  validateResultFile,
} from './result-mapper.js';
import type { ShotJson } from './result-file.types.js';

// 실제 분석 결과(영상1 샷1)를 줄인 예시
const shot: ShotJson = {
  shot_no: 1,
  start_frame: 534,
  end_frame: 908,
  start_sec: 17.77,
  end_sec: 30.17,
  rest_sec: 31.6,
  cue_ball: 'white',
  cushion_count: 4,
  cushion_frames: [574, 579, 648, 829],
  hit_order: ['red', 'yellow'],
  hit_frames: [551, 728],
  cushions_before_second_hit: 3,
  score_candidate: true,
  inning_no: 1,
  player: 'first',
  shot_no_in_turn: 1,
  shot_no_in_inning: 1,
};

describe('playedAtFromFileName', () => {
  it('파일 이름 끝의 yyMMddHHmmss를 촬영 시각으로 읽는다', () => {
    const d = playedAtFromFileName('72448_31041_261101193823.MP4')!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([
      2026, 11, 1,
    ]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([
      19, 38, 23,
    ]);
  });

  it('형식이 다르거나 없는 날짜면 null', () => {
    expect(playedAtFromFileName('test01.mp4')).toBeNull();
    expect(playedAtFromFileName('x_261332193823.MP4')).toBeNull();
  });
});

describe('buildShotEvents', () => {
  it('쿠션과 맞힘을 프레임 순서로 합치고 맞힌 공을 붙인다', () => {
    const events = buildShotEvents(shot, 30);
    expect(events.map((e) => [e.kind, e.frameNo, e.target])).toEqual([
      ['hit', 551, 'red'],
      ['cushion', 574, null],
      ['cushion', 579, null],
      ['cushion', 648, null],
      ['hit', 728, 'yellow'],
      ['cushion', 829, null],
    ]);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events[0].tSec).toBe(18.37);
  });

  it('같은 프레임이면 맞힘을 먼저 둔다', () => {
    const same = {
      ...shot,
      cushion_frames: [551],
      hit_frames: [551],
      hit_order: ['red' as const],
    };
    expect(buildShotEvents(same, 30).map((e) => e.kind)).toEqual([
      'hit',
      'cushion',
    ]);
  });
});

describe('estimateFps', () => {
  it('프레임 번호가 가장 큰 샷으로 fps를 계산한다', () => {
    const later = { ...shot, start_frame: 60200, start_sec: 2000.0 };
    expect(estimateFps([shot, later])).toBeCloseTo(30.1, 2);
    expect(estimateFps([])).toBeNull();
  });
});

describe('validateResultFile', () => {
  it('필수 항목이 없으면 이유와 함께 실패한다', () => {
    expect(() => validateResultFile({ shots: [] }, 'a.json')).toThrow('video');
    const bad = { video: 'v.MP4', shots: [{ ...shot, hit_order: ['red'] }] };
    expect(() => validateResultFile(bad, 'a.json')).toThrow('길이');
  });
});
