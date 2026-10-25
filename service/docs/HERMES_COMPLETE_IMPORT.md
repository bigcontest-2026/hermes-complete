# HERMES Complete 가져오기

사용자 제공 `HERMES_Complete.html` 기준. 원본 SHA-256: `a9bcf58d629f56bdb13cdd3bb8d426f7147e8c31eac34f4340adb5bfe92dafe0`.

대화 이력·정책 초안·보고서 동작과 데이터 연결을 유지한다. 화면은 사용자 제공 `hermes-chat-desktop.html` 시안과 헤르미 이미지 5종을 적용했다.
- I5·활동: 기존 `/api/model/*` 서버 API. 실패 시 저장본으로 대체하지 않음.
- 추천: `/api/model/welfare` → 기존 LangGraph → ERD 임시 DB. 전체 집단은 집단별 실행 근거를 유지해 합친다.
- I5 고저 임계값으로 분야를 고르는 원본 HTML 규칙은 적용하지 않음.
- 전국 기준값·동 통신·보조 맥락: 첨부 HTML의 해시 검증된 저장 자료. 별도 서버 최신 조회가 아님.
- 대화·검토·초안·보고서: 브라우저 로컬 기록. 새 케이스는 `hermes-complete-live-cases-v1`에 근거와 함께 저장.
- 가상 사업을 공식 운영사업으로 표시하지 않으며 실제 신청 링크를 제공하지 않음.
- 일반 대화는 규칙 기반 안내+서버 추천 그래프다. 현황 보고서의 외부 맥락 조사는 Step 08의 별도 API에 연결되며 완료·근거 미확보·실패 상태를 구분한다. 실제 외부 모델 전체 성공은 아직 미검증이다.

재생성: `python frontend/scripts/import_hermes.py PATH_TO_HERMES_Complete.html`.
실행 파일은 `shared/hermes-complete.html`, 연결 코드는 `frontend/scripts/hermes-live-adapter.js`.
이전 React HERMES 화면은 `?mode=legacy`로 보존한다.

데스크톱 화면은 `shared/hermi-desktop.css`와 `shared/hermi-desktop.js`에서 관리한다. 홈은 중앙 입력창, 분석 이후에는 왼쪽 대화와 오른쪽 작업 패널을 함께 표시한다. 900px 이하에서는 대화·자료 전환 버튼을 제공한다. 헤르미 원본 이미지는 `shared/hermes/hermi/`에 보관한다.
가져오기 스크립트가 새 디자인 파일의 연결을 유지하며, 분석·복지·보고서는 기존 데이터 경계를 사용한다. 대응안의 미저장 입력값은 현재 페이지 세션 안에서 분석별로 유지한다.

상단 메뉴는 헤르미와 대화·대시보드·복지 리스트로 구성한다. 대시보드와 전체 복지 목록은 `shared/hermi-overview.js` 및 `shared/hermi-overview.css`에서 관리한다.
- 대시보드: `/api/model/regions`, `/api/model/survey-area` 전체 페이지를 조회하고 기존 전국 사회조사 참고평균과 구분해서 표시한다. 시도 지도는 같은 시도 내 상위 시/하위 구의 이름 관계를 기준으로 중복을 제거한 20세 이상 인구가중 평균이다.
- 복지 리스트: `/api/model/welfare/catalog`에서 게시된 전체 사업을 검색·필터·페이지 조회한다. 추천되지 않은 사업, 종료·미분류 자료도 포함한다. 사업 기간과 신청 가능 여부는 구분한다.
- 두 화면은 `?page=dashboard`, `?page=welfare-list`로 직접 열 수 있다. 상단의 개발 상태 배지는 표시하지 않는다.

화면 용어는 `shared/hermi-copy.js`와 `frontend/scripts/hermes_plain_language.py`에서 관리한다. 내부 계산·API 키는 유지하고, 생성된 설명·저장된 답변의 표시·보고서 내려받기에는 쉬운 한국어를 적용한다. 사용자 입력과 원본 근거 식별자는 바꾸지 않는다.

현황·원인 분석 보고서는 `shared/hermi-analysis-reports.js`와 `frontend/scripts/hermes_analysis_reports.py`로 연결한다. 첫 관측 보고서 저장 뒤 지역 맥락 조사 API를 호출하며 실패 시 원본과 재시도 버튼을 유지한다. 상단 **저장된 보고서**는 서버 목록·전문·다운로드를 제공하므로 브라우저 대화 기록이 없어도 열람한다. 자세한 범위·검증은 [Step 08](../../agent/docs/implementation/step08/README.md)을 따른다. **③ 복지 매핑은 이번 구현에서 제외한다.**

대응안 작업 화면은 `shared/hermi-response-workspace.js`·`.css`로 관리한다. 분석의 근거와 선택 요약을 유지하며 초안·의견·복수 선택을 서버에 저장한다. 통합 보고서는 선택한 수정 버전으로 고정하고 독립적으로 재조회한다. `shared/hermi-report-library.css`는 분석/예방 대응 목록과 지역·월 범위, 연결할 분석을 확인하는 선택 창을 제공한다. 지도·전체 복지에서 보고서 조회·연결만으로 외부 조사 모델을 호출하지 않는다. [Step 09](../../agent/docs/implementation/step09/README.md)에 UI·저장 계약과 검증 범위를 기록한다. 가져오기 패치는 새 화면 자산의 연결도 유지한다.


2026-10-25 화면 수정: 답변의 제목·본문·하단 행동을 구분하고 `shared/hermi-answer.js`에서 설명 문장의 제목·강조·목록을 안전하게 표시합니다. 대화에서 실제 적용된 성별·연령을 함께 표시하며, 기존 연령 기본값과 분석 범위는 유지합니다.
복지 리스트는 전체 자료·전국 사업·시군구·읍면동 범위를 제공합니다. 조건을 고른 뒤 **선택**을 누르면 조회하며, 현재 조회 지역은 상단 라벨로 구분합니다. 시군구는 해당 시군구→소속 읍면동→전국, 읍면동은 해당 읍면동→상위 시군구→전국 순으로 서버에서 정렬한 뒤 페이지를 나눕니다. 카드와 상세 화면에서 자료 출처·신청기간을 확인할 수 있습니다.
