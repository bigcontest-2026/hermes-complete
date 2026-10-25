import { useEffect, useMemo, useState } from "react";
import { Activity, Compass, MapPinned, RefreshCw, Search } from "lucide-react";
import MapView, { type Boundaries } from "./MapView";
import { ages, candidateText, domains, fetchModel, fetchModelPages, formatMonth, formatNumber, mapSurvey, months, surveyColor,
  type ActivitySource, type BehaviorRecord, type ModelPage, type ModelRegions, type SurveyArea } from "./finalModel";
import "./finalModel.css";
import WelfarePanel from './WelfarePanel';
import { displayText, populationGroupLabel } from './displayText';

type Resource<T> = { data?: T; error?: string; loading: boolean; key: string };
function useModelPage<T>(path: string, params: Record<string, string>, contract: string, revision: number, enabled = true) {
  const key = JSON.stringify([path, params, contract, revision, enabled]);
  const [state, setState] = useState<Resource<ModelPage<T>>>({ loading: true, key: "" });
  useEffect(() => {
    if (!enabled) { setState({ loading: false, key }); return; }
    const controller = new AbortController();
    setState({ loading: true, key });
    fetchModelPages<T>(path, params, contract, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false, key }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: String(error.message), loading: false, key }); });
    return () => controller.abort();
    // The serialized key includes every request parameter; previous responses are aborted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { loading: enabled, key };
}

function ResourceMessage({ loading, error, empty }: { loading: boolean; error?: string; empty?: string }) {
  return <p className={error ? "fm-notice" : "fm-empty"} role={error ? "alert" : "status"}>
    {loading ? "자료를 불러오고 있습니다." : error || empty || "선택한 조건의 자료가 없습니다."}
  </p>;
}
function SourceRow({ label, unit, source }: { label: string; unit: string; source: ActivitySource }) {
  return <tr><th scope="row">{label}<small>{unit}</small></th>
    <td>{formatNumber(source.previous_activity_daily)}</td><td>{formatNumber(source.activity_daily)}</td>
    <td>{source.change_percent == null ? "자료 없음" : `${source.change_percent > 0 ? "+" : ""}${formatNumber(source.change_percent)}%`}</td></tr>;
}
function BehaviorDetail({ record }: { record: BehaviorRecord }) {
  const { behavior: row, historical_reference: history } = record;
  return <>
    <div className="fm-table-wrap"><table className="fm-table"><caption className="sr-only">시군구별 일평균 활동과 전월 변화율</caption>
      <thead><tr><th>관측</th><th>전월 일평균</th><th>이번 달 일평균</th><th>변화율</th></tr></thead><tbody>
        <SourceRow label="통신자료 유동인구" unit="관측장소에서 하루 동안 집계한 유동인구" source={row.sources.skt} />
        <SourceRow label="신한카드" unit="가맹점 결제 건수 / 일" source={row.sources.card_a} />
      </tbody></table></div>
    <div className="fm-findings"><p>통신·카드 모두 감소 <strong>{candidateText(row.rule.candidate)}</strong></p>
      <p>다른 집단보다 큰 감소 <strong>{candidateText(row.robust.candidate)}</strong></p>
      <p>두 달 연속 감소 <strong>{candidateText(row.rule.two_month_streak)}</strong></p></div>
    <p className="fm-help">{displayText(row.explanation)}</p>
    <details className="fm-method"><summary>변화량의 계산 근거</summary>
      <p>전월 대비 감소 정도를 계산하고, 같은 시군구의 성별·연령별 10개 집단에서 중간에 해당하는 변화와 비교합니다. 감소가 다른 집단보다 얼마나 두드러지는지도 함께 살펴봅니다.</p>
      <div className="fm-table-wrap"><table className="fm-table"><thead><tr><th>관측</th><th>전월 대비 감소량</th><th>지역의 일반적인 변화</th><th>일반적인 변화와의 차이</th><th>다른 집단과 비교한 감소 정도</th></tr></thead><tbody>
        {([['skt', '통신자료 유동인구'], ['card_a', '신한카드']] as const).map(([key, label]) => <tr key={key}><th>{label}</th>{(['Q', 'H', 'T'] as const).map(k => <td key={k}>{formatNumber(row.sources[key][k], 3)}</td>)}<td>{formatNumber(row.sources[key].robust.z, 3)}</td></tr>)}
      </tbody></table></div>
      <p>해석 전에 확인할 사항: {row.quality.reasons.map(displayText).join(" ")}</p>
    </details>
    <section className="fm-history"><h3>카드 이용 변화(같은 요일 비교)</h3>
      {history ? <><p>기준 기간 {history.reference_start} ~ {history.reference_end}</p><p>과거 기준 대비 결제 건수 변화 <strong>{history.count.change_pct == null ? "자료 없음" : `${formatNumber(history.count.change_pct)}%`}</strong></p>
        <p className="fm-help">같은 신한카드 자료를 7~9월의 공휴일이 아닌 같은 요일과 비교한 참고값입니다.</p></>
        : <p className="fm-help">선택한 월·성별·연령의 같은 요일 비교 자료가 없습니다.</p>}
    </section>
  </>;
}

export default function FinalModelApp() {
  const [province, setProvince] = useState("11");
  const [region, setRegion] = useState("");
  const [month, setMonth] = useState("202512");
  const [sex, setSex] = useState("MAN");
  const [age, setAge] = useState("20G");
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [geo, setGeo] = useState<Boundaries>();
  const [geoError, setGeoError] = useState("");
  const [catalog, setCatalog] = useState<ModelRegions>();
  const [catalogError, setCatalogError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    fetchModel<ModelRegions>("regions", { month }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setCatalog(data); })
      .catch(error => { if (!controller.signal.aborted) setCatalogError(String(error.message)); });
    return () => controller.abort();
  }, [month, revision]);
  const scope: Record<string, string> = region ? { region_code: region } : { province_code: province };
  const survey = useModelPage<SurveyArea>("survey-area", { level: "administrative_dong", ...scope, month, limit: "500" }, "survey_area_isolation_index_v1", revision);
  const sgg = useModelPage<SurveyArea>("survey-area", { level: "sgg", ...scope, month, limit: "500" }, "survey_area_isolation_index_v1", revision);
  useEffect(() => {
    const controller = new AbortController();
    setGeoError("");
    fetch(`${import.meta.env.BASE_URL}mock/districts.geojson`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { if (!controller.signal.aborted) setGeo(data); })
      .catch(() => { if (!controller.signal.aborted) setGeoError("지도 경계를 불러오지 못했습니다. 읍면동 목록에서 자료를 확인할 수 있습니다."); });
    return () => controller.abort();
  }, [revision]);
  const rows = useMemo(() => [...(survey.data?.records || [])].sort((a, b) =>
    a.region_name.localeCompare(b.region_name, 'ko') || a.area_name.localeCompare(b.area_name, 'ko')), [survey.data]);
  const filtered = rows.filter(row => `${row.region_name} ${row.area_name}`.includes(search.trim()));
  const area = filtered.find(row => row.area_code === selected) || filtered[0];
  const activeRegion = area?.region_code || region;
  const regionRow = sgg.data?.records.find(row => row.region_code === activeRegion);
  const activity = useModelPage<BehaviorRecord>("behavior", { region_code: activeRegion, month, sex_code: sex, age_code: age }, "final_activity_evidence_v1", revision, Boolean(activeRegion));
  const record = activity.data?.records[0];
  const provinces = [...new Map(catalog?.regions.map(r => [r.province_code, r.province_name]) || [["11", "서울특별시"]]).entries()];
  // Parent-city aggregates overlap their districts and do not own separate dong rows.
  const availableRegions = catalog?.regions.filter(r => r.province_code === province && r.dong_count > 0) || [];
  const scopeName = region ? availableRegions.find(r => r.code === region)?.name || region : provinces.find(([code]) => code === province)?.[1] || province;
  const activeRegionName = area?.region_name || scopeName;
  const localGeo = useMemo<Boundaries>(() => ({ type: "FeatureCollection", features: geo?.features.filter(f => f.properties.code.startsWith(region || province)) || [] }), [geo, region, province]);
  const mapRows = useMemo(() => mapSurvey(localGeo, rows), [localGeo, rows]);
  const visibleCodes = useMemo(() => new Set(filtered.map(row => row.area_code)), [filtered]);
  const presentation = useMemo(() => ({
    color: surveyColor, tooltip: (code: string) => { const row = rows.find(r => r.area_code === code); const mapped = mapRows.find(r => r.code === code); return `${row?.area_name || mapped?.name || code} · 지역 고립 참고점수 ${formatNumber(mapped?.risk_score)}${mapped?.risk_score != null ? '점' : ''}`; },
    ariaLabel: `${scopeName} 읍면동별 지역 고립 참고점수 지도. 왼쪽 목록에서도 지역을 선택할 수 있습니다.`,
    resetLabel: `${scopeName} 전체 보기`, regionLabel: scopeName, note: "성별·연령별 인구 비중 반영",
  }), [scopeName, rows, mapRows]);
  return <div className="fm-app">
    <header className="fm-header"><div className="fm-brand"><Compass size={30} /><div><h1>동행 관측소</h1><p>지역의 구성과 활동을 함께 살펴봅니다</p></div></div>
      <div className="fm-header-actions"><button className="fm-reload" onClick={() => setRevision(x => x + 1)}><RefreshCw size={16} />다시 불러오기</button></div></header>
    <div className="fm-toolbar"><label>시도<select value={province} onChange={e => { setProvince(e.target.value); setRegion(""); setSelected(""); setSearch(""); }}>{provinces.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>시군구<select value={region} onChange={e => { setRegion(e.target.value); setSelected(""); setSearch(""); }}><option value="">전체</option>{availableRegions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
      <label>기준월<select value={month} onChange={e => { setMonth(e.target.value); setSelected(""); }}>{(catalog?.months || months).map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}</select></label>
      <p>지역 고립 참고점수 <span>인구 비중 반영</span><i />활동변화 <span>시군구 관측</span></p></div>
    {catalogError && <ResourceMessage loading={false} error={catalogError} />}
    <main className="fm-workspace">
      <aside className="fm-areas"><div className="fm-section-heading"><h2>읍면동 찾기</h2><span>{rows.length}개 지역</span></div>
        <label className="fm-search"><Search size={16} /><input aria-label="읍면동 검색" value={search} onChange={e => setSearch(e.target.value)} placeholder="시군구·읍면동 검색" /></label>
        <p className="fm-list-caption">읍면동 이름순 <span>지역 고립 참고점수</span></p>
        {survey.loading || survey.error ? <ResourceMessage {...survey} /> : <div className="fm-area-list">{filtered.map(row => <button key={row.area_code} aria-pressed={area?.area_code === row.area_code} className={area?.area_code === row.area_code ? "selected" : ""} onClick={() => setSelected(row.area_code)}><span><i style={{ background: surveyColor(row.isolation_index) }} /><span>{row.area_name}{!region && <small>{row.region_name}</small>}</span></span><strong>{formatNumber(row.isolation_index)}</strong></button>)}{filtered.length === 0 && <p className="fm-empty">검색 결과가 없습니다.</p>}</div>}
        <p className="fm-list-foot">2025 전국 사회조사와 월말 주민등록 인구구성을 사용합니다.</p>
      </aside>
      <section className="fm-map-section"><div className="fm-section-heading"><div><h2>지역 고립 참고점수</h2><p>{scopeName} · {formatMonth(month)} · 20세 이상 인구구성</p></div><MapPinned size={22} /></div>
        <div className="fm-map">{geoError ? <ResourceMessage loading={false} error={geoError} /> : !geo ? <ResourceMessage loading /> : localGeo.features.length ? <MapView geo={localGeo} districts={mapRows} selected={area?.area_code || ""} visibleCodes={visibleCodes} onSelect={setSelected} presentation={presentation} />
          : <div className="fm-map-empty"><MapPinned size={40} /><h3>{scopeName} 지도 경계 준비 중</h3><p>읍면동 목록에서 {rows.length}개 지역의 참고지수를 확인하세요.</p></div>}</div>
        <div className="fm-legend" aria-label="지역 고립 참고점수 색상 범례">{[[29, '30 미만'], [32, '30–35'], [37, '35–40'], [42, '40 이상']] .map(([n, label]) => <span key={label}><i style={{ background: surveyColor(Number(n)) }} />{label}</span>)}<span>점 / 색상은 참고값 구간</span></div>
        <p className="fm-map-caption">전국 설문 결과에 지역의 성별·연령별 인구 비중을 반영한 값입니다. 월별 차이는 주민 인구구성이 달라진 정도를 나타냅니다.</p>
      </section>
      <aside className="fm-detail" aria-live="polite"><div className="fm-section-heading"><div><p>{activeRegionName}</p><h2>{area?.area_name || "지역 상세"}</h2></div><span className="fm-tag">지역 고립 참고점수</span></div>
        {!area ? <ResourceMessage {...survey} /> : <><p className="fm-detail-label">지역 고립 참고점수</p><div className="fm-score">{formatNumber(area.isolation_index)}<span> / 100점</span></div>
          <p className="fm-region-reference">{activeRegionName} 전체 참고값 <strong>{sgg.loading ? '조회 중' : regionRow ? `${formatNumber(regionRow.isolation_index)}점` : '자료 없음'}</strong></p>
          {sgg.error && <ResourceMessage loading={false} error={sgg.error} />}
          <dl className="fm-domains">{Object.entries(domains).map(([code, name]) => <div key={code}><dt>{name}</dt><dd>{formatNumber(area.domain_scores[code as keyof typeof domains])}<small>점</small></dd></div>)}</dl>
          <p className="fm-help">다섯 영역은 각각 20%씩 반영됩니다. 점수가 높을수록 해당 영역의 어려움이나 관계 부족이 더 많이 반영된 값입니다. 영역마다 의미가 달라 점수만으로 위험 순위를 정하지 않습니다.</p>
          <div className="fm-population"><span>20세 이상 주민등록인구</span><strong>{formatNumber(area.population_20plus, 0)}명</strong></div>
          <details className="fm-method"><summary>성·연령별 인구비중</summary>{Object.entries(area.group_weights).map(([group, value]) => <p className="fm-weight" key={group}><span>{populationGroupLabel(group)}</span><strong>{formatNumber(value * 100, 1)}%</strong></p>)}</details>
          <p className="fm-help">이 지역 주민을 직접 조사한 결과나 고립된 주민의 비율은 아닙니다. 통신·카드 자료의 활동 변화는 아래에서 따로 확인합니다.</p></>}
      </aside>
      <section className="fm-activity"><div className="fm-activity-heading"><div className="fm-section-heading"><Activity size={23} /><div><h2>{activeRegionName} 활동변화</h2><p>{formatMonth(month)} · 시군구 단위 관측</p></div></div><div className="fm-activity-controls"><label>성별<select value={sex} onChange={e => setSex(e.target.value)}><option value="MAN">남성</option><option value="WMAN">여성</option></select></label><label>연령<select value={age} onChange={e => setAge(e.target.value)}>{Object.entries(ages).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label></div></div>
        <p className="fm-help">성별·연령 선택은 활동변화에 적용됩니다. 위 참고점수는 지역의 20세 이상 전체 주민의 성별·연령별 인구 비중을 반영합니다.</p>
        <p className="fm-quality"><span>추가 확인 후 해석</span>자료 수집 범위, 지역 경계의 변경, 빠진 자료를 먼저 확인해야 합니다. 이 결과로 자동 경보를 보내지 않습니다.</p>
        {activity.loading || activity.error || !record ? <ResourceMessage {...activity} empty={month === '202507' ? '7월은 전월 비교에 필요한 이전 달 관측이 없어 활동변화가 제공되지 않습니다.' : undefined} /> : <BehaviorDetail record={record} />}
      </section>
      <WelfarePanel region={activeRegion} regionName={activeRegionName} month={month} sex={sex} age={age} revision={revision} />
    </main>
    <footer className="fm-footer">전국 사회조사 · 행정안전부 주민등록인구 · 통신자료 유동인구 · 신한카드 결제 관측<details><summary>자료 버전</summary><p>지역 고립 참고점수: {survey.data?.run_id || '연결 대기'}</p><p>활동: {activity.data?.run_id || '연결 대기'}</p></details></footer>
  </div>;
}
