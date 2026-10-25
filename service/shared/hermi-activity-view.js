/* Shared read-only view. Categories and reasons belong to the server rule engine. */
window.HERMES_ACTIVITY_VIEW = (() => {
  'use strict';
  const categories = {
    no_threshold_decline:'기준 이상 감소 미포착', single_source_decline:'단일 감소 관찰',
    joint_decline:'동시 감소 관찰', priority_review:'우선 검토 후보', assessment_hold:'판정 보류',
  };
  const priority = {priority_review:0,joint_decline:1,single_source_decline:2,assessment_hold:3,no_threshold_decline:4};
  const ages = {'20G':'20대','30G':'30대','40G':'40대','50G':'50대','60GU':'60세 이상'};
  const qualityLabels = {
    SKT_ORIGINAL_BOUNDARY_CRS_UNVERIFIED:'통신 자료의 공간 경계·좌표 기준 미확인',
    SKT_MONTHLY_COVERAGE_UNVERIFIED:'통신 월별 관측 범위 미확인',
    SKT_PRODUCTION_RULES_UNVERIFIED:'통신 자료 생산 규칙 미확인',
    CARD_MISSINGNESS_RULE_UNVERIFIED:'카드 누락 자료 처리 규칙 미확인',
    CARD_INDUSTRY_SUBTYPE_UNVERIFIED:'카드 업종 세부 분류 미확인',
    SKT_SEP_OCT_BOUNDARY_VERSION_CHANGED:'통신 9월·10월 공간 경계 버전 변경: 변화율 추가 검토 필요',
  };
  const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = value => typeof value==='number'&&Number.isFinite(value);
  const rate = value => finite(value)?`${value>0?'+':''}${value.toFixed(2)}%`:'비교 불가';
  const number = value => finite(value)?value.toFixed(2):'미산출';
  const tri = value => value===true?'확인':value===false?'조건 미충족':'미확인';
  const prose = value => String(window.HERMI_COPY?.text?window.HERMI_COPY.text(value):value??'').replace(/원자료 자료 확인 필요/g,'원자료 확인 필요').replace(/자료 자료 확인 필요/g,'자료 확인 필요');
  function validate(records) {
    if(!Array.isArray(records))throw Error('5% 분류 자료 형식을 확인할 수 없습니다.');
    const seen=new Set();let version;
    for(const row of records){
      const a=row?.activity_assessment,key=row?.behavior?.key;
      if(!a||!key||!Object.hasOwn(categories,a.category)||typeof a.category_label!=='string'||!a.category_label||a.threshold_percent!==5||typeof a.rule_version!=='string'||!a.rule_version||a.operational_alert_allowed!==false||!Array.isArray(a.reasons)||!a.sources?.skt||!a.sources?.card_a||!a.signals)throw Error('서버의 5% 분류 결과를 받지 못했습니다. 자료를 새로고침해 주세요.');
      for(const field of ['region_code','month','sex_code','age_code'])if(typeof key[field]!=='string'||a.scope?.[field]!==key[field])throw Error('활동 관측과 5% 분류의 지역·월·집단이 다릅니다.');
      if(row.behavior.spatial_unit!=='sgg'||!/^\d{5}$/.test(key.region_code)||!/^[0-9]{4}(0[1-9]|1[0-2])$/.test(key.month)||Number(key.month.slice(0,4))<1||!['MAN','WMAN'].includes(key.sex_code)||!Object.hasOwn(ages,key.age_code))throw Error('활동 분류의 시군구·관측월·성별·연령 범위를 확인할 수 없습니다.');
      const id=[key.region_code,key.month,key.sex_code,key.age_code].join(':');
      if(seen.has(id))throw Error('같은 활동 관측이 중복되어 분류를 표시할 수 없습니다.');
      seen.add(id);
      if(version&&version!==a.rule_version)throw Error('서로 다른 5% 규칙 버전이 섞여 있습니다. 새로고침해 주세요.');
      version=a.rule_version;
    }
    return records;
  }
  function counts(records) {
    const result=Object.fromEntries(Object.keys(categories).map(key=>[key,0]));
    for(const row of validate(records))result[row.activity_assessment.category]++;
    return result;
  }
  async function load(filters={}) {
    const records=[],seen=new Set();let offset=0,first;
    while(true){
      const query=new URLSearchParams({limit:'100',offset:String(offset)});
      for(const name of ['month','region_code','sex_code','age_code'])if(filters[name])query.set(name,filters[name]);
      const response=await fetch('/api/model/behavior?'+query.toString());
      if(!response.headers.get('content-type')?.includes('application/json'))throw Error('활동 분류 서버에 연결하지 못했습니다.');
      const page=await response.json();
      if(!response.ok)throw Error(page.detail?.message||'활동 분류를 불러오지 못했습니다.');
      if(typeof page.run_id!=='string'||!page.run_id||page.classification_rule?.threshold_percent!==5||typeof page.classification_rule?.rule_version!=='string'||!page.classification_rule.rule_version||typeof page.manifest_sha256!=='string'||!page.manifest_sha256||!Array.isArray(page.records)||!Number.isInteger(page.total_matched)||page.total_matched<0)throw Error('5% 분류 조회 응답을 확인할 수 없습니다.');
      if(first&&(page.run_id!==first.run_id||page.manifest_sha256!==first.manifest_sha256||page.total_matched!==first.total_matched||page.classification_rule.rule_version!==first.classification_rule.rule_version))throw Error('조회 중 활동 자료 또는 분류 규칙이 바뀌었습니다. 새로고침해 주세요.');
      first ||= page;
      validate(page.records);
      for(const row of page.records){
        if(row.activity_assessment.rule_version!==page.classification_rule.rule_version)throw Error('활동 분류 규칙 버전이 일치하지 않습니다.');
        for(const name of ['month','region_code','sex_code','age_code'])if(filters[name]&&row.behavior.key[name]!==filters[name])throw Error('요청한 범위와 활동 분류 범위가 다릅니다.');
      }
      records.push(...page.records);seen.add(offset);
      if(page.next_offset==null)break;
      if(!Number.isInteger(page.next_offset)||page.next_offset<=offset||seen.has(page.next_offset))throw Error('활동 분류 페이지 순서를 확인할 수 없습니다.');
      offset=page.next_offset;
    }
    validate(records);
    if(records.length!==first.total_matched)throw Error('일부 활동 분류 자료가 빠졌습니다. 새로고침해 주세요.');
    return {...first,records,next_offset:null};
  }
  function rowHTML(row,detailActions) {
    const a=row.activity_assessment,key=a.scope,s=a.sources,robust=a.robust_evidence;
    const title=`${row.behavior.region_name||key.region_code} · ${key.sex_code==='MAN'?'남성':'여성'} ${ages[key.age_code]||key.age_code}`;
    const quality=(a.quality_reasons||[]).map(code=>qualityLabels[code]||code);
    const c3=row.historical_reference;
    return `<tr data-hav-row="${esc(a.category)}"><td><b>${esc(title)}</b><small>${esc(key.month.slice(0,4)+'년 '+Number(key.month.slice(4))+'월')} · 시군구 관측</small>${detailActions?`<button type="button" class="hav-detail-button" data-live-cell="${esc(JSON.stringify(key))}">이 집단 근거 분석</button>`:''}</td><td class="hav-rate">${esc(rate(s.skt.change_percent))}</td><td class="hav-rate">${esc(rate(s.card_a.change_percent))}</td><td><span class="hav-badge hav-${a.category}">${esc(a.category_label)}</span></td><td class="hav-reasons"><ul>${a.reasons.map(reason=>`<li>${esc(prose(reason))}</li>`).join('')}</ul><p>2개월 연속 5% 동시 감소: <b>${tri(a.signals.two_month_streak)}</b> · 상대적 이례성: <b>${tri(a.signals.robust_candidate)}</b></p>${robust?`<p>이례성 근거: 통신 z ${number(robust.sources?.skt?.z)} · 카드 z ${number(robust.sources?.card_a?.z)} · 모델 기준 ${number(robust.cutoff)}</p>`:''}<details><summary>이전 관측·품질·근거 자료</summary><p>직전 달 변화율: 통신 ${esc(rate(s.skt.previous_change_percent))} · 카드 ${esc(rate(s.card_a.previous_change_percent))}</p>${quality.length?`<ul>${quality.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`:'<p>추가 품질 사유가 제공되지 않았습니다.</p>'}<p>자료 품질: ${a.quality_status==='hold'?'검토 필요':esc(a.quality_status||'미확인')} · 운영 경보 불허</p>${c3?`<p>C3 과거 같은 요일 카드 건수 변화 ${esc(rate(c3.count?.change_pct))} · 같은 카드 자료의 다른 비교 기준이며 별도 신호로 합산하지 않습니다.</p>`:''}<p class="hav-meta">근거: ${esc((a.evidence_ids||[]).join(', '))}</p></details></td></tr>`;
  }
  function render(records,options={}) {
    const summary=counts(records),regions=new Set(records.map(row=>row.behavior.key.region_code));
    const rows=[...records].sort((a,b)=>priority[a.activity_assessment.category]-priority[b.activity_assessment.category]||a.behavior.key.month.localeCompare(b.behavior.key.month)||a.behavior.key.region_code.localeCompare(b.behavior.key.region_code));
    return `<section class="hav-view" aria-label="5% 활동 범주와 판정 근거"><div class="hav-heading"><h2>${esc(options.title||'5% 기준 활동 범주와 판정 근거')}</h2><span class="hav-rule">전월 대비 5% 감소 기준</span></div><p class="hav-scope">${esc(options.scopeNote||'활동 자료가 있는 지역의 성별·연령별 관측입니다.')} 활동 자료가 있는 ${regions.size}개 지역 · ${records.length}개 관측집단</p>${options.showSummary===false?'':`<div class="hav-summary" role="group" aria-label="활동 범주별 관측 수">${Object.entries(categories).map(([key,label])=>`<button type="button" class="hav-summary-item hav-${key}" data-hav-category="${key}" aria-pressed="false"><span>${label}</span><strong>${summary[key]}<small>건</small></strong></button>`).join('')}</div>`}<div class="hav-toolbar"><button type="button" data-hav-category="all" aria-pressed="true">전체 ${records.length}건 보기</button><span data-hav-filter-status aria-live="polite">전체 범주</span></div><p class="hav-rule-note">통신·카드가 각각 5% 이상 감소하면 동시 감소 관찰, 여기에 2개월 연속 감소 또는 모델의 상대적 이례성이 확인되면 우선 검토 후보입니다. I5·MOIS·C3는 활동 범주를 높이거나 낮추지 않습니다.</p>${rows.length?`<div class="hav-table-scroll"><table class="hav-table"><thead><tr><th>지역·월·집단</th><th>통신 변화율</th><th>카드 변화율</th><th>5% 범주</th><th>판정 근거</th></tr></thead><tbody>${rows.map(row=>rowHTML(row,options.detailActions!==false)).join('')}</tbody></table></div><p class="hav-filter-empty" hidden>선택한 범주에 해당하는 관측이 없습니다.</p>`:`<p class="hav-empty"><b>판정 보류 · 활동 비교 자료 없음</b><br>${esc(options.emptyMessage||'선택한 지역·월·집단의 비교 자료가 없어 활동 범주를 판정할 수 없습니다. 자료 없음은 감소 미포착이나 안전을 뜻하지 않습니다.')}</p>`}<p class="hav-footnote">원자료의 품질 검토 상태를 유지합니다. 범주는 검토 순서이며 개인 고립 판정이나 운영 경보가 아닙니다.${records.length?` 규칙 ${esc(records[0].activity_assessment.rule_version)}`:''}</p></section>`;
  }
  if(typeof document!=='undefined')document.addEventListener('click',event=>{
    const button=event.target.closest('[data-hav-category]');if(!button)return;
    const view=button.closest('.hav-view'),category=button.dataset.havCategory;if(!view)return;
    let visible=0;
    view.querySelectorAll('[data-hav-row]').forEach(row=>{row.hidden=category!=='all'&&row.dataset.havRow!==category;if(!row.hidden)visible++;});
    view.querySelectorAll('[data-hav-category]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    const status=view.querySelector('[data-hav-filter-status]');if(status)status.textContent=category==='all'?'전체 범주':`${categories[category]||'선택 범주'} ${visible}건`;
    const empty=view.querySelector('.hav-filter-empty');if(empty)empty.hidden=visible>0;
  });
  return {load,render,counts,validate,categories};
})();
