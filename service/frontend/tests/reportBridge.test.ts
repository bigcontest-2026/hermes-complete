import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
const source=readFileSync(new URL('../../shared/hermi-analysis-reports.js',import.meta.url),'utf8');
const overview=readFileSync(new URL('../../shared/hermi-overview.js',import.meta.url),'utf8');
const report={report_id:'analysis_1',scope:{region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'},region_name:'춘천시',report_type:'observation_analysis',storage_status:'saved',context_investigation_status:'not_performed',created_at:'2026-10-25T10:00:00Z',rule_version:'activity-review-5pct-v1',threshold_percent:5,quality_status:'hold',operational_alert_allowed:false,context:{i5:{status:'unavailable'},mois:{status:'unavailable'}},assessments:[],markdown:'# 관측 현황'};
const response={report_id:'response_1',analysis_report_id:'analysis_1',scope:report.scope,region_name:'춘천시',report_type:'preventive_response',title:'지역 예방 대응 검토',selected_plans:[{plan_id:'plan_1'}],created_at:report.created_at,storage_status:'saved',markdown:'# 예방 대응 검토',filename:'예방대응.md'};
function element(){const classes=new Set<string>();return {innerHTML:'',textContent:'',hidden:false,open:false,disabled:false,scrollTop:0,dataset:{} as Record<string,string>,classList:{add:(v:string)=>classes.add(v),remove:(v:string)=>classes.delete(v),contains:(v:string)=>classes.has(v)},focus:vi.fn(),setAttribute:vi.fn(),appendChild:vi.fn(),showModal:vi.fn(function(this:any){this.open=true;}),close:vi.fn(function(this:any){this.open=false;}),addEventListener:vi.fn(),querySelector:vi.fn(),querySelectorAll:vi.fn(()=>[])};}
function harness(handler:(path:string,options?:any)=>any=path=>path.includes('?')?{reports:[report],total_matched:1,next_offset:null}:report){
 const nodes:Record<string,ReturnType<typeof element>>={};
 for(const key of ['#analysis-library-title','[data-report-library-intro]','[data-report-library-scope]','[data-report-library-tabs]','[data-report-library-status]','[data-report-library-list]','[data-report-library-detail]'])nodes[key]=element();
 const library=element(),nav=element(),focus=element();library.querySelector=vi.fn((key:string)=>nodes[key]||element());nodes['[data-report-library-detail]'].querySelector=vi.fn(()=>element());
 const handlers:Record<string,(event:any)=>Promise<any>>={},calls:{path:string;options:any}[]=[],workspace={open:vi.fn(async()=>{})};
 const context=createContext({window:{HERMES_RESPONSE_WORKSPACE:workspace},URL,URLSearchParams,Number,JSON,Map,Promise,Error,Date,Blob,CustomEvent:class{},setTimeout,document:{activeElement:focus,getElementById:()=>nav,querySelector:()=>null,createElement:(type:string)=>type==='dialog'?library:element(),body:{appendChild:vi.fn()},addEventListener:(name:string,callback:any)=>{handlers[name]=callback;}},fetch:async(path:string,options:any)=>{calls.push({path,options});const result=await handler(path,options);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>result};}});
 new Script(source).runInContext(context);
 const click=async(attribute:string,value='')=>{const name=attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),button={dataset:{[name]:value},disabled:false,hasAttribute:(key:string)=>key===attribute,closest:()=>null};await handlers.click({target:{closest:()=>button}});return button;};
 return {api:context.window.HERMES_ANALYSIS_REPORTS,context,calls,nodes,library,focus,workspace,click};
}
function overviewHarness(){
 const openLibrary=vi.fn(async(_options?:any)=>{}),chooseReport=vi.fn(async(_options?:any):Promise<any>=>report),openWorkspace=vi.fn(async(_id?:any,_options?:any)=>{});
 const context=createContext({window:{HERMES_ANALYSIS_REPORTS:{openLibrary,chooseReport},HERMES_RESPONSE_WORKSPACE:{open:openWorkspace}},location:{search:''},URL,URLSearchParams,Date,Map,Set,Promise});
 new Script(overview.replace('return { mount, show };','return {mount,show,testState:state,testAttach:attachProgramToReport,testRegion:openRegionReports};')).runInContext(context);
 return {api:context.window.HERMI_OVERVIEW,context,openLibrary,chooseReport,openWorkspace};
}
describe('report and response navigation bridge',()=>{
 it('keeps selected region/month in paginated GET-only report lookup',async()=>{const h=harness();await h.api.openLibrary({scope:{region_code:'51110',region_name:'춘천시',month:'202510'}});await h.click('data-report-library-page','20');expect(h.calls.map(c=>c.path)).toEqual(['/api/model/analysis-reports?limit=20&offset=0&region_code=51110&month=202510','/api/model/analysis-reports?limit=20&offset=20&region_code=51110&month=202510']);expect(h.calls.every(c=>!c.options?.method)).toBe(true);expect(h.nodes['[data-report-library-scope]'].innerHTML).toContain('춘천시');});
 it('keeps UI labels out of report query parameters',()=>{const h=harness();expect(h.api.reportQuery(0,{region_code:'51110',month:'202510',region_name:'춘천시',risk_score:99})).toBe('?limit=20&offset=0&region_code=51110&month=202510');});
 it('preserves the selected dong filter in both analysis and preventive report tabs',async()=>{
  const h=harness();await h.api.openLibrary({scope:{region_code:'11680',dong_code:'1168051000',region_name:'강남구 신사동',month:'202512'}});
  expect(h.calls[0].path).toBe('/api/model/analysis-reports?limit=20&offset=0&region_code=11680&dong_code=1168051000&month=202512');
  expect(h.nodes['[data-report-library-scope]'].innerHTML).toContain('강남구 신사동');
  await h.click('data-report-library-type','response');
  expect(h.calls[1].path).toBe('/api/model/response-reports?limit=20&offset=0&region_code=11680&dong_code=1168051000&month=202512');
 });
 it('opens optional response review for a saved baseline without model calls',async()=>{const h=harness();expect(h.api.render([report])).toContain('data-analysis-response-open="analysis_1"');await h.click('data-analysis-response-open','analysis_1');expect(h.workspace.open).toHaveBeenCalledWith('analysis_1',{});expect(h.calls).toHaveLength(0);});
 it('reads preventive reports in their own tab and preserves parent actions',async()=>{const h=harness(path=>path.includes('?')?{reports:[response],total_matched:1,next_offset:null}:response);await h.api.openLibrary({type:'response',scope:{region_code:'51110',month:'202510'}});expect(h.calls[0].path).toBe('/api/model/response-reports?limit=20&offset=0&region_code=51110&month=202510');expect(h.nodes['[data-report-library-list]'].innerHTML).toContain('예방 대응 보고서');await h.click('data-response-report-open','response_1');expect(h.nodes['[data-report-library-detail]'].innerHTML).toContain('data-response-parent-open="analysis_1"');expect(h.nodes['[data-report-library-detail]'].innerHTML).toContain('data-response-report-workspace="analysis_1"');});
 it('opens the plan editor from the linked-response action rather than reopening the report tab',async()=>{
  const h=harness(),html=h.api.responseArticle(response);
  expect(html).toContain('data-response-report-workspace="analysis_1"');expect(html).not.toContain('data-response-report-id');
  await h.click('data-response-report-workspace','analysis_1');
  expect(h.workspace.open).toHaveBeenCalledWith('analysis_1');
 });
 it('confirms report detail before returning an analysis for welfare attachment',async()=>{const h=harness();const selection=h.api.chooseReport({programTitle:'지역 모임'});await Promise.resolve();await Promise.resolve();await h.click('data-analysis-report-open','analysis_1');expect(h.nodes['[data-report-library-detail]'].innerHTML).toContain('이 분석에 연결하기');await h.click('data-report-library-confirm');expect((await selection).report_id).toBe('analysis_1');expect(h.library.close).toHaveBeenCalled();});
 it('cancels an analysis picker without opening a workspace',async()=>{const h=harness();const selection=h.api.chooseReport({});await Promise.resolve();await h.click('data-report-library-close');expect(await selection).toBeNull();expect(h.workspace.open).not.toHaveBeenCalled();});
 it('shows a failed GET lookup with a retry and never creates reports',async()=>{const h=harness(()=>{throw Error('offline');});await h.api.openLibrary({});expect(h.nodes['[data-report-library-list]'].innerHTML).toContain('다시 불러오기');expect(h.calls.every(c=>!c.options)).toBe(true);});
 it('escapes stored report titles and untrusted report markup',()=>{const h=harness(),html=h.api.responseArticle({...response,title:'<img src=x onerror=bad()>',markdown:'<script>bad()</script>'});expect(html).toContain('&lt;img');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');});
 it('reuses the structured final preview without opening a second workspace or duplicating its heading',()=>{
  const h=harness(),structured=vi.fn((value:any)=>`<section class="structured-proof"><h3>${value.title}</h3></section>`);
  h.context.window.HERMES_RESPONSE_WORKSPACE.reportHTML=structured;
  const html=h.api.responseArticle(response);
  expect(structured).toHaveBeenCalledWith(response);expect(h.workspace.open).not.toHaveBeenCalled();
  expect(html).toContain('hrw-saved-preview');expect(html.match(/<h3>/g)).toHaveLength(1);
  expect(html).not.toContain('<pre');expect(html).toContain('data-response-parent-open="analysis_1"');
 });
 it('renders stored plan snapshots through the same safe structured renderer as the workspace',()=>{
  const h=harness();
  const workspaceSource=readFileSync(new URL('../../shared/hermi-response-workspace.js',import.meta.url),'utf8');
  new Script(workspaceSource).runInContext(h.context);
  const html=h.api.responseArticle({...response,analysis_snapshot:{scope:report.scope,assessments:[],provenance:{activity:{run_id:'raw-run-id',manifest_sha256:'raw-hash'}}},selected_plans:[{kind:'new_program',title:'<img src=x onerror=bad()>',target:'지역 청년',rationale:'검토 가설',content:'<script>bad()</script>',checks:'수요 확인',feedback:'',version:1}]});
  expect(html).toContain('hrw-report-structured');expect(html).toContain('&lt;img');expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<img');expect(html).not.toContain('<script>');
  expect(html.indexOf('raw-run-id')).toBeGreaterThan(html.indexOf('hrw-report-appendix'));
 });
 it('rejects a mismatched response report identity',async()=>{const h=harness(()=>({...response,report_id:'wrong'}));await expect(h.api.readResponse('response_1')).rejects.toThrow('확인할 수 없습니다');});
 it('passes chosen dashboard region/month to the report library',async()=>{const h=overviewHarness();h.api.testState.rows=[{area_code:'51110',area_name:'춘천시'}];h.api.testState.month='202510';const button={disabled:false};await h.api.testRegion('51110',button);expect(h.openLibrary).toHaveBeenCalledOnce();expect(h.openLibrary.mock.calls[0][0].scope).toEqual({region_code:'51110',month:'202510',region_name:'춘천시'});expect(button.disabled).toBe(false);expect(h.openWorkspace).not.toHaveBeenCalled();});
 it('attaches the selected welfare business to the explicitly chosen analysis',async()=>{const h=overviewHarness();h.api.testState.welfare.result={programs:[{version_id:'program_1',title:'동네 모임',source_url:'https://example.go.kr/program',institution:'춘천시',support_content:'함께 하는 모임'}]};const status={textContent:''},button={disabled:false,parentElement:{querySelector:()=>status}};await h.api.testAttach('program_1',button);expect(h.chooseReport).toHaveBeenCalledWith({programTitle:'동네 모임'});expect(h.openWorkspace).toHaveBeenCalledWith('analysis_1',{program:{program_version_id:'program_1',title:'동네 모임',url:'https://example.go.kr/program',publisher:'춘천시',summary:'함께 하는 모임',target:''}});expect(status.textContent).toContain('검토한 뒤 저장');expect(button.disabled).toBe(false);});
 it('does not attach a welfare business when analysis selection is cancelled',async()=>{const h=overviewHarness();h.chooseReport.mockResolvedValueOnce(null);h.api.testState.welfare.result={programs:[{version_id:'program_1',title:'사업'}]};const button={disabled:false,parentElement:{querySelector:()=>({textContent:''})}};await h.api.testAttach('program_1',button);expect(h.openWorkspace).not.toHaveBeenCalled();});
});
