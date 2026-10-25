/* Nationwide overview and the complete published welfare catalog. */
const HermiOverviewData = (() => {
  const domains = { E: '경제생활의 어려움', P: '모임·단체 참여 부족', O: '드문 외출', C: '가족·주변 사람과 교류 부족', U: '도움을 부탁할 관계 부족' };
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  function nonOverlapping(rows) {
    return rows.filter(row => !rows.some(parent => parent !== row && parent.area_code.slice(0, 2) === row.area_code.slice(0, 2)
      && row.area_name.startsWith(parent.area_name + ' ')));
  }
  function aggregate(rows) {
    const distinct = rows.every(row=>row.spatial_unit==='administrative_dong') ? rows : nonOverlapping(rows);
    const completePopulation = distinct.every(row => finite(row.population_20plus) && Number(row.population_20plus) >= 0);
    const usable = distinct.filter(row => finite(row.population_20plus) && Number(row.population_20plus) > 0);
    const denominator = usable.reduce((sum, row) => sum + Number(row.population_20plus), 0);
    const weighted = field => completePopulation && denominator && usable.every(row => finite(field(row)))
      ? usable.reduce((sum, row) => sum + Number(field(row)) * Number(row.population_20plus), 0) / denominator : null;
    return {
      count: rows.length, distinctCount: distinct.length,
      population_20plus: completePopulation ? denominator : null,
      population_total: distinct.every(row => finite(row.population_total)) ? distinct.reduce((sum, row) => sum + Number(row.population_total), 0) : null,
      i5_reference: weighted(row => row.i5_reference),
      domain_scores: Object.fromEntries(Object.keys(domains).map(key => [key, weighted(row => row.domain_scores?.[key])])),
    };
  }
  async function readAll(fetchPage) {
    const seen = new Set();
    const records = [];
    let offset = 0, run = null;
    while (true) {
      if (seen.has(offset)) throw new Error('자료를 모두 불러오지 못했어요. 다시 시도해 주세요.');
      seen.add(offset);
      const result = await fetchPage(offset);
      if (run !== null && run !== result.run_id) throw new Error('조회 중 자료가 갱신됐어요. 다시 불러와 주세요.');
      run = result.run_id;
      if (!Array.isArray(result.records)) throw new Error('지역 자료 형식을 확인해 주세요.');
      records.push(...result.records);
      if (result.next_offset == null) return records;
      offset = result.next_offset;
    }
  }
  function welfareLabels(meta = {}) {
    return { date: meta.date_basis === 'application' ? '신청 기간' : '운영 기간',
      region: meta.region_basis === 'administering_jurisdiction' ? '담당 지역' : '지원 지역',
      category: meta.classification_basis === 'internal_tags' ? '자료 분류' : '지원 분야' };
  }
  function periodLabel(status, meta = {}) {
    const labels = meta.date_basis === 'application'
      ? { ongoing: '등록 신청 기간 내', upcoming: '등록 신청 시작 전', ended: '등록 신청 기간 종료',
          always: '상시 신청', varies: '기관별 일정 상이', announced: '신청 일정 안내', not_required: '별도 신청 없음', unknown: '신청 기간 미기재' }
      : { ongoing: '운영 기간 내', upcoming: '시작 예정', ended: '기간 종료', unknown: '기간 확인 필요' };
    return labels[status] || labels.unknown;
  }
  function periodText(program = {}) {
    if (program.date_basis === 'application' && typeof program.application_period_text === 'string' && program.application_period_text.trim()) {
      return program.application_period_text;
    }
    const start = program.start_date, end = program.end_date;
    if (start && end) return `${start} ~ ${end}`;
    if (start) return `${start}부터`;
    if (end) return `${end}까지`;
    return program.date_basis === 'application' ? '등록된 신청 기간 정보 없음' : '등록된 운영 기간 정보 없음';
  }
  const meaningful = value => value !== null && value !== undefined && value !== '';
  const normalizedText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const conditionNames = {age:'기간·연령 표현',sex:'성별',personal_eligibility:'개별 자격',income:'소득',household:'가구',residence:'거주 요건',personal_status:'개인 상황',target_group:'대상 구분',business_status:'사업 상태',business_type:'사업 유형',corporation_type:'법인 유형',corporation_industry:'법인 업종',unstructured_text:'기타 원문 조건'};
  const valueNames = {text:'원문',target_text:'지원 대상',selection_text:'선정 기준',application_text:'신청 안내',basis:'기준',percent:'비율',min:'하한',max:'상한',start:'시작일',end:'종료일',meaning:'자료 의미',description:'설명',value:'값',unit:'단위',name:'명칭',label:'분류',labels:'분류',note:'안내'};
  const operationalKeys = new Set(['code_system','codes','unmarked_codes','field','fields','source_field','evidence_id','rule_id','program_version_id','logic_group','raw_start','raw_end']);
  function readableValue(value) {
    if (!meaningful(value)) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '해당' : '해당 없음';
    if (Array.isArray(value)) return value.map(readableValue).filter(Boolean).join(' · ');
    if (typeof value !== 'object') return '';
    if (Array.isArray(value.labels) && value.labels.length) return readableValue(value.labels);
    if (Array.isArray(value.groups) && value.groups.length) return readableValue(value.groups);
    if (Array.isArray(value.expressions)) {
      const expressions = [...new Set(value.expressions.map(item => item?.text).filter(text => typeof text === 'string' && text.trim()))];
      if (expressions.length) return expressions.join(' · ');
    }
    if (typeof value.text === 'string' && value.text.trim()) return value.text;
    const entries = Object.entries(value).filter(([key,item]) => !operationalKeys.has(key) && meaningful(item))
      .map(([key,item]) => [valueNames[key] || key.replace(/_/g,' '),readableValue(item)]).filter(([,text]) => text);
    return entries.map(([key,text]) => `${key}: ${text}`).join(' / ');
  }
  function regionDetails(regions = []) {
    const matched = [], original = [];
    for (const region of regions) {
      const sourceText = readableValue(region.original_region_text);
      if (sourceText) original.push(sourceText);
      if (region.name) matched.push(region.name);
      else if (region.scope_type === 'nationwide') matched.push('전국');
      else if (sourceText) matched.push(`${sourceText} (지역 연결 전)`);
      else if (region.code) matched.push(`${region.code} (지역명 미기재)`);
      else matched.push('등록된 지역 정보 없음');
    }
    return {matched:[...new Set(matched)].join(', ') || '등록된 지역 정보 없음',original:[...new Set(original)].join(', ')};
  }
  function ageLabel(program) {
    if (program.age_status === 'complex') return '원문 기준 확인';
    if (program.age_status === 'unrestricted') return '연령 제한 없음(자료 표기)';
    if (program.age_status === 'bounded') {
      if (finite(program.min_age) && finite(program.max_age)) return `${program.min_age}~${program.max_age}세`;
      if (finite(program.min_age)) return `${program.min_age}세 이상`;
      if (finite(program.max_age)) return `${program.max_age}세 이하`;
    }
    return '연령 범위 미기재';
  }
  const genderLabel = value => ({all:'성별 제한 없음(자료 표기)',male:'남성',female:'여성',unknown:'성별 구분 미기재'}[value] || readableValue(value));
  const reviewLabel = value => ({source_structured:'원자료 항목',auto_extracted:'자동 추출 · 검토 필요',auto_assigned:'자동 분류',auto_confirmed:'자동 기준 일치',needs_review:'검토 필요',approved:'검토됨',rejected:'검토 제외'}[value] || (value ? '기타 검토 상태' : '검토 상태 미기재'));
  function conditionValue(condition) {
    const value = condition.value;
    if (condition.kind === 'income' && value && typeof value === 'object' && !Array.isArray(value) && finite(value.percent)) {
      const comparison = {'<':'미만','<=':'이하','>':'초과','>=':'이상','=':'기준'}[condition.operator];
      return `${readableValue(value.basis) || '소득 기준'} ${value.percent}%${comparison ? ' '+comparison : ''}`;
    }
    if (condition.kind === 'age' && Array.isArray(value) && value.length === 2 && value.every(finite)) return `${value[0]}~${value[1]}세`;
    if (condition.kind === 'sex') return genderLabel(value);
    return readableValue(value) || '읽을 수 있는 조건 문구가 등록되지 않았습니다.';
  }
  function conditionRows(program) {
    const originals = [program.target_text,program.selection_text,program.application_text].map(normalizedText).filter(Boolean);
    return (program.conditions || []).filter(condition => condition.kind !== 'program_period').map(condition => {
      let value = condition.value;
      if (condition.kind === 'unstructured_text') {
        // A fields list references the full sections above; it is not itself a condition.
        const referenced = Array.isArray(value?.fields) ? value.fields.map(key => program[key]).filter(meaningful) : [];
        const repeated = [...originals,normalizedText(referenced.join('\n')),normalizedText([program.target_text,program.selection_text].filter(meaningful).join('\n'))].filter(Boolean);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          value = Object.fromEntries(Object.entries(value).filter(([key,item]) => !operationalKeys.has(key) && !originals.includes(normalizedText(item))));
        } else if (originals.includes(normalizedText(value))) return null;
        if (!readableValue(value)) {
          if (!condition.source_quote || repeated.includes(normalizedText(condition.source_quote))) return null;
          value = condition.source_quote;
        }
      }
      const text = conditionValue({...condition,value});
      return {label:conditionNames[condition.kind] || condition.kind || '기타 조건',text,
        review:reviewLabel(condition.review_status),source_quote:condition.source_quote || '',
        needs_original:condition.logic_group?.semantics === 'unspecified_by_source' || condition.logic_group?.combine === 'unspecified'};
    }).filter(Boolean);
  }
  function businessPeriods(program) {
    return (program.conditions || []).filter(condition => condition.kind === 'program_period').map(condition => {
      const value = condition.value || {};
      if (typeof value !== 'object' || Array.isArray(value)) return readableValue(value);
      const start = value.start, end = value.end;
      const range = start && end ? `${start} ~ ${end}` : start ? `${start}부터 · 종료일 미기재` : end ? `${end}까지 · 시작일 미기재` : '등록된 시행기간 날짜 없음';
      return `${range}${value.meaning ? ' · '+value.meaning : ' · 신청기간과 구분'}${value.raw_end === '99991231' ? ' (원자료의 종료일은 미지정 값)' : ''}`;
    }).filter(Boolean);
  }
  function sourceDateText(value) {
    const text = String(value ?? '');
    if (/^\d{8}$/.test(text)) return `${text.slice(0,4)}-${text.slice(4,6)}-${text.slice(6,8)}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    return text && Number.isFinite(date.getTime()) ? date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) + ' (한국시간)' : text;
  }
  function officialMetadata(program) {
    const raw = program.official_categories_raw;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return readableValue(raw) ? [{label:'원자료 분류',text:readableValue(raw)}] : [];
    const names = {aplyMtdNm:'신청 방법',sprtCycNm:'지원 주기',srvPvsnNm:'제공 방식',lastModYmd:'원자료 수정일',svcfrstRegTs:'원자료 최초 등록일',crtrYr:'자료 기준연도',onapPsbltYn:'원문 포털 온라인 신청',intrsThemaNmArray:'원자료 관심분야',intrsThemaArray:'원자료 관심분야',ctpvNm:'원문 시도',sggNm:'원문 시군구·기관',lifeArray:'생애주기 분류',lifeNmArray:'생애주기 분류',trgterIndvdlNmArray:'대상 분류',trgterIndvdlArray:'대상 분류',지원유형:'지원 유형',사용자구분:'이용 대상 구분',서비스분야:'서비스 분야',소관기관유형:'소관기관 유형',소관기관코드:'소관기관 코드'};
    return Object.entries(raw).filter(([key,value]) => !operationalKeys.has(key) && meaningful(value)).map(([key,value]) => {
      let text = readableValue(value);
      if (['lastModYmd','svcfrstRegTs'].includes(key)) text = sourceDateText(text);
      if (key === 'onapPsbltYn') text = ({Y:'지원',N:'미지원'}[text] || text) + ' (다른 신청 경로는 신청 안내 참고)';
      return {label:names[key] || key,text};
    }).filter(row => row.text);
  }
  function reportScopeForRegion(region,month) {
    const code=String(region?.area_code||region?.dong_code||region?.region_code||'');
    return {region_code:code.slice(0,5),month,...(/^\d{10}$/.test(code)?{dong_code:code}:{}),
      region_name:[region?.region_name,region?.area_name].filter((name,index,array)=>name&&array.indexOf(name)===index).join(' ')};
  }
  function programForResponse(program) {
    let url=null;
    try {const parsed=new URL(program.source_url||program.url);if(/^https?:$/.test(parsed.protocol)&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}
    return {program_version_id:String(program.version_id||program.program_version_id||''),title:String(program.title||'선택한 사업'),url,
      publisher:program.institution||program.source?.name||null,summary:program.support_content||program.summary||'',target:program.target_text||''};
  }
  function pathFrame(path) {
    const points = [...String(path).matchAll(/(-?\d+(?:\.\d+)?)[, ]+(-?\d+(?:\.\d+)?)/g)].map(match => [+match[1], +match[2]]);
    if (!points.length) return {viewBox:'135 10 325 535',x:300,y:260};
    const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const width=Math.max(12,right-left),height=Math.max(12,bottom-top),padding=Math.max(width,height)*.12;
    return {viewBox:[left-padding,top-padding,width+padding*2,height+padding*2].join(' '),x:(left+right)/2,y:(top+bottom)/2};
  }
  function projectDistricts(features) {
    const rings = feature => feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(const feature of features) for(const ring of rings(feature)) for(const [x,y] of ring) {
      if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y);
    }
    if(!Number.isFinite(left))return [];
    const cx=(left+right)/2,cy=(bottom+top)/2,longitudeScale=Math.cos(cy*Math.PI/180);
    const scale=Math.min(560/Math.max(.0001,(right-left)*longitudeScale),390/Math.max(.0001,top-bottom));
    const point=([x,y])=>[320+(x-cx)*longitudeScale*scale,230-(y-cy)*scale];
    return features.map(feature=>{
      const coordinates=rings(feature),all=coordinates.flat();
      const center=feature.properties.label || [(Math.min(...all.map(p=>p[0]))+Math.max(...all.map(p=>p[0])))/2,(Math.min(...all.map(p=>p[1]))+Math.max(...all.map(p=>p[1])))/2];
      const [x,y]=point(center);
      return {...feature.properties,x,y,d:coordinates.map(ring=>ring.map((coordinate,index)=>`${index?'L':'M'}${point(coordinate).map(value=>value.toFixed(2)).join(',')}`).join('')+'Z').join('')};
    });
  }
  return { domains, finite, nonOverlapping, aggregate, readAll, welfareLabels, periodLabel, periodText,
    readableValue, regionDetails, ageLabel, genderLabel, reviewLabel, conditionRows, businessPeriods, officialMetadata, sourceDateText, reportScopeForRegion, programForResponse, pathFrame, projectDistricts };

})();

window.HERMI_OVERVIEW = (() => {
  'use strict';
  const D = HermiOverviewData;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (value, digits = 2) => D.finite(value) ? Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
  const monthLabel = value => `${value.slice(0, 4)}년 ${Number(value.slice(4))}월`;
  const colors = ['#e5f0fc', '#b9d7f7', '#7eb3ed', '#438bdb', '#195ba9'];
  const requestedMonth = new URLSearchParams(location.search).get('month');
  const welfarePageSize = 12;
  const welfareCacheTTL = 60_000, welfareCacheLimit = 20;
  const welfareCache = new Map(), welfareRequests = new Map();
  const activityCache = new Map(), activityRequests = new Map();
  const welfareChats = new Map(), welfareChatDrafts = new Map(), welfareChatErrors = new Map(), welfareChatRetries = new Map();
  let welfareRegionOptions = null, welfareRegionsLoadedAt = 0, welfareRegionRequest = null, welfareRegionError = '';
  const emptyWelfareFilter = () => ({q:'',region_level:'',province_code:'',district_code:'',region_code:'',category_id:'',status:''});
  const state = { page: null, month: /^\d{6}$/.test(requestedMonth || '') ? requestedMonth : '202512', province: '', district: '', region: '', search: '', rows: [], catalog: null, reference: {}, loadedMonth: null,
    boundaries: null, boundaryError: '',
    activityRecords: [], activityMonth: null, activityError: '', activityLoading: false,
    welfare: { ...emptyWelfareFilter(), draft:emptyWelfareFilter(), offset: 0, result: null, selectedId: null, chatOpen: false } };
  let root, serial = 0, activitySerial = 0, boundaryRequest;
  const panel = () => root.querySelector(`[data-overview-page="${state.page}"]`);
  const loading = text => `<div class="ho-loading" role="status"><span></span>${text}</div>`;
  const error = message => `<div class="ho-error" role="alert"><h2>자료를 불러오지 못했어요.</h2><p>${esc(message)}</p><button type="button" class="btn primary" data-ho-retry>다시 불러오기</button></div>`;
  async function api(path) {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      let message = '잠시 후 다시 시도해 주세요.';
      try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : data.detail?.message || message; } catch {}
      throw new Error(message);
    }
    return response.json();
  }
  function welfarePage(path, force) {
    const saved = welfareCache.get(path);
    if (!force && saved && Date.now() - saved.storedAt < welfareCacheTTL) {
      welfareCache.delete(path); welfareCache.set(path, saved);
      return {cached:true,request:Promise.resolve(saved.result)};
    }
    welfareCache.delete(path);
    let request = welfareRequests.get(path);
    if (!request) {
      request = api(path).then(result => {
        welfareCache.delete(path);
        welfareCache.set(path,{result,storedAt:Date.now()});
        while (welfareCache.size > welfareCacheLimit) welfareCache.delete(welfareCache.keys().next().value);
        return result;
      }).finally(() => welfareRequests.delete(path));
      welfareRequests.set(path,request);
    }
    return {cached:false,request};
  }
  function header(title, subtitle, controls = '') {
    return `<div class="ho-page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="ho-actions">${controls}</div></div>`;
  }
  const monthSelect = () => `<label>자료 기준월<select data-ho-month>${(state.catalog?.months || ['202507','202508','202509','202510','202511','202512']).map(month => `<option value="${month}" ${state.month === month ? 'selected' : ''}>${monthLabel(month)}</option>`).join('')}</select></label>`;
  function provinceName(code) {
    return state.catalog?.regions.find(region => region.province_code === code)?.province_name || '';
  }
  const parentCode = row => row?.region_code || String(row?.area_code||'').slice(0,5);
  const districtName = code => state.catalog?.regions.find(row=>row.code===code)?.name || state.rows.find(row=>parentCode(row)===code)?.region_name || '';
  const scopedRows = () => state.rows.filter(row=>(!state.province||row.area_code.startsWith(state.province))&&(!state.district||parentCode(row)===state.district));
  function filteredRows() {
    return scopedRows().filter(row=>!state.search||`${provinceName(row.area_code.slice(0,2))} ${row.region_name||districtName(parentCode(row))} ${row.area_name}`.includes(state.search));
  }
  const i5Color = value => !D.finite(value)?'#edf0f3':colors[Number(value)<30?0:Number(value)<33?1:Number(value)<35?2:Number(value)<37?3:4];
  const selectedActivity = () => activitySummary(state.region || state.district || state.province, !state.region&&!state.district&&!!state.province);

  const activityCategories = {
    priority_review:{label:'우선 검토 후보',color:'#f3c87b'}, joint_decline:{label:'동시 감소 관찰',color:'#f8dfac'},
    single_source_decline:{label:'단일 감소 관찰',color:'#b9d7f7'}, assessment_hold:{label:'판정 보류',color:'#dcd4eb'},
    no_threshold_decline:{label:'기준 이상 감소 미포착',color:'#e4edf5'}, unavailable:{label:'활동 자료 없음',color:'#edf0f3'},
  };
  const categoryOrder = Object.keys(activityCategories);
  const categoryRank = value => categoryOrder.indexOf(value) < 0 ? 99 : categoryOrder.indexOf(value);
  const plain = value => String(window.HERMI_COPY?.text ? window.HERMI_COPY.text(value) : value ?? '').replace(/원자료 자료 확인 필요/g,'원자료 확인 필요');
  function activitySummary(code = '', prefix = false) {
    if(/^\d{10}$/.test(code))code=code.slice(0,5);
    const records = state.activityRecords.filter(item => !code || (prefix ? item.behavior.key.region_code.startsWith(code) : item.behavior.key.region_code === code));
    const counts = Object.fromEntries(categoryOrder.slice(0,5).map(key => [key,0]));
    if (state.activityError) return {category:'error',label:'조회 실패',records:[],counts,total:0,count:0};
    if (state.activityLoading || state.activityMonth !== state.month) return {category:'loading',label:'불러오는 중',records:[],counts,total:0,count:0};
    for (const item of records) counts[item.activity_assessment.category]++;
    const first = [...records].sort((a,b) => categoryRank(a.activity_assessment.category) - categoryRank(b.activity_assessment.category))[0];
    const category = first?.activity_assessment.category || 'unavailable';
    return {category,label:first?.activity_assessment.category_label || activityCategories.unavailable.label,records,counts,total:records.length,count:counts[category] || 0};
  }
  function categoryBadge(summary) {
    return `<strong class="ho-category-badge ho-category-${summary.category}">${esc(summary.label)}</strong>`;
  }
  function provinceMap() {
    const groups=Object.entries(PROVINCE_PREFIX).filter(([,code])=>!state.province||code===state.province)
      .map(([name,code])=>({name,code,reference:D.aggregate(state.rows.filter(row=>row.area_code.startsWith(code))).i5_reference}));
    const visibleRows=scopedRows(),byCode=new Map(visibleRows.map(row=>[row.area_code,row]));
    const shapes=state.province?(state.boundaries||[]).filter(feature=>byCode.has(feature.properties.code)&&(!state.region||feature.properties.code===state.region)):[];
    const dongs=D.projectDistricts(shapes);
    let map;
    if(dongs.length) {
      const paths=dongs.map(({code,name,region_name,d})=>{
        const row=byCode.get(code),label=`${region_name||row.region_name||''} ${name} · I5 ${number(row.i5_reference)} · 행정동 상세 보기`;
        return `<path class="ho-map-region ${state.region===code?'active':''}" d="${d}" fill-rule="evenodd" fill="${i5Color(row.i5_reference)}" role="button" tabindex="0" data-ho-region="${esc(code)}" aria-label="${esc(label)}" aria-pressed="${state.region===code}"><title>${esc(label)}</title></path>`;
      }).join('');
      const labels=dongs.length<=35?dongs.map(({code,name,x,y})=>`<text class="ho-district-label ${state.region===code?'active':''}" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${esc(name)}</text>`).join(''):'';
      const name=state.rows.find(row=>row.area_code===state.region)?.area_name||districtName(state.district)||provinceName(state.province);
      map=`<svg class="ho-map ho-district-map ho-dong-map" viewBox="0 0 640 460" role="group" aria-label="${esc(name)} 행정동 지도">${paths}${labels}</svg>`;
    } else if(state.region) {
      map=`<div class="ho-map ho-boundary-empty" role="status"><h3>이 행정동의 지도 경계는 준비 중이에요.</h3><p>선택한 동의 I5와 인구구성은 오른쪽에서 확인할 수 있어요.</p>${state.boundaryError?'<button type="button" class="btn" data-ho-retry-map>경계 다시 불러오기</button>':''}</div>`;
    } else {
      const viewBox=state.province?D.pathFrame(provPaths[groups[0]?.name]).viewBox:'135 10 325 535';
      const paths=groups.map(({name,code,reference})=>`<path class="ho-map-region" d="${provPaths[name]}" fill="${i5Color(reference)}" role="button" tabindex="0" data-ho-province="${code}" aria-label="${esc(name)} · 행정동 지도 열기"><title>${esc(name)} · 행정동 I5 인구가중 참고값 ${number(reference)}</title></path>`).join('');
      const labels=state.province?'':groups.map(({name,code})=>{
        const frame=D.pathFrame(provPaths[name]),position=typeof PROVINCE_MAP!=='undefined'?PROVINCE_MAP.find(item=>item[0]===name):null;
        let x=position?.[1]??frame.x,y=position?.[2]??frame.y;if(code==='11'){x=183;y=96;}if(code==='28'){x=157;y=141;}
        const label=name.replace(/특별자치도|특별자치시|광역시|특별시/g,'');
        return `<g class="ho-province-label ${code==='11'?'ho-seoul-label':''}" role="button" tabindex="0" data-ho-province="${code}" aria-label="${esc(name)} 행정동 지도 열기">${code==='11'?`<path class="ho-map-callout" d="M${x+17},${y+5} L${frame.x},${frame.y}"/>`:''}<rect x="${x-21}" y="${y-11}" width="42" height="22" rx="5"/><text x="${x}" y="${y+4}">${esc(label)}</text></g>`;
      }).join('');
      map=`<svg class="ho-map" viewBox="${viewBox}" role="group" aria-label="전국 행정동 탐색 지도">${paths}${labels}</svg>${state.province?`<p class="ho-map-source" role="status">${state.boundaryError?'행정동 경계를 불러오지 못했어요. 목록에서 동을 선택할 수 있어요.':state.boundaries?'연결된 행정동 경계가 없어요.':'행정동 경계를 불러오고 있어요.'}${state.boundaryError?' <button type="button" data-ho-retry-map>다시 불러오기</button>':''}</p>`:''}`;
    }
    const provided=[...new Set(state.activityRecords.map(item=>item.behavior.key.region_code))].filter(code=>state.rows.some(row=>parentCode(row)===code));
    const shortcuts=!state.province?`<div class="ho-map-shortcuts" aria-label="행정동 바로 탐색">${provided.map(code=>`<button type="button" data-ho-district="${esc(code)}"><span>${esc(provinceName(code.slice(0,2)))}</span><b>${esc(districtName(code))} 행정동</b><span aria-hidden="true">↗</span></button>`).join('')}</div>`:'';
    const boundaryCodes=new Set((state.boundaries||[]).map(feature=>feature.properties.code));
    const missing=state.boundaries&&state.province?visibleRows.filter(row=>!boundaryCodes.has(row.area_code)).length:0;
    return `${shortcuts}${map}${state.province?'<p class="ho-map-source">경계: 통계청 SGIS / <a href="https://github.com/vuski/admdongkor/tree/master/ver20250701" target="_blank" rel="noopener noreferrer">vuski/admdongkor</a> · 2025년 7월 · 단순화 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>':''}<div class="ho-map-legend ho-i5-legend">${colors.map((color,index)=>`<span><i style="background:${color}"></i>${['30 미만','30–33','33–35','35–37','37 이상'][index]}</span>`).join('')}</div>${missing?`<p class="ho-map-caption">경계 미연결 ${missing}개 동·출장소는 목록에서 조회할 수 있어요.</p>`:''}`;
  }
  function districtSelect() {
    if(!state.province)return '';
    const districts=(state.catalog?.regions||[]).filter(row=>row.province_code===state.province&&state.rows.some(dong=>parentCode(dong)===row.code));
    return `<label class="ho-district-filter">행정동 탐색 범위<select data-ho-district-filter><option value="">${esc(provinceName(state.province))} 전체 행정동</option>${districts.map(row=>`<option value="${esc(row.code)}" ${state.district===row.code?'selected':''}>${esc(row.name)} 소속 행정동</option>`).join('')}</select></label>`;
  }
  function mapNavigation() {
    return `<nav class="ho-map-navigation" aria-label="지도 탐색 경로"><button type="button" data-ho-province="" ${!state.province?'aria-current="location"':''}>전국</button>${state.province?`<span aria-hidden="true">›</span><button type="button" data-ho-province="${esc(state.province)}" ${!state.district?'aria-current="location"':''}>${esc(provinceName(state.province))}</button>`:''}${state.district?`<span aria-hidden="true">›</span><button type="button" data-ho-district="${esc(state.district)}" ${!state.region?'aria-current="location"':''}>${esc(districtName(state.district))}</button>`:''}${state.region?`<span aria-hidden="true">›</span><span aria-current="location">${esc(state.rows.find(row=>row.area_code===state.region)?.area_name)}</span>`:''}</nav>`;
  }
  async function loadDashboardMap({force=false}={}) {
    if(state.boundaries&&!force)return;
    if(!boundaryRequest) {
      state.boundaryError='';
      boundaryRequest=api('hermes/dashboard-dongs.geojson').then(data=>{
        if(!Array.isArray(data.features)||!data.features.length)throw Error('상세 경계를 확인할 수 없어요.');
        state.boundaries=data.features.filter(feature=>/^\d{10}$/.test(feature.properties?.code)
          && feature.properties.province_code===feature.properties.code.slice(0,2)
          && ['Polygon','MultiPolygon'].includes(feature.geometry?.type));
        if(!state.boundaries.length)throw Error('상세 경계를 확인할 수 없어요.');
      }).catch(cause=>{state.boundaries=null;state.boundaryError=cause.message;})
        .finally(()=>{boundaryRequest=null;refreshActivity();});
    }
    return boundaryRequest;
  }
  function regionRows() {
    const rows=filteredRows().sort((a,b)=>(a.region_name||'').localeCompare(b.region_name||'','ko')||a.area_name.localeCompare(b.area_name,'ko'));
    return rows.length?rows.map(row=>`<button type="button" class="ho-region-row ${state.region===row.area_code?'active':''}" data-ho-region="${esc(row.area_code)}" aria-pressed="${state.region===row.area_code}"><span><b>${esc(row.area_name)}</b><small>${esc(provinceName(row.area_code.slice(0,2)))} ${esc(row.region_name||districtName(parentCode(row)))}</small></span><strong class="ho-dong-i5"><small>지역 고립 지수</small>${number(row.i5_reference)}</strong></button>`).join(''):'<div class="ho-empty">검색한 행정동이 없어요.</div>';
  }
  function activityReference(summary,parentName) {
    const active=summary.records.find(item=>item.activity_assessment.category===summary.category);
    const rate=value=>typeof value==='number'&&Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(2)}%`:'비교 불가';
    const ages={'20G':'20대','30G':'30대','40G':'40대','50G':'50대','60GU':'60세 이상'};
    return `<div class="ho-parent-activity"><h3>${esc(parentName)} 활동 참고</h3><p>통신·카드 자료는 상위 시군구 단위로 제공됩니다.</p>${categoryBadge(summary)}${active?`<p>해당 ${summary.count}/${summary.total} 수록집단</p><div class="ho-category-evidence"><b>${esc(active.behavior.region_name)} · ${active.behavior.key.sex_code==='MAN'?'남성':'여성'} ${ages[active.behavior.key.age_code]||''}</b><p>통신 ${rate(active.activity_assessment.sources.skt.change_percent)} · 카드 ${rate(active.activity_assessment.sources.card_a.change_percent)}</p><ul>${active.activity_assessment.reasons.slice(0,2).map(reason=>`<li>${esc(plain(reason))}</li>`).join('')}</ul></div>`:`<p>${summary.category==='error'?esc(state.activityError):summary.category==='loading'?'활동 자료를 불러오고 있어요.':'이 상위 시군구·월의 활동 자료가 없습니다.'}</p>`}<p class="ho-category-note">이 범주를 선택한 행정동의 판정으로 적용하지 않습니다.</p>${summary.category==='error'?'<button type="button" class="btn" data-ho-retry-activity>활동 자료 다시 불러오기</button>':''}</div>`;
  }
  function detail() {
    const row=state.rows.find(item=>item.area_code===state.region);
    if(!row)return `<div class="ho-detail-title"><span>행정동 상세</span><h2>${esc(districtName(state.district)||provinceName(state.province)||'행정동을 선택해 주세요')}</h2></div><p class="ho-score-caption">지도나 목록에서 동을 누르면 해당 동의 I5·인구구성과 상위 시군구 활동을 함께 확인할 수 있어요.</p><div class="ho-detail-actions"><button type="button" class="btn" data-ho-select-guide>행정동 검색하기</button></div>`;
    const domains=Object.entries(D.domains).map(([key,label])=>`<div class="ho-domain-row"><div><span>${esc(label)}</span><strong>${number(row.domain_scores?.[key])}</strong></div><div class="ho-domain-track"><i style="width:${D.finite(row.domain_scores?.[key])?Math.min(100,Math.max(0,Number(row.domain_scores[key]))):0}%"></i></div></div>`).join('');
    return `<div class="ho-detail-title"><span>${esc(provinceName(row.area_code.slice(0,2)))} ${esc(row.region_name||districtName(parentCode(row)))}</span><h2>${esc(row.area_name)}</h2></div><div class="ho-score">${number(row.i5_reference)}<small>/100</small></div><p class="ho-score-caption">지역 고립 지수</p><div class="ho-domains">${domains}</div><p class="ho-domain-key">전국 설문 결과를 이 동의 20세 이상 인구구성으로 가중한 참고값입니다.</p><div class="ho-population"><div><small>전체 인구</small><strong>${number(row.population_total,0)}명</strong></div><div><small>20세 이상 인구</small><strong>${number(row.population_20plus,0)}명</strong></div></div>${activityReference(selectedActivity(),row.region_name||districtName(parentCode(row)))}<div class="ho-detail-actions"><button type="button" class="btn primary" data-ho-ask-region="${esc(row.area_code)}">헤르미와 이 행정동 분석하기</button><button type="button" class="btn" data-ho-dong-welfare="${esc(row.area_code)}">이 행정동의 복지 보기</button><button type="button" class="btn" data-ho-open-reports="${esc(row.area_code)}">이 행정동의 보고서 보기</button></div>`;
  }
  function askRegion(row,purpose='고립 참고점수와 활동 변화를 분석해 줘') {
    if(!row)return;
    const name=`${provinceName(row.area_code.slice(0,2))} ${row.region_name||districtName(parentCode(row))} ${row.area_name}`;
    const scope={region_level:'administrative_dong',region_code:row.area_code,month:state.month,sex_codes:[],age_codes:[]};
    if(!window.HERMES_AGENT?.setStartingScope)throw Error('행정동 분석 연결을 준비하지 못했어요. 화면을 새로고침해 주세요.');
    window.HERMES_AGENT.setStartingScope(scope,name);
    ask(`${name}의 ${monthLabel(state.month)} ${purpose}`);
  }
  async function openRegionReports(code,button) {
    const row=state.rows.find(item=>item.area_code===code);if(!row)return;
    button.disabled=true;
    try {
      if(!window.HERMES_ANALYSIS_REPORTS?.openLibrary)throw Error('보고서 화면을 준비하지 못했어요. 화면을 새로고침해 주세요.');
      await window.HERMES_ANALYSIS_REPORTS.openLibrary({scope:D.reportScopeForRegion(row,state.month),emptyAction:{label:'이 행정동 현황 분석하기',run:()=>askRegion(row,'현황·원인 보고서를 만들어 줘')}});
    }catch(cause){button.textContent=cause.message||'보고서를 열지 못했어요. 다시 시도해 주세요.';}
    finally{button.disabled=false;}
  }
  function selectDongWelfare(code) {
    const row=state.rows.find(item=>item.area_code===code);if(!row)return;
    const filter={region_level:'administrative_dong',region_code:row.area_code,province_code:row.area_code.slice(0,2),district_code:parentCode(row)};
    Object.assign(state.welfare,filter,{offset:0,draft:{...state.welfare.draft,...filter}});
  }
  async function attachProgramToReport(id,button) {
    const program=state.welfare.result?.programs.find(item=>item.version_id===id);if(!program)return;
    const status=button?.parentElement?.querySelector('[data-ho-response-status]');
    if(button)button.disabled=true;
    try {
      if(!window.HERMES_ANALYSIS_REPORTS?.chooseReport||!window.HERMES_RESPONSE_WORKSPACE?.open)throw Error('대응안 검토 화면을 준비하지 못했어요. 화면을 새로고침해 주세요.');
      const reference=D.programForResponse(program);
      if(status)status.textContent='이 사업을 연결할 현황 분석을 선택해 주세요.';
      const selected=await window.HERMES_ANALYSIS_REPORTS.chooseReport({programTitle:reference.title});
      if(!selected){if(status)status.textContent='사업 연결을 취소했습니다.';return;}
      await window.HERMES_RESPONSE_WORKSPACE.open(selected.report_id,{program:reference});
      if(status)status.textContent='대응안 편집 화면에 사업을 담았습니다. 내용을 검토한 뒤 저장해 주세요.';
    }catch(cause){if(status)status.textContent=cause.message||'사업을 담지 못했어요. 다시 시도해 주세요.';}
    finally{if(button)button.disabled=false;}
  }
  function refreshActivity() {
    if (state.page === 'dashboard' && state.loadedMonth === state.month) dashboard();
  }
  async function loadDashboardActivity({force = false} = {}) {
    const month = state.month, token = ++activitySerial;
    state.activityError = '';
    if (!force && activityCache.has(month)) {
      state.activityRecords = activityCache.get(month).records;
      state.activityMonth = month; state.activityLoading = false;
      refreshActivity();
      return;
    }
    if (force) activityCache.delete(month);
    state.activityRecords = []; state.activityMonth = null; state.activityLoading = true;
    refreshActivity();
    try {
      if (!window.HERMES_ACTIVITY_VIEW?.load) throw new Error('활동 변화 표시 모듈을 준비하지 못했어요. 화면을 새로고침해 주세요.');
      let pending = activityRequests.get(month);
      if (!pending) {
        pending = Promise.resolve().then(() => window.HERMES_ACTIVITY_VIEW.load({month}))
          .then(result => { activityCache.set(month, result); return result; })
          .finally(() => activityRequests.delete(month));
        activityRequests.set(month, pending);
      }
      const result = await pending;
      if (token !== activitySerial || state.month !== month) return;
      state.activityRecords = result.records;
      state.activityMonth = month;
    } catch (cause) {
      if (token !== activitySerial || state.month !== month) return;
      state.activityRecords = []; state.activityMonth = null;
      state.activityError = cause.message || '활동 자료를 불러오지 못했어요.';
    } finally {
      if (token === activitySerial && state.month === month) { state.activityLoading = false; refreshActivity(); }
    }
  }
  function dashboard() {
    const rows=scopedRows(),row=state.rows.find(item=>item.area_code===state.region),summary=selectedActivity();
    const ready=!['loading','error'].includes(summary.category),provided=new Set(summary.records.map(item=>item.behavior.key.region_code)).size;
    const title=row?.area_name||districtName(state.district)||provinceName(state.province)||'전국';
    panel().innerHTML=`${header('행정동 대시보드','행정동별 지역 고립 지수와 인구구성을 살펴보세요.',monthSelect())}
      <div class="ho-stats ho-dong-stats"><div class="ho-stat"><small>조회 행정동</small><strong>${rows.length}<em>개</em></strong><span>${monthLabel(state.month)} · 읍·면·출장소 포함</span></div><div class="ho-stat"><small>상위 시군구 활동 자료</small><strong>${ready?provided:'—'}<em>개 지역</em></strong><span>통신·카드의 실제 관측 단위</span></div><div class="ho-stat"><small>상위 시군구 동시 감소</small><strong>${ready?summary.counts.joint_decline:'—'}<em>집단</em></strong><span>시군구 관측집단 · 동별 합산 없음</span></div></div>
      <div class="ho-dashboard-grid"><section class="ho-region-list"><div class="ho-card-head"><h2>행정동 목록</h2><span>${filteredRows().length}개</span></div><label class="ho-search"><span class="ho-sr-only">행정동 검색</span><input type="search" data-ho-search value="${esc(state.search)}" placeholder="행정동·읍면 이름 검색"></label><div class="ho-region-scroll">${regionRows()}</div></section>
      <section class="ho-map-panel"><div class="ho-card-head"><div><h2>${esc(title)}${row?' 상세 지도':state.province?' 행정동 지도':' 지도'}</h2><p>${row?'선택한 행정동의 경계를 크게 보여드려요.':state.province?'동을 누르면 해당 행정동만 확대해 볼 수 있어요.':'시도를 누르거나 지역 바로 보기를 선택하세요.'}</p></div>${state.province?'<button type="button" class="btn" data-ho-province="">전국 보기</button>':''}</div>${mapNavigation()}${districtSelect()}${provinceMap()}</section>
      <section class="ho-region-detail" aria-label="선택 행정동 상세">${detail()}</section></div>
      <details class="ho-note"><summary>행정동 자료는 어떻게 표시하나요?</summary><p>지도 색과 목록의 I5는 해당 행정동의 20세 이상 인구구성에 전국 설문 결과를 가중한 참고지수입니다. 개인 고립 확률이나 직접 조사한 동별 고립률은 아닙니다.</p><p>통신·카드 활동은 상위 시군구의 실제 관측집단을 함께 표시합니다. 같은 시군구의 여러 행정동을 조회해도 활동 관측 수를 중복해서 세지 않습니다. 경계가 연결되지 않은 동·출장소도 목록과 상세 자료를 조회할 수 있습니다.</p></details>`;
  }
  async function loadDashboard() {
    const token = ++serial;
    const mapTask = loadDashboardMap();
    const activityTask = loadDashboardActivity();
    if (state.loadedMonth === state.month) { dashboard(); await Promise.all([activityTask,mapTask]); return; }
    panel().innerHTML = header('행정동 대시보드', '전국 행정동 자료를 불러오고 있어요.', monthSelect()) + loading('지역 자료를 불러오고 있어요.');
    try {
      const month = state.month;
      const [catalog, rows, packet] = await Promise.all([
        api(`/api/model/regions?month=${month}`),
        D.readAll(offset => api(`/api/model/survey-area?level=administrative_dong&month=${month}&limit=500&offset=${offset}`)),
        window.HERMES_AGENT.api('/api/evidence/query', {region_level:'national',region_code:null,month,sex_codes:[],age_codes:[]}),
      ]);
      if (token !== serial || state.page !== 'dashboard') return;
      state.catalog = catalog; state.rows = rows; state.loadedMonth = month;
      if(state.region&&!rows.some(row=>row.area_code===state.region))state.region='';
      state.reference = Object.fromEntries((packet.national_reference || []).map(row => [row.metric, Number(row.weighted_mean)]));
      dashboard();
    } catch (cause) { if (token === serial) panel().innerHTML = header('행정동 대시보드', '행정동을 선택해 상세 자료를 살펴보세요.') + error(cause.message); }
    await Promise.all([activityTask,mapTask]);
  }
  const statusLabel = (status, meta) => D.periodLabel(status, meta);
  const regionsLabel = regions => D.regionDetails(regions).matched;
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const regionLevel = region => region.level || (/^\d{10}$/.test(region.code || '') ? 'administrative_dong' : /^\d{5}$/.test(region.code || '') ? 'sgg' : '');
  function welfareRegions(result = state.welfare.result || {}) {
    return result.available_regions?.length ? result.available_regions
      : result.regions?.length ? result.regions : welfareRegionOptions || [];
  }
  function regionDisplayName(region, regions = welfareRegions()) {
    if (!region) return '';
    const strip = (name,prefix) => prefix && name.startsWith(prefix+' ') ? name.slice(prefix.length+1) : name;
    let name=String(region.name||'');
    if (regionLevel(region)==='administrative_dong') {
      const parent=regions.find(item=>item.code===region.parent_code);
      if(parent) name=strip(name,parent.name);
      name=strip(name,region.province_name);
      if(parent) name=strip(name,strip(parent.name, parent.province_name));
    } else name=strip(name,region.province_name);
    return name;
  }
  function dongOptionLabel(region, regions, districtCode) {
    const name=regionDisplayName(region,regions);
    if(region.parent_code===districtCode)return name;
    const parent=regions.find(item=>item.code===region.parent_code), selected=regions.find(item=>item.code===districtCode);
    let parentName=regionDisplayName(parent,regions), selectedName=regionDisplayName(selected,regions);
    if(selectedName && parentName.startsWith(selectedName+' '))parentName=parentName.slice(selectedName.length+1);
    return [parentName,name].filter(Boolean).join(' ');
  }
  function welfareScope(filter) {
    if (!filter.region_level) return {labels:['전체'],order:'등록된 모든 지역의 사업'};
    if (filter.region_level === 'national') return {labels:['전국'],order:'전국 사업만 표시'};
    const regions = welfareRegions(), selected = regions.find(region => region.code === filter.region_code);
    if (filter.region_level === 'sido') {
      const province = regions.find(region => region.province_code === filter.region_code);
      return {labels:[province?.province_name || filter.region_code],order:'선택한 시도 → 소속 시군구·읍면동 → 전국 순'};
    }
    const district = filter.region_level === 'administrative_dong' ? regions.find(region => region.code === selected?.parent_code) : selected;
    return {labels:[selected?.province_name || district?.province_name,regionDisplayName(district,regions),filter.region_level === 'administrative_dong' ? regionDisplayName(selected,regions) : ''].filter(Boolean),
      order:filter.region_level === 'administrative_dong' ? '선택한 읍면동 → 상위 시군구 → 전국 순' : '선택한 시군구 → 소속 읍면동 → 전국 순'};
  }
  function welfareToolbar(result = {}) {
    const filter = state.welfare.draft, labels = D.welfareLabels(result), regions = welfareRegions(result);
    const provinces = [...new Map(regions.filter(region=>region.province_code && region.province_name).map(region=>[region.province_code,region.province_name]))].sort(([a],[b])=>a.localeCompare(b));
    const districts = regions.filter(region=>regionLevel(region)==='sgg' && (!filter.province_code || region.province_code===filter.province_code));
    const dongs = regions.filter(region=>regionLevel(region)==='administrative_dong' && (region.parent_code===filter.district_code || region.ancestor_codes?.includes(filter.district_code)));
    const selectedDistrict = filter.district_code;
    const selectedDong = filter.region_level==='administrative_dong' ? filter.region_code : '';
    const control = (name,title,options,selected,disabled=false) => `<label>${title}<select name="${name}" data-ho-welfare-filter ${disabled?'disabled':''}>${options.map(([value,label])=>option(value,label,selected)).join('')}</select></label>`;
    const regionNotice = welfareRegionError
      ? `<p class="ho-selection-error" role="status">지역 선택지를 불러오지 못했어요. <button type="button" class="ho-text-button" data-ho-retry-regions>지역 다시 불러오기</button></p>`
      : welfareRegionRequest && !regions.length ? '<p class="ho-selection-help" role="status">지역 선택지를 불러오고 있어요.</p>' : '';
    return `<form class="ho-toolbar ho-welfare-toolbar" id="ho-welfare-search"><div class="ho-welfare-region-controls">${control('province_code','시도',[['','전체'],...provinces],filter.province_code)}${control('district_code','시군구',[['','전체'],...districts.map(region=>[region.code,`${filter.province_code?'':(region.province_name||'')+' '}${regionDisplayName(region,regions)}`.trim()])],selectedDistrict)}${control('region_code','행정동·읍면',[['','전체'],...dongs.map(region=>[region.code,dongOptionLabel(region,regions,filter.district_code)])],selectedDong,!filter.district_code)}</div>${regionNotice}<label class="ho-search"><span>복지사업 검색</span><input type="search" name="q" data-ho-welfare-filter value="${esc(filter.q)}" maxlength="200" placeholder="사업명이나 지원 내용으로 검색"></label>${control('category_id',labels.category,[['','전체 분야'],...(result.categories||[]).map(category=>[category.category_id,category.label])],filter.category_id)}${control('status',labels.date,[['','전체 기간'],...(result.statuses||[]).map(status=>[status.code,statusLabel(status.code,result)])],filter.status)}<button class="btn primary" type="submit">선택</button><p class="ho-selection-help">조건을 고른 뒤 선택을 누르면 검색해요.</p><p class="ho-selection-error" data-ho-selection-error role="alert" hidden></p></form>`;
  }
  function welfareScopeContent() {
    const scope = welfareScope(state.welfare);
    return `<span>조회 중인 지역</span>${scope.labels.map(label=>`<b>${esc(label)}</b>`).join('')}<small>${scope.order}</small>`;
  }
  function refreshWelfareControls() {
    if (state.page !== 'welfare-list' || !root) return;
    const toolbar = root.querySelector('[data-ho-welfare-toolbar]');
    if (!toolbar) return;
    const active = document.activeElement;
    const focused = active && toolbar.contains?.(active)
      ? {name:active.name,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection} : null;
    toolbar.innerHTML = welfareToolbar(state.welfare.result || {});
    const scope = root.querySelector('.ho-selected-scope');
    if (scope) scope.innerHTML = welfareScopeContent();
    if (focused && /^[a-z_]+$/.test(focused.name)) {
      const field = toolbar.querySelector?.(`[name="${focused.name}"]`);
      field?.focus?.({preventScroll:true});
      if (typeof focused.start === 'number' && typeof focused.end === 'number')
        field?.setSelectionRange?.(focused.start,focused.end,focused.direction);
    }
  }
  function loadWelfareRegions({force = false} = {}) {
    if (!force && welfareRegionOptions !== null && Date.now()-welfareRegionsLoadedAt < welfareCacheTTL) return;
    if (welfareRegionRequest) return;
    welfareRegionError = '';
    const page = welfarePage('/api/model/welfare/regions',force);
    welfareRegionRequest = page.request.then(result => {
      if (!Array.isArray(result.regions)) throw new Error('지역 선택지 형식을 확인해 주세요.');
      welfareRegionOptions = result.regions; welfareRegionsLoadedAt = Date.now();
    }).catch(cause => { welfareRegionError = cause.message; }).finally(() => {
      welfareRegionRequest = null; refreshWelfareControls();
    });
  }
  function welfareShell(content) {
    const result = state.welfare.result || {};
    const note = result.region_basis === 'administering_jurisdiction' ? '<p class="ho-dialog-note">지역은 담당기관 관할 기준이며, 신청자의 거주 자격을 뜻하지 않습니다. 신청 기간은 등록된 일정으로 현재 접수 여부는 별도 확인이 필요합니다.</p>' : '';
    panel().innerHTML = `${header('복지 리스트','등록된 복지사업을 살펴보고, 필요한 지원을 찾아보세요.')}<div class="ho-selected-scope" aria-label="현재 조회 지역">${welfareScopeContent()}</div><div data-ho-welfare-toolbar>${welfareToolbar(result)}</div>${note}<div data-ho-welfare-results>${content}</div>`;
  }
  function sourceLink(program, label, className='') {
    try {
      const url = new URL(program.source_url);
      if (program.is_synthetic===false && /^https?:$/.test(url.protocol) && !url.username && !url.password)
        return `<a class="${className}" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    } catch {}
    return '';
  }
  function welfarePagination(result, position) {
    const totalPages = Math.ceil(result.matched / welfarePageSize);
    const currentPage = totalPages ? Math.floor(state.welfare.offset / welfarePageSize) + 1 : 0;
    const pages = new Set(totalPages ? [1, totalPages] : []);
    if (totalPages) {
      const start = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
      for (let page = start; page <= Math.min(totalPages, start + 2); page++) pages.add(page);
    }
    let previous = 0;
    const numbers = [...pages].sort((a,b) => a-b).map(page => {
      const gap = previous && page > previous + 1 ? '<span class="ho-pagination-ellipsis" aria-hidden="true">…</span>' : '';
      previous = page;
      return `${gap}<button type="button" data-ho-offset="${(page-1)*welfarePageSize}" aria-label="${page}페이지" ${page===currentPage?'aria-current="page" disabled':''}>${page}</button>`;
    }).join('');
    return `<nav class="ho-pagination" aria-label="복지사업 페이지 이동 (${position})"><div class="ho-pagination-buttons"><button type="button" data-ho-offset="${Math.max(0,state.welfare.offset-welfarePageSize)}" ${currentPage<=1?'disabled':''}>이전</button>${numbers}<button type="button" data-ho-offset="${result.next_offset??0}" ${result.next_offset==null?'disabled':''}>다음</button></div><span class="ho-pagination-count">${currentPage} / ${totalPages} 페이지</span></nav>`;
  }
  function welfareList(result) {
    const filter = state.welfare, programs = result.programs || [];
    if (!programs.some(program => program.version_id === filter.selectedId)) {
      filter.selectedId = programs[0]?.version_id || null;
      filter.chatOpen = false;
    }
    const cards = programs.map(program => {
      return `<article class="ho-program-card">
        <button type="button" class="ho-program-select" data-ho-select-program="${esc(program.version_id)}" aria-pressed="${program.version_id===filter.selectedId}"><span class="ho-program-title">${esc(program.title)}</span><span class="ho-program-summary">${esc(program.summary || program.support_content || '등록된 사업 설명이 없습니다.')}</span></button></article>`;
    }).join('');
    const range = result.matched ? `${filter.offset+1}–${Math.min(filter.offset+programs.length,result.matched)} / ${result.matched}개` : '0 / 0개';
    const selected = selectedWelfareProgram();
    welfareShell(`<div class="ho-results-summary" tabindex="-1"><div><p>전체 <b>${result.total}</b>개 중 <b>${result.matched}</b>개 사업</p><p class="ho-results-range" role="status">${range} · 한 페이지에 ${welfarePageSize}개씩 표시</p></div><button type="button" class="ho-text-button" data-ho-reset-filters>필터 초기화</button></div><div class="ho-welfare-workspace"><aside class="ho-welfare-list-pane" aria-label="복지사업 목록">${programs.length?`<div class="ho-program-list">${cards}</div>`:'<div class="ho-empty"><img src="hermes/hermi/explore.png" alt="" width="90" height="90"><h2>조건에 맞는 사업이 없어요.</h2><p>검색어를 바꾸거나 필터를 넓혀보세요.</p></div>'}${welfarePagination(result,'아래')}</aside><section class="ho-welfare-detail-pane" aria-label="선택한 복지사업 상세" data-ho-program-detail>${welfareDetailPane(selected)}</section></div>`);
  }
  function selectedWelfareProgram() {
    return state.welfare.result?.programs.find(program => program.version_id===state.welfare.selectedId);
  }
  function welfareDetailPane(program) {
    if (!program) return '<div class="ho-detail-empty"><img src="hermes/hermi/explore.png" alt="" width="100" height="100"><h2>사업을 선택해 주세요.</h2><p>목록에서 사업을 고르면 상세 정보를 볼 수 있어요.</p></div>';
    return `<header class="ho-program-detail-header"><h2>${esc(program.title)}</h2></header><div class="ho-program-detail-scroll">${programDetails(program)}</div><div data-ho-welfare-chat-slot>${welfareChatMarkup(program)}</div>`;
  }
  function selectWelfareProgram(id) {
    const program=state.welfare.result?.programs.find(item=>item.version_id===id);
    if (!program || id===state.welfare.selectedId) return;
    state.welfare.selectedId=id;
    root.querySelectorAll('[data-ho-select-program]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.hoSelectProgram===id)));
    const detail=root.querySelector('[data-ho-program-detail]');
    if (detail) detail.innerHTML=welfareDetailPane(program);
  }
  function welfareChatSession(program) {
    if (!welfareChats.has(program.version_id)) {
      if (!window.HERMI_WELFARE_CHAT) throw new Error('대화를 준비하지 못했어요. 화면을 새로고침해 주세요.');
      const scope=welfareScope(state.welfare);
      welfareChats.set(program.version_id,window.HERMI_WELFARE_CHAT.createSession(program,
        {...state.welfare.result,scope_label:scope.labels.join(' ')},{formatters:D}));
    }
    return welfareChats.get(program.version_id);
  }
  function welfareChatMarkup(program) {
    if (!state.welfare.chatOpen) return `<button type="button" class="ho-hermi-launcher" data-ho-chat-open aria-label="${esc(program.title)}에 대해 헤르미와 대화"><span>사업 내용 물어보기</span><img src="hermes/hermi/guide.png" alt="" width="84" height="84" decoding="async"></button>`;
    let session;
    try { session=welfareChatSession(program); }
    catch (cause) { return `<section class="ho-welfare-chat" aria-label="헤르미와 복지사업 대화"><header><h3>헤르미</h3><button type="button" data-ho-chat-close aria-label="헤르미 대화 닫기">×</button></header><p role="alert">${esc(cause.message)}</p></section>`; }
    const renderText=text=>window.HERMI_ANSWER?.blocks ? window.HERMI_ANSWER.blocks(text) : `<p class="ho-source-text">${esc(text)}</p>`;
    const messages=session.messages.map((message,index)=>`<article class="ho-welfare-message ${message.role==='user'?'mine':'assistant'}"><span class="ho-sr-only">${message.role==='user'?'나':'헤르미'}</span><div>${renderText(message.text)}</div>${message.report ? `<div class="ho-chat-report"><details open><summary>보고서 미리보기</summary><div class="ho-chat-report-preview">${renderText(message.report.markdown)}</div></details><button type="button" class="btn" data-ho-download-report="${index}">보고서 내려받기</button></div>` : ''}</article>`).join('');
    const failure=welfareChatErrors.get(program.version_id);
    return `<section class="ho-welfare-chat" aria-label="헤르미와 복지사업 대화"><header><img src="hermes/hermi/guide.png" alt="" width="42" height="42"><div><h3>헤르미</h3><p>${esc(program.title)}</p></div><button type="button" data-ho-chat-close aria-label="헤르미 대화 닫기">×</button></header><div class="ho-welfare-chat-feed" data-ho-chat-feed role="log" aria-live="polite">${messages}${session.busy?'<p class="ho-chat-pending" role="status">사업 자료를 확인하며 작성하고 있어요…</p>':''}${failure?`<div class="ho-chat-error" role="alert"><p>${esc(failure)}</p><button type="button" data-ho-chat-retry>다시 시도</button></div>`:''}</div><div class="ho-chat-quick"><button type="button" data-ho-chat-report ${session.busy?'disabled':''}>분석에 연결해 대응 보고서 만들기</button><p class="ho-section-note">저장된 분석을 고르고 대응안을 검토한 뒤 보고서로 저장합니다.</p><p data-ho-response-status role="status" aria-live="polite"></p></div><form id="ho-welfare-chat-form"><label class="ho-sr-only" for="ho-welfare-chat-message">선택한 사업에 대해 헤르미에게 요청</label><textarea id="ho-welfare-chat-message" name="message" data-ho-chat-message rows="2" maxlength="2000" placeholder="궁금한 내용이나 보고서 작성을 요청해 주세요." required>${esc(welfareChatDrafts.get(program.version_id)||'')}</textarea><button type="submit" ${session.busy?'disabled':''}>보내기</button></form></section>`;
  }
  function renderWelfareChat() {
    const program=selectedWelfareProgram();
    if (!program) return;
    const markup=welfareChatMarkup(program), slot=root.querySelector('[data-ho-welfare-chat-slot]');
    if (slot) slot.innerHTML=markup;
    const feed=root.querySelector('[data-ho-chat-feed]');
    if (feed) feed.scrollTop=feed.scrollHeight;
  }
  async function sendWelfareChat(text,intent) {
    const program=selectedWelfareProgram();
    if (!program || !String(text).trim()) return;
    const id=program.version_id;
    if(intent==='report'||/보고서|리포트/i.test(String(text))){
      await attachProgramToReport(id,root?.querySelector('[data-ho-chat-report]'));
      return;
    }
    let session;
    try { session=welfareChatSession(program); }
    catch (cause) { welfareChatErrors.set(id,cause.message);renderWelfareChat();return; }
    if (session.busy) return;
    welfareChatErrors.delete(id);welfareChatRetries.set(id,{text,intent});welfareChatDrafts.set(id,'');
    const request=session.send(text,intent?{intent}:{});
    renderWelfareChat();
    try { await request; }
    catch (cause) { welfareChatErrors.set(id,cause.message||'답변을 불러오지 못했어요. 다시 시도해 주세요.'); }
    if (state.page==='welfare-list' && state.welfare.selectedId===id && state.welfare.chatOpen) renderWelfareChat();
  }
  async function loadWelfare({scrollToResults = false, force = false} = {}) {
    const token = ++serial, filter = {...state.welfare};
    loadWelfareRegions();
    const query = new URLSearchParams({offset:String(filter.offset),limit:String(welfarePageSize),view:'browser'});
    for (const key of ['q','category_id','region_level','region_code','status']) if (filter[key]) query.set(key,filter[key]);
    const page = welfarePage('/api/model/welfare/catalog?'+query,force);
    if (!page.cached) welfareShell(loading('복지사업을 불러오고 있어요.'));
    try {
      const result = await page.request;
      if (token!==serial || state.page!=='welfare-list') return;
      state.welfare.result=result;
      welfareList(result);
      if (scrollToResults) {
        root.querySelector('[data-ho-welfare-results]')?.scrollIntoView?.({block:'start'});
        root.querySelector('.ho-results-summary')?.focus?.({preventScroll:true});
      }
    } catch(cause) {if(token===serial && state.page==='welfare-list') welfareShell(error(cause.message));}
  }
  function programDetails(program) {
    const meta = {...state.welfare.result,...program}, labels = D.welfareLabels(meta), region = D.regionDetails(program.regions);
    const rows = entries => entries.filter(([,value])=>value !== null && value !== undefined && value !== '').map(([label,value])=>`<dt>${esc(label)}</dt><dd class="ho-source-text">${esc(value)}</dd>`).join('');
    const sourceQuote = (quote, title = '근거 원문 보기') => typeof quote === 'string' && quote.trim() ? `<details class="ho-evidence"><summary>${esc(title)}</summary><p class="ho-source-text">${esc(quote)}</p></details>` : '';
    const textSection = (title,text) => typeof text === 'string' && text.trim() ? `<section class="ho-program-section"><h3>${esc(title)}</h3><p class="ho-source-text${title === '신청 안내' ? ' ho-application-text' : ''}">${esc(text)}</p></section>` : '';
    const conditions = D.conditionRows(program), businessPeriods = D.businessPeriods(program), official = D.officialMetadata(program);
    const categories = program.source_categories || [];
    const publication = (state.welfare.result.publications || []).find(item=>item.source_id === program.source?.source_id);
    const applicationText = program.application_text?.trim() ? program.application_text
      : D.readableValue(program.official_categories_raw?.aplyMtdNm) || '등록된 신청 방법 안내가 없습니다.';
    return `<div class="ho-dialog-body">
      <section class="ho-response-link"><button type="button" class="btn primary" data-ho-add-response="${esc(program.version_id)}">이 사업을 대응안에 담기</button><p>저장된 현황 분석에 연결해 활용 방법을 검토할 수 있어요.</p><p data-ho-response-status role="status" aria-live="polite"></p></section>
      ${textSection('지원 대상',program.target_text?.trim() ? program.target_text : '등록된 지원 대상 안내가 없습니다.')}
      ${textSection('지원 내용',program.support_content?.trim() ? program.support_content : '등록된 지원 내용 안내가 없습니다.')}
      <section class="ho-program-section ho-application-section"><h3>신청 기간·방법</h3>
        <dl class="ho-detail-list">${rows([[labels.date,D.periodText(meta)],['담당기관',program.institution]])}</dl>
        <h4>신청 안내</h4><p class="ho-source-text ho-application-text">${esc(applicationText)}</p>
      </section>
      ${program.region_match_label ? `<p class="ho-section-note">조회 지역: ${esc(program.region_match_label)}</p>` : ''}
      ${sourceLink(program,program.source_url_type==='official_site'?'기관 홈페이지 확인':'원문에서 확인하기','btn primary')}
      <details class="ho-detail-fold"><summary>선정 기준·사업 정보</summary><div class="ho-detail-fold-body">
      ${textSection('사업 개요',program.summary)}${textSection('선정 기준',program.selection_text)}
      <dl class="ho-detail-list">${rows([[labels.region,region.matched],['원문 지역 표기',region.original]])}</dl>
      ${businessPeriods.length ? `<section class="ho-program-section"><h3>사업 시행기간</h3>${businessPeriods.map(text=>`<p class="ho-source-text">${esc(text)}</p>`).join('')}${(program.conditions || []).filter(item=>item.kind === 'program_period').map(item=>sourceQuote(item.source_quote)).join('')}</section>` : ''}
      ${program.age_status || program.life_stage_raw || program.gender_scope ? `<h3>대상에 관한 등록 정보</h3><dl class="ho-detail-list">${rows([['연령 범위',D.ageLabel(program)],['생애주기',D.readableValue(program.life_stage_raw)],['성별',D.genderLabel(program.gender_scope)]])}</dl>${sourceQuote(program.age_basis_text,'연령 정리 근거 보기')}` : ''}
      ${official.length ? `<h3>원자료 분류·제공 정보</h3><dl class="ho-detail-list">${rows(official.map(item=>[item.label,item.text]))}</dl>` : ''}
      </div></details>
      <details class="ho-detail-fold"><summary>근거·출처</summary><div class="ho-detail-fold-body">
      <h3>${meta.classification_basis === 'internal_tags' ? '자료 분류 (내부 기준)' : labels.category}</h3>
      ${meta.classification_basis === 'internal_tags' ? '<p class="ho-section-note">자료를 정리하기 위한 분류입니다. 원기관의 공식 분류나 신청 자격과 구분해 보세요.</p>' : ''}
      ${categories.length ? `<ul class="ho-classifications">${categories.map(category=>`<li><strong>${esc(category.label)}</strong>${category.review_status ? `<span class="ho-review-label">${esc(D.reviewLabel(category.review_status))}</span>` : ''}${category.description ? `<p class="ho-source-text">${esc(category.description)}</p>` : ''}${sourceQuote(category.source_quote)}</li>`).join('')}</ul>` : '<p>등록된 분류가 없습니다.</p>'}
      <h3>자료에서 정리한 조건</h3><p class="ho-section-note">정리된 항목은 지원 대상·선정 기준 원문과 함께 확인해 주세요. 자동 추출된 기간·연령 표현은 실제 연령 요건과 다를 수 있습니다.</p>
      ${conditions.length ? `<ul class="ho-condition-list">${conditions.map(condition=>`<li><div><strong>${esc(condition.label)}</strong><span class="ho-review-label">${esc(condition.review)}</span></div><p class="ho-source-text">${esc(condition.text)}</p>${condition.needs_original ? '<p class="ho-condition-note">원자료에 표시된 항목입니다. 각 항목의 결합 관계가 명시되지 않아 지원 대상·선정 기준 원문을 확인해야 합니다.</p>' : ''}${sourceQuote(condition.source_quote)}</li>`).join('')}</ul>` : '<p>별도로 정리된 조건이 없습니다. 위의 지원 대상과 선정 기준을 확인해 주세요.</p>'}
      <h3>자료 출처</h3><dl class="ho-detail-list">${rows([['등록 출처',program.source?.name || '출처 미기재'],['자료 수집 시각',D.sourceDateText(program.source_retrieved_at)],['자료 묶음 공개일',D.sourceDateText(publication?.published_at)]])}</dl>
      ${program.source_retrieved_at || publication?.published_at ? '<p class="ho-section-note">자료 수집 시각·자료 묶음 공개일은 원기관의 정보 수정일과 다릅니다.</p>' : ''}
      <div class="ho-dialog-note">${program.is_synthetic ? '화면과 연결 흐름을 확인하기 위한 예시 사업입니다. 실제 신청 대상 사업이 아닙니다.' : '등록된 기간만으로 현재 접수 여부를 확정할 수 없어요. 담당기관 관할과 거주 자격을 구분하고, 세부 자격·모집 일정은 사업 원문에서 확인해 주세요.'}</div>
      </div></details></div>`;
  }
  function showProgram(id) {
    const program = state.welfare.result?.programs.find(item=>item.version_id===id);
    if(!program)return;
    const dialog = root.querySelector('#ho-program-dialog');
    const meta = {...state.welfare.result,...program};
    dialog.innerHTML = `<div class="ho-dialog-head"><div><span class="ho-tag">${statusLabel(program.period_status,meta)}</span><h2>${esc(program.title)}</h2></div><button type="button" class="ho-dialog-close" data-ho-close aria-label="사업 상세 닫기">×</button></div>${programDetails(program)}`;
    dialog.scrollTop = 0;
    dialog.showModal();
  }
  function changeWelfareDraft(target) {
    const draft=state.welfare.draft, key=target.name, value=target.value;
    if (['province_code','district_code','region_code'].includes(key)) {
      let dong = key==='region_code' ? value : '';
      if (key==='province_code') {draft.province_code=value;draft.district_code='';}
      if (key==='district_code') {
        draft.district_code=value;
        const district=welfareRegions().find(region=>region.code===value && regionLevel(region)==='sgg');
        if (district?.province_code) draft.province_code=district.province_code;
      }
      if (!draft.district_code) dong='';
      draft.region_level=dong?'administrative_dong':draft.district_code?'sgg':draft.province_code?'sido':'';
      draft.region_code=dong || draft.district_code || draft.province_code || '';
      root.querySelector('[data-ho-welfare-toolbar]').innerHTML=welfareToolbar(state.welfare.result||{});
    } else draft[key]=value;
  }
  function mount(after) {
    root = document.createElement('main'); root.id = 'hermi-overview'; root.className = 'hermi-overview'; root.hidden = true;
    root.innerHTML = '<section class="ho-page" data-overview-page="dashboard" hidden></section><section class="ho-page" data-overview-page="welfare-list" hidden></section><dialog id="ho-program-dialog" class="ho-dialog" aria-label="복지사업 상세"></dialog>';
    after.after(root);
    root.addEventListener('click', event => {
      const target = event.target.closest('button,[data-ho-province],[data-ho-region],[data-ho-district]'); if (!target) return;
      if (target.hasAttribute('data-ho-province')) { state.province = target.dataset.hoProvince; state.district = ''; state.region = ''; state.search = ''; dashboard(); }
      if (target.dataset.hoDistrict) { state.district=target.dataset.hoDistrict;state.province=state.district.slice(0,2);state.region='';state.search='';dashboard(); }
      if (target.dataset.hoRegion) { const row=state.rows.find(row=>row.area_code===target.dataset.hoRegion);if(row){state.region=row.area_code;state.province=row.area_code.slice(0,2);state.district=parentCode(row);state.search='';dashboard();} }
      if (target.hasAttribute('data-ho-retry-map')) loadDashboardMap({force:true});
      if (target.hasAttribute('data-ho-select-guide')) root.querySelector('[data-ho-search]')?.focus();
      if (target.dataset.hoOpenReports) openRegionReports(target.dataset.hoOpenReports,target);
      if(target.dataset.hoDongWelfare){selectDongWelfare(target.dataset.hoDongWelfare);navigate('welfare-list');}
      if (target.dataset.hoAddResponse) attachProgramToReport(target.dataset.hoAddResponse,target);
      if (target.dataset.hoAskRegion) { try{askRegion(state.rows.find(row=>row.area_code===target.dataset.hoAskRegion));}catch(cause){target.textContent=cause.message;} }
      if (target.hasAttribute('data-ho-retry')) state.page==='welfare-list' ? loadWelfare({force:true}) : show(state.page);
      if (target.hasAttribute('data-ho-retry-activity')) loadDashboardActivity({force:true});
      if (target.hasAttribute('data-ho-retry-regions')) {loadWelfareRegions({force:true}); refreshWelfareControls();}
      if (target.dataset.hoSelectProgram) selectWelfareProgram(target.dataset.hoSelectProgram);
      if (target.hasAttribute('data-ho-chat-open')) {
        state.welfare.chatOpen=true;renderWelfareChat();
        root.querySelector('[data-ho-chat-message]')?.focus?.({preventScroll:true});
      }
      if (target.hasAttribute('data-ho-chat-close')) {
        state.welfare.chatOpen=false;renderWelfareChat();
        root.querySelector('[data-ho-chat-open]')?.focus?.({preventScroll:true});
      }
      if (target.hasAttribute('data-ho-chat-report')) sendWelfareChat('이 사업으로 보고서 만들어줘','report');
      if (target.hasAttribute('data-ho-chat-retry')) {
        const retry=welfareChatRetries.get(state.welfare.selectedId);
        if (retry) sendWelfareChat(retry.text,retry.intent);
      }
      if (target.hasAttribute('data-ho-download-report')) {
        const program=selectedWelfareProgram(), index=Number(target.dataset.hoDownloadReport);
        const report=program && welfareChatSession(program).messages[index]?.report;
        if (report) window.HERMI_WELFARE_CHAT.download(report);
      }
      if (target.dataset.hoProgram) showProgram(target.dataset.hoProgram);
      if (target.hasAttribute('data-ho-close')) root.querySelector('dialog').close();
      if (target.hasAttribute('data-ho-offset') && !target.disabled) {
        const offset = Number(target.dataset.hoOffset);
        if (Number.isInteger(offset) && offset >= 0 && offset !== state.welfare.offset) {
          state.welfare.offset = offset; loadWelfare({scrollToResults:true});
        }
      }
      if (target.hasAttribute('data-ho-reset-filters')) { Object.assign(state.welfare,emptyWelfareFilter(),{draft:emptyWelfareFilter(),offset:0}); loadWelfare(); }
    });
    root.addEventListener('change', event => {
      if(event.target.hasAttribute('data-ho-district-filter')){state.district=event.target.value;state.region='';state.search='';dashboard();}

      if (event.target.hasAttribute('data-ho-month')) {
        state.month = event.target.value;
        const url = new URL(location.href); url.searchParams.set('month', state.month); history.replaceState({}, '', url);
        loadDashboard();
      }
      if (event.target.hasAttribute('data-ho-welfare-filter')) {
        changeWelfareDraft(event.target);
      }
    });
    root.addEventListener('input', event => {
      if (event.target.name==='q' && event.target.hasAttribute('data-ho-welfare-filter')) state.welfare.draft.q=event.target.value;
      if (event.target.hasAttribute('data-ho-chat-message')) {
        welfareChatDrafts.set(state.welfare.selectedId,event.target.value);return;
      }
      if (!event.target.hasAttribute('data-ho-search')) return;
      state.search = event.target.value.trim();
      root.querySelector('.ho-region-scroll').innerHTML = regionRows();
      root.querySelector('.ho-region-list .ho-card-head > span').textContent = `${filteredRows().length}개`;
    });
    root.addEventListener('submit', event => {
      if (event.target.id === 'ho-welfare-chat-form') {
        event.preventDefault();sendWelfareChat(String(new FormData(event.target).get('message')||'').trim());return;
      }
      if (event.target.id !== 'ho-welfare-search') return;
      event.preventDefault();
      const draft=state.welfare.draft;
      draft.q=String(new FormData(event.target).get('q')||'').trim();
      Object.assign(state.welfare,{...draft,offset:0}); loadWelfare();
    });
    root.addEventListener('keydown', event => {
      if (event.target.hasAttribute('data-ho-chat-message') && event.key==='Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();sendWelfareChat(event.target.value);return;
      }
      if ((event.target.hasAttribute('data-ho-province') || event.target.hasAttribute('data-ho-region') || event.target.hasAttribute('data-ho-district')) && event.target.tagName !== 'BUTTON' && ['Enter',' '].includes(event.key)) {event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    });
    return root;
  }
  async function show(page) {
    if(page==='welfare-list'&&state.page==='dashboard'&&state.region)selectDongWelfare(state.region);
    state.page = page;
    if (page === 'dashboard') {
      const url = new URL(location.href); url.searchParams.set('month', state.month); history.replaceState({}, '', url);
    }
    root.querySelectorAll('[data-overview-page]').forEach(section => section.hidden = section.dataset.overviewPage !== page);
    return page === 'dashboard' ? loadDashboard() : loadWelfare();
  }
  return { mount, show };
})();
