import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { candidateText, fetchModelPages, formatNumber, mapSurvey, validatePage, type ModelPage, type SurveyArea } from "../src/finalModel";
import type { Boundaries } from "../src/MapView";

// Synthetic test fixture. Never imported by the application.
const row = {
  schema_version: "survey_area_isolation_index_v1", spatial_unit: "administrative_dong",
  month: "202512", region_code: "11680", region_name: "강남구", area_code: "1168051000",
  dong_code: "1168051000", area_name: "신사동", isolation_index: 35, i5_reference: 35,
  local_survey_measured: false, local_survey_n_valid: null, behavior_signals_included: false,
  operational_alert_allowed: false,
} as SurveyArea;
const page = { contract_version: "survey_area_isolation_index_v1", operational_alert_allowed: false,
  run_id: "test-only", records: [row], total_matched: 1, next_offset: null } as ModelPage<SurveyArea>;
const boundaries = { type: "FeatureCollection", features: [
  { type: "Feature", geometry: null, properties: { code: "1168051000", name: "신사동", district: "강남구" } },
  { type: "Feature", geometry: null, properties: { code: "1162068500", name: "신사동", district: "관악구" } },
] } as unknown as Boundaries;

describe("final model presentation boundaries", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("joins I5 by exact code, district, and name, never by a same-named dong", () => {
    expect(mapSurvey(boundaries, [row]).map(r => r.risk_score)).toEqual([35, null]);
    expect(mapSurvey(boundaries, [{ ...row, area_name: "이름변경" }]).every(r => r.risk_score === null)).toBe(true);
    expect(mapSurvey(boundaries, [{ ...row, spatial_unit: "sgg" }]).every(r => r.risk_score === null)).toBe(true);
  });
  it("retains the population-reference contract and rejects incompatible measurements", () => {
    expect(validatePage(page, page.contract_version)).toBe(page);
    for (const mutation of [{ local_survey_measured: true }, { local_survey_n_valid: 100 },
      { behavior_signals_included: true }, { isolation_index: NaN }, { isolation_index: 101 }, { isolation_index: 34 }]) {
      expect(() => validatePage({ ...page, records: [{ ...row, ...mutation }] }, page.contract_version)).toThrow();
    }
    expect(() => validatePage({ ...page, contract_version: "research-1.0" }, page.contract_version)).toThrow();
  });
  it("distinguishes unavailable values from zero and false candidates", () => {
    expect(formatNumber(null)).toBe("자료 없음");
    expect(formatNumber(0)).toBe("0.00");
    expect(candidateText(null)).toBe("계산 불가");
    expect(candidateText(false)).toBe("해당 없음");
  });
  it("rejects activity data promoted to dong measurements or operational alerts", () => {
    const behavior = { contract_version: "final_activity_evidence_v1", spatial_unit: "sgg",
      quality: { status: "hold" }, operational_alert_allowed: false };
    const data = { ...page, contract_version: "final_activity_evidence_v1", records: [{ behavior, historical_reference: null }] };
    expect(validatePage(data, data.contract_version)).toBe(data);
    expect(() => validatePage({ ...data, records: [{ behavior: { ...behavior, spatial_unit: "administrative_dong" } }] }, data.contract_version)).toThrow();
  });
  it("accepts official numbered-dong spelling only when code and district agree", () => {
    const geo = { ...boundaries, features: [{ ...boundaries.features[0], properties: {
      code: '1141062000', district: '서대문구', name: '홍제1동',
    } }] } as Boundaries;
    const official = { ...row, area_code: '1141062000', dong_code: '1141062000', region_code: '11410', region_name: '서대문구', area_name: '홍제제1동' };
    expect(mapSurvey(geo, [official])[0].risk_score).toBe(35);
    expect(mapSurvey(geo, [{ ...official, dong_code: '1141064000' }])[0].risk_score).toBeNull();
  });
  it("loads every page and rejects a bundle change during pagination", async () => {
    const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    const first = { ...page, total_matched: 2, next_offset: 1 };
    const second = { ...page, total_matched: 2, records: [{ ...row, record_id: 'second', area_code: '1168052000' }] };
    const fetch = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second));
    vi.stubGlobal('fetch', fetch);
    const result = await fetchModelPages<SurveyArea>('survey-area', { limit: '1' }, page.contract_version, new AbortController().signal);
    expect(result.records).toHaveLength(2);
    expect(fetch.mock.calls[1][0]).toContain('offset=1');
    fetch.mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response({ ...second, run_id: 'changed' }));
    await expect(fetchModelPages('survey-area', { limit: '1' }, page.contract_version, new AbortController().signal)).rejects.toThrow('버전');
  });
  const actual = new URL('../../../model/data/i5/national_2025/dong_isolation_index.jsonl', import.meta.url);
  it.skipIf(!existsSync(actual))("maps all 427 actual Seoul I5 rows to the existing boundary by code", () => {
    const data: SurveyArea[] = readFileSync(actual, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const seoul = data.filter(r => r.month === '202512' && r.region_code.startsWith('11'));
    const geo = JSON.parse(readFileSync(new URL('../../shared/mock/districts.geojson', import.meta.url), 'utf8')) as Boundaries;
    expect(seoul).toHaveLength(427);
    expect(new Set(seoul.map(r => r.region_code)).size).toBe(25);
    const mapped = mapSurvey(geo, seoul);
    expect(mapped).toHaveLength(427);
    expect(mapped.every(r => r.risk_score !== null)).toBe(true);
  });
});
