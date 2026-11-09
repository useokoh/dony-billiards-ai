// 당구대 그림: 샷의 실제 경로(공별 색)와 선택한 추천 경로(점선)를 함께 그린다.
// 좌표는 당구대 안쪽 기준 0~1, 화면 비율은 2:1 (analyzer/trajectory.py)
import type { Ball, Point, RecommendedRoute, Trajectory } from "@/lib/api";
import { BALL_COLOR, BALL_NAME } from "@/lib/shot-text";
import styles from "./match.module.css";

const W = 1000;
const H = 500;
const PAD = 28; // 쿠션(나무 테) 두께
const R = (18 / 740) * H; // 공 반지름 (실제 비율)
const BALLS: Ball[] = ["white", "yellow", "red"];

const px = ([x, y]: Point) => [PAD + x * W, PAD + y * H] as const;
const toPath = (pts: Point[]) => pts.map((p) => px(p).join(",")).join(" ");

type Props = {
  trajectory: Trajectory | null;
  route?: RecommendedRoute | null;
  loading?: boolean;
};

export default function TableView({ trajectory, route, loading }: Props) {
  const balls = trajectory?.balls ?? null;
  const routePts = route?.points ?? null;
  return (
    <figure className={styles.table}>
      <svg viewBox={`0 0 ${W + PAD * 2} ${H + PAD * 2}`} role="img" aria-label="당구대 위 공 경로 그림">
        <rect x="0" y="0" width={W + PAD * 2} height={H + PAD * 2} rx="18" fill="#3B2A1E" />
        <rect x={PAD} y={PAD} width={W} height={H} fill="var(--felt)" />
        {/* 포인트(다이아몬드): 장쿠션 8칸, 단쿠션 4칸 */}
        {Array.from({ length: 7 }, (_, i) => (
          <g key={`l${i}`} fill="#E8DCC4" opacity="0.6">
            <circle cx={PAD + ((i + 1) * W) / 8} cy={PAD / 2} r="3" />
            <circle cx={PAD + ((i + 1) * W) / 8} cy={PAD * 1.5 + H} r="3" />
          </g>
        ))}
        {Array.from({ length: 3 }, (_, i) => (
          <g key={`s${i}`} fill="#E8DCC4" opacity="0.6">
            <circle cx={PAD / 2} cy={PAD + ((i + 1) * H) / 4} r="3" />
            <circle cx={PAD * 1.5 + W} cy={PAD + ((i + 1) * H) / 4} r="3" />
          </g>
        ))}

        {/* 실제 경로 */}
        {balls &&
          BALLS.map((b) => {
            const path = balls[b];
            if (!path || path.points.length < 2) return null;
            return (
              <polyline
                key={b}
                points={toPath(path.points)}
                fill="none"
                stroke={BALL_COLOR[b]}
                strokeWidth="3"
                strokeLinejoin="round"
                opacity="0.85"
              />
            );
          })}

        {/* 추천 경로 (무회전 기하 경로, 참고용) */}
        {routePts && (
          <g>
            <polyline
              points={toPath(routePts)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeDasharray="12 9"
              strokeLinejoin="round"
            />
            {routePts.slice(2, -1).map((p, i) => {
              const [cx, cy] = px(p);
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r="13" fill="var(--accent)" />
                  <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--accent-ink)">
                    {i + 1}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* 추천 경로의 예상 정지 위치 (점선 원): 1적구는 실측 이동 거리로 추정, 수구는 두 번째 목적구 접점 */}
        {route?.comparison && route.executionHint?.firstObjectBall && (
          <g fill="none" strokeDasharray="5 5" strokeWidth="2.5">
            <circle
              cx={px(route.comparison.nextLayout.objectBallEnd)[0]}
              cy={px(route.comparison.nextLayout.objectBallEnd)[1]}
              r={R}
              stroke={BALL_COLOR[route.executionHint.firstObjectBall]}
            >
              <title>1적구 예상 정지 위치 (참고)</title>
            </circle>
            <circle
              cx={px(route.comparison.nextLayout.cueEnd)[0]}
              cy={px(route.comparison.nextLayout.cueEnd)[1]}
              r={R}
              stroke="var(--accent)"
            >
              <title>수구 예상 위치 (두 번째 목적구 접점)</title>
            </circle>
          </g>
        )}

        {/* 공: 시작 위치(진하게), 멈춘 위치(옅게) */}
        {balls &&
          BALLS.map((b) => {
            const pts = balls[b]?.points;
            if (!pts?.length) return null;
            const [sx, sy] = px(pts[0]);
            const [ex, ey] = px(pts[pts.length - 1]);
            return (
              <g key={b}>
                <circle cx={ex} cy={ey} r={R} fill={BALL_COLOR[b]} opacity="0.35" />
                <circle cx={sx} cy={sy} r={R} fill={BALL_COLOR[b]} stroke="#0B0D0E" strokeWidth="2">
                  <title>{`${BALL_NAME[b]} 시작 위치`}</title>
                </circle>
              </g>
            );
          })}
      </svg>
      <figcaption className={styles.tableCaption}>
        {loading
          ? "경로를 불러오는 중입니다"
          : !balls
            ? "이 샷은 궤적 데이터가 없습니다"
            : routePts
              ? "실선: 실제 경로 · 점선: 추천 경로(실측 보정 계산, 참고용) · 숫자: 쿠션 순서 · 점선 원: 예상 정지 위치"
              : "실선: 실제 경로 · 진한 공: 시작 위치 · 옅은 공: 멈춘 위치"}
      </figcaption>
    </figure>
  );
}
