import type { Boundaries } from "./MapView";

export type RegionCode = string;
export interface ModelRegions {
  run_id: string; geographic_scope: string; months: string[];
  regions: { code: string; name: string; province_code: string; province_name: string; dong_count: number }[];
}
export const months = ["202507", "202508", "202509", "202510", "202511", "202512"];
export const ages = { "20G": "20대", "30G": "30대", "40G": "40대", "50G": "50대", "60GU": "60세 이상" } as const;
export const domains = { E: "경제생활의 어려움", P: "모임·단체 참여 부족", O: "드문 외출", C: "가족·주변 사람과 교류 부족", U: "도움을 부탁할 관계 부족" } as const;
export interface SurveyArea {
  schema_version: "survey_area_isolation_index_v1";
  record_id: string; month: string; spatial_unit: "sgg" | "administrative_dong";
  region_code: RegionCode; region_name: string; area_code: string; area_name: string;
  dong_code: string | null; isolation_index: number; i5_reference: number;
  domain_scores: Record<keyof typeof domains, number>;
  population_20plus: number; group_weights: Record<string, number>;
  local_survey_measured: false; local_survey_n_valid: null; behavior_signals_included: false;
  operational_alert_allowed: false;
}
export interface ActivitySource {
  activity_daily: number | null; previous_activity_daily: number | null;
  change_percent: number | null; Q: number | null; H: number | null; T: number | null;
  robust: { z: number | null; candidate: boolean | null; status: string };
}
export interface BehaviorRecord {
  behavior: {
    contract_version: "final_activity_evidence_v1"; record_id: string;
    key: { month: string; region_code: RegionCode; sex_code: string; age_code: string };
    region_name: string; spatial_unit: "sgg"; sources: { skt: ActivitySource; card_a: ActivitySource };
    rule: { candidate: boolean | null; two_month_streak: boolean | null };
    robust: { candidate: boolean | null }; explanation: string;
    quality: { status: "hold"; reasons: string[] }; operational_alert_allowed: false;
  };
  historical_reference: {
    record_id: string; reference_start: string; reference_end: string;
    count: { change_pct: number | null; decline_flag: boolean | null };
  } | null;
}
export interface ModelPage<T> {
  contract_version: string; run_id: string; records: T[];
  total_matched: number; next_offset: number | null; operational_alert_allowed: false;
  availability?: { status: string; reason: string | null };
}
export interface ModelStatus {
  mode: "final"; status: string;
  sources: Record<"survey" | "activity", { ready: boolean; code: string; run_id?: string }>;
}

export const formatNumber = (value: number | null | undefined, digits = 2) =>
  value == null ? "자료 없음" : value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const formatMonth = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(4))}월`;
export const candidateText = (value: boolean | null) => value === null ? "계산 불가" : value ? "해당" : "해당 없음";
export const surveyColor = (score: number | null) => score === null ? "#cdd5da" : score < 30 ? "#deeeeb" : score < 35 ? "#a9d7cf" : score < 40 ? "#69b7a6" : "#2e8879";

export function sameDongName(official: string, boundary: string) {
  const punctuation = (value: string) => value.replace(/[·ㆍ]/g, ".");
  const name = punctuation(official), mapped = punctuation(boundary);
  // MOIS uses 창신제1동 / 홍제제1동; the existing boundary uses 창신1동 / 홍제1동.
  return name === mapped || name.replace(/제(?=\d)/g, "") === mapped;
}

export function mapSurvey(geo: Boundaries, rows: SurveyArea[]) {
  return geo.features.map(({ properties }) => {
    const row = rows.find(r => r.spatial_unit === "administrative_dong" && r.area_code === properties.code
      && r.dong_code === properties.code && r.region_name === properties.district && sameDongName(r.area_name, properties.name));
    return { ...properties, risk_score: row?.isolation_index ?? null, risk_level: "unknown" as const };
  });
}

export function validatePage<T>(data: ModelPage<T>, contract: string): ModelPage<T> {
  if (data.contract_version !== contract || data.operational_alert_allowed !== false || !Array.isArray(data.records))
    throw new Error("불러온 자료 형식이 맞지 않습니다. 다시 불러오거나 담당자에게 문의해 주세요.");
  if (contract === "survey_area_isolation_index_v1") {
    for (const row of data.records as SurveyArea[]) {
      if (row.schema_version !== contract || row.local_survey_measured !== false || row.behavior_signals_included !== false
          || row.local_survey_n_valid !== null || row.operational_alert_allowed !== false
          || !Number.isFinite(row.isolation_index) || row.isolation_index < 0 || row.isolation_index > 100
          || row.isolation_index !== row.i5_reference)
        throw new Error("지역 고립 참고점수의 계산 기준을 확인할 수 없습니다. 담당자에게 자료 확인을 요청해 주세요.");
    }
  } else {
    for (const row of data.records as BehaviorRecord[]) {
      if (row.behavior?.contract_version !== contract || row.behavior.spatial_unit !== "sgg"
          || row.behavior.quality.status !== "hold" || row.behavior.operational_alert_allowed !== false)
        throw new Error("활동 변화 자료의 계산 기준을 확인할 수 없습니다. 담당자에게 자료 확인을 요청해 주세요.");
    }
  }
  return data;
}

const apiBase = (import.meta.env.VITE_MODEL_API_BASE_URL || "").replace(/\/$/, "");
export async function fetchModel<T>(path: string, params: Record<string, string>, signal: AbortSignal): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBase}/api/model/${path}?${new URLSearchParams(params)}`, { signal }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error("조회 서버에 연결할 수 없습니다. 잠시 후 다시 불러오거나 담당자에게 연결 상태를 문의해 주세요.");
  }
  if (!response.ok) {
    if (response.status === 503) throw new Error("검증된 자료가 아직 준비되지 않았습니다. 자료 연결 상태를 확인한 뒤 다시 불러오세요.");
    throw new Error(`자료를 불러오지 못했습니다 (${response.status}).`);
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("조회 서버 주소를 확인해 주세요.");
  return response.json();
}

export async function fetchModelPages<T>(path: string, params: Record<string, string>, contract: string, signal: AbortSignal): Promise<ModelPage<T>> {
  const first = validatePage(await fetchModel<ModelPage<T>>(path, params, signal), contract);
  const records = [...first.records];
  let next = first.next_offset;
  let offset = Number(params.offset || 0);
  while (next !== null) {
    if (next <= offset) throw new Error("자료를 순서대로 불러오지 못했습니다. 다시 불러와 주세요.");
    offset = next;
    const page = validatePage(await fetchModel<ModelPage<T>>(path, { ...params, offset: String(offset) }, signal), contract);
    if (page.run_id !== first.run_id || page.total_matched !== first.total_matched)
      throw new Error("조회 중 자료 버전이 바뀌었습니다. 다시 불러오세요.");
    records.push(...page.records);
    next = page.next_offset;
  }
  if (records.length !== first.total_matched - Number(params.offset || 0))
    throw new Error("자료 일부를 불러오지 못했습니다. 다시 불러오세요.");
  return { ...first, records, next_offset: null };
}
