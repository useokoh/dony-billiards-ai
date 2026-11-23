// 백엔드 API 호출과 응답 타입 (api/src/matches, api/src/shots 응답과 맞춘다)

export type Ball = "white" | "yellow" | "red";
export type Player = "first" | "second";

export type MatchSummary = {
  id: number;
  playedAt: string;
  firstPlayer: string | null;
  secondPlayer: string | null;
  firstPlayerId: number | null; // 연결한 플레이어 프로필 (목표 핸디별 코칭 기준)
  secondPlayerId: number | null;
  scoreFirst: number;
  scoreSecond: number;
  status: string; // uploaded, analyzing, done, failed
  progress: number;
  table: { id: number; name: string };
  inningCount: number;
  shotCount: number;
  candidateCount?: number; // 목록에서만 내려온다
  reviewCount?: number; // 목록에서만: 사람 확인이 필요한 샷 수
};

/** 영상 업로드 후 분석 작업 (api/src/uploads) */
export type UploadJob = {
  id: string;
  video: string;
  status: "queued" | "running" | "done" | "failed";
  step: string | null;
  progress: number;
  matchId: number | null;
  error: string | null;
};

export type MatchDetail = MatchSummary & {
  fps: number | null;
  durationSec: number | null;
  errorMessage: string | null;
  videoUrl: string;
};

export type ShotRow = {
  id: number;
  shotNo: number;
  shotNoInInning: number;
  player: Player;
  cueBall: Ball;
  startSec: number;
  endSec: number;
  cushionCount: number;
  cushionsBeforeSecondHit: number | null;
  result: string; // 자동 확정 success / fail (unknown = 판정 전)
  failReason: string | null;
  scoreCandidate: boolean; // 공 움직임(물리)만으로 본 득점 조건
  scoreConfirmed: boolean | null; // 사람이 확인한 값 (null = 확인 안 함)
  scoreBasis: ScoreBasis | null; // 자동 확정 근거
  scoreConfidence: number | null;
  scored: boolean; // 최종 득점 여부: 사람 확인 > 자동 확정
  scoredBy: "human" | "auto" | "none";
};

/** agree: 공 움직임과 다음 차례가 일치, turn: 둘이 달라 다음 차례 기준, physics: 다음 샷이 없어 공 움직임만 */
export type ScoreBasis = "agree" | "turn" | "physics";

export type Inning = {
  id: number;
  inningNo: number;
  scoreFirst: number;
  scoreSecond: number;
  shots: ShotRow[];
};

export type ShotDetail = ShotRow & {
  matchId: number;
  kissObserved: boolean | null; // 사람이 본 쫑 여부 (null = 확인 안 함)
  inningNo: number;
  restSec: number | null;
  hitOrder: Ball[] | null;
  events: { seq: number; kind: string; frameNo: number; tSec: number; target: string | null }[];
  clip: { url: string; startSec: number; endSec: number } | null;
  matchVideo: { url: string; startSec: number };
};

export type ConfirmResult = {
  id: number;
  scoreConfirmed: boolean | null;
  scores: {
    inning: { scoreFirst: number; scoreSecond: number };
    match: { scoreFirst: number; scoreSecond: number };
  };
};

export type Point = [number, number]; // 당구대 안쪽 기준 0~1 (가로:세로 = 2:1)
export type Layout = Record<Ball, Point>;

export type Trajectory = {
  shotId: number;
  startFrame: number;
  step: number | null;
  fps: number | null;
  aspect: number;
  balls: Partial<Record<Ball, { points: Point[]; estimated: number[] }>> | null;
  layout: Layout | null;
};

export type CoachingLevel = "beginner" | "intermediate" | "advanced";

export type ExecutionHint = {
  firstObjectBall: Ball | null;
  secondObjectBall: Ball | null;
  firstBallThickness: {
    fraction: string;
    label: string;
    basis: "layout" | "template";
    deflectionDeg: number | null;
    contactSide: "left" | "right" | null; // 치는 사람이 볼 때 1적구의 어느 쪽을 맞히는지
  };
  cushionPlan: { order: ("long" | "short")[]; direction: "clockwise" | "counterclockwise" | null; label: string };
  spin: { side: string; tipHeight: string; amount: string; label: string };
  strength: { level: string; label: string };
  basis: "recommended";
  verified: false;
};

export type RecommendedRoute = {
  rank: number;
  difficulty: CoachingLevel;
  description: string;
  cushionCount: number;
  points: Point[] | null;
  pointsBasis: "simulated" | "stored" | null;
  confidence: number | null; // 경로 모델이 실제 득점 경로를 재현한 비율 (교차 검증)
  expectedSuccess: number | null; // 난이도별 실행 오차 가정을 넣어 굴려 본 득점 비율
  comparison: {
    windowDeg: number;
    directionWindowDeg: number; // 충돌 뒤 수구 방향 허용 폭
    referenceSuccess: number; // 초급 기준 성공률: 레벨과 무관한 쉬움 지수 (difficulty의 근거)
    cutDeg: number;
    pathLengthM: number;
    cueSpeedMps: number | null; // 필요한 수구 출발 속도 (실측 감속·쿠션 손실로 계산, 세기의 근거)
    objectPath: Point[]; // 1적구 예상 진행선 (참고)
    nextLayout: { cueEnd: Point; objectBallEnd: Point; secondBall: Point; spreadM: number; rating: "good" | "normal" | "hard" };
  } | null;
  source: "rule_template" | "stored";
  rationale: string;
  executionHint: ExecutionHint | null;
};

/** 내가 친 경로 교정 (친 경로 그대로 두께·세기를 고친다) */
export type PlayedRoute = {
  played: {
    firstObjectBall: Ball;
    secondObjectBall: Ball;
    cutDeg: number;
    thickness: string;
    cushionOrder: ("long" | "short")[];
    missGapM: number | null;
    stoppedShort: boolean;
  } | null;
  correction: { route: RecommendedRoute; cutChangeDeg: number; change: "thicker" | "thinner" | "keep"; stronger: boolean } | null;
  reason: "not_measured" | "no_scoring_window" | null;
  message: string;
};

export type RouteResponse = {
  shotId: number;
  level: CoachingLevel;
  levelSource: "query-level" | "query-handicap" | "player" | "default";
  targetHandicap: number | null;
  targetHandicapLabel: string;
  layout: Layout | null;
  applicable: boolean;
  reason: "shot_succeeded" | "result_unknown" | null;
  failure: string | null;
  playedRoute: PlayedRoute | null; // 친 경로 교정 (먼저 보여 준다)
  routes: RecommendedRoute[]; // 교정이 있으면 교정보다 쉬운 경로만
  disclaimer: string;
};

export type FeedbackResponse = {
  shotId: number;
  level: CoachingLevel;
  applicable: boolean;
  items: { kind: string; source: "auto" | "user"; targetHandicap: number | null; message: string }[];
  disclaimer: string;
};

// 휴대폰에서 Mac 주소로 접속해도 같은 컴퓨터의 백엔드를 찾도록 현재 주소를 쓴다.
// 포트는 기본 4000. 테스트용 서버를 따로 띄울 때만 NEXT_PUBLIC_API_PORT로 바꾼다(빌드 때 고정됨).
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "4000";

export function apiOrigin(): string {
  return `http://${window.location.hostname}:${API_PORT}`;
}

/** API가 돌려준 '/api/...' 주소를 완전한 주소로 (영상 src에 사용) */
export function absoluteUrl(path: string): string {
  return apiOrigin() + path;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiOrigin() + "/api" + path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `요청 실패 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  matches: () => request<MatchSummary[]>("/matches"),
  match: (id: number) => request<MatchDetail>(`/matches/${id}`),
  innings: (id: number) => request<Inning[]>(`/matches/${id}/innings`),
  shot: (id: number) => request<ShotDetail>(`/shots/${id}`),
  confirm: (id: number, scoreConfirmed: boolean | null) =>
    request<ConfirmResult>(`/shots/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scoreConfirmed }),
    }),
  /** 사람이 영상으로 본 쫑 여부 기록 (true/false, null = 취소). 쫑 예측을 다시 맞출 정답으로 쓴다 */
  markKiss: (id: number, kissObserved: boolean | null) =>
    send<{ id: number; kissObserved: boolean | null }>(`/shots/${id}`, "PATCH", { kissObserved }),
  trajectory: (id: number) => request<Trajectory>(`/shots/${id}/trajectory`),
  /** level을 비우면 이 샷을 친 선수의 프로필(없으면 초급) 기준 */
  route: (id: number, level?: CoachingLevel) =>
    request<RouteResponse>(`/shots/${id}/route${level ? `?level=${level}` : ""}`),
  coachingFeedback: (id: number, level?: CoachingLevel) =>
    request<FeedbackResponse>(`/shots/${id}/feedback${level ? `?level=${level}` : ""}`),
  uploadJob: (id: string) => request<UploadJob>(`/uploads/${id}`),
};

/**
 * 경기 영상을 올린다. 1~2시간 영상은 몇 GB라 올리는 진행률을 보여 주려고 fetch 대신 XHR을 쓴다.
 * 올리기가 끝나면 서버가 분석 작업을 예약하고 작업 정보를 돌려준다.
 */
export function uploadVideo(file: File, onProgress: (percent: number) => void): Promise<UploadJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiOrigin() + "/api/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: (UploadJob & { message?: string }) | null = null;
      try {
        body = JSON.parse(xhr.responseText) as UploadJob & { message?: string };
      } catch {
        // JSON이 아닌 오류 응답(용량 초과 등)은 상태 코드로 알린다
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else reject(new Error(body?.message ?? `올리기 실패 (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("서버에 연결하지 못했습니다"));
    const form = new FormData();
    form.append("video", file);
    xhr.send(form);
  });
}

function send<T>(path: string, method: "POST" | "PATCH", body: unknown) {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
