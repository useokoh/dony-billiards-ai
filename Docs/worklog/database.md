# 데이터베이스

## 2026-11-09 조회 API와 영상 재생 API (B안)
- 한 일: 경기 목록·경기 정보·이닝별 샷·샷 상세 조회 API와 영상 재생 API 2개를 만들었다. 경기는 `api/src/matches/`, 샷은 `api/src/shots/`, 영상 전송 공통 코드는 `api/src/media/`에 있다.
- 결정과 이유:
  - 사용자가 B안(조회 4개 + 영상 재생)을 골랐다.
  - 영상 주소를 `/videos/:파일` 대신 `/api/matches/:id/video`, `/api/shots/:id/clip`로 바꿨다. 파일 이름을 주소로 받으면 `../` 경로 공격과 한글 파일 이름 문제가 생긴다. `data/` 밖 경로는 404로 막는다. `Docs/기술스택.md` 6장도 고쳤다.
  - 샷 상세에는 샷 영상(`clip`)과 경기 영상 시작 위치(`matchVideo.startSec`)를 같이 준다. 샷 영상이 없을 때 경기 영상으로 재생할 수 있게 하려는 것이다.
  - 영상 파일 위치의 기준 폴더는 `PROJECT_ROOT` 환경 변수이고 기본값은 `..`이다. api 폴더에서 실행한다고 가정한다.
  - Range 처리는 Express `sendFile`에 맡겼다. `.MP4` 대문자 확장자 때문에 Content-Type을 `video/mp4`로 직접 지정했다.
- 바뀐 파일: `api/src/matches/`, `api/src/shots/`, `api/src/media/`(새로 만듦), `api/src/app.module.ts`, `Docs/기술스택.md` 6장
- 확인 결과:
  - 빌드, 린트(oxlint) 통과. 단위 테스트 17개 통과(새로 10개: 경로 차단, hitOrder 변환, 404)
  - 실제 DB로 서버를 4010번 포트에 띄워 확인했다. 경기 2개, 이닝 25·30, 샷 102·117이 DB와 일치했다. 없는 번호는 404, 숫자가 아니면 400을 돌려준다. Swagger `/docs`에 새 API 6개가 표시된다.
  - 샷 영상 219개 모두 Range 요청에 206으로 응답했다. 경기 영상은 200MB 지점부터 구간 요청이 된다.
  - 확인하지 않은 것: 브라우저나 휴대폰 `<video>`에서 실제로 재생되는지
  - 남은 API: 궤적·추천 경로·피드백(데이터 없음), 득점 인정 `PATCH`, 업로드 `POST`

## 2026-11-09 개선 스키마 적용과 분석 결과 가져오기
- 한 일: `schema.proposed.prisma` 개선안을 `schema.prisma`에 반영하고 마이그레이션 `20261109010000_match_analysis_schema`를 적용했다. 분석 JSON을 DB에 넣는 `npm run import:results`를 만들었다.
- 결정과 이유:
  - 사용자가 A1(개선안 적용) + B2(마이그레이션 + JSON 가져오기)를 골랐다. DB가 비어 있어 잃는 데이터가 없었다.
  - 궤적은 샷×공마다 1행(JSON 배열)으로 바꿨다. 프레임마다 1행이면 48분 영상에 약 26만 행이 된다.
  - 같은 영상을 다시 가져오면 이전 경기를 지우고 새로 넣는다. 그래서 경기 번호가 바뀐다.
  - 촬영 시각은 파일 이름 끝 yyMMddHHmmss로 읽었다. 영상1 19:38:23 + 48.3분 ≈ 영상2 20:29:51이라 연속 촬영으로 보인다(같은 경기인지는 미확정).
  - fps는 ffprobe 평균값(30.099)을 쓰고, 실패하면 샷 프레임 번호로 추정한다.
- 바뀐 파일: `api/prisma/schema.prisma`, `api/prisma/migrations/20261109010000_match_analysis_schema/`, `api/src/results-import/`, `api/src/cli/import-results.ts`, `api/package.json`, `api/.env.example`(FFPROBE_PATH), `README.md`, `Docs/기술스택.md` 5장
- 문제와 해결: `prisma migrate dev`는 대화형이라 이 환경에서 실패했다. `prisma migrate diff`로 SQL을 만들고 `migrate deploy`로 적용했다. 빈 폴더를 migrations에 먼저 만들면 P3015 오류가 나므로 SQL을 다른 곳에 만든 뒤 옮겨야 한다.
- 확인 결과:
  - 빌드, 린트, 단위 테스트 7개 통과
  - 경기 2개, 이닝 25+30, 샷 102+117, 사건 591+658, 샷 영상 219개 저장. 두 번 실행해도 중복 없음
  - 샷 영상 파일 219개 모두 존재, 모든 영상 구간이 샷 구간을 포함
  - 넣지 않은 것: 궤적(`track.npz`만 있음), 모서리 좌표, 실패 원인(5단계 전), 피드백, 득점 집계(확정된 샷 없음)
  - `schema.proposed.prisma`는 지우지 않고 남겨 두었다(삭제는 사용자 승인 필요)

관련 문서: [environment](environment.md), [ball-detection](ball-detection.md), [tech-decisions](tech-decisions.md)
