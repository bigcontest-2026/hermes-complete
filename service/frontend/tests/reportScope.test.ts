import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createContext,Script} from 'node:vm';

const html=readFileSync(new URL('../../shared/hermes-complete.html',import.meta.url),'utf8');
const scripts=fileURLToPath(new URL('../scripts/',import.meta.url));
const root=fileURLToPath(new URL('../../../',import.meta.url));
const regenerated=execFileSync('python3',['-c',`
import subprocess,sys
sys.path.insert(0,sys.argv[1])
from hermes_analysis_reports import patch_analysis_reports
from hermes_plain_language import patch_html
original=subprocess.check_output(['git','show','HEAD:service/shared/hermes-complete.html'],cwd=sys.argv[2]).decode().replace('\\r\\n','\\n')
patched=patch_analysis_reports(patch_html(original))
assert patch_analysis_reports(patched)==patched
print(patched)
`,scripts,root],{encoding:'utf8',maxBuffer:8*1024*1024});
const scope={region_level:'sgg',region_code:'11680',month:'202511',sex_codes:['MAN'],age_codes:['20G']};
const record=(id='case-a',s:any=scope)=>({case_id:id,case_version:3,current_brief_id:'brief-'+id,request:{...s,purpose:'지역 활동 확인'},briefs:[{brief_id:'brief-'+id,brief_version:1,model_evidence:{scope:structuredClone(s),i5:[{area_name:id==='case-a'?'강남구':'춘천시'}]},investigation:{observed_facts:['해당 범위의 관측']},support_fields:[{title:'관계망 지원'}],support_candidates:[]}],policy_drafts:[]});
function harness(source=html,records=[record()],read?:(path:string)=>Promise<any>,persisted:any={}){
 const listeners:Record<string,any>={},alerts:string[]=[],calls:{path:string;body:any}[]=[];
 const fields=['name','target','field','owner','content','evaluation_plan'].map(key=>({dataset:{liveDraft:key},value:key==='content'?'작성 중인 내용':key}));
 let mounted=true;let rendered='';
 const content={get innerHTML(){return rendered;},set innerHTML(value:string){rendered=value;mounted=true;}};
 const status={textContent:''};const storage:Record<string,string>={};
 const elements:Record<string,any>={'home-logo':{addEventListener(){}},'live-draft-status':status};
 elements['page-studio']={set innerHTML(_value:string){mounted=false;},querySelector:(selector:string)=>selector==='.live-page-content'?content:{innerHTML:''}};
 const state:any={page:'agent',draft:{},chat:[],history:[]};
 const win:any={location:{search:'',href:'http://localhost/'},addEventListener(){},dispatchEvent(){},HERMES_AGENT:{table(){},detail(){},api:async(path:string,body:any)=>{
  calls.push({path,body});if(path.includes('/regions?'))return {regions:[{code:'11680',name:'강남구'},{code:'51110',name:'춘천시'}]};
  if(path.includes('?limit='))return {cases:structuredClone(records),next_offset:null};
  if(body)return {version:1};if(read)return read(path);
  return structuredClone(records.find(r=>path.endsWith('/'+r.case_id))||records[0]);
 }}};win.parent=win;
 const context=createContext({window:win,location:win.location,URL,URLSearchParams,Map,Set,Date,Number,String,Error,JSON,structuredClone,crypto:{randomUUID:()=> 'new-id'},S:state,persisted,STORE:"legacy-test",localStorage:{setItem:(key:string,value:string)=>{storage[key]=value;}},
  CustomEvent:class{},document:{querySelectorAll:()=>mounted?fields:[],querySelector:(selector:string)=>fields.find(f=>selector.includes('"'+f.dataset.liveDraft+'"')),addEventListener:(event:string,fn:any)=>{listeners[event]=fn;}},
  $:(id:string)=>elements[id]||null,esc:(x:unknown)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),toast:(message:string)=>alerts.push(message),setDrawerVisible(){},navigate(page:string){state.page=page;if(page==='agent')mounted=false;},renderMap(){},renderAnalysis(){},renderCandidates(){},renderWelfare(){},renderStudio(){},renderRecords(){},renderAll(){},chooseRegion(){},renderDrawer(){}});
 new Script(source.match(/^function persist\(\).*$/m)![0]).runInContext(context);
 const start=source.indexOf('/* Keep the approved HERMES shell');
 const end=source.indexOf('\n})();',start);
 new Script(source.slice(start,end)+'\nwindow.testStudio=studioHTML;window.testEnsure=ensureCase;\n})();').runInContext(context);
 const api=win.HERMES_PAGES;
 return {api,win,state,fields,alerts,calls,status,storage,studio:()=>{mounted=true;return win.testStudio();},navigate:(page:string)=>new Script('navigate('+JSON.stringify(page)+')').runInContext(context),rendered:()=>rendered, input:()=>listeners.input({target:{dataset:{liveDraft:'content'},hasAttribute:(key:string)=>key==='data-live-draft'}}),ensure:()=>win.testEnsure(),
  click:async(attribute:string)=>listeners.click({target:{closest:()=>({dataset:{},hasAttribute:(key:string)=>key===attribute})}}),
  changeCase:async(id:string)=>listeners.change({target:{dataset:{},value:id,hasAttribute:(key:string)=>key==='data-live-case-select'}})};
}
const changes=[['region',{region_code:'51110'}],['month',{month:'202512'}],['sex',{sex_codes:['WMAN']}],['age',{age_codes:['30G']}],['spatial unit',{region_level:'administrative_dong'}]] as const;
for(const [label,source] of [['shipped HTML',html],['regenerated import',regenerated]])describe('Legacy draft scope: '+label,()=>{
 it.each(changes)('blocks generation after changing %s',async(_name,change)=>{
  const h=harness(source);await h.api.openCase('case-a');h.api.setScope({...scope,...change});await h.click('data-live-generate-draft');
  expect(h.fields[4].value).toBe('작성 중인 내용');expect(h.alerts.join(' ')).toContain('분석');expect(h.alerts.join(' ')).toContain('조건');
 });
 it.each(changes.flatMap(([name,change])=>['data-live-save-draft','data-live-draft-report'].map(action=>[name,change,action] as const)))('blocks linked writes for changed %s via %s',async(_name,change,action)=>{
  const h=harness(source);await h.api.openCase('case-a');h.api.setScope({...scope,...change});await h.click(action);
  expect(h.calls.filter(c=>c.body)).toEqual([]);expect(h.alerts.join(' ')).toContain('조건');expect(h.fields[4].value).toBe('작성 중인 내용');
 });
 it('does not silently select a saved case from a different sex, age or spatial unit',async()=>{
  for(const change of [{sex_codes:['WMAN']},{age_codes:['30G']},{region_level:'administrative_dong'}]){
   const h=harness(source,[record('case-a',{...scope,...change})]);h.api.setScope(scope);await h.ensure();await h.click('data-live-generate-draft');
   expect(h.fields[4].value).toBe('작성 중인 내용');expect(h.api.getScope()).toEqual(scope);
  }
 });
 it('shows the selected analysis scope and an explicit return action on mismatch',async()=>{
  const h=harness(source);await h.api.openCase('case-a');h.api.setScope({...scope,month:'202512'});const view=await h.studio();
  expect(view).toContain('202511');expect(view).toContain('남성');expect(view).toContain('20대');expect(view).toContain('시군구');expect(view).toContain('data-live-restore-draft-scope');
  await h.click('data-live-restore-draft-scope');expect(h.api.getScope()).toEqual(scope);expect(h.fields[4].value).toBe('작성 중인 내용');
 });
 it('retains editor text per analysis when another saved analysis is selected',async()=>{
  const h=harness(source,[record(),record('case-b',{...scope,region_code:'51110'})]);await h.api.openCase('case-a');await h.studio();h.fields[4].value='강남 검토 중인 내용';
  await h.changeCase('case-b');await h.studio();h.fields[4].value='춘천에서 작성 중';await h.changeCase('case-a');const view=await h.studio();
  expect(view).toContain('강남 검토 중인 내용');expect(view).not.toContain('춘천에서 작성 중');
 });
 it('recovers text preserved before a scope change after reloading the page',async()=>{
  const h=harness(source);await h.api.openCase('case-a');await h.studio();h.fields[4].value='새로고침 후에도 보관할 내용';h.api.setScope({...scope,month:'202512'});
  const restored=harness(source,[record()],undefined,JSON.parse(h.storage['legacy-test']));await restored.api.openCase('case-a');expect(await restored.studio()).toContain('새로고침 후에도 보관할 내용');
 });
 it('preserves edits before same-scope refresh tears down the studio DOM',async()=>{
  const h=harness(source);await h.api.openCase('case-a');await h.studio();h.state.page='studio';h.fields[4].value='같은 조건에서 새로고침해도 남을 내용';
  await h.click('data-live-refresh');expect(h.rendered()).toContain('같은 조건에서 새로고침해도 남을 내용');
  expect(h.state.livePolicyDrafts['case-a'].content).toBe('같은 조건에서 새로고침해도 남을 내용');
 });
 it('preserves edits before leaving the studio menu and restores them on return',async()=>{
  const h=harness(source);await h.api.openCase('case-a');await h.studio();h.state.page='studio';h.fields[4].value='메뉴를 왕복해도 남을 내용';
  h.navigate('agent');expect(h.state.livePolicyDrafts['case-a']?.content).toBe('메뉴를 왕복해도 남을 내용');
  h.navigate('studio');await h.api.renderPage();expect(h.rendered()).toContain('메뉴를 왕복해도 남을 내용');
 });
 it('persists live inputs for a browser reload without a filter or analysis change',async()=>{
  const h=harness(source);await h.api.openCase('case-a');await h.studio();h.fields[4].value='입력 직후 새로고침 복구 내용';h.input();
  const saved=JSON.parse(h.storage['legacy-test']||'{}');expect(saved.livePolicyDrafts?.['case-a']?.content).toBe('입력 직후 새로고침 복구 내용');
  const restored=harness(source,[record()],undefined,saved);await restored.api.openCase('case-a');expect(await restored.studio()).toContain('입력 직후 새로고침 복구 내용');
 });
 it('allows a valid resumed analysis to generate and save its draft',async()=>{
  const h=harness(source);await h.api.openCase('case-a');await h.studio();await h.click('data-live-generate-draft');expect(h.fields[4].value).toContain('강남구의 202511');
  await h.click('data-live-save-draft');expect(h.alerts).toEqual([]);expect(h.calls.filter(c=>c.body)).toEqual([{path:'/api/agent/investigations/case-a/policy-drafts',body:expect.objectContaining({expected_case_version:3,expected_draft_version:0})}]);
 });
 it('rechecks conditions after refreshing the linked case before saving',async()=>{
  let h:ReturnType<typeof harness>;let reading=0;
  h=harness(source,[record()],async()=>{reading++;if(reading===2)h.api.setScope({...scope,month:'202512'});return record();});
  await h.api.openCase('case-a');await h.click('data-live-save-draft');expect(h.calls.filter(c=>c.body)).toEqual([]);expect(h.alerts.join(' ')).toContain('조건');
 });
});
