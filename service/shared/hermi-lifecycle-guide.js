/* Literature-based questions remain separate from observed regional facts. */
window.HERMES_LIFECYCLE_GUIDE = (() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=value=>String(window.HERMI_COPY?.text?window.HERMI_COPY.text(value):value??'');
  const list=values=>`<ul>${(values||[]).map(value=>`<li>${esc(text(value))}</li>`).join('')}</ul>`;
  const identity=scope=>['region_code','month','sex_code','age_code'].map(key=>scope?.[key]??'').join('|');
  const group=scope=>`${scope?.sex_code==='MAN'?'남성':scope?.sex_code==='WMAN'?'여성':'전체 성별'} ${({'20G':'20대','30G':'30대','40G':'40대','50G':'50대','60GU':'60세 이상'})[scope?.age_code]||''}`.trim();
  function validate(report){
    const guide=report?.lifecycle_interpretation;
    if(!guide)return null;
    if(typeof guide.guide_version!=='string'||!guide.guide_version||guide.changes_activity_classification!==false||guide.automatic_welfare_mapping!==false||guide.support_need_status!=='unconfirmed'||!Array.isArray(guide.groups)||!guide.source||!Array.isArray(report.assessments))throw Error('생애주기 해석 가이드의 범위와 상태를 확인할 수 없습니다.');
    for(const key of ['region_code','month','sex_code','age_code'])if((guide.scope?.[key]??null)!==(report.scope?.[key]??null))throw Error('생애주기 해석과 보고서의 분석 범위가 다릅니다.');
    const expected=new Set(report.assessments.map(row=>identity(row.scope))),seen=new Set();
    for(const item of guide.groups){
      const key=identity(item.scope);
      if(!expected.has(key)||seen.has(key)||item.interpretation_status!=='questions_only'||item.support_need_status!=='unconfirmed'||!Array.isArray(item.hypotheses)||!Array.isArray(item.questions))throw Error('생애주기 해석의 집단과 확인 상태가 원본 보고서와 다릅니다.');
      if(item.hypotheses.some(h=>h.status!=='unverified'||typeof h.text!=='string'))throw Error('확인 전 가설을 검증된 사실로 표시할 수 없습니다.');
      seen.add(key);
    }
    if(seen.size!==expected.size)throw Error('일부 집단의 생애주기 해석 가이드가 빠졌습니다.');
    const sourceIds=new Set((report.context_investigation?.sources||[]).map(source=>source.source_id));
    for(const check of report.context_investigation?.lifecycle_checks||[]){
      const owner=guide.groups.find(item=>identity(item.scope)===identity(check.scope));
      if(!owner||!owner.hypotheses.some(h=>h.id===check.hypothesis_id)||!['supported_context','counter_context','unverified'].includes(check.status)||!Array.isArray(check.source_ids)||check.source_ids.some(id=>!sourceIds.has(id))||(check.status!=='unverified'&&!check.source_ids.length))throw Error('생애주기 가설과 지역 근거의 연결을 확인할 수 없습니다.');
    }
    return guide;
  }
  function doi(value){
    try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='doi.org'&&!url.username&&!url.password?url.href:null;}catch{return null;}
  }
  function checksHTML(report,guide){
    const checks=report.context_investigation?.lifecycle_checks||[];
    if(!checks.length)return '';
    const labels={supported_context:'관련 지역 맥락 확인',counter_context:'대안·반대 맥락 확인',unverified:'미확인'};
    const sources=report.context_investigation?.sources||[];
    return `<div class="hlg-checks"><h5>지역 근거</h5>${checks.map(check=>{
      const refs=(check.source_ids||[]).map(id=>sources.find(source=>source.source_id===id)?.title||'출처 확인 필요');
      return `<p><b>${esc(group(check.scope))} · ${esc(labels[check.status]||'미확인')}</b> · ${esc(text(check.text||check.explanation||''))}</p>${refs.length?`<p class="hlg-source">근거: ${esc(refs.join(' · '))}</p>`:''}`;
    }).join('')}<p>이 결과는 지역 맥락에 관한 검토이며 개인의 생애사건·지원 필요를 확정하지 않습니다.</p></div>`;
  }
  function render(report){
    const guide=validate(report);if(!guide)return '';
    const source=guide.source,url=doi(source.doi),title=esc(source.title||'생애주기별 사회적 고립 및 외로움 연구');
    const citation=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${title}</a>`:title;
    return `<details class="hlg-guide" aria-label="생애주기·지역 맥락 해석"><summary class="hlg-heading"><span class="hlg-title">생애주기·지역 맥락</span><span class="hlg-status">가설 · 지원 필요 미확인</span></summary><div class="hlg-body"><p class="hlg-state">확인 전 가설이며 지원 필요는 별도 확인합니다.</p>${checksHTML(report,guide)}${guide.groups.map(item=>`<details class="hlg-group" ${guide.groups.length<=2?'open':''}><summary>${esc(group(item.scope))}</summary>${item.observation_status==='unavailable'?'<p class="hlg-state">활동 관측 없음 · 연령별 확인 질문만 제시합니다.</p>':''}<h5>확인 가설</h5>${list(item.hypotheses.map(h=>h.text))}<h5>확인 질문</h5>${list(item.questions)}<details><summary>대안 설명·연령 범위</summary>${list(item.comparison_checks||guide.comparison_checks)}${list(item.boundaries)}</details></details>`).join('')}<details class="hlg-literature"><summary>문헌·적용 범위</summary><p>${citation}</p><p>${esc((source.authors||[]).join('·'))} · ${esc(source.publisher||'한국보건사회연구원')} · ${esc(source.publication_month||source.year)} · 본문 ${esc((source.pages||[]).join(', '))}쪽</p><p>문헌은 확인 질문의 참고 근거입니다. 지역의 원인·지원 자격을 입증하지 않습니다.</p>${list(guide.boundaries)}</details></div></details>`;
  }
  return {render,validate,doi};
})();
