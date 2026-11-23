"use client";

// 샷 피드백: 쿠션 수, 첫 충돌 공, 사건 순서, 피드백 문장, 득점 인정/불인정
import type { ShotDetail } from "@/lib/api";
import {
  BALL_COLOR,
  BALL_NAME,
  feedbackMessages,
  mmss,
  PLAYER_NAME,
  scoringCushions,
} from "@/lib/shot-text";
import styles from "./match.module.css";

type Props = {
  shot: ShotDetail;
  saving: boolean;
  onConfirm: (value: boolean) => void;
  onKiss: (value: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
};

export default function ShotFeedback({ shot, saving, onConfirm, onKiss, onPrev, onNext }: Props) {
  const cushions = scoringCushions(shot);
  const first = shot.hitOrder?.[0] ?? null;
  // 자동 판정을 못 한 샷도 사람이 정하면 바로 코칭을 받을 수 있다
  const autoFailed = shot.scoredBy === "none";

  return (
    <div className={styles.feedback}>
      <p className={styles.shotMeta}>
        {PLAYER_NAME[shot.player]} · 전체 {shot.shotNo}번째 샷 · {mmss(shot.startSec)}~{mmss(shot.endSec)}
      </p>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>두 번째 공 전 쿠션 (기준 3회)</span>
          <span className={styles.statValue}>{cushions}회</span>
          <span className={styles.meter} aria-hidden="true">
            {Array.from({ length: Math.max(cushions, 3) }, (_, i) => (
              <span key={i} className={i < cushions ? styles.meterOn : styles.meterOff} />
            ))}
          </span>
          <span className={styles.statSub}>전체 쿠션 {shot.cushionCount}회</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>첫 충돌 공</span>
          <span className={styles.statBall}>
            <span className={styles.ballDot} style={{ background: first ? BALL_COLOR[first] : "#3A4348" }} />
            {first ? BALL_NAME[first] : "없음"}
          </span>
          <span className={styles.statSub}>수구 {BALL_NAME[shot.cueBall]}</span>
        </div>
      </div>

      {/* 사건 순서: 쿠션 1 → 빨간공 → 쿠션 2 … (궤적 그림 대신) */}
      {shot.events.length > 0 && (
        <ol className={styles.events} aria-label="공이 움직인 순서">
          {shot.events.map((e) => (
            <li key={e.seq} className={styles.event}>
              {e.kind === "hit" && e.target && e.target in BALL_COLOR ? (
                <>
                  <span className={styles.ballDotSm} style={{ background: BALL_COLOR[e.target as keyof typeof BALL_COLOR] }} />
                  {BALL_NAME[e.target as keyof typeof BALL_NAME]}
                </>
              ) : (
                "쿠션"
              )}
            </li>
          ))}
        </ol>
      )}

      <ul className={styles.messages}>
        {feedbackMessages(shot).map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>

      <div className={styles.confirm}>
        <p className={styles.confirmHint}>
          {autoFailed
            ? "자동 판정을 못 한 샷입니다. 영상을 보고 인정·불인정을 골라 주세요. 고르면 코칭 탭에 바로 반영됩니다."
            : "자동 판정이 틀렸다면 바로잡아 주세요. 고르면 코칭 탭에 바로 반영되고, 다시 누르면 자동 판정으로 돌아갑니다."}
        </p>
        <div className={styles.confirmButtons}>
          <button
            type="button"
            className={styles.accept}
            aria-pressed={shot.scoreConfirmed === true}
            disabled={saving}
            onClick={() => onConfirm(true)}
          >
            인정
          </button>
          <button
            type="button"
            className={styles.reject}
            aria-pressed={shot.scoreConfirmed === false}
            disabled={saving}
            onClick={() => onConfirm(false)}
          >
            불인정
          </button>
        </div>
      </div>

      {/* 쫑 기록: 사람이 영상으로 본 값. 쫑 예측을 다시 맞출 정답으로 모은다 */}
      <div className={styles.confirm}>
        <p className={styles.confirmHint}>
          수구가 1적구와 다시 부딪히거나 1적구가 2적구를 건드렸나요? (쫑) 기록이 쌓이면 쫑 예측을 다시 맞춥니다.
        </p>
        <div className={styles.confirmButtons}>
          <button
            type="button"
            className={styles.reject}
            aria-pressed={shot.kissObserved === true}
            disabled={saving}
            onClick={() => onKiss(true)}
          >
            쫑 났음
          </button>
          <button
            type="button"
            className={styles.accept}
            aria-pressed={shot.kissObserved === false}
            disabled={saving}
            onClick={() => onKiss(false)}
          >
            쫑 없음
          </button>
        </div>
      </div>

      <div className={styles.prevNext}>
        <button type="button" className={styles.linkButton} onClick={onPrev} disabled={!onPrev}>
          이전 샷
        </button>
        <button type="button" className={styles.linkButton} onClick={onNext} disabled={!onNext}>
          다음 샷
        </button>
      </div>
    </div>
  );
}
