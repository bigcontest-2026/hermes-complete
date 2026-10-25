import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

type Score = number | string | null | undefined;
type Domain = 'E' | 'P' | 'O' | 'C' | 'U';
type Row = {
  area_code: string;
  area_name: string;
  month?: string;
  population_20plus: Score;
  population_total: Score;
  i5_reference: Score;
  domain_scores?: Partial<Record<Domain, Score>>;
};
type Aggregate = {
  count: number;
  distinctCount: number;
  population_20plus: number | null;
  population_total: number | null;
  i5_reference: number | null;
  domain_scores: Record<Domain, number | null>;
};
type Page = { run_id: string; records: unknown; next_offset?: number | null };
type OverviewData = {
  finite: (value: unknown) => boolean;
  nonOverlapping: (rows: Row[]) => Row[];
  aggregate: (rows: Row[]) => Aggregate;
  readAll: (fetchPage: (offset: number) => Promise<Page>) => Promise<Row[]>;
  welfareLabels: (meta: Record<string, string>) => {date: string; region: string; category: string};
  periodLabel: (status: string, meta: Record<string, string>) => string;
  periodText: (program: Record<string, unknown>) => string;
  readableValue: (value: unknown) => string;
  regionDetails: (regions: Record<string, unknown>[]) => {matched: string; original: string};
  ageLabel: (program: Record<string, unknown>) => string;
  reviewLabel: (value: string | null) => string;
  conditionRows: (program: Record<string, unknown>) => {label: string; text: string; review: string; source_quote: string; needs_original: boolean}[];
  businessPeriods: (program: Record<string, unknown>) => string[];
  officialMetadata: (program: Record<string, unknown>) => {label: string; text: string}[];
};

// Load the same pure helper used by the static HTML without its browser renderer.
const source = readFileSync(new URL('../../shared/hermi-overview.js', import.meta.url), 'utf8');
const helperEnd = source.indexOf('window.HERMI_OVERVIEW');
if (helperEnd < 0) throw new Error('Overview helper boundary is missing');
const context = createContext({});
new Script(source.slice(0, helperEnd) + '\nglobalThis.data = HermiOverviewData;').runInContext(context);
const data = context.data as OverviewData;

async function renderWelfare(program: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const item = {version_id:'v1',title:'사업',regions:[],source_categories:[],conditions:[],...program};
  const result = {date_basis:'application',region_basis:'administering_jurisdiction',classification_basis:'internal_tags',
    programs:[item],statuses:[],categories:[],regions:[],total:1,matched:1,next_offset:null,...metadata};
  const section = {innerHTML:'',hidden:false,dataset:{overviewPage:'welfare-list'}};
  const dialog = {innerHTML:'',showModal:vi.fn()};
  const controls = {innerHTML:''};
  const handlers:Record<string,(event:any)=>void> = {};
  const root = {innerHTML:'',hidden:true,id:'',className:'',
    querySelector:(selector:string)=>selector==='#ho-program-dialog'?dialog:selector==='[data-ho-welfare-toolbar]'||selector==='.ho-selected-scope'?controls:section,
    querySelectorAll:()=>[section],
    addEventListener:(name:string,handler:(event:any)=>void)=>{handlers[name]=handler;}};
  const renderingContext = createContext({window:{},location:{search:''},URL,URLSearchParams,
    document:{createElement:()=>root},fetch:async()=>({ok:true,json:async()=>result})});
  new Script(source).runInContext(renderingContext);
  const view = renderingContext.window.HERMI_OVERVIEW;
  view.mount({after:vi.fn()});
  await view.show('welfare-list');
  handlers.click({target:{closest:()=>({dataset:{hoProgram:item.version_id},hasAttribute:()=>false})}});
  expect(dialog.showModal).toHaveBeenCalledOnce();
  return {card:section.innerHTML,detail:dialog.innerHTML};
}

function row(area_code: string, area_name: string, overrides: Partial<Row> = {}): Row {
  return {
    area_code, area_name,
    population_20plus: 100,
    population_total: 120,
    i5_reference: 20,
    domain_scores: { E: 10, P: 20, O: 30, C: 40, U: 50 },
    ...overrides,
  };
}

describe('Nationwide overview geography', () => {
  it('keeps 영동군 and 증평군 even though their numeric code prefixes overlap', () => {
    const regions = [row('43740', '영동군'), row('43745', '증평군')];
    expect(data.nonOverlapping(regions).map(region => region.area_code)).toEqual(['43740', '43745']);
    expect(data.aggregate(regions).population_20plus).toBe(200);
  });

  it('counts an included parent city once and removes only its same-province child districts', () => {
    const regions = [
      row('41111', '수원시 장안구'),
      row('41110', '수원시', { population_20plus: 400 }),
      row('41113', '수원시 권선구'),
      row('43111', '수원시 장안구'), // Same name in a different province must not be merged.
      row('41190', '부천시'),
    ];
    const result = data.nonOverlapping(regions);
    expect(result.map(region => region.area_code)).toEqual(['41110', '43111', '41190']);
    expect(data.aggregate(regions)).toMatchObject({ count: 5, distinctCount: 3, population_20plus: 600 });
    expect(regions).toHaveLength(5);
    expect(result[0]).toBe(regions[1]);
  });

  it('retains child districts when the parent city is absent', () => {
    const regions = [row('41111', '수원시 장안구'), row('41113', '수원시 권선구')];
    expect(data.nonOverlapping(regions)).toEqual(regions);
  });

  it('reconciles the shipped December nationwide coverage and provincial averages', () => {
    const records = readFileSync(new URL('../../../model/data/i5/national_2025/sgg_isolation_index.jsonl', import.meta.url), 'utf8')
      .trim().split('\n').map(line => JSON.parse(line) as Row).filter(item => item.month === '202512');
    expect(records).toHaveLength(264);
    expect(data.aggregate(records)).toMatchObject({
      count: 264,
      distinctCount: 229,
      population_total: 51_117_378,
      population_20plus: 43_529_812,
    });
    const gyeonggi = data.aggregate(records.filter(item => item.area_code.startsWith('41')));
    expect(gyeonggi.distinctCount).toBe(31);
    expect(gyeonggi.population_20plus).toBe(11_513_669);
    expect(gyeonggi.i5_reference).toBeCloseTo(34.342506860054485, 10);
    const chungbuk = data.aggregate(records.filter(item => item.area_code.startsWith('43')));
    expect(chungbuk.distinctCount).toBe(11);
    expect(chungbuk.population_20plus).toBe(1_360_004);
    expect(chungbuk.i5_reference).toBeCloseTo(34.8720485433899, 10);
  });
});

describe('Nationwide overview weighted scores', () => {
  it('weights I5 and all five domains by adult population, not total population or row count', () => {
    const result = data.aggregate([
      row('11110', '종로구', { population_total: 900, population_20plus: '100' }),
      row('11140', '중구', {
        population_total: 1000, population_20plus: 300, i5_reference: '40',
        domain_scores: { E: 50, P: 60, O: 70, C: 80, U: 90 },
      }),
    ]);
    expect(result.population_total).toBe(1900);
    expect(result.population_20plus).toBe(400);
    expect(result.i5_reference).toBe(35);
    expect(result.domain_scores).toEqual({ E: 40, P: 50, O: 60, C: 70, U: 80 });
  });

  it.each([null, undefined, '', Number.NaN, Number.POSITIVE_INFINITY])('keeps missing/invalid I5 (%s) unknown without losing the population', missing => {
    const result = data.aggregate([row('11110', '종로구'), row('11140', '중구', { i5_reference: missing })]);
    expect(data.finite(missing)).toBe(false);
    expect(result.population_20plus).toBe(200);
    expect(result.i5_reference).toBeNull();
    expect(result.domain_scores.E).toBe(10);
  });

  it('leaves only the missing domain unknown instead of treating it as zero', () => {
    const result = data.aggregate([
      row('11110', '종로구'),
      row('11140', '중구', { domain_scores: { E: null, P: 40, O: 50, C: 60, U: 70 } }),
    ]);
    expect(result.domain_scores).toEqual({ E: null, P: 30, O: 40, C: 50, U: 60 });
    expect(result.i5_reference).toBe(20);
    const noDomains = data.aggregate([row('11110', '종로구', { domain_scores: undefined })]);
    expect(Object.values(noDomains.domain_scores)).toEqual([null, null, null, null, null]);
  });

  it('does not calculate a partial mean when an adult population denominator is missing', () => {
    const result = data.aggregate([row('11110', '종로구'), row('11140', '중구', { population_20plus: null })]);
    expect(result.population_20plus).toBeNull();
    expect(result.population_total).toBe(240);
    expect(result.i5_reference).toBeNull();
    expect(Object.values(result.domain_scores)).toEqual([null, null, null, null, null]);
  });

  it('keeps unknown total population separate from a valid adult-weighted score', () => {
    const result = data.aggregate([row('11110', '종로구'), row('11140', '중구', { population_total: null })]);
    expect(result.population_total).toBeNull();
    expect(result.population_20plus).toBe(200);
    expect(result.i5_reference).toBe(20);
  });

  it('accepts measured zero scores and ignores missing scores on a zero-weight row', () => {
    const result = data.aggregate([
      row('11110', '종로구', { i5_reference: 0, domain_scores: { E: 0, P: 0, O: 0, C: 0, U: 0 } }),
      row('11140', '중구', { population_20plus: 0, i5_reference: null, domain_scores: undefined }),
    ]);
    expect(data.finite(0)).toBe(true);
    expect(result.i5_reference).toBe(0);
    expect(result.domain_scores).toEqual({ E: 0, P: 0, O: 0, C: 0, U: 0 });
    expect(result.population_20plus).toBe(100);
  });

  it('does not invent a zero score without any positive population', () => {
    for (const regions of [[], [row('11110', '종로구', { population_20plus: 0 })]]) {
      const result = data.aggregate(regions);
      expect(result.i5_reference).toBeNull();
      expect(Object.values(result.domain_scores)).toEqual([null, null, null, null, null]);
    }
  });
});

describe('Nationwide overview pagination', () => {
  it('follows the server offsets and preserves every page in order', async () => {
    const first = row('11110', '종로구');
    const last = row('11140', '중구');
    const fetchPage = vi.fn(async (offset: number): Promise<Page> => {
      if (offset === 0) return { run_id: 'run-a', records: [first], next_offset: 500 };
      if (offset === 500) return { run_id: 'run-a', records: [], next_offset: 700 };
      return { run_id: 'run-a', records: [last], next_offset: null };
    });
    await expect(data.readAll(fetchPage)).resolves.toEqual([first, last]);
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 500, 700]);
  });

  it('returns an empty completed result without requesting another page', async () => {
    const fetchPage = vi.fn(async (): Promise<Page> => ({ run_id: 'run-a', records: [], next_offset: null }));
    await expect(data.readAll(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('rejects mixed model runs rather than combining two data versions', async () => {
    const fetchPage = vi.fn(async (offset: number): Promise<Page> => ({
      run_id: offset === 0 ? 'run-a' : 'run-b',
      records: [row('11110', '종로구')],
      next_offset: offset === 0 ? 500 : null,
    }));
    await expect(data.readAll(fetchPage)).rejects.toThrow('조회 중 자료가 갱신');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('rejects an offset cycle before fetching a duplicate page', async () => {
    const fetchPage = vi.fn(async (offset: number): Promise<Page> => ({
      run_id: 'run-a', records: [], next_offset: offset === 0 ? 500 : 0,
    }));
    await expect(data.readAll(fetchPage)).rejects.toThrow('자료를 모두 불러오지 못');
    expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([0, 500]);
  });

  it('rejects malformed pages and propagates request failure without returning partial records', async () => {
    await expect(data.readAll(async () => ({ run_id: 'run-a', records: null, next_offset: null })))
      .rejects.toThrow('지역 자료 형식');
    const failure = new Error('connection lost');
    const fetchPage = vi.fn(async (offset: number): Promise<Page> => {
      if (offset === 0) return { run_id: 'run-a', records: [row('11110', '종로구')], next_offset: 500 };
      throw failure;
    });
    await expect(data.readAll(fetchPage)).rejects.toBe(failure);
  });
});


describe('Welfare catalog provenance labels', () => {
  it('distinguishes application schedules and administering jurisdiction from eligibility', () => {
    const metadata = {date_basis:'application',region_basis:'administering_jurisdiction',classification_basis:'internal_tags'};
    expect(data.welfareLabels(metadata)).toEqual({date:'신청 기간',region:'담당 지역',category:'자료 분류'});
    expect(data.periodLabel('ongoing',metadata)).toBe('등록 신청 기간 내');
    expect(data.periodLabel('ended',metadata)).toBe('등록 신청 기간 종료');
    expect(data.periodLabel('ongoing',metadata)).not.toContain('접수 중');
  });
  it('retains the legacy business-period labels only for the legacy data basis', () => {
    expect(data.welfareLabels({})).toEqual({date:'운영 기간',region:'지원 지역',category:'지원 분야'});
    expect(data.periodLabel('unknown',{})).toBe('기간 확인 필요');
    expect(data.periodLabel('unknown',{date_basis:'application'})).toBe('신청 기간 미기재');
  });
});


describe('Welfare application period text', () => {
  const application = {date_basis:'application'};
  it('preserves an explicit timed range instead of reducing it to parsed dates', () => {
    const text = '2026. 10. 25. 09:00 ~\n2026. 11. 2. 18:00 (온라인 접수)';
    expect(data.periodText({...application,application_period_text:text,start_date:'2026-10-25',end_date:'2026-11-02'})).toBe(text);
  });
  it.each([
    ['always','상시 신청','연중 상시 신청'],
    ['varies','기관별 일정 상이','기관별 일정 상이 (각 기관 공고 참고)'],
    ['announced','신청 일정 안내','매년 3월 별도 공고'],
    ['not_required','별도 신청 없음','별도 신청 없이 대상자 선정'],
  ])('keeps the %s guidance distinct from an unavailable date range', (status, label, text) => {
    expect(data.periodLabel(status,application)).toBe(label);
    expect(data.periodText({...application,application_period_text:text,start_date:null,end_date:null})).toBe(text);
  });
  it('does not interpret a missing date or an application method as an undecided schedule', () => {
    expect(data.periodText({...application,start_date:null,end_date:null,application_text:'주민센터 방문 접수'})).toBe('등록된 신청 기간 정보 없음');
    expect(data.periodText({...application,application_period_text:'   '})).toBe('등록된 신청 기간 정보 없음');
    expect(data.periodLabel('unknown',application)).toBe('신청 기간 미기재');
  });
  it.each([
    [{start_date:'2026-10-25',end_date:null},'2026-10-25부터'],
    [{start_date:null,end_date:'2026-11-02'},'2026-11-02까지'],
    [{start_date:'2026-10-25',end_date:'2026-11-02'},'2026-10-25 ~ 2026-11-02'],
  ])('uses a supported one-sided or complete structured range', (dates, expected) => {
    expect(data.periodText({...application,...dates})).toBe(expected);
  });
  it('does not replace a legacy business period with application guidance', () => {
    expect(data.periodText({date_basis:'operation',application_period_text:'상시 신청',start_date:'2026-01-01',end_date:'2026-12-31'})).toBe('2026-01-01 ~ 2026-12-31');
    expect(data.periodLabel('unknown',{date_basis:'operation'})).toBe('기간 확인 필요');
  });
  it('escapes raw period and application text in actual cards and details while retaining newlines', async () => {
    const period = '매월 첫째 주\n<img src=x onerror=alert(1)>';
    const instructions = '신청방법: 방문\n<script>alert("x")</script>';
    const program = {version_id:'v1',title:'사업',support_content:'내용',period_status:'announced',is_synthetic:false,
      start_date:null,end_date:null,application_period_text:period,application_text:instructions,
      regions:[],source_categories:[],conditions:[],source:{name:'자료 제공처'},source_url:null};
    const result = {...application,programs:[program],statuses:[{code:'announced'}],categories:[],regions:[],total:1,matched:1,next_offset:null};
    const section = {innerHTML:'',hidden:false,dataset:{overviewPage:'welfare-list'}};
    const dialog = {innerHTML:'',showModal:vi.fn()};
    const controls = {innerHTML:''};
    const handlers:Record<string,(event:any)=>void> = {};
    const root = {innerHTML:'',hidden:true,id:'',className:'',
      querySelector:(selector:string)=>selector==='#ho-program-dialog'?dialog:selector==='[data-ho-welfare-toolbar]'||selector==='.ho-selected-scope'?controls:section,
      querySelectorAll:()=>[section],
      addEventListener:(name:string,handler:(event:any)=>void)=>{handlers[name]=handler;}};
    const renderingContext = createContext({window:{},location:{search:''},URL,URLSearchParams,
      document:{createElement:()=>root},fetch:async()=>({ok:true,json:async()=>result})});
    new Script(source).runInContext(renderingContext);
    const view = renderingContext.window.HERMI_OVERVIEW;
    view.mount({after:vi.fn()});
    await view.show('welfare-list');
    expect(section.innerHTML).toContain('매월 첫째 주\n&lt;img src=x onerror=alert(1)&gt;');
    const card = section.innerHTML.match(/<article class="ho-program-card">[\s\S]*?<\/article>/)?.[0];
    expect(card).not.toContain('신청 일정 안내');
    expect(card).not.toContain('<dt>신청 기간</dt>');
    expect(section.innerHTML).toContain('<dt>신청 기간</dt>');
    expect(section.innerHTML).not.toContain('<img src=x');
    expect(section.innerHTML).not.toContain('미정');
    handlers.click({target:{closest:()=>({dataset:{hoProgram:'v1'},hasAttribute:()=>false})}});
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.innerHTML).toContain('신청 안내');
    expect(dialog.innerHTML).toContain('신청방법: 방문\n&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(dialog.innerHTML).not.toContain('<script>');
  });
});

describe('Welfare source information and extracted conditions', () => {
  it('distinguishes automated classification statuses from human review or missing review metadata', () => {
    expect(data.reviewLabel('auto_assigned')).toBe('자동 분류');
    expect(data.reviewLabel('auto_confirmed')).toBe('자동 기준 일치');
    expect(data.reviewLabel('needs_review')).toBe('검토 필요');
    expect(data.reviewLabel(null)).toBe('검토 상태 미기재');
    expect(data.reviewLabel('future_status')).toBe('기타 검토 상태');
  });
  it('preserves code labels, including 해당사항없음, without inferring eligibility from their combination', () => {
    const [condition] = data.conditionRows({conditions:[{kind:'household',operator:'any_of',
      value:{labels:['다문화가족','해당사항없음'],codes:['JA0401','JA0409'],unmarked_codes:['JA0402'],code_system:'gov24_supportConditions'},
      review_status:'source_structured',logic_group:{combine:'any_of',semantics:'unspecified_by_source',includes_none_of_the_above:true},
      source_quote:'JA0401(다문화가족)=Y, JA0409(해당사항없음)=Y'}]});
    expect(condition).toMatchObject({label:'가구',text:'다문화가족 · 해당사항없음',review:'원자료 항목',needs_original:true});
    expect(condition.text).not.toMatch(/JA040|또는|모두|제외/);
  });

  it('reads official target groups and retains meaningful values of an unfamiliar condition object', () => {
    const result = data.conditionRows({conditions:[
      {kind:'target_group',value:{groups:['보훈대상자','저소득'],code_system:'local_trgterIndvdlNmArray'},review_status:'source_structured'},
      {kind:'residence',value:{description:'전입 후 거주',value:6,unit:'개월',source_field:'target_text'},review_status:'needs_review'},
    ]});
    expect(result[0].text).toBe('보훈대상자 · 저소득');
    expect(result[1].text).toBe('설명: 전입 후 거주 / 값: 6 / 단위: 개월');
    expect(result[1].review).toBe('검토 필요');
  });

  it('does not turn extracted residence durations into age limits or merge distinct age wording', () => {
    const [condition] = data.conditionRows({conditions:[{kind:'age',operator:'text',review_status:'needs_review',value:{expressions:[
      {text:'6개월 이상',min:null,max:null,field:'target_text'},
      {text:'12개월 이상',min:null,max:null,field:'selection_text'},
      {text:'6개월 이상',min:null,max:null,field:'selection_text'},
      {text:'19~44세',min:19,max:44}, {text:'44세 이하',min:0,max:44},
    ]}}]});
    expect(condition).toMatchObject({label:'기간·연령 표현',text:'6개월 이상 · 12개월 이상 · 19~44세 · 44세 이하',review:'검토 필요'});
    expect(data.ageLabel({age_status:'complex',min_age:6,max_age:12})).toBe('원문 기준 확인');
    expect(data.ageLabel({age_status:'bounded',min_age:0,max_age:17})).toBe('0~17세');
    expect(data.conditionRows({conditions:[{kind:'age',value:[19,64]}]})[0].text).toBe('19~64세');
  });

  it.each([['<',40,'기준중위소득 40% 미만'],['<=',150,'기준중위소득 150% 이하'],['<',0,'기준중위소득 0% 미만']])(
    'retains the income comparison %s rather than changing its threshold', (operator,percent,expected) => {
      expect(data.conditionRows({conditions:[{kind:'income',operator,value:{basis:'기준중위소득',percent}}]})[0].text).toBe(expected);
    });

  it('suppresses references to full source sections but retains a unique unstructured quote', () => {
    const base = {target_text:'지원 대상 첫 줄\n둘째 줄',selection_text:'선정 기준'};
    const result = data.conditionRows({...base,conditions:[
      {kind:'unstructured_text',value:{fields:['target_text','selection_text']},source_quote:'지원 대상 첫 줄\n둘째 줄\n선정 기준'},
      {kind:'unstructured_text',value:{target_text:base.target_text,selection_text:base.selection_text}},
      {kind:'unstructured_text',value:base.target_text},
      {kind:'unstructured_text',value:{fields:['target_text']},source_quote:'별도 추가 조건'},
    ]});
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('별도 추가 조건');
  });

  it('keeps business dates separate from the application period and does not treat a sentinel as a real end date', () => {
    const program = {date_basis:'application',application_period_text:'연중 상시',conditions:[{
      kind:'program_period',value:{start:'2025-01-01',end:null,raw_end:'99991231',meaning:'사업 시행기간(신청기간 아님)'},
    }]};
    expect(data.periodText(program)).toBe('연중 상시');
    expect(data.conditionRows(program)).toEqual([]);
    expect(data.businessPeriods(program)).toEqual(['2025-01-01부터 · 종료일 미기재 · 사업 시행기간(신청기간 아님) (원자료의 종료일은 미지정 값)']);
    expect(data.businessPeriods(program)[0]).not.toContain('9999');
  });

  it('distinguishes an unmatched original region from a mapped jurisdiction', () => {
    expect(data.regionDetails([
      {scope_type:'district',name:'서울특별시 중구',original_region_text:'서울 중구'},
      {scope_type:'district',name:null,code:null,original_region_text:'경기도교육청'},
    ])).toEqual({matched:'서울특별시 중구, 경기도교육청 (지역 연결 전)',original:'서울 중구, 경기도교육청'});
    expect(data.regionDetails([{scope_type:'nationwide'}]).matched).toBe('전국');
  });

  it('labels all audited original metadata keys and distinguishes portal availability and source dates', () => {
    const raw = {aplyMtdNm:'방문',sprtCycNm:'분기',srvPvsnNm:'현금지급',lastModYmd:'20260715',
      ctpvNm:'경기도',sggNm:'경기도교육청',intrsThemaNmArray:['교육'],intrsThemaArray:['건강'],
      lifeArray:['청년'],lifeNmArray:['영유아'],trgterIndvdlNmArray:['장애인'],trgterIndvdlArray:['보훈대상자'],
      crtrYr:'2026',onapPsbltYn:'N',svcfrstRegTs:'20210903',지원유형:['현물'],사용자구분:['개인'],
      서비스분야:['행정·안전'],소관기관유형:'시군구',소관기관코드:'5480000'};
    const rows = data.officialMetadata({official_categories_raw:raw});
    expect(rows).toHaveLength(Object.keys(raw).length);
    for (const item of rows) expect(item.label).not.toMatch(/[a-zA-Z_]/);
    expect(rows).toContainEqual({label:'원자료 수정일',text:'2026-07-15'});
    expect(rows).toContainEqual({label:'원자료 최초 등록일',text:'2021-09-03'});
    expect(rows).toContainEqual({label:'자료 기준연도',text:'2026'});
    expect(rows).toContainEqual({label:'원문 포털 온라인 신청',text:'미지원 (다른 신청 경로는 신청 안내 참고)'});
    expect(data.officialMetadata({official_categories_raw:{onapPsbltYn:'Y'}})[0].text).toBe('지원 (다른 신청 경로는 신청 안내 참고)');
  });
});

describe('Welfare complete card and detail rendering', () => {
  it('renders useful card fields and complete source sections with separate extracted evidence and dates', async () => {
    const target = '부모가 6개월 이상 거주\n둘째 자녀 지원';
    const selection = '소득 기준 확인\n중복 지원 제외';
    const program = {version_id:'full',title:'출생 지원 <안내>',summary:'사업 요약\n전체 문장',institution:'중구청 <복지과>',
      support_content:'첫째 30만원\n둘째 50만원 <script>alert(1)</script>',target_text:target,selection_text:selection,
      application_text:'신청기한: 출생일로부터 1년\n신청방법: 주민센터 방문',application_period_text:'출생일로부터 1년',period_status:'announced',
      age_status:'complex',min_age:null,max_age:null,age_basis_text:'6개월 이상 / 12개월 이상',life_stage_raw:'영유아',gender_scope:'all',
      official_categories_raw:{aplyMtdNm:'방문',lastModYmd:'20260715',지원유형:['현금'],onapPsbltYn:'N'},
      regions:[{scope_type:'district',name:null,original_region_text:'경기도교육청'}],
      source_categories:[{label:'가족 지원',description:'가족 대상 자료를 모은 분류',review_status:'needs_review',source_quote:'분류 근거 <태그>'}],
      source:{source_id:'local',name:'지자체 복지서비스'},source_retrieved_at:'2026-10-25T01:02:03+00:00',
      is_synthetic:false,source_url:'https://www.gov.kr/',source_url_type:'official_site',
      conditions:[{kind:'age',value:{expressions:[{text:'6개월 이상'},{text:'12개월 이상'}]},review_status:'needs_review',source_quote:'부모 거주 요건 <확인>'},
        {kind:'income',operator:'<',value:{basis:'기준중위소득',percent:40},review_status:'needs_review',source_quote:'소득 40% 미만'},
        {kind:'household',operator:'any_of',value:{labels:['다문화가족','해당사항없음']},review_status:'source_structured',logic_group:{semantics:'unspecified_by_source'}},
        {kind:'target_group',value:{groups:['보훈대상자']}},
        {kind:'program_period',value:{start:'2025-01-01',end:null,raw_end:'99991231',meaning:'사업 시행기간(신청기간 아님)'},source_quote:'사업 시작 20250101'},
        {kind:'unstructured_text',value:{fields:['target_text','selection_text']},source_quote:target+'\n'+selection}]};
    const {card,detail} = await renderWelfare(program,{publications:[{source_id:'local',published_at:'2026-10-24T01:00:00+00:00'}]});
    expect(card).toContain('사업 요약\n전체 문장');
    expect(card).toContain('중구청 &lt;복지과&gt;');
    expect(card).toContain(target);
    const listItem=card.match(/<article class="ho-program-card">[\s\S]*?<\/article>/)?.[0] || '';
    expect(listItem).not.toContain('첫째 30만원');
    expect(card).toContain('첫째 30만원\n둘째 50만원 &lt;script&gt;alert(1)&lt;/script&gt;');
    for (const heading of ['사업 개요','지원 내용','지원 대상','선정 기준','신청 기간·방법','사업 시행기간','대상에 관한 등록 정보','원자료 분류·제공 정보','자료 분류 (내부 기준)','자료에서 정리한 조건','자료 출처']) {
      expect(detail).toContain(`<h3>${heading}</h3>`);
    }
    expect(detail).toContain('<h4>신청 안내</h4>');
    const folded = detail.indexOf('<details class="ho-detail-fold">');
    const targetAt = detail.indexOf('<h3>지원 대상</h3>');
    const supportAt = detail.indexOf('<h3>지원 내용</h3>');
    const applicationAt = detail.indexOf('<h3>신청 기간·방법</h3>');
    expect(targetAt).toBeLessThan(supportAt);
    expect(supportAt).toBeLessThan(applicationAt);
    expect(applicationAt).toBeLessThan(folded);
    expect(detail.indexOf('기관 홈페이지 확인')).toBeLessThan(folded);
    expect(detail.match(/<details class="ho-detail-fold">/g)).toHaveLength(2);
    expect(detail).not.toMatch(/<details[^>]*\bopen\b/);
    expect(detail).toContain('<summary>선정 기준·사업 정보</summary>');
    expect(detail).toContain('<summary>근거·출처</summary>');
    for (const text of [target,selection,program.application_text,'원문 기준 확인','영유아','보훈대상자','다문화가족 · 해당사항없음',
      '기준중위소득 40% 미만','6개월 이상 · 12개월 이상','경기도교육청 (지역 연결 전)','원문 지역 표기','사업 시행기간(신청기간 아님)',
      '원자료 수정일','2026-07-15','자료 수집 시각','자료 묶음 공개일','원문 포털 온라인 신청','미지원 (다른 신청 경로는 신청 안내 참고)']) expect(detail).toContain(text);
    expect(detail).toContain('첫째 30만원\n둘째 50만원 &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(detail).toContain('<details class="ho-evidence"><summary>근거 원문 보기</summary>');
    expect(detail).toContain('부모 거주 요건 &lt;확인&gt;');
    expect(detail).toContain('분류 근거 &lt;태그&gt;');
    expect(detail).toContain('각 항목의 결합 관계가 명시되지 않아');
    expect(detail).toContain('기관 홈페이지 확인');
    expect(detail).toContain('rel="noopener noreferrer"');
    expect(detail).not.toMatch(/<script>|99991231|fields:|groups:|6개월 이상세|기타 원문 조건/);
    expect(detail.split(target)).toHaveLength(2);
  });

  it.each([
    ['https://www.gov.kr/portal/service',false,'official_source',true,'원문에서 확인하기'],
    ['https://www.gov.kr/',false,'official_site',true,'기관 홈페이지 확인'],
    ['javascript:alert(1)',false,'official_source',false,''],
    ['https://user:pass@example.com/',false,'official_source',false,''],
    ['https://www.gov.kr/',true,'official_site',false,''],
    ['https://www.gov.kr/',undefined,'official_site',false,''],
  ])('preserves source-link safety and provenance for %s', async (url,synthetic,type,linked,label) => {
    const {detail} = await renderWelfare({source_url:url,is_synthetic:synthetic,source_url_type:type});
    expect(detail.includes('<a class="btn primary"')).toBe(linked);
    if (linked) expect(detail).toContain(label);
    if (synthetic) expect(detail).toContain('실제 신청 대상 사업이 아닙니다.');
  });
});

type Catalog = Record<string, any>;
const catalogFixture = (): Catalog => ({
  date_basis:'application',region_basis:'administering_jurisdiction',classification_basis:'internal_tags',
  total:30,matched:20,next_offset:12,
  categories:[{category_id:'social',label:'관계 지원'},{category_id:'income',label:'소득 지원'}],
  statuses:[{code:'always'}],
  regions:[
    {code:'11215',name:'광진구',level:'sgg',parent_code:'11',province_code:'11',province_name:'서울특별시'},
    {code:'1121571000',name:'화양동',level:'administrative_dong',parent_code:'11215',province_code:'11',province_name:'서울특별시'},
    {code:'11680',name:'강남구',level:'sgg',parent_code:'11',province_code:'11',province_name:'서울특별시'},
    {code:'1168051000',name:'신사동',level:'administrative_dong',parent_code:'11680',province_code:'11',province_name:'서울특별시'},
  ],
  programs:[{version_id:'v1',title:'관계 지원사업',support_content:'주민 모임 지원',period_status:'always',
    application_period_text:'상시 신청',is_synthetic:false,source:{name:'공공 자료 제공처'},
    source_url:'https://example.gov/program',regions:[],source_categories:[],conditions:[]}],
});
function welfareHarness(handler: (url:string)=>Promise<Catalog> = async()=>catalogFixture(), clock?:()=>number,
  regionHandler:(url:string)=>Promise<Catalog> = async()=>({as_of:'2026-10-25',regions:catalogFixture().regions})) {
  let html='';const renders:string[]=[];
  const detailPane={innerHTML:'',scrollTop:0,querySelector:()=>null};
  const chatSlot={innerHTML:''},chatFeed={scrollTop:0,scrollHeight:120};
  const chatMessage={focus:vi.fn()},chatLauncher={focus:vi.fn()};
  const selectionButtons:Record<string,any>[]=[];
  function detailContent(value:string) {
    const opening=value.match(/<section\b[^>]*\bdata-ho-program-detail[^>]*>/);
    if(!opening || opening.index==null)return '';
    const start=opening.index+opening[0].length,remaining=value.slice(start);
    let depth=1;
    for(const match of remaining.matchAll(/<\/?section\b[^>]*>/g)) {
      depth+=match[0].startsWith('</')?-1:1;
      if(!depth)return remaining.slice(0,match.index);
    }
    return '';
  }
  const section = {get innerHTML(){return html;},set innerHTML(value:string){
    html=value;renders.push(value);detailPane.innerHTML=detailContent(value);selectionButtons.length=0;
    for(const match of value.matchAll(/<button\b[^>]*data-ho-select-program="([^"]+)"[^>]*>/g)) {
      const attributes=new Map<string,string>([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(item=>[item[1],item[2]]));
      const classList={toggle:vi.fn()};
      selectionButtons.push({dataset:{hoSelectProgram:match[1]},classList,focus:vi.fn(),
        setAttribute:vi.fn((name:string,value:string)=>{attributes.set(name,value);}),
        getAttribute:(name:string)=>attributes.get(name),closest:()=>({classList})});
    }
  },hidden:false,dataset:{overviewPage:'welfare-list'}};
  const activeField = {name:'q',selectionStart:1,selectionEnd:4,selectionDirection:'forward',focus:vi.fn(),setSelectionRange:vi.fn()};
  const toolbar = {innerHTML:'',contains:(element:unknown)=>element===activeField,
    querySelector:(selector:string)=>selector==='[name="q"]'?activeField:null};
  const scope = {innerHTML:''};
  const selectionError = {textContent:'',hidden:true};
  const dialog = {innerHTML:'',showModal:vi.fn(),close:vi.fn()};
  const summary = {focus:vi.fn()};
  const results = {scrollIntoView:vi.fn(),querySelector:(selector:string)=>selector==='.ho-results-summary'?summary:null};
  const handlers: Record<string,(event:any)=>void> = {};
  const root = {innerHTML:'',hidden:true,id:'',className:'',
    querySelector:(selector:string)=> selector==='#ho-program-dialog'||selector==='dialog'?dialog:selector==='[data-ho-welfare-toolbar]'?toolbar:selector==='.ho-selected-scope'?scope:selector==='[data-ho-selection-error]'?selectionError:selector==='[data-ho-welfare-results]'?results:selector==='.ho-results-summary'?summary:selector==='[data-ho-program-detail]'?detailPane:selector==='[data-ho-welfare-chat-slot]'?chatSlot:selector==='[data-ho-chat-feed]'?chatFeed:selector==='[data-ho-chat-message]'?chatMessage:selector==='[data-ho-chat-open]'?chatLauncher:section,
    querySelectorAll:(selector:string)=>selector==='[data-ho-select-program]'?selectionButtons:[section],
    addEventListener:(name:string,callback:(event:any)=>void)=>{handlers[name]=callback;}};
  const fetch = vi.fn(async (url:string)=>({ok:true,json:async()=>handler(url)}));
  const regionFetch = vi.fn(async (url:string)=>({ok:true,json:async()=>regionHandler(url)}));
  class FakeFormData {constructor(private form:{q:string}){} get(key:string){return key==='q'?this.form.q:null;}}
  class ClockDate extends Date {static now(){return clock?clock():Date.now();}}
  const document:{createElement:()=>typeof root;activeElement:unknown} = {createElement:()=>root,activeElement:null};
  const session={messages:[],send:vi.fn(async()=>({}))};
  const createSession=vi.fn(()=>session);
  const context = createContext({window:{HERMI_WELFARE_CHAT:{createSession}},location:{search:''},URL,URLSearchParams,FormData:FakeFormData,
    document,fetch:(url:string)=>new URL(url,'https://test.local').pathname==='/api/model/welfare/regions'?regionFetch(url):fetch(url),Date:ClockDate});
  new Script(source).runInContext(context);
  const view=context.window.HERMI_OVERVIEW;
  view.mount({after:vi.fn()});
  const field=(name:string,value:string)=>({name,value,hasAttribute:(attribute:string)=>attribute==='data-ho-welfare-filter'});
  const change=(name:string,value:string)=>handlers.change({target:field(name,value)});
  const input=(value:string)=>handlers.input({target:field('q',value)});
  const submit=(q='')=>handlers.submit({target:{id:'ho-welfare-search',q},preventDefault:vi.fn()});
  const click=(attribute:string,dataset:Record<string,string>={})=>handlers.click({target:{closest:()=>({dataset,hasAttribute:(name:string)=>name===attribute})}});
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  return {view,section,toolbar,scope,dialog,detailPane,selectionButtons,chatSlot,chatMessage,chatLauncher,session,createSession,selectionError,summary,results,renders,fetch,regionFetch,activeField,document,change,input,submit,click,flush};
}

describe('Welfare region choices load independently',()=>{
  function pageWithoutRegions() {return {...catalogFixture(),regions:[],available_regions:[]};}
  it('shows cards before region choices arrive and updates only controls without losing edits or focus',async()=>{
    let resolveRegions:(result:Catalog)=>void=()=>{};
    const h=welfareHarness(async()=>pageWithoutRegions(),undefined,async()=>new Promise(resolve=>{resolveRegions=resolve;}));
    await h.view.show('welfare-list');
    expect(h.section.innerHTML).toContain('관계 지원사업');
    expect(h.regionFetch).toHaveBeenCalledTimes(1);
    h.change('province_code','11');h.change('category_id','income');h.input('검색 중인 초안');
    h.document.activeElement=h.activeField;
    const cards=h.section.innerHTML;
    resolveRegions({as_of:'2026-10-25',regions:catalogFixture().regions});await h.flush();
    expect(h.section.innerHTML).toBe(cards);
    expect(h.toolbar.innerHTML).toContain('광진구');
    expect(h.toolbar.innerHTML).toContain('value="검색 중인 초안"');
    expect(h.toolbar.innerHTML).toContain('value="income" selected');
    expect(h.toolbar.innerHTML).toContain('value="11" selected');
    expect(h.activeField.focus).toHaveBeenCalledWith({preventScroll:true});
    expect(h.activeField.setSelectionRange).toHaveBeenCalledWith(1,4,'forward');
  });
  it('keeps cards usable when choices fail and retries only region choices',async()=>{
    let fail=true;
    const h=welfareHarness(async()=>pageWithoutRegions(),undefined,async()=>{
      if(fail)throw new Error('지역 조회 오류');return {as_of:'2026-10-25',regions:catalogFixture().regions};
    });
    await h.view.show('welfare-list');await h.flush();h.change('province_code','11');
    expect(h.section.innerHTML).toContain('관계 지원사업');
    expect(h.toolbar.innerHTML).toContain('지역 선택지를 불러오지 못했어요.');
    expect(h.toolbar.innerHTML).toContain('data-ho-retry-regions');
    fail=false;h.click('data-ho-retry-regions');await h.flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);expect(h.regionFetch).toHaveBeenCalledTimes(2);
    expect(h.toolbar.innerHTML).toContain('광진구');
    expect(h.toolbar.innerHTML).not.toContain('data-ho-retry-regions');
    expect(h.activeField.focus).not.toHaveBeenCalled();
  });
  it('shares pending region requests across pages and refreshes choices after sixty seconds',async()=>{
    let now=0,resolveRegions:(result:Catalog)=>void=()=>{};
    const h=welfareHarness(async()=>pageWithoutRegions(),()=>now,async()=>new Promise(resolve=>{resolveRegions=resolve;}));
    await h.view.show('welfare-list');await h.view.show('welfare-list');
    h.click('data-ho-offset',{hoOffset:'12'});await h.flush();
    expect(h.regionFetch).toHaveBeenCalledTimes(1);
    resolveRegions({as_of:'2026-10-25',regions:catalogFixture().regions});await h.flush();
    now=59_999;await h.view.show('welfare-list');expect(h.regionFetch).toHaveBeenCalledTimes(1);
    now=60_000;await h.view.show('welfare-list');expect(h.regionFetch).toHaveBeenCalledTimes(2);
    expect(h.section.innerHTML).toContain('관계 지원사업');
  });
});

describe('Welfare catalog request reuse',()=>{
  it('reuses a recent page without a loading flash and refetches it after sixty seconds',async()=>{
    let now=0;const h=welfareHarness(async()=>catalogFixture(),()=>now);
    await h.view.show('welfare-list');h.renders.length=0;
    h.input('아직 적용하지 않은 검색');now=59_999;
    await h.view.show('welfare-list');
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.renders.some(html=>html.includes('ho-loading'))).toBe(false);
    expect(h.section.innerHTML).toContain('value="아직 적용하지 않은 검색"');
    now=60_000;await h.view.show('welfare-list');
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.renders.some(html=>html.includes('ho-loading'))).toBe(true);
  });
  it('shares a pending request on repeated entry while preserving the latest response guard',async()=>{
    let resolveFirst:(result:Catalog)=>void=()=>{};
    const h=welfareHarness(async url=>new URL(url,'https://test.local').searchParams.get('q')==='새 검색'?catalogFixture():new Promise(resolve=>{resolveFirst=resolve;}));
    const first=h.view.show('welfare-list'),reentry=h.view.show('welfare-list');
    await h.flush();expect(h.fetch).toHaveBeenCalledTimes(1);
    h.submit('새 검색');await h.flush();
    const stale=catalogFixture();stale.programs[0].title='먼저 요청한 오래된 사업';resolveFirst(stale);
    await Promise.all([first,reentry]);
    expect(h.section.innerHTML).toContain('관계 지원사업');
    expect(h.section.innerHTML).not.toContain('먼저 요청한 오래된 사업');
    h.click('data-ho-reset-filters');await h.flush();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.section.innerHTML).toContain('먼저 요청한 오래된 사업');
  });
  it('does not cache failures and lets retry replace an expired successful response',async()=>{
    let now=0,fail=false;
    const h=welfareHarness(async()=>{if(fail)throw new Error('일시적인 연결 오류');return catalogFixture();},()=>now);
    await h.view.show('welfare-list');now=60_000;fail=true;
    await h.view.show('welfare-list');
    expect(h.section.innerHTML).toContain('일시적인 연결 오류');
    fail=false;h.click('data-ho-retry');await h.flush();
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.section.innerHTML).toContain('관계 지원사업');
    await h.view.show('welfare-list');expect(h.fetch).toHaveBeenCalledTimes(3);
  });
  it('retains at most twenty query pages and reuses each page only with its applied filters',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    for(let index=1;index<=20;index++){h.submit(`검색 ${index}`);await h.flush();}
    expect(h.fetch).toHaveBeenCalledTimes(21);
    h.submit('검색 20');await h.flush();expect(h.fetch).toHaveBeenCalledTimes(21);
    h.click('data-ho-reset-filters');await h.flush();expect(h.fetch).toHaveBeenCalledTimes(22);
    h.submit('검색 1');await h.flush();expect(h.fetch).toHaveBeenCalledTimes(23);
  });
});

describe('Welfare selected program and detail workspace',()=>{
  function programs(ids=['one','two']) {
    const fixture=catalogFixture(),names:Record<string,string>={one:'첫째 사업',two:'둘째 사업',three:'셋째 사업'};
    return {...fixture,total:ids.length,matched:ids.length,next_offset:null,
      programs:ids.map(id=>({...fixture.programs[0],version_id:id,title:names[id],summary:`${names[id]} 요약`,
        target_text:`${names[id]} 지원 대상 원문`,support_content:`${names[id]} 지원 내용 원문`,
        selection_text:`${names[id]} 선정 기준 원문`,application_text:`${names[id]} 신청 방법 원문`,
        application_period_text:`${names[id]} 등록 기간 원문`}))};
  }
  function selected(h:ReturnType<typeof welfareHarness>) {
    return h.selectionButtons.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.hoSelectProgram);
  }
  it('selects the first program and changes only its detail without fetching or rebuilding the list',async()=>{
    const fixture=programs(),h=welfareHarness(async()=>fixture);await h.view.show('welfare-list');
    expect(selected(h)).toEqual(['one']);
    expect(h.detailPane.innerHTML).toContain('첫째 사업 지원 대상 원문');
    expect(h.detailPane.innerHTML).not.toContain('둘째 사업 지원 대상 원문');
    const renders=h.renders.length,firstButton=h.selectionButtons[0];
    h.click('data-ho-select-program',{hoSelectProgram:'two'});
    expect(selected(h)).toEqual(['two']);
    expect(h.detailPane.innerHTML).not.toContain('첫째 사업 지원 대상 원문');
    for(const text of ['지원 대상 원문','지원 내용 원문','선정 기준 원문','신청 방법 원문','등록 기간 원문'])
      expect(h.detailPane.innerHTML).toContain(`둘째 사업 ${text}`);
    expect(h.detailPane.innerHTML).toContain('rel="noopener noreferrer"');
    expect(h.fetch).toHaveBeenCalledTimes(1);expect(h.regionFetch).toHaveBeenCalledTimes(1);
    expect(h.renders).toHaveLength(renders);expect(h.selectionButtons[0]).toBe(firstButton);
    expect(h.createSession).not.toHaveBeenCalled();
  });
  it('retains the selected id across cached and fresh responses, then falls back or clears when results change',async()=>{
    let now=0,fixture=programs();const h=welfareHarness(async()=>fixture,()=>now);
    await h.view.show('welfare-list');h.click('data-ho-select-program',{hoSelectProgram:'two'});
    await h.view.show('welfare-list');
    expect(selected(h)).toEqual(['two']);expect(h.fetch).toHaveBeenCalledTimes(1);
    fixture=programs(['two','one']);fixture.programs[0].support_content='새로 확인한 둘째 지원 내용';
    now=60_000;await h.view.show('welfare-list');
    expect(selected(h)).toEqual(['two']);expect(h.detailPane.innerHTML).toContain('새로 확인한 둘째 지원 내용');
    fixture=programs(['three']);h.submit('다른 조건');await h.flush();
    expect(selected(h)).toEqual(['three']);expect(h.detailPane.innerHTML).toContain('셋째 사업 지원 내용 원문');
    fixture=programs([]);h.submit('사업 없는 조건');await h.flush();
    expect(selected(h)).toEqual([]);
    expect(h.section.innerHTML).toContain('조건에 맞는 사업이 없어요.');
    expect(h.detailPane.innerHTML).not.toContain('셋째 사업');
    expect(h.detailPane.innerHTML).not.toContain('data-ho-chat-open');
  });
  it('starts the mascot chat only on request with the selected program and applied region',async()=>{
    const h=welfareHarness(async()=>programs());await h.view.show('welfare-list');
    expect(h.createSession).not.toHaveBeenCalled();
    h.change('province_code','11');h.change('district_code','11215');h.submit();await h.flush();
    h.click('data-ho-select-program',{hoSelectProgram:'two'});
    expect(h.detailPane.innerHTML).toContain('data-ho-chat-open');
    expect(h.createSession).not.toHaveBeenCalled();
    const fetches=h.fetch.mock.calls.length,renders=h.renders.length;
    h.click('data-ho-chat-open');
    expect(h.createSession).toHaveBeenCalledOnce();
    const [program,context]=h.createSession.mock.calls[0] as unknown as [Catalog,Catalog];
    expect(program).toMatchObject({version_id:'two',title:'둘째 사업',application_text:'둘째 사업 신청 방법 원문'});
    expect(context.scope_label).toContain('광진구');
    expect(context.region_basis).toBe('administering_jurisdiction');
    expect(h.session.send).not.toHaveBeenCalled();
    expect(h.chatSlot.innerHTML).toContain('data-ho-chat-close');
    expect(h.chatMessage.focus).toHaveBeenCalledWith({preventScroll:true});
    h.click('data-ho-chat-close');
    expect(h.createSession).toHaveBeenCalledOnce();expect(h.fetch).toHaveBeenCalledTimes(fetches);
    expect(h.chatSlot.innerHTML).toContain('data-ho-chat-open');
    expect(h.chatLauncher.focus).toHaveBeenCalledWith({preventScroll:true});
    expect(h.renders).toHaveLength(renders);
  });
});

describe('Welfare catalog page navigation',()=>{
  function pagedCatalog(total:number) {
    const fixture=catalogFixture();
    const programs=Array.from({length:total},(_,index)=>({...fixture.programs[0],version_id:`page-item-${index+1}`,title:`복지사업 ${String(index+1).padStart(3,'0')}`}));
    return async(url:string)=>{
      const query=new URL(url,'https://test.local').searchParams,offset=Number(query.get('offset')),limit=Number(query.get('limit'));
      return {...fixture,total,matched:total,offset,limit,next_offset:offset+limit<total?offset+limit:null,programs:programs.slice(offset,offset+limit)};
    };
  }
  function navigation(html:string) {
    return [...html.matchAll(/<nav\b[^>]*class="ho-pagination"[^>]*>[\s\S]*?<\/nav>/g)].map(match=>match[0]);
  }
  function numberedPages(html:string) {
    return [...html.matchAll(/<button\b[^>]*aria-label="(\d+)페이지"[^>]*>/g)].map(match=>Number(match[1]));
  }
  function expectPage(html:string,page:number,totalPages:number,range:string,numbers:number[]) {
    const controls=navigation(html);
    expect(controls).toHaveLength(1);
    expect(controls[0]).toContain('aria-label="복지사업 페이지 이동 (아래)"');
    expect(html).not.toContain('aria-label="복지사업 페이지 이동 (위)"');
    expect(html.lastIndexOf('</article>')).toBeLessThan(html.indexOf(controls[0]));
    expect(html.indexOf(controls[0])).toBeLessThan(html.indexOf('</aside>'));
    expect(html.indexOf('</aside>')).toBeLessThan(html.indexOf('data-ho-program-detail'));
    expect(html).toContain(`${page} / ${totalPages} 페이지`);
    expect(html).toContain(range);
    for(const control of controls) {
      expect(numberedPages(control)).toEqual(numbers);
      const current=[...control.matchAll(/<button\b[^>]*>/g)].map(match=>match[0]).filter(button=>button.includes('aria-current="page"'));
      expect(current).toHaveLength(page?1:0);
      if(page) {expect(current[0]).toContain(`aria-label="${page}페이지"`);expect(current[0]).toMatch(/\bdisabled\b/);}
    }
    return controls;
  }
  it('shows bounded page numbers below the left program list, changes the 12 results, and returns focus to their start',async()=>{
    const h=welfareHarness(pagedCatalog(120));await h.view.show('welfare-list');
    expect(new URL(h.fetch.mock.calls[0][0],'https://test.local').searchParams.get('view')).toBe('browser');
    const initial=expectPage(h.section.innerHTML,1,10,'1–12 / 120개',[1,2,3,10]);
    expect(initial[0]).toContain('ho-pagination-ellipsis');
    expect(h.section.innerHTML.match(/class="ho-program-card"/g)).toHaveLength(12);
    expect(h.section.innerHTML).toContain('<div class="ho-program-list">');
    expect(h.section.innerHTML).not.toContain('ho-program-grid');
    expect(h.selectionButtons).toHaveLength(12);
    expect(h.selectionButtons.filter(button=>button.getAttribute('aria-pressed')==='true')).toHaveLength(1);
    const firstProgram=h.section.innerHTML.match(/<article class="ho-program-card">[\s\S]*?<\/article>/)?.[0] || '';
    expect(firstProgram).toContain('<span class="ho-program-title">복지사업 001</span>');
    expect(firstProgram).toContain('<span class="ho-program-summary">');
    expect(firstProgram).not.toContain('ho-program-expand');
    expect(firstProgram).not.toContain('ho-dialog-body');
    expect(h.section.innerHTML).toContain('복지사업 001');expect(h.section.innerHTML).toContain('복지사업 012');
    expect(h.section.innerHTML).not.toContain('복지사업 013');expect(h.results.scrollIntoView).not.toHaveBeenCalled();
    expect(h.section.innerHTML).toMatch(/class="ho-results-summary"[^>]*tabindex="-1"/);

    h.click('data-ho-offset',{hoOffset:'48'});await h.flush();
    expectPage(h.section.innerHTML,5,10,'49–60 / 120개',[1,4,5,6,10]);
    expect(h.detailPane.innerHTML).toContain('복지사업 049');
    expect(h.selectionButtons.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.hoSelectProgram)).toEqual(['page-item-49']);
    expect(h.section.innerHTML).toContain('복지사업 049');expect(h.section.innerHTML).toContain('복지사업 060');
    expect(h.section.innerHTML).not.toContain('복지사업 001');
    expect(h.results.scrollIntoView).toHaveBeenLastCalledWith({block:'start'});
    expect(h.summary.focus).toHaveBeenLastCalledWith({preventScroll:true});

    h.click('data-ho-offset',{hoOffset:'108'});await h.flush();
    const last=expectPage(h.section.innerHTML,10,10,'109–120 / 120개',[1,8,9,10]);
    expect(last[0]).toMatch(/<button\b[^>]*disabled[^>]*>다음<\/button>/);
    expect(h.section.innerHTML).toContain('복지사업 120');expect(h.section.innerHTML).not.toContain('복지사업 049');
    const query=new URL(h.fetch.mock.calls[2][0],'https://test.local').searchParams;
    expect(query.get('offset')).toBe('108');expect(query.get('limit')).toBe('12');
  });
  it('disables movement for empty and single-page results without offering invalid pages',async()=>{
    const empty=welfareHarness(pagedCatalog(0));await empty.view.show('welfare-list');
    const emptyControls=expectPage(empty.section.innerHTML,0,0,'0 / 0개',[]);
    expect(empty.section.innerHTML).toContain('조건에 맞는 사업이 없어요.');
    const single=welfareHarness(pagedCatalog(3));await single.view.show('welfare-list');
    const singleControls=expectPage(single.section.innerHTML,1,1,'1–3 / 3개',[1]);
    for(const control of [...emptyControls,...singleControls]) {
      expect(control).toMatch(/<button\b[^>]*disabled[^>]*>이전<\/button>/);
      expect(control).toMatch(/<button\b[^>]*disabled[^>]*>다음<\/button>/);
      expect(control).not.toContain('ho-pagination-ellipsis');
    }
  });
  it('resets a later page to the beginning when new filters are applied',async()=>{
    const h=welfareHarness(pagedCatalog(120));await h.view.show('welfare-list');
    h.click('data-ho-offset',{hoOffset:'48'});await h.flush();
    h.change('category_id','social');h.submit('주민 모임');await h.flush();
    const query=new URL(h.fetch.mock.calls[2][0],'https://test.local').searchParams;
    expect(Object.fromEntries(query)).toMatchObject({offset:'0',limit:'12',category_id:'social',q:'주민 모임'});
    expectPage(h.section.innerHTML,1,10,'1–12 / 120개',[1,2,3,10]);
  });
});

describe('Welfare explicit region selection',()=>{
  it('always shows the three region selectors with 전체 defaults and no separate scope mode',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    const regionControls=h.section.innerHTML.split('class="ho-welfare-region-controls"')[1].split('</div>')[0];
    expect(regionControls.match(/<select /g)).toHaveLength(3);
    for(const name of ['province_code','district_code','region_code']) {
      const select=regionControls.split(`name="${name}"`)[1].split('</select>')[0];
      expect(select).toContain('<option value="" selected>전체</option>');
    }
    expect(regionControls).not.toContain('name="region_level"');
    expect(regionControls.split('name="region_code"')[1]).toContain('disabled');
    const query=new URL(h.fetch.mock.calls[0][0],'https://test.local').searchParams;
    expect(query.has('region_level')).toBe(false);expect(query.has('region_code')).toBe(false);
  });
  it('offers a city’s descendant dongs with their gu labels using exact ancestor links',async()=>{
    const fixture=catalogFixture();
    fixture.available_regions=[
      {code:'41110',name:'경기도 수원시',level:'sgg',parent_code:'41',province_code:'41',province_name:'경기도'},
      {code:'41111',name:'경기도 수원시 장안구',level:'sgg',parent_code:'41110',province_code:'41',province_name:'경기도'},
      {code:'4111156000',name:'경기도 수원시 장안구 영화동',level:'administrative_dong',parent_code:'41111',ancestor_codes:['41111','41110'],province_code:'41',province_name:'경기도'},
      {code:'4111756000',name:'다른 시 다른동',level:'administrative_dong',parent_code:'41117',ancestor_codes:['41117'],province_code:'41',province_name:'경기도'},
    ];
    const h=welfareHarness(async()=>fixture);await h.view.show('welfare-list');
    h.change('district_code','41110');
    const dongControl=h.toolbar.innerHTML.split('name="region_code"')[1].split('</select>')[0];
    expect(dongControl).toContain('>장안구 영화동</option>');expect(dongControl).not.toContain('다른동');
    h.change('region_code','4111156000');h.submit();await h.flush();
    expect(new URL(h.fetch.mock.calls[1][0],'https://test.local').searchParams.get('region_code')).toBe('4111156000');
    expect(h.section.innerHTML).toContain('<b>경기도</b><b>수원시 장안구</b><b>영화동</b>');
  });
  it('displays fully qualified facet names once in dropdowns and as separate region chips',async()=>{
    const fixture=catalogFixture();
    fixture.regions[0].name='서울특별시 광진구';fixture.regions[1].name='서울특별시 광진구 화양동';
    const h=welfareHarness(async()=>fixture);await h.view.show('welfare-list');
    h.change('province_code','');
    expect(h.toolbar.innerHTML).toContain('>서울특별시 광진구</option>');
    expect(h.toolbar.innerHTML).not.toContain('서울특별시 서울특별시');
    h.change('province_code','11');h.change('district_code','11215');
    expect(h.toolbar.innerHTML).toContain('>광진구</option>');
    expect(h.toolbar.innerHTML).toContain('>화양동</option>');
    h.change('region_code','1121571000');h.submit();await h.flush();
    expect(h.section.innerHTML).toContain('<b>서울특별시</b><b>광진구</b><b>화양동</b>');
    expect(fixture.regions[1].name).toBe('서울특별시 광진구 화양동');
  });
  it('uses the full available-region tree even when legacy facets contain districts only',async()=>{
    const fixture=catalogFixture();fixture.available_regions=fixture.regions;fixture.regions=fixture.regions.filter((region:Catalog)=>region.level==='sgg');
    fixture.programs[0].region_match_label='선택한 시군구';
    const h=welfareHarness(async()=>fixture);await h.view.show('welfare-list');
    h.change('district_code','11215');
    expect(h.toolbar.innerHTML).toContain('화양동');
    expect(h.section.innerHTML).toContain('선택한 시군구');
  });
  it('stages region, category and text edits and applies them together only on selection',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.section.innerHTML).toContain('<b>전체</b>');
    h.change('province_code','11');h.change('district_code','11215');
    h.change('category_id','social');h.input('모임');
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.submit('  모임  ');await h.flush();
    const query=new URL(h.fetch.mock.calls[1][0],'https://test.local').searchParams;
    expect(Object.fromEntries(query)).toMatchObject({region_level:'sgg',region_code:'11215',category_id:'social',q:'모임',offset:'0'});
    expect(h.section.innerHTML).toContain('<b>서울특별시</b><b>광진구</b>');
    expect(h.section.innerHTML).toContain('선택한 시군구 → 소속 읍면동 → 전국 순');
    expect(h.section.innerHTML).toContain('<dt>등록 출처</dt><dd class="ho-source-text">공공 자료 제공처</dd>');
    expect(h.section.innerHTML).toContain('<dt>신청 기간</dt><dd class="ho-source-text">상시 신청</dd>');
  });
  it('offers only the chosen district’s dongs and sends the exact dong selection',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    h.change('district_code','11215');
    const dongControl=h.toolbar.innerHTML.split('name="region_code"')[1].split('</select>')[0];
    expect(dongControl).toContain('화양동');expect(dongControl).not.toContain('신사동');
    h.submit();await h.flush();
    const districtQuery=new URL(h.fetch.mock.calls[1][0],'https://test.local').searchParams;
    expect(districtQuery.get('region_level')).toBe('sgg');expect(districtQuery.get('region_code')).toBe('11215');
    h.change('region_code','1121571000');h.submit();await h.flush();
    const query=new URL(h.fetch.mock.calls[2][0],'https://test.local').searchParams;
    expect(query.get('region_level')).toBe('administrative_dong');expect(query.get('region_code')).toBe('1121571000');
    expect(h.section.innerHTML).toContain('<b>서울특별시</b><b>광진구</b><b>화양동</b>');
    expect(h.section.innerHTML).toContain('선택한 읍면동 → 상위 시군구 → 전국 순');
  });
  it('allows province-only search and clears its district and dong when the province changes',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    h.change('district_code','11215');h.change('region_code','1121571000');
    h.change('province_code','11');h.submit();await h.flush();
    const query=new URL(h.fetch.mock.calls[1][0],'https://test.local').searchParams;
    expect(query.get('region_level')).toBe('sido');expect(query.get('region_code')).toBe('11');
    expect(h.section.innerHTML).toContain('<b>서울특별시</b>');
    expect(h.section.innerHTML).toContain('선택한 시도 → 소속 시군구·읍면동 → 전국 순');
    expect(h.section.innerHTML).not.toContain('value="11215" selected');
    expect(h.section.innerHTML).not.toContain('value="1121571000" selected');
    h.change('province_code','');h.submit();await h.flush();
    expect(h.section.innerHTML).toContain('<b>전체</b>');expect(h.fetch).toHaveBeenCalledTimes(2);
  });
  it('paginates with applied filters while retaining pending draft edits',async()=>{
    const h=welfareHarness();await h.view.show('welfare-list');
    h.change('category_id','social');h.submit('적용한 검색');await h.flush();
    h.change('category_id','income');h.input('아직 적용 전');
    h.click('data-ho-offset',{hoOffset:'12'});await h.flush();
    const query=new URL(h.fetch.mock.calls[2][0],'https://test.local').searchParams;
    expect(query.get('category_id')).toBe('social');expect(query.get('q')).toBe('적용한 검색');expect(query.get('offset')).toBe('12');
    expect(h.section.innerHTML).toContain('value="아직 적용 전"');
    expect(h.section.innerHTML).toContain('value="income" selected');
    h.click('data-ho-reset-filters');await h.flush();
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.section.innerHTML).not.toContain('아직 적용 전');expect(h.section.innerHTML).not.toContain('value="income" selected');
    h.click('data-ho-offset',{hoOffset:'12'});await h.flush();
    const reset=new URL(h.fetch.mock.calls[3][0],'https://test.local').searchParams;
    expect([...reset.keys()]).toEqual(['offset','limit','view']);expect(reset.get('view')).toBe('browser');
  });
  it('keeps selection controls and pending edits available after a request failure',async()=>{
    let fail=false;const h=welfareHarness(async()=>{if(fail)throw new Error('일시적인 연결 오류');return catalogFixture();});
    await h.view.show('welfare-list');fail=true;
    h.change('district_code','11215');h.submit('주민');await h.flush();
    expect(h.section.innerHTML).toContain('일시적인 연결 오류');expect(h.section.innerHTML).toContain('id="ho-welfare-search"');
    expect(h.section.innerHTML).toContain('value="주민"');expect(h.section.innerHTML).toContain('value="11215" selected');
    expect(h.section.innerHTML).toContain('<b>광진구</b>');
  });
  it('ignores an older response and preserves edits made while a request is in flight',async()=>{
    let resolveOld:(result:Catalog)=>void=()=>{};
    const h=welfareHarness(async url=>new URL(url,'https://test.local').searchParams.get('q')==='오래된 검색'?new Promise(resolve=>{resolveOld=resolve;}):catalogFixture());
    await h.view.show('welfare-list');h.submit('오래된 검색');await h.flush();
    h.submit('새 검색');await h.flush();h.input('다음 검색 초안');
    const older=catalogFixture();older.programs[0].title='오래된 사업';resolveOld(older);await h.flush();
    expect(h.section.innerHTML).toContain('관계 지원사업');expect(h.section.innerHTML).not.toContain('오래된 사업');
    h.click('data-ho-offset',{hoOffset:'12'});await h.flush();
    expect(new URL(h.fetch.mock.calls[3][0],'https://test.local').searchParams.get('q')).toBe('새 검색');
    expect(h.section.innerHTML).toContain('value="다음 검색 초안"');
  });
  it('renders source-backed eligibility and dates without undefined formatter errors or raw HTML',async()=>{
    const fixture=catalogFixture();Object.assign(fixture.programs[0],{
      target_text:'이웃과 교류하려는 주민',selection_text:'담당기관 확인',application_text:'기관 방문 신청',
      conditions:[{kind:'income',operator:'<=',value:{basis:'중위소득',percent:100},review_status:'source_structured'},
        {kind:'program_period',value:{start:'2026-01-01',end:'2026-12-31'}}],
      official_categories_raw:{aplyMtdNm:'방문 <확인>'},source_retrieved_at:'2026-10-25T01:00:00Z',
    });
    const h=welfareHarness(async()=>fixture);await h.view.show('welfare-list');
    expect(()=>h.click('',{hoProgram:'v1'})).not.toThrow();
    expect(h.dialog.showModal).toHaveBeenCalledOnce();
    expect(h.dialog.innerHTML).toContain('중위소득 100% 이하');expect(h.dialog.innerHTML).toContain('이웃과 교류하려는 주민');
    expect(h.dialog.innerHTML).toContain('사업 시행기간');expect(h.dialog.innerHTML).toContain('상시 신청');
    expect(h.dialog.innerHTML).toContain('방문 &lt;확인&gt;');expect(h.dialog.innerHTML).not.toContain('<확인>');
    expect(h.dialog.innerHTML).toContain('자료 수집 시각');
  });
});
