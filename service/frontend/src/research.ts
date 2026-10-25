import type { Boundaries } from "./MapView";

export type AgeGroup = "20대" | "30대";
export interface SurveyRecord {
  district: string;
  age_group: AgeGroup;
  score: number | null;
  ci_low: number | null;
  ci_high: number | null;
  support_absence: number | null;
  loneliness: number | null;
  n: number;
  n_eff: number | null;
  quality: string;
  notes: string[];
}
export interface MobilityRecord {
  city: string;
  district: string | null;
  dong_code: string;
  dong_name: string;
  age_group: AgeGroup;
  period: string;
  flow_total: number | null;
  visitors?: number | null;
  change_pct: number | null;
  quality: string;
  notes: string[];
}
export const behaviorDimensions = {
  economic_instability: "경제적 불안정성",
  social_activity: "사회활동 제한",
  isolated_lifestyle: "고립형 생활",
  social_relations: "사회적 관계 부족",
} as const;
export type BehaviorDimension = keyof typeof behaviorDimensions;
export interface BehaviorRecord {
  city: "서울";
  district: string;
  dong_code: string;
  dong_name: string;
  age_group: "20~39세";
  period: string;
  score: number | null;
  dimensions: Record<BehaviorDimension, number | null>;
  quality: string;
  notes: string[];
}
export interface PaperBehaviorIndex {
  area_level: "dong";
  period: string;
  population: string;
  method: string;
  normalization: string;
  source_url?: string;
  report_url?: string;
  full_paper_reproduction?: false;
  observation_window?: string;
  source_listed_modified_at?: string | null;
  source_first_published_at?: string | null;
  records: BehaviorRecord[];
}
export interface ResearchSnapshot {
  schema_version: "research-1.0";
  mode: "research";
  as_of: string;
  disclaimer: string;
  survey: {
    year: number;
    area_level: "district";
    population: string;
    formula: string;
    ci_method?: string;
    records: SurveyRecord[];
  };
  mobility: {
    area_level: "dong";
    unit?: string;
    reference_period?: string;
    reference_note?: string;
    footprint?: string;
    periods: string[];
    records: MobilityRecord[];
  };
  paper_behavior_index?: PaperBehaviorIndex;
  sources: { title: string; url?: string | null; path?: string; description?: string }[];
  limitations: string[];
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const bounded = (value: unknown) => value === null || (finite(value) && value >= 0 && value <= 100);
export function validateSnapshot(value: unknown): ResearchSnapshot {
  const data = value as ResearchSnapshot;
  if (!data || data.mode !== "research" || data.schema_version !== "research-1.0"
    || !data.as_of || !data.disclaimer || data.survey?.area_level !== "district"
    || data.mobility?.area_level !== "dong" || !Array.isArray(data.survey.records)
    || !data.survey.records.length || !Array.isArray(data.mobility.records)
    || !Array.isArray(data.mobility.periods) || !Array.isArray(data.sources)
    || !Array.isArray(data.limitations))
    throw new Error("저장된 자료 형식이 맞지 않습니다. 담당자에게 자료 확인을 요청해 주세요.");
  const surveyKeys = new Set<string>();
  for (const record of data.survey.records) {
    const key = `${record.district}|${record.age_group}`;
    if (!record.district || !["20대", "30대"].includes(record.age_group)
      || ![record.score, record.ci_low, record.ci_high, record.support_absence, record.loneliness].every(bounded)
      || !finite(record.n) || record.n < 0 || !Number.isInteger(record.n)
      || !(record.n_eff === null || (finite(record.n_eff) && record.n_eff >= 0))
      || !record.quality || !Array.isArray(record.notes) || surveyKeys.has(key)
      || (record.ci_low !== null && record.ci_high !== null && record.ci_low > record.ci_high)
      || (record.score === null && (record.ci_low !== null || record.ci_high !== null))
      || (record.score !== null && (record.support_absence === null || record.loneliness === null
        || Math.abs(record.score - (record.support_absence + record.loneliness) / 2) > 0.11)))
      throw new Error("자치구·연령별 설문 결과나 추정 범위를 확인할 수 없습니다. 담당자에게 자료 확인을 요청해 주세요.");
    surveyKeys.add(key);
  }
  const mobilityKeys = new Set<string>();
  for (const record of data.mobility.records) {
    const key = `${record.city}|${record.dong_code}|${record.age_group}|${record.period}`;
    if (!record.city || !record.dong_code || !record.dong_name || !["20대", "30대"].includes(record.age_group)
      || !data.mobility.periods.includes(record.period)
      || !(record.flow_total === null || (finite(record.flow_total) && record.flow_total >= 0))
      || !(record.change_pct === null || finite(record.change_pct))
      || (record.flow_total === null && record.change_pct !== null)
      || !/^\d{10}$/.test(record.dong_code)
      || !record.quality || !Array.isArray(record.notes) || mobilityKeys.has(key))
      throw new Error("행정동·연령·월별 유동인구 자료를 확인할 수 없습니다. 담당자에게 자료 확인을 요청해 주세요.");
    mobilityKeys.add(key);
  }
  if (data.paper_behavior_index) {
    const index = data.paper_behavior_index;
    if (index.area_level !== "dong" || !/^\d{4}-\d{2}$/.test(index.period)
      || !index.population || !index.method || !index.normalization || !Array.isArray(index.records)
      || (index.full_paper_reproduction !== undefined && index.full_paper_reproduction !== false))
      throw new Error("활동자료 참고점수의 대상과 계산 기준을 확인할 수 없습니다.");
    const keys = new Set<string>();
    for (const record of index.records) {
      const key = `${record.city}|${record.dong_code}|${record.age_group}|${record.period}`;
      const parts = Object.keys(behaviorDimensions).map((key) => record.dimensions?.[key as BehaviorDimension]);
      if (record.city !== "서울" || !record.district || !record.dong_name || !/^\d{10}$/.test(record.dong_code)
        || record.age_group !== "20~39세" || record.period !== index.period
        || !bounded(record.score) || !parts.every(bounded) || !record.quality || !Array.isArray(record.notes)
        || keys.has(key) || (record.score !== null && parts.some((part) => part === null)))
        throw new Error("행정동별 활동자료의 지역·기간·영역별 값이 맞지 않습니다. 담당자에게 자료 확인을 요청해 주세요.");
      keys.add(key);
    }
  }
  return data;
}

export function surveyFor(data: ResearchSnapshot, district: string, age: AgeGroup) {
  return data.survey.records.find((row) => row.district === district && row.age_group === age);
}
export function mapDistricts(geo: Boundaries, data: ResearchSnapshot, age: AgeGroup) {
  return geo.features.map(({ properties }) => {
    const row = surveyFor(data, properties.district, age);
    return { code: String(properties.code), name: properties.name, district: properties.district,
      risk_score: row?.score ?? null, risk_level: "unknown" as const,
      research_status: !row ? "missing" as const : row.score === null ? "held" as const : "published" as const };
  });
}
export function behaviorFor(data: ResearchSnapshot, city: string, code: string, district: string, dongName: string) {
  if (city !== "서울") return undefined;
  const matched = data.paper_behavior_index?.records.filter((row) => row.city === city
    && row.dong_code === code && row.district === district && row.dong_name.replace(/\s/g, "") === dongName.replace(/\s/g, "")
    && row.period === data.paper_behavior_index?.period);
  return matched?.find((row) => row.age_group === "20~39세");
}
export function mapBehaviorDistricts(geo: Boundaries, data: ResearchSnapshot) {
  return geo.features.map(({ properties }) => {
    const row = behaviorFor(data, "서울", String(properties.code), properties.district, properties.name);
    return { code: String(properties.code), name: properties.name, district: properties.district,
      risk_score: row?.score ?? null, risk_level: "unknown" as const,
      research_status: !row ? "missing" as const : row.score === null ? "held" as const : "published" as const };
  });
}
export function mobilityFor(data: ResearchSnapshot, city: string, code: string, district: string, age: AgeGroup) {
  return data.mobility.records.filter((row) => row.city === city && row.age_group === age
    && row.dong_code === code && (city !== "서울" || row.district === district)).sort((a, b) => a.period.localeCompare(b.period));
}
export function activityChanges(data: ResearchSnapshot, city: string, age: AgeGroup) {
  const index = new Map<string, MobilityRecord>();
  for (const row of data.mobility.records) {
    if (row.city !== city || row.age_group !== age || row.flow_total === null || row.change_pct === null) continue;
    const previous = index.get(row.dong_code);
    if (!previous || previous.period < row.period) index.set(row.dong_code, row);
  }
  return [...index.values()].sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!) || a.dong_code.localeCompare(b.dong_code));
}
export const scoreText = (value: number | null | undefined) => value == null ? "자료 없음" : value.toFixed(1);
export const flowText = (value: number | null | undefined) => value == null ? "자료 없음" : value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
export const qualityText = (value: string) => ({ adequate_descriptive_sample: "설문 결과를 요약할 응답 수 확보", insufficient_sample: "표본 부족 · 지수 보류", complete_fixed_footprint: "같은 관측장소의 자료 모두 확보", incomplete_fixed_footprint: "같은 관측장소의 자료 일부 부족", low_effective_sample: "응답 비중을 반영한 표본 수 부족 · 계산 보류", complete_descriptive_proxy: "필수 활동자료 확보 · 참고점수", held_missing_inputs: "필수 항목 부족 · 계산 보류" }[value] || value);
export function researchColor(score: number | null) {
  if (score === null) return "#aab7c0";
  const fraction = Math.max(0, Math.min(100, score)) / 100;
  return `rgb(${Math.round(224 - fraction * 199)}, ${Math.round(241 - fraction * 123)}, ${Math.round(237 - fraction * 124)})`;
}
