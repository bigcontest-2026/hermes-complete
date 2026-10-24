import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source=readFileSync(new URL('../scripts/hermes-live-adapter.js',import.meta.url),'utf8');
const fixture={contract_version:'welfare_research_pipeline_v1',operational_alert_allowed:false,mapping:{reasons:['신호 연결 · 고저 판단 아님']},recommendations:[{version_id:'v1',title:'[가상] 지원',support_content:'모임',observation_reasons:[{domain:'P',score:51,i5_record_id:'i5',behavior_record_id:'v3'}],unconfirmed_conditions:['개인 자격']}],excluded:[{title:'종료',exclusion_reasons:['기간 종료']}],held:[{title:'보류',unconfirmed_conditions:['원문 미확인']}]};
function harness(fail=false){
 const calls:string[]=[];
 const ctx=createContext({Map,Set,Date,URLSearchParams,Promise,Number,String,Error,structuredClone,clone:structuredClone,
  AGES:['20G','30G','40G','50G','60GU'],LABEL:{'20G':'20대','30G':'30대'},DOM:{P:'참여'},
  scopeOf:(s:unknown)=>s,validate:(s:unknown)=>s,
  originalFetch:async(path:string)=>{calls.push(path);if(fail)throw Error('server offline');return {ok:true,headers:{get:()=> 'application/json'},json:async()=>structuredClone(fixture)};}
 });
 new Script(source+'\nglobalThis.run=liveSupports;').runInContext(ctx);
 return {calls,run:ctx.run as (s:object)=>Promise<any>};
}
describe('Complete HTML live recommendation boundary',()=>{
 it('compiles every executable inline script in the imported artifact',()=>{
  const html=readFileSync(new URL('../../shared/hermes-complete.html',import.meta.url),'utf8');
  let count=0;
  for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
   if(m[1].includes('application/octet-stream')||m[1].includes('application/json'))continue;
   new Script(m[2]);count++;
  }
  expect(count).toBeGreaterThan(3);
 });
 it('uses the parent SGG graph for a dong and preserves unknown, excluded and held conditions',async()=>{
  const h=harness();const result=await h.run({region_level:'administrative_dong',region_code:'1168051000',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(h.calls[0]).toContain('region_code=11680&');
  expect(result.verified_candidates[0].synthetic).toBe(true);
  expect(result.verified_candidates[0].url).toBeNull();
  expect(result.verified_candidates[0].related_reason).toContain('남성 20대');
  expect(result.verified_candidates[0].conditions).toEqual([{label:'개인 자격',status:'unknown'}]);
  expect(result.excluded_candidates[0].reason).toBe('기간 종료');
  expect(result.unverified_candidates[0].reason).toBe('원문 미확인');
 });
 it('merges duplicate programs but keeps the distinct subgroup reasons',async()=>{
  const h=harness();const result=await h.run({region_level:'sgg',region_code:'11680',month:'202508',sex_codes:['MAN','WMAN'],age_codes:['20G']});
  expect(h.calls).toHaveLength(2);expect(result.verified_candidates).toHaveLength(1);
  expect(result.verified_candidates[0].groups).toEqual(['남성 20대','여성 20대']);
 });
 it('does not silently return embedded recommendations after server failure',async()=>{
  const h=harness(true);await expect(h.run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']})).rejects.toThrow('server offline');
 });
 it('requires a region before querying recommendations',async()=>{
  const h=harness();const result=await h.run({region_code:null,month:'202508',sex_codes:[],age_codes:[]});
  expect(h.calls).toHaveLength(0);expect(result.verified_candidates).toHaveLength(0);
  expect(result.unverified_candidates[0].reason).toContain('시군구');
 });
});
