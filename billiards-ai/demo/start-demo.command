#!/bin/bash
# 시연용 실행 (Mac): 처음 한 번은 패키지 설치·빌드(인터넷 필요), 그다음부터는 바로 켜진다.
cd "$(dirname "$0")"
export PATH="$PWD/node/bin:$PATH"
command -v node >/dev/null || { echo "Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치하세요."; read -r; exit 1; }
set -e
if [ ! -f billiards-ai/api/dist/main.js ]; then
  echo "[1/2] 서버 준비 (처음 한 번, 몇 분 걸림)"
  (cd billiards-ai/api && (npm ci || npm install) && npx prisma generate && npm run build)
fi
if [ ! -f billiards-ai/web/.next/BUILD_ID ]; then
  echo "[2/2] 화면 준비 (처음 한 번, 몇 분 걸림)"
  (cd billiards-ai/web && (npm ci || npm install) && npm run build)
fi
(cd billiards-ai/api && node dist/main.js) &
(cd billiards-ai/web && npx next start -p 3000) &
sleep 6 && open http://localhost:3000
echo "시연 중입니다. 끝내려면 이 창을 닫으세요."
wait
