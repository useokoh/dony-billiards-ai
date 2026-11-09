// 규칙 기반 추천 경로·실행 코칭 예시 생성기 (순수 함수, DB 없음)
//
// 입력: 샷의 실패 유형 + 코칭 난이도 (+ 샷 시작 배치). 출력: 난이도에 맞는 추천 경로 목록(권장 실행값 포함).
// 배치가 있으면 실측 보정 모델로 굴려 본 좌표·두께·방향·세기·기대 성공률을 채운다 (route-geometry.ts).
// 배치가 없으면 "이 실패 유형에서 일반적으로 시도해 볼 만한 예시"만 준다.
// 어느 쪽도 실제 사용한 회전·힘을 판정한 값이 아니다 (Docs/기술스택.md 3.3).
import type { BallName, Layout } from '../trajectory/trajectory.js';
import {
  LEVEL_HANDICAP_LABEL,
  type CoachingLevel,
  type ExecutionHint,
  type FailureKind,
  type FeedbackItem,
  type RailKind,
  type RecommendedRouteDto,
  type SpinAmount,
  type SpinSide,
  type Strength,
  type Thickness,
  type TipHeight,
} from './coaching.types.js';
import {
  planAlternatives,
  planRoute,
  type PlannedRoute,
} from './route-geometry.js';
import { loadRouteModel, type RouteModel } from './route-model.js';

/** DB의 shot 필드를 실패 유형으로 바꾼다. 실패가 아니면 null */
export function classifyFailure(shot: {
  result: string;
  failReason: string | null;
  scoreConfirmed: boolean | null;
}): FailureKind | 'success' | 'unknown' {
  // 사람이 확인한 결과가 분석기 판정보다 앞선다
  if (shot.scoreConfirmed === true) return 'success';
  if (shot.scoreConfirmed === false && shot.result !== 'fail') {
    return 'unspecified'; // 분석기는 득점 후보로 봤지만 사람이 불인정
  }
  if (shot.result === 'success') return 'success';
  if (shot.result !== 'fail') return 'unknown';
  switch (shot.failReason) {
    case 'no_first_hit':
    case 'no_second_hit':
    case 'not_enough_cushions':
      return shot.failReason;
    default:
      return 'unspecified';
  }
}

// ── 문장 조각 ─────────────────────────────────────────────

const THICKNESS_LABEL: Record<Thickness, string> = {
  '1/4': '약 1/4 두께(얇게)',
  '1/2': '약 1/2 두께',
  '3/4': '약 3/4 두께(두껍게)',
  full: '정면(풀 두께)',
};
const RAIL_LABEL: Record<RailKind, string> = {
  long: '장쿠션',
  short: '단쿠션',
};
const SIDE_LABEL: Record<SpinSide, string> = {
  none: '',
  left: '왼쪽 회전',
  right: '오른쪽 회전',
};
const TIP_LABEL: Record<TipHeight, string> = {
  upper: '상단',
  center: '중단',
  lower: '하단',
};
const AMOUNT_LABEL: Record<SpinAmount, string> = {
  none: '',
  light: '약하게',
  medium: '보통으로',
  strong: '강하게',
};
const STRENGTH_LABEL: Record<Strength, string> = {
  soft: '약하게',
  medium: '보통',
  firm: '강하게',
};

interface HintSpec {
  thickness: Thickness;
  order: RailKind[];
  side: SpinSide;
  tip: TipHeight;
  amount: SpinAmount;
  strength: Strength;
}

const BALL_LABEL: Record<BallName, string> = {
  white: '흰공',
  yellow: '노란공',
  red: '빨간공',
};
const DIRECTION_LABEL = {
  clockwise: '화면 기준 시계 방향',
  counterclockwise: '화면 기준 반시계 방향',
};
const THICKNESS_ORDER: Thickness[] = ['1/4', '1/2', '3/4', 'full'];

/** 두께를 한 단계 얇게(-1)/두껍게(+1) */
function shiftThickness(t: Thickness, shift: number): Thickness {
  const i = THICKNESS_ORDER.indexOf(t) + shift;
  return THICKNESS_ORDER[Math.max(0, Math.min(THICKNESS_ORDER.length - 1, i))];
}

/** 라벨까지 채운 ExecutionHint를 만든다. 권장값이므로 basis/verified는 고정 */
export function makeHint(spec: HintSpec, plan?: PlannedRoute): ExecutionHint {
  // 배치로 계산했으면 진행 방향 쪽 회전(순회전)을 권한다: 시계 방향 → 오른쪽, 반시계 → 왼쪽
  const side: SpinSide =
    plan?.direction && spec.side !== 'none'
      ? plan.direction === 'clockwise'
        ? 'right'
        : 'left'
      : spec.side;
  const noSpin = side === 'none' || spec.amount === 'none';
  const order =
    spec.order.length > 0
      ? spec.order.map((r) => RAIL_LABEL[r]).join(' → ')
      : '첫 목적구를 직접 맞히기';
  const direction = plan?.direction ?? null;
  return {
    firstObjectBall: plan?.firstObjectBall ?? null,
    secondObjectBall: plan?.secondObjectBall ?? null,
    firstBallThickness: {
      fraction: spec.thickness,
      label: THICKNESS_LABEL[spec.thickness],
      basis: plan ? 'layout' : 'template',
      deflectionDeg: plan?.deflectionDeg ?? null,
    },
    cushionPlan: {
      order: spec.order,
      direction,
      label: direction ? `${order} (${DIRECTION_LABEL[direction]})` : order,
    },
    spin: {
      side: noSpin ? 'none' : side,
      tipHeight: spec.tip,
      amount: noSpin ? 'none' : spec.amount,
      label: noSpin
        ? `회전 없이 ${TIP_LABEL[spec.tip]} 당점`
        : `${SIDE_LABEL[side]} 계열 ${AMOUNT_LABEL[spec.amount]}, ${TIP_LABEL[spec.tip]} 당점`,
    },
    strength: {
      level: plan?.strength ?? spec.strength,
      label: STRENGTH_LABEL[plan?.strength ?? spec.strength],
    },
    basis: 'recommended',
    verified: false,
  };
}

// ── 규칙 예시 ─────────────────────────────────────────────

interface Template {
  difficulty: CoachingLevel; // 이 경로 자체의 권장 난이도
  description: string;
  rationale: string;
  hint: HintSpec;
  /** 배치로 계산한 두께에서 몇 단계 얇게(-1)/두껍게(+1) 할지 (변형 경로 구분용) */
  thicknessShift?: number;
}

const L: RailKind = 'long';
const S: RailKind = 'short';

/** 가장 단순한 기본 경로: 장 → 단 → 장, 1/2 두께, 약한 회전, 보통 세기 */
const basic = (description: string, rationale: string): Template => ({
  difficulty: 'beginner',
  description,
  rationale,
  hint: {
    thickness: '1/2',
    order: [L, S, L],
    side: 'right',
    tip: 'center',
    amount: 'light',
    strength: 'medium',
  },
});

/** 중급 비교용: 첫 목적구를 얇게 + 회전을 더해 길이를 확보 */
const thinWithSpin = (description: string, rationale: string): Template => ({
  thicknessShift: -1,
  difficulty: 'intermediate',
  description,
  rationale,
  hint: {
    thickness: '1/4',
    order: [L, S, L],
    side: 'right',
    tip: 'center',
    amount: 'medium',
    strength: 'medium',
  },
});

/** 중급 비교용: 회전을 빼고 두께로 각도를 맞춤 */
const thickNoSpin = (description: string, rationale: string): Template => ({
  thicknessShift: 1,
  difficulty: 'intermediate',
  description,
  rationale,
  hint: {
    thickness: '3/4',
    order: [L, S, L],
    side: 'none',
    tip: 'center',
    amount: 'none',
    strength: 'medium',
  },
});

/** 고급 비교용: 반대 쿠션 순서(단 → 장 → 단), 반대 회전, 강한 세기 */
const reverseRoute = (description: string, rationale: string): Template => ({
  difficulty: 'advanced',
  description,
  rationale,
  hint: {
    thickness: '1/2',
    order: [S, L, S],
    side: 'left',
    tip: 'center',
    amount: 'medium',
    strength: 'firm',
  },
});

const TEMPLATES: Record<FailureKind, Record<CoachingLevel, Template[]>> = {
  not_enough_cushions: {
    beginner: [
      basic(
        '장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션',
        '회전에 덜 기대는 가장 단순한 경로입니다. 과도한 힘을 피하고 쿠션 수를 먼저 확보합니다.',
      ),
    ],
    intermediate: [
      basic(
        '장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션',
        '비교 기준이 되는 기본 경로입니다.',
      ),
      thinWithSpin(
        '첫 목적구를 얇게 맞히고 회전으로 길이를 확보하는 3쿠션',
        '첫 목적구를 두껍게 맞히면 수구 속도가 많이 줄어 쿠션이 모자라기 쉽습니다. 얇게 맞히고 회전을 더하면 쿠션 뒤 진행이 길어지는 쪽입니다.',
      ),
    ],
    advanced: [
      basic('장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션', '안정적인 기준 경로입니다.'),
      thinWithSpin(
        '얇은 두께 + 회전으로 길이를 확보하는 3쿠션',
        '속도를 크게 올리지 않고 두께와 회전으로 쿠션 수를 확보하는 대안입니다.',
      ),
      reverseRoute(
        '단쿠션 → 장쿠션 → 단쿠션 반대 방향 3쿠션',
        '배치에 따라 반대 방향 경로가 더 짧을 수 있어 입사각·속도 차이를 비교해 볼 후보입니다.',
      ),
    ],
  },
  no_second_hit: {
    beginner: [
      basic(
        '마지막 쿠션을 두 번째 목적구 쪽으로 보내는 기본 3쿠션',
        '첫 목적구는 맞혔으므로 두께는 기본(1/2)으로 두고, 마지막 쿠션이 두 번째 목적구를 향하게 하는 데 집중합니다.',
      ),
    ],
    intermediate: [
      basic(
        '마지막 쿠션을 두 번째 목적구 쪽으로 보내는 기본 3쿠션',
        '비교 기준이 되는 기본 경로입니다.',
      ),
      thickNoSpin(
        '회전을 빼고 두께로 마지막 쿠션 각도를 맞추는 3쿠션',
        '회전과 당점은 쿠션 뒤 각도와 길이를 함께 바꿉니다. 회전을 빼면 두께만으로 각도를 조절할 수 있어 원인을 나눠 볼 수 있습니다.',
      ),
    ],
    advanced: [
      basic(
        '마지막 쿠션을 두 번째 목적구 쪽으로 보내는 기본 3쿠션',
        '안정적인 기준 경로입니다.',
      ),
      thickNoSpin(
        '두께로 각도를 맞추는 무회전 3쿠션',
        '입사각을 두께로만 조절하는 대안으로, 속도 변화에 대한 민감도를 비교합니다.',
      ),
      reverseRoute(
        '반대 방향(단쿠션 → 장쿠션 → 단쿠션) 3쿠션',
        '두 번째 목적구 위치에 따라 반대 방향의 마지막 쿠션 각도가 더 여유로울 수 있어 비교할 후보입니다.',
      ),
    ],
  },
  no_first_hit: {
    beginner: [
      {
        ...basic(
          '첫 목적구를 정확히 맞힌 뒤 기본 3쿠션',
          '먼저 첫 목적구를 맞히는 것이 우선입니다. 회전 없이 중단 당점으로 겨냥을 단순하게 하세요.',
        ),
        hint: {
          thickness: '1/2',
          order: [L, S, L],
          side: 'none',
          tip: 'center',
          amount: 'none',
          strength: 'medium',
        },
      },
    ],
    intermediate: [
      {
        ...basic(
          '첫 목적구를 정확히 맞힌 뒤 기본 3쿠션',
          '비교 기준: 회전 없이 1/2 두께로 겨냥을 단순하게 합니다.',
        ),
        hint: {
          thickness: '1/2',
          order: [L, S, L],
          side: 'none',
          tip: 'center',
          amount: 'none',
          strength: 'medium',
        },
      },
      thickNoSpin(
        '두껍게 겨냥해 첫 접촉 확률을 높이는 3쿠션',
        '두께를 두껍게 두면 겨냥 허용 범위가 넓어져 첫 목적구를 맞히기 쉽습니다. 대신 수구 속도가 줄 수 있습니다.',
      ),
    ],
    advanced: [
      {
        ...basic(
          '첫 목적구를 정확히 맞힌 뒤 기본 3쿠션',
          '안정적인 기준: 무회전 1/2 두께.',
        ),
        hint: {
          thickness: '1/2',
          order: [L, S, L],
          side: 'none',
          tip: 'center',
          amount: 'none',
          strength: 'medium',
        },
      },
      thinWithSpin(
        '얇은 두께 + 회전으로 접촉 각을 만드는 3쿠션',
        '얇게 맞히는 대신 겨냥 오차에 민감해집니다. 회전량·속도 차이에 따른 접촉 안정성을 비교합니다.',
      ),
      reverseRoute(
        '반대 방향(단쿠션 → 장쿠션 → 단쿠션) 3쿠션',
        '첫 목적구 위치에 따라 반대 방향이 겨냥하기 쉬울 수 있어 비교할 후보입니다.',
      ),
    ],
  },
  // 원인을 알 수 없는 실패(사람이 불인정한 샷 등): 기본 경로만, 난이도별로 비교 후보를 더한다
  unspecified: {
    beginner: [
      basic(
        '장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션',
        '실패 원인이 정해지지 않아 가장 단순한 기본 경로를 권합니다.',
      ),
    ],
    intermediate: [
      basic('장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션', '기본 경로입니다.'),
      thickNoSpin(
        '회전을 빼고 두께로 각도를 맞추는 3쿠션',
        '회전 영향을 빼고 두께만으로 각도를 조절해 비교합니다.',
      ),
    ],
    advanced: [
      basic('장쿠션 → 단쿠션 → 장쿠션 기본 3쿠션', '기준 경로입니다.'),
      thinWithSpin(
        '얇은 두께 + 회전 3쿠션',
        '두께·회전 조합을 비교하는 후보입니다.',
      ),
      reverseRoute(
        '반대 방향(단쿠션 → 장쿠션 → 단쿠션) 3쿠션',
        '배치에 따라 더 유리할 수 있는 반대 방향 후보입니다.',
      ),
    ],
  },
};

export interface ShotGeometry {
  layout: Layout;
  cueBall: BallName;
}

const RAIL_ORDER_LABEL: Record<RailKind, string> = { long: '장', short: '단' };
const RATING_LABEL = { good: '모여 있음', normal: '보통', hard: '흩어짐' };

/** 배치로 계산한 경로 → 응답의 좌표·비교 값 */
function geometryFields(plan: PlannedRoute, model: RouteModel) {
  return {
    points: plan.points,
    pointsBasis: 'simulated' as const,
    confidence: model.validation.path.table.reproduce_rate,
    expectedSuccess: plan.expectedSuccess,
    comparison: {
      windowDeg: plan.windowDeg,
      cutDeg: plan.cutDeg,
      pathLengthM: Math.round(plan.lengthPx * (2.84 / 1480) * 10) / 10,
      nextLayout: plan.nextLayout,
    },
  };
}

function planSentence(plan: PlannedRoute): string {
  return `샷 시작 배치로 계산하면 ${BALL_LABEL[plan.firstObjectBall]}을 자르는 각 약 ${plan.cutDeg}°(허용 폭 ${plan.windowDeg}°)로 맞혀 수구가 약 ${plan.deflectionDeg}° 꺾여 ${BALL_LABEL[plan.secondObjectBall]}으로 갑니다.`;
}

/** 고급: 쿠션 순서·첫 목적구가 다른 후보를 기대 성공률로 비교 (템플릿 대신 계산 결과로 만든다) */
function advancedRoutes(
  geometry: ShotGeometry,
  model: RouteModel,
): RecommendedRouteDto[] {
  return planAlternatives(
    geometry.layout,
    geometry.cueBall,
    model,
    'advanced',
  ).map((plan, i) => {
    const order = plan.rails.map(
      (r) => (r === 'top' || r === 'bottom' ? 'long' : 'short') as RailKind,
    );
    const difficulty: CoachingLevel =
      plan.expectedSuccess >= 0.5
        ? 'beginner'
        : plan.expectedSuccess >= 0.25
          ? 'intermediate'
          : 'advanced';
    const spec: HintSpec = {
      thickness: plan.thickness,
      order,
      side: 'right',
      tip: 'center',
      amount: plan.windowDeg >= 3 ? 'light' : 'medium',
      strength: plan.strength,
    };
    return {
      rank: i + 1,
      difficulty,
      description: `${BALL_LABEL[plan.firstObjectBall]} 먼저 → ${order.map((k) => RAIL_ORDER_LABEL[k]).join('·')} ${order.length}쿠션 → ${BALL_LABEL[plan.secondObjectBall]}`,
      cushionCount: order.length,
      source: 'rule_template' as const,
      rationale: `${planSentence(plan)} 기대 성공률 ${Math.round(plan.expectedSuccess * 100)}%, 다음 배치는 ${RATING_LABEL[plan.nextLayout.rating]}(세 공 최대 거리 ${plan.nextLayout.spreadM}m) 예상입니다.`,
      executionHint: makeHint(spec, plan),
      ...geometryFields(plan, model),
    };
  });
}

/**
 * 실패 유형과 난이도에 맞는 추천 경로 (rank 1부터).
 * 샷 시작 배치(geometry)가 있으면 실측 보정 모델로 굴려 좌표·첫 목적구·두께·방향·강약·기대 성공률을 채운다.
 * 고급은 배치가 있으면 계산한 후보끼리 비교하고, 없으면 규칙 예시를 쓴다.
 */
export function buildRuleRoutes(
  failure: FailureKind,
  level: CoachingLevel,
  geometry?: ShotGeometry | null,
  model: RouteModel = loadRouteModel(),
): RecommendedRouteDto[] {
  if (level === 'advanced' && geometry) {
    const routes = advancedRoutes(geometry, model);
    if (routes.length > 0) return routes;
  }
  return TEMPLATES[failure][level].map((t, i) => {
    let plan = geometry
      ? planRoute(geometry.layout, geometry.cueBall, t.hint.order, model, level)
      : null;
    // 이 배치에서 템플릿 순서로 득점 경로가 없으면, 4쿠션 이내에서 기대 성공률이 가장 높은 다른 순서를 권한다
    let replaced = false;
    if (!plan && geometry && t.hint.order.length > 0) {
      plan = planRoute(geometry.layout, geometry.cueBall, [], model, level, 4);
      replaced = plan !== null;
    }
    const order: RailKind[] =
      plan && replaced
        ? plan.rails.map((r) =>
            r === 'top' || r === 'bottom' ? 'long' : 'short',
          )
        : t.hint.order;
    const spec = plan
      ? {
          ...t.hint,
          order,
          thickness: shiftThickness(plan.thickness, t.thicknessShift ?? 0),
        }
      : t.hint;
    const templateOrder = t.hint.order
      .map((k) => RAIL_ORDER_LABEL[k])
      .join('·');
    const base = {
      rank: i + 1,
      difficulty: t.difficulty,
      description:
        plan && replaced
          ? `${BALL_LABEL[plan.firstObjectBall]} 먼저 → ${order.map((k) => RAIL_ORDER_LABEL[k]).join('·')} ${order.length}쿠션 → ${BALL_LABEL[plan.secondObjectBall]}`
          : t.description,
      cushionCount: order.length,
      source: 'rule_template' as const,
      rationale: plan
        ? replaced
          ? `이 배치에서는 ${templateOrder} 순서로 4쿠션 안에 득점하는 경로가 계산되지 않아 대신 이 경로를 권합니다. ${planSentence(plan)}`
          : `${t.rationale} ${planSentence(plan)}`
        : t.rationale,
      executionHint: makeHint(spec, plan ?? undefined),
    };
    return plan
      ? { ...base, ...geometryFields(plan, model) }
      : {
          ...base,
          points: null,
          pointsBasis: null,
          confidence: null,
          expectedSuccess: null,
          comparison: null,
        };
  });
}

// ── 피드백 문장 ───────────────────────────────────────────

const FAILURE_SENTENCE: Record<FailureKind, string> = {
  no_first_hit: '수구가 첫 목적구에 닿지 않았습니다.',
  no_second_hit: '첫 목적구는 맞혔지만 두 번째 목적구를 맞히지 못했습니다.',
  not_enough_cushions: '두 번째 목적구에 닿기 전 쿠션이 3회에 못 미쳤습니다.',
  unspecified: '이 샷은 득점으로 인정되지 않았습니다.',
};

/**
 * 추천 경로로 코칭 문장을 만든다. 난이도가 높을수록 설명이 늘어난다:
 * 초급 = 경로 + 실행값, 중급 = + 이유, 고급 = + 후보 비교.
 */
export function buildFeedbackItems(
  failure: FailureKind,
  level: CoachingLevel,
  routes: RecommendedRouteDto[],
  targetHandicap: number | null,
): FeedbackItem[] {
  const top = routes[0];
  if (!top) return [];
  const label = LEVEL_HANDICAP_LABEL[level];
  const handicapText = targetHandicap === null ? label : `${targetHandicap}`;
  const hint = top.executionHint;
  const route = hint?.cushionPlan.label ?? top.description;
  const item = (kind: string, message: string): FeedbackItem => ({
    kind,
    source: 'auto',
    targetHandicap,
    message,
  });

  const items: FeedbackItem[] = [
    item(
      'route',
      `${FAILURE_SENTENCE[failure]} 목표 핸디 ${handicapText}에서는 ${route} 경로를 우선 시도하세요.`,
    ),
  ];
  if (hint) {
    const first = hint.firstObjectBall
      ? `${BALL_LABEL[hint.firstObjectBall]}(첫 목적구)을`
      : '첫 목적구를';
    items.push(
      item(
        'execution',
        `권장 실행: ${first} ${hint.firstBallThickness.label}로 맞히고, ${hint.spin.label}, 세기는 ${hint.strength.label} 쳐 보세요. (${
          hint.firstBallThickness.basis === 'layout'
            ? '두께·방향·세기는 샷 시작 배치와 이 당구대 실측 모델로 계산한 권장값이며, '
            : '권장값이며 '
        }실제 회전·힘을 판정한 것은 아닙니다)`,
      ),
    );
  }
  if (level !== 'beginner' && top.rationale) {
    items.push(item('summary', top.rationale));
  }
  if (level === 'advanced' && routes.length > 1) {
    const compare = routes
      .map((r) =>
        r.expectedSuccess !== null && r.comparison
          ? `${r.rank}순위 ${r.description}: 기대 성공률 ${Math.round(r.expectedSuccess * 100)}%, 허용 폭 ${r.comparison.windowDeg}°, 다음 배치 ${RATING_LABEL[r.comparison.nextLayout.rating]}`
          : `${r.rank}순위 ${r.description}`,
      )
      .join(' / ');
    const computed = routes.some((r) => r.expectedSuccess !== null);
    items.push(
      item(
        'summary',
        computed
          ? `후보 비교: ${compare}. 기대 성공률은 실측 보정 모델에 고급 실행 오차 가정을 넣어 굴려 본 값이고, 다음 배치는 1적구 이동 거리 실측 중앙값으로 추정한 참고값입니다.`
          : `후보 비교: ${compare}. 샷 시작 배치가 없어 기대 성공률과 다음 배치는 계산하지 못했습니다.`,
      ),
    );
  }
  return items;
}
