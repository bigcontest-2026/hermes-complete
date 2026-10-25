import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {execFileSync} from 'node:child_process';
const source=readFileSync(new URL('../../shared/hermi-lifecycle-guide.js',import.meta.url),'utf8');
function report(){
 const scope={region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'};
 return {scope,assessments:[{scope:{...scope},category_label:'우선 검토 후보'}],lifecycle_interpretation:{
 guide_version:'lifecycle-guide-test',guide_sha256:'test-only',scope:{...scope},source:{title:'원문 생애주기 연구',authors:['연구자'],publisher:'공공 연구기관',doi:'https://doi.org/10.23060/kihasa.b.2025.07',publication_month:'2025-12',pages:[19,20,30]},
 changes_activity_classification:false,automatic_welfare_mapping:false,support_need_status:'unconfirmed',boundaries:['지역 위험이나 개인 자격을 확정하지 않습니다.'],comparison_checks:['다른 집단의 변화와 자료 범위 변경을 확인합니다.'],
 groups:[{scope:{...scope},hypotheses:[{id:'lifecycle:20G:context',text:'교육·경제적 독립과 관계 형성의 변화를 확인합니다.',status:'unverified'}],questions:['같은 지역·기간의 공개 근거가 있습니까?'],boundaries:['문헌은 19~29세이며 모델은 20~29세입니다.'],interpretation_status:'questions_only',support_need_status:'unconfirmed'}]},
 context_investigation:{sources:[{source_id:'source_1',title:'지역 맥락 원문'}],lifecycle_checks:[] as any[]}};
}
function harness(){const context=createContext({window:{},URL,Set,Array,String,Object,Error});new Script(source).runInContext(context);return context.window.HERMES_LIFECYCLE_GUIDE;}
describe('lifecycle interpretation view',()=>{
 it('retains the observed category and shows age-specific questions as hypotheses',()=>{
  const r=report(),before=structuredClone(r),html=harness().render(r);
  expect(r).toEqual(before);expect(r.assessments[0].category_label).toBe('우선 검토 후보');
  for(const text of ['생애주기·지역 맥락','가설 · 지원 필요 미확인','남성 20대','확인 전 가설','교육·경제적 독립','같은 지역·기간','19~29세'])expect(html).toContain(text);
  expect(html).toContain('https://doi.org/10.23060/kihasa.b.2025.07');
  expect(html).toMatch(/^<details class="hlg-guide"[^>]*><summary/);expect(html).not.toContain('class="hlg-flow"');
 });
 it('retains all ten original sex/age groups without a default male group',()=>{
  const r:any=report();r.scope.sex_code=null;r.scope.age_code=null;r.lifecycle_interpretation.scope={...r.scope};
  const ages=['20G','30G','40G','50G','60GU'],template=r.lifecycle_interpretation.groups[0];
  r.lifecycle_interpretation.groups=['MAN','WMAN'].flatMap(sex=>ages.map(age=>({...structuredClone(template),scope:{...r.scope,sex_code:sex,age_code:age}})));
  r.assessments=r.lifecycle_interpretation.groups.map((item:any)=>({scope:{...item.scope}}));
  const html=harness().render(r);expect((html.match(/class="hlg-group"/g)||[])).toHaveLength(10);expect(html).toContain('여성 60세 이상');
 });
 it('rejects scope drift, missing groups and automatic confirmation',()=>{
  for(const change of [(r:any)=>r.lifecycle_interpretation.scope.month='202511',(r:any)=>r.lifecycle_interpretation.groups=[],(r:any)=>r.lifecycle_interpretation.groups[0].scope.age_code='30G',(r:any)=>r.lifecycle_interpretation.support_need_status='confirmed',(r:any)=>r.lifecycle_interpretation.automatic_welfare_mapping=true,(r:any)=>r.lifecycle_interpretation.groups[0].hypotheses[0].status='confirmed']){
   const r=report();change(r);expect(()=>harness().render(r)).toThrow();
  }
 });
 it('requires exact hypothesis, scope and independently verified source for regional checks',()=>{
  const r=report();r.context_investigation.lifecycle_checks=[{hypothesis_id:'lifecycle:20G:context',scope:{...r.scope},status:'supported_context',text:'같은 시기의 지역 맥락이 확인됐습니다.',source_ids:['source_1']}];
  const html=harness().render(r);expect(html).toContain('관련 지역 맥락 확인');expect(html).toContain('지역 맥락 원문');expect(html).toContain('개인의 생애사건·지원 필요를 확정하지 않습니다.');
  for(const patch of [{source_ids:[]},{source_ids:['literature_source']},{scope:{...r.scope,month:'202512'}},{hypothesis_id:'unknown'}]){
   const changed=structuredClone(r);Object.assign(changed.context_investigation.lifecycle_checks[0],patch);expect(()=>harness().render(changed)).toThrow();
  }
 });
 it('escapes guidance and refuses unsafe literature links',()=>{
  const r=report(),payload='<img src=x onerror=bad()>';
  r.lifecycle_interpretation.source.title=payload;r.lifecycle_interpretation.source.doi='javascript:alert(1)';r.lifecycle_interpretation.groups[0].hypotheses[0].text=payload;
  const html=harness().render(r);expect(html).toContain('&lt;img');expect(html).not.toContain('<img');expect(html).not.toContain('href="javascript:');
 });
 it('does not retrofit an immutable earlier report',()=>{
  const r:any=report();delete r.lifecycle_interpretation;expect(harness().render(r)).toBe('');
 });
 it('marks questions for groups with no activity observation',()=>{
  const r:any=report();r.lifecycle_interpretation.groups[0].observation_status='unavailable';
  expect(harness().render(r)).toContain('활동 관측 없음 · 연령별 확인 질문만 제시합니다.');
 });
 it('keeps guide assets and frozen-guide checks after regeneration',()=>{
  const html=readFileSync(new URL('../../shared/hermes-complete.html',import.meta.url),'utf8');
  expect(html).toContain('hermi-lifecycle-guide.js');expect(html).toContain('hermi-lifecycle-guide.css');
  const renderer=readFileSync(new URL('../../shared/hermi-analysis-reports.js',import.meta.url),'utf8');expect(renderer).toContain('HERMES_LIFECYCLE_GUIDE?.render(report)');
  const adapter=readFileSync(new URL('../scripts/hermes-live-adapter.js',import.meta.url),'utf8');expect(adapter).toContain("'operational_alert_allowed','lifecycle_interpretation'");
  const path=new URL('../../shared/hermes-complete.html',import.meta.url).pathname,scripts=new URL('../scripts',import.meta.url).pathname;
  execFileSync('python3',['-c','import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from hermes_analysis_reports import patch_analysis_reports;from hermes_activity_views import patch_activity_views;s=Path(sys.argv[2]).read_text();assert patch_activity_views(patch_analysis_reports(s))==s',scripts,path]);
 });
});
