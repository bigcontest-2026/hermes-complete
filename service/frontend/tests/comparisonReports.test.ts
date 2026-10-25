import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
const source=readFileSync(new URL('../../shared/hermi-analysis-reports.js',import.meta.url),'utf8');
const base={report_id:'analysis_base',report_type:'observation_analysis',region_name:'춘천시',scope:{region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'},storage_status:'saved',context_investigation_status:'not_performed',quality_status:'hold',operational_alert_allowed:false,assessments:[],context:{},provenance:{},markdown:'# 현황'};
function harness(){
 const calls:any[]=[];
 const context=createContext({window:{},URL,Map,Number,JSON,Promise,Error,fetch:async(path:string,options?:any)=>{
  calls.push({path,options});const ids=options?JSON.parse(options.body).comparison_report_ids||[]:[];
  const data=options?{...base,report_id:'child_'+ids.join('_'),parent_report_id:base.report_id,report_type:'context_cause_analysis',context_investigation_status:'completed',context_investigation:{status:'completed'},comparison_context:{report_ids:ids,reports:[]}}:base;
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>data};
 }});new Script(source).runInContext(context);return {api:context.window.HERMES_ANALYSIS_REPORTS,calls};
}
describe('saved regional comparison UI',()=>{
 it('forwards the selected report IDs and does not coalesce different comparison requests',async()=>{
  const h=harness();const [first,second]=await Promise.all([h.api.investigate(base.report_id,{comparison_report_ids:['area_a']}),h.api.investigate(base.report_id,{comparison_report_ids:['area_b']})]);
  expect(first.comparison_context.report_ids).toEqual(['area_a']);expect(second.comparison_context.report_ids).toEqual(['area_b']);
  expect(h.calls.filter(call=>call.options?.method==='POST')).toHaveLength(2);
 });
 it('identifies an incompatible month, group, area or geographic unit before confirmation',()=>{
  const h=harness(),other={...base,report_id:'other',region_name:'강남구',scope:{...base.scope,region_code:'11680'}};
  expect(h.api.comparisonIssue(base,other)).toBeNull();
  for(const scope of [{...other.scope,month:'202509'},{...other.scope,sex_code:null},{...other.scope,dong_code:'1168051000'}])expect(h.api.comparisonIssue(base,{...other,scope})).toBeTruthy();
  expect(h.api.comparisonIssue(base,base)).toBeTruthy();
 });
 it('shows a saved comparison context without presenting a causal conclusion or unsafe markup',()=>{
  const h=harness(),report={...base,comparison_context:{report_ids:['other'],reports:[{report_id:'other',region_name:'강남구 <script>bad()</script>',scope:{...base.scope,region_code:'11680'},observations:[],quality_status:'hold'}]}};
  const html=h.api.render([report]);expect(html).toContain('함께 비교한 지역');expect(html).toContain('강남구 &lt;script&gt;');expect(html).not.toContain('<script>');expect(html).toContain('인과관계');
 });
 it('shows report saving and the optional next step separately',()=>{
  const html=harness().api.render([base]);expect(html).toContain('현황 보고서 저장됨');expect(html).toContain('나중에');expect(html).toContain('대응안 검토');
 });
});
