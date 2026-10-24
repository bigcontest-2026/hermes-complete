export type Level = "low" | "watch" | "high" | "unknown";
export type Scenario =
  | "normal"
  | "risk_spike"
  | "missing_data"
  | "expired_policy"
  | "no_policy";
export interface Signal {
  key: string;
  label: string;
  value: number;
  unit: string;
  change_pct: number;
}
export interface District {
  code: string;
  name: string;
  district: string;
  risk_score: number | null;
  risk_level: Level;
  previous_score: number;
  quality: string;
  population: number;
  signals: Signal[];
  trend: { period: string; score: number }[];
  summary: string;
}
export interface Policy {
  id: string;
  title: string;
  districts: string[];
  target: string;
  tags: string[];
  description: string;
  start_date: string;
  end_date: string;
  source_url: string | null;
  is_mock: boolean;
  contact: string;
}
export interface Dataset {
  schema_version: string;
  mode: string;
  as_of: string;
  disclaimer: string;
  districts: District[];
  policies: Policy[];
}
export interface Step {
  id: string;
  label: string;
  status: string;
  detail: string;
}
export interface RunResult {
  run_id: string;
  mode: string;
  district_code: string;
  scenario: Scenario;
  status: "completed" | "held";
  risk_score: number | null;
  risk_level: Level;
  summary: string;
  policies: Policy[];
  warnings: string[];
  steps: Step[];
  completed_at: string;
}
