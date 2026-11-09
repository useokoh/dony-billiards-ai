// 추천 경로·실행 코칭 응답 계약 (Docs/기술스택.md 3.3, 3.4, 7.1)
//
// 중요: 아래 값은 모두 "권장값"이다. 영상만으로 선수가 실제로 준 회전·힘을 알 수 없으므로
// 실제 동작을 판정한 값처럼 쓰지 않는다 (basis는 항상 'recommended', verified는 항상 false).

/** 코칭 난이도: 목표 핸디 초급 20 / 중급 27 / 고급 27+ */
export type CoachingLevel = 'beginner' | 'intermediate' | 'advanced';

export const COACHING_LEVELS: readonly CoachingLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
];

/** 난이도 → 화면에 보여 줄 대표 목표 핸디 */
export const LEVEL_HANDICAP_LABEL: Record<CoachingLevel, string> = {
  beginner: '20',
  intermediate: '27',
  advanced: '27+',
};

/** 난이도가 어디서 정해졌는지 (우선순위: level > handicap > player > default) */
export type LevelSource =
  'query-level' | 'query-handicap' | 'player' | 'default';

/** 첫 목적구 두께: 1/4(얇게) ~ full(정면) */
export type Thickness = '1/4' | '1/2' | '3/4' | 'full';
export type RailKind = 'long' | 'short'; // 장쿠션 / 단쿠션
export type SpinSide = 'none' | 'left' | 'right';
export type TipHeight = 'upper' | 'center' | 'lower';
export type SpinAmount = 'none' | 'light' | 'medium' | 'strong';
export type Strength = 'soft' | 'medium' | 'firm';

/** 실행 코칭: 첫 목적구 두께, 쿠션 순서·방향, 권장 회전 방향·당점·강약 */
export interface ExecutionHint {
  /** 먼저 맞힐 공 / 마지막에 맞힐 공. 샷 시작 배치가 없으면 null */
  firstObjectBall: 'white' | 'yellow' | 'red' | null;
  secondObjectBall: 'white' | 'yellow' | 'red' | null;
  firstBallThickness: {
    fraction: Thickness;
    label: string;
    /** layout: 배치로 계산한 꺾임 각에서 구함(무회전 기준), template: 실패 유형별 예시 */
    basis: 'layout' | 'template';
    deflectionDeg: number | null; // 첫 목적구 뒤 수구가 꺾이는 각 (layout일 때)
  };
  cushionPlan: {
    order: RailKind[]; // 쿠션 순서. 첫 목적구를 먼저 직접 맞히는 경로는 빈 배열
    /** 화면 기준 진행 방향. 샷 시작 배치가 없거나 정할 수 없으면 null */
    direction: 'clockwise' | 'counterclockwise' | null;
    label: string;
  };
  spin: {
    side: SpinSide;
    tipHeight: TipHeight;
    amount: SpinAmount;
    label: string;
  };
  strength: { level: Strength; label: string };
  basis: 'recommended'; // 권장값. 영상에서 실제 회전·힘을 판정한 값이 아님
  verified: false; // 결과·이용자 확인으로 검증되기 전
}

/** 추천 경로 1개 */
export interface RecommendedRouteDto {
  rank: number;
  difficulty: CoachingLevel;
  description: string;
  cushionCount: number;
  /** 경로 좌표(당구대 기준 0~1): 수구 → 첫 목적구 → 쿠션 접점 → 두 번째 목적구. 배치가 없으면 null */
  points: [number, number][] | null;
  /** simulated: 실측 보정 모델로 굴려 본 경로, stored: 분석기 저장값 */
  pointsBasis: 'simulated' | 'stored' | null;
  /**
   * 경로 모델 신뢰도 0~1: 실측 보정 모델이 실제 득점 경로를 재현한 비율(영상별 교차 검증).
   * 회전 판정 정확도가 아니다. 배치 없는 규칙 예시는 null
   */
  confidence: number | null;
  /** 기대 성공률 0~1: 난이도별 실행 오차 가정을 넣고 다시 굴려 본 득점 비율. 계산 못 하면 null */
  expectedSuccess: number | null;
  /** 경로 비교 값 (배치로 계산했을 때만) */
  comparison: RouteComparison | null;
  /** rule_template: 실패 유형×난이도 규칙 예시, stored: DB에 저장된 분석기 결과 */
  source: 'rule_template' | 'stored';
  /** 왜 이 경로·두께·회전을 권하는지 */
  rationale: string;
  executionHint: ExecutionHint | null;
}

export interface RouteComparison {
  windowDeg: number; // 득점이 되는 두께(자르는 각) 허용 폭, 도
  cutDeg: number; // 겨냥할 자르는 각 (0 = 정면)
  pathLengthM: number; // 첫 목적구 뒤 수구가 굴러가는 거리 (m)
  /** 다음 배치 추정: 1적구는 실측 이동 거리 중앙값, 수구는 두 번째 목적구 접점에서 멈춘다고 가정 */
  nextLayout: {
    cueEnd: [number, number];
    objectBallEnd: [number, number];
    secondBall: [number, number];
    spreadM: number;
    rating: 'good' | 'normal' | 'hard';
  };
}

export type FailureKind =
  'no_first_hit' | 'no_second_hit' | 'not_enough_cushions' | 'unspecified'; // 실패지만 원인을 모름 (예: 사람이 불인정한 샷)

export interface RouteResponse {
  shotId: number;
  level: CoachingLevel;
  levelSource: LevelSource;
  targetHandicap: number | null; // handicap·player로 정해졌을 때의 실제 입력값
  targetHandicapLabel: string; // 20 / 27 / 27+
  /** 샷 시작 배치 (공 3개 위치 0~1). 궤적이 없으면 null */
  layout: Record<'white' | 'yellow' | 'red', [number, number]> | null;
  /** 실패 샷만 추천 대상. 아니면 false와 사유 */
  applicable: boolean;
  reason: 'shot_succeeded' | 'result_unknown' | null;
  failure: FailureKind | null;
  routes: RecommendedRouteDto[];
  disclaimer: string;
}

export interface FeedbackItem {
  kind: string; // 자동 생성: route / execution / summary, 저장된 피드백은 자유 형식
  source: 'auto' | 'user';
  targetHandicap: number | null;
  message: string;
}

export interface FeedbackResponse {
  shotId: number;
  level: CoachingLevel;
  levelSource: LevelSource;
  targetHandicapLabel: string;
  applicable: boolean;
  items: FeedbackItem[];
  disclaimer: string;
}

export const COACHING_DISCLAIMER =
  '권장값입니다. 영상만으로 실제 회전·힘을 판정한 것이 아니며, 공 배치와 규칙에 따른 참고용 가설입니다.';
