#!/bin/bash
# 학교 컴퓨터용 시연 폴더 만들기: 코드(커밋된 것) + DB + 샷 영상 + 실행 파일.
# Python·FFmpeg·경기 원본 영상은 넣지 않는다 (새 영상 분석에만 필요).
# 실행: bash billiards-ai/demo/make-demo-bundle.sh  → Project/시연용_당구AI/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/Project/시연용_당구AI"
rm -rf "$OUT" && mkdir -p "$OUT/billiards-ai/data/results"
git -C "$ROOT" archive HEAD billiards-ai/api billiards-ai/web | tar -x -C "$OUT"
sqlite3 "$ROOT/billiards-ai/data/billiards.db" ".backup '$OUT/billiards-ai/data/billiards.db'"
cp -R "$ROOT/billiards-ai/data/results/clips" "$OUT/billiards-ai/data/results/"
cp "$ROOT/billiards-ai/data/results/route_model.json" "$OUT/billiards-ai/data/results/"
printf 'DATABASE_URL="file:../data/billiards.db"\nPORT=4000\n' > "$OUT/billiards-ai/api/.env"
cp "$ROOT/billiards-ai/demo/start-demo.bat" "$ROOT/billiards-ai/demo/start-demo.command" "$ROOT/billiards-ai/demo/사용법.txt" "$OUT/"
du -sh "$OUT"
