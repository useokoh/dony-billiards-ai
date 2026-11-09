# 데이터베이스

## 2026-11-09 추천 경로 신뢰도 개선과 고급 비교
- 한 일: `api/src/coaching/route-geometry.ts`를 거울 반사에서 **실측 모델 굴리기**로 바꿨다(`route-model.ts`, 기본값 `route-model.default.ts`). 경로마다 `expectedSuccess`(기대 성공률)와 `comparison`(두께 허용 폭, 자르는 각, 수구 이동 거리, 다음 배치)을 준다. `confidence`는 고정 0.35 대신 교차 검증 재현율(0.46)이다. 고급은 첫 목적구·쿠션 순서가 다른 계산 후보 3개를 기대 성공률 순으로 비교한다. `pointsBasis` 값 `mirror_geometry`를 `simulated`로 바꿨다.
- 결정과 이유:
  - 기대 성공률은 겨냥·꺾임 실행 오차(난이도별 **가정**)와 쿠션 잔차(실측)를 넣은 160회 몬테카를로다. 같은 배치는 같은 값이 나오게 결정적 난수를 쓴다.
  - 초급·중급 템플릿 순서(예: 장·단·장)는 최대 4쿠션으로 제한했다(처음엔 6쿠션 경로가 뽑혔다). 그 순서가 배치상 불가능하면 4쿠션 이내 다른 순서를 이유와 함께 권한다.
  - 세기는 경로 길이 규칙, 회전 방향은 진행 방향 쪽이다. 다음 배치는 1적구 실측 이동 거리 중앙값으로 추정한 참고값이다.
- 확인 결과(실제 DB 실패 샷 107개, 읽기만): 1순위 좌표 계산 초급·중급 51%(대체 경로 추가 전) / 고급 97%, 기대 성공률 중앙값 초급 0.36 · 중급 0.42 · 고급 0.46, 응답 중앙 4~5ms. API 테스트 137개, lint 경고 0, 빌드 통과. 웹 tsc·eslint·빌드 통과.
- 대체 경로 추가 후: 1순위 좌표 계산 초급·중급 92%(98/107, 그중 43개는 템플릿 순서 대신 다른 순서), 고급 97%(104/107). 이전 거울 반사 방식은 74%였다.
- 확인하지 않은 것: 계산 경로가 실제로 칠 만한지 사람 검토, 화면 표시

## 2026-11-09 궤적 저장, 선수 연결, 배치 기반 추천 경로
- 한 일: 가져오기가 `data/results/trajectories/*.json`을 `trajectories` 테이블에 넣는다(실제 DB 657행 = 219샷 × 공 3개). `GET /api/shots/:id/trajectory`를 만들었다. 경기에 선공·후공 선수를 연결하는 `first_player_id`, `second_player_id`(마이그레이션 `20261109040000_match_players`)와 `PATCH /api/matches/:id/players`를 만들었다. 코칭 요청에 난이도가 없으면 그 샷을 친 선수의 목표 핸디를 쓴다.
- 추천 경로 좌표: `api/src/coaching/route-geometry.ts`. 샷 시작 배치에서 거울 반사로 첫 목적구 → 쿠션 3개 → 두 번째 목적구 경로를 구하고(꺾임 80° 이하 중 가장 짧은 것), 먼저 맞힐 공·두께(무회전 기준)·진행 방향·순회전 방향을 채운다. 신뢰도 0.35로 표시한다.
- 결정과 이유:
  - 사용자가 남은 작업 "전부"를 선택했다. 궤적이 있어야 좌표·방향을 계산할 수 있어 궤적 → 경로 계산 → 선수 연결 → 웹 → 문서 순으로 했다.
  - 다시 가져오기 때 경기에 연결한 선수도 옮긴다(사람 확인과 같은 방식).
  - 연결된 선수 프로필이 지워졌으면 404 대신 기본값(초급)으로 코칭한다. 요청에 직접 준 `playerId`가 없으면 404다.
- 문제와 해결: 외래 키 추가로 SQLite가 `matches`를 다시 만든다(Prisma 표준). 사본에서 경기·샷·사건·영상·이닝 수와 점수가 그대로인 것을 확인한 뒤 적용했다.
- 바뀐 파일: `api/prisma/`, `api/src/trajectory/`(새로 만듦), `api/src/coaching/`, `api/src/matches/`, `api/src/shots/`, `api/src/results-import/`, `Docs/기술스택.md` 3.4·4·5·6장, `billiards-ai/README.md`
- 확인 결과:
  - API 테스트 127개, lint 경고 0, 빌드 통과
  - 적용 전 백업: `data/billiards.backup-20261109-before-trajectory.db`. 경기 번호가 7(영상1), 8(영상2)로 바뀌었다. 점수 32:22, 26:32와 사람 확인 3개 유지
  - 실패 샷 107개: 초급 1순위 경로 79개, 고급 후보 321개 중 255개가 배치로 계산됨. 나머지는 좌표 없이 규칙 예시
  - 사본 DB에서 선수 연결 → 선공(목표 20) 샷은 초급 1개, 후공(목표 30) 샷은 고급 3개 경로. 같은 선수 양쪽 400
  - 확인하지 않은 것: 계산한 추천 경로가 실제로 칠 만한 경로인지 사람이 본 적 없음

## 2026-11-09 득점 자동 확정 반영과 사람 확인 보존
- 한 일: 샷에 `score_basis`(판정 근거), `score_confidence`(신뢰도) 컬럼을 추가했다(마이그레이션 `20261109030000_auto_score`, 코칭 마이그레이션 `20261109020000_coaching_levels`와 함께 실제 DB에 적용). 가져오기가 분석기의 `result`·`fail_reason`을 저장한다. 점수는 **사람 확인 > 자동 확정** 규칙으로 이닝별·경기 전체를 다시 센다(`api/src/scoring/score.ts`). 조회 응답에 `scored`(최종 득점), `scoredBy`(human/auto/none)를 추가했다.
- 결정과 이유:
  - 사용자가 "득점 여부를 자동으로 확정"하도록 지시했다. 사람 확인은 자동 판정을 바로잡는 용도로 남긴다. `PATCH scoreConfirmed: null`은 자동 판정으로 되돌린다.
  - 다시 가져오기 때 사람이 확인한 값을 **시작 프레임 기준으로 옮긴다**(샷 번호는 바뀔 수 있음). 이전 기록의 "인정 기록이 사라진다" 문제를 해결했다.
- 바뀐 파일: `api/prisma/schema.prisma`, `api/prisma/migrations/20261109030000_auto_score/`, `api/src/scoring/`(새로 만듦), `api/src/shots/shots.service.ts`, `api/src/matches/matches.service.ts`, `api/src/results-import/`, `api/src/cli/import-results.ts`, 웹 `web/src/lib/api.ts`, `web/src/lib/shot-text.ts`, `web/src/components/match/MatchDetail.tsx`, `ShotFeedback.tsx`, `web/src/app/page.tsx`
- 확인 결과:
  - API 테스트 99개, lint, 빌드, 웹 tsc·lint·빌드 통과
  - 사본 DB로 먼저 해 본 뒤 실제 DB에 적용했다. 적용 전 백업: `data/billiards.backup-20261109-before-auto-score.db`
  - 실제 DB: 경기 5(영상1) 32:22, 경기 6(영상2) 26:32. 판정 전(unknown) 샷 0개. 기존 사람 확인 3개가 유지됨(못 옮김 0). 경기 번호가 5, 6으로 바뀜
  - 사본 DB에서 불인정 1건 → 다시 가져오기 → 유지되고 점수에 반영(32:22 → 31:22)
  - 실패 샷의 코칭 API가 이제 실제 데이터에서 동작한다(`applicable: true`)
  - 확인하지 않은 것: 브라우저·휴대폰에서 바뀐 화면 표시

## 2026-11-09 목표 핸디별 실패 샷 코칭 기반
- 한 일: 플레이어의 현재·목표 핸디와 코칭 난이도를 저장하는 `players` 테이블을 추가하고, 추천 경로에 난이도·구조화된 실행 힌트·신뢰도를, 피드백에 목표 핸디를 추가했다. `GET /api/shots/:id/route`, `GET /api/shots/:id/feedback`, 플레이어 CRUD API를 구현했다.
- 결정과 이유:
  - 난이도는 목표 핸디 **20 이하=초급, 21~27=중급, 28 이상=고급**으로 정했다. 요청의 `level`·`handicap`·`playerId` 순으로 결정하며, 값이 없으면 초급으로 안전하게 시작한다.
  - 실행 힌트는 첫 목적구 두께, 쿠션 순서·방향, 권장 회전 방향·회전량, 당점, 강약을 구조화해 돌려준다. 다만 영상만으로 실제 회전·힘을 판정할 수 없으므로 항상 `recommended`·`verified: false`로 표시한다.
  - 추천은 실패 샷에서만 제공한다. DB에 계산된 추천 경로가 있으면 그것을 우선 쓰고, 없으면 실패 유형과 난이도에 따른 규칙 기반 예시를 제공한다.
- 바뀐 파일: `api/prisma/schema.prisma`, `api/prisma/migrations/20261109020000_coaching_levels/`, `api/src/coaching/`, `api/src/players/`, `api/src/app.module.ts`
- 확인 결과: 실제 SQLite DB에 마이그레이션을 적용했다. API 단위 테스트 91개, lint, Nest 빌드가 통과했다. 사본 DB에서 목표 핸디 20·27·30에 따라 추천 경로 수가 1·2·3개로 달라지고, 성공 샷에는 추천하지 않는 것을 확인했다.
- 남은 일: 실제 분석 샷 219개가 모두 `result=unknown`이라 현재는 코칭 대상이 아니다. 실패 원인 판정(기술스택 8장 5단계), 궤적 기반 실제 경로 좌표·방향 계산, 경기/샷과 플레이어 ID 연결, 웹 화면 연결이 필요하다.

## 2026-11-09 득점 인정 API와 목록 득점 후보 수
- 한 일: `PATCH /api/shots/:id`(본문 `{"scoreConfirmed": true|false|null}`)를 만들었다. 저장하면서 그 이닝과 경기의 선공·후공 점수를 인정된 샷 수로 다시 계산한다(트랜잭션). 경기 목록 응답에 `candidateCount`(득점 후보 수)를 추가했다.
- 결정과 이유:
  - null은 확인 취소다. 화면에서 이미 누른 버튼을 다시 누르면 취소된다.
  - 득점 후보가 아닌 샷도 API로는 인정할 수 있게 했다. 분석기가 놓친 득점을 바로잡기 위해서다. 화면에는 후보이거나 이미 확인한 샷에만 버튼을 보여 준다.
  - class-validator가 없어서 본문 검사는 `parseConfirmBody`로 직접 한다. 잘못된 값이면 400을 돌려준다.
- 바뀐 파일: `api/src/shots/`(service, controller, spec), `api/src/matches/matches.service.ts`(+spec)
- 확인 결과: 단위 테스트 19개 통과. DB 사본으로 띄운 서버에서 인정 → 1:0, 두 번째 인정 → 2:0, 불인정 → 1:0, 취소 → 0:0, 다른 이닝 샷 반영, 400·404를 확인했다. 실제 DB의 확정 샷은 0개 그대로다.
- 주의: 분석 결과를 다시 가져오면(`import:results`) 경기를 지우고 새로 넣으므로, **사람이 인정한 기록도 사라진다.** 다시 가져오기 전에 보존 방법을 정해야 한다.

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
