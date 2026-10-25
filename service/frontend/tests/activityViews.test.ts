import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createContext, Script} from 'node:vm';
import {execFileSync} from 'node:child_process';

const source = readFileSync(new URL('../../shared/hermi-activity-view.js', import.meta.url), 'utf8');
const RULE = 'activity-review-5pct-v1';
const labels = {
  no_threshold_decline: '기준 이상 감소 미포착',
  single_source_decline: '단일 감소 관찰',
  joint_decline: '동시 감소 관찰',
  priority_review: '우선 검토 후보',
  assessment_hold: '판정 보류',
};
type Category = keyof typeof labels;
type Row = ReturnType<typeof row>;
type Page = ReturnType<typeof page>;
type LoadResult = Page & {records: Row[]};
type View = {
  render: (records: unknown, options?: Record<string, unknown>) => string;
  counts: (records: unknown) => Record<Category, number>;
  validate: (records: unknown) => Row[];
  load: (filters?: Record<string, string>) => Promise<LoadResult>;
};

// Fabricated observations exercise the server contract; they are not model data.
function row(category: Category = 'no_threshold_decline', age = '20G') {
  const key = {region_code: '51110', month: '202510', sex_code: 'MAN', age_code: age};
  const hold = category === 'assessment_hold';
  const joint = category === 'joint_decline' || category === 'priority_review';
  const sktMet = joint || category === 'single_source_decline';
  const id = `test-only:${key.region_code}:${key.month}:${key.sex_code}:${age}`;
  return {
    behavior: {
      key: {...key}, record_id: id, region_name: '춘천시', spatial_unit: 'sgg',
      // The model's any-decline flag must never be used as the 5% category.
      rule: {candidate: true, two_month_streak: true},
      robust: {candidate: true, cutoff: 3.5},
    },
    historical_reference: {count: {change_pct: 10.71}},
    activity_assessment: {
      rule_version: RULE, threshold_percent: 5, category, category_label: labels[category], scope: {...key},
      sources: {
        skt: {change_percent: hold ? null : sktMet ? -17.41 : -2, threshold_met: hold ? null : sktMet,
          previous_change_percent: hold ? null : -8.25, previous_threshold_met: hold ? null : true},
        card_a: {change_percent: hold ? null : joint ? -5.21 : -1, threshold_met: hold ? null : joint,
          previous_change_percent: hold ? null : -2.5, previous_threshold_met: hold ? null : false},
      },
      signals: {joint_decline: hold ? null : joint, two_month_streak: hold ? null : false,
        robust_candidate: hold ? null : category === 'priority_review'},
      robust_evidence: {status: hold ? 'unavailable' : 'computed', cutoff: 3.5,
        sources: {skt: {status: 'computed', z: hold ? null : 8.8, mad: 0.12, candidate: true},
          card_a: {status: 'computed', z: hold ? null : 0.91, mad: 0.08, candidate: false}}},
      reason_codes: [hold ? 'ACTIVITY_COMPARISON_UNAVAILABLE' : 'TEST_ONLY_SERVER_REASON'],
      reasons: [hold ? '두 활동 원천을 비교할 수 없어 판단을 보류합니다.' : '서버가 반환한 판정 근거입니다.'],
      quality_status: 'hold', quality_reasons: ['SKT_MONTHLY_COVERAGE_UNVERIFIED'],
      operational_alert_allowed: false, evidence_ids: [id],
    },
  };
}

function page(records: Row[], overrides: Record<string, unknown> = {}) {
  return {run_id: 'test-only-run', manifest_sha256: 'a'.repeat(64),
    classification_rule: {rule_version: RULE, threshold_percent: 5},
    records, total_matched: records.length, next_offset: null as number | null,
    quality_status: 'hold', operational_alert_allowed: false, ...overrides};
}

function harness(pages: unknown[] = [], responseOptions: {ok?: boolean; contentType?: string} = {}) {
  const calls: {url: string; options?: {method?: string; body?: unknown}}[] = [];
  const context = createContext({window: {}, URLSearchParams, Number, String, Set, Object, Error,
    fetch: async (url: string, options?: {method?: string; body?: unknown}) => {
      calls.push({url, options});
      if (calls.length > pages.length) throw new Error('Unexpected extra request');
      return {ok: responseOptions.ok ?? true,
        headers: {get: () => responseOptions.contentType ?? 'application/json'},
        json: async () => pages[calls.length - 1]};
    }});
  new Script(source).runInContext(context);
  return {view: context.window.HERMES_ACTIVITY_VIEW as View, calls};
}

describe('shared server-owned activity categories', () => {
  it('uses the server category when the old model candidate is true', () => {
    const record = row();
    const {view} = harness();
    expect(record.behavior.rule.candidate).toBe(true);
    expect(view.counts([record])).toMatchObject({no_threshold_decline: 1, priority_review: 0, joint_decline: 0});
    const html = view.render([record], {showSummary: false});
    expect(html).toContain('data-hav-row="no_threshold_decline"');
    expect(html).toContain('기준 이상 감소 미포착');
    expect(html).not.toContain('data-hav-row="priority_review"');
    expect(html).toContain('서버가 반환한 판정 근거입니다.');
  });

  it('counts each of the five categories once without adding C3 or background votes', () => {
    const {view} = harness();
    const records = (Object.keys(labels) as Category[]).map((category, i) => row(category, ['20G', '30G', '40G', '50G', '60GU'][i]));
    expect(view.counts(records)).toEqual(Object.fromEntries(Object.keys(labels).map(category => [category, 1])));
    const html = view.render(records);
    for (const category of Object.keys(labels)) expect(html).toContain(`data-hav-category="${category}"`);
    expect(html).toContain('I5·MOIS·C3는 활동 범주를 높이거나 낮추지 않습니다.');
    expect(html).toContain('같은 카드 자료의 다른 비교 기준이며 별도 신호로 합산하지 않습니다.');
    expect(html).toContain('+10.71%');
  });

  it('shows current and preceding source changes, robust values, and quality reasons', () => {
    const {view} = harness();
    const html = view.render([row('priority_review')]);
    for (const text of ['-17.41%', '-5.21%', '-8.25%', '-2.50%', '통신 z 8.80', '카드 z 0.91', '모델 기준 3.50',
      '통신 월별 관측 범위 미확인', '운영 경보 불허', 'test-only:51110:202510:MAN:20G']) expect(html).toContain(text);
  });

  it('keeps unknown evidence unknown and empty selections visibly deferred', () => {
    const {view} = harness();
    const html = view.render([row('assessment_hold')]);
    expect(html).toContain('판정 보류');
    expect(html).toContain('비교 불가');
    expect(html).toContain('미확인');
    expect(html).toContain('미산출');
    expect(html).not.toContain('0.00%');
    expect(view.render([])).toContain('판정 보류 · 활동 비교 자료 없음');
    expect(view.render([])).toContain('자료 없음은 감소 미포착이나 안전을 뜻하지 않습니다.');
    expect(Object.values(view.counts([]))).toEqual([0, 0, 0, 0, 0]);
  });

  it('escapes external names, labels, reasons, provenance, and display options', () => {
    const {view} = harness();
    const record = row();
    const payload = '<img src=x onerror="bad()">';
    record.behavior.region_name = payload;
    record.activity_assessment.category_label = payload;
    record.activity_assessment.reasons = [payload];
    record.activity_assessment.quality_reasons = [payload];
    record.activity_assessment.evidence_ids = [payload];
    const html = view.render([record], {title: payload, scopeNote: payload});
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
    expect(view.render([], {emptyMessage: payload})).not.toContain('<img');
  });

  it('does not turn a missing assessment or a mismatched scope into a successful display', () => {
    const {view} = harness();
    for (const value of [null, {}, [null], [{behavior: row().behavior}], [{...row(), activity_assessment: null}]]) {
      expect(() => view.render(value)).toThrow();
    }
    for (const field of ['region_code', 'month', 'sex_code', 'age_code'] as const) {
      const record = row();
      record.activity_assessment.scope[field] = 'different';
      expect(() => view.render([record])).toThrow('지역·월·집단');
    }
  });

  it('rejects equally invalid scopes on both the observation and server assessment', () => {
    const {view} = harness();
    const invalid: [keyof Row['behavior']['key'], string][] = [
      ['sex_code', 'ALL'], ['age_code', 'ALL'], ['month', '202513'], ['month', '000001'],
      ['region_code', '5111051000'],
    ];
    for (const [field, value] of invalid) {
      const record = row();
      record.behavior.key[field] = value;
      record.activity_assessment.scope[field] = value;
      expect(() => view.render([record])).toThrow('범위를 확인할 수 없습니다');
    }
    const dong = row();
    dong.behavior.spatial_unit = 'administrative_dong';
    expect(() => view.render([dong])).toThrow('범위를 확인할 수 없습니다');
  });

  it('rejects duplicate observations and mixed rule versions', () => {
    const {view} = harness();
    expect(() => view.counts([row(), row()])).toThrow('중복');
    const other = row('joint_decline', '30G');
    other.activity_assessment.rule_version = 'another-version';
    expect(() => view.render([row(), other])).toThrow('규칙 버전');
  });

  it('can omit detail actions and summary without modifying the input records', () => {
    const {view} = harness();
    const records = [row()];
    const original = JSON.stringify(records);
    const html = view.render(records, {showSummary: false, detailActions: false, title: '선택 집단'});
    expect(html).toContain('선택 집단');
    expect(html).not.toContain('data-live-cell');
    expect(html).not.toContain('class="hav-summary"');
    expect(JSON.stringify(records)).toBe(original);
  });
});

describe('read-only activity pagination and response boundaries', () => {
  it('loads all pages with only GET and keeps exact selection filters', async () => {
    const first = row();
    const second = row('single_source_decline', '30G');
    const {view, calls} = harness([page([first], {total_matched: 2, next_offset: 1}), page([second], {total_matched: 2})]);
    const result = await view.load({region_code: '51110', month: '202510', sex_code: 'MAN'});
    expect(result.records).toEqual([first, second]);
    expect(result.next_offset).toBeNull();
    expect(calls).toHaveLength(2);
    for (const [index, call] of calls.entries()) {
      const url = new URL(call.url, 'https://fixture.invalid');
      expect(url.pathname).toBe('/api/model/behavior');
      expect(url.searchParams.get('region_code')).toBe('51110');
      expect(url.searchParams.get('month')).toBe('202510');
      expect(url.searchParams.get('sex_code')).toBe('MAN');
      expect(url.searchParams.has('age_code')).toBe(false);
      expect(url.searchParams.get('offset')).toBe(String(index));
      expect(url.searchParams.has('candidate_only')).toBe(false);
      expect(call.options?.method ?? 'GET').toBe('GET');
      expect(call.options?.body).toBeUndefined();
    }
  });

  it('accepts a verified empty response without inventing a selected group', async () => {
    const {view, calls} = harness([page([])]);
    expect((await view.load()).records).toEqual([]);
    const query = new URL(calls[0].url, 'https://fixture.invalid').searchParams;
    for (const field of ['region_code', 'month', 'sex_code', 'age_code']) expect(query.has(field)).toBe(false);
  });

  it.each(['run_id', 'manifest_sha256', 'classification_rule', 'total_matched'] as const)(
    'rejects a missing %s response field', async field => {
      const missing: Record<string, unknown> = page([]);
      delete missing[field];
      await expect(harness([missing]).view.load()).rejects.toThrow();
    });

  it('rejects an empty rule version even when the selected scope has no observations', async () => {
    const emptyVersion = page([], {classification_rule: {rule_version: '', threshold_percent: 5}});
    await expect(harness([emptyVersion]).view.load()).rejects.toThrow();
  });

  it.each([
    {run_id: 'changed-run'},
    {manifest_sha256: 'b'.repeat(64)},
    {classification_rule: {rule_version: 'changed-rule', threshold_percent: 5}},
    {total_matched: 3},
  ])('rejects version or coverage changes between pages: %j', async change => {
    const pages = [page([row()], {total_matched: 2, next_offset: 1}), page([row('joint_decline', '30G')], {total_matched: 2, ...change})];
    await expect(harness(pages).view.load()).rejects.toThrow('바뀌었습니다');
  });

  it('rejects missing records, repeated records, and nonadvancing pagination', async () => {
    await expect(harness([page([row()], {total_matched: 2})]).view.load()).rejects.toThrow('빠졌');
    await expect(harness([page([row()], {total_matched: 2, next_offset: 1}), page([row()], {total_matched: 2})]).view.load()).rejects.toThrow('중복');
    await expect(harness([page([row()], {next_offset: 0})]).view.load()).rejects.toThrow('페이지 순서');
  });

  it('rejects a missing assessment or a different group instead of using raw candidate flags', async () => {
    const missing = {behavior: row().behavior};
    await expect(harness([{...page([]), records: [missing], total_matched: 1}]).view.load()).rejects.toThrow('분류 결과');
    await expect(harness([page([row()])]).view.load({sex_code: 'WMAN'})).rejects.toThrow('요청한 범위');
    const record = row();
    record.activity_assessment.rule_version = 'old-rule';
    await expect(harness([page([record])]).view.load()).rejects.toThrow('규칙 버전');
  });

  it('rejects HTML, unsuccessful responses, and offline requests without a cached fallback', async () => {
    await expect(harness([page([row()])], {contentType: 'text/html'}).view.load()).rejects.toThrow('연결');
    await expect(harness([{detail: {message: '서버 자료 오류'}}], {ok: false}).view.load()).rejects.toThrow('서버 자료 오류');
    await expect(harness().view.load()).rejects.toThrow('Unexpected extra request');
  });
});

describe('reproducible activity view integration', () => {
  it('delegates the default analysis behavior query to the same validated loader', async () => {
    const adapter = readFileSync(new URL('../scripts/hermes-live-adapter.js', import.meta.url), 'utf8');
    const expected = page([row()]);
    const filters = {region_code: '51110', month: '202510', limit: '100'};
    const calls: unknown[] = [];
    const context = createContext({window: {addEventListener: () => {}, HERMES_ACTIVITY_VIEW: {load: async (params: unknown) => {
      calls.push(params); return expected;
    }}}, originalFetch: () => {throw new Error('The legacy behavior path must not run');}});
    new Script(adapter + '\nglobalThis.readPages=serverPages;').runInContext(context);
    expect(await context.readPages('behavior', filters)).toEqual(expected);
    expect(calls).toEqual([filters]);
  });

  it('keeps the current imported HTML idempotent and wires regeneration to the same shared view', () => {
    const htmlPath = new URL('../../shared/hermes-complete.html', import.meta.url).pathname;
    const scriptsPath = new URL('../scripts', import.meta.url).pathname;
    execFileSync('python3', ['-c',
      'import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from hermes_activity_views import patch_activity_views;s=Path(sys.argv[2]).read_text();assert patch_activity_views(s)==s;assert patch_activity_views(patch_activity_views(s))==s',
      scriptsPath, htmlPath]);
    const importer = readFileSync(new URL('../scripts/import_hermes.py', import.meta.url), 'utf8');
    expect(importer).toContain('from hermes_activity_views import patch_activity_views');
    expect(importer).toContain('html = patch_activity_views(html)');
    const html = readFileSync(htmlPath, 'utf8');
    expect(html.match(/<script src="hermi-activity-view\.js"><\/script>/g)).toHaveLength(1);
    expect(html.match(/href="hermi-activity-view\.css"/g)).toHaveLength(1);
    const activityStart = html.indexOf('  function activityHtml(p){');
    const rawStart = html.indexOf('  function activityRawHtml(p){', activityStart);
    expect(activityStart).toBeGreaterThan(0);
    expect(rawStart).toBeGreaterThan(activityStart);
    expect(html.slice(activityStart, rawStart)).toContain('HERMES_ACTIVITY_VIEW.render');
    const observations = html.slice(html.indexOf('  async function signalsHTML('), html.indexOf('  function heatmap('));
    expect(observations).toContain('HERMES_ACTIVITY_VIEW.load');
    expect(observations).toContain('HERMES_ACTIVITY_VIEW.render');
    expect(observations).not.toContain('rule.candidate');
  });
});
