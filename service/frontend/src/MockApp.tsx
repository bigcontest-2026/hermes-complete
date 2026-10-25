import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Expand,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import MapView from "./MapView";
import type { Boundaries } from "./MapView";
import type { Dataset, District, Level, RunResult, Scenario } from "./types";
import { applyRun, levels, mockRun, requestRun, scenarios } from "./engine";
const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function Badge({ level }: { level: Level }) {
  return (
    <span className={`badge ${level}`}>
      <i />
      {levels[level].label}
    </span>
  );
}
function Trend({ district }: { district: District }) {
  const points = district.trend,
    width = 320,
    height = 86;
  if (!points.length)
    return <p className="muted">아직 추세 자료가 없습니다.</p>;
  const x = (i: number) =>
    12 + (i * (width - 24)) / Math.max(1, points.length - 1);
  const y = (score: number) => height - 8 - (score / 100) * (height - 16);
  return (
    <div className="trend">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`월별 기준 관측 추세: ${points.map((p) => `${p.period} ${p.score}점`).join(", ")}`}
      >
        <line
          x1="0"
          x2={width}
          y1={y(70)}
          y2={y(70)}
          stroke="#d6dfe4"
          strokeDasharray="3 4"
        />
        <polyline
          fill="none"
          stroke="#268b81"
          strokeWidth="2.5"
          points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
        />
        {points.map((p, i) => (
          <circle
            key={p.period}
            cx={x(i)}
            cy={y(p.score)}
            r="3.3"
            fill="white"
            stroke="#268b81"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="trend-labels">
        {points.map((p) => (
          <span key={p.period}>{Number(p.period.slice(5))}월</span>
        ))}
      </div>
      <p className="micro">
        기준 데이터의 추세입니다. 시나리오 실행값은 포함하지 않습니다.
      </p>
    </div>
  );
}
export default function MockApp({ mode }: { mode: "mock" | "api" }) {
  const [data, setData] = useState<Dataset | null>(null),
    [geo, setGeo] = useState<Boundaries | null>(null);
  const [loadError, setLoadError] = useState(""),
    [loadKey, setLoadKey] = useState(0);
  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState<Level | "all">("all");
  const [scenario, setScenario] = useState<Scenario>("normal"),
    [runs, setRuns] = useState<Record<string, RunResult>>({});
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [preview, setPreview] = useState<RunResult | null>(null),
    [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "run">("overview"),
    [help, setHelp] = useState(false);
  const activeRef = useRef(0),
    abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let live = true;
    setLoadError("");
    async function load() {
      try {
        if (!["mock", "api"].includes(mode))
          throw new Error(
            "이 화면을 열 수 없습니다. 현재 서비스 화면에서 다시 시작해 주세요.",
          );
        if (mode === "api" && !apiBase)
          throw new Error(
            "서비스 연결 주소가 설정되지 않았습니다. 담당자에게 연결 상태를 확인해 주세요.",
          );
        const base = import.meta.env.BASE_URL;
        const responses = await Promise.all([
          fetch(
            mode === "api"
              ? `${apiBase.replace(/\/$/, "")}/api/districts`
              : `${base}mock/dataset.json`,
            { signal: abort.signal },
          ),
          fetch(`${base}mock/districts.geojson`, { signal: abort.signal }),
        ]);
        if (responses.some((r) => !r.ok))
          throw new Error(
            "지도 또는 관측 자료를 불러오지 못했습니다. 연결 상태와 데이터 경로를 확인해 주세요.",
          );
        const [dataset, boundaries] = (await Promise.all(
          responses.map((r) => r.json()),
        )) as [Dataset, Boundaries];
        if (
          !Array.isArray(dataset.districts) ||
          !dataset.districts.length ||
          !Array.isArray(dataset.policies) ||
          boundaries.type !== "FeatureCollection" ||
          !boundaries.features.length
        )
          throw new Error(
            "표시할 행정동 자료가 없습니다. 데이터 구성을 확인해 주세요.",
          );
        if (live) {
          setData(dataset);
          setGeo(boundaries);
          setSelected(
            [...dataset.districts].sort(
              (a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1),
            )[0].code,
          );
        }
      } catch (e) {
        if (live)
          setLoadError(
            e instanceof Error ? e.message : "자료를 불러오지 못했습니다.",
          );
      }
    }
    void load();
    return () => {
      live = false;
      abort.abort();
    };
  }, [loadKey]);
  useEffect(
    () => () => {
      activeRef.current++;
      abortRef.current?.abort();
    },
    [],
  );
  const districts = useMemo(
    () => data?.districts.map((d) => applyRun(d, runs[d.code])) || [],
    [data, runs],
  );
  const filtered = useMemo(
    () =>
      districts
        .filter(
          (d) =>
            (filter === "all" || d.risk_level === filter) &&
            `${d.district} ${d.name}`.includes(query.trim()),
        )
        .sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1)),
    [districts, filter, query],
  );
  const visibleCodes = useMemo(
    () => new Set(filtered.map((d) => d.code)),
    [filtered],
  );
  const district = districts.find((d) => d.code === selected),
    run = runs[selected];
  function choose(code: string) {
    if (running) return;
    setSelected(code);
    setError("");
    setPreview(null);
    setProgress(0);
  }
  async function execute() {
    if (!data || !district || running) return;
    const id = ++activeRef.current,
      code = selected;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError("");
    setPreview(null);
    setProgress(0);
    setTab("run");
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const result =
        mode === "api"
          ? await requestRun(apiBase, code, scenario, controller.signal)
          : mockRun(data, code, scenario);
      if (id !== activeRef.current) return;
      setPreview(result);
      // API returns completed execution; only browser mock animates simulated steps.
      if (mode === "mock")
        for (let i = 0; i < result.steps.length; i++) {
          await wait(320);
          if (id !== activeRef.current) return;
          setProgress(i + 1);
        }
      else setProgress(result.steps.length);
      setRuns((old) => ({ ...old, [code]: result }));
    } catch (e) {
      if (id === activeRef.current)
        setError(
          e instanceof Error && e.name === "AbortError"
            ? "서버 응답 시간이 초과되었습니다. 연결을 확인한 뒤 다시 실행해 주세요."
            : e instanceof Error
              ? e.message
              : "실행하지 못했습니다. 다시 시도해 주세요.",
        );
    } finally {
      window.clearTimeout(timeout);
      if (id === activeRef.current) setRunning(false);
    }
  }
  const displayedRun = preview?.district_code === selected ? preview : run;
  return (
    <div className="app">
      <a href="#workspace" className="skip">
        작업 영역으로 건너뛰기
      </a>
      <aside className="rail">
        <div className="brand-symbol">
          <Compass size={27} />
        </div>
        <span className="rail-word">동행</span>
        <div className="rail-divider" />
        <div className="rail-active" aria-label="지역 관측">
          <MapPinned size={23} />
          <span>지역 관측</span>
        </div>
        <button
          className="rail-help"
          onClick={() => setHelp(!help)}
          aria-label="시연 안내"
          aria-expanded={help}
        >
          <CircleHelp size={22} />
          <span>이용 안내</span>
        </button>
      </aside>
      <div className="main">
        <header className="header">
          <div>
            <div className="brand-line">
              동행 관측소 <span>지역을 살피고, 연결을 잇다</span>
            </div>
            <p>서울특별시 지역 복지 검토</p>
          </div>
          <div className="header-meta">
            <a href="?mode=final" className="mode-switch">현재 서비스 화면 열기</a>
            <span className="demo-tag">공개 시연</span>
            <span className="mode-dot" />
            {mode === "api" ? "연결된 서비스 자료" : "브라우저 시연"}
          </div>
        </header>
        <div className="disclaimer">
          <ShieldCheck size={16} />
          <span>
            <strong>기능 확인용 예시 자료</strong> · 위험 지수와 정책은 가상이며,
            실제 진단이나 정책 자격을 뜻하지 않습니다.
          </span>
          <button onClick={() => setHelp(!help)} aria-expanded={help}>
            안내 보기
          </button>
        </div>
        {help && (
          <section className="help-panel">
            <button aria-label="안내 닫기" onClick={() => setHelp(false)}>
              <X size={18} />
            </button>
            <h2>시연을 시작하는 방법</h2>
            <p>
              지도나 목록에서 행정동을 선택하고, 우측에서 시나리오를 실행해
              보세요. 위험 지수는 0~100의 시연 지수이며 확률이 아닙니다. 정상 40
              미만, 관심 40~69, 위험 70 이상으로 표시합니다.
            </p>
            <p>
              실제 행정동 경계 위에 예시 지표를 표시합니다. 개인을 식별하거나
              실제 지원을 접수하지 않습니다.{" "}
              {mode === "mock"
                ? "관측 단계는 화면 기능을 확인하기 위한 시연입니다."
                : "서버가 반환한 실행 결과를 표시합니다. 연결 실패 시 오류가 표시됩니다."}
            </p>
          </section>
        )}
        <main id="workspace" className="workspace">
          {loadError ? (
            <div className="full-state" role="alert">
              <TriangleAlert size={32} />
              <h2>자료를 불러오지 못했습니다</h2>
              <p>{loadError}</p>
              <button
                className="primary"
                onClick={() => setLoadKey((k) => k + 1)}
              >
                <RefreshCw size={16} />
                다시 불러오기
              </button>
            </div>
          ) : !data || !geo || !district ? (
            <div className="full-state" role="status">
              <Compass className="spin" size={36} />
              <h2>서울의 관측 지도를 준비하고 있습니다</h2>
              <p>행정동 경계와 시연 자료를 불러옵니다.</p>
            </div>
          ) : (
            <>
              <section className="map-workspace">
                <div className="workspace-heading">
                  <div>
                    <h1>지역 관측 지도</h1>
                    <p>동네의 변화를 발견하고, 다음 연결을 준비합니다.</p>
                  </div>
                  <span className="as-of">
                    기준 {data.as_of.slice(0, 10).replaceAll("-", ". ")}
                  </span>
                </div>
                <div className="map-toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="자치구 또는 행정동 검색"
                      aria-label="자치구 또는 행정동 검색"
                    />
                    {query && (
                      <button
                        aria-label="검색어 지우기"
                        onClick={() => setQuery("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </label>
                  <label className="filter-label">
                    상태
                    <select
                      value={filter}
                      onChange={(e) =>
                        setFilter(e.target.value as Level | "all")
                      }
                      aria-label="관측 상태 필터"
                    >
                      <option value="all">전체 상태</option>
                      {Object.entries(levels).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="map-layout">
                  <aside className="district-list">
                    <div className="list-heading">
                      관측 지역 <strong>{filtered.length}</strong>
                      <span>지수 높은 순</span>
                    </div>
                    <div className="district-scroll">
                      {filtered.length ? (
                        filtered.map((d) => (
                          <button
                            key={d.code}
                            disabled={running}
                            className={`district-item ${selected === d.code ? "selected" : ""}`}
                            onClick={() => choose(d.code)}
                            aria-pressed={selected === d.code}
                          >
                            <div>
                              <span className="district-parent">
                                {d.district}
                              </span>
                              <strong>{d.name}</strong>
                              <Badge level={d.risk_level} />
                            </div>
                            <div className="district-number">
                              {d.risk_score ?? "—"}
                              <ChevronRight size={15} />
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="empty-list">
                          <Search size={24} />
                          <strong>일치하는 지역이 없습니다</strong>
                          <p>검색어나 상태 필터를 바꿔 주세요.</p>
                          <button
                            onClick={() => {
                              setQuery("");
                              setFilter("all");
                            }}
                          >
                            전체 지역 보기
                          </button>
                        </div>
                      )}
                    </div>
                  </aside>
                  <div
                    className={`map-container ${running ? "map-disabled" : ""}`}
                  >
                    <MapView
                      geo={geo}
                      districts={districts}
                      selected={selected}
                      visibleCodes={visibleCodes}
                      onSelect={choose}
                    />
                    <div className="map-legend">
                      {Object.entries(levels).map(([key, l]) => (
                        <span key={key}>
                          <i style={{ background: l.color }} />
                          {l.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <footer className="map-footer">
                  <span>
                    <Expand size={13} /> 지도를 확대하거나 동을 눌러 관측 내용을
                    확인하세요.
                  </span>
                  <span>외부 배경지도 없이 경계로 표시</span>
                </footer>
              </section>
              <aside className="detail-panel" aria-label="선택한 행정동 상세">
                <div className="detail-heading">
                  <div>
                    <span className="district-parent">
                      서울특별시 {district.district}
                    </span>
                    <h2>{district.name}</h2>
                  </div>
                  <Badge level={district.risk_level} />
                </div>
                <div
                  className="detail-tabs"
                  role="tablist"
                  aria-label="행정동 상세 탭"
                >
                  <button
                    id="overview-tab"
                    role="tab"
                    aria-selected={tab === "overview"}
                    aria-controls="overview-panel"
                    onClick={() => setTab("overview")}
                  >
                    지역 현황
                  </button>
                  <button
                    id="run-tab"
                    role="tab"
                    aria-selected={tab === "run"}
                    aria-controls="run-panel"
                    onClick={() => setTab("run")}
                  >
                    관측 기록 {run && <i />}
                  </button>
                </div>
                <div className="detail-scroll">
                  {tab === "overview" ? (
                    <div
                      id="overview-panel"
                      role="tabpanel"
                      aria-labelledby="overview-tab"
                    >
                      <section className="risk-block">
                        <div className="section-title">
                          <h3>시연 위험 지수</h3>
                          <span>확률이 아닌 관측 지수</span>
                        </div>
                        <div className="score-row">
                          <strong>{district.risk_score ?? "—"}</strong>
                          <span>/ 100</span>
                          {district.risk_score !== null && (
                            <div
                              className={`delta ${district.risk_score >= district.previous_score ? "up" : "down"}`}
                            >
                              {district.risk_score >=
                              district.previous_score ? (
                                <ArrowUp size={14} />
                              ) : (
                                <ArrowDown size={14} />
                              )}{" "}
                              {Math.abs(
                                district.risk_score - district.previous_score,
                              )}{" "}
                              <span>이전 대비</span>
                            </div>
                          )}
                        </div>
                        <div className="score-track">
                          <span
                            style={{
                              width: `${district.risk_score ?? 0}%`,
                              background: levels[district.risk_level].color,
                            }}
                          />
                        </div>
                        <p>{run?.summary || district.summary}</p>
                        {run && (
                          <span className="micro">
                            최근 실행:{" "}
                            {
                              scenarios.find((s) => s.id === run.scenario)
                                ?.label
                            }{" "}
                            · 지도와 목록에 반영됨
                          </span>
                        )}
                      </section>
                      <section className="detail-section">
                        <div className="section-title">
                          <h3>최근 관측 추세</h3>
                          <span>기준 데이터</span>
                        </div>
                        <Trend district={district} />
                      </section>
                      <section className="detail-section">
                        <div className="section-title">
                          <h3>관측 지표</h3>
                          <span>예시 자료</span>
                        </div>
                        {district.signals.map((signal) => (
                          <div className="signal" key={signal.key}>
                            <span>{signal.label}</span>
                            <strong>
                              {signal.value}
                              <small>{signal.unit}</small>
                            </strong>
                            <span className="signal-change">
                              {signal.change_pct > 0 ? "+" : ""}
                              {signal.change_pct}%
                            </span>
                          </div>
                        ))}
                        <div className="population">
                          <Users size={14} />
                          시연 인구{" "}
                          {district.population.toLocaleString("ko-KR")}명
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div
                      id="run-panel"
                      role="tabpanel"
                      aria-labelledby="run-tab"
                    >
                      <section className="detail-section run-section">
                        <div className="section-title">
                          <h3>관측 실행 기록</h3>
                          <span>
                            {mode === "mock"
                              ? "화면 기능 시연"
                              : "서버 실행 결과"}
                          </span>
                        </div>
                        {!displayedRun && !running ? (
                          <div className="empty-run">
                            <Activity size={30} />
                            <h4>이 지역의 관측을 시작해 보세요</h4>
                            <p>
                              아래 시나리오를 선택하면 자료 확인부터 가상 정책
                              연결까지 살펴볼 수 있습니다.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="run-summary" role="status">
                              {running
                                ? displayedRun
                                  ? "관측 단계를 시연하고 있습니다"
                                  : "서버에서 관측을 실행하고 있습니다"
                                : displayedRun?.status === "held"
                                  ? "자료 보완 후 다시 관측해 주세요"
                                  : "관측을 완료했습니다"}
                              {displayedRun && (
                                <span>
                                  {
                                    scenarios.find(
                                      (s) => s.id === displayedRun.scenario,
                                    )?.label
                                  }{" "}
                                  ·{" "}
                                  {running
                                    ? `${progress}/${displayedRun.steps.length} 단계`
                                    : `${new Date(displayedRun.completed_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 실행`}
                                </span>
                              )}
                            </div>
                            <ol className="timeline">
                              {displayedRun?.steps.map((step, i) => {
                                const done = !running || i < progress;
                                return (
                                  <li
                                    key={step.id}
                                    className={done ? "done" : "pending"}
                                  >
                                    <span className="step-dot">
                                      {done ? (
                                        step.status === "held" ? (
                                          <span>!</span>
                                        ) : (
                                          <Check size={13} />
                                        )
                                      ) : (
                                        i + 1
                                      )}
                                    </span>
                                    <div>
                                      <strong>{step.label}</strong>
                                      <p>{done ? step.detail : "대기 중"}</p>
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                            {!running && displayedRun && (
                              <>
                                <p className="run-description">
                                  {displayedRun.summary}
                                </p>
                                {displayedRun.warnings.map((warning, i) => (
                                  <div className="warning" key={i}>
                                    <TriangleAlert size={15} />
                                    <p>{warning}</p>
                                  </div>
                                ))}
                                <div className="section-title policies-heading">
                                  <h3>연결 가능한 가상 정책</h3>
                                  <span>{displayedRun.policies.length}건</span>
                                </div>
                                {displayedRun.policies.length ? (
                                  displayedRun.policies.map((policy) => (
                                    <article
                                      className="policy-card"
                                      key={policy.id}
                                    >
                                      <span className="policy-label">
                                        가상 정책 · 실제 접수 불가
                                      </span>
                                      <h4>
                                        {policy.title.replace(
                                          /^\[가상\]\s*/,
                                          "",
                                        )}
                                      </h4>
                                      <p>{policy.description}</p>
                                      <dl>
                                        <dt>대상</dt>
                                        <dd>{policy.target}</dd>
                                        <dt>기간</dt>
                                        <dd>
                                          {policy.start_date} ~{" "}
                                          {policy.end_date}
                                        </dd>
                                      </dl>
                                      <span className="micro">
                                        {policy.contact}
                                      </span>
                                    </article>
                                  ))
                                ) : (
                                  <div className="no-policy">
                                    {displayedRun.status === "held"
                                      ? "자료 부족으로 정책 검색을 진행하지 않았습니다."
                                      : "연결할 정책이 없습니다. 담당자 확인이 필요합니다."}
                                  </div>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </section>
                    </div>
                  )}
                </div>
                <section className="runner">
                  <div className="section-title">
                    <h3>상황별 관측 실행</h3>
                    <span>5개 시나리오</span>
                  </div>
                  <label className="sr-only" htmlFor="scenario">
                    실행할 시나리오
                  </label>
                  <select
                    id="scenario"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value as Scenario)}
                    disabled={running}
                  >
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <p className="scenario-description">
                    {scenarios.find((s) => s.id === scenario)?.description}
                  </p>
                  {error && (
                    <div className="error" role="alert">
                      <TriangleAlert size={16} />
                      <span>{error}</span>
                    </div>
                  )}
                  <button
                    className="primary run-button"
                    onClick={execute}
                    disabled={running}
                  >
                    {running ? (
                      <RefreshCw className="spin" size={17} />
                    ) : run ? (
                      <RefreshCw size={17} />
                    ) : (
                      <Activity size={17} />
                    )}{" "}
                    {running
                      ? "관측 실행 중"
                      : run
                        ? "다시 관측하기"
                        : "관측 시작하기"}
                  </button>
                </section>
              </aside>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
