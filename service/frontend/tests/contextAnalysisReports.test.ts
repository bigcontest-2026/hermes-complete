import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const adapter=readFileSync(new URL('../scripts/hermes-live-adapter.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../../shared/hermi-analysis-reports.js',import.meta.url),'utf8');
const ages=['20G','30G','40G','50G','60GU'];
function baseline() {
 return {report_id:'analysis_original',storage_status:'saved',report_type:'observation_analysis',context_investigation_status:'not_performed',scope:{region_code:'11680',month:'202511',sex_code:'MAN',age_code:'20G'},created_at:'2026-10-25',rule_version:'signal-5pct-v1',threshold_percent:5,quality_status:'hold',operational_alert_allowed:false,context:{i5:{status:'unavailable'},mois:{status:'unavailable'}},provenance:{activity:{run_id:'activity1'},survey:{run_id:'survey1'}},markdown:'# 관측 보고서\n검토 필요',assessments:[{scope:{region_code:'11680',month:'202511',sex_code:'MAN',age_code:'20G'},category:'single_source_decline',category_label:'단일 감소 관찰',sources:{skt:{change_percent:-8},card_a:{change_percent:-2}},signals:{joint_decline:false,two_month_streak:null},reasons:['통신만 감소 기준 충족'],quality_reasons:['원자료 품질 확인 필요'],quality_status:'hold',operational_alert_allowed:false,evidence_ids:['behavior1']}]};
}
function enriched(base=baseline()) {
 return {...base,report_id:'analysis_researched',parent_report_id:base.report_id,report_type:'context_cause_analysis',context_investigation_status:'completed',markdown:'# 현황·원인 분석 보고서\n지역 맥락과 가설',context_investigation:{status:'completed',summary:'공개 자료에서 지역 맥락을 확인했습니다.',observed_context:[{text:'공식 자료에 해당 기간 공사가 기재되어 있습니다.',source_ids:['source-1']}],possible_causes:[{title:'활동 장소 변화 가능성',explanation:'공사와 관측 변화의 관계는 추가 확인이 필요합니다.',source_ids:['source-1'],limitations:['개별 활동의 원인을 증명하지 않습니다.']}],verification_questions:['관측 지역과 공사 범위가 일치합니까?'],sources:[{source_id:'source-1',title:'공식 공사 안내',url:'https://example.go.kr/notice',publisher:'공공기관',published_at:'2025-11-01',reference_period:'2025년 11월',accessed_at:'2026-10-25'}],search_queries:['강남구 2025년 11월 공사'],limitations:['관측 단위가 일치하는지 확인해야 합니다.']}};
}
const scope={region_level:'sgg',region_code:'11680',month:'202511',sex_codes:['MAN'],age_codes:['20G']};
function adapterHarness(research:ReturnType<typeof enriched>|Error=enriched()) {
 const calls:string[]=[];
 const context=createContext({Map,Set,Date,URL,URLSearchParams,Promise,Number,String,Error,structuredClone,clone:structuredClone,AGES:ages,LABEL:{'20G':'20대'},DOM:{},scopeOf:(s:unknown)=>s,validate:(s:unknown)=>s,now:()=> '2026-10-25',
 originalFetch:async(path:string)=>{calls.push(path);if(path.endsWith('/investigate')&&research instanceof Error)throw research;return {ok:true,headers:{get:()=> 'application/json'},json:async()=>path.endsWith('/investigate')?research:baseline()};}});
 new Script(adapter+'\nglobalThis.run=liveAnalysisReports;globalThis.brief=liveBriefFor;').runInContext(context);
 return {calls,context,run:context.run as (s:object)=>Promise<any[]>};
}
function rendererHarness(handler?:(path:string,options?:any)=>unknown){
 const calls:{path:string;options:any}[]=[];
 const context=createContext({window:{},URL,Number,JSON,Map,Promise,Error,fetch:async(path:string,options:any)=>{
  calls.push({path,options});const result=await handler?.(path,options);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>result};
 }});new Script(renderer).runInContext(context);
 return {calls,api:context.window.HERMES_ANALYSIS_REPORTS};
}
describe('context/cause analysis report UI',()=>{
 it('investigates after saving the observation and returns the saved research result',async()=>{
  const h=adapterHarness();const [report]=await h.run(scope);
  expect(h.calls).toEqual(['/api/model/analysis-reports','/api/model/analysis-reports/analysis_original/investigate']);
  expect(report.report_id).toBe('analysis_researched');expect(report.parent_report_id).toBe('analysis_original');
 });
 it.each(['현황 원인 보고서 만들어 줘','복지 현황·원인 보고서 만들어 줘'])('does not call welfare while producing the first report: %s',async purpose=>{
  const h=adapterHarness();h.context.testPacket={scope,i5:[],activity:[],parent_activity:[]};h.context.supportCalls=0;
  new Script('livePacket=async()=>testPacket;liveSupports=async()=>{supportCalls++;throw Error("should not call welfare")};').runInContext(h.context);
  const brief=await h.context.brief({case_id:'case1',executions:[{execution_id:'run1'}],request:{...scope,purpose}});
  expect(h.context.supportCalls).toBe(0);expect(brief.model_called).toBe(true);
  expect(brief.investigation.observed_facts).toContain(enriched().context_investigation.observed_context[0].text);
  expect(brief.investigation.alternative_explanations[0]).toContain('활동 장소 변화 가능성');
 });
 it('preserves observations and reports incomplete research with a retry action after failure',async()=>{
  const [report]=await adapterHarness(Error('원인 조사 서버 연결 실패')).run(scope);
  expect(report.context_investigation_status).toBe('not_performed');expect(report.investigation_error).toBe('원인 조사 서버 연결 실패');
  expect(report.report_id).toBe('analysis_original');
  const html=rendererHarness().api.render([report]);expect(html).toContain('지역 조사 미완료');expect(html).toContain('원인 조사 서버 연결 실패');expect(html).toContain('data-analysis-report-investigate="analysis_original"');
 });
 it.each(['scope','region_name','assessments','activity_availability','report_status','provenance','quality_status'])('does not accept research that changes frozen %s',async field=>{
  const report:any=enriched();
  if(field==='scope')report.scope={...report.scope,month:'202512'};
  if(field==='region_name')report.region_name='잘못 바꾼 지역';
  if(field==='assessments')report.assessments=report.assessments.map((a:any)=>({...a,category:'priority_review'}));
  if(field==='activity_availability')report.activity_availability={status:'unavailable'};
  if(field==='report_status')report.report_status='partial';
  if(field==='provenance')report.provenance={activity:{run_id:'different'}};
  if(field==='quality_status')report.quality_status='ok';
  const [result]=await adapterHarness(report).run(scope);
  expect(result.report_id).toBe('analysis_original');expect(result.investigation_error).toContain('범위 또는 근거');
 });
 it('keeps no-evidence research distinct from an unavailable investigation',async()=>{
  const report=enriched();report.context_investigation_status='no_evidence';report.context_investigation.status='no_evidence';report.context_investigation.sources=[];report.context_investigation.observed_context=[];report.context_investigation.possible_causes=[];
  const [result]=await adapterHarness(report).run(scope);expect(result.investigation_error).toBeUndefined();
  const html=rendererHarness().api.render([result]);expect(html).toContain('조사 완료 · 관련 근거 부족');expect(html).not.toContain('data-analysis-report-investigate=');
 });
 it('shows citations, dates and hypothesis limitations',()=>{
  const html=rendererHarness().api.render([enriched()]);
  expect(html).toContain('https://example.go.kr/notice');expect(html).toContain('가능한 원인과 확인할 가설');expect(html).toContain('2025-11-01');expect(html).toContain('2026-10-25');expect(html).toContain('인과관계를 확정한 결과는 아닙니다');
 });
 it('escapes sources and model text and does not create unsafe links',()=>{
  const report=enriched();report.context_investigation.observed_context[0].text='<img src=x onerror=alert(1)>';
  report.context_investigation.sources[0].title='<script>alert(1)</script>';report.context_investigation.sources[0].url='javascript:alert(1)';
  const html=rendererHarness().api.render([report]);expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('javascript:');
 });
 it('shows broader geographic/period scope and escapes the supporting excerpt',()=>{
  const report=enriched();Object.assign(report.context_investigation.sources[0],{region_scope:'전국 <script>bad()</script>',geography_relation:'broader_region',period_relation:'broader_or_other_period',supporting_excerpt:'확인한 문구 <img src=x onerror=bad()> & 추가 근거'});
  const html=rendererHarness().api.render([report]);expect(html).toContain('더 넓은 지역 / 더 넓거나 다른 기간');
  expect(html).toContain('전국 &lt;script&gt;');expect(html).toContain('확인한 문구 &lt;img');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');
 });
 it('does not imply that unlabelled source geography or period matches the observation',()=>{
  const html=rendererHarness().api.render([enriched()]);expect(html).toContain('지역 일치 미확인 / 기간 일치 미확인');
 });
 it('loads server reports and full text without a local browser case',async()=>{
  const report=enriched();const h=rendererHarness(path=>path.includes('?')?{reports:[report],total_matched:1,next_offset:null}:report);
  expect((await h.api.listReports()).reports[0].report_id).toBe(report.report_id);
  expect((await h.api.read(report.report_id)).markdown).toBe(report.markdown);
  expect(h.calls.map(c=>c.path)).toEqual(['/api/model/analysis-reports?limit=20&offset=0','/api/model/analysis-reports/'+report.report_id]);
 });
 it('retries once, shares a pending duplicate request and updates displayed report identity',async()=>{
  const base=baseline(),full=enriched(base);const h=rendererHarness((path,options)=>options?.method==='POST'?full:base);
  const [first,second]=await Promise.all([h.api.investigate(base.report_id),h.api.investigate(base.report_id)]);
  expect(first.report_id).toBe(full.report_id);expect(second.report_id).toBe(full.report_id);
  expect(h.calls.filter(c=>c.options?.method==='POST')).toHaveLength(1);
  expect(h.api.render([base])).toContain('data-saved-analysis-report="'+full.report_id+'"');
 });
 it('rejects a retry result that changes frozen evidence',async()=>{
  const base=baseline(),full=enriched(base);full.threshold_percent=10;
  const h=rendererHarness((path,options)=>options?.method==='POST'?full:base);
  await expect(h.api.investigate(base.report_id)).rejects.toThrow('범위 또는 근거');
 });
 it('allows retrying after a failed research call',async()=>{
  const base=baseline(),full=enriched(base);let attempts=0;
  const h=rendererHarness((path,options)=>{if(options?.method==='POST'){attempts++;if(attempts===1)throw Error('temporarily unavailable');return full;}return base;});
  await expect(h.api.investigate(base.report_id)).rejects.toThrow('temporarily unavailable');
  expect((await h.api.investigate(base.report_id)).report_id).toBe(full.report_id);expect(attempts).toBe(2);
 });
});
