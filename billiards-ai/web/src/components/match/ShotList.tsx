"use client";

// 이닝별 샷 목록. 한 줄 = 샷 1개 (번호, 수구 색, 쿠션 수, 차례, 득점 후보·확인 결과)
// 위의 버튼으로 득점 / 실패 / 확인 필요 샷만 골라 볼 수 있다.
import type { Inning } from "@/lib/api";
import {
  BALL_COLOR,
  BALL_NAME,
  matchesFilter,
  PLAYER_NAME,
  SHOT_FILTERS,
  scoringCushions,
  shotTag,
  type ShotFilter,
} from "@/lib/shot-text";
import styles from "./match.module.css";

type Props = {
  summary: string;
  innings: Inning[];
  selectedId: number | null;
  onPick: (shotId: number) => void;
  filter: ShotFilter;
  onFilter: (f: ShotFilter) => void;
};

export default function ShotList({ summary, innings, selectedId, onPick, filter, onFilter }: Props) {
  return (
    <>
      <p className={styles.summary}>{summary}</p>
      <div className={styles.shotFilter} role="radiogroup" aria-label="샷 나눠 보기">
        {SHOT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            className={styles.levelChip}
            onClick={() => onFilter(f.value)}
          >
            {f.label} {innings.reduce((n, inn) => n + inn.shots.filter((s) => matchesFilter(s, f.value)).length, 0)}
          </button>
        ))}
      </div>
      {innings.map((inn) => {
        const shots = inn.shots.filter((s) => matchesFilter(s, filter));
        if (shots.length === 0) return null;
        return (
        <section key={inn.id} aria-label={`${inn.inningNo}이닝`}>
          <h2 className={styles.inningHead}>
            <span>{inn.inningNo}이닝</span>
            <span className={styles.inningScore}>
              선공 {inn.scoreFirst} : {inn.scoreSecond} 후공
            </span>
          </h2>
          {shots.map((s) => {
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
        );
      })}
    </>
  );
}
