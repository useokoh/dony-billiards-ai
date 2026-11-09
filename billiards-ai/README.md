# 당구 AI 경기 분석

3쿠션 경기 영상을 분석해 이닝과 샷으로 정리하는 시제품입니다. 설계는 `../Docs/기술스택.md`를 기준으로 합니다.

## 구성

| 폴더 | 역할 | 기술 |
|---|---|---|
| `web/` | 웹 화면 (3000번) | Next.js |
| `api/` | 백엔드 (4000번) | NestJS, Prisma, SQLite |
| `analyzer/` | 영상 분석 | Python, OpenCV, FFmpeg |
| `data/` | DB, 영상, 분석 결과 (Git 제외) | |

## 처음 한 번 설치

```bash
brew install ffmpeg
```
```bash
python3 -m venv .venv && .venv/bin/pip install -r analyzer/requirements.txt
```
```bash
cd api && cp .env.example .env && npm install && npx prisma migrate deploy
```
```bash
cd web && npm install
```

## 실행

터미널 2개에서 각각 실행합니다.

```bash
cd api && npm run start:dev
```
```bash
cd web && npm run dev
```

- 환경 상태 화면: http://localhost:3000
- API 문서: http://localhost:4000/docs

## 분석 환경 점검

```bash
.venv/bin/python -m analyzer.check_env data/videos/영상파일.MP4
```

## 공 찾기 검사 (1단계)

영상에서 표본 장면을 뽑아 공 3개를 찾고, 표시 이미지를 `data/results/detect/`에 저장합니다.

```bash
.venv/bin/python -m analyzer.detect data/videos/영상파일.MP4 --samples 150
```
```bash
.venv/bin/python -m pytest analyzer
```

## 궤적 추적 (2단계)

영상 전체의 공 위치를 기록하고 경로 그림을 `data/results/tracks/`에 저장합니다.

```bash
.venv/bin/python -m analyzer.track data/videos/영상파일.MP4
```

저장된 좌표로 후처리만 다시 할 때는 `--reuse`를 붙입니다.

## 샷·쿠션 판정 (3단계)

궤적을 먼저 만든 뒤 실행합니다. 결과는 `data/results/shots/영상이름.json`에 저장됩니다.

```bash
.venv/bin/python -m analyzer.shots data/videos/영상파일.MP4
```

## 이닝 정리와 샷별 영상 (4단계)

`analyzer.shots`가 이닝과 순번을 함께 저장합니다. 이어서 샷별 영상을 만듭니다.

```bash
.venv/bin/python -m analyzer.clips data/videos/영상파일.MP4
```

결과는 `data/results/clips/영상이름/`에 저장됩니다. 예: `이닝003_선공_샷02_045.mp4`

## 득점 자동 확정 (⑨)

`analyzer.shots`가 샷마다 득점·실패와 실패 원인, 판정 근거·신뢰도를 함께 저장합니다. 공 움직임(쿠션·충돌 순서)과 차례 신호(득점하면 같은 선수가 이어 침)를 합쳐 판정합니다. 이미 만든 결과에 다시 붙일 때만 따로 실행합니다.

```bash
.venv/bin/python -m analyzer.judge data/videos/영상파일.MP4
```

## 샷별 궤적 (경로 그림·추천 경로 계산용)

```bash
.venv/bin/python -m analyzer.trajectory data/videos/영상파일.MP4
```

결과는 `data/results/trajectories/영상이름.json`(영상 1개당 약 1MB)입니다.

## 추천 경로 모델 보정

분석이 끝난 영상들에서 이 당구대의 쿠션 반사·충돌 꺾임·1적구 이동 거리를 재서 `data/results/route_model.json`에 저장합니다. 백엔드 추천 경로 계산이 이 파일을 읽습니다(없으면 코드에 넣어 둔 2026-11-09 측정값). 교차 검증 결과도 함께 출력합니다.

```bash
.venv/bin/python -m analyzer.route_model
```

## 분석 결과를 DB에 저장

`data/results/shots/*.json`(있으면 궤적 JSON도)을 SQLite(`data/billiards.db`)에 넣는다. 같은 영상을 다시 넣으면 이전 기록을 지우고 새로 저장하되, 사람이 확인한 득점 값과 경기에 연결한 선수는 옮긴다.

```bash
cd api
npx prisma migrate deploy   # 테이블 변경을 DB에 적용 (처음 한 번, 스키마가 바뀐 뒤)
npm run import:results      # 모든 분석 결과 저장
```
