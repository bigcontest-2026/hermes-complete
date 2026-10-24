"""Import the supplied standalone UI with explicit, reproducible live-data patches.

Usage: python scripts/import_hermes.py PATH_TO_HERMES_Complete.html
The source file is never modified. No scripts from it run during import.
"""
import hashlib
import re
import sys
from pathlib import Path

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
replace("if(path==='/api/model/regions')return json(D.catalog);", "if(path.startsWith('/api/model/'))return originalFetch(u.pathname+u.search);")
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
replace('2026년 10월 20일 원문 확인 기준 후보 ${candidates.length}개이며, 개인 자격과 현재 접수는 추가 확인이 필요해요.', '실제 추천 그래프에서 가상 사업 후보 ${candidates.length}개를 찾았어요. 개인 자격과 현재 접수는 미확인입니다.')
# Source UI labels must describe the database actually connected here.
html=html.replace('원문을 확인한 지원','임시 DB 추천 후보').replace('공식 지원 검색','임시 DB 사업 검색')
html=html.replace('공식 원문과 대상 조건을 확인한 지원을 살펴보세요.','활동신호와 I5로 연결한 임시 DB 후보와 미확인 조건을 살펴보세요.')
html=html.replace('원문과 조건을 함께 검증한 후보가 없습니다.','연결된 추천 후보가 없습니다.').replace('원문과 조건을 함께 검증한 정책 후보는 없습니다.','연결된 추천 후보는 없습니다.')
replace('${esc(c.summary)}</p>${table', '${esc(c.summary)}</p><div class="callout"><b>추천 이유</b><p>${esc(c.related_reason)}</p></div>${table')
replace('<a href="${safeURL(c.url)}" target="_blank" rel="noopener noreferrer">공식 원문에서 신청·접수 확인 ↗</a>', '${c.synthetic?\'<p class="callout gold">가상 사업 · 실제 신청 링크 없음</p>\':`<a href="${safeURL(c.url)}" target="_blank" rel="noopener noreferrer">공식 원문 확인 ↗</a>`}')
replace('<a href="${href(c.url||c.source_url)}" target="_blank" rel="noopener noreferrer">공식 정책 원문 ↗</a>', '${c.synthetic?\'<p>가상 사업 · 공식 원문 및 신청 링크 없음</p>\':`<a href="${href(c.url||c.source_url)}" target="_blank" rel="noopener noreferrer">공식 정책 원문 ↗</a>`}')
replace("c=>c.title+' — 대상 또는 기간 불일치'", "c=>c.title+' — '+c.reason")
html=html.replace('정책 원문 해시 ${esc(c.source_hash)}','임시 DB 근거 ${esc(c.support_id)}').replace('원문 SHA256 ${esc(c.source_hash)}','DB 버전 ${esc(c.support_id)}')
html=html.replace('저장 위치: 이 브라우저. 실제 LLM 호출·기관 연계 실행 없음.', '저장 위치: 이 브라우저. I5·활동 및 추천은 서버 조회. 자유형 LLM·기관 연계 실행 없음.')
html=html.replace('## 공식 지원 조건 (2026-10-20 보관 기준)', '## 임시 DB 추천 조건 (가상 사업)')
# Put a clear connection banner on the existing complete UI after its own startup scripts.
banner='''<script>
window.HERMES_HTML_READY.then(()=>{
 const bar=document.querySelector('.evidence-api-bar');
 const text='실제 I5·활동 API + 추천 그래프 연결 · 복지 DB는 가상 · 대화·검토는 이 브라우저 저장';
 const apply=()=>{if(bar?.querySelector('span'))bar.querySelector('span').textContent=text;};
 apply();window.HERMES_AGENT.api('/api/agent/readiness').finally(apply);
 document.querySelector('.top-actions .mini-pill.green').textContent='실제 모델 · 임시 복지 DB';
 const info=document.querySelector('.html-snapshot-info');
 info.innerHTML='<details><summary>자료 연결과 저장 안내</summary><p>기본 I5·활동 관측 및 추천은 현재 서버에서 읽습니다. 서버 오류 시 저장본 추천으로 대체하지 않습니다. 전국 기준값·행정동 통신·보조 맥락은 첨부 HTML의 보관 자료입니다.</p><p>사업은 ERD 임시 DB의 가상 자료입니다. I5 고저 임계값 없이 활동신호와 관련 영역을 함께 참고합니다. 정책 만들기는 사용자 검토용 초안이며 실제 시행이나 지원 필요를 확정하지 않습니다.</p><p>대화·검토·정책 초안은 이 브라우저에 저장됩니다. 자유형 LLM 및 외부 원인 조사는 연결하지 않았습니다.</p></details>';
 document.querySelectorAll('[data-api-settings]').forEach(el=>el.hidden=true);
 const originalNavigate=navigate;navigate=function(page){originalNavigate(page);apply();const notice=document.querySelector('.notice');if(notice)notice.textContent='서버 근거·추천 연결 · 가상 복지 DB · 개인 진단·자격 확정 아님';};
 window.addEventListener('hermes-investigation-saved',()=>renderDrawer());
 const restoreCompleteThread=restoreChatThread;restoreChatThread=function(id){const saved=structuredClone(chatThreads.find(t=>t.id===id)?.context?.agentContext?.serverScope||null);restoreCompleteThread(id);if(saved){window.HERMES_PAGES.setScope(saved);renderDrawer();saveChatThread();}};
});
</script>'''
replace('</body></html>', banner+'</body></html>')
target=root/'shared/hermes-complete.html'
target.write_text(html,encoding='utf-8')
(root/'docs/HERMES_COMPLETE_IMPORT.md').write_text(f'''# HERMES Complete 가져오기

사용자 제공 `HERMES_Complete.html` 기준. 원본 SHA-256: `{source_hash}`.

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
''',encoding='utf-8')
print(f'Imported {len(html):,} characters; source SHA256 {source_hash}')

