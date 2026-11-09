// 분석기(analyzer/shots.py + innings.py + clips.py)가 만드는 data/results/shots/*.json 형식

export type Ball = 'white' | 'yellow' | 'red';

export interface ShotJson {
  shot_no: number;
  start_frame: number;
  end_frame: number;
  start_sec: number;
  end_sec: number;
  rest_sec?: number | null;
  cue_ball: 'white' | 'yellow';
  cushion_count: number;
  cushion_frames: number[];
  hit_order: Ball[];
  hit_frames: number[];
  cushions_before_second_hit?: number | null;
  score_candidate: boolean;
  inning_no: number;
  player: 'first' | 'second';
  shot_no_in_turn: number;
  shot_no_in_inning: number;
  clip?: { path: string; start_sec: number; length_sec: number } | null;
}

export interface ResultFileJson {
  video: string; // 영상 파일 이름 (data/videos/ 안)
  shots: ShotJson[];
  other_moves?: unknown[]; // 샷이 아닌 움직임 구간 (DB에 넣지 않음)
  turn_agreement?: Record<string, number>; // 검증용 수치 (DB에 넣지 않음)
}
