# HERMES Complete · 동행관측소

팀 **헤르메스(HERMES)**의 빅콘테스트 2026 **통합 시연·개발 저장소**입니다. 사회조사 기반 **I5(고립취약성 참고지표)**와 통신·카드 기반 **활동변화 관측(V3 계열)**을 각각 조회하고, 설명 가능한 근거 및 복지자원 후보를 함께 검토하는 HERMES 화면을 제공합니다.

> **읽기 기준 — 2026-10-26**: 이 저장소는 [`service`](https://github.com/bigcontest-2026/service), [`agent`](https://github.com/bigcontest-2026/agent), [`model`](https://github.com/bigcontest-2026/model)의 구성 요소를 **독립 개발용으로 모아 실행**합니다. 기존 레포의 Git 이력을 합치거나 원본 저장소를 대체하지 않습니다. 원본 기준 커밋은 [`SOURCE_ORIGINS.json`](SOURCE_ORIGINS.json)에 기록되어 있습니다.

## 🔖 바로가기

| 찾는 내용 | 문서 |
| --- | --- |
| **전체 프로젝트·저장소 위치** | [BigContest 조직 홈](https://github.com/bigcontest-2026) |
| **통합 화면 가져오기·원본 보존** | [HTML 가져오기 가이드](service/docs/HERMES_COMPLETE_IMPORT.md) |
| **현재 구현·검증 기록** | [분석·대응 보고서 연결 수정](service/docs/REPORT_FLOW_FIXES_20261026.md) · [Step 10 생애주기·확인 필요 연결](agent/docs/implementation/step10/README.md) · [단계별 구현](agent/docs/implementation/README.md) |
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
2. **활동 / V3 계열:** 통신·카드의 지역·월·성·연령별 변화를 서버의 공통 **5% 감소 규칙**으로 분류합니다. 양원천 감소와 연속성·상대적 이례성을 구분하며 시군구 관측을 동·개인 값으로 옮기지 않습니다. I5·MOIS·C3는 배경·다른 기준선의 참고 근거로 보존합니다.
3. **복지 조회:** 원격 DB를 설정하면 `/api/model/welfare/catalog`가 Supabase의 활성 공개 자료를 검색합니다. `/api/model/welfare`의 LangGraph는 활동 변화와 관련 I5 맥락으로 탐색 분야를 정하고, DB에 저장한 **지원내용 원문의 제공 서비스**와 연결해 담당자 검토 후보를 만듭니다. 인구·세대 구성과 과거 카드 비교는 별도 배경으로 보존하며 점수나 독립 신호를 더하지 않습니다. 원격 설정이 없을 때만 기존 가상 사업 시연을 사용합니다.
4. **HERMES 화면:** 홈과 대시보드는 행정동 중심으로 탐색합니다. 시도·시군구는 탐색 범위를 좁히는 상위 경로이며, 동을 선택하면 실제 동별 I5·5영역·인구구성과 해당 동의 지도 경계를 표시합니다. 통신·카드 범주는 상위 시군구 참고로 표시하고 같은 원천 관측을 동 수만큼 중복 집계하지 않습니다. 복지 조회와 보고서·후속 대응안까지 선택한 10자리 행정동 코드를 유지합니다. 서버 연결 실패 시 저장본 추천으로 조용히 대체하지 않습니다.
5. **현황·원인 보고서:** `/api/model/analysis-reports`가 검증된 관측·5% 분류·배경 근거를 서버 SQLite에 저장하고, `/{report_id}/investigate`가 공개 지역 맥락과 가능한 원인을 조사해 원본에 연결된 별도 보고서를 저장합니다. 원본 수치·분류는 유지하며 완료 보고서는 재사용합니다. 조사 실패 시 관측 보고서를 보존하고 재시도를 안내합니다. 상단 **저장된 보고서**에서 독립적으로 열람·내려받습니다. 실제 외부 모델의 전체 성공 검증은 자료 전송 승인 대기입니다. 첫 보고서 생성만으로 대응안이나 대응 보고서를 자동 생성하지 않습니다.
6. **대응안·통합 보고서:** Step 09에서 분석 보고서의 **대응안 검토하기**로 이어집니다. 담당자가 대응안을 작성하거나 복지 리스트의 사업을 가져와 수정·복수 선택하고 서버에 저장합니다. 선택한 버전만 묶은 예방 대응 보고서는 별도 산출물로 저장·재조회합니다. 지도에서는 선택 지역의 기존 보고서를 찾고, 복지 리스트에서는 연결할 분석을 먼저 고릅니다. 외부 모델·기관에 연락하거나 복지 매핑을 변경하지 않습니다.

행정동 지도는 2025년 7월 경계를 단순화한 `service/shared/hermes/dashboard-dongs.geojson`을 사용합니다. 2025년 12월 I5는 3,617개 동·읍면·출장소를 조회하며, 이 중 경계가 연결되는 3,554개를 지도에 그립니다. 원본 경계가 없는 63개도 목록과 상세 조회에서 유지하고 상위 지역 경계로 대신 표시하지 않습니다. 상위 시군구 활동 자료가 없는 동도 실제 동별 I5를 담은 부분 보고서로 저장하며, 없는 활동 관측을 만들어 채우지 않습니다. 출처·코드 대조·월별 연결 범위는 경계 파일의 `source`에 기록합니다.

## ▶️ 로컬 실행

**준비물:** Python 3.12 이상, Node.js 22 이상. 명령은 **이 저장소 루트**에서 시작합니다.

### 1. API 실행

Supabase를 사용할 때는 `service/backend/.env.example`을 참고해 `service/backend/.env`에 다음을 설정합니다. `scripts/run_api.py`가 이 파일을 읽으며, 이미 지정한 셸 환경변수가 우선합니다.

```dotenv
WELFARE_DATABASE_URL="postgresql://USER@HOST:5432/postgres?sslmode=require"
WELFARE_DATABASE_PASSWORD="DB 비밀번호"
WELFARE_DATABASE_SCHEMA="welfare"
```

주소·계정·포트는 Supabase **Connect → Session pooler**에서 복사합니다. 비밀번호는 위 별도 항목에 원문 그대로 넣을 수 있습니다. `WELFARE_PUBLICATION_ID`를 생략하면 출처별 활성 공개 묶음을 사용합니다. 서버는 읽기 전용으로 연결하고, 오류가 나도 가상 사업으로 대체하지 않습니다. 접속 정보는 Git이나 프런트엔드에 넣지 않습니다.

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

연결만 먼저 확인하려면 `.venv/bin/python scripts/check_supabase.py`를 실행합니다. 비밀번호나 사업 원문을 출력하지 않고 연결·읽기 전용 상태와 테이블 구조를 확인합니다.

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
# Windows: 외부 DB에 접속하지 않는 로컬 점검
.venv/Scripts/python scripts/smoke_test.py --local-only

# macOS / Linux에서는 대신
# .venv/bin/python scripts/smoke_test.py --local-only

cd service/frontend
npm test
npm run build
```

[Step 06 검증 기록](agent/docs/implementation/step06/README.md)은 HTML 스크립트 문법, 지역·집단별 추천 근거 유지, 실패 시 대체 금지 및 빌드 결과를 기록합니다. 기록된 **과거 로컬 시험 성공을 현재 환경/원격 CI 성공으로 자동 간주하지 않습니다**.

`--local-only`는 포함된 100개 활동 관측의 분류와 보고서 저장·재조회만 점검하며 원격 복지 DB에 접속하지 않습니다. 옵션 없이 실행하면 설정된 복지 자료원까지 점검하므로 Supabase가 설정된 환경에서는 원격 목록 조회가 발생합니다. 현재 5% 규칙과 저장 API의 자세한 계약은 [구현 단계의 Step 07](agent/docs/implementation/README.md)에 있습니다.

2026-10-26 업로드 전 재검증: 에이전트 **403 passed, 13 skipped, 65 subtests passed**, 백엔드 **374 passed, 17 skipped, 14 subtests passed**, 프런트 **393 passed / 21 files**. 프런트 production build도 통과했습니다. 생략한 환경 의존 검사는 성공으로 세지 않으며, 외부 AI·원격 DB의 실제 통합 성공이나 배포 검증은 포함하지 않습니다.

## 🧩 실제 연결과 시연 범위

| 구분 | 현재 사용 방식 | 주의 |
| --- | --- | --- |
| 지역·지도·I5·활동 | 실제 집계·검증 번들을 읽는 `/api/model/*` | 조회 자료의 지역·기간·품질 범위 제한 |
| 복지 목록 | Supabase `welfare`의 활성 공개 자료 또는 로컬 가상 DB | 원격 접속 설정과 권한이 필요하며, 원격 오류 시 가상 자료로 대체하지 않음 |
| 복지 추천 | 서버의 LangGraph + 원문 제공서비스 연결 DB | 관계·참여/발굴·상담 우선 탐색, 소득·생활/돌봄 탐색 후 확인. 취업·정서·의료·주거·가족은 추가 수요 확인 후 탐색. 개인 자격·현재 접수는 별도 확인 |
| 대화 | 규칙 기반 근거 안내 + 서버 추천 연결, 선택한 공개 복지사업 한 건의 AI 설명 대화 | 사업 AI 대화는 로컬 개발 모드의 원격 DB·모델 제공자 설정 필요. 일반 자유형 대화와 기관 모드의 AI 대화는 미지원 |
| 전국 기준값·행정동 통신·보조 맥락 | 원본 HTML에서 가져온 해시 검증 **보관 자료** | 새로운 서버 실측 조회 결과가 아님 |
| 대화·검토·후속 조치·정책 초안 | 브라우저 `localStorage` | 서버 공용 저장·기관 전송·다기기 동기화 아님 |
| 현황·원인 분석 보고서 | 검증 관측을 먼저 저장하고 별도 AI 조사 결과를 출처와 함께 저장·조회 | 실제 외부 모델 전체 성공 미검증. 가능한 원인은 가설이며 운영 경보·개인 고립 판정 아님 |
| 대응안·예방 대응 보고서 | 분석 보고서 ID에 연결한 수정·선택을 서버 저장하고 선택 버전만 통합 | 담당자가 작성한 검토안이며 자동 사업 승인·효과 검증·정책 집행이 아님 |
| 이전 정책 초안 | 기존 브라우저 검토 화면 보존 | 새 서버 대응안으로 자동 이관하지 않음 |

**현재 예시:** 강남구 2025년 8월 남성 20대는 통신 -4.51%, 카드 -0.34%로 **기준 이상 감소 미포착**입니다. 현재 5% 규칙에서는 자동 복지 검색을 실행하지 않습니다. [Step 06 기록](agent/docs/implementation/step06/README.md)의 추천 2건은 5% 규칙 적용 전 시나리오입니다. 포함된 100개 관측의 현재 분류는 미포착 70·단일 감소 19·동시 감소 10·우선 검토 후보 1이며, 모두 원자료 품질 보류와 경보 불허를 유지합니다. 복지 사업의 신청기간·현재 유효성은 실행 날짜에 따라 달라지며, 임시 DB는 실제 사업 DB를 대표하지 않습니다.

### 완료와 남은 작업을 구별하기

- **구현/검증 기록 있음:** 통합 HTML 연결, 실제 I5·활동 집계 조회, 공통 5% 활동 분류, 첫 현황 보고서 저장·재조회, 대응안 수정·복수 선택·선택 버전의 통합 보고서 저장, 지도·복지 화면의 분석 연결, 로컬 시험/빌드.
- **추가 구현 또는 운영 검증 필요:** 복지 연결 규칙의 현장 적합성 평가, 개인별 자격·현재 신청 여부 확인, 자유형 대화, 외부 원인 조사의 실제 모델 성공 검증, 기관별 공동 기록·접근 통제 운영, 현장 개입 효과 검증.
- 원격 DB의 지역은 **담당기관 관할**이며 거주 자격이 아닙니다. 날짜는 **신청기간** 필드만 표시하고 사업 시행기간과 섞지 않습니다. 자동 분류·추출 상태는 수동 검토 완료로 바꾸지 않습니다.
- 제공서비스 연결 버전은 `welfare-service-actions-v3`입니다. 기존 `program_tags`를 덮어쓰지 않고 `support_mapping_rule_sets`·`program_support_actions`·`support_mapping_runs`에 규칙·원문 인용/위치/해시·완료 기록을 별도로 저장합니다. 읽기 전용 런타임과 분리된 `scripts/apply_welfare_support_mapping.py`로 등록하며, 현재 공개 묶음의 완료 기록이 없으면 추천을 보류합니다.
- 추가 수요 확인은 `/api/model/welfare?…&confirmed_needs=housing`처럼 명시적으로 전달합니다. 허용 분야는 `employment`, `mental_health`, `health_care`, `housing`, `family_support`이며 모델이 지수만으로 확인값을 만들지 않습니다. 사업별 결과는 연결 근거·미확인 조건·검토한 건수·검색 범위 제한을 보존합니다.
- 자료 품질이 `hold`이거나 `operational_alert_allowed=false`이면 **운영 경보·자동 개입의 근거로 바꾸지 않습니다**. 관측 결과는 개인 고립 판정/확률이 아닙니다.

## 📦 파일·이력 관리 규칙

- `model/`의 전국 I5 번들은 검증된 집계 자료입니다. `bundles/activity/`는 실제 활동 산출물 중 **조회에 필요한 배포용 부분집합**이며 원본 파일 해시, 원본 manifest 해시 및 제외 범위 기록을 유지합니다.
- **원천 개인자료, 대회 원자료, 비밀 키, 가상환경, `node_modules`, 로컬 DB, 실행 로그**는 이 저장소에 넣지 않습니다.
- 원격 URL이 없을 때만 첫 실행 시 가상 사업 5건의 로컬 DB를 생성합니다. 원격 URL이 있으면 Supabase 조회를 사용하며 로컬 시연 DB를 생성하지 않습니다.
- 통합 저장소의 하위 `service/README.md`·`agent/README.md` 등에는 **원래 독립 저장소 시기의 경로·실행 방식**이 남아 있을 수 있습니다. **이 저장소를 실행할 때는 이 루트 README와 통합 구현 기록을 우선**합니다.
- 개별 원본 레포·PPT·submission의 변경은 자동 반영되지 않습니다. 변경 시 **기준 커밋 / 영향 데이터·코드 / 검증 상태 / 미완료 항목**을 함께 기록하고 교차 확인합니다.

## 👥 팀원 작업 시작 순서

1. **기획·발표:** [조직 홈](https://github.com/bigcontest-2026) → [ppt](https://github.com/bigcontest-2026/ppt) → [docs](https://github.com/bigcontest-2026/docs)
2. **통합 화면 작업:** 이 README → [HTML 연결 규칙](service/docs/HERMES_COMPLETE_IMPORT.md) → `service/frontend/`
3. **추천/근거 로직 작업:** [구현 단계](agent/docs/implementation/README.md) → `agent/` → `service/backend/`
4. **검증·제출 준비:** `scripts/smoke_test.py` 및 프런트 테스트 → [submission](https://github.com/bigcontest-2026/submission)에서 **제출 코드·입력 별도 검증**

**발표본·통합 시연본·제출 코드의 상태는 각각 관리합니다.** 여기의 동작이 곧 대회 최종 제출 승인이나 기관 운영 준비 완료를 의미하지는 않습니다.
