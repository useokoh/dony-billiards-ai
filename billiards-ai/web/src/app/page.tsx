"use client";

// 내 경기 화면 (업로드 중심형 시안): 맨 위 경기 영상 올리기 → 분석 진행률 → 지난 경기 목록
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MatchSummary, type UploadJob, uploadVideo } from "@/lib/api";
import { formatPlayedAt, STATUS_TEXT } from "@/lib/shot-text";
import styles from "./home.module.css";

const JOB_KEY = "dony-upload-job"; // 새로고침해도 진행 중인 분석을 계속 보여 주기 위한 작업 id
const POLL_MS = 3000;

/** 화면에 보여 줄 올리기·분석 상태 */
type Progress =
  | { phase: "uploading"; name: string; percent: number }
  | { phase: "job"; job: UploadJob }
  | { phase: "error"; name: string; message: string };

export default function MatchListPage() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const loadMatches = useCallback(() => {
    api.matches().then(setMatches).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(loadMatches, [loadMatches]);

  // 지난번에 올린 영상의 분석이 아직 진행 중이면 이어서 보여 준다
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(JOB_KEY);
    } catch {
      // 저장소를 못 쓰면 이어 보기만 안 된다
    }
    if (id) api.uploadJob(id).then((job) => setProgress({ phase: "job", job })).catch(() => forgetJob());
  }, []);

  // 분석 중이면 몇 초마다 진행률을 다시 받는다. 끝나면 경기 목록을 새로 불러온다
  const jobId = progress?.phase === "job" ? progress.job.id : null;
  const jobStatus = progress?.phase === "job" ? progress.job.status : null;
  useEffect(() => {
    if (!jobId) return;
    if (jobStatus === "done" || jobStatus === "failed") {
      forgetJob();
      if (jobStatus === "done") loadMatches();
      return;
    }
    const timer = setInterval(() => {
      api
        .uploadJob(jobId)
        .then((job) => setProgress({ phase: "job", job }))
        .catch(() => {
          // 서버를 다시 켜면 작업 기록이 사라진다
          forgetJob();
          setProgress(null);
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, jobStatus, loadMatches]);

  async function remove(m: MatchSummary) {
    const when = `${formatPlayedAt(m.playedAt)} · ${m.table.name}`;
    if (!window.confirm(`${when} 경기를 삭제할까요?\n원본 영상과 샷 영상, 분석 결과, 인정·쫑 기록이 모두 지워지며 되돌릴 수 없습니다.`)) return;
    setDeleting(m.id);
    try {
      await api.deleteMatch(m.id);
      setMatches((list) => list?.filter((x) => x.id !== m.id) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  async function start(file: File | undefined) {
    if (!file) return;
    if (progress?.phase === "uploading" || jobStatus === "queued" || jobStatus === "running") return;
    setProgress({ phase: "uploading", name: file.name, percent: 0 });
    try {
      const job = await uploadVideo(file, (percent) => setProgress({ phase: "uploading", name: file.name, percent }));
      try {
        localStorage.setItem(JOB_KEY, job.id);
      } catch {
        // 저장소를 못 쓰면 새로고침 뒤 진행률만 안 보인다
      }
      setProgress({ phase: "job", job });
    } catch (e) {
      setProgress({ phase: "error", name: file.name, message: (e as Error).message });
    }
  }

  const busy = progress?.phase === "uploading" || jobStatus === "queued" || jobStatus === "running";

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>내 경기</h1>
      </header>

      <main className={styles.list}>
        <button
          type="button"
          className={styles.drop}
          data-dragging={dragging || undefined}
          disabled={busy}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void start(e.dataTransfer.files[0]);
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          <span className={styles.dropTitle}>{busy ? "분석이 끝나면 다음 영상을 올릴 수 있습니다" : "경기 영상 올리기"}</span>
          <span className={styles.dropHint}>mp4·mov·m4v, 1~2시간 영상도 이닝·샷으로 자동 정리</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
          hidden
          onChange={(e) => {
            void start(e.target.files?.[0]);
            e.target.value = ""; // 같은 파일을 다시 고를 수 있게
          }}
        />

        {progress && <ProgressCard progress={progress} onClose={() => setProgress(null)} />}

        <h2 className={styles.sectionTitle}>지난 경기</h2>
        {error && (
          <p className={styles.notice}>
            백엔드에 연결하지 못했습니다. api 서버가 켜져 있는지 확인해 주세요. ({error})
          </p>
        )}
        {!error && !matches && <p className={styles.notice}>불러오는 중입니다.</p>}
        {matches?.length === 0 && <p className={styles.notice}>아직 분석한 경기가 없습니다. 위에서 영상을 올려 보세요.</p>}

        {matches?.map((m) => (
          <div key={m.id} className={styles.rowWrap}>
          <Link href={`/matches/${m.id}`} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>
                {formatPlayedAt(m.playedAt)} · {m.table.name}
              </span>
              <span className={styles.meta}>
                {m.status === "done" ? (
                  <>
                    {m.inningCount}이닝 · 샷 {m.shotCount}
                    {m.reviewCount ? <span className={styles.warn}> · 확인 필요 {m.reviewCount}</span> : null}
                  </>
                ) : (
                  <span className={m.status === "failed" ? styles.warn : styles.accent}>
                    {STATUS_TEXT[m.status] ?? m.status}
                    {m.status === "analyzing" && ` ${m.progress}%`}
                  </span>
                )}
              </span>
            </span>
            <span className={styles.rowScore} aria-label={`선공 ${m.scoreFirst}점, 후공 ${m.scoreSecond}점`}>
              {m.scoreFirst}:{m.scoreSecond}
            </span>
          </Link>
          <button
            type="button"
            className={styles.rowDelete}
            aria-label={`${formatPlayedAt(m.playedAt)} 경기 삭제`}
            disabled={deleting !== null}
            onClick={() => void remove(m)}
          >
            {deleting === m.id ? (
              "…"
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            )}
          </button>
          </div>
        ))}
      </main>

      <footer className={styles.footer}>
        <Link href="/health" className={styles.footerLink}>
          개발 환경 점검
        </Link>
      </footer>
    </div>
  );
}

function ProgressCard({ progress, onClose }: { progress: Progress; onClose: () => void }) {
  if (progress.phase === "error") {
    return (
      <div className={styles.job} role="alert">
        <span className={styles.jobTop}>
          <span className={styles.jobName}>{progress.name}</span>
          <span className={styles.warn}>올리기 실패</span>
        </span>
        <span className={styles.meta}>{progress.message}</span>
        <button type="button" className={styles.jobAction} onClick={onClose}>
          닫기
        </button>
      </div>
    );
  }
  const name = progress.phase === "uploading" ? progress.name : progress.job.video;
  const job = progress.phase === "job" ? progress.job : null;
  const percent = progress.phase === "uploading" ? progress.percent : progress.job.progress;
  const label =
    progress.phase === "uploading"
      ? `올리는 중 ${percent}%`
      : job!.status === "queued"
        ? "분석 대기"
        : job!.status === "running"
          ? `분석 중 ${percent}%`
          : job!.status === "done"
            ? "분석 완료"
            : "분석 실패";
  return (
    <div className={styles.job} aria-live="polite">
      <span className={styles.jobTop}>
        <span className={styles.jobName}>{name}</span>
        <span className={job?.status === "failed" ? styles.warn : styles.accent}>{label}</span>
      </span>
      {job?.status !== "done" && job?.status !== "failed" && (
        <span className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <span style={{ width: `${percent}%` }} />
        </span>
      )}
      <span className={styles.meta}>
        {progress.phase === "uploading"
          ? "영상을 서버로 보내는 중입니다. 이 화면을 닫지 마세요."
          : job!.status === "failed"
            ? job!.error
            : job!.status === "done"
              ? "이닝과 샷 정리가 끝났습니다."
              : `${job!.step ?? "준비 중"} 단계 · 2시간 영상은 분석에 오래 걸립니다`}
      </span>
      {job?.status === "done" && job.matchId !== null && (
        <Link href={`/matches/${job.matchId}`} className={styles.jobAction}>
          경기 보기
        </Link>
      )}
      {job?.status === "failed" && (
        <button type="button" className={styles.jobAction} onClick={onClose}>
          닫기
        </button>
      )}
    </div>
  );
}

function forgetJob() {
  try {
    localStorage.removeItem(JOB_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}
