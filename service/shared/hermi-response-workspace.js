/* A saved analysis owns its response drafts and the exact versions in each report. */
window.HERMES_RESPONSE_WORKSPACE = (() => {
  'use strict';
  const KINDS = {existing_program:'기존 사업 활용',program_improvement:'사업 보완',new_program:'신규 예방사업'};
  const FIELDS = ['title','target','rationale','content','checks','feedback'];
  const FIELD_LIMITS={title:200,target:2000,rationale:4000,content:8000,checks:4000,feedback:4000};
  const REVIEW_FIELDS={eligibility:'지원 대상·조건',support_content:'지원 내용',delivery:'전달기관·이용 경로',finance_and_cost:'재원·본인부담·이용 비용'};
  const NEED_FIELDS={social_connection:'사회관계·참여',isolation_outreach:'고립·은둔 발굴·상담',income_support:'소득·생활',daily_living:'일상 돌봄',employment:'취업·경제',mental_health:'정신·정서',health_care:'건강·의료',housing:'주거',family_support:'가족·보호자'};
  const REVIEW_STATUS={unconfirmed:'미확인',confirmed:'사용자 확인 기록',not_applicable:'해당 없음으로 기록'};
  const REVIEW_NOTE='확인 상태와 근거는 사용자가 직접 입력한 기록입니다. 시스템의 검증이나 개인 지원 자격 확정이 아닙니다.';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const safeURL = value => {try {if(typeof value!=='string'||value.length>2000||/[\u0000-\u0020<>\\"']/.test(value))return null;const url=new URL(value),host=url.hostname.toLowerCase();return ['http:','https:'].includes(url.protocol)&&host&&!['localhost','localhost.localdomain'].includes(host)&&!url.username&&!url.password&&['','80','443'].includes(url.port)?value:null;}catch{return null;}};
  const stable = value => JSON.stringify(value);
  function reviewEntry(value={},previous={},need=false){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('확인 기록의 입력값을 확인해 주세요.');
    const item={status:'unconfirmed',text:'',evidence:'',...previous,...value};
    if(!Object.hasOwn(REVIEW_STATUS,item.status)||(need&&item.status==='not_applicable'))throw Error('확인 상태를 다시 선택해 주세요.');
    for(const key of ['text','evidence'])if(typeof item[key]!=='string'||Array.from(item[key]).length>2000)throw Error('확인 내용과 근거는 각각 2,000자 이내로 입력해 주세요.');
    return {status:item.status,text:item.text,evidence:item.evidence};
  }
  function reviewData(plan={}){
    const policy=plan.policy_review||{},needs=plan.support_needs||[];
    if(typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).some(key=>!Object.hasOwn(REVIEW_FIELDS,key))||!Array.isArray(needs)||needs.length>9)throw Error('저장된 확인 기록의 형식을 확인하지 못했습니다.');
    const seen=new Set();
    const support_needs=needs.map(item=>{if(!item||!Object.hasOwn(NEED_FIELDS,item.category_code)||seen.has(item.category_code))throw Error('지원 필요 분야를 확인해 주세요.');seen.add(item.category_code);return {category_code:item.category_code,...reviewEntry(item,{},true)};});
    return {policy_review:Object.fromEntries(Object.keys(REVIEW_FIELDS).map(key=>[key,reviewEntry(policy[key]||{})])),support_needs};
  }
  const cleanPlan = plan => ({plan_id:plan.plan_id||null,kind:plan.kind,title:plan.title,target:plan.target,rationale:plan.rationale,content:plan.content,checks:plan.checks,selected:plan.selected===true,feedback:plan.feedback,...reviewData(plan),program_reference:plan.program_reference?{program_version_id:plan.program_reference.program_version_id,title:plan.program_reference.title,url:safeURL(plan.program_reference.url),publisher:plan.program_reference.publisher||null}:null});
  const editSnapshot = plans => plans.map(cleanPlan);
  function failure(message,status,code) {const error=new Error(message);error.status=status;error.code=code;return error;}
  async function request(path,options) {
    let response;
    try {response=await fetch(path,options);}catch {throw failure('서버에 연결하지 못했습니다. 입력한 내용은 이 화면에 남아 있습니다.',0);}
    let data;
    try {data=await response.json();}catch {throw failure('서버의 저장 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',response.status);}
    if(!response.ok)throw failure(data.detail?.message||'요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',response.status,data.detail?.code);
    return data;
  }
  function createController(analysisReportId,options={}) {
    if(typeof analysisReportId!=='string'||!analysisReportId.trim())throw Error('먼저 현황 분석 보고서를 선택해 주세요.');
    const ask=options.request||request;
    const path='/api/model/analysis-reports/'+encodeURIComponent(analysisReportId);
    const page=options.page||window;
    let storage;
    try{storage=options.storage===undefined?window.localStorage:options.storage;}catch{}
    let state={analysisReportId,workspaceAnalysisReportId:analysisReportId,analysis:null,version:0,plans:[],reports:[],activeKey:null,updated_at:null,loaded:false,busy:null,error:null,conflict:false,lastReport:null,recovery:null,localDraftStatus:storage?'ready':'unavailable',pendingProgram:null,supportSearches:{},assistance:{instruction:'',kind:'new_program',mode:'draft',result:null,error:null}};
    let saved=stable([]),sequence=0,pendingSave=null,pendingGenerate=null,pendingSearch=null,pendingAssist=null,maxExistingPlans=20;
    const listeners=new Set();
    const emit=type=>{if(['add','edit','recovered','assist-applied'].includes(type))persistDraft();listeners.forEach(fn=>fn({type,state,dirty:dirty()}));};
    const dirty=()=>stable(editSnapshot(state.plans))!==saved;
    const selected=()=>state.plans.filter(plan=>plan.selected);
    const editable=()=>{if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 수정해 주세요.');if(state.recovery)throw Error('남아 있는 임시 초안을 먼저 확인해 주세요.');};
    const draftKey=()=> 'hermes.response-draft.v1:'+state.workspaceAnalysisReportId;
    const scopeKey=value=>stable(['region_code','dong_code','month','sex_code','age_code'].map(key=>value?.[key]??null));
    function persistDraft(){
      if(!state.loaded||state.recovery)return;
      try{
        if(!storage)throw Error('storage unavailable');
        if(!dirty()){storage.removeItem(draftKey());state.localDraftStatus='ready';return;}
        storage.setItem(draftKey(),JSON.stringify({schema_version:1,workspace_analysis_report_id:state.workspaceAnalysisReportId,scope:state.analysis.scope,server_version:state.version,plans:editSnapshot(state.plans),saved_at:new Date().toISOString()}));
        state.localDraftStatus='saved';
      }catch{state.localDraftStatus='unavailable';}
    }
    function recoverableDraft(){
      state.recovery=null;
      try{
        if(!storage)throw Error('storage unavailable');
        const raw=storage.getItem(draftKey());if(!raw)return;
        if(raw.length>2500000)return;
        const draft=JSON.parse(raw);
        if(draft.schema_version!==1||draft.workspace_analysis_report_id!==state.workspaceAnalysisReportId||scopeKey(draft.scope)!==scopeKey(state.analysis.scope)||!Number.isInteger(draft.server_version)||draft.server_version<0||!Array.isArray(draft.plans)||draft.plans.length>Math.max(20,state.plans.length))return;
        const ids=new Set();
        for(const plan of draft.plans){
          if(!plan||!Object.hasOwn(KINDS,plan.kind)||typeof plan.selected!=='boolean'||plan.plan_id!==null&&(typeof plan.plan_id!=='string'||!plan.plan_id||ids.has(plan.plan_id)))return;
          if(plan.plan_id)ids.add(plan.plan_id);
          for(const field of FIELDS)if(typeof plan[field]!=='string'||Array.from(plan[field]).length>FIELD_LIMITS[field])return;
          reviewData(plan);
          if(plan.program_reference&&(typeof plan.program_reference.program_version_id!=='string'||typeof plan.program_reference.title!=='string'))return;
        }
        if(stable(draft.plans)===saved){storage.removeItem(draftKey());return;}
        state.recovery={...draft,conflict:draft.server_version!==state.version};
      }catch{state.localDraftStatus='unavailable';}
    }
    function discardDraft(){
      try{if(!storage)throw Error('storage unavailable');storage.removeItem(draftKey());state.localDraftStatus='ready';}catch{state.localDraftStatus='unavailable';}
      state.recovery=null;
      const program=state.pendingProgram;state.pendingProgram=null;
      if(program)add('existing_program',program);
      emit('recovery-dismissed');
    }
    function restoreDraft(){
      if(state.busy)throw Error('자료를 불러온 뒤 초안을 복구해 주세요.');
      const draft=state.recovery;
      if(!draft)throw Error('복구할 임시 초안이 없습니다.');
      if(draft.conflict)throw Error('서버에 최신 저장본이 있습니다. 임시 초안 내용을 확인하고 필요한 수정만 반영해 주세요.');
      const existing=new Map(state.plans.map(plan=>[plan.plan_id,plan]));
      if(draft.plans.some(plan=>plan.plan_id&&!existing.has(plan.plan_id)))throw Error('최신 저장본과 초안의 대응안이 다릅니다. 초안 내용을 확인해 주세요.');
      state.plans=draft.plans.map(plan=>({...existing.get(plan.plan_id),...cleanPlan(plan),_key:'plan-'+(++sequence)}));
      state.activeKey=state.plans[0]?._key||null;state.recovery=null;
      const program=state.pendingProgram;state.pendingProgram=null;if(program)add('existing_program',program);
      emit('recovered');return state;
    }
    const beforeUnload=event=>{if(state.loaded&&dirty()){event.preventDefault();event.returnValue='';}};
    page.addEventListener?.('beforeunload',beforeUnload);
    function dispose(){page.removeEventListener?.('beforeunload',beforeUnload);listeners.clear();}
    function ingest(workspace) {
      if(!workspace||workspace.analysis_report_id!==analysisReportId||!Number.isInteger(workspace.version)||workspace.version<0||!Array.isArray(workspace.plans)||!Array.isArray(workspace.reports))throw Error('대응안의 저장 범위를 확인하지 못했습니다.');
      const previous=state.plans;
      state.version=workspace.version;state.updated_at=workspace.updated_at;maxExistingPlans=Math.max(20,workspace.plans.length);
      state.workspaceAnalysisReportId=workspace.workspace_analysis_report_id||analysisReportId;
      state.plans=workspace.plans.map((plan,index)=>{
        if(!plan.plan_id||!Number.isInteger(plan.version)||!KINDS[plan.kind])throw Error('저장된 대응안 정보를 확인하지 못했습니다.');
        const old=previous.find(item=>item.plan_id===plan.plan_id)||previous[index];
        return {...plan,...Object.fromEntries(FIELDS.map(field=>[field,String(plan[field]||'')])),...reviewData(plan),_key:old?._key||'plan-'+(++sequence)};
      });
      state.reports=workspace.reports;
      if(!state.plans.some(plan=>plan._key===state.activeKey))state.activeKey=state.plans[0]?._key||null;
      saved=stable(editSnapshot(state.plans));
    }
    async function load() {
      if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 다시 불러와 주세요.');
      state.busy='load';state.error=null;emit('busy');
      try {
        const [analysis,workspace]=await Promise.all([ask(path),ask(path+'/response-workspace')]);
        if(analysis.report_id!==analysisReportId||typeof analysis.markdown!=='string')throw Error('원래 현황 분석을 확인하지 못했습니다.');
        ingest(workspace);state.analysis=analysis;state.supportSearches={};state.assistance.result=null;state.assistance.error=null;state.loaded=true;state.conflict=false;state.error=null;recoverableDraft();emit('loaded');return state;
      }catch(error){state.error=error.message;emit('error');throw error;}
      finally {state.busy=null;emit('idle');}
    }
    function add(kind='new_program',program=null) {
      editable();if(!state.loaded)throw Error('현황 분석을 불러온 뒤 대응안을 추가해 주세요.');
      if(!KINDS[kind])throw Error('대응안 유형을 확인해 주세요.');
      const programId=program?String(program.program_version_id||program.version_id||'').trim():null;
      if(program&&(!programId||Array.from(programId).length>200))throw Error('선택한 복지사업의 정보를 확인하지 못했습니다. 사업 목록에서 다시 선택해 주세요.');
      if(program){const previous=state.plans.find(plan=>plan.program_reference?.program_version_id===programId);if(previous){state.activeKey=previous._key;emit('active');return previous;}}
      if(state.plans.length>=20)throw Error('한 분석에 대응안을 20개까지 담을 수 있습니다. 기존 대응안을 수정하거나 보고서 포함 여부를 바꿔 주세요.');
      const key='plan-'+(++sequence);
      const clipped=[];
      const clip=(value,limit,label)=>{const chars=Array.from(String(value??''));if(chars.length>limit){clipped.push(label);return chars.slice(0,limit).join('');}return chars.join('');};
      const sourceTitle=program?String(program.title||'').trim()||'선택한 사업':'';
      const sourceURL=program?.url||program?.source_url||null;
      const referenceURL=sourceURL?safeURL(sourceURL):null;
      if(sourceURL&&!referenceURL)clipped.push('사용할 수 없는 원문 링크');
      const plan={_key:key,plan_id:null,version:0,kind,title:program?clip(sourceTitle,200,'대응안 이름'):KINDS[kind]+' 대응안',target:program?clip(program.target||program.target_text||'',2000,'대상과 범위'):'',rationale:program?clip(program.rationale||'',4000,'분석과 연결한 이유'):'',content:program?clip(program.summary||program.support_content||'',8000,'실행 내용'):'',checks:program?clip(program.checks||'',4000,'확인할 사항'):'',feedback:program?clip(program.feedback||'',4000,'검토 의견'):'',selected:true,program_reference:program?{program_version_id:programId,title:clip(sourceTitle,300,'사업 원문 이름'),url:referenceURL,publisher:program.publisher||program.institution?clip(program.publisher||program.institution,200,'담당기관 이름'):null}:null};
      if(clipped.length)plan._import_note=`가져온 ${[...new Set(clipped)].join(', ')}을 입력 가능한 범위에 맞춰 줄이거나 제외했습니다. 원문을 확인하며 검토해 주세요.`;
      Object.assign(plan,reviewData());
      state.plans.push(plan);state.activeKey=key;state.error=null;emit('add');return plan;
    }
    function edit(key,patch) {
      editable();const plan=state.plans.find(item=>item._key===key);if(!plan)throw Error('수정할 대응안을 선택해 주세요.');
      for(const [field,value] of Object.entries(patch)){
        if(FIELDS.includes(field)){if(typeof value!=='string')throw Error('입력 내용을 확인해 주세요.');if(Array.from(value).length>FIELD_LIMITS[field])throw Error('입력 가능한 길이를 넘었습니다. 내용을 나누어 정리해 주세요.');plan[field]=value;}
        else if(field==='kind'){if(!KINDS[value])throw Error('대응안 유형을 확인해 주세요.');plan.kind=value;}
        else if(field==='selected')plan.selected=value===true;
        else if(field==='policy_review'){
          if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(item=>!Object.hasOwn(REVIEW_FIELDS,item)))throw Error('검토 항목을 확인해 주세요.');
          plan.policy_review={...plan.policy_review,...Object.fromEntries(Object.entries(value).map(([item,entry])=>[item,reviewEntry(entry,plan.policy_review[item])]))};
        }
        else if(field==='support_needs'){
          if(!Array.isArray(value)||new Set(value.map(item=>item?.category_code)).size!==value.length)throw Error('지원 필요 분야를 확인해 주세요.');
          const merged=new Map(plan.support_needs.map(item=>[item.category_code,item]));
          for(const item of value){if(!item||!Object.hasOwn(NEED_FIELDS,item.category_code))throw Error('지원 필요 분야를 확인해 주세요.');merged.set(item.category_code,{category_code:item.category_code,...reviewEntry(item,merged.get(item.category_code),true)});}
          plan.support_needs=Object.keys(NEED_FIELDS).filter(item=>merged.has(item)).map(item=>merged.get(item));
          delete state.supportSearches[key];
        }
        else throw Error('수정할 수 없는 항목입니다.');
      }
      state.error=null;emit('edit');return plan;
    }
    function activate(key){if(!state.plans.some(plan=>plan._key===key))return;state.activeKey=key;emit('active');}
    function validateDrafts(){
      if(state.plans.length>maxExistingPlans)throw Error('한 분석에 새 대응안을 20개까지 저장할 수 있습니다.');
      for(const plan of state.plans)if(!plan.title.trim())throw Error('대응안 이름을 입력해 주세요.');
      for(const plan of state.plans)for(const item of [...Object.values(plan.policy_review),...plan.support_needs])if(item.status==='confirmed'&&(!item.text.trim()||!item.evidence.trim()))throw Error('사용자 확인으로 기록할 항목의 내용과 직접 확인한 근거를 입력해 주세요.');
    }
    async function save() {
      if(pendingSave)return pendingSave;
      if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 저장해 주세요.');
      validateDrafts();if(!dirty())return state;
      const body={expected_version:state.version,plans:editSnapshot(state.plans)};
      state.busy='save';state.error=null;emit('busy');
      pendingSave=(async()=>{
        try {const workspace=await ask(path+'/response-workspace',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});ingest(workspace);discardDraft();state.localDraftStatus=storage?'ready':'unavailable';state.conflict=false;emit('saved');return state;}
        catch(error){state.error=error.message;state.conflict=error.status===409;emit('error');throw error;}
        finally{state.busy=null;pendingSave=null;emit('idle');}
      })();return pendingSave;
    }
    async function generate() {
      if(pendingGenerate)return pendingGenerate;
      if(state.busy)throw Error('진행 중인 작업이 끝난 뒤 보고서를 만들어 주세요.');
      if(dirty())throw Error('선택과 수정 내용을 먼저 저장해 주세요.');
      const plans=selected();if(!plans.length)throw Error('보고서에 담을 대응안을 하나 이상 선택해 주세요.');
      if(plans.some(plan=>!plan.target.trim()))throw Error('선택한 대응안의 대상과 범위를 입력하고 저장해 주세요.');
      if(plans.some(plan=>!plan.content.trim()))throw Error('선택한 대응안의 실행 내용을 입력하고 저장해 주세요.');
      const body={expected_workspace_version:state.version,selected_plan_versions:plans.map(plan=>({plan_id:plan.plan_id,version:plan.version}))};
      state.busy='report';state.error=null;emit('busy');
      pendingGenerate=(async()=>{
        try {const report=await ask(path+'/response-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});validateGeneratedReport(report);
          const actual=Array.isArray(report.selected_plans)?report.selected_plans:[];
          const keys=rows=>rows.map(row=>String(row.plan_id)+':'+String(row.version)).sort();
          const sameScope=report.scope&&['region_code','month','sex_code','age_code'].every(field=>(report.scope[field]??null)===(state.analysis.scope[field]??null));
          const matchingWorkspace=report.workspace_version===body.expected_workspace_version||(report.reused===true&&Number.isInteger(report.workspace_version)&&report.workspace_version>0&&report.workspace_version<body.expected_workspace_version);
          if(report.report_type!=='preventive_response'||!matchingWorkspace||!sameScope||actual.length!==body.selected_plan_versions.length||stable(keys(actual))!==stable(keys(body.selected_plan_versions))||new Set(actual.map(row=>row.plan_id)).size!==actual.length)throw Error('선택한 대응안과 수정 버전이 보고서에 정확히 반영됐는지 확인하지 못했습니다.');
          if(report.analysis_snapshot&&(report.analysis_snapshot.report_id!==analysisReportId||['region_code','month','sex_code','age_code'].some(field=>(report.analysis_snapshot.scope?.[field]??null)!==(state.analysis.scope[field]??null))))throw Error('보고서의 원래 현황 분석 범위가 달라졌습니다.');
          state.lastReport=report;
          if(!state.reports.some(item=>item.report_id===report.report_id))state.reports.unshift(report);emit('generated');return report;}
        catch(error){state.error=error.message;state.conflict=error.status===409;emit('error');throw error;}
        finally{state.busy=null;pendingGenerate=null;emit('idle');}
      })();return pendingGenerate;
    }
    function validateReportContent(report){
      if(!report||typeof report.report_id!=='string'||!report.report_id||typeof report.analysis_report_id!=='string'||!report.analysis_report_id||typeof report.markdown!=='string'||report.storage_status!=='saved')throw Error('같은 현황 분석에 연결된 보고서인지 확인하지 못했습니다.');
      return report;
    }
    function validateGeneratedReport(report){
      validateReportContent(report);
      if(report.analysis_report_id!==analysisReportId||(report.workspace_analysis_report_id&&report.workspace_analysis_report_id!==state.workspaceAnalysisReportId))throw Error('같은 현황 분석에 연결된 보고서인지 확인하지 못했습니다.');
      return report;
    }
    async function readReport(id){
      const report=validateReportContent(await ask('/api/model/response-reports/'+encodeURIComponent(id)));
      if(report.report_id!==id)throw Error('선택한 보고서와 서버의 응답이 다릅니다. 목록에서 다시 열어 주세요.');
      // The server's family listing is the membership receipt. Historical reports
      // retain their original parent/root, including legacy rows with no root.
      const listed=state.reports.find(item=>item.report_id===id);
      if(!listed||listed.analysis_report_id!==report.analysis_report_id||(listed.workspace_analysis_report_id??null)!==(report.workspace_analysis_report_id??null)||(report.analysis_snapshot&&report.analysis_snapshot.report_id!==listed.analysis_report_id))throw Error('같은 현황 분석에 연결된 보고서인지 확인하지 못했습니다.');
      state.lastReport=report;emit('report');return report;
    }
    async function searchNeeds(key=state.activeKey){
      if(pendingSearch)return pendingSearch;
      editable();
      const plan=state.plans.find(item=>item._key===key),scope=state.analysis?.scope;
      if(!singleScope(scope))throw Error('성별과 연령 집단을 선택한 현황 분석에서 지원 필요를 확인해 주세요. 전체 집단을 임의로 바꾸어 검색하지 않습니다.');
      if(!plan)throw Error('지원 필요를 기록한 대응안을 선택해 주세요.');
      if(dirty())throw Error('지원 필요의 확인 기록과 수정 내용을 먼저 저장해 주세요.');
      const needs=confirmedNeeds(plan);
      if(!needs.length)throw Error('사업을 찾으려면 지원 필요의 상태를 사용자 확인으로 선택하고 내용과 근거를 기록해 주세요.');
      const query=[...['region_code','month','sex_code','age_code'].map(field=>[field,scope[field]]),...needs.map(item=>['confirmed_needs',item.category_code])].map(([field,value])=>encodeURIComponent(field)+'='+encodeURIComponent(value)).join('&');
      const record={status:'loading',needs:copy(needs),programs:[],error:null};state.supportSearches[key]=record;state.busy='search';state.error=null;emit('busy');
      pendingSearch=(async()=>{
        try{
          const result=await ask('/api/model/welfare?'+query,{method:'GET'});
          const sameScope=result?.request&&['region_code','month','sex_code','age_code'].every(field=>result.request[field]===scope[field]);
          const returnedNeeds=result?.request?.confirmed_needs;
          if(!sameScope||!Array.isArray(returnedNeeds)||stable([...returnedNeeds].sort())!==stable(needs.map(item=>item.category_code).sort())||!Array.isArray(result.recommendations))throw Error('조회 범위와 확인한 지원 필요가 검색 결과에 반영됐는지 확인하지 못했습니다.');
          record.serverStatus=result.status;record.mappingStatus=result.mapping_status||null;record.coverage=copy(result.coverage||{});record.asOf=result.request.support_as_of||null;
          const held=result.status!=='completed'||result.mapping?.status==='held';
          if(!held){
            const ids=result.recommendations.map(program=>program?.version_id);
            if(ids.some(id=>typeof id!=='string'||!id.trim())||new Set(ids).size!==ids.length)throw Error('후보 사업의 저장 정보를 확인하지 못했습니다.');
          }
          record.status=held?'held':'complete';record.programs=copy(result.recommendations);
          record.reasons=Array.isArray(result.mapping?.reasons)?result.mapping.reasons.filter(reason=>typeof reason==='string'&&reason.trim()):[];
          if(held&&!record.reasons.length)record.reasons=['사업 탐색이 완료되지 않았습니다. 연결 기준과 자료 상태를 확인해 주세요.'];
          emit('search');return record;
        }catch(error){record.status='error';record.error='사업 후보를 확인하지 못했습니다. '+error.message+' 조회 오류를 사업 부재로 해석하지 않습니다.';emit('search');throw Error(record.error);}
        finally{state.busy=null;pendingSearch=null;emit('idle');}
      })();return pendingSearch;
    }
    function importCandidate(key,index){
      editable();const record=state.supportSearches[key],sourcePlan=state.plans.find(item=>item._key===key);
      if(record?.status!=='complete'||!sourcePlan||stable(confirmedNeeds(sourcePlan))!==stable(record.needs)||!Number.isInteger(index)||!record.programs[index])throw Error('지원 필요를 다시 확인하고 후보를 조회해 주세요.');
      const program=record.programs[index],existing=state.plans.find(item=>item.program_reference?.program_version_id===program.version_id);
      const draft=add('existing_program',{...program,rationale:'사용자가 기록한 지원 필요로 찾은 검토 후보입니다. 개인 지원 자격과 이용 가능 여부는 별도 확인합니다.',checks:(program.unconfirmed_conditions||[]).join('\n')});
      if(!existing)edit(draft._key,{support_needs:copy(record.needs)});
      return draft;
    }
    function setAssistance(patch){
      for(const [key,value] of Object.entries(patch)){
        if(key==='instruction'){if(typeof value!=='string'||Array.from(value).length>2000)throw Error('요청은 2,000자 이내로 입력해 주세요.');}
        else if(key==='kind'){if(!KINDS[value])throw Error('대응안 유형을 확인해 주세요.');}
        else if(key==='mode'){if(!['draft','revise','review'].includes(value))throw Error('도움받을 작업을 선택해 주세요.');}
        else throw Error('요청 내용을 확인해 주세요.');
        state.assistance[key]=value;
      }
      state.assistance.result=null;state.assistance.error=null;emit('assist-input');
    }
    async function assist(){
      if(pendingAssist)return pendingAssist;
      editable();if(!state.loaded)throw Error('현황 분석을 먼저 불러와 주세요.');
      const target=state.plans.find(item=>item._key===state.activeKey),settings=state.assistance;
      const mode=target?settings.mode:'draft',kind=target?.kind||settings.kind,instruction=settings.instruction.trim();
      if(!instruction)throw Error('헤르미에게 요청할 내용을 입력해 주세요.');
      if(!target&&mode!=='draft')throw Error('수정하거나 검토할 대응안을 선택해 주세요.');
      const snapshot=target?stable(cleanPlan(target)):null,targetKey=target?._key||null,requestSettings=stable({instruction:settings.instruction,mode:settings.mode,kind:settings.kind});
      const current_plan=target?{kind:target.kind,...Object.fromEntries(FIELDS.map(field=>[field,target[field]])),program_reference:target.program_reference?copy(target.program_reference):null,...reviewData(target)}:null;
      const body={mode,kind,instruction,...(current_plan?{current_plan}:{})};
      settings.error=null;settings.result=null;state.error=null;state.busy='assist';emit('busy');
      pendingAssist=(async()=>{
        try{
          const response=await ask(path+'/response-workspace/assist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
          const sameScope=response?.scope&&['region_code','month','sex_code','age_code'].every(field=>(response.scope[field]??null)===(state.analysis.scope[field]??null));
          if(response?.analysis_report_id!==analysisReportId||!sameScope||response.status!=='completed'||response.mode!==mode||response.kind!==kind||response.model_called!==true)throw Error('같은 분석에 대한 헤르미의 제안인지 확인하지 못했습니다.');
          for(const key of ['review_notes','limitations','evidence_ids'])if(!Array.isArray(response[key])||response[key].some(value=>typeof value!=='string'))throw Error('헤르미의 응답 형식을 확인하지 못했습니다.');
          if(mode==='review'){if(response.suggestion!==null)throw Error('검토 응답 형식을 확인하지 못했습니다.');}
          else{
            const proposal=response.suggestion;
            if(!proposal||typeof proposal!=='object'||Array.isArray(proposal)||Object.keys(proposal).sort().join('|')!==['checks','content','rationale','target','title'].join('|'))throw Error('초안 제안 형식을 확인하지 못했습니다.');
            for(const key of ['title','target','rationale','content','checks'])if(typeof proposal[key]!=='string'||Array.from(proposal[key]).length>FIELD_LIMITS[key])throw Error('초안 제안의 입력 범위를 확인하지 못했습니다.');
          }
          const current=state.plans.find(item=>item._key===targetKey);
          if(state.activeKey!==targetKey||targetKey&&(current?stable(cleanPlan(current)):null)!==snapshot||stable({instruction:settings.instruction,mode:settings.mode,kind:settings.kind})!==requestSettings)throw Error('요청 후 대응안이나 요청 내용이 바뀌었습니다. 현재 내용으로 다시 요청해 주세요.');
          settings.result={...copy(response),targetKey,snapshot};emit('assisted');return settings.result;
        }catch(error){settings.error=error.message;emit('assist-error');throw error;}
        finally{state.busy=null;pendingAssist=null;emit('idle');}
      })();return pendingAssist;
    }
    function applyAssistance(){
      editable();const result=state.assistance.result;
      if(!result?.suggestion)throw Error('반영할 초안 제안을 먼저 받아 주세요.');
      const target=state.plans.find(item=>item._key===result.targetKey);
      if(state.activeKey!==result.targetKey||result.targetKey&&(target?stable(cleanPlan(target)):null)!==result.snapshot)throw Error('대응안이 바뀌었습니다. 현재 내용으로 다시 요청해 주세요.');
      // Model text may only change prose; confirmation records and catalog references stay user-owned.
      const plan=target||add(result.kind);
      edit(plan._key,copy(result.suggestion));state.assistance.result=null;emit('assist-applied');return plan;
    }
    return {get state(){return state;},get dirty(){return dirty();},get selected(){return selected();},load,add,edit,activate,save,generate,readReport,searchNeeds,importCandidate,setAssistance,assist,applyAssistance,restoreDraft,discardDraft,dispose,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},snapshot:()=>editSnapshot(state.plans)};
  }
  const singleScope=scope=>scope&&/^\d{5}$/.test(scope.region_code||'')&&/^\d{4}(0[1-9]|1[0-2])$/.test(scope.month||'')&&['MAN','WMAN'].includes(scope.sex_code)&&['20G','30G','40G','50G','60GU'].includes(scope.age_code);
  const confirmedNeeds=plan=>(plan.support_needs||[]).filter(item=>item.status==='confirmed'&&item.text.trim()&&item.evidence.trim());
  const months=value=>/^\d{6}$/.test(value||'')?value.slice(0,4)+'년 '+Number(value.slice(4))+'월':String(value||'관측월 미확인');
  const group=scope=>`${scope?.sex_code==='MAN'?'남성':scope?.sex_code==='WMAN'?'여성':'전체 성별'} · ${{'20G':'20대','30G':'30대','40G':'40대','50G':'50대','60GU':'60세 이상'}[scope?.age_code]||'전체 연령'}`;
  const region=report=>report?.region_name||report?.context?.i5?.record?.region_name||(report?.assessments||[]).find(row=>row.observation?.region_name)?.observation.region_name||report?.scope?.region_code||'지역';
  const dateText=value=>{if(!value)return '';const date=new Date(value);return Number.isNaN(date.getTime())?'':date.toLocaleString('ko-KR',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'});};
  function lifecycleHTML(analysis){
    const guide=analysis?.lifecycle_interpretation;if(!guide)return '';
    const source=guide.source||{},pages=Array.isArray(source.pages)?source.pages.join('·'):source.pages;
    return `<details class="hrw-lifecycle"><summary>생애주기 해석 참고 · 지원 필요 미확인</summary><p>원본 현황 분석의 문헌 해석은 추가 확인할 질문을 제안합니다. 연령·지역 집계만으로 지원 필요나 사업 자격을 확정하지 않습니다.</p><p>${esc(source.title||'원본 분석의 문헌 출처')}${source.year?` · ${esc(source.year)}년`:''}${pages?` · 본문 ${esc(pages)}쪽`:''}</p><p>활동 범주는 그대로 유지하며, 확인한 필요는 아래에 사용자가 직접 기록합니다.</p></details>`;
  }
  function reviewInputsHTML(plan){
    const data=reviewData(plan),needs=new Map(data.support_needs.map(item=>[item.category_code,item]));
    const entry=(key,label,item,need=false)=>{
      const family=need?'support_needs':'policy_review',attrs=`data-hrw-review-group="${family}" data-hrw-review-key="${key}"`;
      return `<details class="hrw-review-item"><summary>${label}<span data-hrw-review-status="${family}:${key}">${esc(REVIEW_STATUS[item.status])}</span></summary><label class="hrw-field"><span>${label} 확인 상태</span><select ${attrs} data-hrw-review-field="status">${Object.entries(REVIEW_STATUS).filter(([status])=>!need||status!=='not_applicable').map(([status,title])=>`<option value="${status}" ${status===item.status?'selected':''}>${title}</option>`).join('')}</select></label><label class="hrw-field"><span>${need?'확인한 필요 또는 확인할 질문':'검토 내용 또는 확인할 질문'}</span><textarea ${attrs} data-hrw-review-field="text" rows="2" maxlength="2000">${esc(item.text)}</textarea></label><label class="hrw-field"><span>직접 확인한 근거</span><small>확인한 원문·상담 내용·시점 등을 기록해 주세요. 사용자 확인 상태를 선택하면 내용과 근거가 모두 필요합니다.</small><textarea ${attrs} data-hrw-review-field="evidence" rows="2" maxlength="2000">${esc(item.evidence)}</textarea></label></details>`;
    };
    return `<section class="hrw-policy-review"><h4>사업 적용 전 네 가지 검토</h4><p class="hrw-review-note">${REVIEW_NOTE}</p>${Object.entries(REVIEW_FIELDS).map(([key,label])=>entry(key,label,data.policy_review[key])).join('')}<p class="hrw-review-note">이용 경로에서는 거리·시간·신청 접근성을, 비용에서는 재원·본인부담·이용 비용을 확인해 주세요.</p><details class="hrw-support-needs"><summary>지원 필요 확인 기록 · 9개 분야</summary><p class="hrw-review-note">모든 분야는 미확인에서 시작합니다. 생애주기별 고정 순위가 없으며, 확인된 필요가 있는 분야만 기록해 주세요. 입력 내용으로 사업 자격을 자동 판정하지 않습니다. 저장 후 아래 버튼을 눌러야 확인한 필요로 사업을 조회합니다.</p>${Object.entries(NEED_FIELDS).map(([key,label])=>entry(key,label,needs.get(key)||reviewEntry(),true)).join('')}</details><div data-hrw-support-search></div></section>`;
  }
  function reviewReportHTML(plan){
    const data=reviewData(plan);
    const item=(label,value)=>`<div><dt>${esc(label)} · ${esc(REVIEW_STATUS[value.status])}</dt><dd>${esc(value.text||'미확인')}<small>사용자 입력 근거: ${esc(value.evidence||'미기재')}</small></dd></div>`;
    return `<section class="hrw-report-review"><h5>지원 필요 확인 기록</h5><p>${REVIEW_NOTE}</p>${data.support_needs.length?`<dl>${data.support_needs.map(need=>item(NEED_FIELDS[need.category_code],need)).join('')}</dl>`:'<p>확인된 지원 필요가 입력되지 않았습니다. 연령·지역 집계로 지원 필요를 확정하지 않습니다.</p>'}<h5>사업 적용 전 네 가지 검토</h5><dl>${Object.entries(REVIEW_FIELDS).map(([key,label])=>item(label,data.policy_review[key])).join('')}</dl><p>검토 틀 참고: 생애주기별 사회적 고립 및 외로움 실태와 정책 과제, 본문 39–40·52쪽. 이용 비용과 접근성은 별도 확인합니다.</p></section>`;
  }
  function supportSearchHTML(plan,scope,record,busy=false){
    if(!plan)return '';
    const needs=confirmedNeeds(plan),single=singleScope(scope);
    const intro=single?`사용자 확인 기록 ${needs.length}개 분야로 사업 후보를 찾습니다. 기록을 저장한 뒤 버튼을 누르면 조회합니다.`:'성별과 연령 집단을 선택한 현황 분석에서 지원 필요를 확인해 주세요. 전체 집단을 임의의 한 집단으로 바꾸지 않습니다.';
    let result='';
    if(record?.status==='loading')result='<p role="status">기록한 필요에 맞는 사업 후보를 확인하고 있습니다.</p>';
    else if(record?.status==='error')result=`<p class="hrw-search-error" role="alert">${esc(record.error)}</p>`;
    else if(record?.status==='held')result=`<div class="hrw-search-held" role="status"><p><b>사업 탐색 보류</b></p><ul>${(record.reasons||[]).map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p>탐색을 마치지 못한 상태입니다. 정상 완료 0건이나 사업 부재를 뜻하지 않습니다. 보류된 후보는 대응안으로 가져올 수 없습니다.</p></div>`;
    else if(record?.status==='complete'){
      result=`<p>${record.programs.length}개 검토 후보 · 개인 지원 자격과 현재 이용 가능 여부는 미확인${record.asOf?` · 사업 검토 기준일 ${esc(record.asOf)}`:''}</p>`;
      if(!record.programs.length)result+='<p>현재 조회 범위에서 연결된 후보가 없습니다. 검색 조건·등록 범위·연결 기준을 확인해야 하며, 사업이 없다는 뜻은 아닙니다.</p>';
      if(record.coverage?.truncated)result+='<p>조회 한도로 일부 후보만 검토했습니다. 전체 사업 목록을 모두 확인한 결과가 아닙니다.</p>';
      result+=`<ul class="hrw-search-candidates">${record.programs.map((program,index)=>`<li><b>${esc(program.title||'사업명 확인 필요')}</b><p>${esc(program.support_content||'지원 내용 확인 필요')}</p><small>${esc(program.institution||program.source?.name||'담당기관 확인 필요')}${program.is_synthetic?' · 예시 자료':''}</small>${program.unconfirmed_conditions?.length?`<p>확인할 조건: ${program.unconfirmed_conditions.map(esc).join(' · ')}</p>`:''}${safeURL(program.source_url)?`<a href="${esc(safeURL(program.source_url))}" target="_blank" rel="noopener noreferrer">사업 원문 확인</a>`:''}<button type="button" data-hrw-import-candidate="${index}" data-hrw-candidate-plan="${esc(plan._key)}">기존 사업 활용 초안으로 가져오기</button></li>`).join('')}</ul>`;
    }
    return `<div class="hrw-support-search"><p>${intro}</p><button type="button" data-hrw-search-needs="${esc(plan._key)}" ${busy||!single?'disabled':''}>확인한 필요로 사업 찾기</button>${result}</div>`;
  }
  function contextHTML(analysis){
    if(!analysis)return '<p class="hrw-muted">분석 불러오는 중</p>';
    const investigation=analysis.context_investigation,sources=investigation?.sources||[];
    const categories=[...new Set((analysis.assessments||[]).map(item=>item.category_label))];
    return `<p class="hrw-context-region">${esc(region(analysis))}</p><p class="hrw-muted">${esc(months(analysis.scope?.month))}<br> ${esc(group(analysis.scope))}</p>${categories.length?`<ul class="hrw-context-categories">${categories.map(label=>`<li>${esc(label)}</li>`).join('')}</ul>`:''}${analysis.context_investigation_status==='not_performed'?'<p class="hrw-context-note">원인 조사 미완료</p>':''}<details><summary>분석 근거</summary>${investigation?.summary?`<p>${esc(investigation.summary)}</p>`:''}<p>활동 범주는 개인의 고립 판정이 아닙니다.</p>${sources.length?`<ul>${sources.map(source=>`<li>${safeURL(source.url)?`<a href="${esc(safeURL(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.title||'출처')}</a>`:esc(source.title||'출처')}<small>${esc(source.reference_period||'대상 기간 미확인')}</small></li>`).join('')}</ul>`:''}</details>${lifecycleHTML(analysis)}`;
  }
  function planListHTML(plans,activeKey){return plans.length?`<div class="hrw-plan-list">${plans.map(plan=>`<div class="hrw-plan-row ${plan._key===activeKey?'is-active':''}" data-hrw-row="${esc(plan._key)}"><label class="hrw-select" title="보고서에 포함"><input type="checkbox" data-hrw-select="${esc(plan._key)}" ${plan.selected?'checked':''} aria-label="${esc(plan.title)} 보고서에 포함"></label><button type="button" data-hrw-activate="${esc(plan._key)}" aria-pressed="${plan._key===activeKey}"><span>${esc(KINDS[plan.kind])}</span><b>${esc(plan.title)}</b><small>${plan.plan_id?'저장됨':'초안'}${plan.version?' · '+plan.version+'차':''}</small></button></div>`).join('')}</div>`:'';}
  function assistanceHTML(state){
    const settings=state.assistance,plan=state.plans.find(item=>item._key===state.activeKey),busy=state.busy==='assist',result=settings.result;
    const applicable=result?.suggestion&&state.activeKey===result.targetKey&&(!result.targetKey||stable(cleanPlan(plan))===result.snapshot);
    const kind=plan?.kind||settings.kind,mode=plan?settings.mode:'draft';
    const label={draft:'초안 제안받기',revise:'수정 제안받기',review:'검토받기'}[mode];
    return `<section class="hrw-assistance" aria-label="헤르미에게 도움받기"><div class="hrw-assist-heading"><h3>헤르미에게 도움받기</h3><span>현재 분석 기준</span></div><div class="hrw-assist-controls">${plan?`<select data-hrw-assist-setting="mode" aria-label="도움받을 작업">${Object.entries({draft:'초안 제안',revise:'내용 수정',review:'검토'}).map(([key,value])=>`<option value="${key}" ${mode===key?'selected':''}>${value}</option>`).join('')}</select>`:`<select data-hrw-assist-setting="kind" aria-label="제안할 대응안 유형">${Object.entries(KINDS).map(([key,value])=>`<option value="${key}" ${kind===key?'selected':''}>${value}</option>`).join('')}</select>`}</div><textarea data-hrw-assist-instruction rows="2" maxlength="2000" aria-label="헤르미에게 요청" placeholder="예: 이 분석에 맞는 대응안 초안을 제안해 줘">${esc(settings.instruction)}</textarea><div class="hrw-assist-actions"><button type="button" data-hrw-assist ${state.busy||!settings.instruction.trim()?'disabled':''}>${busy?'헤르미가 검토 중…':label}</button></div>${settings.error?`<p class="hrw-assist-error" role="alert">${esc(settings.error)}</p>`:''}${result?`<div class="hrw-assist-result" role="status"><h4>${result.suggestion?'헤르미의 제안':'헤르미의 검토'}</h4>${result.suggestion?`<dl>${[['title','이름'],['target','대상'],['rationale','분석 연결'],['content','실행 내용'],['checks','확인할 사항']].map(([key,title])=>`<div><dt>${title}</dt><dd>${esc(result.suggestion[key])}</dd></div>`).join('')}</dl>`:''}${result.review_notes.length?`<ul>${result.review_notes.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`:''}${result.limitations.length?`<details><summary>확인할 제약</summary><ul>${result.limitations.map(value=>`<li>${esc(value)}</li>`).join('')}</ul></details>`:''}${result.suggestion?`<button type="button" data-hrw-assist-apply ${!applicable||state.busy?'disabled':''}>대응안에 반영</button><small>확인 기록은 유지됩니다. 반영 후 저장해 주세요.</small>`:''}</div>`:''}</section>`;
  }
  function editorHTML(plan){
    if(!plan)return '';
    const field=(key,label,hint,rows=3)=>`<label class="hrw-field"><span>${label}${['title','target','content'].includes(key)?'<em>필수</em>':''}</span>${rows===1?`<input data-hrw-field="${key}" value="${esc(plan[key])}" maxlength="${key==='title'?200:2000}">`:`<textarea data-hrw-field="${key}" rows="${rows}" maxlength="${key==='content'?8000:key==='target'?2000:4000}">${esc(plan[key])}</textarea>`}</label>`;
    const reference=plan.program_reference;
    return `<fieldset class="hrw-editor-fields"><div class="hrw-editor-heading"><div><p class="hrw-muted">${esc(KINDS[plan.kind])}</p><h3>대응안 다듬기</h3></div><span class="hrw-version">${plan.version?'저장본 '+plan.version+'차':'새 초안'}</span></div>${plan._import_note?`<p class="hrw-import-note" role="status">${esc(plan._import_note)}</p>`:''}${reference?`<div class="hrw-program-reference"><b>선택한 복지사업</b><p>${safeURL(reference.url)?`<a href="${esc(safeURL(reference.url))}" target="_blank" rel="noopener noreferrer">${esc(reference.title)}</a>`:esc(reference.title)}</p><small>${esc(reference.publisher||'기관 확인 필요')} · 적용 대상과 현재 접수 여부는 별도 확인해 주세요.</small></div>`:''}${field('title','대응안 이름','다른 대응안과 구분할 수 있는 이름을 적어 주세요.',1)}<label class="hrw-field"><span>대응안 유형</span><select data-hrw-field="kind">${Object.entries(KINDS).map(([key,value])=>`<option value="${key}" ${plan.kind===key?'selected':''}>${value}</option>`).join('')}</select></label><div class="hrw-field-pair">${field('target','대상과 범위','어느 지역의 어떤 집단을 검토하나요?',2)}${field('rationale','분석과 연결한 이유','관측 사실과 확인할 가설을 구분해 주세요.',2)}</div>${field('content','실행 내용','누가, 무엇을, 어떤 방식으로 진행할지 정리해 주세요.',5)}${field('checks','실행 전 확인할 사항','사업 조건·현장 수요·담당기관·예산 등',3)}${reviewInputsHTML(plan)}${field('feedback','검토 의견','이번 수정에 반영한 의견을 함께 남길 수 있습니다.',2)}${plan.history?.length?`<details class="hrw-history"><summary>저장·수정 이력 ${plan.history.length}건</summary><ol>${plan.history.map(item=>`<li><b>${esc(item.version||'이전')}차 저장</b> <span>${esc(dateText(item.updated_at||item.created_at))}</span>${item.feedback?`<p>${esc(item.feedback)}</p>`:''}</li>`).join('')}</ol></details>`:''}</fieldset>`;
  }
  function selectedHTML(plans,reports){const chosen=plans.filter(plan=>plan.selected);return `<h3>최종 보고서에 담을 대응안</h3><p class="hrw-selection-count"><b>${chosen.length}</b>개 선택</p>${chosen.length?`<ol class="hrw-selected-list">${chosen.map(plan=>`<li data-hrw-selected-name="${esc(plan._key)}">${esc(plan.title)}</li>`).join('')}</ol>`:'<p class="hrw-muted">대응안을 선택해 주세요.</p>'}${reports.length?`<div class="hrw-past-reports"><h3>저장된 대응 보고서</h3>${reports.map(report=>`<button type="button" data-hrw-report="${esc(report.report_id)}"><span>${esc(report.title||'맞춤형 예방 대응 보고서')}</span><small>${esc(dateText(report.created_at))}</small></button>`).join('')}</div>`:''}`;}
  function reportHTML(report,analysisFallback=null){
    const analysis=report.analysis_snapshot||analysisFallback||{},scope=analysis.scope||report.scope||{},plans=report.selected_plans;
    const title=report.title||'맞춤형 예방 대응 보고서';
    const heading=`<div class="hrw-report-heading"><div><p class="hrw-muted">두 번째 산출물 · 검토용 보고서</p><h3>${esc(title)}</h3></div><span>서버에 저장됨</span></div><p class="hrw-report-intro">선택한 대응안의 저장된 버전을 묶었습니다. 이후 초안을 수정해도 이 보고서의 내용은 바뀌지 않습니다.</p>`;
    if(!Array.isArray(plans))return heading+`<div class="hrw-report-paper">${window.HERMI_ANSWER?.blocks?window.HERMI_ANSWER.blocks(report.markdown):`<pre>${esc(report.markdown)}</pre>`}</div>`;
    const research=analysis.context_investigation,sources=research?.sources||[];
    const summary=research?.summary||[...new Set((analysis.assessments||[]).map(row=>row.category_label))].join(' · ')||'저장된 현황 분석을 바탕으로 작성한 대응 검토안입니다.';
    const field=(label,value)=>`<div><dt>${label}</dt><dd>${esc(value?.trim?.()||'아직 기재하지 않았습니다.')}</dd></div>`;
    return heading+`<article class="hrw-report-paper hrw-report-structured"><dl class="hrw-report-meta"><div><dt>검토 지역·집단</dt><dd>${esc(report.region_name||region(analysis))}<br>${esc(group(scope))}</dd></div><div><dt>관측 기준</dt><dd>${esc(months(scope.month))}</dd></div><div><dt>작성일</dt><dd>${esc(dateText(report.created_at)||'작성일 미확인')}</dd></div><div><dt>선택한 대응안</dt><dd>${plans.length}개</dd></div></dl><section class="hrw-report-analysis"><h4>대응안의 출발점</h4><p>${esc(summary)}</p>${lifecycleHTML(analysis)}</section><div class="hrw-report-plans">${plans.map((plan,index)=>`<section class="hrw-report-plan"><header><div><p>${index+1}. ${esc(KINDS[plan.kind]||'대응안')}</p><h4>${esc(plan.title)}</h4></div><span>저장된 ${esc(plan.version||1)}차 수정본</span></header><dl>${field('대상과 범위',plan.target)}${field('분석과 연결한 이유',plan.rationale)}${field('실행 내용',plan.content)}${field('실행 전 확인할 사항',plan.checks)}${field('반영한 검토 의견',plan.feedback)}</dl>${reviewReportHTML(plan)}${plan.program_reference?`<div class="hrw-report-program"><b>선택한 복지사업</b><p>${safeURL(plan.program_reference.url)?`<a href="${esc(safeURL(plan.program_reference.url))}" target="_blank" rel="noopener noreferrer">${esc(plan.program_reference.title)}</a>`:esc(plan.program_reference.title)}</p><small>${esc(plan.program_reference.publisher||'담당기관 확인 필요')} · 적용 조건과 현재 접수 여부는 별도 확인이 필요합니다.</small></div>`:''}</section>`).join('')}</div>${report.limitations?.length?`<section class="hrw-report-limits"><h4>실행 전 함께 확인해 주세요</h4><ul>${report.limitations.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></section>`:''}<details class="hrw-report-appendix"><summary>분석 근거·출처·저장 정보</summary>${sources.length?`<ul>${sources.map(source=>`<li>${safeURL(source.url)?`<a href="${esc(safeURL(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.title||'근거 자료')}</a>`:esc(source.title||'근거 자료')}<small>${esc(source.publisher||'발행기관 미확인')} · ${esc(source.reference_period||'자료 대상 기간 미확인')}</small></li>`).join('')}</ul>`:'<p>이 현황 분석에 등록된 외부 출처가 없습니다. 원인 가설과 실행 필요성을 추가로 확인해 주세요.</p>'}<dl class="hrw-report-records"><div><dt>연결된 현황 보고서</dt><dd>${esc(report.analysis_report_id)}</dd></div><div><dt>저장한 대응안 묶음</dt><dd>${esc(report.workspace_version||'')}차</dd></div>${Object.entries(analysis.provenance||{}).map(([family,value])=>`<div><dt>${esc(family==='activity'?'활동 자료 버전':family==='survey'?'지역 배경 자료 버전':family)}</dt><dd>${esc(value.run_id||'미확인')}<small>${esc(value.manifest_sha256||'')}</small></dd></div>`).join('')}</dl></details><details class="hrw-report-original"><summary>저장된 보고서 전문 보기</summary><pre>${esc(report.markdown)}</pre></details></article>`;
  }
  function recoveryHTML(state){
    const draft=state.recovery;
    if(!draft)return state.localDraftStatus==='unavailable'&&state.loaded?'<p class="hrw-storage-notice" role="status">이 브라우저에서는 임시 저장을 사용할 수 없습니다. 이동하기 전에 변경 내용을 저장해 주세요.</p>':'';
    const preview=draft.plans.map((plan,index)=>{
      const record=(label,item)=>`${label} · ${REVIEW_STATUS[item?.status]||'미확인'}\n확인 내용: ${item?.text||''}\n직접 확인한 근거: ${item?.evidence||''}`;
      const reference=plan.program_reference;
      return [`${index+1}. ${plan.title}`,`유형: ${KINDS[plan.kind]||plan.kind}`,`보고서 선택: ${plan.selected?'보고서에 포함':'보고서에 포함하지 않음'}`,
        ...[['대상과 범위','target'],['분석과 연결한 이유','rationale'],['실행 내용','content'],['실행 전 확인할 사항','checks'],['검토 의견','feedback']].map(([label,field])=>`${label}: ${plan[field]||''}`),
        reference?`참조 사업: ${reference.title}\n담당기관: ${reference.publisher||''}\n원문: ${reference.url||''}`:'참조 사업: 없음',
        ...Object.entries(REVIEW_FIELDS).map(([key,label])=>record(label,plan.policy_review?.[key])),
        ...(plan.support_needs||[]).map(item=>record(NEED_FIELDS[item.category_code]||item.category_code,item))].join('\n\n');
    }).join('\n\n────────────────\n\n');
    return `<section class="hrw-recovery" aria-label="임시 초안 복구"><div><h3>${draft.conflict?'최신 저장본과 임시 초안이 있습니다':'저장하지 않은 초안이 남아 있어요'}</h3><p>${draft.conflict?'서버의 내용이 바뀌어 자동으로 덮어쓰지 않습니다. 아래 임시 초안에서 필요한 내용을 복사한 뒤 현재 저장본으로 계속해 주세요.':'이 기기에 임시 보관한 내용입니다. 복구한 뒤 변경 내용을 저장하면 보고서 이력에 보관됩니다.'}</p><p>현재 저장본으로 계속하면 이 임시 초안이 이 브라우저에서 삭제됩니다. 보관할 내용은 먼저 아래에서 복사해 주세요.</p></div><div class="hrw-recovery-actions">${draft.conflict?'':'<button type="button" class="hrw-primary" data-hrw-restore-draft>초안 복구</button>'}<button type="button" data-hrw-discard-draft>임시 초안 삭제하고 현재 저장본으로 계속</button></div><details${draft.conflict?' open':''}><summary>임시 초안 전체 내용 확인 · ${esc(dateText(draft.saved_at))}</summary><pre>${esc(preview)}</pre><label class="hrw-field">전체 초안 보관용 JSON · 모두 선택해 복사할 수 있습니다<textarea data-hrw-recovery-export readonly rows="8" spellcheck="false">${esc(JSON.stringify(draft,null,2))}</textarea></label></details></section>`;
  }
  let dialog,controller,unsubscribe,trigger,view='plans',pendingClose=null,loadSerial=0,addMenuOpen=false;
  function mount(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='hrw-dialog';dialog.setAttribute('aria-labelledby','hrw-title');
    dialog.innerHTML=`<header class="hrw-header"><div><p class="hrw-header-context" data-hrw-heading-context>현황 분석에서 이어서</p><h2 id="hrw-title">지역 맞춤 예방 대응안</h2></div><button type="button" class="hrw-close" data-hrw-close aria-label="대응안 작업 닫기">닫기</button></header><nav class="hrw-view-nav" aria-label="대응안 작업 단계"><button type="button" data-hrw-view="plans" class="is-active">대응안 편집·선택</button><button type="button" data-hrw-view="report" disabled>최종 보고서</button><span data-hrw-save-badge class="hrw-save-badge">불러오는 중</span></nav><div class="hrw-status" data-hrw-status role="status" aria-live="polite"></div><div class="hrw-error" data-hrw-error role="alert" hidden></div><div class="hrw-close-prompt" data-hrw-close-prompt role="alertdialog" aria-labelledby="hrw-close-title" hidden><div><h3 id="hrw-close-title">아직 저장하지 않은 내용이 있습니다</h3><p>수정 내용과 선택을 저장하고 이동할 수 있습니다.</p></div><div class="hrw-close-actions"><button type="button" data-hrw-continue>계속 편집</button><button type="button" data-hrw-discard>저장하지 않고 이동</button><button type="button" class="hrw-primary" data-hrw-save-close>저장하고 이동</button></div></div><div data-hrw-recovery></div><div class="hrw-layout" data-hrw-layout><aside class="hrw-context" data-hrw-context aria-label="원래 현황 분석"></aside><main class="hrw-main"><section aria-label="대응안 목록"><div class="hrw-section-heading"><h3>검토할 대응안</h3><span data-hrw-plan-count></span></div><div data-hrw-plans></div><button type="button" class="hrw-add-toggle" data-hrw-add-toggle hidden>+ 대응안 추가</button><div class="hrw-add-actions" data-hrw-add-actions aria-label="대응안 추가">${Object.entries(KINDS).map(([kind,label])=>`<button type="button" data-hrw-add="${kind}">+ ${label}</button>`).join('')}</div></section><div data-hrw-assistance></div><section class="hrw-editor" data-hrw-editor aria-label="선택한 대응안 편집"></section></main><aside class="hrw-selection" data-hrw-selection aria-label="보고서 선택 요약"></aside></div><section class="hrw-report-view" data-hrw-report-view hidden></section><footer class="hrw-footer"><p data-hrw-footer-note>수정한 내용은 저장 버튼을 눌러 서버에 보관합니다.</p><div><button type="button" data-hrw-secondary>분석으로 돌아가기</button><button type="button" class="hrw-primary" data-hrw-primary disabled>불러오는 중</button></div></footer>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();tryClose();});
    function editReviewInput(target){
      const {hrwReviewGroup:family,hrwReviewKey:key,hrwReviewField:field}=target.dataset||{};
      if(!family||!key||!field)return false;
      const value=target.value;
      if(family==='policy_review')controller.edit(controller.state.activeKey,{policy_review:{[key]:{[field]:value}}});
      else if(family==='support_needs')controller.edit(controller.state.activeKey,{support_needs:[{category_code:key,[field]:value}]});
      else return false;
      if(field==='status'){
        const badge=dialog.querySelector(`[data-hrw-review-status="${family}:${key}"]`);
        if(badge)badge.textContent=REVIEW_STATUS[value]||'미확인';
      }
      return true;
    }
    dialog.addEventListener('input',event=>{if(!controller)return;try{if(event.target.hasAttribute('data-hrw-assist-instruction')){controller.setAssistance({instruction:event.target.value});return;}if(event.target.dataset?.hrwReviewField){if(event.target.tagName!=='SELECT')editReviewInput(event.target);return;}const field=event.target.dataset?.hrwField;if(field)controller.edit(controller.state.activeKey,{[field]:event.target.value});}catch(error){showError(error.message);}});
    dialog.addEventListener('change',event=>{if(!controller)return;try{if(event.target.dataset?.hrwAssistSetting){controller.setAssistance({[event.target.dataset.hrwAssistSetting]:event.target.value});render('assist-setting');return;}if(editReviewInput(event.target))return;const key=event.target.dataset?.hrwSelect;if(key)controller.edit(key,{selected:event.target.checked});}catch(error){showError(error.message);}});
    dialog.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      try {
        if(button.hasAttribute('data-hrw-add')){addMenuOpen=false;controller.add(button.dataset.hrwAdd);render('active');dialog.querySelector('[data-hrw-field="title"]')?.focus();}
        else if(button.hasAttribute('data-hrw-add-toggle')){addMenuOpen=!addMenuOpen;render('add-menu');}
        else if(button.hasAttribute('data-hrw-assist'))await controller.assist();
        else if(button.hasAttribute('data-hrw-assist-apply')){addMenuOpen=false;controller.applyAssistance();}
        else if(button.hasAttribute('data-hrw-search-needs'))await controller.searchNeeds(button.dataset.hrwSearchNeeds);
        else if(button.hasAttribute('data-hrw-import-candidate'))controller.importCandidate(button.dataset.hrwCandidatePlan,Number(button.dataset.hrwImportCandidate));
        else if(button.hasAttribute('data-hrw-activate'))controller.activate(button.dataset.hrwActivate);
        else if(button.hasAttribute('data-hrw-close')||button.hasAttribute('data-hrw-secondary'))tryClose();
        else if(button.hasAttribute('data-hrw-continue'))hideClosePrompt();
        else if(button.hasAttribute('data-hrw-restore-draft'))controller.restoreDraft();
        else if(button.hasAttribute('data-hrw-discard-draft'))controller.discardDraft();
        else if(button.hasAttribute('data-hrw-discard')){controller.state.pendingProgram=null;controller.discardDraft();const action=pendingClose;hideClosePrompt();action?.();}
        else if(button.hasAttribute('data-hrw-save-close')){await controller.save();const action=pendingClose;hideClosePrompt();action?.();}
        else if(button.hasAttribute('data-hrw-reload')){const resume=()=>controller.load().catch(error=>showError(error.message));tryClose(resume);}
        else if(button.hasAttribute('data-hrw-load-retry'))await controller.load();
        else if(button.hasAttribute('data-hrw-report')){await controller.readReport(button.dataset.hrwReport);view='report';render('report');}
        else if(button.hasAttribute('data-hrw-view')){view=button.dataset.hrwView;render('view');}
        else if(button.hasAttribute('data-hrw-primary')){
          if(view==='report'&&controller.state.lastReport)download(controller.state.lastReport);
          else if(controller.dirty){await controller.save();setStatus('변경 내용과 선택을 서버에 저장했습니다.');}
          else {
            const incomplete=controller.selected.find(plan=>!plan.target.trim()||!plan.content.trim());
            if(incomplete){controller.activate(incomplete._key);const field=!incomplete.target.trim()?'target':'content';dialog.querySelector(`[data-hrw-field="${field}"]`)?.focus();throw Error(field==='target'?'선택한 대응안의 대상과 범위를 입력하고 저장해 주세요.':'선택한 대응안의 실행 내용을 입력하고 저장해 주세요.');}
            await controller.generate();view='report';render('report');setStatus('선택한 대응안으로 보고서를 만들고 서버에 저장했습니다.');
          }
        }
      }catch(error){if(!button.hasAttribute('data-hrw-assist')||!controller.state.assistance.error)showError(error.message);}
    });
  }
  function showError(message){const box=dialog?.querySelector('[data-hrw-error]');if(box){box.textContent=message;box.hidden=false;}}
  function setStatus(message){const box=dialog?.querySelector('[data-hrw-status]');if(box)box.textContent=message;}
  function hideClosePrompt(){pendingClose=null;dialog.querySelector('[data-hrw-close-prompt]').hidden=true;}
  function close(){dialog.close();controller?.dispose();trigger?.focus?.();}
  function tryClose(action=close){if(controller?.state.busy){setStatus('진행 중인 작업이 끝난 뒤 이동해 주세요.');return;}if(controller?.dirty){pendingClose=action;dialog.querySelector('[data-hrw-close-prompt]').hidden=false;dialog.querySelector('[data-hrw-continue]').focus();}else action();}
  function render(type='full') {
    if(!dialog||!controller)return;
    const state=controller.state,dirty=controller.dirty,busy=Boolean(state.busy),blocked=Boolean(state.recovery),plan=state.plans.find(item=>item._key===state.activeKey);
    const recoveryBox=dialog.querySelector('[data-hrw-recovery]');if(recoveryBox)recoveryBox.innerHTML=recoveryHTML(state);
    const isInput=type==='edit'||type==='assist-input';
    dialog.querySelector('[data-hrw-heading-context]').textContent=state.analysis?`${region(state.analysis)} ${months(state.analysis.scope?.month)} · ${group(state.analysis.scope)}`:'현황 분석에서 이어서';
    const error=dialog.querySelector('[data-hrw-error]');error.hidden=!state.error;if(state.error)error.textContent=state.error;
    if(state.conflict){error.hidden=false;error.innerHTML=`<p>${esc(state.error||'다른 화면에서 더 최근 내용을 저장했습니다.')}</p><p>입력한 내용은 유지했습니다. 최신 저장본을 불러오기 전에 필요한 내용을 복사해 주세요.</p><button type="button" data-hrw-reload>최신 저장본 불러오기</button>`;}
    if(!isInput){dialog.querySelector('[data-hrw-context]').innerHTML=contextHTML(state.analysis);dialog.querySelector('[data-hrw-plans]').innerHTML=planListHTML(state.plans,state.activeKey);dialog.querySelector('[data-hrw-editor]').innerHTML=editorHTML(plan);}
    else {for(const row of dialog.querySelectorAll('[data-hrw-row]')){const item=state.plans.find(value=>value._key===row.dataset.hrwRow);if(item){row.querySelector('b').textContent=item.title;row.querySelector('input').checked=item.selected;row.querySelector('button > span').textContent=KINDS[item.kind];}}}
    const searchBox=dialog.querySelector('[data-hrw-support-search]');if(searchBox)searchBox.innerHTML=supportSearchHTML(plan,state.analysis?.scope,state.supportSearches[plan?._key],busy);
    const assistBox=dialog.querySelector('[data-hrw-assistance]');if(!isInput)assistBox.innerHTML=assistanceHTML(state);
    if(type==='assist-input'){assistBox.querySelector('.hrw-assist-result')?.remove();assistBox.querySelector('.hrw-assist-error')?.remove();}
    const assistButton=dialog.querySelector('[data-hrw-assist]');if(assistButton)assistButton.disabled=busy||blocked||!state.assistance.instruction.trim();
    const applyButton=dialog.querySelector('[data-hrw-assist-apply]'),proposal=state.assistance.result;if(applyButton)applyButton.disabled=busy||blocked||!proposal||state.activeKey!==proposal.targetKey||Boolean(proposal.targetKey&&stable(cleanPlan(plan))!==proposal.snapshot);
    const addActions=dialog.querySelector('[data-hrw-add-actions]'),addToggle=dialog.querySelector('[data-hrw-add-toggle]');addActions.hidden=Boolean(state.plans.length)&&!addMenuOpen;addToggle.hidden=!state.plans.length;addToggle.textContent=addMenuOpen?'추가 유형 접기':'+ 대응안 추가';addToggle.setAttribute('aria-expanded',String(!addActions.hidden));
    dialog.querySelector('[data-hrw-plan-count]').textContent=state.plans.length?state.plans.length+(state.plans.length>=20?'개 · 추가 가능 수에 도달했습니다':'개'):'';
    dialog.querySelector('[data-hrw-selection]').innerHTML=selectedHTML(state.plans,state.reports);
    const badge=dialog.querySelector('[data-hrw-save-badge]');badge.textContent=busy?({load:'불러오는 중',save:'저장 중',report:'보고서 작성 중',search:'사업 후보 조회 중',assist:'헤르미 검토 중'}[state.busy]):dirty?(state.localDraftStatus==='saved'?'이 기기에 임시 저장됨':'저장하지 않은 변경 있음'):state.loaded?(state.version===0?'대응안 작성 전':'서버에 저장됨'):'불러오기 필요';badge.classList.toggle('is-dirty',dirty&&!busy);
    dialog.querySelector('[data-hrw-layout]').hidden=view==='report';dialog.querySelector('[data-hrw-report-view]').hidden=view!=='report';
    const report=state.lastReport;
    for(const tab of dialog.querySelectorAll('[data-hrw-view]')){tab.classList.toggle('is-active',tab.dataset.hrwView===view);tab.setAttribute('aria-current',tab.dataset.hrwView===view?'step':'false');if(tab.dataset.hrwView==='report')tab.disabled=!report;}
    if(view==='report'&&report)dialog.querySelector('[data-hrw-report-view]').innerHTML=reportHTML(report,state.analysis);
    const primary=dialog.querySelector('[data-hrw-primary]');primary.textContent=busy?({load:'불러오는 중…',save:'저장 중…',report:'보고서 만드는 중…',search:'사업 후보 조회 중…',assist:'헤르미 검토 중…'}[state.busy]):view==='report'&&report?'보고서 내려받기':dirty?'변경 내용 저장':'선택한 대응안으로 보고서 만들기';primary.disabled=busy||blocked||!state.loaded||view!=='report'&&!dirty&&!controller.selected.length;
    dialog.querySelector('[data-hrw-footer-note]').textContent=busy&&state.busy==='save'?'서버의 저장 결과를 확인하고 있습니다.':view==='report'?'이 보고서는 저장된 선택과 수정 내용을 담은 검토안입니다.':dirty?'수정한 내용과 선택을 먼저 저장해 주세요.':controller.selected.length?`${controller.selected.length}개 대응안의 저장된 내용으로 보고서를 만들 수 있습니다.`:'대응안을 추가하고 보고서에 담을 항목을 선택해 주세요.';
    for(const fieldset of dialog.querySelectorAll('fieldset'))fieldset.disabled=busy||blocked;
    for(const field of dialog.querySelectorAll('[data-hrw-assist-instruction],[data-hrw-assist-setting],[data-hrw-add-toggle]'))field.disabled=busy||blocked;
    for(const button of dialog.querySelectorAll('[data-hrw-add],[data-hrw-activate],[data-hrw-select],[data-hrw-report]'))button.disabled=busy||blocked;
    for(const button of dialog.querySelectorAll('[data-hrw-add]'))button.disabled=busy||blocked||state.plans.length>=20;
    if(!state.loaded&&!busy&&state.error){dialog.querySelector('[data-hrw-context]').innerHTML='<p>현황 분석과 저장된 대응안을 불러오지 못했습니다.</p><button type="button" data-hrw-load-retry>다시 불러오기</button>';}
  }
  async function open(id,options={}){
    mount();
    if(dialog.open&&controller?.state.analysisReportId!==id&&controller?.dirty&&!options.discardCurrent){tryClose(()=>open(id,{...options,discardCurrent:true}));return controller;}
    if(dialog.open&&controller?.state.analysisReportId===id){if(options.program){if(controller.state.recovery)controller.state.pendingProgram=options.program;else controller.add('existing_program',options.program);view='plans';render('active');}if(options.reportId){await controller.readReport(options.reportId);view='report';render('report');}return controller;}
    const serial=++loadSerial;unsubscribe?.();controller?.dispose();controller=createController(id);unsubscribe=controller.subscribe(event=>render(event.type));view='plans';addMenuOpen=false;trigger=document.activeElement;hideClosePrompt();
    if(!dialog.open)dialog.showModal();render();
    try {await controller.load();if(serial!==loadSerial)return controller;if(options.program){if(controller.state.recovery)controller.state.pendingProgram=options.program;else controller.add('existing_program',options.program);}if(options.reportId){await controller.readReport(options.reportId);view='report';render('report');}}
    catch(error){showError(error.message);}
    return controller;
  }
  function download(report){
    if(!report||typeof report.markdown!=='string'||!report.markdown.trim())throw Error('내려받을 보고서를 먼저 열어 주세요.');
    const filename=String(report.filename||'HERMES_맞춤형_예방대응_보고서.md').split(/[\\/]/).at(-1).replace(/[\u0000-\u001f<>:"|?*]/g,'_').slice(0,160);
    const url=URL.createObjectURL(new Blob([report.markdown],{type:'text/markdown;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=filename.endsWith('.md')?filename:filename+'.md';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
  }
  async function openReport(id){const report=await request('/api/model/response-reports/'+encodeURIComponent(id));if(report.report_id!==id)throw Error('선택한 보고서와 서버의 응답이 다릅니다.');if(!report.analysis_report_id)throw Error('보고서의 현황 분석 연결을 확인하지 못했습니다.');return open(report.analysis_report_id,{reportId:id});}
  return {open,openReport,download,createController,recoveryHTML,contextHTML,planListHTML,editorHTML,selectedHTML,reportHTML,supportSearchHTML,assistanceHTML,safeURL,KINDS};
})();
