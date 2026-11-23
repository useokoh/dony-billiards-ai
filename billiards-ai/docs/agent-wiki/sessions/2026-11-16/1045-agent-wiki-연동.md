# 세션 기록
- 날짜: 2026-11-16
- 작업: Agent Wiki를 billiards-ai에 연동
- 요약: 프로젝트 루트에 위키 안내, Claude skill/commands, 기본 문서와 기록 폴더를 설치하고 context를 프로젝트에 맞게 작성함.
- 결정과 이유: 루트에 설치해 web과 api를 포함한 프로젝트 작업에서 공통으로 참고할 수 있게 함. 기존 수정 파일은 보존함.
- 시도했지만 안 된 것: 없음
- 바뀐 파일(프로젝트 기준 경로): CLAUDE.md, .claude/skills/agent-wiki-memory/SKILL.md, .claude/commands/wiki-log.md, .claude/commands/wiki-resume.md, docs/agent-wiki/context.md, docs/agent-wiki/templates/session-log.md, docs/agent-wiki/sessions/2026-11-16/1045-agent-wiki-연동.md
- 검증: doctor, setup --dry-run, setup, verify 통과
- 후속 작업: 다음 작업부터 관련 세션 기록과 기존 ../Docs/worklog/ 결정을 함께 참고
- 프라이버시 점검(비밀키, 개인 절대경로, 대화 원문 없음 확인): 완료
