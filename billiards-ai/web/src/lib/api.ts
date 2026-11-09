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
  firstBallThickness: { fraction: string; label: string; basis: "layout" | "template"; deflectionDeg: number | null };
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
  pointsBasis: "mirror_geometry" | "stored" | null;
  confidence: number | null;
  source: "rule_template" | "stored";
  rationale: string;
  executionHint: ExecutionHint | null;
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
  routes: RecommendedRoute[];
  disclaimer: string;
};

export type FeedbackResponse = {
  shotId: number;
  level: CoachingLevel;
  applicable: boolean;
  items: { kind: string; source: "auto" | "user"; targetHandicap: number | null; message: string }[];
  disclaimer: string;
};

export type PlayerProfile = {
  id: number;
  name: string;
  currentHandicap: number | null;
  targetHandicap: number | null;
  coachingLevel: CoachingLevel | null;
};

export type PlayerInput = Partial<Omit<PlayerProfile, "id">>;

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
  trajectory: (id: number) => request<Trajectory>(`/shots/${id}/trajectory`),
  /** level을 비우면 이 샷을 친 선수의 프로필(없으면 초급) 기준 */
  route: (id: number, level?: CoachingLevel) =>
    request<RouteResponse>(`/shots/${id}/route${level ? `?level=${level}` : ""}`),
  coachingFeedback: (id: number, level?: CoachingLevel) =>
    request<FeedbackResponse>(`/shots/${id}/feedback${level ? `?level=${level}` : ""}`),
  players: () => request<PlayerProfile[]>("/players"),
  createPlayer: (input: PlayerInput) => send<PlayerProfile>("/players", "POST", input),
  updatePlayer: (id: number, input: PlayerInput) => send<PlayerProfile>(`/players/${id}`, "PATCH", input),
  setMatchPlayers: (id: number, input: { firstPlayerId?: number | null; secondPlayerId?: number | null }) =>
    send<MatchDetail>(`/matches/${id}/players`, "PATCH", input),
};

function send<T>(path: string, method: "POST" | "PATCH", body: unknown) {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
