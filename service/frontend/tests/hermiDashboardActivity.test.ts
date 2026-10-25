import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const source = readFileSync(new URL('../../shared/hermi-overview.js', import.meta.url), 'utf8');
const categories = {priority_review: '우선 검토 후보', joint_decline: '동시 감소 관찰', single_source_decline: '단일 감소 관찰',
  assessment_hold: '판정 보류', no_threshold_decline: '기준 이상 감소 미포착'};
type ActivityRow = {behavior: {key: {region_code: string; month: string; sex_code: string; age_code: string}; region_name: string; spatial_unit: string};
  activity_assessment: {category: string; category_label: string; reasons: string[]; [key: string]: unknown}};
type ActivityResult = {records: ActivityRow[]; run_id: string; classification_rule: {rule_version: string; threshold_percent: number}};
type DongRow = {area_code: string; area_name: string; region_code: string; region_name: string; spatial_unit: string; i5_reference: number;
  population_total: number; population_20plus: number; domain_scores: Record<string, number>};
const item = (region: string, month = '202512', category: keyof typeof categories = 'single_source_decline', age = '20G'): ActivityRow => {
  const key = {region_code: region, month, sex_code: 'MAN', age_code: age};
  return {behavior: {key, region_name: region === '11680' ? '강남구' : '춘천시', spatial_unit: 'sgg'},
    activity_assessment: {category, category_label: categories[category], reasons: ['서버가 확인한 시군구 집단별 판단 근거'], scope: {...key},
      rule_version: 'activity-review-5pct-v1', threshold_percent: 5, operational_alert_allowed: false, quality_status: 'hold',
      sources: {skt: {change_percent: -6}, card_a: {change_percent: -2}}, evidence_ids: [`fixture:${region}:${month}:${age}`]}};
};
const result = (records: ActivityRow[]): ActivityResult => ({records, run_id: 'verified-activity', classification_rule: {rule_version: 'activity-review-5pct-v1', threshold_percent: 5}});
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(yes => {resolve = yes;}); return {promise, resolve};}
const districts = [
  {code: '11680', name: '강남구', province_code: '11', province_name: '서울특별시'},
  {code: '11110', name: '종로구', province_code: '11', province_name: '서울특별시'},
  {code: '51110', name: '춘천시', province_code: '51', province_name: '강원특별자치도'},
  {code: '26110', name: '중구', province_code: '26', province_name: '부산광역시'},
  {code: '28260', name: '서구', province_code: '28', province_name: '인천광역시'},
];
const dong = (code: string, name: string, i5: number, population = 100): DongRow => ({area_code: code, area_name: name,
  region_code: code.slice(0, 5), region_name: districts.find(row => row.code === code.slice(0, 5))!.name, spatial_unit: 'administrative_dong',
  population_total: population + 20, population_20plus: population, i5_reference: i5, domain_scores: {E: 10, P: 20, O: 30, C: 40, U: 50}});
const dongRows = [dong('1168051000', '신사동', 32.25), dong('1168052100', '논현1동', 36.75, 300),
  dong('1111051500', '청운효자동', 28.5, 200), dong('5111025000', '신북읍', 34.1, 400),
  dong('2611051000', '중앙동', 37.2), dong('2826075000', '아라1동', 35.3)];
const feature = (code: string, name: string, x: number, y: number) => ({type: 'Feature',
  properties: {code, name, province_code: code.slice(0, 2), region_code: code.slice(0, 5), label: [x, y]},
  geometry: {type: 'Polygon', coordinates: [[[x - .01, y - .01], [x + .01, y - .01], [x + .01, y + .01], [x - .01, y + .01], [x - .01, y - .01]]]},
});
const boundaryFixture = {type: 'FeatureCollection', features: [feature('1168051000', '신사동', 127.02, 37.52),
  feature('1168052100', '논현1동', 127.05, 37.51), feature('1111051500', '청운효자동', 126.97, 37.58),
  feature('5111025000', '신북읍', 127.74, 37.93), feature('2611051000', '중앙동', 129.03, 35.10),
  // Neither the former Ara-dong nor its parent polygon represents the new Ara 1-dong.
  feature('2826074000', '아라동', 126.70, 37.59), feature('28260', '서구', 126.70, 37.59)]};
type Options = {boundaries?: () => Promise<unknown>; rows?: (month: string) => DongRow[]};
function harness(load: (scope: {month: string}) => Promise<ActivityResult>, options: Options = {}) {
  const dashboard = {innerHTML: '', hidden: false, dataset: {overviewPage: 'dashboard'}, querySelector: () => null};
  const welfare = {innerHTML: '', hidden: true, dataset: {overviewPage: 'welfare-list'}};
  const regionScroll = {innerHTML: ''}, regionCount = {textContent: ''};
  const handlers: Record<string, (event: any) => void> = {};
  const root = {innerHTML: '', hidden: true, id: '', className: '',
    querySelector: (selector: string) => selector === '.ho-region-scroll' ? regionScroll
      : selector === '.ho-region-list .ho-card-head > span' ? regionCount : selector.includes('welfare-list') ? welfare : dashboard,
    querySelectorAll: () => [dashboard, welfare], addEventListener: (name: string, handler: (event: any) => void) => {handlers[name] = handler;}};
  const render = vi.fn(() => {throw new Error('A dong reference must not be replaced with an activity classification table');});
  const loadSpy = vi.fn(load), boundarySpy = vi.fn(options.boundaries || (async () => boundaryFixture));
  const fetch = vi.fn(async (path: string) => ({ok: true, json: async () => {
    if (path.endsWith('dashboard-dongs.geojson')) return boundarySpy();
    const url = new URL(path, 'https://test.local');
    const welfareRegions = [...districts.map(row => ({...row, level: 'sgg'})), ...dongRows.map(row => ({code: row.area_code,
      name: row.area_name, level: 'administrative_dong', parent_code: row.region_code, province_code: row.area_code.slice(0, 2),
      province_name: districts.find(district => district.code === row.region_code)!.province_name}))];
    if (url.pathname === '/api/model/welfare/regions') return {regions: welfareRegions};
    if (url.pathname === '/api/model/welfare/catalog') return {programs: [], total: 0, matched: 0, next_offset: null,
      available_regions: welfareRegions, categories: [], statuses: []};
    if (url.pathname.endsWith('/regions')) return {regions: districts, months: ['202510', '202512']};
    if (url.pathname.endsWith('/survey-area')) {
      const month = url.searchParams.get('month')!, offset = Number(url.searchParams.get('offset')), rows = options.rows?.(month) || dongRows;
      return {run_id: `verified-i5-${month}`, records: offset === 0 ? rows.slice(0, 3) : rows.slice(3), next_offset: offset === 0 ? 500 : null};
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  }}));
  const ask = vi.fn(), navigate = vi.fn(), setStartingScope = vi.fn();
  const openLibrary = vi.fn(async (_options: {scope: Record<string, string>; emptyAction: {label: string; run: () => void}}) => {});
  const context = createContext({window: {HERMES_ACTIVITY_VIEW: {load: loadSpy, render},
      HERMES_AGENT: {api: vi.fn(async () => ({national_reference: [{metric: 'I5', weighted_mean: 35}]})), setStartingScope},
      HERMES_ANALYSIS_REPORTS: {openLibrary}}, document: {createElement: () => root, addEventListener: vi.fn()}, fetch, ask, navigate,
    location: {search: '', href: 'http://localhost/?month=202512'}, history: {replaceState: vi.fn()}, URL, URLSearchParams,
    PROVINCE_PREFIX: {서울특별시: '11', 강원특별자치도: '51', 부산광역시: '26', 인천광역시: '28'},
    provPaths: {서울특별시: 'M210,120L220,120L220,130L210,130Z', 강원특별자치도: 'M280,50L360,50L360,150L280,150Z',
      부산광역시: 'M390,330L420,330L420,355L390,355Z', 인천광역시: 'M180,120L205,120L205,145L180,145Z'}});
  new Script(source).runInContext(context);
  const view = context.window.HERMI_OVERVIEW;
  view.mount({after: vi.fn()});
  const click = (attribute: string, dataset: Record<string, string> = {}) => {
    const target = {dataset, disabled: false, textContent: '', hasAttribute: (name: string) => name === attribute};
    handlers.click({target: {closest: () => target}}); return target;
  };
  const change = (attribute: string, value: string) => handlers.change({target: {value, hasAttribute: (name: string) => name === attribute}});
  const input = (value: string) => handlers.input({target: {value, hasAttribute: (name: string) => name === 'data-ho-search'}});
  const section = (name: string) => dashboard.innerHTML.match(new RegExp(`<section class="${name}"[^>]*>([\\s\\S]*?)</section>`))?.[1] || '';
  const region = (code: string) => section('ho-region-list').match(new RegExp(`<button[^>]*data-ho-region="${code}"[\\s\\S]*?</button>`))?.[0] || '';
  const map = () => section('ho-map-panel').match(/<svg\b[\s\S]*?<\/svg>/)?.[0] || '';
  const stats = () => [...dashboard.innerHTML.matchAll(/<div class="ho-stat">([\s\S]*?)<\/div>/g)].map(match => match[1]);
  return {view, dashboard, render, load: loadSpy, loadBoundaries: boundarySpy, fetch, click, change, input,
    month: (value: string) => change('data-ho-month', value), section, region, map, stats, regionScroll, regionCount, ask, navigate, setStartingScope, openLibrary, welfare};
}

describe('Administrative dong dashboard', () => {
  it('loads all administrative-dong pages, starts with all dongs and shows their own weighted I5 values', async () => {
    const page = harness(async () => result([item('11680'), item('51110')])); await page.view.show('dashboard');
    const survey = page.fetch.mock.calls.map(([path]) => new URL(path, 'https://test.local')).filter(url => url.pathname.endsWith('/survey-area'));
    expect(survey.map(url => url.searchParams.get('level'))).toEqual(['administrative_dong', 'administrative_dong']);
    expect(survey.map(url => url.searchParams.get('offset'))).toEqual(['0', '500']);
    expect(survey.every(url => url.searchParams.get('month') === '202512' && url.searchParams.get('limit') === '500')).toBe(true);
    expect(page.dashboard.innerHTML).toContain('<h1>행정동 대시보드</h1>'); expect(page.stats()).toHaveLength(3);
    expect(page.dashboard.innerHTML).not.toContain('선택 행정동 참고점수'); expect(page.stats()[0]).toContain('6<em>개</em>');
    expect(page.region('1168051000')).toContain('<b>신사동</b>'); expect(page.region('1168051000')).toContain('<small>지역 고립 지수</small>32.25');
    expect(page.region('1168052100')).toContain('<small>지역 고립 지수</small>36.75'); expect(page.region('1168051000')).not.toContain('ho-category-');
    expect(page.region('2826075000')).toContain('아라1동'); expect(page.section('ho-region-detail')).toContain('행정동을 선택해 주세요');
    expect(page.render).not.toHaveBeenCalled(); expect(page.load).toHaveBeenCalledExactlyOnceWith({month: '202512'});
    expect(page.loadBoundaries).toHaveBeenCalledTimes(1);
  });
  it('colors each actual dong by its own I5 instead of its parent activity category', async () => {
    const page = harness(async () => result([item('11680', '202512', 'priority_review')])); await page.view.show('dashboard');
    expect(page.map()).toContain('ho-seoul-label'); expect(page.map()).toContain('서울특별시 행정동 지도 열기');
    page.click('data-ho-province', {hoProvince: '11'});
    expect(page.map()).toContain('서울특별시 행정동 지도'); expect(page.map().match(/<path\b/g)).toHaveLength(3);
    const shape = (code: string) => page.map().match(new RegExp(`<path[^>]*data-ho-region="${code}"[^>]*>`))?.[0] || '';
    expect(shape('1168051000')).toContain('fill="#b9d7f7"'); expect(shape('1168052100')).toContain('fill="#438bdb"');
    expect(shape('1111051500')).toContain('fill="#e5f0fc"'); expect(page.map()).toContain('신사동 · I5 32.25');
    expect(page.map()).not.toContain('#f3c87b'); expect(page.map()).not.toContain('data-ho-region="11680"');
    expect(page.map()).not.toContain('data-ho-region="5111025000"'); expect(page.section('ho-map-panel')).toContain('CC BY 4.0');
  });
  it('drills from national to province to district to one dong and restores broader views', async () => {
    const page = harness(async () => result([item('11680'), item('51110')])); await page.view.show('dashboard');
    expect(page.section('ho-map-panel')).toContain('<b>강남구 행정동</b>');
    page.click('data-ho-province', {hoProvince: '11'}); expect(page.map().match(/<path\b/g)).toHaveLength(3);
    expect(page.region('5111025000')).toBe(''); page.click('data-ho-district', {hoDistrict: '11680'});
    expect(page.map()).toContain('강남구 행정동 지도'); expect(page.map().match(/<path\b/g)).toHaveLength(2);
    expect(page.region('1111051500')).toBe('');
    const previous = page.map().match(/<path[^>]*data-ho-region="1168051000"[^>]*>/)?.[0];
    page.click('data-ho-region', {hoRegion: '1168051000'}); expect(page.map()).toContain('신사동 행정동 지도');
    expect(page.map().match(/<path\b/g)).toHaveLength(1); expect(page.map()).not.toContain('data-ho-region="1168052100"');
    expect(page.map().match(/<path[^>]*data-ho-region="1168051000"[^>]*>/)?.[0]).not.toBe(previous);
    expect(page.section('ho-map-panel')).toContain('<span aria-current="location">신사동</span>');
    expect(page.section('ho-region-detail')).toContain('32.25<small>/100</small>'); expect(page.section('ho-region-detail')).toContain('120명');
    page.click('data-ho-district', {hoDistrict: '11680'}); expect(page.map().match(/<path\b/g)).toHaveLength(2);
    page.click('data-ho-province', {hoProvince: '11'}); expect(page.map().match(/<path\b/g)).toHaveLength(3);
    page.click('data-ho-province', {hoProvince: ''}); expect(page.map()).toContain('전국 행정동 탐색 지도');
    expect(page.region('5111025000')).not.toBe(''); expect(page.stats()[0]).toContain('6<em>개</em>');
    expect(page.load).toHaveBeenCalledTimes(1); expect(page.loadBoundaries).toHaveBeenCalledTimes(1);
  });
  it('synchronizes parent navigation for direct dong selection and changes district filters without refetching', async () => {
    const page = harness(async () => result([item('11680'), item('51110')])); await page.view.show('dashboard');
    page.click('data-ho-region', {hoRegion: '1168051000'});
    expect(page.section('ho-map-panel')).toContain('data-ho-province="11"'); expect(page.section('ho-map-panel')).toContain('data-ho-district="11680"');
    expect(page.region('1168052100')).not.toBe(''); expect(page.region('1111051500')).toBe('');
    page.change('data-ho-district-filter', '11110'); expect(page.map()).toContain('종로구 행정동 지도');
    expect(page.map()).toContain('data-ho-region="1111051500"'); expect(page.region('1168051000')).toBe('');
    page.click('data-ho-province', {hoProvince: ''}); page.click('data-ho-region', {hoRegion: '5111025000'});
    expect(page.map()).toContain('신북읍 행정동 지도'); expect(page.section('ho-map-panel')).toContain('data-ho-province="51"');
    expect(page.section('ho-map-panel')).toContain('data-ho-district="51110"'); expect(page.section('ho-region-detail')).toContain('강원특별자치도 춘천시');
    expect(page.region('1168051000')).toBe(''); expect(page.load).toHaveBeenCalledTimes(1);
  });
  it('keeps an unmapped dong selectable without substituting a former dong or a parent boundary', async () => {
    const page = harness(async () => result([item('11680')])); await page.view.show('dashboard');
    page.click('data-ho-province', {hoProvince: '28'}); expect(page.section('ho-map-panel')).toContain('경계 미연결 1개 동·출장소');
    expect(page.map()).not.toContain('data-ho-region="2826074000"'); expect(page.map()).not.toContain('data-ho-region="28260"');
    page.click('data-ho-region', {hoRegion: '2826075000'}); expect(page.map()).toBe('');
    expect(page.section('ho-map-panel')).toContain('이 행정동의 지도 경계는 준비 중이에요');
    expect(page.section('ho-region-detail')).toContain('<h2>아라1동</h2>'); expect(page.section('ho-region-detail')).toContain('35.30<small>/100</small>');
    expect(page.section('ho-region-detail')).toContain('이 상위 시군구·월의 활동 자료가 없습니다');
    expect(page.section('ho-region-detail')).not.toContain('기준 이상 감소 미포착');
  });
  it('counts parent observations once across sibling dongs and identifies the shared parent evidence', async () => {
    const page = harness(async () => result([item('11680', '202512', 'joint_decline'),
      item('11680', '202512', 'single_source_decline', '30G'), item('51110', '202512', 'joint_decline')]));
    await page.view.show('dashboard'); expect(page.stats()[1]).toContain('2<em>개 지역</em>'); expect(page.stats()[2]).toContain('2<em>집단</em>');
    for (const code of ['1168051000', '1168052100']) {
      page.click('data-ho-region', {hoRegion: code}); expect(page.stats()[1]).toContain('1<em>개 지역</em>'); expect(page.stats()[2]).toContain('1<em>집단</em>');
      expect(page.section('ho-region-detail')).toContain('강남구 활동 참고'); expect(page.section('ho-region-detail')).toContain('해당 1/2 수록집단');
      expect(page.section('ho-region-detail')).toContain('이 범주를 선택한 행정동의 판정으로 적용하지 않습니다');
      expect(page.section('ho-region-detail')).toContain('서버가 확인한 시군구 집단별 판단 근거');
    }
    expect(page.load).toHaveBeenCalledExactlyOnceWith({month: '202512'});
  });
  it('preserves I5 and parent activity on boundary failure and retries only the boundary request', async () => {
    const page = harness(async () => result([item('11680')]), {boundaries: async () => {throw new Error('경계 연결 실패');}});
    await page.view.show('dashboard'); page.click('data-ho-province', {hoProvince: '11'});
    expect(page.section('ho-map-panel')).toContain('행정동 경계를 불러오지 못했어요'); page.click('data-ho-region', {hoRegion: '1168051000'});
    expect(page.section('ho-region-detail')).toContain('32.25<small>/100</small>'); expect(page.section('ho-region-detail')).toContain('단일 감소 관찰');
    expect(page.map()).toBe(''); expect(page.section('ho-map-panel')).toContain('data-ho-retry-map');
    page.loadBoundaries.mockResolvedValueOnce(boundaryFixture); page.click('data-ho-retry-map');
    await vi.waitFor(() => expect(page.map()).toContain('신사동 행정동 지도'));
    expect(page.map().match(/<path\b/g)).toHaveLength(1); expect(page.loadBoundaries).toHaveBeenCalledTimes(2); expect(page.load).toHaveBeenCalledTimes(1);
  });
  it('escapes activity errors, keeps dong I5, and retries activity without reloading reference data', async () => {
    const page = harness(async () => {throw new Error('활동 연결 실패 <script>alert(1)</script>');}); await page.view.show('dashboard');
    page.click('data-ho-region', {hoRegion: '1168051000'}); expect(page.section('ho-region-detail')).toContain('32.25<small>/100</small>');
    expect(page.section('ho-region-detail')).toContain('조회 실패'); expect(page.section('ho-region-detail')).toContain('&lt;script&gt;');
    expect(page.section('ho-region-detail')).not.toContain('<script>'); expect(page.stats()[1]).toContain('—<em>개 지역</em>');
    const reads = page.fetch.mock.calls.length; page.load.mockResolvedValueOnce(result([item('11680')])); page.click('data-ho-retry-activity');
    await vi.waitFor(() => expect(page.section('ho-region-detail')).toContain('단일 감소 관찰'));
    expect(page.fetch).toHaveBeenCalledTimes(reads); expect(page.load).toHaveBeenCalledTimes(2);
  });
  it('shows dongs during activity loading, ignores stale months and reuses completed activity cache', async () => {
    const december = deferred<ActivityResult>(), october = deferred<ActivityResult>();
    const page = harness(({month}) => month === '202512' ? december.promise : october.promise,
      {rows: month => dongRows.map(row => ({...row, i5_reference: row.i5_reference + (month === '202510' ? 1 : 0)}))});
    const initial = page.view.show('dashboard'); await vi.waitFor(() => expect(page.region('1168051000')).toContain('신사동'));
    page.click('data-ho-region', {hoRegion: '1168051000'}); expect(page.section('ho-region-detail')).toContain('불러오는 중');
    expect(page.section('ho-region-detail')).toContain('32.25<small>/100</small>'); page.month('202510');
    await vi.waitFor(() => expect(page.load).toHaveBeenCalledWith({month: '202510'})); october.resolve(result([item('11680', '202510', 'joint_decline')]));
    await vi.waitFor(() => expect(page.section('ho-region-detail')).toContain('동시 감소 관찰'));
    expect(page.section('ho-region-detail')).toContain('33.25<small>/100</small>'); december.resolve(result([item('11680', '202512', 'no_threshold_decline')]));
    await initial; expect(page.dashboard.innerHTML).toContain('<option value="202510" selected>'); expect(page.section('ho-region-detail')).toContain('동시 감소 관찰');
    page.month('202512'); await vi.waitFor(() => expect(page.section('ho-region-detail')).toContain('기준 이상 감소 미포착'));
    expect(page.section('ho-region-detail')).toContain('32.25<small>/100</small>'); expect(page.load).toHaveBeenCalledTimes(2); expect(page.loadBoundaries).toHaveBeenCalledTimes(1);
  });
  it('preserves the full ten-digit scope for chat and the dong-specific saved report library', async () => {
    const page = harness(async () => result([item('11680')])); await page.view.show('dashboard'); page.click('data-ho-region', {hoRegion: '1168051000'});
    page.click('data-ho-ask-region', {hoAskRegion: '1168051000'});
    expect(page.setStartingScope).toHaveBeenCalledWith({region_level: 'administrative_dong', region_code: '1168051000', month: '202512', sex_codes: [], age_codes: []}, '서울특별시 강남구 신사동');
    expect(page.ask).toHaveBeenCalledWith('서울특별시 강남구 신사동의 2025년 12월 고립 참고점수와 활동 변화를 분석해 줘');
    const button = page.click('data-ho-open-reports', {hoOpenReports: '1168051000'}); await vi.waitFor(() => expect(page.openLibrary).toHaveBeenCalledTimes(1));
    expect(page.openLibrary.mock.calls[0][0]).toMatchObject({scope: {region_code: '11680', dong_code: '1168051000', region_name: '강남구 신사동', month: '202512'}, emptyAction: {label: '이 행정동 현황 분석하기'}});
    await vi.waitFor(() => expect(button.disabled).toBe(false)); page.openLibrary.mock.calls[0][0].emptyAction.run();
    expect(page.setStartingScope).toHaveBeenCalledTimes(2); expect(page.ask).toHaveBeenLastCalledWith('서울특별시 강남구 신사동의 2025년 12월 현황·원인 보고서를 만들어 줘');
  });
  it('carries the selected dong to welfare through both its detail button and the welfare menu', async () => {
    for (const useDetailButton of [false, true]) {
      const page = harness(async () => result([item('11680')])); await page.view.show('dashboard');
      page.click('data-ho-region', {hoRegion: '1168051000'});
      if (useDetailButton) {
        expect(page.section('ho-region-detail')).toContain('data-ho-dong-welfare="1168051000"');
        page.click('data-ho-dong-welfare', {hoDongWelfare: '1168051000'});
        expect(page.navigate).toHaveBeenCalledWith('welfare-list');
      }
      await page.view.show('welfare-list');
      const url = page.fetch.mock.calls.map(([path]) => new URL(path, 'https://test.local')).find(request => request.pathname === '/api/model/welfare/catalog')!;
      expect(url.searchParams.get('region_level')).toBe('administrative_dong');
      expect(url.searchParams.get('region_code')).toBe('1168051000');
      expect(page.welfare.innerHTML).toContain('신사동');
      expect(page.welfare.innerHTML).toContain('value="1168051000" selected');
    }
  });
  it('searches full dong names and clears the search on map scope changes', async () => {
    const page = harness(async () => result([item('11680')])); await page.view.show('dashboard'); page.input('서울특별시 강남구 신사');
    expect(page.regionScroll.innerHTML).toContain('data-ho-region="1168051000"'); expect(page.regionScroll.innerHTML).not.toContain('data-ho-region="1168052100"');
    expect(page.regionCount.textContent).toBe('1개'); page.click('data-ho-province', {hoProvince: '11'});
    expect(page.section('ho-region-list')).toContain('data-ho-search value=""'); expect(page.region('1168052100')).not.toBe(''); expect(page.region('1111051500')).not.toBe('');
    page.click('data-ho-province', {hoProvince: ''}); expect(page.region('5111025000')).not.toBe('');
  });
});
