import { useEffect, useState } from 'react';
import { fetchModel, domains } from './finalModel';
import { displayText } from './displayText';

type Program = {
  version_id: string; title: string; support_content: string;
  source_categories: { category_id: string; label: string }[];
  observation_reasons: { domain: string; score: number; i5_record_id: string; behavior_record_id: string }[];
  recommendation_reasons?: { label?: string; reason?: string; content_reason?: string; service_action: string;
    service_evidence?: { source_quote?: string } }[];
  unconfirmed_conditions: string[]; exclusion_reasons: string[];
};
type Result = {
  contract_version: string; status: string; welfare_data_synthetic?: boolean;
  request: { support_as_of: string };
  mapping: { reasons: string[]; rule_version: string };
  recommendations: Program[]; excluded: Program[]; held: Program[];
};
const labels: Record<string, string> = { sex: '성별 조건', personal_eligibility: '개인별 신청 자격', age: '연령 조건', start_date: '신청 시작일', end_date: '신청 종료일' };

export default function WelfarePanel({ region, regionName, month, sex, age, revision }: {
  region: string; regionName: string; month: string; sex: string; age: string; revision: number;
}) {
  const key = JSON.stringify([region, month, sex, age, revision]);
  const [state, setState] = useState<{ key: string; data?: Result; error?: string }>({ key: '' });
  useEffect(() => {
    if (!region) return;
    const controller = new AbortController();
    setState({ key });
    fetchModel<Result>('welfare', { region_code: region, month, sex_code: sex, age_code: age }, controller.signal)
      .then(data => {
        if (data.contract_version !== 'welfare_research_pipeline_v1') throw new Error('추천 결과 형식을 확인해 주세요.');
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: String(error.message) }); });
    return () => controller.abort();
  }, [key, region, month, sex, age]);
  const current = state.key === key ? state : undefined;
  const data = current?.data;
  function cards(programs: Program[]) {
    return programs.map(p => <article key={p.version_id} className="fm-welfare-card">
      <h4>{p.title}</h4><p>{p.support_content}</p>
      <p>살펴볼 지원 분야: {p.recommendation_reasons?.length
        ? [...new Set(p.recommendation_reasons.map(reason => reason.label).filter(Boolean))].join(' · ')
        : p.source_categories.map(c => c.label).join(' · ') || '미분류'}</p>
      <p><strong>이 사업을 살펴보는 이유:</strong> {p.observation_reasons.map(e => `${domains[e.domain as keyof typeof domains] || e.domain} ${e.score.toFixed(1)}점`).join(' · ')} — 활동 변화와 함께 참고한 점수이며, 점수만으로 지원 필요를 판단하지 않습니다.</p>
      {p.recommendation_reasons?.map((reason, index) => <p key={index}>
        <strong>사업 연결 근거:</strong> {reason.reason || reason.content_reason || reason.service_action}
        {reason.service_evidence?.source_quote && <> — {reason.service_evidence.source_quote}</>}
      </p>)}
      {p.exclusion_reasons.length > 0 && <p><strong>제외 이유:</strong> {p.exclusion_reasons.map(displayText).join(' · ')}</p>}
      <p><strong>미확인 조건:</strong> {p.unconfirmed_conditions.map(c => labels[c] || displayText(c)).join(' · ')}</p>
      <details><summary>원자료 확인 번호</summary>{p.observation_reasons.map(e => <p key={e.domain}>{domains[e.domain as keyof typeof domains] || e.domain}: {e.i5_record_id} / {e.behavior_record_id}</p>)}</details>
    </article>);
  }
  return <section className="fm-panel fm-welfare" aria-label="복지 추천">
    <h2>{regionName} 복지 추천</h2>
    <p className="fm-notice">담당자 검토를 돕는 사업 후보입니다. 개인의 신청 자격과 실제 지원 필요는 확인이 필요합니다. 행정동을 선택하면 해당 시군구의 활동 변화와 지역 고립 참고점수를 참고합니다.</p>
    {!region ? <p>지역을 선택해 주세요.</p> : current?.error ? <p role="alert">{current.error}</p> : !data ? <p role="status">추천 근거와 사업 조건을 확인하고 있습니다.</p> : <>
      {data.welfare_data_synthetic && <p className="fm-notice"><strong>예시 복지사업 자료</strong> — 관측값은 실제 자료이고, 아래 사업은 화면 기능을 확인하기 위한 예시입니다.</p>}
      <p>관측: {month.slice(0,4)}년 {month.slice(4)}월 · 사업 검토 기준일: {data.request.support_as_of}</p>
      <p>{data.mapping.reasons.map(displayText).join(' ')}</p>
      <h3>추천 후보 {data.recommendations.length}건</h3>
      {data.recommendations.length ? cards(data.recommendations) : <p>현재 조건으로 제시할 추천 후보가 없습니다.</p>}
      <details><summary>제외 {data.excluded.length}건</summary>{cards(data.excluded)}</details>
      <details><summary>추가 확인 보류 {data.held.length}건</summary>{cards(data.held)}</details>
      <small>사업 연결 기준 버전: {data.mapping.rule_version} · 자동 경보에 사용하지 않습니다</small>
    </>}
  </section>;
}
