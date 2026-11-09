// 실행 코칭 그림: ① 당점(수구의 어디를 칠지) ② 두께(1적구의 어디를 맞힐지) ③ 세기
// 모두 권장값이다. 영상으로 실제 회전·힘을 판정한 값이 아니다.
import { useId } from "react";
import type { Ball, ExecutionHint } from "@/lib/api";
import { BALL_COLOR, BALL_NAME } from "@/lib/shot-text";
import styles from "./match.module.css";

// 당점 위치 (공 반지름 = 1 기준). 회전량이 클수록 가장자리 쪽, 너무 바깥(0.6 이상)은 미스큐 위험이라 넘지 않는다
const SIDE_OFFSET: Record<string, number> = { none: 0, light: 0.25, medium: 0.42, strong: 0.58 };
const HEIGHT_OFFSET: Record<string, number> = { upper: -0.4, center: 0, lower: 0.4 };
// 두께 비율(수구가 1적구를 가리는 정도)
const THICKNESS_FRACTION: Record<string, number> = { "1/4": 0.25, "1/2": 0.5, "3/4": 0.75, full: 1 };
const STRENGTH_STEP: Record<string, number> = { soft: 2, medium: 3, firm: 4 };
const STRENGTH_TEXT: Record<string, string> = { soft: "약하게", medium: "보통", firm: "강하게" };

type Props = { hint: ExecutionHint; pathLengthM: number | null; cueSpeedMps?: number | null };

export default function ShotDiagrams({ hint, pathLengthM, cueSpeedMps = null }: Props) {
  return (
    <div className={styles.diagrams}>
      <TipDiagram hint={hint} />
      <ThicknessDiagram hint={hint} />
      <StrengthDiagram hint={hint} pathLengthM={pathLengthM} cueSpeedMps={cueSpeedMps} />
    </div>
  );
}

/** ① 당점: 수구 정면에 십자선, 칠 곳을 빨간 점으로 */
function TipDiagram({ hint }: { hint: ExecutionHint }) {
  const shade = `shade${useId()}`; // 경로 카드가 여러 개라 SVG id가 겹치지 않게
  const r = 40;
  const sign = hint.spin.side === "left" ? -1 : hint.spin.side === "right" ? 1 : 0;
  const x = sign * (SIDE_OFFSET[hint.spin.amount] ?? 0) * r;
  const y = (HEIGHT_OFFSET[hint.spin.tipHeight] ?? 0) * r;
  return (
    <figure className={styles.diagram}>
      <svg viewBox="-50 -50 100 100" role="img" aria-label={`당점: ${hint.spin.label}`}>
        <defs>
          <radialGradient id={shade} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#E7E7E2" />
            <stop offset="100%" stopColor="#BDBDB6" />
          </radialGradient>
        </defs>
        <circle r={r} fill={`url(#${shade})`} />
        <line x1={-r} y1="0" x2={r} y2="0" stroke="#D9443A" strokeWidth="1.6" />
        <line x1="0" y1={-r} x2="0" y2={r} stroke="#D9443A" strokeWidth="1.6" />
        <circle cx={x} cy={y} r="7" fill="#E5322B" stroke="#7A1410" strokeWidth="1" />
      </svg>
      <figcaption>
        <b>당점</b>
        {hint.spin.label}
      </figcaption>
    </figure>
  );
}

/** ② 두께: 치는 사람 시점. 1적구 앞에 수구가 얼마나 겹쳐 맞는지 */
function ThicknessDiagram({ hint }: { hint: ExecutionHint }) {
  const arrow = `arrow${useId()}`;
  const r = 22;
  const f = THICKNESS_FRACTION[hint.firstBallThickness.fraction] ?? 0.5;
  const side = hint.firstBallThickness.contactSide;
  // 겹친 폭 = 지름 × 두께 → 중심 사이 거리 = 지름 × (1 − 두께). 왼쪽을 맞히면 수구가 1적구 왼쪽에 온다
  const offset = 2 * r * (1 - f) * (side === "left" ? -1 : 1);
  const obj: Ball = hint.firstObjectBall ?? "red";
  const sideText =
    side && hint.firstBallThickness.fraction !== "full" ? (side === "left" ? "왼쪽을 " : "오른쪽을 ") : "";
  return (
    <figure className={styles.diagram}>
      <svg viewBox="-50 -50 100 100" role="img" aria-label={`두께: ${hint.firstBallThickness.label}`}>
        <circle cx="0" cy="-6" r={r} fill={BALL_COLOR[obj]} />
        {/* 수구가 닿는 순간의 위치 (점선) */}
        <circle cx={offset} cy="-6" r={r} fill="rgba(255,255,255,0.18)" stroke="#FFFFFF" strokeWidth="1.6" strokeDasharray="4 3" />
        <line x1={offset} y1="40" x2={offset} y2={16} stroke="#FFFFFF" strokeWidth="1.4" markerEnd={`url(#${arrow})`} />
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#FFFFFF" />
          </marker>
        </defs>
      </svg>
      <figcaption>
        <b>첫 목적구</b>
        {hint.firstObjectBall ? `${BALL_NAME[hint.firstObjectBall]} ` : ""}
        {sideText}
        {hint.firstBallThickness.label}
      </figcaption>
    </figure>
  );
}

/** ③ 세기: 5칸 막대 + 얼마나 굴러가야 하는지 */
function StrengthDiagram({ hint, pathLengthM, cueSpeedMps = null }: Props) {
  const step = STRENGTH_STEP[hint.strength.level] ?? 3;
  return (
    <figure className={styles.diagram}>
      <svg viewBox="0 0 100 100" role="img" aria-label={`세기 5단계 중 ${step}`}>
        {Array.from({ length: 5 }, (_, i) => {
          const h = 18 + i * 14;
          return (
            <rect
              key={i}
              x={8 + i * 18}
              y={86 - h}
              width="13"
              height={h}
              rx="3"
              fill={i < step ? "var(--accent)" : "var(--surface-strong)"}
            />
          );
        })}
      </svg>
      <figcaption>
        <b>세기 {step}/5 · {STRENGTH_TEXT[hint.strength.level] ?? hint.strength.label}</b>
        {pathLengthM !== null
          ? `수구가 약 ${pathLengthM}m 굴러 두 번째 목적구에 닿을 만큼${cueSpeedMps !== null ? ` (출발 약 ${cueSpeedMps}m/s)` : ""}`
          : "기본 경로를 끝까지 보낼 만큼"}
      </figcaption>
    </figure>
  );
}
