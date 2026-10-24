import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { activityChanges, behaviorFor, mapBehaviorDistricts, mapDistricts, mobilityFor, validateSnapshot, type ResearchSnapshot } from "../src/research";
import type { Boundaries } from "../src/MapView";

// Synthetic values are test fixtures only; the application never imports this file.
const fixture: ResearchSnapshot = {
  schema_version: "research-1.0", mode: "research", as_of: "2026-10-03T00:00:00+09:00", disclaimer: "테스트용 합성 측정값",
  survey: { year: 2025, area_level: "district", population: "서울20/30대 테스트", formula: "I=0.5S+0.5L", records: [
    { district: "강남구", age_group: "20대", score: 30, ci_low: 20, ci_high: 40, support_absence: 20, loneliness: 40, n: 100, n_eff: 80, quality: "test", notes: [] },
    { district: "강남구", age_group: "30대", score: 40, ci_low: 30, ci_high: 50, support_absence: 30, loneliness: 50, n: 100, n_eff: 80, quality: "test", notes: [] },
    { district: "관악구", age_group: "20대", score: 55, ci_low: 45, ci_high: 65, support_absence: 40, loneliness: 70, n: 100, n_eff: 80, quality: "test", notes: [] },
  ] },
  mobility: { area_level: "dong", periods: ["2025-07", "2025-08", "2025-09"], unit: "제공 유동량 합계", records: [
    { city: "서울", district: "강남구", dong_code: "1168051000", dong_name: "신사동", age_group: "20대", period: "2025-07", flow_total: 100, change_pct: null, quality: "test", notes: [] },
    { city: "서울", district: "강남구", dong_code: "1168051000", dong_name: "신사동", age_group: "20대", period: "2025-08", flow_total: 80, change_pct: -20, quality: "test", notes: [] },
    { city: "서울", district: "강남구", dong_code: "1168051000", dong_name: "신사동", age_group: "20대", period: "2025-09", flow_total: null, change_pct: null, quality: "missing", notes: ["관측 부족"] },
    { city: "서울", district: "강남구", dong_code: "1168051000", dong_name: "신사동", age_group: "30대", period: "2025-08", flow_total: 120, change_pct: 20, quality: "test", notes: [] },
    { city: "춘천", district: null, dong_code: "5111051000", dong_name: "교동", age_group: "20대", period: "2025-08", flow_total: 40, change_pct: -50, quality: "test", notes: [] },
  ] }, sources: [], limitations: ["테스트용 합성 fixture"],
};
const boundaries = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "1168051000", name: "신사동", district: "강남구" }, geometry: null },
  { type: "Feature", properties: { code: "1162068500", name: "신사동", district: "관악구" }, geometry: null },
] } as unknown as Boundaries;
const behaviorFixture: ResearchSnapshot = {
  ...fixture,
  paper_behavior_index: {
    area_level: "dong", period: "2025-12", population: "20~39세 테스트 통신집계", method: "테스트 산식",
    normalization: "테스트 기준월 공간 표준화", full_paper_reproduction: false,
    records: [{ city: "서울", district: "강남구", dong_code: "1168051000", dong_name: "신사동",
      age_group: "20~39세", period: "2025-12", score: 35,
      dimensions: { economic_instability: 20, social_activity: 30, isolated_lifestyle: 40, social_relations: 50 },
      quality: "test", notes: ["합성 검증 fixture"] }],
  },
};

describe("research measurement boundaries", () => {
  it("accepts the actual published snapshot and retains all withheld and missing cells", () => {
    const actual = validateSnapshot(JSON.parse(readFileSync(new URL("../../shared/research/isolation_snapshot.json", import.meta.url), "utf8")));
    expect(actual.survey.records).toHaveLength(50);
    expect(actual.survey.records.filter((row) => row.score === null)).toHaveLength(3);
    expect(actual.mobility.records.filter((row) => row.flow_total === null).length).toBeGreaterThan(0);
    expect(actual.survey.records.every((row) => row.score === null || Math.abs(row.score - (row.support_absence! + row.loneliness!) / 2) < 0.001)).toBe(true);
  });
  it("joins the two same-named 신사동 by exact code and district only", () => {
    expect(mobilityFor(fixture, "서울", "1168051000", "강남구", "20대")).toHaveLength(3);
    expect(mobilityFor(fixture, "서울", "1162068500", "관악구", "20대")).toEqual([]);
    expect(mobilityFor(fixture, "서울", "1168051000", "관악구", "20대")).toEqual([]);
  });
  it("uses the selected district survey and never computes a dong index from SK", () => {
    expect(mapDistricts(boundaries, fixture, "20대").map((row) => row.risk_score)).toEqual([30, 55]);
    expect(mapDistricts(boundaries, fixture, "30대").map((row) => row.risk_score)).toEqual([40, null]);
    const withoutFlow = { ...fixture, mobility: { ...fixture.mobility, records: [] } };
    expect(mapDistricts(boundaries, withoutFlow, "20대")).toEqual(mapDistricts(boundaries, fixture, "20대"));
    expect(activityChanges(withoutFlow, "서울", "20대")).toEqual([]);
  });
  it("filters SK by age and leaves missing observations null", () => {
    const rows = mobilityFor(fixture, "서울", "1168051000", "강남구", "30대");
    expect(rows).toHaveLength(1); expect(rows[0].flow_total).toBe(120);
    expect(mobilityFor(fixture, "서울", "1168051000", "강남구", "20대").at(-1)?.flow_total).toBeNull();
  });
  it("orders activity confirmation by absolute baseline change in latest valid month within city and age", () => {
    expect(activityChanges(fixture, "서울", "20대")[0]).toMatchObject({ period: "2025-08", change_pct: -20 });
    expect(activityChanges(fixture, "춘천", "20대")[0]).toMatchObject({ dong_name: "교동", change_pct: -50 });
    expect(activityChanges(fixture, "서울", "30대")[0].change_pct).toBe(20);
  });
  it("requires a research dataset and rejects duplicate and malformed measurement keys", () => {
    expect(validateSnapshot(fixture)).toBe(fixture);
    expect(() => validateSnapshot({ ...fixture, mode: "mock" })).toThrow();
    expect(() => validateSnapshot({ ...fixture, survey: { ...fixture.survey, records: [...fixture.survey.records, fixture.survey.records[0]] } })).toThrow();
    expect(() => validateSnapshot({ ...fixture, mobility: { ...fixture.mobility, records: [{ ...fixture.mobility.records[0], flow_total: -1 }] } })).toThrow();
  });
  it("maps behavior by exact city, code, district and dong name and leaves absent observations null", () => {
    expect(validateSnapshot(behaviorFixture)).toBe(behaviorFixture);
    expect(mapBehaviorDistricts(boundaries, behaviorFixture).map((row) => row.risk_score)).toEqual([35, null]);
    expect(behaviorFor(behaviorFixture, "춘천", "1168051000", "강남구", "신사동")).toBeUndefined();
    expect(behaviorFor(behaviorFixture, "서울", "1168051000", "관악구", "신사동")).toBeUndefined();
    expect(behaviorFor(behaviorFixture, "서울", "1168051000", "강남구", "이름변경동")).toBeUndefined();
    const changedName = { ...boundaries, features: boundaries.features.map((feature) => ({ ...feature, properties: { ...feature.properties, name: "이름변경동" } })) };
    expect(mapBehaviorDistricts(changedName, behaviorFixture).every((row) => row.risk_score === null)).toBe(true);
  });
  it("keeps the 20~39 behavior reference month fixed and separate from age-specific survey and SK values", () => {
    const maps = mapBehaviorDistricts(boundaries, behaviorFixture);
    expect(behaviorFixture.paper_behavior_index?.records[0].period).toBe("2025-12");
    expect(mapDistricts(boundaries, behaviorFixture, "20대").map((row) => row.risk_score)).toEqual([30, 55]);
    expect(mapDistricts(boundaries, behaviorFixture, "30대").map((row) => row.risk_score)).toEqual([40, null]);
    expect(mapBehaviorDistricts(boundaries, { ...behaviorFixture, mobility: { ...fixture.mobility, records: [] } })).toEqual(maps);
  });
  it("rejects duplicate, other-month and incomplete published behavior indices without replacing missingness with zero", () => {
    const index = behaviorFixture.paper_behavior_index!;
    const record = index.records[0];
    for (const records of [[record, record], [{ ...record, period: "2025-08" }], [{ ...record, dimensions: { ...record.dimensions, social_relations: null } }]]) {
      expect(() => validateSnapshot({ ...behaviorFixture, paper_behavior_index: { ...index, records } })).toThrow();
    }
    const held = { ...record, score: null, dimensions: { ...record.dimensions, social_relations: null }, quality: "missing" };
    const data = validateSnapshot({ ...behaviorFixture, paper_behavior_index: { ...index, records: [held] } });
    expect(mapBehaviorDistricts(boundaries, data)[0]).toMatchObject({ risk_score: null, research_status: "held" });
  });
});
