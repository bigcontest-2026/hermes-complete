# HERMES Complete 가져오기

사용자 제공 `HERMES_Complete.html` 기준. 원본 SHA-256: `a9bcf58d629f56bdb13cdd3bb8d426f7147e8c31eac34f4340adb5bfe92dafe0`.

화면 CSS·구조·대화 이력·정책 초안·보고서 동작을 보존하고, 데이터 경계를 연결했다.
- I5·활동: 기존 `/api/model/*` 서버 API. 실패 시 저장본으로 대체하지 않음.
- 추천: `/api/model/welfare` → 기존 LangGraph → ERD 임시 DB. 전체 집단은 집단별 실행 근거를 유지해 합친다.
- I5 고저 임계값으로 분야를 고르는 원본 HTML 규칙은 적용하지 않음.
- 전국 기준값·동 통신·보조 맥락: 첨부 HTML의 해시 검증된 저장 자료. 별도 서버 최신 조회가 아님.
- 대화·검토·초안·보고서: 브라우저 로컬 기록. 새 케이스는 `hermes-complete-live-cases-v1`에 근거와 함께 저장.
- 가상 사업을 공식 운영사업으로 표시하지 않으며 실제 신청 링크를 제공하지 않음.
- 자유형 LLM 및 외부 원인 검색은 후속. 현재 규칙 기반 안내+서버 추천 그래프.

재생성: `python frontend/scripts/import_hermes.py PATH_TO_HERMES_Complete.html`.
실행 파일은 `shared/hermes-complete.html`, 연결 코드는 `frontend/scripts/hermes-live-adapter.js`.
이전 React HERMES 화면은 `?mode=legacy`로 보존한다.
