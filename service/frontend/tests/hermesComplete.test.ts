import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const source=readFileSync(new URL('../scripts/hermes-live-adapter.js',import.meta.url),'utf8');
const fixture={contract_version:'welfare_research_pipeline_v1',operational_alert_allowed:false,welfare_data_synthetic:true,mapping:{reasons:['신호 연결 · 고저 판단 아님']},recommendations:[{is_synthetic:true,version_id:'v1',title:'[가상] 지원',support_content:'모임',observation_reasons:[{domain:'P',score:51,i5_record_id:'i5',behavior_record_id:'v3'}],unconfirmed_conditions:['개인 자격']}],excluded:[{title:'종료',exclusion_reasons:['기간 종료']}],held:[{title:'보류',unconfirmed_conditions:['원문 미확인']}]};
function harness(fail=false,response:object=fixture){
 const calls:string[]=[];
 const ctx=createContext({Map,Set,Date,URL,URLSearchParams,Promise,Number,String,Error,structuredClone,clone:structuredClone,
  AGES:['20G','30G','40G','50G','60GU'],LABEL:{'20G':'20대','30G':'30대'},DOM:{P:'참여'},
  scopeOf:(s:unknown)=>s,validate:(s:unknown)=>s,
  originalFetch:async(path:string)=>{calls.push(path);if(fail)throw Error('server offline');return {ok:true,headers:{get:()=> 'application/json'},json:async()=>structuredClone(response)};}
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
 it('preserves real source metadata without labeling a real program as an example',async()=>{
  const real=structuredClone(fixture);real.welfare_data_synthetic=false;
  Object.assign(real.recommendations[0],{is_synthetic:false,title:'등록 사업',institution:'담당 부서',source:{name:'공공 자료 제공처'},source_url:'https://example.gov/program?id=1',source_url_type:'official_source',source_hash:'source-hash',retrieved_at:'2026-10-24'});
  const result=await harness(false,real).run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(result.synthetic).toBe(false);
  expect(result.verified_candidates[0]).toMatchObject({synthetic:false,institution:'담당 부서',url:'https://example.gov/program?id=1',source_url_type:'official_source',source_hash:'source-hash',retrieved_at:'2026-10-24'});
  expect(result.verified_candidates[0].institution).not.toContain('예시');
 });
 it.each(['javascript:alert(1)','https://user:password@example.gov/','not-a-url',null])('does not expose an unsafe or missing source link %s',async url=>{
  const real=structuredClone(fixture);real.welfare_data_synthetic=false;
  Object.assign(real.recommendations[0],{is_synthetic:false,source_url:url,source:{name:'공공 자료 제공처'}});
  const result=await harness(false,real).run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(result.verified_candidates[0].url).toBeNull();
  expect(result.verified_candidates[0].institution).toBe('공공 자료 제공처');
 });
 it('keeps source type unknown when the API does not identify the corpus',async()=>{
  const unknown={...fixture,welfare_data_synthetic:undefined,recommendations:fixture.recommendations.map(({is_synthetic,...p})=>({...p,source_url:'https://example.gov/'}))};
  const result=await harness(false,unknown).run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(result.synthetic).toBeNull();
  expect(result.verified_candidates[0]).toMatchObject({synthetic:null,institution:'출처 확인 필요',url:null});
 });
 it('shows an unconfigured remote recommendation mapping once across all subgroups',async()=>{
  const reason='배포된 복지 DB의 9개 분류와 I5 영역을 연결하는 검토된 기준이 없어 자동 추천을 보류합니다. 복지 목록에서 실제 사업을 검색할 수 있습니다.';
  const held={...fixture,status:'held',data_source:'supabase',welfare_data_synthetic:false,mapping_status:'unconfigured',mapping:{status:'held',reasons:['앞선 분석 맥락',reason]},recommendations:[],excluded:[],held:[]};
  const result=await harness(false,held).run({region_code:'11680',month:'202508',sex_codes:['MAN','WMAN'],age_codes:['20G']});
  expect(result.verified_candidates).toEqual([]);
  expect(result.unverified_candidates).toEqual([{title:'추천 연결 기준 확인 필요',reason}]);
  expect(result.synthetic).toBe(false);
 });
 it('does not turn an unrelated no-signal result into a mapping hold',async()=>{
  const noSignal={...fixture,status:'no_signal',mapping_status:'unconfigured',recommendations:[],excluded:[],held:[]};
  const result=await harness(false,noSignal).run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(result.unverified_candidates).toEqual([]);
 });
 it('preserves an institution-homepage link as a homepage rather than a program document',async()=>{
  const real=structuredClone(fixture);real.welfare_data_synthetic=false;
  Object.assign(real.recommendations[0],{is_synthetic:false,source_url:'https://example.gov/',source_url_type:'official_site'});
  const result=await harness(false,real).run({region_code:'11680',month:'202508',sex_codes:['MAN'],age_codes:['20G']});
  expect(result.verified_candidates[0]).toMatchObject({url:'https://example.gov/',source_url_type:'official_site'});
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
