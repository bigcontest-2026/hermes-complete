/* Server-owned activity categories and saved reports; this view never evaluates thresholds. */
window.HERMES_ANALYSIS_REPORTS = (() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ages={'20G':'20대','30G':'30대','40G':'40대','50G':'50대','60GU':'60세 이상'};
  const regionLabel=report=>report.region_name||(report.scope?.dong_code?[report.context?.i5?.record?.region_name,report.context?.i5?.record?.area_name].filter(Boolean).join(' '):null)||report.context?.i5?.record?.region_name||(report.assessments||[]).find(item=>item.observation?.region_name)?.observation?.region_name||report.scope?.region_code||'지역 미확인';
  const group=s=>`${s?.sex_code==='MAN'?'남성':s?.sex_code==='WMAN'?'여성':'전체 성별'} · ${ages[s?.age_code]||'전체 연령'}`;
  const rate=value=>typeof value==='number'&&Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(2)}%`:'비교 불가';
  const tri=value=>value===true?'확인':value===false?'조건 미충족':'미확인';
  const prose=value=>String(window.HERMI_COPY?.text?window.HERMI_COPY.text(value):value??'').replace(/원자료 자료 확인 필요/g,'원자료 확인 필요').replace(/자료 자료 확인 필요/g,'자료 확인 필요');
  const list=values=>`<ul>${(values||[]).map(value=>`<li>${esc(prose(value))}</li>`).join('')}</ul>`;
  const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2}):'자료 없음';
  const reportsOf=value=>Array.isArray(value)?value:value?.server_analysis_reports||[];
  function assessmentHTML(a,expanded=false) {
    const c3=a.historical_reference?.record,robust=a.robust_evidence;
    const brief=(a.reasons||[]).filter(reason=>reason!=='원자료 품질 보류 상태를 유지하며 이 분류는 연구용 검토에만 사용합니다.').map(reason=>String(reason)
      .replace('통신·카드가 각각 5% 이상 감소했고 아래 보조 조건이 확인되어 우선 검토 후보로 분류합니다.','통신·카드 각각 5% 이상 감소')
      .replace('현재 모델에서 같은 지역의 다른 성·연령 집단 대비 상대적 이례성 후보가 확인되었습니다.','다른 성·연령 집단 대비 상대적 이례성 확인'));
    const score=value=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(2):'미산출';
    return `<details class="harl-assessment"${expanded?' open':''}><summary>${expanded?'':`<span>${esc(group(a.scope))}</span>`}<strong class="harl-category">${esc(a.category_label)}</strong></summary><div class="harl-assessment-body"><p class="harl-rates">통신 <b>${esc(rate(a.sources?.skt?.change_percent))}</b><span>카드 <b>${esc(rate(a.sources?.card_a?.change_percent))}</b></span></p>${list(brief)}<p class="harl-quality">${a.quality_status==='hold'?'자료 확인 필요':'품질 '+esc(a.quality_status||'미확인')} · 운영 경보 불허</p><details class="harl-technical"><summary>상세 판정·자료 품질</summary>${list(a.reasons)}<p>두 원천 기준 충족: ${tri(a.signals?.joint_decline)} · 2개월 연속: ${tri(a.signals?.two_month_streak)} · 상대적 이례성: ${tri(a.signals?.robust_candidate)}</p>${robust?`<p>통신 z ${esc(score(robust.sources?.skt?.z))} · 카드 z ${esc(score(robust.sources?.card_a?.z))} · 모델 기준 z ${esc(score(robust.cutoff))}</p>`:''}<p>과거 같은 요일 카드 비교: ${c3?esc(rate(c3.count?.change_pct)):esc(a.historical_reference?.reason||'비교 자료 없음')} · 동일 카드 원천의 다른 기준선</p>${list(a.quality_reasons)}<p class="evidence-meta">근거 ${esc((a.evidence_ids||[]).join(', '))}</p></details></div></details>`;
  }
  function backgroundHTML(context) {
    const i5=context?.i5?.record,mois=context?.mois?.record;
    return `<details><summary>지역 배경</summary><p>I5 ${i5?esc(i5.area_name||i5.region_name||'지역')+' '+esc(number(i5.isolation_index??i5.i5_reference))+'점':'자료 없음'} · 인구구성에 따른 지역 전체 참고값이며 선택한 활동 집단 전용 점수가 아닙니다.</p><p>${context?.mois?.spatial_unit==='sgg'?'상위 시군구 ':''}MOIS 주민등록 인구구성: ${mois?'자료 연결':'자료 없음'}. 주민등록 인구와 활동 관측 장소의 모집단은 다르며, 이 배경값으로 활동 범주를 올리거나 내리지 않습니다.</p>${mois?`<p>전체 인구 ${esc(number(mois.population_total))}명 · 20세 이상 ${esc(number(mois.population_20plus))}명 · 1인 세대 ${esc(number(mois.one_person_households))} / 전체 세대 ${esc(number(mois.households_total))}</p><details><summary>인구구성 원자료 요약</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(mois,null,2))}</pre></details>`:''}</details>`;
  }
  const replacements=new Map(),pendingResearch=new Map();
  const resolved=report=>replacements.get(report.report_id)||report;
  const researchComplete=report=>['completed','no_evidence'].includes(report.context_investigation_status);
  function comparisonIssue(base,other){
    if(!base?.scope||!other?.scope)return '분석 조건을 확인할 수 없습니다.';
    const a=base.scope,b=other.scope;
    if((a.dong_code||a.region_code)===(b.dong_code||b.region_code))return '다른 지역을 선택해 주세요.';
    if(Boolean(a.dong_code)!==Boolean(b.dong_code))return '행정동과 시군구를 서로 비교할 수 없습니다.';
    if(['month','sex_code','age_code'].some(key=>(a[key]??null)!==(b[key]??null)))return '관측월과 성별·연령이 같은 보고서를 선택해 주세요.';
    return null;
  }
  function comparisonHTML(report){
    const snapshots=report.comparison_context?.reports;
    if(!Array.isArray(snapshots)||!snapshots.length)return '';
    return `<details class="harl-comparison"><summary>함께 비교한 지역 · ${snapshots.length}곳</summary><p>같은 관측월·집단의 저장된 근거를 함께 조사했습니다. 지역 간 차이만으로 인과관계를 확정하지 않습니다.</p><ul>${snapshots.map(other=>`<li><b>${esc(regionLabel(other))}</b> · ${esc(monthLabel(other.scope?.month))} · ${esc(group(other.scope))}<button type="button" data-analysis-comparison-view="${esc(other.report_id)}">비교 근거 보고서 보기</button></li>`).join('')}</ul></details>`;
  }
  function sourceURL(value) {
    try {const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
  }
  function sourceScopeHTML(source) {
    const geography={same_region:'동일 지역',broader_region:'더 넓은 지역',other_region:'다른 지역',unverified:'지역 일치 미확인'};
    const period={same_period:'동일 기간',broader_or_other_period:'더 넓거나 다른 기간',unverified:'기간 일치 미확인'};
    const excerpt=String(source.supporting_excerpt||source.excerpt||'');
    return `<p>자료 지역: ${esc(source.region_scope||'미확인')} · 분석 범위와의 관계: ${esc(geography[source.geography_relation]||'지역 일치 미확인')} / ${esc(period[source.period_relation]||'기간 일치 미확인')}</p>${excerpt?`<blockquote>${esc(excerpt.slice(0,600))}${excerpt.length>600?'…':''}</blockquote>`:''}`;
  }
  function researchHTML(report) {
    const research=report.context_investigation;
    if(report.context_investigation_status==='not_applicable'&&report.activity_availability?.status==='unavailable')return '<p class="harl-quality">상위 시군구 활동 자료가 없어 활동 변화의 원인 조사는 수행하지 않았습니다.</p>';
    if(!researchComplete(report)||!research) return `<section class="harl-research-state" aria-label="원인 조사 상태"><span>${report.investigation_error?'지역 조사 미완료':'지역 원인 조사 전'}</span><button type="button" data-analysis-report-investigate="${esc(report.report_id)}">${report.investigation_error?'다시 조사':'원인 조사'}</button>${report.investigation_error?`<details><summary>오류 내용</summary><p>${esc(report.investigation_error)}</p></details>`:''}</section>`;
    const sources=Array.isArray(research.sources)?research.sources:[];
    const refs=ids=>(ids||[]).map(id=>{
      const source=sources.find(item=>item.source_id===id),url=sourceURL(source?.url);
      return source?(url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title||id)}</a>`:esc(source.title||id)):'출처 확인 필요';
    }).join(' · ');
    return `<details class="harl-context" aria-label="지역 맥락과 가능한 원인"><summary>${research.status==='no_evidence'?'조사 완료 · 관련 근거 부족':'지역 맥락·원인 조사 완료'}</summary><div><p>${esc(prose(research.summary))}</p>${research.observed_context?.length?`<h4>공개 자료에서 확인한 지역 맥락</h4><ul>${research.observed_context.map(item=>`<li>${esc(prose(item.text))}<p class="evidence-meta">${refs(item.source_ids)}</p></li>`).join('')}</ul>`:''}<h4>가능한 원인과 확인할 가설</h4>${research.possible_causes?.length?research.possible_causes.map(item=>`<div><p><b>${esc(item.title)}</b></p><p>${esc(prose(item.explanation))}</p><p class="evidence-meta">${refs(item.source_ids)}</p>${list(Array.isArray(item.limitations)?item.limitations:[item.limitations].filter(Boolean))}</div>`).join(''):'<p>확인한 근거만으로 활동 변화의 원인을 특정하지 못했습니다.</p>'}<p>지역 맥락과 활동 변화의 관련성을 검토한 설명 후보이며, 인과관계를 확정한 결과는 아닙니다.</p>${research.verification_questions?.length?'<h4>추가 확인 사항</h4>'+list(research.verification_questions):''}${list(research.limitations)}${sources.length?`<details><summary>확인한 출처 ${sources.length}건</summary><ol>${sources.map(source=>`<li>${refs([source.source_id])}<p>${esc(source.publisher||'발행기관 미기재')} · 발표 ${esc(source.published_at||'미확인')} · 자료 대상 기간 ${esc(source.reference_period||'미확인')} · 조회 ${esc(source.accessed_at||'미기재')}</p>${sourceScopeHTML(source)}</li>`).join('')}</ol></details>`:''}</div></details>`;
  }
  function article(report) {
    const assessments=report.assessments||[];
    const unavailable=report.activity_availability?.status==='unavailable';
    return `<article data-saved-analysis-report="${esc(report.report_id)}"><header class="harl-report-heading"><h3>${esc(regionLabel(report))} · ${esc(monthLabel(report.scope?.month))}</h3><p>${esc(group(report.scope))}</p><div class="harl-report-progress" aria-label="보고서 작업 상태"><span>현황 보고서 저장됨</span><span>${researchComplete(report)?'원인 조사 완료':'원인 조사 전'}</span></div></header>${unavailable?'<p class="harl-quality">행정동 I5를 담은 부분 현황 보고서입니다. 상위 시군구의 활동 자료가 없어 활동 범주를 판정하지 않았습니다.</p>':report.scope?.dong_code?`<p class="harl-quality">활동 변화는 상위 시군구 ${esc(report.context?.activity_scope?.region_name||report.scope.region_code)}의 참고 자료입니다. 선택 행정동의 직접 활동 관측이 아닙니다.</p>`:''}${assessments.map(a=>assessmentHTML(a,assessments.length===1)).join('')}${researchHTML(report)}${comparisonHTML(report)}${window.HERMES_LIFECYCLE_GUIDE?.render(report)||''}${backgroundHTML(report.context)}<details class="harl-storage"><summary>자료·보고서 전문</summary><p>보고서 번호: ${esc(report.report_id)}</p><p>적용 규칙: ${esc(report.rule_version)} · 저장: ${esc(dateLabel(report.created_at))}</p><details><summary>보고서 전문</summary>${window.HERMI_ANSWER?.blocks?window.HERMI_ANSWER.blocks(prose(report.markdown)):`<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(prose(report.markdown))}</pre>`}</details></details><p class="harl-next-step">이 보고서만 활용해도 됩니다. 대응안 검토는 선택이며, 나중에 저장된 보고서에서 이어갈 수 있어요.</p><div class="evidence-actions"><button type="button" class="harl-primary" data-analysis-response-open="${esc(report.report_id)}">대응안 검토</button><button type="button" data-analysis-report-download="${esc(report.report_id)}">보고서 내려받기</button>${unavailable?'':`<button type="button" data-analysis-compare-open="${esc(report.report_id)}">다른 지역과 비교 조사</button>`}</div><p data-analysis-report-status role="status" aria-live="polite"></p></article>`;
  }
  function render(value) {
    const reports=reportsOf(value).map(resolved);
    if(!reports.length)return '';
    return `<section class="evidence-module" aria-label="현황·원인 분석 보고서">${reports.map(article).join('')}</section>`;
  }
  async function json(path,options) {
    const response=await fetch('/api/model/analysis-reports'+path,options);
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('현황 보고서 서버에 연결하지 못했습니다.');
    const data=await response.json();
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:data.detail?.message||'보고서를 불러오지 못했습니다.');
    return data;
  }
  function validateSaved(data,id) {
    if(!data||data.report_id!==id||typeof data.markdown!=='string'||data.operational_alert_allowed!==false||!Array.isArray(data.assessments))throw Error('저장된 보고서 응답을 확인할 수 없습니다.');
    return data;
  }
  async function read(id) {
    const report=validateSaved(await json('/'+encodeURIComponent(id)),id);
    return report;
  }
  const stable=value=>JSON.stringify(value===undefined?null:Array.isArray(value)?value.map(item=>JSON.parse(stable(item))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stable(value[key]))])):value);
  async function investigate(id,options={}) {
    const explicit=Object.hasOwn(options,'comparison_report_ids');
    const ids=explicit?[...options.comparison_report_ids].sort():[];
    const key=id+':'+(explicit?JSON.stringify(ids):'default');
    if(pendingResearch.has(key))return pendingResearch.get(key);
    const task=(async()=>{
      const base=await read(id);
      if(researchComplete(base)&&!explicit)return base;
      const report=await json('/'+encodeURIComponent(id)+'/investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(explicit?{comparison_report_ids:ids}:{})});
      validateSaved(report,report?.report_id);
      if(!report.report_id||report.report_type!=='context_cause_analysis'||report.storage_status!=='saved'||report.parent_report_id!==(base.parent_report_id||id)||!researchComplete(report)||report.context_investigation?.status!==report.context_investigation_status)throw Error('원인 조사 보고서의 저장 결과를 확인할 수 없습니다.');
      if(explicit&&JSON.stringify(report.comparison_context?.report_ids||[])!==JSON.stringify(ids))throw Error('선택한 비교 지역과 저장된 조사 근거가 다릅니다.');
      for(const field of ['scope','region_name','rule_version','threshold_percent','assessments','activity_availability','report_status','context','provenance','quality_status','operational_alert_allowed','lifecycle_interpretation'])if(stable(base[field])!==stable(report[field]))throw Error('원인 조사 보고서의 관측 범위 또는 근거가 달라졌습니다.');
      replacements.set(id,report);
      if(typeof window.dispatchEvent==='function')window.dispatchEvent(new CustomEvent('hermes-analysis-report-updated',{detail:{previous_id:id,report}}));
      return report;
    })();
    pendingResearch.set(key,task);
    try{return await task;}finally{pendingResearch.delete(key);}
  }
  const filterScope=value=>Object.fromEntries(['region_code','dong_code','month','sex_code','age_code'].map(key=>[key,value?.[key]]).filter(([,value])=>typeof value==='string'&&value));
  function reportQuery(offset=0,scope={}) {
    return '?'+Object.entries({limit:'20',offset:String(offset),...filterScope(scope)}).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');
  }
  async function listReports(offset=0,scope={}) {
    const page=await json(reportQuery(offset,scope));
    if(!Array.isArray(page.reports)||!Number.isInteger(page.total_matched)||page.total_matched<0||(page.next_offset!==null&&(!Number.isInteger(page.next_offset)||page.next_offset<=offset)))throw Error('저장된 보고서 목록을 확인할 수 없습니다.');
    return page;
  }
  async function download(value) {
    const ids=typeof value==='string'?[replacements.get(value)?.report_id||value]:reportsOf(value).map(r=>resolved(r).report_id);
    if(!ids.length)throw Error('이 분석에는 서버에 저장된 현황 보고서가 없습니다. 행정동을 선택하여 현황을 다시 조사해 주세요.');
    const reports=[];
    for(const id of ids)reports.push(await read(id));
    const content=reports.map(r=>r.markdown).join('\n\n---\n\n');
    const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;
    link.download='HERMES_현황원인분석_'+String(reports[0].scope?.dong_code||reports[0].scope?.region_code||'지역').replace(/[^0-9]/g,'')+'_'+String(reports[0].scope?.month||'').replace(/[^0-9]/g,'')+'.md';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  let library,libraryRequest=0,detailRequest=0;
  let libraryState={scope:{},type:'analysis',offset:0,pick:false,resolve:null,selected:null,options:{}};
  let libraryFocus;
  const monthLabel=value=>/^\d{6}$/.test(value||'')?`${value.slice(0,4)}년 ${Number(value.slice(4))}월`:value||'관측월 미확인';
  const reportType=report=>report.report_type==='preventive_response'?'예방 대응 보고서':report.report_status==='partial'?'부분 현황 분석':report.report_type==='context_cause_analysis'?'현황·원인 분석':'관측 현황';
  const dateLabel=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'저장일 미확인':date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
  function libraryScopeLabel() {
    const scope=libraryState.scope;
    return [libraryState.options.scope?.region_name||scope.dong_code||scope.region_code,scope.month&&monthLabel(scope.month),scope.sex_code||scope.age_code?group(scope):''].filter(Boolean).join(' · ');
  }
  async function responseJSON(path) {
    const response=await fetch('/api/model/response-reports'+path);
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('대응 보고서 서버에 연결하지 못했습니다.');
    const data=await response.json();
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:data.detail?.message||'대응 보고서를 불러오지 못했습니다.');
    return data;
  }
  async function listResponseReports(offset=0,scope={}) {
    const page=await responseJSON(reportQuery(offset,scope));
    if(!Array.isArray(page.reports)||!Number.isInteger(page.total_matched)||page.total_matched<0||(page.next_offset!==null&&(!Number.isInteger(page.next_offset)||page.next_offset<=offset)))throw Error('저장된 대응 보고서 목록을 확인할 수 없습니다.');
    return page;
  }
  async function readResponse(id) {
    const report=await responseJSON('/'+encodeURIComponent(id));
    if(report.report_id!==id||report.report_type!=='preventive_response'||typeof report.markdown!=='string'||!report.analysis_report_id)throw Error('저장된 대응 보고서 내용을 확인할 수 없습니다.');
    return report;
  }
  function responseArticle(report) {
    const actions=`<div class="harl-detail-actions"><button type="button" class="harl-primary" data-response-report-workspace="${esc(report.analysis_report_id)}">연결된 대응안 보기</button><button type="button" data-response-parent-open="${esc(report.analysis_report_id)}">처음 분석 보기</button><button type="button" data-response-report-download="${esc(report.report_id)}">보고서 내려받기</button></div>`;
    if(typeof window.HERMES_RESPONSE_WORKSPACE?.reportHTML==='function') {
      return `<article class="harl-response-detail">${actions}<div class="hrw-saved-preview">${window.HERMES_RESPONSE_WORKSPACE.reportHTML(report)}</div></article>`;
    }
    const renderText=window.HERMI_ANSWER?.blocks?window.HERMI_ANSWER.blocks(prose(report.markdown)):`<pre class="harl-prose">${esc(prose(report.markdown))}</pre>`;
    return `<article class="harl-response-detail"><span class="harl-kind">예방 대응 보고서</span><h3>${esc(report.title||'맞춤형 예방 대응 보고서')}</h3><p class="harl-meta">${esc(regionLabel(report))} · ${esc(monthLabel(report.scope?.month))} · ${esc(group(report.scope))}</p><p class="harl-meta">${esc(dateLabel(report.created_at))} 저장 · 선택한 대응안 ${(report.selected_plans||[]).length}개</p>${actions}<div class="harl-response-prose">${renderText}</div></article>`;
  }
  async function downloadResponse(id) {
    const report=await readResponse(id);
    const url=URL.createObjectURL(new Blob([report.markdown],{type:'text/markdown;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;
    link.download=String(report.filename||'HERMES_예방대응보고서.md').split(/[\\/]/).at(-1).replace(/[<>:"|?*\u0000-\u001f]/g,'_');
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  function closeLibrary(value=null) {
    libraryRequest++;detailRequest++;
    if(library?.open)library.close();
    const resolve=libraryState.resolve;libraryState.resolve=null;
    if(resolve)resolve(value);
    libraryFocus?.focus?.({preventScroll:true});
  }
  function libraryHeader() {
    if(!library)return;
    library.querySelector('#analysis-library-title').textContent=libraryState.options.comparisonBase?'비교할 다른 지역의 보고서 선택':libraryState.pick?'연결할 현황 분석을 선택해 주세요':'저장된 보고서';
    library.querySelector('[data-report-library-intro]').textContent=libraryState.options.comparisonBase
      ?`${regionLabel(libraryState.options.comparisonBase)}와 같은 관측월·집단·공간 단위의 다른 지역을 선택해 주세요.`
      :libraryState.pick
      ?`${libraryState.options.programTitle?'「'+libraryState.options.programTitle+'」을 ':'대응안을 '}어느 지역 분석에 연결할지 확인해 주세요.`
      :'';
    const scopeText=libraryScopeLabel(),scopeHost=library.querySelector('[data-report-library-scope]');
    scopeHost.innerHTML=scopeText?`<span>${esc(scopeText)}</span><button type="button" data-report-library-clear-scope>조건 해제</button>`:'';
    const tabs=library.querySelector('[data-report-library-tabs]');
    tabs.hidden=libraryState.pick;
    tabs.querySelectorAll('[data-report-library-type]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.reportLibraryType===libraryState.type)));
  }
  function libraryRow(report) {
    const isResponse=libraryState.type==='response',issue=libraryState.options.comparisonBase?comparisonIssue(libraryState.options.comparisonBase,report):null;
    return `<li><button type="button" class="harl-report-row" ${issue?'disabled':''} ${isResponse?'data-response-report-open':'data-analysis-report-open'}="${esc(report.report_id)}"><span class="harl-row-kind">${esc(reportType(report))}</span><strong>${esc(report.title||regionLabel(report))}</strong><span>${isResponse?esc(regionLabel(report))+' · ':''}${esc(monthLabel(report.scope?.month))} · ${esc(group(report.scope))}</span><small>${esc(dateLabel(report.created_at))}${issue?' · '+esc(issue):''}</small></button></li>`;
  }
  async function loadLibrary(offset=0) {
    const token=++libraryRequest;
    libraryState.offset=offset;libraryState.selected=null;detailRequest++;
    library.classList.remove('harl-has-detail');
    library.querySelector('[data-report-library-detail]').innerHTML='<div class="harl-empty"><h3>보고서를 선택해 주세요</h3></div>';
    const status=library.querySelector('[data-report-library-status]'),content=library.querySelector('[data-report-library-list]');
    libraryHeader();status.textContent='저장된 보고서를 불러오고 있습니다.';
    content.innerHTML='<div class="harl-empty" role="status">보고서 목록을 불러오는 중입니다.</div>';
    try {
      const page=libraryState.type==='response'?await listResponseReports(offset,libraryState.scope):await listReports(offset,libraryState.scope);
      if(token!==libraryRequest)return;
      content.innerHTML=page.reports.length?`<ul class="harl-report-list">${page.reports.map(libraryRow).join('')}</ul><div class="harl-pagination"><button type="button" data-report-library-page="${Math.max(0,offset-20)}" ${offset===0?'disabled':''}>이전</button><span>${offset+1}–${offset+page.reports.length} / ${page.total_matched}건</span><button type="button" data-report-library-page="${page.next_offset??0}" ${page.next_offset==null?'disabled':''}>다음</button></div>`:`<div class="harl-empty"><h3>${libraryState.type==='response'?'아직 만든 대응 보고서가 없어요':'조건에 맞는 분석 보고서가 없어요'}</h3><p>${libraryState.type==='response'?'분석 보고서에서 대응안을 검토하고 선택하면 이곳에 저장할 수 있어요.':'먼저 지역과 관측월을 선택해 현황을 분석한 뒤 다시 연결해 주세요.'}</p>${libraryState.type==='response'?'<button type="button" class="harl-primary" data-report-library-type="analysis">분석 보고서에서 이어가기</button>':libraryState.options.emptyAction?`<button type="button" class="harl-primary" data-report-library-empty-action>${esc(libraryState.options.emptyAction.label||'지역 분석하기')}</button>`:''}${Object.keys(libraryState.scope).length?'<button type="button" data-report-library-clear-scope>전체 보고서에서 찾기</button>':''}</div>`;
      status.textContent='';
    }catch(error){if(token!==libraryRequest)return;status.textContent=error.message;content.innerHTML='<div class="harl-empty"><h3>목록을 불러오지 못했어요</h3><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button type="button" data-report-library-page="0">다시 불러오기</button></div>';}
  }
  async function openDetail(id,type='analysis') {
    const token=++detailRequest,host=library.querySelector('[data-report-library-detail]');
    host.innerHTML='<div class="harl-empty" role="status">보고서 내용을 불러오는 중입니다.</div>';
    try {
      const report=type==='response'?await readResponse(id):await read(id);
      if(token!==detailRequest||!library.open)return;
      const issue=libraryState.options.comparisonBase?comparisonIssue(libraryState.options.comparisonBase,report):null;
      libraryState.selected=type==='analysis'&&!issue?report:null;
      host.innerHTML=`<button type="button" class="harl-back" data-report-library-back>목록으로</button>${libraryState.pick?`<div class="harl-pick-confirm"><p><b>${esc(regionLabel(report))}</b> · ${esc(monthLabel(report.scope?.month))} · ${esc(group(report.scope))}</p><button type="button" class="harl-primary" data-report-library-confirm ${issue?'disabled':''}>${libraryState.options.comparisonBase?'이 지역과 비교 조사하기':'이 분석에 연결하기'}</button>${issue?`<p>${esc(issue)}</p>`:''}</div>`:''}${type==='response'?responseArticle(report):render([report])}`;
      library.classList.add('harl-has-detail');
      host.scrollTop=0;
      library.querySelector('[data-report-library-status]').textContent='';
      host.querySelector('[data-report-library-back]')?.focus?.({preventScroll:true});
    }catch(error){if(token!==detailRequest)return;host.innerHTML=`<div class="harl-empty"><h3>보고서를 열지 못했어요</h3><p>${esc(error.message)}</p><button type="button" ${type==='response'?'data-response-report-open':'data-analysis-report-open'}="${esc(id)}">다시 열기</button></div>`;}
  }
  function mountLibrary() {
    const nav=document.getElementById('nav');
    if(nav&&!document.querySelector('[data-analysis-report-library]')){
      const button=document.createElement('button');button.type='button';button.dataset.analysisReportLibrary='';button.textContent='저장된 보고서';nav.appendChild(button);
    }
    if(library)return;
    library=document.createElement('dialog');library.className='harl-library';library.setAttribute('aria-labelledby','analysis-library-title');
    library.innerHTML='<header class="harl-header"><div><h2 id="analysis-library-title">저장된 보고서</h2><p data-report-library-intro></p></div><button type="button" class="harl-close" data-report-library-close aria-label="저장된 보고서 닫기">닫기</button></header><div class="harl-scope" data-report-library-scope></div><div class="harl-types" data-report-library-tabs role="group" aria-label="보고서 종류"><button type="button" data-report-library-type="analysis" aria-pressed="true">현황 분석</button><button type="button" data-report-library-type="response" aria-pressed="false">예방 대응</button></div><p class="harl-status" data-report-library-status role="status" aria-live="polite"></p><div class="harl-body"><section class="harl-list-pane" aria-label="저장된 보고서 목록" data-report-library-list></section><section class="harl-detail-pane" aria-label="보고서 내용" data-report-library-detail><div class="harl-empty"><h3>보고서를 선택해 주세요</h3></div></section></div>';
    library.addEventListener('cancel',event=>{event.preventDefault();closeLibrary();});
    document.body.appendChild(library);
  }
  async function openLibrary(options={}) {
    mountLibrary();
    if(libraryState.resolve)closeLibrary();
    libraryFocus=document.activeElement;
    libraryState={scope:filterScope(options.scope),type:options.type==='response'?'response':'analysis',offset:0,pick:Boolean(options._pick),resolve:options._resolve||null,selected:null,options};
    library.classList.remove('harl-has-detail');
    if(!library.open)library.showModal();
    await loadLibrary();
    if(options.reportId)await openDetail(options.reportId,libraryState.type);
    return library;
  }
  function chooseReport(options={}) {
    return new Promise(resolve=>{openLibrary({...options,type:'analysis',_pick:true,_resolve:resolve}).catch(()=>resolve(null));});
  }
  if(typeof document!=='undefined')document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-analysis-compare-open],[data-analysis-comparison-view],[data-analysis-report-download],[data-analysis-report-investigate],[data-analysis-response-open],[data-analysis-report-library],[data-analysis-report-open],[data-response-report-open],[data-response-report-download],[data-response-parent-open],[data-response-report-workspace],[data-report-library-page],[data-report-library-close],[data-report-library-type],[data-report-library-clear-scope],[data-report-library-confirm],[data-report-library-back],[data-report-library-empty-action]');if(!button)return;
    if(button.hasAttribute('data-analysis-report-library')){await openLibrary();return;}
    if(button.hasAttribute('data-report-library-close')){closeLibrary();return;}
    if(button.hasAttribute('data-analysis-comparison-view')){await openLibrary({reportId:button.dataset.analysisComparisonView});return;}
    if(button.hasAttribute('data-analysis-compare-open')){
      button.disabled=true;
      try{
        const base=await read(button.dataset.analysisCompareOpen);
        const chosen=await chooseReport({comparisonBase:base,scope:{month:base.scope.month,sex_code:base.scope.sex_code,age_code:base.scope.age_code}});
        await openLibrary({reportId:base.report_id});
        if(!chosen)return;
        if(comparisonIssue(base,chosen))throw Error(comparisonIssue(base,chosen));
        const status=library.querySelector('[data-report-library-status]');status.textContent='선택한 지역의 근거를 함께 조사하고 있습니다.';
        const report=await investigate(base.report_id,{comparison_report_ids:[chosen.report_id]});
        await openDetail(report.report_id);
        status.textContent='비교한 지역의 근거와 조사 결과를 저장했습니다.';
      }catch(error){const status=library?.querySelector('[data-report-library-status]');if(status)status.textContent=error.message;}
      finally{button.disabled=false;}
      return;
    }
    if(button.hasAttribute('data-report-library-back')){detailRequest++;library.classList.remove('harl-has-detail');return;}
    if(button.hasAttribute('data-report-library-type')){detailRequest++;libraryState.type=button.dataset.reportLibraryType;library.classList.remove('harl-has-detail');library.querySelector('[data-report-library-detail]').innerHTML='<div class="harl-empty"><h3>목록에서 보고서를 선택해 주세요</h3></div>';await loadLibrary();return;}
    if(button.hasAttribute('data-report-library-clear-scope')){libraryState.scope={};libraryState.options.scope={};await loadLibrary();return;}
    if(button.hasAttribute('data-report-library-empty-action')){const action=libraryState.options.emptyAction?.run;closeLibrary();action?.();return;}
    if(button.hasAttribute('data-report-library-page')){await loadLibrary(Number(button.dataset.reportLibraryPage));return;}
    if(button.hasAttribute('data-report-library-confirm')){if(libraryState.selected)closeLibrary(libraryState.selected);return;}
    const host=button.closest('[data-saved-analysis-report]');
    const status=host?.querySelector('[data-analysis-report-status]')||library?.querySelector('[data-report-library-status]');
    button.disabled=true;
    try {
      if(button.hasAttribute('data-analysis-report-open'))await openDetail(button.dataset.analysisReportOpen);
      else if(button.hasAttribute('data-response-report-open'))await openDetail(button.dataset.responseReportOpen,'response');
      else if(button.hasAttribute('data-response-parent-open')){libraryState.type='analysis';await loadLibrary();await openDetail(button.dataset.responseParentOpen);}
      else if(button.hasAttribute('data-analysis-response-open')||button.hasAttribute('data-response-report-workspace')){
        if(!window.HERMES_RESPONSE_WORKSPACE?.open)throw Error('대응안 검토 화면을 준비하지 못했습니다. 화면을 새로고침해 주세요.');
        const id=button.dataset.analysisResponseOpen||button.dataset.responseReportWorkspace;
        if(library?.open)closeLibrary();
        if(button.hasAttribute('data-response-report-workspace'))await window.HERMES_RESPONSE_WORKSPACE.open(id);
        else await window.HERMES_RESPONSE_WORKSPACE.open(id,{});
      }else if(button.hasAttribute('data-analysis-report-investigate')){
        if(status)status.textContent='지역 근거를 조사하고 있습니다.';
        const report=await investigate(button.dataset.analysisReportInvestigate);
        if(host?.isConnected)host.outerHTML=article(report);
      }else if(button.hasAttribute('data-response-report-download')){await downloadResponse(button.dataset.responseReportDownload);if(status)status.textContent='저장된 대응 보고서를 내려받았습니다.';}
      else{await download(button.dataset.analysisReportDownload);if(status)status.textContent='서버에 저장된 현황 보고서를 내려받았습니다.';}
    }catch(error){if(status)status.textContent=error.message;}
    finally{button.disabled=false;}
  });
  if(typeof window.addEventListener==='function')window.addEventListener('load',()=>Promise.resolve(window.HERMES_HTML_READY).then(mountLibrary).catch(()=>{}));
  return {render,download,read,investigate,comparisonIssue,comparisonHTML,listReports,listResponseReports,readResponse,downloadResponse,openLibrary,chooseReport,reportQuery,filterScope,assessmentHTML,researchHTML,sourceURL,responseArticle};
})();
