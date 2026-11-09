# 사업소개서

## 2026-10-19 v3 제작
- 한 일: 크래프톤 IR 스타일로 다시 디자인하고, Supanova 리디자인 스킬 기준으로 HTML을 개선했다. 3번 슬라이드는 벤토 배치로 바꿨다.
- 결정과 이유: 내용과 배치는 `slides/deck.js`, HTML 표현은 `slides/make-html.js`에서 관리한다. `slides/index.html`은 생성 파일이라 직접 고치지 않는다.
- 바뀐 파일: `Project/HTML/사업소개서_v3.html`, `Project/PPTX/사업소개서_v3_편집용.pptx`, `Project/PPTX/사업소개서_v3_이미지용.pptx`
- 문제와 해결: 결과물이 `Project/HTML`, `Project/PPTX`로 정리되어 있으나 `slides/make-pptx.js`는 아직 `Project/` 바로 아래에 저장한다. 다시 만들기 전에 경로를 고쳐야 한다.
- 확인 결과: 파일 구조 검사와 Mac 미리보기만 확인했다. PowerPoint에서 직접 열어 보지 않았다. 기획서 8장 내용은 슬라이드에 없다.

관련 문서: [references](references.md), [planning-docs](planning-docs.md)
