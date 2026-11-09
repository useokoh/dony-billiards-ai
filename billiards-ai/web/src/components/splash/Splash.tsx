"use client";

// 앱 시작 화면(스플래시): 흰 공이 3쿠션으로 득점하는 궤적을 그린 뒤
// "Dony" 로고가 떠오르고, 로고 쪽으로 확대되며 홈 화면이 열린다.
// - 브라우저 창(탭)마다 한 번만 보여 준다 (sessionStorage)
// - 화면을 누르거나 "건너뛰기"를 누르면 바로 넘어간다
// - 움직임 줄이기 설정이면 애니메이션 없이 로고만 잠깐 보여 준다
import { useEffect, useRef, useState } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import styles from "./Splash.module.css";
import {
  BALL_R,
  CUE_PATH,
  CUE_PATH_D,
  EVENTS,
  RED,
  T,
  YELLOW,
  easeIn,
  easeOut,
  seg,
  shotEase,
} from "./timeline";
import { SPLASH_KEY } from "./guard";

// 로고는 영문이라 IBM Plex Sans(시안의 IBM Plex Sans KR과 영문 글자 모양이 같음)를 쓴다.
// KR판은 글꼴 파일이 100개 넘게 나뉘어 있어 빌드 중 내려받기가 자주 실패했다.
// 한글 부제는 시스템 한글 글꼴로 표시된다.
const logoFont = IBM_Plex_Sans({
  weight: ["500", "700"],
  subsets: ["latin"],
  fallback: ["Apple SD Gothic Neo", "Noto Sans KR", "sans-serif"],
});

const LOGO = "Dony";
const SKIP_FADE_MS = 250;
const REDUCED_HOLD_MS = 800;

// 당구대 레일의 포인트(다이아몬드) 위치: 긴 쿠션 7개, 짧은 쿠션 3개
const DIAMONDS = [
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((k) => [
    [10 + 25 * k, 5],
    [10 + 25 * k, 115],
  ]),
  ...[1, 2, 3].flatMap((k) => [
    [5, 10 + 25 * k],
    [215, 10 + 25 * k],
  ]),
];

export default function Splash() {
  const [done, setDone] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const skipAt = useRef<number | null>(null); // 건너뛰기를 누른 시각

  // 애니메이션 대상 요소
  const backdrop = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLDivElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const subtitle = useRef<HTMLParagraphElement>(null);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const path = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const trailGlow = useRef<SVGPathElement>(null);
  const cue = useRef<SVGCircleElement>(null);
  const red = useRef<SVGCircleElement>(null);
  const yellow = useRef<SVGCircleElement>(null);
  const rings = useRef<(SVGCircleElement | null)[]>([]); // 쿠션 3개 + 빨간 공 충돌
  const flash = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SPLASH_KEY) !== null;
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 매번 보여 준다
    }
    // 이미 봤으면 <head> 스크립트가 붙인 data-splash="done"으로 CSS가 숨겨 둔 상태다.
    if (seen) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = path.current!.getTotalLength();
    trail.current!.style.strokeDasharray = `${total}`;
    trailGlow.current!.style.strokeDasharray = `${total}`;

    // t(ms) 시점의 화면을 그린다. 같은 t면 언제나 같은 화면이다.
    const render = (t: number) => {
      // 1) 당구대 등장
      const tin = easeOut(seg(t, T.tableIn.start, T.tableIn.dur));
      const zoom = easeIn(seg(t, T.zoom.start, T.zoom.dur));
      table.current!.style.opacity = String(tin * (1 - seg(t, T.zoom.start, 250)));
      table.current!.style.transform = `scale(${0.94 + 0.06 * tin + 0.1 * zoom})`;

      // 2) 흰 공 이동과 빛 궤적
      const dist = shotEase(seg(t, T.shot.start, T.shot.dur)) * total;
      const p = path.current!.getPointAtLength(dist);
      cue.current!.setAttribute("cx", String(p.x));
      cue.current!.setAttribute("cy", String(p.y));
      trail.current!.style.strokeDashoffset = String(total - dist);
      trailGlow.current!.style.strokeDashoffset = String(total - dist);

      // 3) 맞은 목적구는 진행 방향으로 살짝 밀린다
      const rk = easeOut(seg(t, EVENTS.redHit, 500));
      red.current!.setAttribute("cx", String(RED.x + RED.ux * 9 * rk));
      red.current!.setAttribute("cy", String(RED.y + RED.uy * 9 * rk));
      const yk = easeOut(seg(t, EVENTS.yellowHit, 600));
      yellow.current!.setAttribute("cx", String(YELLOW.x + YELLOW.ux * 7 * yk));
      yellow.current!.setAttribute("cy", String(YELLOW.y + YELLOW.uy * 7 * yk));

      // 4) 쿠션·충돌 순간마다 퍼지는 고리
      [...EVENTS.cushions, EVENTS.redHit].forEach((at, i) => {
        const k = seg(t, at, 450);
        const ring = rings.current[i]!;
        ring.setAttribute("r", String(BALL_R + 9 * easeOut(k)));
        ring.style.opacity = k > 0 && k < 1 ? String(0.9 * (1 - k)) : "0";
      });

      // 5) 득점 순간 번쩍임
      const fk = seg(t, EVENTS.yellowHit, 650);
      flash.current!.setAttribute("r", String(4 + 70 * easeOut(fk)));
      flash.current!.style.opacity = fk > 0 && fk < 1 ? String(0.85 * (1 - fk)) : "0";

      // 6) 로고 글자가 하나씩 떠오름
      letters.current.forEach((el, i) => {
        const k = easeOut(seg(t, T.letters.start + i * T.letters.gap, T.letters.dur));
        el!.style.opacity = String(k);
        el!.style.transform = `translateY(${(1 - k) * 14}px) scale(${1.25 - 0.25 * k})`;
        el!.style.filter = `blur(${(1 - k) * 8}px)`;
      });
      const glow = seg(t, 1900, 400) * (1 - seg(t, T.zoom.start + 200, 300));
      logo.current!.style.textShadow = `0 0 ${12 + 22 * glow}px rgba(108,189,235,${0.25 + 0.5 * glow})`;
      subtitle.current!.style.opacity = String(
        seg(t, T.subtitle.start, T.subtitle.dur) * (1 - seg(t, T.zoom.start, 200)),
      );

      // 7) 로고 쪽으로 확대되며 홈 화면이 드러남
      logo.current!.style.transform = `scale(${1 + 11 * zoom})`;
      logo.current!.style.opacity = String(1 - seg(t, T.zoom.start + 300, 250));
      backdrop.current!.style.opacity = String(1 - seg(t, T.zoom.start + 150, 400));
    };

    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;

      // 건너뛰기: 지금 화면 그대로 빠르게 사라진다
      if (skipAt.current !== null) {
        const k = seg(now, skipAt.current, SKIP_FADE_MS);
        rootRef.current!.style.opacity = String(1 - k);
        if (k >= 1) return setDone(true);
        raf = requestAnimationFrame(tick);
        return;
      }

      if (reduced) {
        // 움직임 없이 완성된 로고만 보여 주고 서서히 사라진다
        render(T.zoom.start);
        rootRef.current!.style.opacity = String(1 - seg(elapsed, REDUCED_HOLD_MS, 400));
        if (elapsed >= REDUCED_HOLD_MS + 400) return setDone(true);
      } else {
        render(elapsed);
        if (elapsed >= T.end) return setDone(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (done) return null;

  const skip = () => {
    if (skipAt.current === null) skipAt.current = performance.now();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.overlay} ${logoFont.className}`}
      onClick={skip}
      role="presentation"
    >
      <div ref={backdrop} className={styles.backdrop} />

      <div className={styles.stage} aria-hidden="true">
        <div ref={table} className={styles.table} style={{ opacity: 0 }}>
          <svg viewBox="0 0 220 120">
            <defs>
              <filter id="splash-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.6" />
              </filter>
              <radialGradient id="splash-flash">
                <stop offset="0%" stopColor="#F6C945" stopOpacity="0.9" />
                <stop offset="45%" stopColor="#6CBDEB" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6CBDEB" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* 레일과 천 */}
            <rect x="0" y="0" width="220" height="120" rx="6" fill="#1A1F22" />
            <rect x="10" y="10" width="200" height="100" rx="1.5" fill="#123F60" />
            {DIAMONDS.map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" fill="#A4AEB3" opacity="0.55" />
            ))}

            {/* 흰 공 궤적: 바깥 빛(초크 파랑) + 가운데 선(흰색) */}
            <path ref={path} d={CUE_PATH_D} fill="none" stroke="none" />
            <path
              ref={trailGlow}
              d={CUE_PATH_D}
              fill="none"
              stroke="#6CBDEB"
              strokeWidth="3.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              filter="url(#splash-glow)"
              opacity="0.85"
              style={{ strokeDashoffset: 9999 }}
            />
            <path
              ref={trail}
              d={CUE_PATH_D}
              fill="none"
              stroke="#F4F4EF"
              strokeWidth="1"
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ strokeDashoffset: 9999 }}
            />

            {/* 쿠션 3개와 빨간 공 충돌 지점의 고리 */}
            {[...CUE_PATH.slice(2, 5), CUE_PATH[1]].map(([x, y], i) => (
              <circle
                key={i}
                ref={(el) => {
                  rings.current[i] = el;
                }}
                cx={x}
                cy={y}
                r={BALL_R}
                fill="none"
                stroke={i === 3 ? "#F4F4EF" : "#6CBDEB"}
                strokeWidth="0.8"
                style={{ opacity: 0 }}
              />
            ))}

            <circle ref={flash} cx={YELLOW.x} cy={YELLOW.y} r="4" fill="url(#splash-flash)" style={{ opacity: 0 }} />

            {/* 공 3개 */}
            <circle ref={red} cx={RED.x} cy={RED.y} r={BALL_R} fill="#FF5A52" />
            <circle ref={yellow} cx={YELLOW.x} cy={YELLOW.y} r={BALL_R} fill="#F6C945" />
            <circle ref={cue} cx={CUE_PATH[0][0]} cy={CUE_PATH[0][1]} r={BALL_R} fill="#F4F4EF" />
          </svg>
        </div>

        <div ref={logo} className={styles.logo}>
          {LOGO.split("").map((ch, i) => (
            <span
              key={i}
              ref={(el) => {
                letters.current[i] = el;
              }}
              className={styles.letter}
            >
              {ch}
            </span>
          ))}
        </div>
        <p ref={subtitle} className={styles.subtitle}>
          당구 AI 경기 분석
        </p>
      </div>

      {/* 화면 낭독기에는 이름만 알려 준다 */}
      <span className={styles.srOnly}>Dony 당구 AI 경기 분석</span>

      <button
        type="button"
        className={styles.skip}
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
      >
        건너뛰기
      </button>
    </div>
  );
}
