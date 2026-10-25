"""Preserve the legacy draft editor's analysis scope when regenerating the UI."""


HELPERS = r'''  // Legacy draft scope guard: keep editor text with its selected analysis.
  S.livePolicyDrafts=persisted.livePolicyDrafts||{};
  let draftEditorKey=null;
  const draftScopeOf=c=>c?.briefs?.at(-1)?.model_evidence?.scope||null;
  function sameDraftScope(a,b){
    if(!a||!b||!a.region_level||!b.region_level||!a.month||!b.month)return false;
    const groups=(s,key,all)=>[...new Set(s[key]?.length?s[key]:all)].sort().join(',');
    return a.region_level===b.region_level&&String(a.region_code||'')===String(b.region_code||'')&&a.month===b.month&&groups(a,'sex_codes',['MAN','WMAN'])===groups(b,'sex_codes',['MAN','WMAN'])&&groups(a,'age_codes',Object.keys(AGE_LABEL))===groups(b,'age_codes',Object.keys(AGE_LABEL));
  }
  const draftKey=()=>currentCase?.case_id||'local:'+JSON.stringify(scope);
  function keepDraftEditor(){
    if(!draftEditorKey)return;
    const inputs=[...document.querySelectorAll('[data-live-draft]')];
    if(!inputs.length)return;
    S.livePolicyDrafts={...(S.livePolicyDrafts||{}),[draftEditorKey]:Object.fromEntries(inputs.map(e=>[e.dataset.liveDraft,e.value]))};persist();
  }
  function requireDraftScope(record=currentCase){
    if(!record?.briefs?.length)throw Error('먼저 근거가 될 분석을 선택해 주세요.');
    if(record.case_id!==currentCase?.case_id||!sameDraftScope(scope,draftScopeOf(record)))throw Error('화면 조건과 선택한 분석의 조건이 다릅니다. 저장된 분석을 다시 선택하거나 선택한 분석 조건으로 돌아가 주세요. 작성 중인 내용은 유지됩니다.');
    return record.briefs.at(-1);
  }
  function draftScopeLabel(s){
    if(!s)return '분석 조건 확인 필요';
    const name=s.region_name||catalog?.regions.find(r=>r.code===s.region_code)?.name||(s.region_code===currentCase?.briefs?.at(-1)?.model_evidence?.scope?.region_code?currentCase.briefs.at(-1).model_evidence.i5?.[0]?.area_name:null)||(!s.region_code?'전국':'선택 지역');
    return [name,({administrative_dong:'행정동',sgg:'시군구',national:'전국'})[s.region_level]||'공간단위 확인 필요',s.month,s.sex_codes?.length?s.sex_codes.map(x=>x==='MAN'?'남성':'여성').join(', '):'전체 성별',s.age_codes?.length?s.age_codes.map(x=>AGE_LABEL[x]||x).join(', '):'전체 연령'].join(' · ');
  }
  function draftScopeNotice(){
    const selected=draftScopeOf(currentCase);if(!selected)return '';
    const mismatch=!sameDraftScope(scope,selected);
    return `<div class="callout" ${mismatch?'role="alert"':''}><p>선택한 분석 · ${esc(draftScopeLabel(selected))}</p>${mismatch?'<p>화면 조건이 달라 초안 구성과 분석 연결 저장을 멈췄습니다. 작성 내용은 분석별로 이 브라우저에 보관됩니다.</p>'+action('선택한 분석 조건으로 돌아가기','data-live-restore-draft-scope'):''}</div>`;
  }
'''


def patch_draft_lifecycle(html):
    # Apply to both newly imported HTML and copies with the scope guard already installed.
    boundaries = (
        ('async function renderPage(){const page=S.page;', 'async function renderPage(){keepDraftEditor();const page=S.page;'),
        ('navigate=function(page){S.drawerPreferred=false;', 'navigate=function(page){keepDraftEditor();S.drawerPreferred=false;'),
        ("document.addEventListener('input',event=>{if(event.target.hasAttribute('data-live-search'))", "document.addEventListener('input',event=>{if(event.target.hasAttribute('data-live-draft')){keepDraftEditor();return;}if(event.target.hasAttribute('data-live-search'))"),
    )
    for old, new in boundaries:
        if old in html:
            if html.count(old) != 1:
                raise ValueError('Ambiguous legacy lifecycle boundary: ' + old)
            html = html.replace(old, new)
        elif new not in html:
            raise ValueError('Missing legacy lifecycle boundary: ' + old)
    return html


def patch_draft_scope(html):
    html = html.replace("draft:S.draft,memo:S.memo", "draft:S.draft,livePolicyDrafts:S.livePolicyDrafts,memo:S.memo")
    if '// Legacy draft scope guard:' in html:
        return patch_draft_lifecycle(html)

    def replace(old, new):
        nonlocal html
        if html.count(old) != 1:
            raise ValueError('Missing legacy draft boundary: ' + old[:90])
        html = html.replace(old, new)

    replace('  function setScope(value){scope=', HELPERS + '  function setScope(value){keepDraftEditor();scope=')
    replace('async function openCase(caseId){currentCase=', 'async function openCase(caseId){keepDraftEditor();currentCase=')
    replace('c.request.region_code===scope.region_code&&c.request.month===scope.month', 'sameDraftScope(draftScopeOf(c),scope)')
    replace('const local=S.draft||{};const draft=last||', "const local=currentCase?{}:(S.draft||{});const draft=S.livePolicyDrafts?.[draftKey()]||last||")
    replace("};return `${casePicker()}${panel('근거와 지원 공백'", "};draftEditorKey=draftKey();return `${casePicker()}${draftScopeNotice()}${panel('근거와 지원 공백'")
    replace("${last?'저장된 초안 v'+last.version:'기존 브라우저 초안 · 분석 연결 전'}", "${S.livePolicyDrafts?.[draftKey()]?'이 브라우저에 보관한 작성 내용 · 분석 연결 저장 전':last?'저장된 초안 v'+last.version:'기존 브라우저 초안 · 분석 연결 전'}")
    replace('[data-live-generate-draft],[data-live-save-draft]', '[data-live-restore-draft-scope],[data-live-generate-draft],[data-live-save-draft]')
    replace("      if(element.hasAttribute('data-live-generate-draft')){if(!currentCase?.briefs?.length)throw Error('먼저 근거가 될 분석을 선택해 주세요.');const b=currentCase.briefs.at(-1),fields=", "      if(element.hasAttribute('data-live-restore-draft-scope')){keepDraftEditor();const selected=draftScopeOf(currentCase);if(!selected)throw Error('먼저 저장된 분석을 선택해 주세요.');setScope(selected);currentPacket=currentCase.briefs.at(-1).model_evidence;return renderPage()}\n      if(element.hasAttribute('data-live-generate-draft')){const b=requireDraftScope(),fields=")
    replace("S.draft={...S.draft,...fields};persist();if(!currentCase)", "keepDraftEditor();if(currentCase)requireDraftScope();else S.draft={...S.draft,...fields};persist();if(!currentCase)")
    replace("const fresh=await api('/api/agent/investigations/'+currentCase.case_id);const result=await api('/api/agent/investigations/'+currentCase.case_id+'/policy-drafts'", "const savingCase=currentCase.case_id;const fresh=await api('/api/agent/investigations/'+savingCase);requireDraftScope(fresh);const result=await api('/api/agent/investigations/'+savingCase+'/policy-drafts'")
    replace("draftVersion=result.version;$('live-draft-status')", "draftVersion=result.version;delete S.livePolicyDrafts?.[savingCase];persist();$('live-draft-status')")
    replace("if(el.hasAttribute('data-live-case-select')){currentCase=null;", "if(el.hasAttribute('data-live-case-select')){keepDraftEditor();currentCase=null;")
    html = html.replace("resetCase:()=>{currentCase=null;currentPacket=null;}", "resetCase:()=>{keepDraftEditor();currentCase=null;currentPacket=null;}")
    return patch_draft_lifecycle(html)
