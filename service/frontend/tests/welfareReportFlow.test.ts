import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
const source=readFileSync(new URL('../../shared/hermi-overview.js',import.meta.url),'utf8');
function harness(){
 const chooseReport=vi.fn(async()=>({report_id:'analysis_one'})),open=vi.fn(async()=>{}),fetch=vi.fn();
 const context=createContext({window:{HERMES_ANALYSIS_REPORTS:{chooseReport},HERMES_RESPONSE_WORKSPACE:{open}},location:{search:''},URL,URLSearchParams,Date,Map,Set,Promise,fetch});
 new Script(source.replace('return { mount, show };','root={querySelector:()=>null};return {mount,show,testState:state,testSend:sendWelfareChat,testMarkup:welfareChatMarkup};')).runInContext(context);
 const api=context.window.HERMI_OVERVIEW;
 api.testState.welfare.result={programs:[{version_id:'program_one',title:'지역 모임',support_content:'주민 모임 공간',target_text:'참여 희망 주민'}]};api.testState.welfare.selectedId='program_one';
 return {api,chooseReport,open,fetch};
}
describe('one connected welfare report flow',()=>{
 it.each([['이 사업으로 보고서 만들어줘',undefined],['대응 보고서를 만들고 싶어요','report']])('selects the parent analysis before reporting: %s',async(text,intent)=>{
  const h=harness();await h.api.testSend(text,intent);expect(h.chooseReport).toHaveBeenCalledWith({programTitle:'지역 모임'});expect(h.open).toHaveBeenCalledWith('analysis_one',{program:expect.objectContaining({program_version_id:'program_one',summary:'주민 모임 공간'})});expect(h.fetch).not.toHaveBeenCalled();
 });
 it('does not create an unlinked report when analysis selection is cancelled',async()=>{
  const h=harness();h.chooseReport.mockResolvedValueOnce(null as any);await h.api.testSend('보고서 만들어줘');expect(h.open).not.toHaveBeenCalled();expect(h.fetch).not.toHaveBeenCalled();
 });
 it('names the separate conversation as questions about a business, with a connected report action',()=>{
  const h=harness();expect(h.api.testMarkup({version_id:'program_one',title:'지역 모임'})).toContain('사업 내용 물어보기');
 });
});
