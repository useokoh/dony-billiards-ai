---
name: agent-wiki-memory
description: 작업 기록,이전 결정, 인수인계가 필요하거나 계획, 수정을 시작할 때 사용
---

# Agent Wiki Memory

## Start
작업 주제로 `docs/agent-wiki/`를 파일 검색해 최근 기록과 관련 문서만 읽는다. 기록이 비어 있으면 비어 있다고 알린다.

## During
작업 요약, 바뀐 파일, 결정과 이유, 안 된 시도, 검증, 막힌 점만 추적한다.

## End
세션 기록은 `docs/agent-wiki/sessions/YYYY-MM-DD/HHmm-주제.md`에 저장한다. 큰 주제는 `docs/agent-wiki/work-log/YYYY-MM-DD-주제.md`로 정리한다.

## 프라이버시
비밀키, `.env` 값, 개인 절대 경로(예: `Users`, `/Users`), 대화 원문은 기록하지 않는다.
