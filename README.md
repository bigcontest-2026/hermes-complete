# HERMES Complete

기존 `bigcontest-2026/service`, `agent`, `model`과 분리한 독립 개발 저장소입니다.
사용자 제공 **HERMES_Complete.html**의 화면과 기존 실제 근거 API·추천 그래프를 한 저장소에서 실행합니다. 기존 저장소의 Git 이력을 복사하거나 기존 원격 저장소에 푸시하지 않았습니다.

## 포함된 것

- `service/`: 완성 HTML, 개발용 Vite 진입점, FastAPI, 화면 자산·검증 시험
- `agent/`: I5·활동신호를 참고하는 복지 추천 LangGraph 및 ERD 임시 DB 생성 코드
- `model/`: 조회 코드·스키마와 검증된 전국 I5 공개 집계 번들
- `bundles/activity/`: 실제 활동 산출물 중 조회에 필요한 파일의 배포용 부분집합. 원본 파일 해시는 그대로 보존하며 원본 manifest 해시와 제외 범위를 기록
- `SOURCE_ORIGINS.json`: 분리 당시 원본 저장소와 기준 커밋

원천 개인자료, 로컬 인증정보, 실행 로그, 가상환경, node_modules, 대용량 학습·외부 맥락 산출물은 포함하지 않습니다. 복지 DB는 첫 실행 때 가상 사업 5건으로 생성되며 Git에 저장하지 않습니다.

## 실행 (Python 3.12 이상 / Node.js 22 이상)

저장소 루트에서:

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r service/backend/requirements.txt
.venv/Scripts/python scripts/run_api.py
```

다른 터미널:

```powershell
cd service/frontend
npm ci
$env:MODEL_API_PROXY='http://127.0.0.1:8011'
npm run dev -- --port 5175
```

`http://127.0.0.1:5175/`에서 새 HERMES 화면이 열립니다. 포트가 사용 중이면 API 실행 전 `PORT`를 바꾸고 프런트의 `MODEL_API_PROXY`도 같은 포트로 맞추세요.
macOS/Linux는 `.venv/bin/python`과 `MODEL_API_PROXY=http://127.0.0.1:8011 npm run dev -- --port 5175`를 사용합니다.

## 검증

```powershell
.venv/Scripts/python scripts/smoke_test.py
cd service/frontend
npm test
npm run build
```

강남구 2025-08 남성 20대, 2026-10-25 조건 검토 기준: 후보 2건·제외 1건·보류 1건. 화면의 당일 접수기간 검토는 실행 날짜에 따라 달라집니다.

## 현재 범위

I5와 활동지표는 실제 집계 자료입니다. 추천 사업은 **ERD 임시 DB의 가상 사업**이며 신청 자격이나 운영 경보를 확정하지 않습니다. I5 고저 임계값은 미확정이고 `research-context-v1` 연결을 사용합니다.

대화는 규칙 기반 안내, 추천은 서버의 실제 LangGraph입니다. 첨부 HTML의 전국 기준값·행정동 통신·보조 맥락은 보관 자료임을 구분합니다. 대화·검토·정책 초안은 브라우저 로컬 기록이며 기관 전송·공동 저장·자유형 LLM 대화는 후속입니다.

[Step 06 구현 기록](agent/docs/implementation/step06/README.md) · [HTML 가져오기](service/docs/HERMES_COMPLETE_IMPORT.md)

기존 개별 폴더 README의 경로·실행 설명은 이전 프로젝트 이력도 포함하므로 이 루트 README를 우선합니다.
