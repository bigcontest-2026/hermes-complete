# HERMES Complete · 동행관측소

팀 **헤르메스(HERMES)**의 빅콘테스트 2026 **통합 시연·개발 저장소**입니다. 사회조사 기반 **I5(고립취약성 참고지표)**와 통신·카드 기반 **활동변화 관측(V3 계열)**을 각각 조회하고, 설명 가능한 근거 및 복지자원 후보를 함께 검토하는 HERMES 화면을 제공합니다.

> **읽기 기준 — 2026-10-25**: 이 저장소는 [`service`](https://github.com/bigcontest-2026/service), [`agent`](https://github.com/bigcontest-2026/agent), [`model`](https://github.com/bigcontest-2026/model)의 구성 요소를 **독립 개발용으로 모아 실행**합니다. 기존 레포의 Git 이력을 합치거나 원본 저장소를 대체하지 않습니다. 원본 기준 커밋은 [`SOURCE_ORIGINS.json`](SOURCE_ORIGINS.json)에 기록되어 있습니다.

## 🔖 바로가기

| 찾는 내용 | 문서 |
| --- | --- |
| **전체 프로젝트·저장소 위치** | [BigContest 조직 홈](https://github.com/bigcontest-2026) |
| **통합 화면 가져오기·원본 보존** | [HTML 가져오기 가이드](service/docs/HERMES_COMPLETE_IMPORT.md) |
| **현재 구현·검증 기록** | [Step 06 HERMES HTML 연결](agent/docs/implementation/step06/README.md) · [단계별 구현](agent/docs/implementation/README.md) |
| **모델의 기준·검증 결과** | [최종 모델 README](https://github.com/bigcontest-2026/model/blob/main/final_model/README.md) · [에이전트 인계](https://github.com/bigcontest-2026/model/blob/main/final_model/reports/AGENT_HANDOFF.md) |
| **발표 최신 구성·파일** | [P01~P09 원고](https://github.com/bigcontest-2026/ppt/tree/main/reviews/r02_story_alignment/context_reset_20261023) · [PPT 버전 목록](https://github.com/bigcontest-2026/ppt#동행관측소-발표자료) |
| **심사용 코드 재현** | [submission](https://github.com/bigcontest-2026/submission) (**별도 제출 정리용 레포**) |

## 🏗️ 프로젝트 구성

```text
hermes-complete/
├── README.md
├── SOURCE_ORIGINS.json             # 분리 원본과 기준 커밋
├── service/
│   ├── backend/                    # FastAPI·모델/복지 조회 API
│   ├── frontend/                   # Vite 진입점·HERMES HTML 연결
│   ├── shared/hermes-complete.html # 변환·연결된 통합 화면
│   └── docs/                       # 화면 가져오기·구현 설명
├── agent/                          # LangGraph 복지 추천·단계별 구현 기록
├── model/                          # 읽기용 모델 계약·I5 집계 번들
├── bundles/activity/               # 배포/조회에 필요한 활동 산출물 부분집합
└── scripts/
    ├── run_api.py                  # 통합 백엔드 실행
    └── smoke_test.py               # 통합 점검
```

### 데이터 → 근거 → 지원 후보

1. **I5 / 사회조사:** 설문 기반 5영역의 취약성 **참고 맥락**과 인구구성 가중 집계치를 조회합니다. 특정 행정동의 직접 설문 고립률이나 개인 진단값이 아닙니다.
2. **활동 / V3 계열:** 통신·카드의 지역·월·성·연령별 변화, 품질 및 설명 근거를 **별도** 조회합니다. 시군구 관측을 동·개인 값으로 옮기지 않습니다.
3. **복지 추천:** `/api/model/welfare` → LangGraph → **ERD 임시 DB의 가상 사업**을 탐색합니다. 활동신호 기반 `research-context-v1` 경로와 관련 I5 맥락을 참고하며, I5 고저 임계값은 아직 확정되지 않았습니다.
4. **HERMES 화면:** 지도·지수·활동 비교, 대화 내 근거, 추천, 기록·보고서·정책 초안을 표시합니다. 서버 연결 실패 시 저장본 추천으로 조용히 대체하지 않습니다.

## ▶️ 로컬 실행

**준비물:** Python 3.12 이상, Node.js 22 이상. 명령은 **이 저장소 루트**에서 시작합니다.

### 1. API 실행

**Windows PowerShell**

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r service/backend/requirements.txt
.venv/Scripts/python scripts/run_api.py
```

**macOS / Linux**

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r service/backend/requirements.txt
.venv/bin/python scripts/run_api.py
```

### 2. 새 터미널에서 프런트 실행

**Windows PowerShell**

```powershell
cd service/frontend
npm ci
$env:MODEL_API_PROXY='http://127.0.0.1:8011'
npm run dev -- --port 5175
```

**macOS / Linux**

```bash
cd service/frontend
npm ci
MODEL_API_PROXY=http://127.0.0.1:8011 npm run dev -- --port 5175
```

브라우저에서 **http://127.0.0.1:5175/** 접속. 기본 진입점은 새 HERMES HTML로 연결되며 이전 React 화면은 `/?mode=legacy`로 보존됩니다. API 포트를 변경할 때는 `PORT`와 `MODEL_API_PROXY`를 함께 맞춥니다.

### 3. 검증

저장소 루트에서:

```powershell
# Windows
.venv/Scripts/python scripts/smoke_test.py

# macOS / Linux에서는 대신
# .venv/bin/python scripts/smoke_test.py

cd service/frontend
npm test
npm run build
```

[Step 06 검증 기록](agent/docs/implementation/step06/README.md)은 HTML 스크립트 문법, 지역·집단별 추천 근거 유지, 실패 시 대체 금지 및 빌드 결과를 기록합니다. 기록된 **과거 로컬 시험 성공을 현재 환경/원격 CI 성공으로 자동 간주하지 않습니다**.

## 🧩 실제 연결과 시연 범위

| 구분 | 현재 사용 방식 | 주의 |
| --- | --- | --- |
| 지역·지도·I5·활동 | 실제 집계·검증 번들을 읽는 `/api/model/*` | 조회 자료의 지역·기간·품질 범위 제한 |
| 복지 추천 | 서버의 LangGraph + ERD **가상 사업 DB** | 공식 사업·자격 확정·실제 신청 연계 아님 |
| 대화 | 규칙 기반 근거 안내 + 서버 추천 연결 | **자유형 LLM 대화 미연결** |
| 전국 기준값·행정동 통신·보조 맥락 | 원본 HTML에서 가져온 해시 검증 **보관 자료** | 새로운 서버 실측 조회 결과가 아님 |
| 대화·검토·후속 조치·정책 초안 | 브라우저 `localStorage` | 서버 공용 저장·기관 전송·다기기 동기화 아님 |
| 정책/보고서 | 검토·시연용 화면과 초안 | 기관 확정 보고·실제 정책 집행 아님 |

**예시 검증 조건:** 강남구 2025년 8월 남성 20대 활동 및 복지 추천. [Step 06 기록](agent/docs/implementation/step06/README.md)에 통신 -4.51%, 카드 -0.34%, 추천 2건과 근거 ID를 확인한 **당시 시나리오**가 있습니다. 복지 사업의 신청기간·현재 유효성은 실행 날짜에 따라 달라지며, 임시 DB는 실제 사업 DB를 대표하지 않습니다.

### 완료와 남은 작업을 구별하기

- **구현/검증 기록 있음:** 통합 HTML 연결, 실제 I5·활동 집계 조회, 서버 복지 추천 그래프 연결, 집단별 근거 유지, 로컬 저장, 오프라인 시험/빌드.
- **추가 구현 또는 운영 검증 필요:** 정식 복지사업 DB·자격/신청 링크, 자유형 대화 및 외부 원인 조사, 기관별 공동 기록·접근 통제 운영, 현장 개입 효과 검증.
- 자료 품질이 `hold`이거나 `operational_alert_allowed=false`이면 **운영 경보·자동 개입의 근거로 바꾸지 않습니다**. 관측 결과는 개인 고립 판정/확률이 아닙니다.

## 📦 파일·이력 관리 규칙

- `model/`의 전국 I5 번들은 검증된 집계 자료입니다. `bundles/activity/`는 실제 활동 산출물 중 **조회에 필요한 배포용 부분집합**이며 원본 파일 해시, 원본 manifest 해시 및 제외 범위 기록을 유지합니다.
- **원천 개인자료, 대회 원자료, 비밀 키, 가상환경, `node_modules`, 로컬 DB, 실행 로그**는 이 저장소에 넣지 않습니다.
- 복지 DB는 첫 실행 시 가상 사업 5건으로 생성되며 Git에 저장하지 않습니다. 다른 운영사업 DB를 연결한 것으로 착각하지 않습니다.
- 통합 저장소의 하위 `service/README.md`·`agent/README.md` 등에는 **원래 독립 저장소 시기의 경로·실행 방식**이 남아 있을 수 있습니다. **이 저장소를 실행할 때는 이 루트 README와 통합 구현 기록을 우선**합니다.
- 개별 원본 레포·PPT·submission의 변경은 자동 반영되지 않습니다. 변경 시 **기준 커밋 / 영향 데이터·코드 / 검증 상태 / 미완료 항목**을 함께 기록하고 교차 확인합니다.

## 👥 팀원 작업 시작 순서

1. **기획·발표:** [조직 홈](https://github.com/bigcontest-2026) → [ppt](https://github.com/bigcontest-2026/ppt) → [docs](https://github.com/bigcontest-2026/docs)
2. **통합 화면 작업:** 이 README → [HTML 연결 규칙](service/docs/HERMES_COMPLETE_IMPORT.md) → `service/frontend/`
3. **추천/근거 로직 작업:** [구현 단계](agent/docs/implementation/README.md) → `agent/` → `service/backend/`
4. **검증·제출 준비:** `scripts/smoke_test.py` 및 프런트 테스트 → [submission](https://github.com/bigcontest-2026/submission)에서 **제출 코드·입력 별도 검증**

**발표본·통합 시연본·제출 코드의 상태는 각각 관리합니다.** 여기의 동작이 곧 대회 최종 제출 승인이나 기관 운영 준비 완료를 의미하지는 않습니다.
