# 개발 환경

## 2026-11-09 T3code에서 재검증 (ff9e9ff 기준)
- 한 일: CLI 작업을 T3code로 넘겨받아 GitHub에서 새로 clone해 다시 설치·빌드·테스트했다.
- 확인 결과: API 빌드와 테스트 7개 통과, 웹은 `.next`를 지운 빌드가 글꼴 오류 없이 통과했다. 분석기는 영상과 분석 결과 없이 50개 통과·13개 건너뜀이고, `data/videos`와 `data/results`를 연결하면 63개 모두 통과한다. 분석 결과 폴더 이름은 `output`이 아니라 `data/results`다.

## 2026-11-09 새로 받은 저장소로 설치 검증 (T3code 준비)
- 한 일: 사용자가 T3code를 이 Mac에서 쓰기로 해서 `~/DSTITCLASS`를 그대로 쓰기로 했다. 새 컴퓨터 기준으로 설치가 되는지 임시 폴더에 clone해서 Python 환경, API 설치·DB 생성·빌드·테스트, 웹 설치·빌드, 영상·분석 결과 연결 후 분석기 테스트까지 확인하고 임시 폴더는 지웠다.
- 문제와 해결:
  - `billiards-ai/.gitignore`의 `data/`가 `analyzer/tests/data/reviewed_shots.json`까지 제외해서 clone하면 분석기 테스트가 실패했다. 최상위만 빼도록 `/data/`로 고쳤다.
  - 새로 설치하면 웹 빌드가 실패했다. IBM Plex Sans KR은 글꼴 파일이 100개 넘게 나뉘어 있어 빌드 중 일부 내려받기가 실패한다. 스플래시 로고 글꼴을 영문 IBM Plex Sans로 바꿨다(영문 글자 모양은 같음). 한글 부제는 시스템 한글 글꼴로 표시된다.
  - README 첫 설치 명령을 `prisma migrate dev`(대화형)에서 `prisma migrate deploy`로 바꿨다.
- 바뀐 파일: `billiards-ai/.gitignore`, `billiards-ai/web/src/components/splash/Splash.tsx`, `billiards-ai/README.md`
- 확인 결과: clone 기준 API 테스트 7개, 분석기 테스트 63개 통과. 웹은 캐시를 지운 빌드 2번 모두 글꼴 오류 없이 통과. 로고 화면 캡처 정상. `data/` 폴더는 migrate deploy가 자동으로 만든다. 커밋 ff9e9ff로 푸시했다.

## 2026-11-09 GitHub 비공개 저장소에 첫 푸시
- 한 일: `DSTITCLASS` 폴더를 Git 저장소로 만들고 https://github.com/useokoh/dony-billiards-ai (비공개, main)에 첫 커밋을 푸시했다. T3code 작업 환경 구축용이다.
- 결정과 이유: 사용자가 비공개, 코드 + 기획 문서, 저장소 이름 `dony-billiards-ai`를 골랐다. 루트 `.gitignore`로 `Project/`, `slides/`, `Docs/Sauce/`(원본 영상)를 제외했다. 다른 회사 IR PDF와 100MB 넘는 영상은 올리지 않는다.
- 바뀐 파일: `.gitignore`(새로 만듦), `billiards-ai/.gitignore`(`*.tsbuildinfo` 추가)
- 확인 결과: 파일 176개. `.env`, DB, 영상, node_modules, Prisma 생성 코드는 포함되지 않았고 키·토큰·이메일 검사도 통과했다. 새 컴퓨터에서 다시 설치하는 과정은 확인하지 않았다(`data/` 영상·DB·분석 결과는 저장소에 없음).

## 2026-11-09 "백엔드에 연결하지 못했습니다" 원인 확인
- 문제와 해결: 웹(3000번)만 켜져 있고 api 서버(4000번)가 꺼져 있었다. 주소 설정은 웹·api 모두 4000번으로 일치해서 바꿀 것은 없었다. api를 켜면 해결된다(`api/`에서 `npm run start:dev`).
- 확인 결과: 빌드된 api를 잠깐 실행해 `/api/health`에서 DB, OpenCV 5.0.0, FFmpeg 9.0.2 정상 응답을 받고 다시 껐다.

## 2026-11-02 0단계 환경 구축
- 한 일: `billiards-ai/`에 Next.js 프론트엔드, NestJS 백엔드, Prisma·SQLite DB, Python 분석 환경을 구성했다. FFmpeg는 Homebrew로 설치했다. 소스 영상 2개는 `data/videos/`에 원본 링크로 연결했다.
- 결정과 이유:
  - 설치 버전은 Python 3.14.5, Node.js 26.0.0, Next.js 16.4.3, NestJS 12, OpenCV 5.0.0, FFmpeg 9.0.2이다.
  - Prisma는 npm 최신 표시가 8.0.0-rc.29라서 안정판 7.10.1로 맞췄다.
  - 생성 도구가 Jest가 아닌 Vitest를 넣어 기술스택 문서를 고쳤다.
  - GitHub 공개 여부가 미정이라 Git 저장소는 아직 만들지 않았다.
- 바뀐 파일: `billiards-ai/`, `Docs/기술스택.md`
- 문제와 해결: Prisma 7은 마이그레이션 후 클라이언트가 자동 생성되지 않아 `postinstall`에 `prisma generate`를 넣었다. 클라이언트 위치는 빌드에 포함되도록 `api/src/generated/prisma`로 옮겼다.
- 확인 결과:
  - 백엔드와 프론트엔드 빌드, ESLint, API 단위 테스트 통과
  - `/api/health`에서 DB, OpenCV, FFmpeg 정상 응답, `/docs` 200 응답
  - 소스 영상 2개 모두 1920x1080, 30.10fps, 48.3분과 58.2분이고 OpenCV로 읽힘
  - 10초 영상 자르기 동작. 재인코딩 없는 복사 방식이라 시작점은 정밀도 확인이 필요함
  - 영상은 위에서 찍은 파란 천 당구대이며 천과 공 색 차이가 뚜렷함. 공 인식 자체는 아직 만들지 않음
  - 개발 모드 서버(`start:dev`, `npm run dev`)와 분석 테스트는 아직 실행하지 않음

관련 문서: [tech-decisions](tech-decisions.md), [app-design](app-design.md)
