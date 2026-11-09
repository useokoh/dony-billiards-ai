"use client";

// 목표 핸디별 추천 경로·실행 코칭 (Docs/기술스택.md 3.4, 7.1)
// 두께·회전·당점·강약은 모두 "권장값"이다. 영상으로 실제 회전·힘을 판정한 값처럼 보이지 않게 표시한다.
import { useEffect, useState } from "react";
import { api, type CoachingLevel, type FeedbackResponse, type RecommendedRoute, type RouteResponse } from "@/lib/api";
import { BALL_COLOR, BALL_NAME } from "@/lib/shot-text";
import styles from "./match.module.css";

type Choice = "profile" | CoachingLevel;

const CHOICES: { value: Choice; label: string }[] = [
  { value: "profile", label: "선수 기준" },
  { value: "beginner", label: "초급 20" },
  { value: "intermediate", label: "중급 27" },
  { value: "advanced", label: "고급 27+" },
];
const DIFFICULTY: Record<CoachingLevel, string> = { beginner: "초급", intermediate: "중급", advanced: "고급" };
const SOURCE_TEXT: Record<RouteResponse["levelSource"], string> = {
  "query-level": "직접 고른 난이도",
  "query-handicap": "입력한 목표 핸디",
  player: "선수 프로필의 목표 핸디",
  default: "선수 정보가 없어 초급 기준",
};

type Props = {
  shotId: number;
  selectedRank: number | null;
  onSelect: (route: RecommendedRoute | null) => void;
};

export default function CoachingPanel({ shotId, selectedRank, onSelect }: Props) {
  const [choice, setChoice] = useState<Choice>("profile");
  const [data, setData] = useState<{ route: RouteResponse; feedback: FeedbackResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const level = choice === "profile" ? undefined : choice;
    Promise.all([api.route(shotId, level), api.coachingFeedback(shotId, level)])
      .then(([route, feedback]) => {
        if (!alive) return;
        setError(null);
        setData({ route, feedback });
        // 처음에는 1순위 경로를 그림에 표시한다
        onSelect(route.routes[0] ?? null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // onSelect는 부모가 매번 새로 만들 수 있어 의존성에서 뺀다 (샷·난이도가 바뀔 때만 다시 부른다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotId, choice]);

  // 샷이 바뀌는 동안 이전 샷의 결과를 보여 주지 않는다
  const current = data && data.route.shotId === shotId ? data : null;

  return (
    <div className={styles.coaching}>
      <div className={styles.levelPicker} role="radiogroup" aria-label="코칭 난이도">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={choice === c.value}
            className={styles.levelChip}
            onClick={() => setChoice(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className={styles.errorLine}>{error}</p>}
      {!current && !error && <p className={styles.confirmHint}>불러오는 중입니다.</p>}

      {current && !current.route.applicable && (
        <p className={styles.notice}>
          {current.route.reason === "shot_succeeded"
            ? "득점한 샷입니다. 추천 경로와 코칭은 실패한 샷에만 제공합니다."
            : "아직 득점 여부가 판정되지 않은 샷입니다."}
        </p>
      )}

      {current?.route.applicable && (
        <>
          <p className={styles.shotMeta}>
            목표 핸디 {current.route.targetHandicap ?? current.route.targetHandicapLabel} 기준 ·{" "}
            {SOURCE_TEXT[current.route.levelSource]}
          </p>

          <ul className={styles.messages}>
            {current.feedback.items.map((it, i) => (
              <li key={i}>
                {it.source === "user" && <b>코치 메모 · </b>}
                {it.message}
              </li>
            ))}
          </ul>

          <ol className={styles.routes} aria-label="추천 경로">
            {current.route.routes.map((r) => (
              <li key={r.rank}>
                <button
                  type="button"
                  className={styles.routeCard}
                  aria-pressed={selectedRank === r.rank}
                  onClick={() => onSelect(selectedRank === r.rank ? null : r)}
                >
                  <span className={styles.routeHead}>
                    <span className={styles.routeRank}>{r.rank}</span>
                    <span className={styles.routeTitle}>{r.description}</span>
                    <span className={styles.tag_muted}>{DIFFICULTY[r.difficulty]}</span>
                  </span>
                  {r.executionHint && <HintTable hint={r.executionHint} />}
                  {r.rationale && <span className={styles.routeWhy}>{r.rationale}</span>}
                  <span className={styles.statSub}>
                    {r.points ? "그림에 점선으로 표시" : "공 배치로 계산할 수 없는 경로라 그림 없음"}
                    {r.confidence !== null && ` · 계산 신뢰도 ${Math.round(r.confidence * 100)}%`}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      {current && <p className={styles.disclaimer}>{current.route.disclaimer}</p>}
    </div>
  );
}

function HintTable({ hint }: { hint: NonNullable<RecommendedRoute["executionHint"]> }) {
  const first = hint.firstObjectBall;
  return (
    <dl className={styles.hint}>
      <dt>첫 목적구</dt>
      <dd>
        {first ? (
          <>
            <span className={styles.ballDotSm} style={{ background: BALL_COLOR[first] }} />
            {BALL_NAME[first]} ·{" "}
          </>
        ) : null}
        {hint.firstBallThickness.label}
      </dd>
      <dt>쿠션</dt>
      <dd>{hint.cushionPlan.label}</dd>
      <dt>권장 회전</dt>
      <dd>{hint.spin.label}</dd>
      <dt>권장 강약</dt>
      <dd>{hint.strength.label}</dd>
    </dl>
  );
}
