import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, FileCheck2 } from "lucide-react";
import type { AgeGroup } from "./research";
import { displayText } from "./displayText";
type RecordData = Record<string, unknown>;
interface CaseData { case_id: string; case_version: number; status: string; request: RecordData; measurement_status: string; support_status: string; executions: RecordData[]; briefs: RecordData[]; reviews: RecordData[]; events: RecordData[]; }
const labels: Record<string,string> = {stale:"근거 변경 · 재조사 필요",created:"조사 시작",queued:"실행 대기",not_checked:"확인 전",not_searched:"조회 전",draft:"조사 시작",investigating:"실행 중",reviewed:"검토 수락",awaiting_info:"추가 확인 대기",running:"실행 중",awaiting_review:"검토 대기",review_pending:"검토 대기",needs_information:"추가 확인",needs_info:"추가 확인",accepted:"수락",rejected:"반려",closed:"종료",failed:"실패",completed:"실행 완료",available:"관측 사용 가능",held:"측정 보류",no_data:"자료 없음",out_of_scope:"범위 밖",conditions_unknown:"조건 확인 필요",partial:"측정 일부 보류",needs_confirmation:"조건 확인 필요",no_verified_candidate:"확인된 후보 없음",match:"공개 범위 일치",no_match:"공개 조건 불일치",unknown:"확인 필요",confirmed:"확인됨",satisfied:"충족",unsatisfied:"불충족",source_verified:"원문 확인",no_candidates:"후보 없음",source_failed:"원문 조회 실패",accept:"수락",reject:"반려",request_info:"추가 확인 요청",rule_baseline:"근거자료 조회",single_search:"한 번 검색한 자료 요약",agent:"질문에 맞는 자료 조사"};
const txt = (v: unknown): string => v == null ? "확인되지 않음" : typeof v === "object" ? JSON.stringify(v) : String(v);
const label = (v:unknown) => labels[txt(v)] || txt(v);
const prose = (v:unknown):string => { if (v && typeof v === "object") {const o=v as RecordData;return displayText(txt(o.question || o.reason || o.summary || v));}return displayText(txt(v)); };
const rows = (v:unknown): RecordData[] => Array.isArray(v) ? v as RecordData[] : [];
export async function investigationRequest(base: string, path: string, body?: RecordData) {
  const response = await fetch(`${base.replace(/\/$/,"")}/api/investigations${path}`, {method:body?"POST":"GET",headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : result.detail?.message || `요청 실패 (${response.status}). 최신 기록을 다시 확인해 주세요.`);
  return result;
}
function FactList({value}:{value:unknown}) {
  if (!value) return null;
  if (typeof value === "string") return <p>{displayText(value)}</p>;
  const fieldLabels:Record<string,string> = {kind:"측정 종류",data:"공개 집계",population:"자료가 대표하는 대상",limitations:"해석 범위",evidence_id:"원자료 확인 번호",score:"점수",age_group:"연령",period:"관측월",quality:"품질",scope:"범위",status:"상태",value:"관측값",unit:"단위",label:"항목",reason:"이유",summary:"요약",source_id:"원자료 확인 번호",district:"자치구"};
  return <dl className="investigation-facts">{Object.entries(value).map(([key,v])=><div key={key}><dt>{fieldLabels[key] || key}</dt><dd>{label(v)}</dd></div>)}</dl>;
}
function ActivityAssessments({value}:{value:unknown}) {
  const assessments=rows(value);
  if(!assessments.length)return null;
  const tri=(v:unknown)=>v===true?"확인":v===false?"조건 미충족":"미확인";
  const rate=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?`${v.toFixed(2)}%`:"비교 불가";
  const ages:Record<string,string>={'20G':"20대",'30G':"30대",'40G':"40대",'50G':"50대",'60GU':"60세 이상"};
  return <section aria-label="활동변화 서버 분류"><h4>활동변화 검토 범주</h4><p>서버의 5% 감소 기준으로 집단별로 분류했습니다. 시군구 관측이며 자료 품질 보류·운영 경보 불허를 유지합니다.</p>{assessments.map((row,i)=>{
    const scope=(row.scope||{}) as RecordData,sources=(row.sources||{}) as RecordData,signals=(row.signals||{}) as RecordData;
    const skt=(sources.skt||{}) as RecordData,card=(sources.card_a||{}) as RecordData;
    return <article className="observation-card" key={i}><strong>{txt(scope.region_code)} · {txt(scope.month)} · {scope.sex_code==="MAN"?"남성":scope.sex_code==="WMAN"?"여성":"성별 미확인"} {ages[txt(scope.age_code)]||txt(scope.age_code)} · {txt(row.category_label)}</strong><p>통신 전월비 {rate(skt.change_percent)} · 카드 전월비 {rate(card.change_percent)}</p><p>동시 기준 충족 {tri(signals.joint_decline)} · 같은 기준의 2개월 연속 {tri(signals.two_month_streak)}</p><ul>{(Array.isArray(row.reasons)?row.reasons:[]).map((reason,j)=><li key={j}>{displayText(txt(reason))}</li>)}</ul><p className="micro">규칙 {txt(row.rule_version)} · 품질 {txt(row.quality_status)}</p></article>;
  })}</section>;
}
function ObservationCard({row}:{row:RecordData}) {
  const kind=txt(row.kind), data=(row.data || {}) as RecordData;
  const selected=(data.selected || {}) as RecordData;
  const title=({survey:"직접 설문 결과 · 선택한 자치구와 연령",behavior:"활동자료로 계산한 참고점수 · 행정동의 20~39세",sk:"통신자료 유동인구 · 같은 관측장소와 선택 연령",survey_i5_population_reference:"지역 고립 참고점수 · 지역의 인구구성 반영",final_activity_context:"시군구의 전월 대비 활동 변화"} as Record<string,string>)[kind] || kind;
  return <article className="observation-card"><strong>{title}</strong><p>{label(row.status)} · {txt(row.period)}</p>
    {kind==="sk" ? <><p>유동량 {selected.flow_total==null?"자료 없음":Number(selected.flow_total).toLocaleString("ko-KR",{maximumFractionDigits:1})} · 기준 대비 {selected.change_pct==null?"변화 해석 보류":Number(selected.change_pct).toFixed(1)+"%"}</p><p className="micro">기준 {txt(data.reference_period)} · {displayText(txt(selected.quality))}</p>{data.baseline_numeric!=null&&<p className="micro">같은 거점 기준평균 {Number(data.baseline_numeric).toLocaleString("ko-KR",{maximumFractionDigits:1})}</p>}</> : <><p>지수 {data.score==null?"공개 보류":Number(data.score).toFixed(1)} / 100</p>{kind==="survey" && <p className="micro">응답 {txt(data.n)}명 · 응답 비중을 반영한 표본 수 {data.n_eff==null?"확인 필요":Number(data.n_eff).toFixed(1)}명</p>}</>}
    <p className="micro">{displayText(txt(row.population))}</p>{Array.isArray(row.limitations)&&<p className="record-note">{row.limitations.map(v=>displayText(txt(v))).join(" ")}</p>}
    <details><summary>집계 근거 확인</summary><FactList value={data}/></details></article>;
}
export default function InvestigationPanel({city,regionCode,age,apiEnabled,measurementAsOf}:{city:string;regionCode:string;age:AgeGroup;apiEnabled:boolean;measurementAsOf:string}) {
  const base = import.meta.env.VITE_RESEARCH_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "";
  const connected = apiEnabled && Boolean(base);
  const [cases,setCases] = useState<CaseData[]>([]), [current,setCurrent] = useState<CaseData|null>(null);
  const [purpose,setPurpose] = useState("지역 활동 변화의 근거와 현재 공식 지원정보 확인"), [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false), [error,setError] = useState(""), [strategy,setStrategy] = useState("rule_baseline"), [skMode,setSkMode] = useState("provided");
  const [modelReady,setModelReady] = useState(false);
  const call = (path:string,body?:RecordData)=>investigationRequest(base,path,body);
  async function list() { const result=await call("");setCases(Array.isArray(result)?result:result.cases || []);const readiness=await call("/readiness");setModelReady(readiness.model?.ready === true || readiness.model_available === true); }
  async function refresh(id=current?.case_id) { if(id) {const updated:CaseData=await call(`/${id}`);setCurrent(updated);setCases(previous=>previous.some(c=>c.case_id===id)?previous.map(c=>c.case_id===id?updated:c):[updated,...previous]);} }
  async function act(action:()=>Promise<void>) {setBusy(true);setError("");try {await action();await list();} catch(e){setError(e instanceof Error?e.message:"처리 실패");}finally{setBusy(false);}}
  useEffect(()=>{if(!connected)return;let active=true;void(async()=>{try{await list();const id=localStorage.getItem("donghaeng-last-case");if(id){const data=await call(`/${id}`);if(active)setCurrent(data);}}catch(e){if(active)setError(e instanceof Error?e.message:"기록 조회 실패");}})();return()=>{active=false;};},[connected,base]);
  useEffect(()=>{if(!connected || !current || !["queued","running","investigating"].includes(current.status))return;const timer=window.setInterval(()=>{void refresh().catch((e:Error)=>setError(e.message));},800);return()=>window.clearInterval(timer);},[connected,current?.case_id,current?.status]);
  async function create() {const data:CaseData=await call("",{city,region_code:regionCode,age_group:age,purpose,measurement_as_of:measurementAsOf,support_as_of:new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}),sk_mode:skMode,idempotency_key:crypto.randomUUID()});setCurrent(data);localStorage.setItem("donghaeng-last-case",data.case_id);await call(`/${data.case_id}/runs`,{strategy,expected_case_version:data.case_version,idempotency_key:crypto.randomUUID()});await refresh(data.case_id);}
  const brief=current?.briefs.at(-1);
  const candidates=rows(brief?.support_candidates || brief?.candidates), questions=brief?.open_questions || brief?.unknown_conditions, actions=brief?.next_actions;
  return <section className="investigation-panel" aria-label="저장된 조사 기록"><div className="section-title"><h3>근거 확인과 지원안 기록</h3><span>{connected?"조사 기록 저장 가능":"조사 기록 저장 준비 필요"}</span></div><p className="record-note">2025년 관측을 참고해 현재 공식 지원정보를 조사합니다. 검토 수락과 실제 지원 연결을 각각 기록합니다.</p>
    {!connected?<div className="no-policy">조사와 기록 저장을 사용하려면 담당자가 서비스 연결을 설정해야 합니다. 지금은 저장된 관측자료를 살펴볼 수 있습니다.</div>:<>
      <label>조사 목적<textarea aria-label="조사 목적" value={purpose} onChange={e=>setPurpose(e.target.value)} rows={2}/></label>
      <div className="investigation-options"><label>진행 방식<select value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="rule_baseline">근거자료 조회</option><option value="single_search" disabled={!modelReady}>한 번 검색한 자료 요약{!modelReady?" · 연결 준비 중":""}</option><option value="agent" disabled={!modelReady}>질문에 맞는 자료 조사{!modelReady?" · 연결 준비 중":""}</option></select></label><label>통신자료 포함 여부<select value={skMode} onChange={e=>setSkMode(e.target.value)}><option value="provided">실제 관측자료 포함</option><option value="excluded">통신자료 없이 비교</option><option value="quality_mutation">자료 누락 상황 시험</option></select></label></div>
      {skMode==="quality_mutation"&&<p className="record-note">빠진 자료가 있을 때의 처리 흐름을 확인하는 예시입니다. 실제 관측값과 구분해 보세요.</p>}
      <button className="primary run-button" disabled={busy||!purpose.trim()} onClick={()=>void act(create)}><FileCheck2 size={16}/>{busy?"처리 중…":"선택 지역 조사하고 저장"}</button>
      <label>저장된 조사<select aria-label="저장된 조사" value={current?.case_id||""} onChange={e=>void act(()=>refresh(e.target.value))}><option value="">기록 선택</option>{cases.map(c=><option key={c.case_id} value={c.case_id}>{txt(c.request?.city)} · {txt(c.request?.region_code)} · {label(c.status)} · {c.case_id.slice(0,8)}</option>)}</select></label>
      {current&&<article className="investigation-case"><div className="section-title"><h4>저장된 조사 상태</h4><button aria-label="최신 조사 기록 조회" disabled={busy} onClick={()=>void act(()=>refresh())}><RefreshCw size={14}/></button></div><p><strong>{txt(current.request.city)} · {txt(current.request.region_code)} · {txt(current.request.age_group)}</strong></p>{(current.request.city!==city || current.request.region_code!==regionCode || current.request.age_group!==age)&&<p className="record-note">현재 지도 선택과 다른 저장 기록입니다. 위 지역 코드를 기준으로 조사 요약을 표시합니다.</p>}<p className="case-id">조사 번호 {current.case_id} · 버전 {current.case_version}</p><p>{label(current.status)} · 측정: {label(current.measurement_status)} · 지원: {label(current.support_status)}</p><p className="micro">관측 {txt(current.request.measurement_as_of)} · 지원조회 {txt(current.request.support_as_of)}</p>
        {brief?<><h4>조사 요약 · 버전 {txt(brief.version||brief.brief_version)}</h4>{typeof brief.summary==="string"&&<p>{displayText(brief.summary)}</p>}{brief.measurements!=null&&<FactList value={brief.measurements}/>}<ActivityAssessments value={brief.activity_assessments}/>{rows(brief.observations).map((o,i)=><ObservationCard key={i} row={o}/>)}<h4>공식 지원 후보</h4>
          {candidates.length?candidates.map((c,i)=><article className="support-candidate" key={i}><strong>{txt(c.title)}</strong><p>{label(c.eligibility_status||c.status)}</p>{rows(c.conditions).map((condition,j)=><p key={j}>{txt(condition.label||condition.field)}: {label(condition.status)}{condition.reason?` — ${displayText(txt(condition.reason))}`:""}</p>)}{Array.isArray(c.unknown_conditions)&&c.unknown_conditions.map((q,j)=><p key={j}>{displayText(txt(q))}</p>)}{/^https:\/\//.test(txt(c.source_url||c.url))&&<a href={txt(c.source_url||c.url)} target="_blank" rel="noopener noreferrer">공식 원문 <ExternalLink size={12}/></a>}<p className="micro">{txt(c.contact)} · 원문 {txt(c.content_hash||c.source_hash).slice(0,12)}</p></article>):<p>확인된 후보가 없습니다. 조회 실패와 지원 부재는 실행 기록에서 구분합니다.</p>}
          {rows(brief.excluded_candidates).map((c,i)=><p className="record-note" key={i}>제외: {txt(c.title)} · {displayText(txt(c.reason))}</p>)}{Array.isArray(questions)&&<><h4>확인할 조건</h4><ul>{questions.map((q,i)=><li key={i}>{prose(q)}</li>)}</ul></>}{Array.isArray(actions)&&<><h4>다음 행동</h4><ul>{actions.map((a,i)=><li key={i}>{prose(a)}</li>)}</ul></>}
          <details><summary>원자료와 조사 이력 ({current.events?.length||0})</summary><pre>{JSON.stringify({evidence_ids:brief.evidence_ids,executions:current.executions,events:current.events},null,2)}</pre></details>
          <label>검토 의견<textarea aria-label="검토 의견" value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="확인한 근거와 추가로 확인할 내용을 적어주세요"/></label><div className="review-actions">{["accept","reject","request_info"].map(decision=><button key={decision} disabled={busy||!reason.trim()||(decision==="accept"&&current.support_status==="stale")||!["awaiting_review","review_pending","needs_information","needs_info"].includes(current.status)} onClick={()=>void act(async()=>{await call(`/${current.case_id}/reviews`,{brief_id:brief.brief_id,brief_version:brief.version||brief.brief_version,expected_case_version:current.case_version,decision,reason,idempotency_key:crypto.randomUUID()});setReason("");await refresh();})}>{label(decision)}</button>)}</div>{current.reviews.map((r,i)=><p key={i} className="record-note">검토: {label(r.decision)} · {txt(r.reason)}</p>)}
        </>:<p>아직 저장된 조사 요약이 없습니다. 실행 상태와 실패 사유를 확인해 주세요.</p>}
        {current.support_status==="stale"&&<p role="status" className="record-note">근거가 변경돼 기존 조사 요약 수락을 보류합니다. 반려 또는 추가 확인 요청을 저장한 뒤 같은 조사 기록에서 다시 조사해 주세요.</p>}<button className="recheck-button" disabled={busy||["queued","running","investigating"].includes(current.status)} onClick={()=>void act(async()=>{await call(`/${current.case_id}/recheck`,{expected_case_version:current.case_version,idempotency_key:crypto.randomUUID()});await refresh();})}><RefreshCw size={14}/>근거 변경 재확인</button><button className="primary run-button" disabled={busy||["investigating","awaiting_review"].includes(current.status)} onClick={()=>void act(async()=>{await call(`/${current.case_id}/runs`,{strategy,expected_case_version:current.case_version,idempotency_key:crypto.randomUUID()});await refresh();})}>같은 지역·대상 다시 조사</button><p className="micro">저장 원문의 버전을 비교합니다. 변경이 없으면 새 완료 조사 요약을 만들지 않습니다. 실제 접수·참여·고립 변화는 후속 확인 전까지 미확인입니다.</p>
      </article>}
    </>}{error&&<p role="alert" className="investigation-error">{error}</p>}
  </section>;
}
