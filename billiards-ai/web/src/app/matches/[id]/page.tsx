// 경기 상세 화면 주소: /matches/3
// 경기 번호는 요청 때 정해지므로(cacheComponents 사용 중) useParams를 쓰는 화면을 Suspense로 감싼다.
// 참고: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-params.md
import { Suspense } from "react";
import MatchDetail from "@/components/match/MatchDetail";

export default function MatchPage() {
  return (
    <Suspense fallback={<p style={{ padding: 16, color: "var(--muted)" }}>불러오는 중입니다.</p>}>
      <MatchDetail />
    </Suspense>
  );
}
