"use client";

// 경기 목록 화면 (블루 시안 "경기 목록" 기준). 카드를 누르면 경기 상세로 간다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type MatchSummary } from "@/lib/api";
import { formatPlayedAt, STATUS_TEXT } from "@/lib/shot-text";
import styles from "./home.module.css";

export default function MatchListPage() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.matches().then(setMatches).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>당구 AI 경기 분석</p>
        <h1 className={styles.title}>내 경기</h1>
      </header>

      <main className={styles.list}>
        {error && (
          <p className={styles.notice}>
            백엔드에 연결하지 못했습니다. api 서버가 켜져 있는지 확인해 주세요. ({error})
          </p>
        )}
        {!error && !matches && <p className={styles.notice}>불러오는 중입니다.</p>}
        {matches?.length === 0 && <p className={styles.notice}>아직 분석한 경기가 없습니다.</p>}

        {matches?.map((m) => (
          <Link key={m.id} href={`/matches/${m.id}`} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.cardTitle}>
                {formatPlayedAt(m.playedAt)} · {m.table.name}
              </span>
              <span className={m.status === "failed" ? styles.statusWarn : m.status === "done" ? styles.status : styles.statusAccent}>
                {STATUS_TEXT[m.status] ?? m.status}
                {m.status === "analyzing" && ` ${m.progress}%`}
              </span>
            </div>
            <span className={styles.meta}>
              이닝 {m.inningCount}개 · 샷 {m.shotCount}개
            </span>
            <span className={styles.score}>
              선공 <b>{m.scoreFirst}</b> : <b>{m.scoreSecond}</b> 후공
              <span className={styles.scoreNote}>자동 판정 기준, 사람 확인 우선</span>
            </span>
          </Link>
        ))}
      </main>

      <footer className={styles.footer}>
        <Link href="/players" className={styles.footerLink}>
          선수 관리
        </Link>
        <Link href="/health" className={styles.footerLink}>
          개발 환경 점검
        </Link>
      </footer>
    </div>
  );
}
