import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../../shared/hermi-desktop.js',import.meta.url),'utf8');
const bridge = JSON.parse(execFileSync('python3',['-c',`
from pathlib import Path
import json,re,sys
sys.path.insert(0,sys.argv[1])
from hermes_dong_start import patch_dong_start
html=patch_dong_start(Path(sys.argv[2]).read_text())
assert patch_dong_start(html)==html
print(json.dumps({
 'register':re.search(r'registerDong:(.*?),getCases:',html).group(1),
 'setter':re.search(r'setStartingScope:(.*?),caseHtml,',html).group(1),
 'resolve':'const mentioned='+html.split('  const mentioned=',1)[1].split('  async function briefFor',1)[0],
 'run':'async function runMessage'+html.split('  async function runMessage',1)[1].split('  function enqueue',1)[0],
 'snapshot':'startingScope:initialScope?structuredClone(initialScope):null' in html
}))
`,fileURLToPath(new URL('../scripts/',import.meta.url)),fileURLToPath(new URL('../../shared/hermes-complete.html',import.meta.url))],{encoding:'utf8'}));
const regions = [
  {code:'11680',name:'강남구',province_code:'11',province_name:'서울특별시'},
  {code:'11620',name:'관악구',province_code:'11',province_name:'서울특별시'},
  {code:'51110',name:'춘천시',province_code:'51',province_name:'강원특별자치도'},
];
const row = (code:string,name:string,region='11680') => ({spatial_unit:'administrative_dong',area_code:code,area_name:name,region_code:region,month:'202512'});
function harness(request:(path:string)=>Promise<any>) {
  const context = createContext({window:{HERMES_HTML_READY:{then:()=>({catch:()=>{}})}},URLSearchParams});
  new Script(source).runInContext(context);
  const fetch = vi.fn(request);
  const model = context.window.HERMI_DONG_START.create(fetch);
  return {model,fetch};
}
const result = (records:unknown[],extra={}) => ({records,run_id:'verified-i5',total_matched:records.length,next_offset:null,...extra});

describe('Administrative-dong starting selection',()=>{
  it('loads every page and carries the full selected dong code and hierarchy into the chat scope',async()=>{
    const h=harness(async path=>path.includes('/regions?')?{regions}:
      new URLSearchParams(path.split('?')[1]).get('offset')==='0'
        ? result([row('1168051000','신사동')],{total_matched:2,next_offset:1})
        : result([row('1168052100','논현1동')],{total_matched:2}));
    await h.model.loadCatalog();h.model.setProvince('11');await h.model.setRegion('11680');
    h.model.setDong('1168051000');
    const selected=h.model.scope({month:'202512',sex_codes:['WMAN'],age_codes:['30G']});
    expect(selected).toEqual({region_level:'administrative_dong',region_code:'1168051000',region_name:'서울특별시 강남구 신사동',month:'202512',sex_codes:['WMAN'],age_codes:['30G']});
    expect(h.model.state.dongs).toHaveLength(2);
    expect(h.fetch.mock.calls[1][0]).toContain('level=administrative_dong&region_code=11680&month=202512');
    expect(h.fetch.mock.calls[2][0]).toContain('offset=1');
    selected.age_codes.push('40G');
    expect(h.model.scope().age_codes).toEqual([]);
  });
  it('does not silently treat a province or district choice as an administrative-dong selection',async()=>{
    const h=harness(async path=>path.includes('/regions?')?{regions}:result([row('1168051000','신사동')]));
    await h.model.loadCatalog();h.model.setProvince('11');await h.model.setRegion('11680');
    expect(h.model.scope()).toBeNull();
    h.model.setDong('11620');expect(h.model.scope()).toBeNull();
    h.model.setDong('1168051000');expect(h.model.scope().region_code).toBe('1168051000');
    h.model.setProvince('51');expect(h.model.scope()).toBeNull();expect(h.model.state.dongs).toEqual([]);
    h.model.reset();expect(h.model.state.province).toBe('');
  });
  it('does not let an older district response replace the latest selection',async()=>{
    let release!:(data:unknown)=>void;
    const h=harness(async path=>path.includes('/regions?')?{regions}:path.includes('region_code=11680')
      ? new Promise(resolve=>{release=resolve;}) : result([row('1162052500','보라매동','11620')]));
    await h.model.loadCatalog();h.model.setProvince('11');const first=h.model.setRegion('11680');
    await h.model.setRegion('11620');release(result([row('1168051000','신사동')]));await first;
    expect(h.model.state.region).toBe('11620');
    expect(h.model.state.dongs.map((item:any)=>item.area_name)).toEqual(['보라매동']);
    h.model.setDong('1168051000');expect(h.model.scope()).toBeNull();
  });
  it('rejects cross-region, wrong-month and duplicate rows instead of presenting them as selectable dongs',async()=>{
    for (const records of [
      [row('1162052500','보라매동','11620')],
      [{...row('1168051000','신사동'),month:'202511'}],
      [row('1168051000','신사동'),row('1168051000','신사동')],
    ]) {
      const h=harness(async path=>path.includes('/regions?')?{regions}:result(records));
      await h.model.loadCatalog();h.model.setProvince('11');
      await expect(h.model.setRegion('11680')).rejects.toThrow('행정동 목록');
      expect(h.model.scope()).toBeNull();
    }
  });
  it('rejects missing pages and retries a failed catalogue read',async()=>{
    let failed=true;
    const h=harness(async path=>{
      if (path.includes('/regions?')) {if(failed)throw Error('offline');return {regions};}
      return result([row('1168051000','신사동')],{total_matched:2});
    });
    await expect(h.model.loadCatalog()).rejects.toThrow('offline');failed=false;
    await h.model.loadCatalog();h.model.setProvince('11');
    await expect(h.model.setRegion('11680')).rejects.toThrow('일부 행정동');
  });
});

describe('Administrative-dong chat scope bridge',()=>{
  function resolver() {
    const registry=regions.map(region=>({spatial_unit:'sgg',area_code:region.code,area_name:region.name,region_code:region.code,region_name:region.name}));
    const context=createContext({window:{},registry,structuredClone,
      D:{provinces:{'11':'서울특별시','51':'강원특별자치도'}},AGES:['20G','30G','40G','50G','60GU'],
      scopeOf:(value:any)=>({region_level:value.region_level||'national',region_code:value.region_code||null,month:value.month||'202512',sex_codes:value.sex_codes||[],age_codes:value.age_codes||[]})});
    new Script(`let initialScope=null;window.HERMES_HTML_DATA={registerDong:${bridge.register}};window.HERMES_AGENT={setStartingScope:${bridge.setter}};${bridge.resolve}\nglobalThis.resolve=resolve;`).runInContext(context);
    return {context,resolve:context.resolve as (body:any)=>any,set:context.window.HERMES_AGENT.setStartingScope as (scope:any,name?:string)=>any};
  }
  it('registers a live dong absent from the archived registry and preserves month and group parsing',()=>{
    const h=resolver(),scope={region_level:'administrative_dong',region_code:'1168051000',month:'202512',sex_codes:[],age_codes:[]};
    const selected=h.set(scope,'서울특별시 강남구 신사동');
    scope.region_code='1168052100';
    const response=h.resolve({question:'서울특별시 강남구 신사동 2025년 10월 여성 30대 자료를 확인해 줘',selected_scope:selected,
      previous_scope:{region_level:'sgg',region_code:'51110',month:'202508',sex_codes:['MAN'],age_codes:['20G']}});
    expect(response.needs_clarification).toBe(false);
    expect(response.scopes).toEqual([{region_level:'administrative_dong',region_code:'1168051000',month:'202510',sex_codes:['WMAN'],age_codes:['30G']}]);
    expect(bridge.snapshot).toBe(true);
  });
  it('retains the explicitly selected dong for its parent-only mention while respecting a different named region',()=>{
    const h=resolver(),selected=h.set({region_level:'administrative_dong',region_code:'1168051000',month:'202512'},'서울특별시 강남구 신사동');
    expect(h.resolve({question:'강남구의 지역 자료를 보여 줘',selected_scope:selected}).scopes[0].region_code).toBe('1168051000');
    expect(h.resolve({question:'춘천시 자료를 보여 줘',selected_scope:selected}).scopes[0].region_code).toBe('51110');
    expect(h.resolve({question:'전국 자료를 보여 줘',selected_scope:selected}).scopes[0].region_level).toBe('national');
  });
  it('uses the captured starting dong instead of an old single or two-region chat context',async()=>{
    const selected={region_level:'administrative_dong',region_code:'1168051000',month:'202512',sex_codes:[],age_codes:[]};
    const api=vi.fn(async(path:string)=>path.endsWith('/readiness')?{ready:true,worker_enabled:true}:{needs_clarification:true,message:'선택 확인',options:[]});
    const context=createContext({api,initialScope:{...selected,region_code:'1168052100'},
      currentMessage:()=>({startingScope:selected,requestText:'선택한 행정동의 자료를 보여 줘',startingRegion:'1168051000'}),
      currentThread:()=>({context:{agentContext:{serverScope:{region_code:'51110'},serverScopes:[{region_code:'51110'},{region_code:'11620'}]}}}),
      patchMessage:vi.fn(),esc:(value:string)=>value,Map,JSON});
    new Script(bridge.run+'\nglobalThis.run=runMessage;').runInContext(context);
    await context.run('thread','message');
    expect(api).toHaveBeenCalledTimes(2);
    expect((api.mock.calls[1] as unknown[])[1]).toMatchObject({previous_scope:selected,selected_scope:selected,starting_scope:selected});
  });
});
