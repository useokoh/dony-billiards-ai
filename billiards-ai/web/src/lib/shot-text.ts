// 화면에 쓰는 공 이름·색, 날짜 표시, 피드백 문장 (Docs/기술스택.md 7.1 피드백 규칙)
import type { Ball, Inning, MatchSummary, Player, ShotDetail, ShotRow } from "./api";

export const BALL_COLOR: Record<Ball, string> = {
  white: "#F4F4EF",
  yellow: "#F6C945",
  red: "#FF5A52",
};
export const BALL_NAME: Record<Ball, string> = { white: "흰공", yellow: "노란공", red: "빨간공" };
export const PLAYER_NAME: Record<Player, string> = { first: "선공", second: "후공" };

/** 득점 판정에 쓰는 쿠션 수: 두 번째 목적구 전 쿠션 수가 있으면 그것, 없으면 전체 쿠션 수 */
export function scoringCushions(s: Pick<ShotRow, "cushionCount" | "cushionsBeforeSecondHit">) {
  return s.cushionsBeforeSecondHit ?? s.cushionCount;
}

type ScoreView = Pick<ShotRow, "result" | "scoreConfirmed" | "scoreBasis" | "scored" | "scoredBy">;

/** 자동 판정 근거가 엇갈렸거나 약해서 영상 확인을 권하는 샷 */
export function needsReview(s: ScoreView): boolean {
  return s.scoredBy === "auto" && s.scoreBasis !== null && s.scoreBasis !== "agree";
}

/** 샷 목록 오른쪽 표시: 사람이 확인했으면 그 결과, 아니면 자동 판정 결과 */
export function shotTag(s: ScoreView) {
  if (s.scoreConfirmed === true) return { text: "인정", tone: "strong" as const };
  if (s.scoreConfirmed === false) return { text: "불인정", tone: "muted" as const };
  if (s.scored) return { text: needsReview(s) ? "득점·확인" : "득점", tone: "accent" as const };
  if (needsReview(s)) return { text: "확인 권장", tone: "muted" as const };
  return null;
}

/** 사람 확인 값을 바꿨을 때 화면의 최종 득점 여부도 같은 규칙으로 맞춘다 (API와 동일: 사람 확인 > 자동 확정) */
export function withConfirmation<T extends ScoreView>(s: T, scoreConfirmed: boolean | null): T {
  const known = s.result === "success" || s.result === "fail";
  return {
    ...s,
    scoreConfirmed,
    scored: scoreConfirmed ?? s.result === "success",
    scoredBy: scoreConfirmed !== null ? "human" : known ? "auto" : "none",
  };
}

const BASIS_TEXT: Record<NonNullable<ShotRow["scoreBasis"]>, string> = {
  agree: "공 움직임과 다음 차례가 모두 일치합니다",
  turn: "공 움직임 판정과 달라 다음 차례(같은 선수가 이어 쳤는지)를 기준으로 했습니다",
  physics: "영상의 마지막 샷이라 공 움직임만으로 판정했습니다",
};

/** 7.1 피드백 규칙 */
export function feedbackMessages(s: ShotDetail): string[] {
  const out: string[] = [];
  if (s.scoredBy === "human") {
    out.push(s.scored ? "득점으로 인정했습니다" : "득점이 아닌 것으로 확인했습니다");
  } else if (s.scoredBy === "auto") {
    const basis = s.scoreBasis ? ` — ${BASIS_TEXT[s.scoreBasis]}` : "";
    out.push(`자동 판정: ${s.scored ? "득점" : "실패"}${basis}`);
  }
  // 실패 샷만 원인을 설명한다 (득점 샷에 '못 맞혔다'는 문장이 나오지 않게)
  if (!s.scored) {
    const hits = s.hitOrder ?? [];
    const c = scoringCushions(s);
    if (hits.length === 0) out.push("목적구를 맞히지 못했습니다");
    else if (hits.length === 1) out.push("두 번째 목적구를 맞히지 못했습니다");
    if (hits.length === 2 && c < 3) out.push(`쿠션 ${c}회 — 득점에는 3회 이상 필요합니다`);
  }
  if (needsReview(s)) out.push("판정 근거가 엇갈려 영상으로 확인하기를 권합니다");
  return out;
}

/** 경기 요약: "샷 12개 중 득점 4개, 평균 쿠션 2.6회" */
export function matchSummaryText(innings: Inning[]): string {
  const shots = innings.flatMap((i) => i.shots);
  if (shots.length === 0) return "샷이 없습니다";
  const scored = shots.filter((s) => s.scored).length;
  const review = shots.filter(needsReview).length;
  const avg = shots.reduce((sum, s) => sum + s.cushionCount, 0) / shots.length;
  return `샷 ${shots.length}개 중 득점 ${scored}개${review ? ` (확인 권장 ${review}개)` : ""}, 평균 쿠션 ${avg.toFixed(1)}회`;
}

/** 11월 1일 19:38 */
export function formatPlayedAt(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

/** 초 → 1:05 */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const STATUS_TEXT: Record<string, string> = {
  uploaded: "분석 대기",
  analyzing: "분석 중",
  done: "분석 완료",
  failed: "분석 실패",
};

export function playerLabel(m: Pick<MatchSummary, "firstPlayer" | "secondPlayer">, p: Player) {
  const name = p === "first" ? m.firstPlayer : m.secondPlayer;
  return name ?? PLAYER_NAME[p];
}
