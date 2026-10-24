# 동행 관측소 실행·배포

## 현재 모델용 로컬 실행

`model/`과 `service/`를 같은 부모에 둡니다. 설치·전국 I5 검증·두 서버 실행은 [Service README](../README.md)의 명령을 따릅니다. 기본 모드는 `APP_MODE=final`, `VITE_APP_MODE=final`이며 이전 Agent/Model 패키지 설치를 요구하지 않습니다. 백엔드 코드 갱신 후 서버를 재시작합니다.

- 모델 코드: `DONGHAENG_MODEL_ROOT` (기본 형제 `model`)
- 활동 실측 번들: `FINAL_MODEL_BUNDLE`
- I5 번들: 기본 `model/data/i5/national_2025`, 별도 경로는 `I5_BUNDLE_PATH` (`SURVEY_AREA_BUNDLE` 호환)
- 별도 프런트 호스팅: 빌드 시 `VITE_MODEL_API_BASE_URL`, 백엔드 `CORS_ORIGINS`

기본 프런트 개발 서버는 `/api`를 `127.0.0.1:8000`에 전달합니다. 번들의 `manifest.json`과 모든 출력 파일을 함께 전달해야 합니다. 원자료·키·실측 번들은 프런트 정적 파일에 넣지 않습니다. `/api/model/status`에서 자료별 `ready`를 확인합니다.

## Docker

공통 부모 폴더에서 이미지를 만듭니다.

```sh
docker build -f service/backend/Dockerfile -t donghaeng-backend .
docker run --rm -p 8000:8000 \
  -v /absolute/path/to/final_run:/bundles/activity:ro \
  -e FINAL_MODEL_BUNDLE=/bundles/activity \
  donghaeng-backend
```

이미지에는 모델의 조회 코드·스키마, 서비스 코드와 Git에 포함된 전국 I5 번들이 들어갑니다. 별도 활동 번들은 읽기 전용으로 마운트합니다. I5도 다른 번들을 쓰려면 볼륨을 마운트하고 `I5_BUNDLE_PATH`를 지정합니다. 상태 API는 자료별 준비 상태를 보고하며, 손상된 번들의 조회는 503으로 종료합니다. 이미지 빌드는 이번 로컬 작업에서 실행하지 않았습니다.

## CI와 Pages

`ci.yml`의 `frontend`는 정적 자료 검사·프런트 테스트·`final` 모드 빌드를 수행합니다. `check`는 서비스와 현재 `model`을 가져와 서비스 API를 검사합니다. `DONGHAENG_REPOSITORIES_TOKEN`에는 비공개 `bigcontest-2026/model`의 Contents 읽기 권한이 필요합니다. 기존 토큰에 이 권한이 있으면 그대로 사용합니다. fork PR 등 secret이 없는 환경에서는 비공개 모델 checkout 작업이 실행될 수 없습니다.

CI는 model checkout에 포함된 전국 I5 실제 번들로 지역·페이지·기본 경로를 검사합니다. 변조·경계 검사는 합성 fixture도 사용합니다. 과거 I5 재생성 검사는 V3 확정 집계가 없으면 skip하며, 이전 Agent 의존성이 없으면 기존 조사·시연 테스트 4개 모듈과 전국 I5의 조사 연계 검사가 skip됩니다. 전국 I5 HTTP 조회는 기본 `final` 모드에서도 검사합니다.

`deploy-pages.yml`은 수동 실행하며 현재 `final` 화면을 빌드합니다. 저장소 변수 `VITE_MODEL_API_BASE_URL`이 없으면 빌드 전에 중단합니다. 배포할 API의 HTTPS 주소와 Pages 출처에 대한 CORS를 먼저 준비합니다. 현재 작업에서는 원격 CI 실행·Pages 변경·배포를 수행하지 않았습니다.

## 이전 조사 API

이전 조사 API는 전국 I5를 지원하는 최신 `model/`, `agent/`를 형제로 둔 뒤 `backend`에서 `pip install -r requirements-legacy.txt`를 추가 실행하고 `APP_MODE=research`로 선택합니다. 최신 `model` 패키지는 기존 조사 스냅샷 계약도 제공합니다. 이전 research 프런트 화면은 제거되었으며 `research-api` 주소도 현재 모델 화면으로 전환됩니다. 해당 API의 원문·업무 DB·체크포인트·모델 공급자 설정은 이전 조사 계약을 따릅니다. 현재 모델을 이전 행정동 조사 계약으로 자동 변환하지 않습니다.
