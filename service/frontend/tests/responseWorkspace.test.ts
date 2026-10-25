import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const source=readFileSync(new URL('../../shared/hermi-response-workspace.js',import.meta.url),'utf8');
const base={report_id:'analysis_one',scope:{region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'},context:{i5:{record:{region_name:'춘천시'}}},context_investigation_status:'not_performed',assessments:[{category_label:'우선 검토 후보'}],markdown:'# 현황 보고서'};
const empty=()=>({analysis_report_id:'analysis_one',version:0,plans:[],reports:[],updated_at:null,storage_status:'saved'});
function harness(handler?:(path:string,options?:any)=>any){
 const context=createContext({window:{},URL,Date,JSON,Map,Set,Promise,Error,Number,String});new Script(source).runInContext(context);
 const calls:{path:string;options:any}[]=[];let saved:any=empty();
 const request=async(path:string,options?:any)=>{
  calls.push({path,options});
  if(handler)return handler(path,options);
  if(options?.method==='PUT'){
   const payload=JSON.parse(options.body);
   saved={...saved,version:saved.version+1,updated_at:'2026-10-25T12:00:00Z',plans:payload.plans.map((plan:any,index:number)=>({...plan,plan_id:plan.plan_id||'saved_'+index,version:(saved.plans.find((old:any)=>old.plan_id===plan.plan_id)?.version||0)+1,history:[],changed_fields:['content'],created_at:'2026-10-25'}))};return saved;
  }
  if(options?.method==='POST')return {report_id:'response_one',report_type:'preventive_response',analysis_report_id:'analysis_one',workspace_version:saved.version,scope:base.scope,title:'맞춤형 예방 대응 보고서',markdown:'# 저장된 검토 보고서',selected_plans:saved.plans.filter((plan:any)=>plan.selected),storage_status:'saved',created_at:'2026-10-25'};
  return path.endsWith('/response-workspace')?saved:base;
 };
 const api=context.window.HERMES_RESPONSE_WORKSPACE;
 return {api,calls,controller:api.createController('analysis_one',{request}),setSaved(value:any){saved=value;}};
}
async function ready(){const h=harness();await h.controller.load();return h;}
function addFilled(c:any,title='지역 참여 연결') {const plan=c.add('new_program');c.edit(plan._key,{title,target:'춘천시 남성 20대 검토 집단',rationale:'관측 변화의 배경은 별도 확인합니다.',content:'현장 수요를 확인하고 지역 참여 활동을 검토합니다.'});return plan;}
function assistantResult(mode='draft',kind='new_program') {return {analysis_report_id:'analysis_one',scope:{...base.scope},mode,kind,status:'completed',suggestion:mode==='review'?null:{title:'헤르미 제안',target:'춘천시 남성 20대 검토 집단',rationale:'관측 사실을 참고하되 필요는 별도 확인',content:'수요 확인 후 지역 자원을 검토합니다.',checks:'원문 조건과 현장 수요 확인'},review_notes:['지원 필요는 별도 확인합니다.'],limitations:['원인과 개인 자격은 미확인입니다.'],evidence_ids:['evidence-one'],model_called:true,prompt_version:'response-assistance-1.0'};}
describe('saved response workspace',()=>{
 it('loads the exact saved analysis and its empty workspace without calling a model',async()=>{
  const h=await ready();expect(h.calls.map(call=>call.path)).toEqual(['/api/model/analysis-reports/analysis_one','/api/model/analysis-reports/analysis_one/response-workspace']);
  expect(h.controller.state.analysis.report_id).toBe('analysis_one');expect(h.controller.dirty).toBe(false);expect(h.controller.state.loaded).toBe(true);
 });
 it('rejects a workspace associated with a different analysis',async()=>{
  const h=harness(path=>path.endsWith('/response-workspace')?{...empty(),analysis_report_id:'wrong'}:base);
  await expect(h.controller.load()).rejects.toThrow('저장 범위');expect(h.controller.state.loaded).toBe(false);
 });
 it('keeps draft text while moving between plans',async()=>{
  const {controller:c}=await ready();const first=addFilled(c,'첫 번째 대응안'),second=addFilled(c,'두 번째 대응안');
  c.activate(first._key);expect(c.state.plans[0].title).toBe('첫 번째 대응안');c.activate(second._key);expect(c.state.plans[1].content).toContain('현장 수요');expect(c.dirty).toBe(true);
 });
 it('limits added drafts to the server-supported twenty plans',async()=>{
  const {controller:c}=await ready();for(let i=0;i<20;i++)c.add('new_program');expect(c.state.plans).toHaveLength(20);expect(()=>c.add('new_program')).toThrow('20개까지');expect(c.state.plans).toHaveLength(20);
 });
 it('saves full editable snapshots and strips server and nested reference metadata',async()=>{
  const h=await ready(),c=h.controller;
  h.setSaved({...empty(),version:4,plans:[{plan_id:'old',version:2,kind:'existing_program',title:'저장된 사업',target:'지역 주민',rationale:'',content:'사업 활용 검토',checks:'',feedback:'',selected:true,history:[{version:1}],updated_at:'now',program_reference:{program_version_id:'program_one',title:'원문 사업',url:'https://example.go.kr/notice',publisher:'기관',origin:'catalog',verification_status:'unverified'}}]});
  await c.load();c.edit(c.state.activeKey,{feedback:'검토 의견을 반영합니다.'});await c.save();
  const payload=JSON.parse([...h.calls].reverse().find(call=>call.options?.method==='PUT')!.options.body);
  expect(payload.expected_version).toBe(4);expect(payload.plans[0].version).toBeUndefined();expect(payload.plans[0].history).toBeUndefined();expect(payload.plans[0]._key).toBeUndefined();
  expect(Object.keys(payload.plans[0].program_reference).sort()).toEqual(['program_version_id','publisher','title','url']);expect(c.dirty).toBe(false);expect(c.state.version).toBe(5);
 });
 it('preserves an accepted HTTP source URL byte-for-byte during unrelated edits',async()=>{
  const h=await ready(),c=h.controller;const url='http://example.go.kr/view?x=1&name=%EA%B0%80';
  h.setSaved({...empty(),version:1,plans:[{plan_id:'old',version:1,kind:'existing_program',title:'원문 사업',target:'대상',rationale:'',content:'검토 내용',checks:'',feedback:'',selected:true,program_reference:{program_version_id:'program_one',title:'원문 사업',url,publisher:'기관'}}]});
  await c.load();c.edit(c.state.activeKey,{feedback:'새 의견'});await c.save();const payload=JSON.parse([...h.calls].reverse().find(call=>call.options?.method==='PUT')!.options.body);expect(payload.plans[0].program_reference.url).toBe(url);
 });
 it('does not generate a report from unsaved edits or an empty selection',async()=>{
  const h=await ready(),c=h.controller;const plan=addFilled(c);
  await expect(c.generate()).rejects.toThrow('먼저 저장');await c.save();c.edit(plan._key,{selected:false});await c.save();
  await expect(c.generate()).rejects.toThrow('하나 이상');expect(h.calls.some(call=>call.options?.method==='POST')).toBe(false);
 });
 it('requires target and execution content only when making a report',async()=>{
  const h=await ready(),c=h.controller;const plan=c.add('new_program');await c.save();
  await expect(c.generate()).rejects.toThrow('대상과 범위');c.edit(plan._key,{target:'대상 집단'});await c.save();
  await expect(c.generate()).rejects.toThrow('실행 내용');
 });
 it('includes exactly the selected saved plan versions in the report request',async()=>{
  const h=await ready(),c=h.controller;addFilled(c,'첫 대응안');const second=addFilled(c,'둘째 대응안');addFilled(c,'셋째 대응안');c.edit(second._key,{selected:false});await c.save();
  const report=await c.generate();const payload=JSON.parse(h.calls.find(call=>call.options?.method==='POST')!.options.body);
  expect(payload).toEqual({expected_workspace_version:1,selected_plan_versions:[{plan_id:'saved_0',version:1},{plan_id:'saved_2',version:1}]});expect(report.report_id).toBe('response_one');expect(c.state.reports).toHaveLength(1);
 });
 it('keeps a failed save dirty and allows retry without losing the content',async()=>{
  let attempts=0;const h=harness((path,options)=>{
   if(options?.method==='PUT'){attempts++;if(attempts===1)throw Error('저장 서버 연결 실패');const payload=JSON.parse(options.body);return {...empty(),version:1,plans:payload.plans.map((plan:any)=>({...plan,plan_id:'saved',version:1}))};}
   return path.endsWith('/response-workspace')?empty():base;
  });const c=h.controller;await c.load();addFilled(c,'다시 저장할 대응안');
  await expect(c.save()).rejects.toThrow('연결 실패');expect(c.dirty).toBe(true);expect(c.state.plans[0].title).toBe('다시 저장할 대응안');expect(c.state.busy).toBe(null);
  await c.save();expect(c.dirty).toBe(false);expect(attempts).toBe(2);
 });
 it('preserves draft and selection on an optimistic-lock conflict',async()=>{
  const h=harness((path,options)=>{if(options?.method==='PUT'){const error:any=Error('다른 화면에서 저장했습니다.');error.status=409;throw error;}return path.endsWith('/response-workspace')?empty():base;});
  const c=h.controller;await c.load();addFilled(c,'보존할 초안');await expect(c.save()).rejects.toThrow('다른 화면');expect(c.state.conflict).toBe(true);expect(c.dirty).toBe(true);expect(c.state.plans[0].selected).toBe(true);
 });
 it('shares duplicate save requests while pending',async()=>{
  let finish:any;const h=harness((path,options)=>{if(options?.method==='PUT')return new Promise(resolve=>{finish=()=>resolve({...empty(),version:1,plans:JSON.parse(options.body).plans.map((plan:any)=>({...plan,plan_id:'saved',version:1}))});});return path.endsWith('/response-workspace')?empty():base;});
  await h.controller.load();addFilled(h.controller);const first=h.controller.save(),second=h.controller.save();finish();await Promise.all([first,second]);expect(h.calls.filter(call=>call.options?.method==='PUT')).toHaveLength(1);
 });
 it('shares duplicate report generation requests while pending',async()=>{
  const h=await ready(),c=h.controller;addFilled(c);await c.save();await Promise.all([c.generate(),c.generate()]);expect(h.calls.filter(call=>call.options?.method==='POST')).toHaveLength(1);
 });
 it('imports a selected welfare program once and marks it as an unsaved draft',async()=>{
  const h=await ready(),c=h.controller;const program={program_version_id:'program1',title:'지역 참여 사업',url:'https://example.go.kr/program',publisher:'담당기관',summary:'사업 원문 요약'};
  const first=c.add('existing_program',program),second=c.add('existing_program',program);expect(first._key).toBe(second._key);expect(c.state.plans).toHaveLength(1);expect(c.state.plans[0].content).toBe('사업 원문 요약');expect(c.dirty).toBe(true);
 });
 it('normalizes catalogue version IDs and never merges a program into an unrelated manual plan',async()=>{
  const {controller:c}=await ready();c.add('new_program');const plan=c.add('existing_program',{version_id:'catalogue-one',title:'선택한 사업'});expect(c.state.plans).toHaveLength(2);expect(plan.program_reference.program_version_id).toBe('catalogue-one');expect(()=>c.add('existing_program',{title:'ID 없는 사업'})).toThrow('다시 선택');
 });
 it('clips imported copy to saveable limits and clearly discloses the shortened fields',async()=>{
  const h=await ready(),c=h.controller;const plan=c.add('existing_program',{program_version_id:'catalogue-one',title:'제'.repeat(250),summary:'내'.repeat(8100),publisher:'기'.repeat(250),rationale:'배'.repeat(4100),feedback:'검'.repeat(4100),target:'대'.repeat(2100),checks:'확'.repeat(4100)});
  expect(plan.title).toHaveLength(200);expect(plan.content).toHaveLength(8000);expect(plan.program_reference.title).toHaveLength(250);expect(plan.program_reference.publisher).toHaveLength(200);expect(plan.rationale).toHaveLength(4000);expect(plan.feedback).toHaveLength(4000);expect(plan.target).toHaveLength(2000);expect(plan.checks).toHaveLength(4000);
  expect(h.api.editorHTML(plan)).toContain('입력 가능한 범위에 맞춰 줄이거나 제외');await c.save();expect(c.dirty).toBe(false);
  const second=c.add('existing_program',{program_version_id:'catalogue-two',title:'제'.repeat(350)});expect(second.program_reference.title).toHaveLength(300);
 });
 it.each([
  ['analysis_child','analysis_one','analysis_one'],
  ['analysis_one','analysis_child','analysis_one'],
  ['analysis_sibling','analysis_child','analysis_one'],
  ['analysis_child','analysis_one',undefined],
  ['analysis_one','analysis_child','analysis_child'],
 ])('opens a listed family report from %s preserving %s snapshot and historical root %s',async(current,parent,reportRoot)=>{
  const snapshot={...base,report_id:parent,markdown:'원래 분석 스냅샷'};
  const listed={report_id:'response_family',analysis_report_id:parent,...(reportRoot?{workspace_analysis_report_id:reportRoot}:{}),created_at:'2026-10-25'};
  const report={...listed,markdown:'저장된 보고서',storage_status:'saved',analysis_snapshot:snapshot};
  const h=harness();
  const c=h.api.createController(current,{request:async(path:string)=>path.startsWith('/api/model/response-reports/')?report:path.endsWith('/response-workspace')?{...empty(),analysis_report_id:current,workspace_analysis_report_id:'analysis_one',reports:[listed]}:{...base,report_id:current}});
  await c.load();const opened=await c.readReport('response_family');
  expect(opened.analysis_report_id).toBe(parent);expect(opened.analysis_snapshot).toEqual(snapshot);expect(c.state.lastReport).toBe(opened);
 });
 it.each(['unlisted','parent','root','snapshot'])('rejects a family report with %s mismatch',async(issue)=>{
  const listed={report_id:'response_family',analysis_report_id:'analysis_child',workspace_analysis_report_id:'analysis_one'};
  const report:any={...listed,markdown:'저장된 보고서',storage_status:'saved',analysis_snapshot:{...base,report_id:'analysis_child'}};
  if(issue==='unlisted')report.analysis_report_id='analysis_one';
  if(issue==='parent')report.analysis_report_id='analysis_unrelated';
  if(issue==='root')report.workspace_analysis_report_id='analysis_unrelated';
  if(issue==='snapshot')report.analysis_snapshot.report_id='analysis_unrelated';
  const h=harness(path=>path.startsWith('/api/model/response-reports/')?report:path.endsWith('/response-workspace')?{...empty(),workspace_analysis_report_id:'analysis_one',reports:issue==='unlisted'?[]:[listed]}:base);
  await h.controller.load();await expect(h.controller.readReport('response_family')).rejects.toThrow('같은 현황 분석');expect(h.controller.state.lastReport).toBe(null);
 });
 it('saves edits to all existing plans after a family migration exceeds twenty plans',async()=>{
  const h=await ready(),c=h.controller;
  h.setSaved({...empty(),workspace_analysis_report_id:'analysis_one',version:8,plans:Array.from({length:24},(_,i)=>({plan_id:'migrated_'+i,version:2,kind:'new_program',title:'보존한 대응안 '+i,target:'지역 주민',rationale:'이유',content:'실행 내용',checks:'',feedback:'',selected:true,program_reference:null}))});
  await c.load();c.edit(c.state.plans[23]._key,{feedback:'통합 후 검토 의견'});await c.save();
  expect(c.state.plans).toHaveLength(24);expect(c.state.plans[23].feedback).toBe('통합 후 검토 의견');expect(c.dirty).toBe(false);expect(()=>c.add()).toThrow('20개까지');
 });
 it('rejects a report for another analysis instead of showing it',async()=>{
  const h=harness(path=>path.startsWith('/api/model/response-reports/')?{report_id:'response_other',analysis_report_id:'analysis_other',markdown:'wrong',storage_status:'saved'}:path.endsWith('/response-workspace')?empty():base);
  await h.controller.load();await expect(h.controller.readReport('response_other')).rejects.toThrow('같은 현황 분석');
 });
 it('rejects a different report ID even when it belongs to the same analysis',async()=>{
  const h=harness(path=>path.startsWith('/api/model/response-reports/')?{report_id:'response_other',analysis_report_id:'analysis_one',markdown:'wrong report',storage_status:'saved'}:path.endsWith('/response-workspace')?empty():base);
  await h.controller.load();await expect(h.controller.readReport('response_requested')).rejects.toThrow('선택한 보고서');expect(h.controller.state.lastReport).toBe(null);
 });
 it.each(['versions','scope','workspace','family','parent'])('rejects a generated report that differs from the requested %s',async mismatch=>{
  let saved:any=empty();const h=harness((path,options)=>{
   if(options?.method==='PUT'){saved={...empty(),version:1,plans:JSON.parse(options.body).plans.map((plan:any)=>({...plan,plan_id:'saved_one',version:1}))};return saved;}
   if(options?.method==='POST'){const report:any={report_id:'response_wrong',report_type:'preventive_response',analysis_report_id:'analysis_one',workspace_version:1,scope:base.scope,markdown:'wrong',storage_status:'saved',selected_plans:saved.plans.map((plan:any)=>({...plan}))};if(mismatch==='family')report.workspace_analysis_report_id='analysis_other';if(mismatch==='parent')report.analysis_report_id='analysis_other';if(mismatch==='versions')report.selected_plans[0].version=99;if(mismatch==='scope')report.scope={...base.scope,month:'202512'};if(mismatch==='workspace')report.workspace_version=2;return report;}
   return path.endsWith('/response-workspace')?saved:base;
  });const c=h.controller;await c.load();addFilled(c);await c.save();await expect(c.generate()).rejects.toThrow();expect(c.state.lastReport).toBe(null);
 });
 it('accepts reuse of the identical selected versions after only an unselected plan changes',async()=>{
  let workspace:any=empty(),report:any=null;
  const h=harness((path,options)=>{
   if(options?.method==='PUT'){const input=JSON.parse(options.body);const version=workspace.version+1;workspace={...empty(),version,plans:input.plans.map((plan:any,index:number)=>({...plan,plan_id:plan.plan_id||'saved_'+index,version:index===0?1:version}))};return workspace;}
   if(options?.method==='POST'){if(report)return {...report,reused:true};report={report_id:'response_reused',report_type:'preventive_response',analysis_report_id:'analysis_one',workspace_version:workspace.version,scope:base.scope,markdown:'# 保存된 선택 버전',storage_status:'saved',selected_plans:workspace.plans.filter((plan:any)=>plan.selected)};return report;}
   return path.endsWith('/response-workspace')?workspace:base;
  });const c=h.controller;await c.load();addFilled(c,'선택한 대응안');const omitted=addFilled(c,'선택하지 않은 대응안');c.edit(omitted._key,{selected:false});await c.save();const first=await c.generate();c.edit(omitted._key,{feedback:'선택하지 않은 초안만 수정'});await c.save();expect(c.state.version).toBe(2);const reused=await c.generate();expect(reused.report_id).toBe(first.report_id);expect(reused.workspace_version).toBe(1);expect(reused.reused).toBe(true);expect(c.state.reports).toHaveLength(1);
 });
 it('escapes authored text, program reference text and analysis context',async()=>{
  const h=await ready(),c=h.controller;const plan=c.add('existing_program',{program_version_id:'one',title:'<img src=x onerror=bad()>',url:'javascript:bad()',publisher:'<script>bad()</script>'});c.edit(plan._key,{content:'</textarea><img src=x onerror=bad()>'});
  for(const html of [h.api.planListHTML(c.state.plans,plan._key),h.api.editorHTML(plan),h.api.selectedHTML(c.state.plans,[])]){expect(html).not.toContain('<img src=x');expect(html).not.toContain('<script>');expect(html).not.toContain('javascript:');}
  const html=h.api.contextHTML({...base,context:{i5:{record:{region_name:'<script>bad()</script>'}}}});expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 });
 it('renders a readable selected-plan preview and keeps saved technical text collapsed',()=>{
  const h=harness();const report={report_id:'response_one',analysis_report_id:'analysis_one',workspace_version:2,title:'춘천시 예방 대응 보고서',created_at:'2026-10-25T12:00:00Z',region_name:'춘천시',analysis_snapshot:{...base,provenance:{activity:{run_id:'internal_run',manifest_sha256:'internal_hash'}}},selected_plans:[{plan_id:'one',version:3,kind:'new_program',title:'지역 참여 검토',target:'남성 20대',rationale:'관측 변화 확인',content:'현장 수요 확인',checks:'담당기관 확인',feedback:'검토 의견 반영'}],markdown:'# 춘천시 예방 대응 보고서\nanalysis_one internal_hash',limitations:['실행 전 현장 검토가 필요합니다.']};
  const html=h.api.reportHTML(report);const visible=html.split('<details class="hrw-report-appendix">')[0];
  expect(visible).toContain('현장 수요 확인');expect(visible).toContain('저장된 3차 수정본');expect(visible).toContain('2026년');expect(visible).not.toContain('analysis_one');expect(visible).not.toContain('internal_hash');
  expect(visible.match(/<h3>춘천시 예방 대응 보고서<\/h3>/g)).toHaveLength(1);expect(html).toContain('저장된 보고서 전문 보기');expect(html).toContain('analysis_one internal_hash');
 });
 it('escapes selected report snapshots and references while preserving full original download text',()=>{
  const {api}=harness();const html=api.reportHTML({title:'<script>bad()</script>',analysis_report_id:'one',analysis_snapshot:base,selected_plans:[{kind:'existing_program',title:'<img src=x onerror=bad()>',target:'대상',content:'</dd><script>bad()</script>',program_reference:{title:'<svg onload=bad()>',url:'javascript:bad()'}}],markdown:'<img src=x onerror=bad()>'});
  expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x');expect(html).not.toContain('<svg onload');expect(html).not.toContain('javascript:');expect(html).toContain('&lt;script&gt;');
 });
 it('accepts only safe public-protocol source links',()=>{
  const {api}=harness();expect(api.safeURL('https://example.go.kr/notice')).toBe('https://example.go.kr/notice');expect(api.safeURL('http://example.go.kr')).toBe('http://example.go.kr');expect(api.safeURL('https://user:pass@example.go.kr')).toBe(null);expect(api.safeURL('javascript:alert(1)')).toBe(null);expect(api.safeURL('http://localhost')).toBe(null);expect(api.safeURL('https://example.go.kr/with space')).toBe(null);
 });
 it('starts all four reviews and nine displayed need fields unconfirmed without age or catalogue inference',async()=>{
  const h=await ready(),c=h.controller;
  const plan=c.add('existing_program',{program_version_id:'youth-one',title:'청년 사업',policy_review:{eligibility:{status:'confirmed'}},support_needs:[{category_code:'employment',status:'confirmed'}]});
  expect(Object.keys(plan.policy_review)).toEqual(['eligibility','support_content','delivery','finance_and_cost']);
  for(const item of Object.values(plan.policy_review) as any[])expect(item).toEqual({status:'unconfirmed',text:'',evidence:''});
  expect(plan.support_needs).toEqual([]);
  const html=h.api.editorHTML(plan);expect(html).toContain('생애주기별 고정 순위가 없으며');
  expect(html.match(/data-hrw-review-field="status"/g)).toHaveLength(13);
  expect(html.match(/value="unconfirmed" selected/g)).toHaveLength(13);
 });
 it('saves and reloads structured user records, preserving other fields on partial edits',async()=>{
  const h=await ready(),c=h.controller,plan=addFilled(c);
  c.edit(plan._key,{policy_review:{delivery:{status:'confirmed',text:'전화 신청',evidence:'기관 안내 확인'},finance_and_cost:{text:'요금표 확인 필요'}},support_needs:[{category_code:'social_connection',status:'confirmed',text:'참여 희망',evidence:'상담 기록'},{category_code:'housing',text:'상담 필요 여부 질문'}]});
  c.edit(plan._key,{policy_review:{finance_and_cost:{evidence:'요금표 요청'}},support_needs:[{category_code:'housing',evidence:'다음 면담에서 확인'}]});
  expect(plan.policy_review.delivery.status).toBe('confirmed');expect(plan.policy_review.finance_and_cost.text).toBe('요금표 확인 필요');expect(plan.support_needs).toHaveLength(2);
  await c.save();const snapshot=c.snapshot();await c.load();expect(c.snapshot()).toEqual(snapshot);expect(c.dirty).toBe(false);
  const report=await c.generate();const html=h.api.reportHTML(report,base);
  expect(html).toContain('전화 신청');expect(html).toContain('기관 안내 확인');expect(html).toContain('요금표 요청');expect(html).toContain('상담 기록');expect(html).toContain('사용자 확인 기록');expect(html).toContain('개인 지원 자격 확정이 아닙니다');
 });
 it('strips server provenance from editable reviews without changing their recorded contents',async()=>{
  const h=await ready(),c=h.controller;const p=addFilled(c);await c.save();const stored=JSON.parse(JSON.stringify(c.state.plans[0]));
  stored.policy_review.delivery={status:'confirmed',text:'안내 확인',evidence:'사용자 기록',origin:'user_entered'};
  stored.support_needs=[{category_code:'employment',status:'confirmed',text:'취업 상담 희망',evidence:'직접 문의',origin:'user_entered'}];
  h.setSaved({...empty(),version:1,plans:[stored]});await c.load();c.edit(p._key,{feedback:'추가 의견'});await c.save();
  const body=JSON.parse([...h.calls].reverse().find(call=>call.options?.method==='PUT')!.options.body);
  expect(body.plans[0].policy_review.delivery).toEqual({status:'confirmed',text:'안내 확인',evidence:'사용자 기록'});
  expect(body.plans[0].support_needs[0]).toEqual({category_code:'employment',status:'confirmed',text:'취업 상담 희망',evidence:'직접 문의'});
 });
 it.each(['policy_review','support_needs'])('keeps incomplete confirmed %s edits and prevents saving them',async family=>{
  const h=await ready(),c=h.controller,p=addFilled(c);
  c.edit(p._key,family==='policy_review'?{policy_review:{eligibility:{status:'confirmed',text:'확인 내용'}}}:{support_needs:[{category_code:'housing',status:'confirmed',text:'확인 내용'}]});
  await expect(c.save()).rejects.toThrow('직접 확인한 근거');expect(c.dirty).toBe(true);expect(h.calls.some(call=>call.options?.method==='PUT')).toBe(false);
 });
 it('shows original lifecycle reference as unconfirmed and escapes all new inputs and source text',async()=>{
  const h=await ready(),c=h.controller,p=addFilled(c),unsafe='</textarea><script>bad()</script>';
  c.edit(p._key,{policy_review:{eligibility:{text:unsafe,evidence:unsafe}},support_needs:[{category_code:'housing',text:unsafe,evidence:unsafe}]});
  const analysis={...base,lifecycle_interpretation:{source:{title:unsafe,year:2025,pages:[39,40,52]},support_need_status:'unconfirmed'}};
  for(const html of [h.api.editorHTML(p),h.api.contextHTML(analysis),h.api.reportHTML({analysis_snapshot:analysis,selected_plans:[p],markdown:'원문'})]){expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');}
  const html=h.api.contextHTML(analysis);expect(html).toContain('생애주기 해석 참고 · 지원 필요 미확인');expect(html).toContain('본문 39·40·52쪽');
 });
 it('queries only after an explicit search of saved confirmed needs and imports a candidate as a draft',async()=>{
  let saved:any=empty();const h=harness((path,options)=>{
   if(options?.method==='PUT'){saved={...empty(),version:1,plans:JSON.parse(options.body).plans.map((item:any)=>({...item,plan_id:'saved_one',version:1}))};return saved;}
   if(path.startsWith('/api/model/welfare?'))return {request:{...base.scope,confirmed_needs:['social_connection'],support_as_of:'2026-10-25'},recommendations:[{version_id:'program-one',title:'지역 참여 사업',target_text:'대상 조건 확인',support_content:'상담과 참여 지원',source_url:'https://example.go.kr/program',institution:'담당기관',unconfirmed_conditions:['개인 자격']}],coverage:{truncated:false},status:'completed'};
   return path.endsWith('/response-workspace')?saved:base;
  });const c=h.controller;await c.load();const plan=addFilled(c);
  c.edit(plan._key,{support_needs:[{category_code:'social_connection',status:'confirmed',text:'참여 희망',evidence:'사용자 직접 확인'},{category_code:'housing',text:'미확인 질문'}]});
  expect(h.calls.some(call=>call.path.startsWith('/api/model/welfare'))).toBe(false);
  await expect(c.searchNeeds()).rejects.toThrow('먼저 저장');await c.save();expect(h.calls.some(call=>call.path.startsWith('/api/model/welfare'))).toBe(false);
  const result=await c.searchNeeds();const call=h.calls.find(item=>item.path.startsWith('/api/model/welfare'))!;
  expect(call.options.method).toBe('GET');const query=new URL('http://test'+call.path).searchParams;
  expect(Object.fromEntries(query)).toEqual({...base.scope,confirmed_needs:'social_connection'});expect(query.getAll('confirmed_needs')).toEqual(['social_connection']);
  expect(result.programs).toHaveLength(1);const imported=c.importCandidate(plan._key,0);expect(imported.kind).toBe('existing_program');expect(imported.program_reference.program_version_id).toBe('program-one');expect(imported.target).toBe('대상 조건 확인');expect(imported.checks).toBe('개인 자격');
  expect(imported.support_needs).toEqual([{category_code:'social_connection',status:'confirmed',text:'참여 희망',evidence:'사용자 직접 확인'}]);
  expect(imported.policy_review.eligibility.status).toBe('unconfirmed');expect(c.dirty).toBe(true);expect(c.state.plans).toHaveLength(2);
 });
 it.each(['sex_code','age_code'])('does not substitute a default for missing %s when searching',async field=>{
  const analysis={...base,scope:{...base.scope,[field]:null}};
  const h=harness(path=>path.endsWith('/response-workspace')?empty():analysis);await h.controller.load();addFilled(h.controller);
  await expect(h.controller.searchNeeds()).rejects.toThrow('집단을 선택한 현황 분석');expect(h.calls.some(call=>call.path.startsWith('/api/model/welfare'))).toBe(false);
  expect(h.api.supportSearchHTML(h.controller.state.plans[0],analysis.scope,null)).toContain('전체 집단을 임의의 한 집단으로 바꾸지 않습니다');
 });
 it('does not query from only unconfirmed questions',async()=>{
  const h=await ready(),c=h.controller,p=addFilled(c);c.edit(p._key,{support_needs:[{category_code:'housing',text:'주거 필요 질문',evidence:'확인 예정'}]});await c.save();
  await expect(c.searchNeeds()).rejects.toThrow('사용자 확인');expect(h.calls.some(call=>call.path.startsWith('/api/model/welfare'))).toBe(false);
 });
 it.each(['scope','needs','failure'])('holds the candidate display on a %s problem and never calls it a support gap',async kind=>{
  let saved:any=empty();const h=harness((path,options)=>{
   if(options?.method==='PUT'){saved={...empty(),version:1,plans:JSON.parse(options.body).plans.map((item:any)=>({...item,plan_id:'saved_one',version:1}))};return saved;}
   if(path.startsWith('/api/model/welfare?')){if(kind==='failure')throw Error('조회 서버 오류');return {request:{...base.scope,age_code:kind==='scope'?'40G':'20G',confirmed_needs:kind==='needs'?['employment']:['housing']},recommendations:[]};}
   return path.endsWith('/response-workspace')?saved:base;
  });const c=h.controller;await c.load();const p=addFilled(c);c.edit(p._key,{support_needs:[{category_code:'housing',status:'confirmed',text:'상담 희망',evidence:'직접 확인'}]});await c.save();await expect(c.searchNeeds()).rejects.toThrow('사업 부재로 해석하지 않습니다');
  expect(c.state.supportSearches[p._key].status).toBe('error');expect(c.state.busy).toBe(null);expect(c.state.plans).toHaveLength(1);expect(c.dirty).toBe(false);
 });
 it('shows zero matches, truncation and unsafe candidate text as review limitations',()=>{
  const h=harness(),plan={_key:'one',support_needs:[]};
  const emptyHtml=h.api.supportSearchHTML(plan,base.scope,{status:'complete',programs:[],coverage:{}});expect(emptyHtml).toContain('사업이 없다는 뜻은 아닙니다');
  const html=h.api.supportSearchHTML(plan,base.scope,{status:'complete',coverage:{truncated:true},programs:[{title:'<script>bad()</script>',support_content:'<img src=x>',institution:'<svg onload=bad()>',unconfirmed_conditions:['<b>조건</b>'],source_url:'javascript:bad()'}]});
  expect(html).toContain('개인 지원 자격과 현재 이용 가능 여부는 미확인');expect(html).toContain('일부 후보만 검토');expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x>');expect(html).not.toContain('javascript:');
 });
 it.each(['confirmed_needs_unsupported','unconfigured'])('preserves %s as a held search with reasons and blocks returned candidates',async mappingStatus=>{
  let saved:any=empty();const reason='연결 기준이 없어 탐색 보류 <script>bad()</script>';
  const h=harness((path,options)=>{
   if(options?.method==='PUT'){saved={...empty(),version:1,plans:JSON.parse(options.body).plans.map((item:any)=>({...item,plan_id:'saved_one',version:1}))};return saved;}
   if(path.startsWith('/api/model/welfare?'))return {request:{...base.scope,confirmed_needs:['housing']},status:'held',mapping_status:mappingStatus,mapping:{status:'held',reasons:[reason]},recommendations:[{version_id:'held-one',title:'보류된 사업'}]};
   return path.endsWith('/response-workspace')?saved:base;
  });const c=h.controller;await c.load();const p=addFilled(c);c.edit(p._key,{support_needs:[{category_code:'housing',status:'confirmed',text:'주거 상담 희망',evidence:'직접 확인'}]});await c.save();
  const result=await c.searchNeeds();expect(result.status).toBe('held');expect(result.serverStatus).toBe('held');expect(result.mappingStatus).toBe(mappingStatus);expect(result.reasons).toEqual([reason]);
  const html=h.api.supportSearchHTML(p,base.scope,result);expect(html).toContain('사업 탐색 보류');expect(html).toContain('연결 기준이 없어 탐색 보류 &lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('data-hrw-import-candidate');expect(html).not.toContain('개 검토 후보');
  expect(()=>c.importCandidate(p._key,0)).toThrow('다시 확인');expect(c.state.plans).toHaveLength(1);expect(c.dirty).toBe(false);
 });
 it.each(['held','completed'])('distinguishes an empty %s response in controller state and display',async status=>{
  let saved:any=empty();const h=harness((path,options)=>{
   if(options?.method==='PUT'){saved={...empty(),version:1,plans:JSON.parse(options.body).plans.map((item:any)=>({...item,plan_id:'saved_one',version:1}))};return saved;}
   if(path.startsWith('/api/model/welfare?'))return {request:{...base.scope,confirmed_needs:['housing']},status,mapping:{status:status==='held'?'held':'selected',reasons:['등록 자료의 연결 기준 확인 필요']},recommendations:[]};
   return path.endsWith('/response-workspace')?saved:base;
  });const c=h.controller;await c.load();const p=addFilled(c);c.edit(p._key,{support_needs:[{category_code:'housing',status:'confirmed',text:'주거 상담 희망',evidence:'직접 확인'}]});await c.save();const result=await c.searchNeeds();
  const html=h.api.supportSearchHTML(p,base.scope,result);
  if(status==='held'){expect(result.status).toBe('held');expect(html).toContain('사업 탐색 보류');expect(html).toContain('등록 자료의 연결 기준 확인 필요');expect(html).not.toContain('0개 검토 후보');}
  else{expect(result.status).toBe('complete');expect(html).toContain('0개 검토 후보');expect(html).toContain('사업이 없다는 뜻은 아닙니다');expect(html).not.toContain('사업 탐색 보류');}
 });
 it('requests a draft from the exact analysis without silently adding or saving a plan',async()=>{
  const h=harness((path,options)=>path.endsWith('/assist')?assistantResult():path.endsWith('/response-workspace')?empty():base),c=h.controller;
  await c.load();c.setAssistance({instruction:'관측과 가설을 구분한 초안을 제안해 줘'});await c.assist();
  const call=h.calls.find(item=>item.path.endsWith('/assist'))!;
  expect(call.path).toBe('/api/model/analysis-reports/analysis_one/response-workspace/assist');
  expect(JSON.parse(call.options.body)).toEqual({mode:'draft',kind:'new_program',instruction:'관측과 가설을 구분한 초안을 제안해 줘'});
  expect(c.state.plans).toHaveLength(0);expect(c.dirty).toBe(false);expect(h.calls.some(item=>item.options?.method==='PUT')).toBe(false);
  const added=c.applyAssistance();expect(added.title).toBe('헤르미 제안');expect(added.program_reference).toBe(null);expect(added.support_needs).toEqual([]);expect(added.policy_review.eligibility.status).toBe('unconfirmed');expect(c.dirty).toBe(true);
 });
 it('applies only proposed prose while preserving user confirmations, source reference and feedback',async()=>{
  const h=harness((path,options)=>path.endsWith('/assist')?assistantResult('revise','existing_program'):path.endsWith('/response-workspace')?empty():base),c=h.controller;
  await c.load();const p=c.add('existing_program',{version_id:'program-one',title:'실제 사업',source_url:'https://example.go.kr/program'});
  c.edit(p._key,{feedback:'담당자 의견',support_needs:[{category_code:'housing',status:'confirmed',text:'주거 상담 희망',evidence:'당사자 요청 확인'}],policy_review:{eligibility:{status:'confirmed',text:'공고 검토',evidence:'공고 원문'}}});
  const before=structuredClone(c.snapshot()[0]);c.setAssistance({instruction:'실행 내용을 구체화해 줘',mode:'revise'});await c.assist();
  const submitted=JSON.parse(h.calls.find(item=>item.path.endsWith('/assist'))!.options.body).current_plan;
  expect(submitted._key).toBeUndefined();expect(submitted.kind).toBe('existing_program');expect(p.title).toBe('실제 사업');c.applyAssistance();
  expect(p.title).toBe('헤르미 제안');expect(p.feedback).toBe(before.feedback);expect(p.program_reference).toEqual(before.program_reference);expect(p.support_needs).toEqual(before.support_needs);expect(p.policy_review).toEqual(before.policy_review);
 });
 it('renders review notes without a draft apply action and escapes all model text',async()=>{
  const response=assistantResult('review');response.review_notes=['<script>bad()</script>'];response.limitations=['<img src=x>'];
  const h=harness((path,options)=>path.endsWith('/assist')?response:path.endsWith('/response-workspace')?empty():base),c=h.controller;
  await c.load();addFilled(c);const before=c.snapshot();c.setAssistance({instruction:'빠진 조건을 검토해 줘',mode:'review'});await c.assist();
  expect(c.snapshot()).toEqual(before);const html=h.api.assistanceHTML(c.state);expect(html).toContain('헤르미의 검토');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x>');expect(html).not.toContain('data-hrw-assist-apply');expect(()=>c.applyAssistance()).toThrow('초안 제안');
 });
 it('preserves user text and supports retry after an assistance failure',async()=>{
  let attempts=0;const h=harness((path,options)=>{if(path.endsWith('/assist')){if(++attempts===1)throw Error('모델 연결 실패');return assistantResult('revise');}return path.endsWith('/response-workspace')?empty():base;}),c=h.controller;
  await c.load();const p=addFilled(c);const before=c.snapshot();c.setAssistance({instruction:'실행 내용 수정',mode:'revise'});await expect(c.assist()).rejects.toThrow('모델 연결 실패');expect(c.snapshot()).toEqual(before);expect(c.state.assistance.instruction).toBe('실행 내용 수정');expect(c.state.busy).toBe(null);await c.assist();expect(c.state.assistance.result).not.toBe(null);expect(p.content).toContain('현장 수요');
 });
 it.each(['scope','mode','kind','not_model','unexpected_field'])('rejects an assistance response with %s drift',async issue=>{
  const result:any=assistantResult();if(issue==='scope')result.scope.age_code='40G';if(issue==='mode')result.mode='review';if(issue==='kind')result.kind='existing_program';if(issue==='not_model')result.model_called=false;if(issue==='unexpected_field')result.suggestion.support_needs=[{status:'confirmed'}];
  const h=harness((path,options)=>path.endsWith('/assist')?result:path.endsWith('/response-workspace')?empty():base),c=h.controller;await c.load();c.setAssistance({instruction:'초안 제안'});await expect(c.assist()).rejects.toThrow();expect(c.state.plans).toHaveLength(0);expect(c.state.assistance.result).toBe(null);
 });
 it('does not apply a proposal after the user changes the selected draft',async()=>{
  const h=harness((path,options)=>path.endsWith('/assist')?assistantResult('revise'):path.endsWith('/response-workspace')?empty():base),c=h.controller;await c.load();const p=addFilled(c);c.setAssistance({instruction:'내용 수정',mode:'revise'});await c.assist();c.edit(p._key,{content:'사용자가 다시 작성한 내용'});expect(()=>c.applyAssistance()).toThrow('대응안이 바뀌었습니다');expect(p.content).toBe('사용자가 다시 작성한 내용');
 });
 it('discards an in-flight result after switching the active plan and shares duplicate calls',async()=>{
  let finish:(value:any)=>void=()=>{};const waiting=new Promise(resolve=>finish=resolve);const h=harness((path,options)=>path.endsWith('/assist')?waiting:path.endsWith('/response-workspace')?empty():base),c=h.controller;
  await c.load();const p=addFilled(c,'원래 초안'),other=addFilled(c,'다른 초안');c.activate(p._key);c.setAssistance({instruction:'내용 수정',mode:'revise'});const first=c.assist(),second=c.assist();c.activate(other._key);finish(assistantResult('revise'));await expect(first).rejects.toThrow('요청 후 대응안');await expect(second).rejects.toThrow('요청 후 대응안');expect(h.calls.filter(item=>item.path.endsWith('/assist'))).toHaveLength(1);expect(c.state.assistance.result).toBe(null);expect(c.state.plans.map((item:any)=>item.title)).toEqual(['원래 초안','다른 초안']);
 });
 it('requires an explicit nonempty instruction and clears proposals when the instruction changes',async()=>{
  const h=harness((path,options)=>path.endsWith('/assist')?assistantResult():path.endsWith('/response-workspace')?empty():base),c=h.controller;await c.load();await expect(c.assist()).rejects.toThrow('요청할 내용');expect(()=>c.setAssistance({instruction:'가'.repeat(2001)})).toThrow('2,000자');c.setAssistance({instruction:'초안 작성'});await c.assist();c.setAssistance({instruction:'다른 요청'});expect(c.state.assistance.result).toBe(null);expect(()=>c.applyAssistance()).toThrow('초안 제안');
 });
});
