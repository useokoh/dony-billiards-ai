"use client";

// 추천 경로·실행 코칭 (Docs/기술스택.md 3.4, 7.1)
// 두께·회전·당점·강약은 모두 "권장값"이다. 영상으로 실제 회전·힘을 판정한 값처럼 보이지 않게 표시한다.
// 레벨 구분은 결과가 거의 같아 의미가 없어 뺐다: 한 기준(초급 쉬움 지수)으로 교정 + 더 쉬운 경로 하나만 보여 준다.
import { useEffect, useState } from "react";
import { api, type FeedbackResponse, type RecommendedRoute, type RouteResponse } from "@/lib/api";
import { BALL_COLOR, BALL_NAME } from "@/lib/shot-text";
import styles from "./match.module.css";
import ShotDiagrams from "./ShotDiagrams";

const LAYOUT_TEXT = { good: "모여 있음", normal: "보통", hard: "흩어짐" } as const;
const pct = (v: number) => `${Math.round(v * 100)}%`;
type Props = {
  shotId: number;
  selectedRank: number | null;
  onSelect: (route: RecommendedRoute | null) => void;
};

export default function CoachingPanel({ shotId, selectedRank, onSelect }: Props) {
  const [data, setData] = useState<{ route: RouteResponse; feedback: FeedbackResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // 선수 프로필과 상관없이 늘 같은 기준으로 계산한다
    Promise.all([api.route(shotId, "beginner"), api.coachingFeedback(shotId, "beginner")])
      .then(([route, feedback]) => {
        if (!alive) return;
        setError(null);
        setData({ route, feedback });
        // 처음에는 친 경로 교정(없으면 1순위 경로)을 그림에 표시한다
        onSelect(route.playedRoute?.correction?.route ?? route.routes[0] ?? null);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // onSelect는 부모가 매번 새로 만들 수 있어 의존성에서 뺀다 (샷이 바뀔 때만 다시 부른다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotId]);

  // 샷이 바뀌는 동안 이전 샷의 결과를 보여 주지 않는다
  const current = data && data.route.shotId === shotId ? data : null;

  return (
    <div className={styles.coaching}>
      {error && <p className={styles.errorLine}>{error}</p>}
      {!current && !error && <p className={styles.confirmHint}>불러오는 중입니다.</p>}

      {current && !current.route.applicable && (
        <p className={styles.notice}>
          {current.route.reason === "shot_succeeded"
            ? "득점한 샷입니다. 추천 경로와 코칭은 실패한 샷에만 제공합니다."
            : "자동 판정이 안 된 샷입니다. 샷 피드백 탭에서 인정·불인정을 고르면 바로 코칭합니다."}
        </p>
      )}

      {current?.route.applicable && (
        <>
          <ul className={styles.messages}>
            {current.feedback.items
              // 교정 문장은 아래 교정 카드에 이미 있다
              .filter((it) => !(it.kind === "correction" && current.route.playedRoute?.correction))
              .map((it, i) => (
                <li key={i}>
                  {it.source === "user" && <b>코치 메모 · </b>}
                  {it.message}
                </li>
              ))}
          </ul>

          {current.route.playedRoute?.correction && (
            <>
              <h3 className={styles.coachingHeading}>내가 친 경로 교정</h3>
              <ol className={styles.routes} aria-label="내가 친 경로 교정">
                <RouteCard
                  r={current.route.playedRoute.correction.route}
                  label="교정"
                  selected={selectedRank === current.route.playedRoute.correction.route.rank}
                  onSelect={onSelect}
                />
              </ol>
              {!current.route.routes.length && (
                <p className={styles.confirmHint}>친 경로보다 확실히 쉬운 다른 경로는 없습니다.</p>
              )}
            </>
          )}

          {current.route.routes.length > 0 && (
            <h3 className={styles.coachingHeading}>
              {current.route.playedRoute?.correction ? "더 쉬운 다른 경로" : "추천 경로"}
            </h3>
          )}
          <ol className={styles.routes} aria-label="추천 경로">
            {current.route.routes.slice(0, 1).map((r) => (
              <RouteCard key={r.rank} r={r} selected={selectedRank === r.rank} onSelect={onSelect} />
            ))}
          </ol>
        </>
      )}

      {current && (
        <p className={styles.disclaimer}>
          {current.route.disclaimer} 경로는 이 당구대의 실제 경기 영상에서 잰 쿠션 반사·충돌 꺾임으로 굴려 본 것입니다. 쫑은 아직 예측하지 못합니다(실제 영상으로 시험한 결과 우연 수준). 그림의 1적구 예상 진행선(공 색 점선)을 보고 판단해 주세요.
          기대 성공률은 실행 오차를 크게 잡은 보수적인 값입니다. 다음 배치는 1적구 이동 거리 실측 중앙값으로 추정한 참고값입니다.
        </p>
      )}
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

function RouteCard({
  r,
  label,
  selected,
  onSelect,
}: {
  r: RecommendedRoute;
  label?: string;
  selected: boolean;
  onSelect: (route: RecommendedRoute | null) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={styles.routeCard}
        aria-pressed={selected}
        onClick={() => onSelect(selected ? null : r)}
      >
        <span className={styles.routeHead}>
          <span className={styles.routeRank}>{label ?? r.rank}</span>
          <span className={styles.routeTitle}>{r.description}</span>
        </span>
        {r.expectedSuccess !== null && r.comparison && (
          <span className={styles.routeStats}>
            <span>
              <b>{pct(r.expectedSuccess)}</b>기대 성공률
            </span>
            <span>
              <b>±{r.comparison.directionWindowDeg / 2}°</b>방향 허용 폭
            </span>
            <span>
              <b>{LAYOUT_TEXT[r.comparison.nextLayout.rating]}</b>다음 배치
            </span>
          </span>
        )}
        {r.executionHint && (
          <ShotDiagrams
            hint={r.executionHint}
            pathLengthM={r.comparison?.pathLengthM ?? null}
            cueSpeedMps={r.comparison?.cueSpeedMps ?? null}
          />
        )}
        {r.executionHint && <HintTable hint={r.executionHint} />}
        {r.rationale && <span className={styles.routeWhy}>{r.rationale}</span>}
        <span className={styles.statSub}>
          {r.points ? "그림에 점선으로 표시" : "공 배치로 계산할 수 없는 경로라 그림 없음"}
          {r.comparison && ` · 수구 이동 약 ${r.comparison.pathLengthM}m`}
          {r.confidence !== null && ` · 경로 모델 전 구간 재현율 ${pct(r.confidence)}`}
        </span>
      </button>
    </li>
  );
}
