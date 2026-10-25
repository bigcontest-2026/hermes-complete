import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyRun,
  levelOf,
  mockRun,
  requestRun,
  scenarios,
} from "../src/engine";
import type { Dataset } from "../src/types";
const data: Dataset = JSON.parse(
  readFileSync(
    new URL("../../shared/mock/dataset.json", import.meta.url),
    "utf8",
  ),
);
const district = data.districts.find(
  (d) => d.quality === "valid" && d.risk_score !== null,
)!;
afterEach(() => vi.unstubAllGlobals());
describe("scenario behavior against shared fixture", () => {
  it("supports all five contract scenarios and repeat execution", () => {
    const runs = scenarios.map((s) => mockRun(data, district.code, s.id));
    expect(runs).toHaveLength(5);
    expect(new Set(runs.map((r) => r.run_id)).size).toBe(5);
    expect(mockRun(data, district.code, "normal").risk_score).toBe(
      district.risk_score,
    );
  });
  it("uses base data on every run and synchronizes map/list/detail values", () => {
    const run = mockRun(data, district.code, "risk_spike");
    expect(run.risk_score).toBe(Math.min(99, district.risk_score! + 30));
    expect(applyRun(district, run).risk_score).toBe(run.risk_score);
    expect(applyRun(district, run).risk_level).toBe(run.risk_level);
    expect(mockRun(data, district.code, "normal").risk_score).toBe(
      district.risk_score,
    );
  });
  it("holds missing data and does not search policies", () => {
    const run = mockRun(data, district.code, "missing_data");
    expect(run).toMatchObject({
      status: "held",
      risk_score: null,
      risk_level: "unknown",
      policies: [],
    });
    expect(run.steps.some((s) => s.id === "policy")).toBe(false);
    expect(applyRun(district, run).quality).toBe("missing");
  });
  it("excludes expired policies and searches alternatives once", () => {
    const run = mockRun(data, district.code, "expired_policy");
    expect(run.steps.filter((s) => s.id === "retry")).toHaveLength(1);
    expect(run.policies.length).toBeGreaterThan(0);
    expect(
      run.policies.every(
        (p) =>
          p.start_date <= data.as_of.slice(0, 10) &&
          p.end_date >= data.as_of.slice(0, 10),
      ),
    ).toBe(true);
  });
  it("terminates a policy gap with an explicit warning", () => {
    const run = mockRun(data, district.code, "no_policy");
    expect(run.status).toBe("completed");
    expect(run.policies).toEqual([]);
    expect(run.warnings.join(" ")).toContain("담당자");
  });
  it("rejects unknown districts and correctly classifies thresholds", () => {
    expect(() => mockRun(data, "nonexistent", "normal")).toThrow();
    expect([null, 0, 39, 40, 69, 70, 100].map(levelOf)).toEqual([
      "unknown",
      "low",
      "low",
      "watch",
      "watch",
      "high",
      "high",
    ]);
  });
});
describe("API contract", () => {
  it("uses server risk values directly", async () => {
    const run = {
      ...mockRun(data, district.code, "normal"),
      risk_score: 91,
      risk_level: "high",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => run });
    vi.stubGlobal("fetch", fetcher);
    expect(
      await requestRun("http://localhost:8000/", district.code, "normal"),
    ).toEqual(run);
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:8000/api/runs",
      expect.objectContaining({
        body: JSON.stringify({
          district_code: district.code,
          scenario: "normal",
        }),
      }),
    );
  });
  it("reports API errors without falling back to mock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(
      requestRun("http://localhost:8000", district.code, "normal"),
    ).rejects.toThrow("503");
    await expect(requestRun("", district.code, "normal")).rejects.toThrow(
      "서비스 연결 주소가 설정되지 않았습니다",
    );
  });
  it("rejects incorrect held results", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            ...mockRun(data, district.code, "missing_data"),
            risk_score: 50,
          }),
        }),
    );
    await expect(
      requestRun("http://localhost:8000", district.code, "missing_data"),
    ).rejects.toThrow("자료 부족");
  });
});
