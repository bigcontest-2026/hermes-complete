import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const source=readFileSync(new URL('../../shared/hermi-response-workspace.js',import.meta.url),'utf8');
const scope={region_code:'51110',month:'202510',sex_code:'MAN',age_code:'20G'};
const plan={plan_id:null,kind:'new_program',title:'복구할 초안',target:'참여 희망 주민',rationale:'분석 이유',content:'임시 실행 내용',checks:'확인 예정',feedback:'작성 의견',selected:true,program_reference:null};
function element(){return {innerHTML:'',textContent:'',hidden:false,disabled:false,open:false,className:'',classList:{toggle:vi.fn()},setAttribute:vi.fn(),addEventListener:vi.fn(),focus:vi.fn(),showModal(){this.open=true;},close(){this.open=false;},querySelector:(_key:string):any=>null,querySelectorAll:()=>[]};}
function harness(conflict=false){
 const nodes=new Map<string,ReturnType<typeof element>>(),dialog=element();
 dialog.querySelector=(key:string)=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);};
 const values=new Map<string,string>();values.set('hermes.response-draft.v1:analysis_root',JSON.stringify({schema_version:1,workspace_analysis_report_id:'analysis_root',scope,server_version:0,plans:[plan],saved_at:'2026-10-25T12:00:00Z'}));
 const request=vi.fn(async(path:string)=>({ok:true,json:async()=>path.endsWith('/response-workspace')?{analysis_report_id:'analysis_root',workspace_analysis_report_id:'analysis_root',version:conflict?2:0,plans:[],reports:[]}:{report_id:'analysis_root',scope,markdown:'# 현황',assessments:[]}}));
 const context=createContext({window:{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}},URL,Date,JSON,Map,Set,Promise,Error,Number,String,fetch:request,
  document:{activeElement:element(),createElement:()=>dialog,body:{appendChild:vi.fn()}}});
 new Script(source).runInContext(context);
 return {api:context.window.HERMES_RESPONSE_WORKSPACE,nodes,values,request};
}
describe('response recovery UI and pending program',()=>{
 it.each([false,true])('disables the primary action while recovery is pending (conflict %s)',async(conflict)=>{
  const h=harness(conflict),c=await h.api.open('analysis_root');
  expect(c.state.recovery.conflict).toBe(conflict);expect(h.nodes.get('[data-hrw-primary]')?.disabled).toBe(true);
  expect(h.nodes.get('[data-hrw-recovery]')?.innerHTML).toContain('data-hrw-recovery-export');
  if(conflict)expect(()=>c.restoreDraft()).toThrow('최신');
 });
 it.each(['restore','discard'])('keeps an imported program when resolving recovery by %s',async(action)=>{
  const h=harness(action==='discard'),c=await h.api.open('analysis_root',{program:{program_version_id:'selected-program',title:'선택한 실제 사업',summary:'선택한 사업 설명'}});
  expect(c.state.pendingProgram?.program_version_id).toBe('selected-program');expect(c.state.plans).toHaveLength(0);
  if(action==='restore')c.restoreDraft();else c.discardDraft();
  expect(c.state.pendingProgram).toBe(null);expect(c.state.recovery).toBe(null);
  expect(c.state.plans.filter((item:any)=>item.program_reference?.program_version_id==='selected-program')).toHaveLength(1);
  if(action==='restore')expect(c.state.plans[0].content).toBe('임시 실행 내용');
  expect(c.state.plans.at(-1).content).toBe('선택한 사업 설명');expect(c.dirty).toBe(true);
  expect(h.nodes.get('[data-hrw-primary]')?.disabled).toBe(false);expect(h.nodes.get('[data-hrw-primary]')?.textContent).toBe('변경 내용 저장');
  const saved=JSON.parse([...h.values.values()][0]);expect(saved.plans.at(-1).program_reference.program_version_id).toBe('selected-program');
 });
});
