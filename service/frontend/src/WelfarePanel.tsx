import { useEffect, useState } from 'react';
import { fetchModel, domains } from './finalModel';

type Program = {
  version_id: string; title: string; support_content: string;
  source_categories: { category_id: string; label: string }[];
  observation_reasons: { domain: string; score: number; i5_record_id: string; behavior_record_id: string }[];
  unconfirmed_conditions: string[]; exclusion_reasons: string[];
};
type Result = {
  contract_version: string; status: string; welfare_data_synthetic?: boolean;
  request: { support_as_of: string };
  mapping: { reasons: string[]; rule_version: string };
  recommendations: Program[]; excluded: Program[]; held: Program[];
};
const labels: Record<string, string> = { sex: '성별 지원조건', personal_eligibility: '개인 자격', age: '연령조건', start_date: '시작일', end_date: '종료일' };

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
      <p>분류: {p.source_categories.map(c => c.label).join(' · ') || '미분류'}</p>
      <p><strong>추천 탐색 근거:</strong> {p.observation_reasons.map(e => `${domains[e.domain as keyof typeof domains] || e.domain} ${e.score.toFixed(1)}점`).join(' · ')} — 활동신호와 함께 참고한 값이며 고저 판정은 아닙니다.</p>
      {p.exclusion_reasons.length > 0 && <p><strong>제외 이유:</strong> {p.exclusion_reasons.join(' · ')}</p>}
      <p><strong>미확인 조건:</strong> {p.unconfirmed_conditions.map(c => labels[c] || c).join(' · ')}</p>
      <details><summary>관측 근거 ID</summary>{p.observation_reasons.map(e => <p key={e.domain}>{e.domain}: {e.i5_record_id} / {e.behavior_record_id}</p>)}</details>
    </article>);
  }
  return <section className="fm-panel fm-welfare" aria-label="복지 추천">
    <h2>{regionName} 복지 추천</h2>
    <p className="fm-notice">연구·시연용 제안 규칙 · 개인 자격 및 실제 지원 필요는 미확인입니다. 행정동 선택 시 상위 시군구의 활동신호와 I5를 참고합니다.</p>
    {!region ? <p>지역을 선택해 주세요.</p> : current?.error ? <p role="alert">{current.error}</p> : !data ? <p role="status">추천 근거와 사업 조건을 확인하고 있습니다.</p> : <>
      {data.welfare_data_synthetic && <p className="fm-notice"><strong>가상 복지사업 DB</strong> — 관측자료는 실제 자료이며 아래 사업은 연결 시험용입니다.</p>}
      <p>관측: {month.slice(0,4)}년 {month.slice(4)}월 · 사업 검토 기준일: {data.request.support_as_of}</p>
      <p>{data.mapping.reasons.join(' ')}</p>
      <h3>추천 후보 {data.recommendations.length}건</h3>
      {data.recommendations.length ? cards(data.recommendations) : <p>현재 조건으로 제시할 추천 후보가 없습니다.</p>}
      <details><summary>제외 {data.excluded.length}건</summary>{cards(data.excluded)}</details>
      <details><summary>추가 확인 보류 {data.held.length}건</summary>{cards(data.held)}</details>
      <small>규칙 버전: {data.mapping.rule_version} · 운영 경보 사용 불가</small>
    </>}
  </section>;
}
