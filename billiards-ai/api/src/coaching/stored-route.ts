// DB(recommended_routes)에 저장된 분석기 결과를 응답 계약으로 바꾼다.
// 저장된 JSON은 믿지 않고 형태를 확인하며, 권장값 표시(basis/verified)는 항상 덮어쓴다.
import { isCoachingLevel } from './coaching-level.js';
import type {
  CoachingLevel,
  ExecutionHint,
  RecommendedRouteDto,
} from './coaching.types.js';

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = (v: unknown, allowed: readonly string[]) =>
  isStr(v) && allowed.includes(v);

/** 저장된 execution_hint JSON 검사. 형태가 어긋나면 null (verified/basis는 신뢰하지 않고 고정) */
export function parseExecutionHint(value: string | null): ExecutionHint | null {
  const h = parseJson(value);
  if (!isRecord(h)) return null;
  const { firstBallThickness: t, cushionPlan: c, spin, strength: s } = h;
  if (!isRecord(t) || !isRecord(c) || !isRecord(spin) || !isRecord(s)) {
    return null;
  }
  const order = c.order;
  if (
    !oneOf(t.fraction, ['1/4', '1/2', '3/4', 'full']) ||
    !isStr(t.label) ||
    !Array.isArray(order) ||
    !order.every((r) => oneOf(r, ['long', 'short'])) ||
    !isStr(c.label) ||
    !oneOf(spin.side, ['none', 'left', 'right']) ||
    !oneOf(spin.tipHeight, ['upper', 'center', 'lower']) ||
    !oneOf(spin.amount, ['none', 'light', 'medium', 'strong']) ||
    !isStr(spin.label) ||
    !oneOf(s.level, ['soft', 'medium', 'firm']) ||
    !isStr(s.label)
  ) {
    return null;
  }
  const ball = (v: unknown) =>
    v === 'white' || v === 'yellow' || v === 'red' ? v : null;
  return {
    firstObjectBall: ball(h.firstObjectBall),
    secondObjectBall: ball(h.secondObjectBall),
    firstBallThickness: {
      fraction: t.fraction as ExecutionHint['firstBallThickness']['fraction'],
      label: t.label,
      basis: t.basis === 'layout' ? 'layout' : 'template',
      deflectionDeg:
        typeof t.deflectionDeg === 'number' ? t.deflectionDeg : null,
    },
    cushionPlan: {
      order: order as ExecutionHint['cushionPlan']['order'],
      direction:
        c.direction === 'clockwise' || c.direction === 'counterclockwise'
          ? c.direction
          : null,
      label: c.label,
    },
    spin: {
      side: spin.side as ExecutionHint['spin']['side'],
      tipHeight: spin.tipHeight as ExecutionHint['spin']['tipHeight'],
      amount: spin.amount as ExecutionHint['spin']['amount'],
      label: spin.label,
    },
    strength: {
      level: s.level as ExecutionHint['strength']['level'],
      label: s.label,
    },
    basis: 'recommended',
    verified: false,
  };
}

function parsePoints(value: string): [number, number][] | null {
  const p = parseJson(value);
  if (!Array.isArray(p)) return null;
  const ok = p.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length === 2 &&
      pt.every((n) => typeof n === 'number' && Number.isFinite(n)),
  );
  return ok ? (p as [number, number][]) : null;
}

/** 난이도별로 보여 줄 저장 경로의 범위: 상위 난이도일수록 낮은 난이도 경로도 비교용으로 함께 본다 */
const VISIBLE: Record<CoachingLevel, CoachingLevel[]> = {
  beginner: ['beginner'],
  intermediate: ['beginner', 'intermediate'],
  advanced: ['beginner', 'intermediate', 'advanced'],
};

export interface StoredRouteRow {
  rank: number;
  points: string;
  cushionCount: number;
  description: string;
  difficulty: string | null;
  executionHint: string | null;
  confidence: number | null;
}

/** 저장된 경로 중 요청 난이도에 맞는 것만 순위 순으로 */
export function mapStoredRoutes(
  rows: StoredRouteRow[],
  level: CoachingLevel,
): RecommendedRouteDto[] {
  return rows
    .filter(
      (r) =>
        r.difficulty === null ||
        (isCoachingLevel(r.difficulty) &&
          VISIBLE[level].includes(r.difficulty)),
    )
    .sort((a, b) => a.rank - b.rank)
    .map((r, i) => ({
      rank: i + 1,
      difficulty: isCoachingLevel(r.difficulty) ? r.difficulty : level,
      description: r.description,
      cushionCount: r.cushionCount,
      points: parsePoints(r.points),
      pointsBasis: 'stored' as const,
      expectedSuccess: null,
      comparison: null,
      confidence:
        r.confidence !== null && r.confidence >= 0 && r.confidence <= 1
          ? r.confidence
          : null,
      source: 'stored' as const,
      rationale: '',
      executionHint: parseExecutionHint(r.executionHint),
    }));
}
