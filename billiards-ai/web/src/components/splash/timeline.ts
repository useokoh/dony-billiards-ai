// 스플래시 애니메이션의 좌표와 시간표 (화면 코드와 분리해 숫자만 모아 둔다)
//
// 당구대 SVG 좌표: 레일 바깥 220×120, 천(안쪽) x 10~210, y 10~110 (실제 대대처럼 2:1)
// 공 반지름 3.2 → 공 중심이 갈 수 있는 범위는 x 13.2~206.8, y 13.2~106.8

export const BALL_R = 3.2;

/** 흰 공(수구)이 지나가는 길. 3쿠션 규칙대로 빨간 공 → 쿠션 3번 → 노란 공 순서다. */
export const CUE_PATH: [number, number][] = [
  [50, 82], // 출발
  [80, 48], // 빨간 공에 맞음 (제1목적구)
  [125, 13.2], // 쿠션 1 (위)
  [206.8, 52], // 쿠션 2 (오른쪽)
  [165, 106.8], // 쿠션 3 (아래)
  [132, 78], // 노란 공에 맞음 (제2목적구) → 득점
];

/** 맞는 순간 두 공 중심 거리가 지름(2r)이 되도록, 진행 방향으로 지름만큼 떨어진 곳에 목적구를 둔다. */
function ballAhead(from: [number, number], to: [number, number]) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  return { x: to[0] + ux * BALL_R * 2, y: to[1] + uy * BALL_R * 2, ux, uy };
}

export const RED = ballAhead(CUE_PATH[0], CUE_PATH[1]);
export const YELLOW = ballAhead(CUE_PATH[4], CUE_PATH[5]);

export const CUE_PATH_D =
  "M" + CUE_PATH.map(([x, y]) => `${x} ${y}`).join(" L");

/** 출발점부터 각 꺾이는 점까지의 거리 비율 (0~1) */
function cumulativeFractions() {
  const lens = CUE_PATH.slice(1).map((p, i) =>
    Math.hypot(p[0] - CUE_PATH[i][0], p[1] - CUE_PATH[i][1]),
  );
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  return lens.map((l) => (acc += l) / total);
}

// ── 시간표 (ms) ─────────────────────────────
export const T = {
  tableIn: { start: 0, dur: 350 }, // 당구대 나타남
  shot: { start: 300, dur: 1200 }, // 흰 공 이동
  letters: { start: 1550, gap: 80, dur: 500 }, // 로고 글자가 하나씩 떠오름
  subtitle: { start: 1950, dur: 350 },
  zoom: { start: 2350, dur: 550 }, // 로고 쪽으로 확대되며 사라짐
  end: 2900,
};

// 공은 점점 느려지게 움직인다. 진행률 s(0~1) → 이동 거리 비율
const SHOT_EASE_POW = 1.6;
export const shotEase = (s: number) => 1 - Math.pow(1 - s, SHOT_EASE_POW);
// 거리 비율 → 그 지점에 닿는 시각 (shotEase의 역함수)
const timeAtFraction = (f: number) =>
  T.shot.start + T.shot.dur * (1 - Math.pow(1 - f, 1 / SHOT_EASE_POW));

const fr = cumulativeFractions();
/** 충돌·쿠션이 일어나는 시각 (ms) */
export const EVENTS = {
  redHit: timeAtFraction(fr[0]),
  cushions: [fr[1], fr[2], fr[3]].map(timeAtFraction),
  yellowHit: timeAtFraction(fr[4]),
};

// ── 보조 함수 ───────────────────────────────
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** t가 start부터 dur 동안 0→1로 바뀌는 값 */
export const seg = (t: number, start: number, dur: number) =>
  clamp01((t - start) / dur);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x: number) => x * x * x;
