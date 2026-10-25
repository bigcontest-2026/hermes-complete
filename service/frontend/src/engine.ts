import type {
  Dataset,
  District,
  Level,
  RunResult,
  Scenario,
  Step,
} from "./types";
export const levelOf = (score: number | null): Level =>
  score === null
    ? "unknown"
    : score >= 70
      ? "high"
      : score >= 40
        ? "watch"
        : "low";
export const levels: Record<Level, { label: string; color: string }> = {
  low: { label: "정상", color: "#6eada0" },
  watch: { label: "관심", color: "#d7a84c" },
  high: { label: "위험", color: "#ce655a" },
  unknown: { label: "자료부족", color: "#99a7b4" },
};
export const scenarios: { id: Scenario; label: string; description: string }[] =
  [
    {
      id: "normal",
      label: "일반 관측",
      description: "현재 지표를 확인하고 적용 가능한 가상 정책을 찾습니다.",
    },
    {
      id: "risk_spike",
      label: "위험 급상승",
      description:
        "점수가 30 상승한 상황에서 변화 신호와 대응 후보를 확인합니다.",
    },
    {
      id: "missing_data",
      label: "자료 누락",
      description: "자료가 부족하면 판단을 보류하고 정책 검색을 멈춥니다.",
    },
    {
      id: "expired_policy",
      label: "정책 만료",
      description: "만료 후보를 제외하고 유효한 대체 정책을 다시 찾습니다.",
    },
    {
      id: "no_policy",
      label: "정책 공백",
      description:
        "적용할 정책이 없으면 담당자 확인이 필요한 상태로 종료합니다.",
    },
  ];
export function mockRun(
  data: Dataset,
  code: string,
  scenario: Scenario,
): RunResult {
  const district = data.districts.find((d) => d.code === code);
  if (!district)
    throw new Error(
      "선택한 행정동을 찾을 수 없습니다. 자료를 새로 불러와 주세요.",
    );
  if (!scenarios.some((s) => s.id === scenario))
    throw new Error("지원하지 않는 시나리오입니다.");
  const steps: Step[] = [];
  const add = (
    id: string,
    label: string,
    detail: string,
    status = "completed",
  ) => steps.push({ id, label, detail, status });
  const held =
    scenario === "missing_data" ||
    district.quality !== "valid" ||
    district.risk_score === null;
  add(
    "validate",
    "데이터 품질 확인",
    held
      ? "필수 관측 지표가 누락되어 판단을 보류합니다."
      : "행정동과 필수 관측 지표를 확인했습니다.",
    held ? "held" : "completed",
  );
  let score = held ? null : district.risk_score;
  let policies = data.policies
    .filter(
      (p) =>
        (p.districts.includes("*") ||
          p.districts.includes(code) ||
          p.districts.includes(district.name) ||
          p.districts.includes(district.district)) &&
        p.start_date <= data.as_of.slice(0, 10) &&
        p.end_date >= data.as_of.slice(0, 10),
    )
    .sort(
      (a, b) =>
        b.tags.filter((tag) => district.signals.some((s) => s.key === tag))
          .length -
          a.tags.filter((tag) => district.signals.some((s) => s.key === tag))
            .length || a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  const warnings: string[] = [];
  if (held) {
    policies = [];
    warnings.push(
      "필수 자료 누락: 데이터를 보완한 뒤 다시 실행해 주세요. 정책 검색은 진행하지 않았습니다.",
    );
  } else {
    if (scenario === "risk_spike") score = Math.min(99, (score ?? 0) + 30);
    add(
      "observe",
      "지역 변화 조사",
      scenario === "risk_spike"
        ? "가상 위험 지수 30 상승을 반영해 변화 신호를 조사했습니다."
        : "기준 시점의 합성 지표와 이전 관측값을 비교했습니다.",
    );
    add(
      "assess",
      "관측 상태 정리",
      `시연 위험 지수 ${score}점 · ${levels[levelOf(score)].label}. 개인에 대한 진단이 아닙니다.`,
    );
    if (scenario === "expired_policy") {
      add(
        "expired",
        "정책 유효기간 확인",
        "만료된 가상 정책 후보를 확인하고 추천 대상에서 제외했습니다.",
      );
      add(
        "retry",
        "대체 정책 재검색",
        "기준일에 유효한 가상 정책만 다시 검색했습니다.",
      );
      warnings.push(
        "만료된 가상 후보는 제외했습니다. 아래에는 유효한 대체 후보만 표시됩니다.",
      );
    }
    if (scenario === "no_policy") policies = [];
    add(
      "policy",
      "가상 정책 연결",
      policies.length
        ? `적용 가능한 가상 정책 ${policies.length}건을 찾았습니다.`
        : "적용 가능한 가상 정책이 없습니다. 담당자의 별도 확인이 필요합니다.",
    );
    if (!policies.length)
      warnings.push(
        "정책 공백: 담당자가 지원 가능 여부와 지역 자원을 별도로 확인해 주세요.",
      );
    add(
      "complete",
      "관측 기록 완료",
      "시연 결과를 정리했습니다. 실제 신청이나 외부 연락은 발생하지 않습니다.",
    );
  }
  return {
    run_id: `browser-${crypto.randomUUID()}`,
    mode: "mock",
    district_code: code,
    scenario,
    status: held ? "held" : "completed",
    risk_score: score,
    risk_level: levelOf(score),
    summary: held
      ? "관측 자료가 충분하지 않아 위험 판단을 보류했습니다."
      : scenario === "risk_spike"
        ? `${district.name}의 가상 위험 지수가 상승했습니다. 변화 신호를 확인하고 연결 가능한 지원을 검토해 주세요.`
        : `${district.name}의 관측을 마쳤습니다. 지역 지표와 가상 정책을 함께 검토해 주세요.`,
    policies,
    warnings,
    steps,
    completed_at: new Date().toISOString(),
  };
}
export function applyRun(district: District, run?: RunResult): District {
  return run
    ? {
        ...district,
        risk_score: run.risk_score,
        risk_level: run.risk_level,
        quality: run.status === "held" ? "missing" : "valid",
      }
    : district;
}
export async function requestRun(
  base: string,
  code: string,
  scenario: Scenario,
  signal?: AbortSignal,
): Promise<RunResult> {
  if (!base)
    throw new Error(
      "서비스 연결 주소가 설정되지 않았습니다. 담당자에게 연결 상태를 확인해 주세요.",
    );
  const response = await fetch(`${base.replace(/\/$/, "")}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ district_code: code, scenario }),
    signal,
  });
  if (!response.ok)
    throw new Error(
      `관측 결과를 불러오지 못했습니다 (오류 ${response.status}). 잠시 후 다시 시도해 주세요.`,
    );
  const run = (await response.json()) as RunResult;
  if (
    run.district_code !== code ||
    run.scenario !== scenario ||
    !Array.isArray(run.steps) ||
    !Array.isArray(run.policies) ||
    !Array.isArray(run.warnings) ||
    !["completed", "held"].includes(run.status) ||
    !["low", "watch", "high", "unknown"].includes(run.risk_level) ||
    (run.risk_score !== null &&
      (typeof run.risk_score !== "number" ||
        run.risk_score < 0 ||
        run.risk_score > 100))
  )
    throw new Error(
      "불러온 결과 형식이 맞지 않습니다. 다시 시도하거나 담당자에게 문의해 주세요.",
    );
  if (
    (run.status === "held" || scenario === "missing_data") &&
    (run.risk_score !== null ||
      run.risk_level !== "unknown" ||
      run.status !== "held" ||
      run.policies.length)
  )
    throw new Error(
      "자료 부족 응답이 올바르지 않습니다. 서버에서 판단 보류 상태를 확인해 주세요.",
    );
  return run;
}
