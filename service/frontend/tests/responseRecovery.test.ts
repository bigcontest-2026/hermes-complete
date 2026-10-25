import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const source=readFileSync(new URL('../../shared/hermi-response-workspace.js',import.meta.url),'utf8');
const scope={region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'};
function storage(){const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)};}
function harness(saved=storage()){
 const events=new Map<string,Function>();
 const page={addEventListener:vi.fn((name:string,fn:Function)=>events.set(name,fn)),removeEventListener:vi.fn((name:string,fn:Function)=>{if(events.get(name)===fn)events.delete(name);})};
 const context=createContext({window:page,URL,Date,JSON,Map,Set,Promise,Error,Number,String});new Script(source).runInContext(context);
 let version=0;
 const request=vi.fn(async(path:string,options?:any)=>{
  const id=path.split('/')[4];
  if(options?.method==='PUT'){version++;const plans=JSON.parse(options.body).plans.map((plan:any,index:number)=>({...plan,plan_id:plan.plan_id||'saved_'+index,version:1}));return {analysis_report_id:id,workspace_analysis_report_id:'analysis_root',version,plans,reports:[]};}
  return path.endsWith('/response-workspace')?{analysis_report_id:id,workspace_analysis_report_id:'analysis_root',version,plans:[],reports:[]}:{report_id:id,scope:{...scope},markdown:'# 현황',assessments:[]};
 });
 const create=(id='analysis_root',override:any=saved)=>context.window.HERMES_RESPONSE_WORKSPACE.createController(id,{request,storage:override,page});
 return {api:context.window.HERMES_RESPONSE_WORKSPACE,saved,create,events,request,setVersion:(value:number)=>{version=value;}};
}
function edit(controller:any){const plan=controller.add('new_program');controller.edit(plan._key,{title:'함께 걷기 검토',target:'참여 희망 주민',content:'수요와 기존 자원을 확인합니다.',feedback:'운영 시간을 먼저 확인'});}
describe('response draft recovery',()=>{
 it('offers an unsaved draft after reload, restores only by choice, and clears it after server save',async()=>{
  const h=harness(),first=h.create();await first.load();edit(first);expect(h.saved.values.size).toBe(1);first.dispose();
  const next=h.create();await next.load();expect(next.state.plans).toHaveLength(0);expect(next.state.recovery).toBeTruthy();next.restoreDraft();
  expect(next.state.plans[0]).toMatchObject({title:'함께 걷기 검토',feedback:'운영 시간을 먼저 확인',selected:true});expect(next.dirty).toBe(true);
  await next.save();expect(h.saved.values.size).toBe(0);expect(next.dirty).toBe(false);
 });
 it('uses the common analysis family key when investigation changes the report id',async()=>{
  const h=harness(),first=h.create();await first.load();edit(first);first.dispose();
  const child=h.create('analysis_child');await child.load();expect(child.state.recovery).toBeTruthy();child.restoreDraft();expect(child.state.plans[0].title).toBe('함께 걷기 검토');
 });
 it('does not overwrite a newer server workspace when the stored draft version is stale',async()=>{
  const h=harness(),first=h.create();await first.load();edit(first);first.dispose();h.setVersion(2);
  const next=h.create();await next.load();expect(next.state.recovery.conflict).toBe(true);expect(()=>next.restoreDraft()).toThrow('최신');expect(next.state.plans).toHaveLength(0);expect(h.saved.values.size).toBe(1);
 });
 it('makes every authored field and complete nested evidence copyable before discarding a conflicting draft',async()=>{
  const h=harness(),first=h.create();await first.load();
  const p=first.add('existing_program',{program_version_id:'program-reference-unique',title:'사업 참조 이름',publisher:'사업 담당기관',url:'https://example.go.kr/reference'});
  first.edit(p._key,{title:'제목 보존',target:'대상 보존',rationale:'분석 연결 이유 고유값',content:'실행 내용 보존',checks:'실행 전 확인 고유값',feedback:'검토 의견 보존',selected:false,
   policy_review:{eligibility:{status:'confirmed',text:'대상 확인 내용 고유값',evidence:'대상 확인 근거 고유값'},delivery:{status:'not_applicable',text:'이용 경로 내용',evidence:'이용 경로 근거'}},
   support_needs:[{category_code:'housing',status:'confirmed',text:'주거 필요 내용 고유값',evidence:'주거 필요 근거 고유값'}]});
  const snapshot=first.snapshot();first.dispose();h.setVersion(3);const next=h.create();await next.load();
  const html=h.api.recoveryHTML(next.state);
  for(const text of ['제목 보존','대상 보존','분석 연결 이유 고유값','실행 내용 보존','실행 전 확인 고유값','검토 의견 보존','기존 사업 활용','보고서에 포함하지 않음','사업 참조 이름','사업 담당기관','https://example.go.kr/reference','대상 확인 내용 고유값','대상 확인 근거 고유값','이용 경로 내용','이용 경로 근거','주거 필요 내용 고유값','주거 필요 근거 고유값'])expect(html).toContain(text);
  expect(html).toContain('임시 초안이 이 브라우저에서 삭제');
  const encoded=html.match(/data-hrw-recovery-export[^>]*>([\s\S]*?)<\/textarea>/)?.[1];expect(encoded).toBeTruthy();
  const exported=JSON.parse(encoded!.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
  expect(exported.plans).toEqual(snapshot);expect(exported.server_version).toBe(0);
  expect(()=>next.restoreDraft()).toThrow('최신');expect(h.saved.values.size).toBe(1);next.discardDraft();expect(h.saved.values.size).toBe(0);
 });
 it('removes an obsolete temporary draft when an edit returns to the server snapshot',async()=>{
  const h=harness(),c=h.create();await c.load();edit(c);await c.save();const key=c.state.plans[0]._key;const original=c.state.plans[0].title;
  c.edit(key,{title:'취소할 중간 제목'});expect(h.saved.values.size).toBe(1);expect(c.state.localDraftStatus).toBe('saved');
  c.edit(key,{title:original});expect(c.dirty).toBe(false);expect(h.saved.values.size).toBe(0);expect(c.state.localDraftStatus).toBe('ready');
  const event={preventDefault:vi.fn(),returnValue:undefined};h.events.get('beforeunload')?.(event);expect(event.preventDefault).not.toHaveBeenCalled();
  c.dispose();const next=h.create();await next.load();expect(next.state.recovery).toBe(null);
 });
 it('escapes complete recovery content including nested evidence and JSON export',async()=>{
  const h=harness(),c=h.create();await c.load();edit(c);c.edit(c.state.activeKey,{rationale:'</textarea><script>bad()</script>',support_needs:[{category_code:'housing',text:'<img src=x>',evidence:'<svg onload=bad()>'}]});
  c.dispose();const next=h.create();await next.load();const html=h.api.recoveryHTML(next.state);expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x>');expect(html).not.toContain('<svg onload=bad()>');expect(html).toContain('&lt;script&gt;');
 });
 it('keeps drafts isolated from another family and rejects malformed or wrong-scope recovery',async()=>{
  const h=harness(),first=h.create();await first.load();edit(first);first.dispose();
  const [key,value]=[...h.saved.values][0],draft=JSON.parse(value);draft.scope.month='202509';h.saved.setItem(key,JSON.stringify(draft));
  const next=h.create();await next.load();expect(next.state.recovery).toBeNull();expect(next.state.plans).toHaveLength(0);
 });
 it('warns on page exit only with unsaved changes and disposes its listener',async()=>{
  const h=harness(),controller=h.create();await controller.load();const clean={preventDefault:vi.fn(),returnValue:undefined};h.events.get('beforeunload')?.(clean);expect(clean.preventDefault).not.toHaveBeenCalled();
  edit(controller);const dirty={preventDefault:vi.fn(),returnValue:undefined};h.events.get('beforeunload')?.(dirty);expect(dirty.preventDefault).toHaveBeenCalledOnce();
  controller.dispose();expect(h.events.has('beforeunload')).toBe(false);
 });
 it('keeps edits usable and reports when browser draft storage is unavailable',async()=>{
  const h=harness(),controller=h.create('analysis_root',{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}});
  await controller.load();expect(()=>edit(controller)).not.toThrow();expect(controller.dirty).toBe(true);expect(controller.state.localDraftStatus).toBe('unavailable');
 });
});
