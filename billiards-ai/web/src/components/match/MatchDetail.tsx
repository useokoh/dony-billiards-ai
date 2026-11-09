"use client";

// 경기 상세 (블루 시안 "리플레이" + "샷 피드백" 기준)
// 위: 선택한 샷의 영상 또는 당구대 경로 그림 / 아래: [샷 목록] [샷 피드백] [코칭] 탭
// 코칭 탭에서 고른 추천 경로가 당구대 그림에 점선으로 겹쳐 보인다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  absoluteUrl,
  api,
  type Inning,
  type MatchDetail as Match,
  type PlayerProfile,
  type RecommendedRoute,
  type ShotDetail,
  type Trajectory,
} from "@/lib/api";
import { formatPlayedAt, matchSummaryText, withConfirmation } from "@/lib/shot-text";
import CoachingPanel from "./CoachingPanel";
import ShotFeedback from "./ShotFeedback";
import TableView from "./TableView";
import ShotList from "./ShotList";
import styles from "./match.module.css";

type Tab = "shots" | "feedback" | "coaching";
type View = "video" | "path";

export default function MatchDetail() {
  const params = useParams<{ id: string }>();
  const matchId = Number(params.id);
  const validId = Number.isInteger(matchId) && matchId > 0;

  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Inning[]>([]);
  const [shotId, setShotId] = useState<number | null>(null);
  const [shot, setShot] = useState<ShotDetail | null>(null);
  const [tab, setTab] = useState<Tab>("shots");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<View>("video");
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null);
  // 코칭 탭에서 고른 추천 경로. 샷 번호와 함께 저장해 다른 샷으로 넘어가면 자동으로 무시한다
  const [picked, setPicked] = useState<{ shotId: number; route: RecommendedRoute | null } | null>(null);
  const route = picked && picked.shotId === shotId ? picked.route : null;
  const [players, setPlayers] = useState<PlayerProfile[]>([]);

  // 경기 정보와 이닝별 샷 목록. 처음에는 첫 샷을 고른다.
  useEffect(() => {
    if (!validId) return;
    Promise.all([api.match(matchId), api.innings(matchId)])
      .then(([m, inns]) => {
        setMatch(m);
        setInnings(inns);
        setShotId(inns[0]?.shots[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [matchId, validId]);

  // 선수 목록 (선공·후공 연결용). 실패해도 화면은 그대로 쓴다
  useEffect(() => {
    api.players().then(setPlayers).catch(() => setPlayers([]));
  }, []);

  // 고른 샷의 상세 (사건 순서, 영상 위치)와 궤적
  useEffect(() => {
    if (shotId === null) return;
    let alive = true;
    api
      .shot(shotId)
      .then((s) => alive && setShot(s))
      .catch((e: Error) => alive && setError(e.message));
    api
      .trajectory(shotId)
      .then((t) => alive && setTrajectory(t))
      .catch(() => alive && setTrajectory(null));
    return () => {
      alive = false;
    };
  }, [shotId]);

  // 이전·다음 샷 이동용 순서
  const order = useMemo(() => innings.flatMap((i) => i.shots.map((s) => s.id)), [innings]);
  const pos = shotId === null ? -1 : order.indexOf(shotId);

  /** 인정(true)/불인정(false). 이미 누른 버튼을 다시 누르면 확인 취소(null) */
  async function confirm(value: boolean) {
    if (!shot || saving) return;
    const next = shot.scoreConfirmed === value ? null : value;
    setSaving(true);
    try {
      const r = await api.confirm(shot.id, next);
      setShot(withConfirmation(shot, r.scoreConfirmed));
      setInnings((prev) =>
        prev.map((inn) =>
          inn.inningNo !== shot.inningNo
            ? inn
            : {
                ...inn,
                ...r.scores.inning,
                shots: inn.shots.map((s) =>
                  s.id === shot.id ? withConfirmation(s, r.scoreConfirmed) : s,
                ),
              },
        ),
      );
      setMatch((m) => (m ? { ...m, ...r.scores.match } : m));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  /** 선공·후공에 선수 프로필 연결 (코칭 난이도가 그 선수의 목표 핸디로 정해진다) */
  async function linkPlayer(side: "firstPlayerId" | "secondPlayerId", value: string) {
    if (!match) return;
    try {
      const m = await api.setMatchPlayers(match.id, { [side]: value ? Number(value) : null });
      setMatch(m);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!validId || (error && !match)) {
    return (
      <div className={styles.screen}>
        <TopBar title="경기" />
        <p className={styles.notice}>{validId ? error : "경기 번호가 올바르지 않습니다"}</p>
      </div>
    );
  }
  if (!match) {
    return (
      <div className={styles.screen}>
        <TopBar title="경기" />
        <p className={styles.notice}>불러오는 중입니다.</p>
      </div>
    );
  }

  // 샷 영상이 있으면 그 파일, 없으면 경기 영상을 샷 시작 위치부터
  const videoSrc = shot
    ? shot.clip
      ? absoluteUrl(shot.clip.url)
      : `${absoluteUrl(shot.matchVideo.url)}#t=${shot.matchVideo.startSec}`
    : null;

  return (
    <div className={styles.screen}>
      <TopBar title={`${formatPlayedAt(match.playedAt)} · ${match.table.name}`}>
        <span className={styles.topScore} aria-label={`선공 ${match.scoreFirst}점, 후공 ${match.scoreSecond}점`}>
          {match.scoreFirst} : {match.scoreSecond}
        </span>
      </TopBar>

      <div className={styles.playersBar}>
        {(["firstPlayerId", "secondPlayerId"] as const).map((side) => (
          <label key={side}>
            {side === "firstPlayerId" ? "선공" : "후공"}{" "}
            <select value={match[side] ?? ""} onChange={(e) => linkPlayer(side, e.target.value)}>
              <option value="">선수 미지정</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.targetHandicap !== null ? ` (목표 ${p.targetHandicap})` : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Link href="/players">선수 관리</Link>
      </div>

      <div className={styles.viewToggle} role="radiogroup" aria-label="보기">
        {(
          [
            ["video", "샷 영상"],
            ["path", "경로 그림"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={view === v}
            className={styles.levelChip}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "path" ? (
        <TableView
          trajectory={trajectory && trajectory.shotId === shotId ? trajectory : null}
          route={route}
          loading={shotId !== null && trajectory?.shotId !== shotId}
        />
      ) : (
      <section aria-label="샷 영상" className={styles.player}>
        {videoSrc ? (
          // key: 샷이 바뀌면 새 영상으로 다시 불러온다
          <video key={videoSrc} className={styles.video} src={videoSrc} controls playsInline preload="metadata" />
        ) : (
          <div className={styles.videoEmpty}>샷이 없습니다</div>
        )}
      </section>
      )}

      <div role="tablist" aria-label="경기 내용" className={styles.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shots"}
          className={styles.tab}
          onClick={() => setTab("shots")}
        >
          샷 목록 {order.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "feedback"}
          className={styles.tab}
          onClick={() => setTab("feedback")}
          disabled={!shot}
        >
          {shot ? `${shot.inningNo}이닝 ${shot.shotNoInInning}번째 샷 피드백` : "샷 피드백"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "coaching"}
          className={styles.tab}
          onClick={() => {
            setTab("coaching");
            setView("path"); // 추천 경로를 바로 그림으로 볼 수 있게
          }}
          disabled={!shot}
        >
          코칭
        </button>
      </div>

      {error && <p className={styles.errorLine}>{error}</p>}

      <div className={styles.panel}>
        {tab === "shots" ? (
          <ShotList
            summary={matchSummaryText(innings)}
            innings={innings}
            selectedId={shotId}
            onPick={(id) => {
              setError(null);
              setShotId(id);
            }}
          />
        ) : tab === "coaching" ? (
          shot && (
            <CoachingPanel
              key={`${shot.id}-${match.firstPlayerId}-${match.secondPlayerId}`}
              shotId={shot.id}
              selectedRank={route?.rank ?? null}
              onSelect={(r) => setPicked({ shotId: shot.id, route: r })}
            />
          )
        ) : (
          shot && (
            <ShotFeedback
              shot={shot}
              saving={saving}
              onConfirm={confirm}
              onPrev={pos > 0 ? () => setShotId(order[pos - 1]) : undefined}
              onNext={pos >= 0 && pos < order.length - 1 ? () => setShotId(order[pos + 1]) : undefined}
            />
          )
        )}
      </div>
    </div>
  );
}

function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className={styles.topBar}>
      <Link href="/" aria-label="경기 목록으로" className={styles.back}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 5-7 7 7 7" />
        </svg>
      </Link>
      <h1 className={styles.topTitle}>{title}</h1>
      {children}
    </header>
  );
}
