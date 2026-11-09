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
  // ⑨ 득점 자동 확정 (analyzer/judge.py). 이전 결과 파일에는 없을 수 있다
  result?: 'success' | 'fail';
  fail_reason?: 'no_first_hit' | 'no_second_hit' | 'not_enough_cushions' | null;
  score_basis?: 'agree' | 'turn' | 'physics';
  score_confidence?: number;
  inning_no: number;
  player: 'first' | 'second';
  shot_no_in_turn: number;
  shot_no_in_inning: number;
  clip?: { path: string; start_sec: number; length_sec: number } | null;
}

/** analyzer/trajectory.py 결과: data/results/trajectories/*.json */
export interface TrajectoryShotJson {
  shot_no: number;
  start_frame: number;
  step: number;
  last_frame: number;
  balls: Record<string, { points: [number, number][]; estimated: number[] }>;
}

export interface TrajectoryFileJson {
  video: string;
  step: number;
  shots: TrajectoryShotJson[];
}

export interface ResultFileJson {
  video: string; // 영상 파일 이름 (data/videos/ 안)
  shots: ShotJson[];
  other_moves?: unknown[]; // 샷이 아닌 움직임 구간 (DB에 넣지 않음)
  turn_agreement?: Record<string, number>; // 검증용 수치 (DB에 넣지 않음)
  judge_summary?: Record<string, number>; // 득점 확정 집계 (DB에 넣지 않음)
}
