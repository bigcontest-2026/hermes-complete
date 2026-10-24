# 동행 관측소 Service

현재 `model/final_model`의 조회 계약에 맞춘 React·FastAPI 서비스입니다. **전국 I5 참고지수**와 **자료가 있는 시군구의 SKT·카드 활동변화**를 각각 조회합니다. 기본 실행 모드는 `final`이며 첫 화면은 서울 25개 구·427개 행정동입니다.

```text
bigcontest-2026/
├── model/final_model/       # 모델 계산·조회 코드·스키마 (서비스는 읽기 전용)
├── model/data/i5/national_2025/ # 바로 조회하는 검증된 전국 I5 번들
├── isolation-index/         # 과거 V3 집계 재생성 시에만 필요
├── model_mori/              # 이전 연구 모델 보관 (현재 서비스 설치에는 불필요)
├── agent/                   # 조사 그래프·Codex 제공자·Phoenix 평가 (에이전트 실행에 필요)
└── service/
    ├── backend/            # 모델 조회 HTTP API
    └── frontend/           # I5 지도·읍면동 목록·시군구 활동변화
```

## 로컬 실행

Python 3.12 이상, Node.js 22 이상을 사용합니다. `service` 폴더에서:

```sh
python3 -m venv backend/.venv
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt
cd ..
backend/.venv/bin/python scripts/prepare_final_model.py
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

최신 `model`의 `data/i5/national_2025`를 기본으로 읽습니다. `prepare_final_model.py`는 이 번들의 무결성·스키마·행 수를 확인하며 재계산하지 않습니다. 이 검사는 선택 사항이고, 바로 서버를 실행해도 됩니다. 별도 I5 번들은 `I5_BUNDLE_PATH`로 지정합니다(`SURVEY_AREA_BUNDLE`도 호환). 과거 동결 집계를 다시 생성할 때만 `--source /path/to/2025_final_v1`을 지정합니다. 과거 두 지역 runtime 포인터가 남아 있어도 기본 전국 번들이 우선합니다.

활동변화는 팀에서 전달받은 **완료된 실측 번들 전체**를 준비하고, 서버 실행 시 경로를 설정합니다.

```sh
FINAL_MODEL_BUNDLE=/absolute/path/to/final_run \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`manifest.json`과 manifest가 가리키는 모든 파일이 필요합니다. 활동 번들이 없어도 I5 조회는 동작하며 활동 패널에는 자료 연결 대기가 표시됩니다.

다른 터미널에서 `service/frontend`로 이동합니다.

```sh
npm ci
npm run dev
```

`http://127.0.0.1:5173`에서 확인합니다. Vite가 `/api` 요청을 로컬 `8000`번 서버로 전달합니다. 프런트와 API를 따로 호스팅하면 빌드 시 `VITE_MODEL_API_BASE_URL`을 설정하고 API의 `CORS_ORIGINS`에 프런트 주소를 등록합니다. 설정 예시는 `backend/.env.example`, `frontend/.env.example`에 있습니다. 백엔드 `.env`는 자동으로 읽지 않으므로 셸 환경변수 또는 `uvicorn --env-file`을 사용합니다.

## 조회와 화면

- `/api/model/status`, `/api/health`: I5·활동 번들의 개별 준비 상태. `ok`, `partial`, `unavailable`을 구분합니다.
- `/api/model/regions?month=202512`: 실제 I5 결과의 시도·시군구 목록과 읍면동 수.
- `/api/model/survey-area`: `level=sgg|administrative_dong`, `province_code`, `region_code`, `dong_code`, `month`, `offset`, `limit`으로 I5 조회. `/api/research/i5`도 같은 조회를 제공합니다.
- `/api/model/behavior`: 시군구·월·성별·연령별 SKT/카드 변화, Q/H/T, 후보 여부와 연결된 C3 참고자료 조회.

공간·시간·집단 의미는 [현재 모델 연결 계약](docs/FINAL_MODEL_INTEGRATION.md)에 정리했습니다. I5는 전국 설문 6집단 평균을 지역 인구구성으로 가중한 참고지수입니다. 활동변화는 시군구의 10개 성·연령 집단 관측이며 `hold`와 운영 경보 불허 상태를 유지합니다.

첫 화면은 서울 전체 지도이며, 17개 시도와 실제 데이터의 시군구를 선택할 수 있습니다. 서울 427개 경계는 정확한 동 코드·구 이름을 대조하고 `창신제1동/창신1동`, 가운데점 등 표기 차이를 처리합니다. 다른 시도는 현재 지도 경계가 없어 읍면동 목록·상세값을 제공합니다. 500개가 넘는 시도도 모든 페이지를 조회합니다. 동을 선택하면 그 동의 시군구 활동을 별도로 조회하며, 성별·연령 선택은 활동 패널에만 적용됩니다.

## 검사

```sh
cd backend
.venv/bin/python -m pytest -q
cd ../frontend
npm test
npm run build
```

현재 모델 테스트는 실제 전국 번들의 기본 선택, 서울 25개 구·427개 동, 다른 시도·페이지 조회, 계약·해시·공간 단위·결측 처리를 확인합니다. 로컬 V3 집계가 있으면 과거 I5 294행 생성·조회도 확인합니다. 모델 조회만 설치한 로컬 환경에서는 일부 기존 조사 검사가 skip될 수 있습니다. CI는 agent를 필수 설치하고 제공자·실행 복구·관측·평가·인증·전국 I5 조사 시험의 누락이나 의존성 skip을 실패로 처리합니다. 로컬 비공개 공식 원문 및 별도 V3 원본이 필요한 검사만 명시적으로 skip을 허용합니다.

## 이전 화면과 배포

이전 `research`·`research-api` 화면은 제거했습니다. 해당 주소로 접속하면 현재 모델 화면을 표시하고 이전 mode 쿼리를 지웁니다. `?mode=mock`은 합성 시연입니다. 이전 조사 API 코드는 별도로 남아 있으며 최신 `model`, `agent`, `backend/requirements-legacy.txt`, `APP_MODE=research`가 필요합니다. 새 모델을 이전 10자리 행정동 조사 계약으로 자동 변환하지 않습니다.

GitHub Pages 워크플로는 `final` 화면을 빌드하며 저장소 변수 `VITE_MODEL_API_BASE_URL`이 필요합니다. 배포된 API의 HTTPS 주소와 CORS를 먼저 설정해야 합니다. 로컬 변경만으로 원격 사이트가 바뀌지 않습니다. Docker는 모델 코드·스키마와 Git에 포함된 전국 I5 번들을 포함합니다. 별도 활동 번들은 읽기 전용 볼륨으로 연결합니다.

## 조사 API의 전국 I5 연결

`APP_MODE=research`에서는 `backend/app/legacy_main.py`가 기존 조사 API와 전국 I5 조회를 제공합니다. 전국 I5를 지원하는 최신 `agent`·`model` 코드와 `backend/requirements-legacy.txt`가 필요합니다. `InvestigationTools`가 `i5_bundle` 인자와 `get_survey_area_isolation_index()`를 지원해야 합니다. 최신 `model` 패키지는 기존 조사 스냅샷 계약도 포함하므로 `model_mori`를 함께 설치하지 않습니다.

- `GET /api/research/i5?region_code=26110&month=202512`: 5자리 시군구 참고지수.
- `GET /api/research/i5?dong_code=2611051000&month=202512`: 10자리 행정동 참고지수.
- `offset`, `limit`으로 페이지를 조회합니다. 코드 형식 오류는 422, 손상·미완료 번들은 503, 미보유 지역은 `data_unavailable`로 반환합니다.
- `POST /api/investigations`는 지역명·지역 코드·월을 대조하고, 전국 I5를 조사 관측·브리프의 독립 근거로 전달합니다. 20세 이상 전체 참고지수와 요청한 20대·30대의 직접 관측은 구분합니다.

기본 번들은 형제 저장소의 `model/data/i5/national_2025/`입니다. 다른 위치에 배치할 때만 `I5_BUNDLE_PATH`를 지정하며, 지정 경로가 잘못되면 다른 자료로 대체하지 않습니다. `RESEARCH_PATH`는 기존 조사 스냅샷 경로로 유지합니다. 예제 환경 파일 수정만으로 설정이 적용되지는 않으므로 실행 환경에 값을 주입하고 서버를 재시작해야 합니다.

전국 I5 연계 테스트는 실제 HTTP 조회와 LangGraph의 `rule_baseline` 조사 브리프·근거를 확인합니다. `hold`와 `operational_alert_allowed=false`를 유지하며, 외부 모델 호출·원격 운영 배포는 이 검증에 포함하지 않습니다.

### 개발 조사와 최신 활동 근거

에이전트를 실행할 때는 `APP_MODE=research`로 실행합니다. 기본 `final` 모드는 모델 조회용이며 조사 API를 열지 않습니다. `GET /api/investigations/readiness`에서 선택한 제공자의 준비 상태와 자료 설정을 확인하고, 먼저 `rule_baseline`으로 사건 생성·실행·검토를 검사합니다. 제공자 선택·Codex 구독 실행과 Phoenix 설정은 [에이전트 README](../agent/README.md)를 따릅니다.

화면을 실행하지 않는 백엔드 개발 경로는 다음과 같습니다. `service/backend`에서 실행하며, Codex는 이 노트북의 공식 CLI 로그인을 사용합니다.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-agent-dev.txt
APP_MODE=research ACCESS_MODE=local_development DONGHAENG_PROVIDER=codex_subscription \
  .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

CI와 같은 오프라인 검사는 `service`에서 `backend/.venv/bin/python scripts/check_backend_ci.py`로 실행합니다. JUnit과 skip 판정은 `.artifacts/backend-ci/`에 남습니다. 이 검사는 외부 모델·구독·Phoenix 서버를 호출하지 않습니다. 원격 CI에는 `model`과 `agent` 두 저장소의 읽기 권한을 가진 `DONGHAENG_REPOSITORIES_TOKEN`이 필요합니다. 로컬 성공은 원격 Actions 실행 성공을 뜻하지 않습니다.

로컬 Phoenix를 실행한 뒤 `DONGHAENG_PHOENIX_ENABLED=true`, `DONGHAENG_PHOENIX_ENDPOINT=http://127.0.0.1:6006/v1/traces`를 설정하면 서비스 시작 때 추적을 초기화합니다. 종료할 때 worker를 먼저 닫고 남은 span을 flush한 뒤 추적 자원을 해제합니다. 기본값은 비활성이며 조사 readiness의 `observability`에 상태·오류 코드가 표시됩니다. 수집기 장애는 업무 실행을 성공으로 꾸미거나 중단시키지 않고 관측 장애로 구분합니다.

`FINAL_MODEL_BUNDLE`을 지정하면 조사 도구도 모델 API와 같은 검증된 활동 번들을 읽습니다. `GET /api/investigations/evidence/activity?region_code=11680&month=202512&sex_code=MAN&age_code=20G`는 원본 시군구·월·성·연령 계약으로 조회합니다. 10자리 행정동이나 지원하지 않는 필터는 거부하고, 번들이 없거나 손상되면 503을 반환합니다. 자료 없는 집단은 빈 결과이며 0점으로 대체하지 않습니다.

10자리 행정동 조사에서는 해당 동의 I5가 명시하는 상위 시군구 활동을 `final_activity_context`로만 덧붙입니다. 성별 행을 합산하거나 시군구 관측을 동별·개인 값으로 옮기지 않습니다. I5·활동 번들의 manifest 해시를 실행 버전에 남기며 보관 근거의 재확인에서도 원본 파일 해시를 검사합니다. 실제 활동 번들을 전달받지 않은 환경에서는 전국 I5 조사만 검증할 수 있습니다.

백엔드 자동 검사는 외부 API 키를 제거한 제공자로 고정하여 API 비용이나 Codex 구독 한도를 사용하지 않습니다. Phoenix의 pytest 플러그인을 사용하지 않는 서비스 검사에는 `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`을 지정할 수 있습니다.

### 기관 인증 기반

`ACCESS_MODE=local_development`는 루프백 개발 전용입니다. 외부 인터페이스나 프록시로 노출하지 않습니다. `/api/security/context`, 조사 readiness와 `X-Hermes-Access-Mode` 응답 헤더가 개발 모드를 명시합니다.

`ACCESS_MODE=institution`은 `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `AUTH_TENANT_ID`, `AUTH_JWT_PUBLIC_KEY_PATH`가 없거나 RSA 공개키가 잘못되면 시작을 거부합니다. 서비스는 토큰을 발급하지 않습니다. 기관 IdP가 발급한 RS256 Bearer JWT의 서명·발급자·대상·만료·발급시각·주체·기관을 검사하며, 검증에 필요한 공개키만 로컬 파일로 읽습니다. 기본 최대 토큰 유효기간은 1시간이고 `AUTH_MAX_TOKEN_LIFETIME_SECONDS`로 제한합니다. 키 교체는 배포와 재시작 절차로 관리합니다. [사용한 PyJWT 검증 계약](https://pyjwt.readthedocs.io/en/stable/api.html)

| JWT `permissions` 값 | 허용 범위 |
| --- | --- |
| `read` | 모델·사건·근거·readiness 조회 |
| `investigate` | 사건 생성, 조사 실행·재개·근거 재확인 |
| `review` | 브리프 검토, 후속 확인 기록 |
| `admin` | 위 작업 전체와 보안 구성 조회 |

기관 모드의 브리프 검토는 클라이언트가 보낸 `reviewer_type`을 신뢰하지 않고 실제 검증된 JWT `sub`·기관·인증 모드를 저장합니다. 한 인스턴스·업무 DB·체크포인트 DB는 한 기관에 고정되며, 다른 기관이나 개발 모드로 다시 여는 것을 거부합니다. 기존 개발 사건이나 체크포인트가 든 DB는 자동으로 기관용으로 전환하지 않습니다.

이는 인증·권한 부정 시험을 통과하는 실행 기반입니다. 실제 기관 SSO 연결, 사용자별 사건 배정 ACL, 토큰 폐기·공개키 순환 운영, 기관 보안 심사·침투 테스트는 아직 완료되지 않았습니다. 운영 전에는 기관별 DB·체크포인트·Phoenix·자료 저장소와 TLS 경계를 함께 분리해야 합니다.

현재 기관 모드는 `rule_baseline`만 실행할 수 있습니다. 개인 Codex 로그인을 조회하거나 공유하지 않으며, `single_search`·`agent`는 `institution_provider_not_configured`로 거부합니다. 승인된 내부 모델 또는 승인된 외부 연결 제공자가 마련되기 전에는 JWT 인증만으로 기관용 LLM 운영이 완성된 것으로 표시하지 않습니다.
