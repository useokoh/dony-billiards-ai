"use client";

// 선수 관리: 이름, 현재·목표 핸디. 목표 핸디가 코칭 난이도(초급 20 / 중급 27 / 고급 27+)를 정한다.
// 경기 상세에서 선공·후공에 선수를 연결하면 그 선수의 샷은 이 목표 핸디로 코칭한다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type CoachingLevel, type PlayerProfile } from "@/lib/api";
import home from "../home.module.css";
import styles from "./players.module.css";

const LEVEL_TEXT: Record<CoachingLevel, string> = { beginner: "초급", intermediate: "중급", advanced: "고급" };

/** 입력칸 → 핸디 숫자. 비우면 null, 0~99 정수가 아니면 undefined(오류) */
function toHandicap(v: string): number | null | undefined {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : undefined;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", current: "", target: "" });

  useEffect(() => {
    api.players().then(setPlayers).catch((e: Error) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const currentHandicap = toHandicap(form.current);
    const targetHandicap = toHandicap(form.target);
    if (!form.name.trim()) return setError("이름을 입력해 주세요");
    if (currentHandicap === undefined || targetHandicap === undefined) {
      return setError("핸디는 0~99 사이 정수로 입력해 주세요");
    }
    try {
      const p = await api.createPlayer({ name: form.name.trim(), currentHandicap, targetHandicap });
      setPlayers((list) => [...(list ?? []), p]);
      setForm({ name: "", current: "", target: "" });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function update(p: PlayerProfile, field: "currentHandicap" | "targetHandicap", raw: string) {
    const value = toHandicap(raw);
    if (value === undefined) return setError("핸디는 0~99 사이 정수로 입력해 주세요");
    if (value === p[field]) return;
    try {
      const next = await api.updatePlayer(p.id, { [field]: value });
      setPlayers((list) => list?.map((x) => (x.id === p.id ? next : x)) ?? null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className={home.screen}>
      <header className={home.header}>
        <p className={home.eyebrow}>
          <Link href="/" className={styles.back}>
            ← 경기 목록
          </Link>
        </p>
        <h1 className={home.title}>선수 관리</h1>
      </header>

      <main className={home.list}>
        <p className={home.meta}>
          목표 핸디로 코칭 난이도가 정해집니다: 20 이하 초급 · 21~27 중급 · 28 이상 고급
        </p>
        {error && <p className={home.notice}>{error}</p>}

        <form className={styles.form} onSubmit={create}>
          <input
            aria-label="이름"
            placeholder="이름"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            aria-label="현재 핸디"
            placeholder="현재 핸디"
            inputMode="numeric"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          />
          <input
            aria-label="목표 핸디"
            placeholder="목표 핸디"
            inputMode="numeric"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
          />
          <button type="submit">추가</button>
        </form>

        {players === null && !error && <p className={home.notice}>불러오는 중입니다.</p>}
        {players?.length === 0 && <p className={home.notice}>등록한 선수가 없습니다.</p>}
        {players?.map((p) => (
          <div key={p.id} className={home.card}>
            <div className={home.cardTop}>
              <span className={home.cardTitle}>{p.name}</span>
              <span className={home.statusAccent}>{p.coachingLevel ? LEVEL_TEXT[p.coachingLevel] : "난이도 미정"}</span>
            </div>
            <div className={styles.row}>
              {(["currentHandicap", "targetHandicap"] as const).map((field) => (
                <label key={field}>
                  {field === "currentHandicap" ? "현재 핸디" : "목표 핸디"}
                  <input
                    inputMode="numeric"
                    defaultValue={p[field] ?? ""}
                    // 칸을 벗어날 때 저장한다
                    onBlur={(e) => update(p, field, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
