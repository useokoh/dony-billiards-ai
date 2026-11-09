// 점수 집계 공용 규칙: 사람이 확인한 값(scoreConfirmed)이 있으면 그것, 없으면 자동 확정 결과(result)
import type { PrismaService } from '../prisma/prisma.service.js';

export interface ScoreFields {
  result: string;
  scoreConfirmed: boolean | null;
}

/** 이 샷을 득점으로 셀지. 사람 확인 > 자동 확정(result = success) */
export function isScored(s: ScoreFields): boolean {
  return s.scoreConfirmed ?? s.result === 'success';
}

/** 득점이 어디서 정해졌는지: 사람 확인 / 자동 확정 / 판정 전 */
export function scoreSource(s: ScoreFields): 'human' | 'auto' | 'none' {
  if (s.scoreConfirmed !== null) return 'human';
  return s.result === 'success' || s.result === 'fail' ? 'auto' : 'none';
}

export interface ScoreRow extends ScoreFields {
  inningId: number;
  player: string;
}

export interface Tally {
  scoreFirst: number;
  scoreSecond: number;
}

/** 샷 목록 → 이닝별·경기 전체 선공/후공 점수 */
export function tallyScores(rows: ScoreRow[]): {
  innings: Map<number, Tally>;
  match: Tally;
} {
  const innings = new Map<number, Tally>();
  const match: Tally = { scoreFirst: 0, scoreSecond: 0 };
  for (const r of rows) {
    if (!innings.has(r.inningId)) {
      innings.set(r.inningId, { scoreFirst: 0, scoreSecond: 0 });
    }
    if (!isScored(r)) continue;
    const key = r.player === 'first' ? 'scoreFirst' : 'scoreSecond';
    innings.get(r.inningId)![key] += 1;
    match[key] += 1;
  }
  return { innings, match };
}

type Tx = Pick<PrismaService, 'shot' | 'inning' | 'match'>;

/** 경기의 모든 이닝과 경기 점수를 다시 계산해 저장한다 (트랜잭션 안에서 호출) */
export async function recountMatchScores(tx: Tx, matchId: number) {
  const rows = await tx.shot.findMany({
    where: { matchId },
    select: {
      inningId: true,
      player: true,
      result: true,
      scoreConfirmed: true,
    },
  });
  const { innings, match } = tallyScores(rows);
  for (const [id, t] of innings) {
    await tx.inning.update({ where: { id }, data: t });
  }
  await tx.match.update({ where: { id: matchId }, data: match });
  return { innings, match };
}
