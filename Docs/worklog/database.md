# 데이터베이스

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
