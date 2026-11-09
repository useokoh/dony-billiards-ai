# 개발 환경

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
