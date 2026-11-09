"use client";

// 개발 환경 확인 화면: 백엔드, DB, OpenCV, FFmpeg 상태를 보여 준다.
import { useEffect, useState } from "react";

type Health = {
  api: string;
  database: { ok: boolean; stores: number };
  opencv: string | null;
  ffmpeg: string | null;
};

// 휴대폰에서 Mac 주소로 접속해도 같은 컴퓨터의 백엔드를 찾도록 현재 주소를 쓴다.
function apiUrl() {
  return `http://${window.location.hostname}:4000/api/health`;
}

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(apiUrl())
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>당구 AI 경기 분석</h1>
      <h2>개발 환경 상태</h2>
      {failed && <p>백엔드에 연결하지 못했습니다. api 서버가 켜져 있는지 확인해 주세요.</p>}
      {!failed && !health && <p>확인 중입니다.</p>}
      {health && (
        <ul>
          <li>백엔드: {health.api === "ok" ? "정상" : "오류"}</li>
          <li>데이터베이스: {health.database.ok ? "정상" : "오류"}</li>
          <li>OpenCV: {health.opencv ?? "확인 실패"}</li>
          <li>FFmpeg: {health.ffmpeg ? "정상" : "확인 실패"}</li>
        </ul>
      )}
    </main>
  );
}
