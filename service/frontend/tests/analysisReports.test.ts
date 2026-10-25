import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {execFileSync} from 'node:child_process';

const adapter=readFileSync(new URL('../scripts/hermes-live-adapter.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../../shared/hermi-analysis-reports.js',import.meta.url),'utf8');
const ages=['20G','30G','40G','50G','60GU'];
function saved(request:Record<string,string>){
 return {report_id:'saved-'+(request.sex_code||'all')+'-'+(request.age_code||'all'),scope:request,created_at:'2026-10-25',rule_version:'signal-5pct-v1',threshold_percent:5,quality_status:'hold',operational_alert_allowed:false,context:{i5:{status:'unavailable'},mois:{status:'unavailable'}},markdown:'# 현황 보고서\n\n검토 필요',assessments:(request.sex_code?[request.sex_code]:['MAN','WMAN']).flatMap(sex=>(request.age_code?[request.age_code]:ages).map(age=>({scope:{region_code:request.region_code,month:request.month,sex_code:sex,age_code:age},category:'single_source_decline',category_label:'단일 원천 감소',sources:{skt:{change_percent:-8},card_a:{change_percent:-2}},signals:{joint_decline:false,two_month_streak:null},reasons:['통신만 감소 기준 충족'],quality_reasons:['원자료 품질 확인 필요'],quality_status:'hold',operational_alert_allowed:false,evidence_ids:['evidence-'+sex+'-'+age]})))};
}
function withoutActivity(report:ReturnType<typeof saved>) {
 const sexes=report.scope.sex_code?[report.scope.sex_code]:['MAN','WMAN'];
 const groups=report.scope.age_code?[report.scope.age_code]:ages;
 return {...report,assessments:[],report_status:'partial',context_investigation_status:'not_applicable',
  activity_availability:{status:'unavailable',spatial_unit:'sgg',region_code:report.scope.region_code,
   requested_group_count:sexes.length*groups.length,observed_group_count:0,
   missing_groups:sexes.flatMap(sex=>groups.map(age=>({sex_code:sex,age_code:age})))},
  context:{i5:{status:'available',record:{record_id:'i5-dong',area_code:report.scope.dong_code,area_name:'청운효자동',spatial_unit:'administrative_dong',i5_reference:37.2,isolation_index:37.2}},mois:{status:'unavailable'}}};
}
function harness(change?:(r:ReturnType<typeof saved>)=>ReturnType<typeof saved>,fail=false){
 const calls:{path:string;request:Record<string,string>}[]=[];
 const context=createContext({Map,Set,Date,URL,URLSearchParams,Promise,Number,String,Error,structuredClone,clone:structuredClone,AGES:ages,LABEL:{'20G':'20대','30G':'30대'},DOM:{},scopeOf:(s:unknown)=>s,validate:(s:unknown)=>s,now:()=> '2026-10-25',
 originalFetch:async(path:string,options:{body:string})=>{const request=JSON.parse(options.body);calls.push({path,request});if(fail)throw Error('analysis server offline');const report=saved(request);return {ok:true,headers:{get:()=> 'application/json'},json:async()=>change?change(report):report};}});
 new Script(adapter+'\nglobalThis.run=liveAnalysisReports;globalThis.brief=liveBriefFor;').runInContext(context);
 return {calls,context,run:context.run as (s:object)=>Promise<any[]>};
}
const scope={region_level:'sgg',region_code:'11680',month:'202511',sex_codes:['MAN'],age_codes:['20G']};
describe('saved activity report boundary',()=>{
 it('submits selected groups and retains the server category without recalculation',async()=>{
  const h=harness(r=>({...r,assessments:r.assessments.map(a=>({...a,category_label:'서버 검토 결과',sources:{skt:{change_percent:10},card_a:{change_percent:5}}}))}));
  const [report]=await h.run(scope);
  expect(h.calls).toEqual([{path:'/api/model/analysis-reports',request:{region_code:'11680',month:'202511',sex_code:'MAN',age_code:'20G'}},{path:'/api/model/analysis-reports/saved-MAN-20G/investigate',request:{}}]);
  expect(report.assessments[0].category_label).toBe('서버 검토 결과');
 });
 it('keeps the selected dong in subgroup reports while activity uses the parent SGG',async()=>{
  const h=harness();const reports=await h.run({...scope,region_level:'administrative_dong',region_code:'1168051000',sex_codes:[],age_codes:['20G','30G']});
  expect(h.calls.filter(x=>!x.path.endsWith('/investigate')).map(x=>x.request)).toEqual([{region_code:'11680',dong_code:'1168051000',month:'202511',age_code:'20G'},{region_code:'11680',dong_code:'1168051000',month:'202511',age_code:'30G'}]);
  expect(reports.flatMap(r=>r.assessments)).toHaveLength(4);
  expect(reports.every(r=>r.scope.dong_code==='1168051000')).toBe(true);
  expect(reports.flatMap(r=>r.assessments).every(a=>a.scope.region_code==='11680'&&!a.scope.dong_code)).toBe(true);
 });
 it('rejects a dong report response that silently drops or changes the selected dong',async()=>{
  const selected={...scope,region_level:'administrative_dong',region_code:'1168051000'};
  await expect(harness(r=>({...r,scope:{...r.scope,dong_code:''}})).run(selected)).rejects.toThrow('지역 또는 관측월');
  await expect(harness(r=>({...r,scope:{...r.scope,dong_code:'1168052000'}})).run(selected)).rejects.toThrow('지역 또는 관측월');
 });
 it('accepts an explicit I5-only dong report and skips activity cause investigation',async()=>{
  const h=harness(withoutActivity);
  const selected={...scope,region_level:'administrative_dong',region_code:'1111051500',sex_codes:[],age_codes:[]};
  const [report]=await h.run(selected);
  expect(report.assessments).toEqual([]);expect(report.report_status).toBe('partial');
  expect(report.activity_availability.missing_groups).toHaveLength(10);
  expect(h.calls).toHaveLength(1);expect(h.calls[0].path).toBe('/api/model/analysis-reports');
  h.context.testPacket={scope:selected,i5:[report.context.i5.record],activity:[],parent_activity:[]};
  new Script('livePacket=async()=>testPacket;').runInContext(h.context);
  const brief=await h.context.brief({case_id:'i5-only',executions:[{execution_id:'run1'}],request:{...selected,purpose:'현황 보고서를 만들어 줘'}});
  expect(brief.summary.join(' ')).toContain('I5를 담은 부분 현황 보고서');
  expect(brief.summary.join(' ')).not.toContain('0개 집단을 구분');
  expect(brief.summary.join(' ')).not.toContain('미완료');
  expect(brief.model_called).toBe(false);
 });
 it('rejects empty dong assessments without explicit complete availability and matching I5',async()=>{
  const selected={...scope,region_level:'administrative_dong',region_code:'1111051500',sex_codes:[],age_codes:[]};
  await expect(harness(r=>({...r,assessments:[]})).run(selected)).rejects.toThrow('일부가 빠졌');
  await expect(harness(r=>{const report=withoutActivity(r);report.activity_availability.missing_groups=[];return report;}).run(selected)).rejects.toThrow('활동 자료 범위');
  await expect(harness(r=>{const report=withoutActivity(r);report.context.i5.record.area_code='1111053000';return report;}).run(selected)).rejects.toThrow('행정동 I5');
 });
 it('requests whole groups once without converting them to a default male/20s group',async()=>{
  const h=harness();const reports=await h.run({...scope,sex_codes:[],age_codes:[]});
  expect(h.calls[0].request).toEqual({region_code:'11680',month:'202511'});
  expect(reports[0].assessments).toHaveLength(10);
 });
 it('rejects a successful response containing the wrong group or missing groups',async()=>{
  await expect(harness(r=>({...r,assessments:r.assessments.map(a=>({...a,scope:{...a.scope,sex_code:'WMAN'}}))})).run(scope)).rejects.toThrow('요청 범위');
  await expect(harness(r=>({...r,assessments:[]})).run(scope)).rejects.toThrow('일부가 빠졌');
 });
 it('never substitutes a stored or embedded report after an API failure',async()=>{
  await expect(harness(undefined,true).run(scope)).rejects.toThrow('analysis server offline');
 });
 it('does not create an unspecified national report',async()=>{
  const h=harness();expect(await h.run({...scope,region_level:'national',region_code:null})).toEqual([]);expect(h.calls).toHaveLength(0);
 });
 it('creates the first report without requiring the welfare API and contains a later welfare failure',async()=>{
  const h=harness();h.context.testPacket={scope,i5:[],activity:[],parent_activity:[]};h.context.supportCalls=0;
  new Script('livePacket=async()=>testPacket;liveSupports=async()=>{supportCalls++;throw Error("복지 서버 연결 실패")};').runInContext(h.context);
  const brief=await h.context.brief({case_id:'case1',executions:[{execution_id:'run1'}],request:{...scope,purpose:'현재 활동을 분석해 줘'}});
  expect(h.context.supportCalls).toBe(0);expect(brief.server_analysis_reports).toHaveLength(1);
  const later=await h.context.brief({case_id:'case2',executions:[{execution_id:'run2'}],request:{...scope,purpose:'관련 복지 지원을 확인해 줘'}});
  expect(h.context.supportCalls).toBe(1);expect(later.server_analysis_reports).toHaveLength(1);expect(later.excluded_candidates[0].reason).toBe('복지 서버 연결 실패');
 });
 it('escapes report content and keeps saved details without repeated storage guidance',()=>{
  const context=createContext({window:{},URL,Number,JSON});new Script(renderer).runInContext(context);
  const report=saved({region_code:'11680',month:'202511',sex_code:'MAN',age_code:'20G'});
  report.assessments[0].category_label='<img src=x onerror=bad()>';report.markdown='<script>bad()</script>';
  const html=context.window.HERMES_ANALYSIS_REPORTS.render([report]);
  expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).not.toContain('<script>');
  expect(html).toContain('보고서 번호: '+report.report_id);expect(html).toContain('자료·보고서 전문');expect(html).not.toContain('별도로 이 브라우저');expect(html).toContain('class="harl-assessment" open');
  expect(html).toContain('통신만 감소 기준 충족');
 });
 it('shows the selected dong name and labels parent activity explicitly',()=>{
  const context=createContext({window:{},URL,Number,JSON});new Script(renderer).runInContext(context);
  const report={...saved({region_code:'11680',dong_code:'1168051000',month:'202511',sex_code:'MAN',age_code:'20G'}),
   region_name:'강남구 신사동',context:{i5:{status:'available',record:{region_name:'강남구',area_name:'신사동',i5_reference:37}},
    mois:{status:'unavailable'},activity_scope:{region_name:'강남구',region_code:'11680',spatial_unit:'sgg'}}};
  const html=context.window.HERMES_ANALYSIS_REPORTS.render([report]);
  expect(html).toContain('강남구 신사동');
  expect(html).toContain('활동 변화는 상위 시군구 강남구의 참고 자료');
  expect(html).toContain('선택 행정동의 직접 활동 관측이 아닙니다');
  expect(html).toContain('I5 신사동 37점');
 });
 it('renders I5-only partial reports without activity categories or an investigation action',()=>{
  const context=createContext({window:{},URL,Number,JSON});new Script(renderer).runInContext(context);
  const report=withoutActivity(saved({region_code:'11110',dong_code:'1111051500',month:'202512'}));
  const html=context.window.HERMES_ANALYSIS_REPORTS.render([report]);
  expect(html).toContain('행정동 I5를 담은 부분 현황 보고서');
  expect(html).toContain('활동 자료가 없어 활동 범주를 판정하지 않았습니다');
  expect(html).toContain('I5 청운효자동 37.2점');
  expect(html).not.toContain('data-analysis-report-investigate');
  expect(html).not.toContain('class="harl-assessment"');
 });
 it('shows server-provided robust values and keeps plain-language quality text readable',()=>{
  const context=createContext({window:{HERMI_COPY:{text:(value:unknown)=>String(value).replaceAll('품질 보류','자료 확인 필요')}},URL,Number,JSON});new Script(renderer).runInContext(context);
  const report=saved({region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'});
  Object.assign(report.assessments[0],{robust_evidence:{cutoff:3.5,sources:{skt:{z:8.8},card_a:{z:0.91}}},reasons:['원자료 품질 보류 상태를 유지합니다.']});
  const html=context.window.HERMES_ANALYSIS_REPORTS.render([report]);
  expect(html).toContain('통신 z 8.80 · 카드 z 0.91 · 모델 기준 z 3.50');
  expect(html).toContain('원자료 확인 필요 상태');expect(html).not.toContain('자료 자료');
 });
 it('keeps regeneration idempotent and the embedded adapter exactly synchronized',()=>{
  const path=new URL('../../shared/hermes-complete.html',import.meta.url).pathname;
  const script=new URL('../scripts',import.meta.url).pathname;
  execFileSync('python3',['-c','import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from hermes_analysis_reports import patch_analysis_reports;p=Path(sys.argv[2]);s=p.read_text();assert patch_analysis_reports(s)==s',script,path]);
  const html=readFileSync(path,'utf8');expect(html).toContain(adapter);
  expect(html).toContain('if(e.detail.threadId!==activeThreadId)return;');
 });
});
