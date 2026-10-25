import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const source=readFileSync(new URL('../../shared/hermi-desktop.js',import.meta.url),'utf8');
const firstId='00000000-0000-4000-8000-000000000001';
const secondId='00000000-0000-4000-8000-000000000002';
type Report={title:string;markdown:string;filename?:string};
type Message={role:'user'|'assistant';text:string;report?:Report};
type Session={programId:string;title:string;messages:Message[];busy:boolean;report:Report|null;
  send:(text:string,options?:{intent?:'chat'|'report'})=>Promise<{program_version_id:string;reply:string;text:string;report?:Report}>};

function harness(handler:(url:string,options:{body:string})=>Promise<unknown> = async(_url,options)=>({
  ok:true,json:async()=>({program_version_id:JSON.parse(options.body).program_version_id,reply:'등록 자료를 바탕으로 확인했어요.',mode:'model'}),
})) {
  const fetch=vi.fn(handler);
  const link={href:'',download:'',hidden:false,click:vi.fn(),remove:vi.fn()};
  const append=vi.fn();
  const createObjectURL=vi.fn((_blob:Blob)=>'blob:welfare-report');
  const revokeObjectURL=vi.fn();
  class ReportURL extends URL {static createObjectURL=createObjectURL;static revokeObjectURL=revokeObjectURL;}
  const context=createContext({window:{HERMES_HTML_READY:{then:()=>({catch:()=>{}})}},fetch,URL:ReportURL,Blob,
    document:{createElement:()=>link,body:{append}},setTimeout:(callback:()=>void)=>{callback();return 0;}});
  new Script(source).runInContext(context);
  const engine=context.window.HERMI_WELFARE_CHAT as {
    createSession:(program:Record<string,unknown>,meta?:Record<string,unknown>)=>Session;
    download:(report:Report)=>string;
  };
  return {engine,fetch,link,append,createObjectURL,revokeObjectURL};
}

describe('selected welfare program conversation',()=>{
  it('opens without a model call and sends only its fixed program ID and that program’s successful history',async()=>{
    const h=harness();
    const program={version_id:firstId,title:'선택한 출생 지원사업',support_content:'공식 원문'};
    const first=h.engine.createSession(program,{as_of:'2026-10-25'});
    const second=h.engine.createSession({version_id:secondId,title:'다른 돌봄 사업'});
    expect(h.fetch).not.toHaveBeenCalled();
    expect(first.messages[0].text).toContain(program.title);
    program.version_id=secondId;
    await first.send('지원 대상을 알려줘');
    await second.send('신청 방법을 알려줘');
    await first.send('필요한 서류도 알려줘');
    const requests=h.fetch.mock.calls.map(([url,options])=>({url,...JSON.parse(options.body)}));
    expect(requests[0]).toEqual({url:'/api/model/welfare/chat',program_version_id:firstId,message:'지원 대상을 알려줘',history:[],intent:'chat'});
    expect(requests[1]).toMatchObject({program_version_id:secondId,history:[]});
    expect(requests[2].history).toEqual([
      {role:'user',content:'지원 대상을 알려줘'},
      {role:'assistant',content:'등록 자료를 바탕으로 확인했어요.'},
    ]);
    expect(JSON.stringify(requests[1])).not.toContain('지원 대상을 알려줘');
    expect(first.messages.map(message=>message.role)).toEqual(['assistant','user','assistant','user','assistant']);
  });
  it('bounds prior model history to ten messages and leaves the current message separate',async()=>{
    const h=harness(),session=h.engine.createSession({version_id:firstId,title:'선택 사업'});
    for(let index=1;index<=7;index++)await session.send(`질문 ${index}`);
    const request=JSON.parse(h.fetch.mock.calls[6][1].body);
    expect(request.history).toHaveLength(10);
    expect(request.history[0]).toEqual({role:'user',content:'질문 2'});
    expect(request.history.at(-1).role).toBe('assistant');
    expect(request.message).toBe('질문 7');
    expect(JSON.stringify(request.history)).not.toContain('질문 7');
  });
  it('bounds each history turn to eight thousand characters while preserving the full visible reply and report',async()=>{
    const reply='모델 답변 '.repeat(1600)+'\n서버가 덧붙인 자료 출처';
    const report={title:'전체 보고서',markdown:'# 전체 보고서\n'+reply,filename:'전체보고서.md'};
    const h=harness(async()=>({ok:true,json:async()=>({program_version_id:firstId,reply,report,mode:'model'})}));
    const session=h.engine.createSession({version_id:firstId,title:'선택 사업'});
    await session.send('보고서 만들어줘');await session.send('신청 방법도 알려줘');
    const request=JSON.parse(h.fetch.mock.calls[1][1].body);
    expect(request.history[1].content).toHaveLength(8000);
    expect(request.history[1].content).toBe(reply.slice(0,8000));
    expect(session.messages[2].text).toBe(reply);
    expect(session.messages[2].report?.markdown).toBe(report.markdown);
  });
  it('generates a report from the selected program, retaining the server’s complete report and source text',async()=>{
    const report={title:'출생 지원사업 검토 보고서',markdown:'# 검토 보고서\n\n둘째 50만원\n\n출처: https://www.gov.kr/example',filename:'출생지원_검토보고서.md'};
    const h=harness(async()=>({ok:true,json:async()=>({program_version_id:firstId,reply:'선택한 사업 자료로 보고서를 작성했어요.',report,mode:'model'})}));
    const session=h.engine.createSession({version_id:firstId,title:'출생 지원사업'});
    const result=await session.send('이걸로 보고서 만들기');
    expect(JSON.parse(h.fetch.mock.calls[0][1].body).intent).toBe('report');
    expect(result.report).toEqual(report);
    expect(session.report).toEqual(report);
    expect(session.messages.at(-1)).toMatchObject({role:'assistant',text:result.reply,report});
  });
  it('preserves a failed question for retry without inventing an answer or duplicating the question',async()=>{
    let fail=true;
    const h=harness(async()=>fail?{ok:false,json:async()=>({detail:{message:'모델 연결을 확인해 주세요.'}})}:
      {ok:true,json:async()=>({program_version_id:firstId,reply:'공식 신청 방법을 확인했어요.',mode:'model'})});
    const session=h.engine.createSession({version_id:firstId,title:'선택 사업'});
    await expect(session.send('신청 방법')).rejects.toThrow('모델 연결을 확인해 주세요.');
    expect(session.messages.map(message=>message.role)).toEqual(['assistant','user']);
    expect(session.busy).toBe(false);
    fail=false;await session.send('신청 방법');
    expect(session.messages.map(message=>message.role)).toEqual(['assistant','user','assistant']);
    expect(JSON.parse(h.fetch.mock.calls[1][1].body).history).toEqual([]);
  });
  it('rejects a response for a different program and prevents simultaneous sends in one session',async()=>{
    let resolveRequest:(response:unknown)=>void=()=>{};
    const h=harness(async()=>new Promise(resolve=>{resolveRequest=resolve;}));
    const session=h.engine.createSession({version_id:firstId,title:'선택 사업'});
    const first=session.send('지원 대상');
    expect(session.busy).toBe(true);
    await expect(session.send('신청 방법')).rejects.toThrow('답변을 준비하고 있어요.');
    expect(h.fetch).toHaveBeenCalledTimes(1);
    resolveRequest({ok:true,json:async()=>({program_version_id:secondId,reply:'다른 사업의 답변',mode:'model'})});
    await expect(first).rejects.toThrow('선택한 사업의 답변을 확인하지 못했어요.');
    expect(session.messages.some(message=>message.text==='다른 사업의 답변')).toBe(false);
    expect(session.busy).toBe(false);
  });
  it('does not treat a report request without a real model report as success',async()=>{
    const h=harness(),session=h.engine.createSession({version_id:firstId,title:'선택 사업'});
    await expect(session.send('보고서 만들어줘',{intent:'report'})).rejects.toThrow('보고서 내용을 확인하지 못했어요.');
    expect(session.report).toBeNull();
    expect(session.messages.map(message=>message.role)).toEqual(['assistant','user']);
  });
  it('downloads the exact Markdown as a file with a safe filename and releases its temporary URL',async()=>{
    const h=harness();
    const markdown='# 실제 보고서\n\n지원 대상 <원문>\n\n[출처](https://www.gov.kr/)';
    const filename=h.engine.download({title:'선택 사업',markdown,filename:'../../<보고서>:신청?.html'});
    expect(filename).toMatch(/\.md$/);
    expect(filename).not.toMatch(/[<>:"/\\?*]/);
    expect(h.link.download).toBe(filename);
    expect(h.link.href).toBe('blob:welfare-report');
    expect(h.append).toHaveBeenCalledWith(h.link);expect(h.link.click).toHaveBeenCalledOnce();
    expect(await h.createObjectURL.mock.calls[0][0].text()).toBe(markdown);
    expect(h.createObjectURL.mock.calls[0][0].type).toBe('text/markdown;charset=utf-8');
    expect(h.link.remove).toHaveBeenCalledOnce();expect(h.revokeObjectURL).toHaveBeenCalledWith('blob:welfare-report');
  });
});
