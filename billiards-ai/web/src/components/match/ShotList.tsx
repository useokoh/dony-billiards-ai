"use client";

// 이닝별 샷 목록. 한 줄 = 샷 1개 (번호, 수구 색, 쿠션 수, 차례, 득점 후보·확인 결과)
import type { Inning } from "@/lib/api";
import { BALL_COLOR, BALL_NAME, PLAYER_NAME, scoringCushions, shotTag } from "@/lib/shot-text";
import styles from "./match.module.css";

type Props = {
  summary: string;
  innings: Inning[];
  selectedId: number | null;
  onPick: (shotId: number) => void;
};

export default function ShotList({ summary, innings, selectedId, onPick }: Props) {
  return (
    <>
      <p className={styles.summary}>{summary}</p>
      {innings.map((inn) => (
        <section key={inn.id} aria-label={`${inn.inningNo}이닝`}>
          <h2 className={styles.inningHead}>
            <span>{inn.inningNo}이닝</span>
            <span className={styles.inningScore}>
              선공 {inn.scoreFirst} : {inn.scoreSecond} 후공
            </span>
          </h2>
          {inn.shots.map((s) => {
            const tag = shotTag(s);
            return (
              <button
                key={s.id}
                type="button"
                className={styles.row}
                aria-current={s.id === selectedId ? "true" : undefined}
                onClick={() => onPick(s.id)}
              >
                <span className={styles.rowNo}>{s.shotNoInInning}</span>
                <span
                  className={styles.dot}
                  style={{ background: BALL_COLOR[s.cueBall] }}
                  aria-label={`수구 ${BALL_NAME[s.cueBall]}`}
                  role="img"
                />
                <span className={styles.rowText}>
                  {PLAYER_NAME[s.player]} · 쿠션 {scoringCushions(s)}회
                </span>
                {tag ? <span className={styles[`tag_${tag.tone}`]}>{tag.text}</span> : <span />}
              </button>
            );
          })}
        </section>
      ))}
    </>
  );
}
