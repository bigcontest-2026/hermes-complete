"""Import the supplied standalone UI with explicit, reproducible live-data patches.

Usage: python scripts/import_hermes.py PATH_TO_HERMES_Complete.html
The source file is never modified. No scripts from it run during import.
"""
import hashlib
import re
import sys
from pathlib import Path
from hermes_plain_language import patch_html
from hermes_analysis_reports import patch_analysis_reports
from hermes_activity_views import patch_activity_views
from hermes_dong_start import patch_dong_start

root = Path(__file__).resolve().parents[2]
source = Path(sys.argv[1])
html = source.read_text(encoding='utf-8-sig')
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()

def replace(old, new, count=1):
    global html
    if html.count(old) != count:
        raise ValueError(f'Unexpected source version: {old[:100]!r} ({html.count(old)})')
    html = html.replace(old, new)

# The shipped view is explicitly hybrid: live core model/graph, labelled attached context,
# local case history. It never silently switches to an embedded result after a server error.
replace("const offline=()=>localStorage.getItem('hermes-html-mode-v1')!=='server';", "const offline=()=>true;")
replace("KEY='hermes-html-cases-v1'", "KEY='hermes-complete-live-cases-v1'")
replace("JSON.stringify(cases,(k,v)=>k==='model_evidence'?undefined:v)", "JSON.stringify(cases)")
replace("const apiBase = () => (localStorage.getItem('hermes-api-base-v1') ?? window.HERMES_API_BASE ?? (location.protocol==='file:'?'http://127.0.0.1:8000':'')).replace(/\\/$/,'');", "const apiBase = () => '';")
adapter = (Path(__file__).parent/'hermes-live-adapter.js').read_text(encoding='utf-8')
replace('  function supports(s){', adapter+'\n  function supports(s){')
replace("if(path==='/api/model/regions')return json(D.catalog);", "if(path.startsWith('/api/model/'))return originalFetch(u.pathname+u.search,options);")
replace("if(path==='/api/evidence/query')return json(packet(b));", "if(path==='/api/evidence/query')return json(await livePacket(b));")
replace("if(path==='/api/agent/supports/query')return json(supports(b));", "if(path==='/api/agent/supports/query')return json(await liveSupports(b));")
replace('function briefFor(c){const p=packet(c.request),s=p.scope,support=supports(c.request)', 'async function briefFor(c){const p=await livePacket(c.request),s=p.scope,support=await liveSupports(c.request)')
replace('const brief=briefFor(c);', 'const brief=await briefFor(c);')
replace('const brief=await briefFor(c);', 'let brief;try{brief=await briefFor(c);}catch(error){c.executions.pop();throw error;}')
replace("const apiBase=()=> (localStorage.getItem('hermes-api-base-v1')??window.HERMES_API_BASE??(location.protocol==='file:'?'http://127.0.0.1:8000':'')).replace(/\\/$/,'');", "const apiBase=()=>'';")
replace('excluded_candidates:support.excluded_candidates,strategy:', 'excluded_candidates:[...support.excluded_candidates,...support.unverified_candidates],strategy:')
replace('const e=D.explanations[x.behavior.record_id];', "const e={observed_facts:[x.behavior.explanation],judgment_reasons:['동시 감소 '+String(x.behavior.rule.candidate)+' · 상대 급감 '+String(x.behavior.robust.candidate)+' · 연속 감소 '+String(x.behavior.rule.two_month_streak)],alternative_explanations:x.behavior.quality.reasons};")
pattern=r'let fields=\[\];if\(p\.i5\.length===1\).*?const candidates=support\.verified_candidates'
html, count=re.subn(pattern, 'let fields=support.support_fields;const candidates=support.verified_candidates', html)
if count!=1: raise ValueError('Missing brief mapping block')
replace("related_reason:'보관 당시 공식 원문과 선택 지역·연령의 조건을 대조한 후보입니다. 실제 관측을 추가 조사할 지원 분야와 함께 검토하며 개인 자격·현재 접수는 확정하지 않습니다.'", 'related_reason:x.related_reason')
replace('2026년 10월 20일 원문 확인 기준 후보 ${candidates.length}개이며, 개인 자격과 현재 접수는 추가 확인이 필요해요.', '추천 그래프에서 사업 후보 ${candidates.length}개를 찾았어요. 개인 자격과 현재 접수는 미확인입니다.')
# Source UI labels must describe the database actually connected here.
html=html.replace('원문을 확인한 지원','검토할 복지사업').replace('공식 지원 검색','등록된 복지사업 검색')
html=html.replace('공식 원문과 대상 조건을 확인한 지원을 살펴보세요.','활동신호와 I5로 연결한 사업 후보와 미확인 조건을 살펴보세요.')
html=html.replace('원문과 조건을 함께 검증한 후보가 없습니다.','연결된 추천 후보가 없습니다.').replace('원문과 조건을 함께 검증한 정책 후보는 없습니다.','연결된 추천 후보는 없습니다.')
replace('${esc(c.summary)}</p>${table', '${esc(c.summary)}</p><div class="callout"><b>추천 이유</b><p>${esc(c.related_reason)}</p></div>${table')
replace('<a href="${safeURL(c.url)}" target="_blank" rel="noopener noreferrer">공식 원문에서 신청·접수 확인 ↗</a>', '${c.synthetic===true?\'<p class="callout gold">예시 사업 · 실제 신청 링크 없음</p>\':c.synthetic===false&&safeURL(c.url)!==\'#\'?`<a href="${safeURL(c.url)}" target="_blank" rel="noopener noreferrer">${c.source_url_type===\'official_site\'?\'기관 홈페이지 확인 ↗\':\'자료 원문 확인 ↗\'}</a>`:\'<p>출처 링크 확인 필요</p>\'}')
replace('<a href="${href(c.url||c.source_url)}" target="_blank" rel="noopener noreferrer">공식 정책 원문 ↗</a>', '${c.synthetic===true?\'<p>예시 사업 · 실제 신청 링크 없음</p>\':c.synthetic===false&&href(c.url||c.source_url)!==\'#\'?`<a href="${href(c.url||c.source_url)}" target="_blank" rel="noopener noreferrer">${c.source_url_type===\'official_site\'?\'기관 홈페이지 확인 ↗\':\'자료 원문 확인 ↗\'}</a>`:\'<p>출처 링크 확인 필요</p>\'}')
replace("c=>c.title+' — 대상 또는 기간 불일치'", "c=>c.title+' — '+c.reason")
html=html.replace('정책 원문 해시 ${esc(c.source_hash)}','사업 자료 번호 ${esc(c.support_id)}').replace('원문 SHA256 ${esc(c.source_hash)}','DB 버전 ${esc(c.support_id)}')
html=html.replace('저장 위치: 이 브라우저. 실제 LLM 호출·기관 연계 실행 없음.', '저장 위치: 이 브라우저. I5·활동 및 추천은 서버 조회. 자유형 LLM·기관 연계 실행 없음.')
html=html.replace('## 공식 지원 조건 (2026-10-20 보관 기준)', '## 복지사업 검토 조건')
html=html.replace("r.support_candidates.map(c=>`${c.title} / ${c.url}", "r.support_candidates.map(c=>`${c.synthetic===true?'[예시] ':''}${c.title} / ${c.url||'출처 링크 확인 필요'}")
# Put a clear connection banner on the existing complete UI after its own startup scripts.
banner='''<script>
window.HERMES_HTML_READY.then(()=>{
 const bar=document.querySelector('.evidence-api-bar');
 const text='실제 I5·활동 API + 복지 자료 연결 · 대화·검토는 이 브라우저 저장';
 const apply=()=>{if(bar?.querySelector('span'))bar.querySelector('span').textContent=text;};
 apply();window.HERMES_AGENT.api('/api/agent/readiness').finally(apply);
 document.querySelector('.top-actions .mini-pill.green').textContent='실제 모델 · 복지 자료 연결';
 const info=document.querySelector('.html-snapshot-info');
 info.innerHTML='<details><summary>자료 연결과 저장 안내</summary><p>기본 I5·활동 관측 및 추천은 현재 서버에서 읽습니다. 서버 오류 시 저장본 추천으로 대체하지 않습니다. 전국 기준값·행정동 통신·보조 맥락은 첨부 HTML의 보관 자료입니다.</p><p>사업은 연결된 DB에서 조회합니다. 예시 자료는 사업별로 표시합니다. I5 고저 임계값 없이 활동신호와 관련 영역을 함께 참고합니다. 정책 만들기는 사용자 검토용 초안이며 실제 시행이나 지원 필요를 확정하지 않습니다.</p><p>대화·검토·정책 초안은 이 브라우저에 저장됩니다. 자유형 LLM 및 외부 원인 조사는 연결하지 않았습니다.</p></details>';
 document.querySelectorAll('[data-api-settings]').forEach(el=>el.hidden=true);
 const originalNavigate=navigate;navigate=function(page){originalNavigate(page);apply();const notice=document.querySelector('.notice');if(notice)notice.textContent='서버 근거·복지 자료 연결 · 개인 진단·자격 확정 아님';};
 window.addEventListener('hermes-investigation-saved',()=>renderDrawer());
 const restoreCompleteThread=restoreChatThread;restoreChatThread=function(id){const saved=structuredClone(chatThreads.find(t=>t.id===id)?.context?.agentContext?.serverScope||null);restoreCompleteThread(id);if(saved){window.HERMES_PAGES.setScope(saved);renderDrawer();saveChatThread();}};
});
</script>'''
replace('</body></html>', banner+'</body></html>')
# Keep the desktop design layer separate from the imported evidence/data logic.
replace("window.addEventListener('hermes-investigation-saved',e=>{const record=e.detail.records.at(-1);",
        "window.addEventListener('hermes-investigation-saved',e=>{if(e.detail.threadId!==activeThreadId)return;const record=e.detail.records.at(-1);")
replace('window.HERMES_PAGES={getScope:()=>clone(scope),setScope,renderPage,openCase,clearCache,reportHTML};',
        'window.HERMES_PAGES={getScope:()=>clone(scope),setScope,renderPage,openCase,clearCache,reportHTML,resetCase:()=>{currentCase=null;currentPacket=null;}};')
replace('</head>', '<link rel="stylesheet" href="hermi-desktop.css"><link rel="stylesheet" href="hermi-overview.css"></head>')
replace('</body></html>', '<script src="hermi-overview.js"></script><script src="hermi-desktop.js"></script></body></html>')
target=root/'shared/hermes-complete.html'
html = patch_html(html)
html = patch_analysis_reports(html)
html = patch_activity_views(html)
html = patch_dong_start(html)
target.write_text(html,encoding='utf-8')
(root/'docs/HERMES_COMPLETE_IMPORT.md').write_text(f'''# HERMES Complete 가져오기

사용자 제공 `HERMES_Complete.html` 기준. 원본 SHA-256: `{source_hash}`.

대화 이력·정책 초안·보고서 동작과 데이터 연결을 유지한다. 화면은 사용자 제공 `hermes-chat-desktop.html` 시안과 헤르미 이미지 5종을 적용했다.
- I5·활동: 기존 `/api/model/*` 서버 API. 실패 시 저장본으로 대체하지 않음.
- 현황 보고서: `/api/model/analysis-reports`의 서버 5% 분류와 저장 결과를 그대로 표시·다운로드. 전체 집단도 집단별 근거를 유지하며 브라우저에서 기준을 다시 계산하지 않음.
- 추천: `/api/model/welfare` → 기존 LangGraph → ERD 임시 DB. 전체 집단은 집단별 실행 근거를 유지해 합친다.
- I5 고저 임계값으로 분야를 고르는 원본 HTML 규칙은 적용하지 않음.
- 전국 기준값·동 통신·보조 맥락: 첨부 HTML의 해시 검증된 저장 자료. 별도 서버 최신 조회가 아님.
- 현황 보고서는 서버 SQLite에 저장. 대화·검토·후속 정책 초안은 브라우저 로컬 기록이며 새 케이스는 `hermes-complete-live-cases-v1`에 서버 보고서 번호·근거와 함께 저장.
- 가상 사업을 공식 운영사업으로 표시하지 않으며 실제 신청 링크를 제공하지 않음.
- 자유형 LLM 및 외부 원인 검색은 후속. 현재 규칙 기반 안내+서버 추천 그래프.

재생성: `python frontend/scripts/import_hermes.py PATH_TO_HERMES_Complete.html`.
실행 파일은 `shared/hermes-complete.html`, 연결 코드는 `frontend/scripts/hermes-live-adapter.js`.
현황 보고서의 재생성 패치는 `frontend/scripts/hermes_analysis_reports.py`, 표시는 `shared/hermi-analysis-reports.js`에서 관리한다.
이전 React HERMES 화면은 `?mode=legacy`로 보존한다.

데스크톱 화면은 `shared/hermi-desktop.css`와 `shared/hermi-desktop.js`에서 관리한다. 홈은 중앙 입력창, 분석 이후에는 왼쪽 대화와 오른쪽 작업 패널을 함께 표시한다. 900px 이하에서는 대화·자료 전환 버튼을 제공한다. 헤르미 원본 이미지는 `shared/hermes/hermi/`에 보관한다.
가져오기 스크립트가 새 디자인 파일의 연결을 유지하며, 분석·복지·보고서는 기존 데이터 경계를 사용한다. 대응안의 미저장 입력값은 현재 페이지 세션 안에서 분석별로 유지한다.

상단 메뉴는 헤르미와 대화·대시보드·복지 리스트로 구성한다. 대시보드와 전체 복지 목록은 `shared/hermi-overview.js` 및 `shared/hermi-overview.css`에서 관리한다.
- 대시보드: `/api/model/regions`, `/api/model/survey-area` 전체 페이지를 조회하고 기존 전국 사회조사 참고평균과 구분해서 표시한다. 시도 지도는 같은 시도 내 상위 시/하위 구의 이름 관계를 기준으로 중복을 제거한 20세 이상 인구가중 평균이다.
- 복지 리스트: `/api/model/welfare/catalog`에서 게시된 전체 사업을 검색·필터·페이지 조회한다. 추천되지 않은 사업, 종료·미분류 자료도 포함한다. 사업 기간과 신청 가능 여부는 구분한다.
- 두 화면은 `?page=dashboard`, `?page=welfare-list`로 직접 열 수 있다. 상단의 개발 상태 배지는 표시하지 않는다.

화면 용어는 `shared/hermi-copy.js`와 `frontend/scripts/hermes_plain_language.py`에서 관리한다. 내부 계산·API 키는 유지하고, 생성된 설명·저장된 답변의 표시·보고서 내려받기에는 쉬운 한국어를 적용한다. 사용자 입력과 원본 근거 식별자는 바꾸지 않는다.


2026-10-25 화면 수정: 답변의 제목·본문·하단 행동을 구분하고 `shared/hermi-answer.js`에서 설명 문장의 제목·강조·목록을 안전하게 표시합니다. 대화에서 실제 적용된 성별·연령을 함께 표시하며, 기존 연령 기본값과 분석 범위는 유지합니다.
복지 리스트는 전체 자료·전국 사업·시군구·읍면동 범위를 제공합니다. 조건을 고른 뒤 **선택**을 누르면 조회하며, 현재 조회 지역은 상단 라벨로 구분합니다. 시군구는 해당 시군구→소속 읍면동→전국, 읍면동은 해당 읍면동→상위 시군구→전국 순으로 서버에서 정렬한 뒤 페이지를 나눕니다. 카드와 상세 화면에서 자료 출처·신청기간을 확인할 수 있습니다.
''',encoding='utf-8')
print(f'Imported {len(html):,} characters; source SHA256 {source_hash}')

