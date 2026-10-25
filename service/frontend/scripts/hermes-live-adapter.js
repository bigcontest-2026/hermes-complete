// Inserted inside the supplied HTML's data adapter. Layout and interaction stay intact.
// Browser cases are local; model reads and welfare decisions use the existing server.
  const liveRequests = new Map();
  async function serverJSON(path, options) {
    const response = await originalFetch(path, options);
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('모델 서버에 연결되지 않았습니다. API 실행 상태를 확인해 주세요.');
    const data = await response.json();
    if (!response.ok) throw Error(data.detail?.message || (typeof data.detail === 'string' ? data.detail : '실제 근거 조회 실패: '+response.status));
    return data;
  }
  function once(key, request) {
    if (!liveRequests.has(key)) liveRequests.set(key, request().catch(error=>{liveRequests.delete(key);throw error;}));
    return liveRequests.get(key).then(clone);
  }
  async function serverPages(path, params) {
    if(path==='behavior')return window.HERMES_ACTIVITY_VIEW.load(params);
    return once(path+JSON.stringify(params), async()=>{
      const rows=[]; let offset=0, first;
      while (true) {
        const page=await serverJSON('/api/model/'+path+'?'+new URLSearchParams({...params,offset:String(offset)}));
        first ||= page;
        if(page.run_id!==first.run_id || page.total_matched!==first.total_matched)throw Error('조회 도중 자료 버전이 바뀌었습니다. 새로고침해 주세요.');
        rows.push(...page.records);
        if(page.next_offset==null)break;
        if(page.next_offset<=offset)throw Error('자료 페이지 순서를 확인할 수 없습니다.');
        offset=page.next_offset;
      }
      if(rows.length!==first.total_matched)throw Error('일부 근거를 불러오지 못했습니다.');
      return {...first,records:rows,next_offset:null};
    });
  }
  async function livePacket(input) {
    const p=packet(input), s=p.scope;
    const code=s.region_code?.slice(0,5);
    const [survey,activity]=await Promise.all([
      serverPages('survey-area',{level:s.region_level==='national'?'sgg':s.region_level,month:s.month,limit:'500',...(code?{region_code:code}:{}),...(s.region_level==='administrative_dong'?{dong_code:s.region_code}:{})}),
      serverPages('behavior',{limit:'100',...(code?{region_code:code}:{})})
    ]);
    const all=activity.records.filter(r=>groupMatch(r.behavior.key,s)&&ageMatch(r.behavior.key,s));
    const selected=all.filter(r=>r.behavior.key.month===s.month);
    p.i5=survey.records;
    p.activity=s.region_level==='administrative_dong'?[]:selected;
    p.parent_activity=s.region_level==='administrative_dong'?selected:[];
    // Reconstruct source monthly levels from server observations, never from rate averages.
    const monthly=new Map();
    for(const {behavior:r} of all) {
      if(r.key.month<=s.month)monthly.set(JSON.stringify(r.key),{key:r.key,skt:r.sources.skt.activity_daily,card_a:r.sources.card_a.activity_daily});
      const previous={...r.key,month:String(Number(r.key.month)-1)};
      if(previous.month>='202507'&&previous.month<=s.month&&!monthly.has(JSON.stringify(previous)))monthly.set(JSON.stringify(previous),{key:previous,skt:r.sources.skt.previous_activity_daily,card_a:r.sources.card_a.previous_activity_daily});
    }
    p.monthly=[...monthly.values()];
    p.live_run_ids={i5:survey.run_id,activity:activity.run_id};
    p.data_mode='live_model_with_labelled_attached_context';
    p.contexts=p.contexts.map(c=>({...c,note:c.note+' · 첨부 HTML에 포함된 보관 자료입니다. 현재 서버의 신규 조사 결과가 아닙니다.'}));
    p.source_availability=p.source_availability.map(x=>x.source==='i5'?{...x,status:p.i5.length?'available':'no_records'}:x.source==='v3'?{...x,status:selected.length?'available':'no_records'}:x.source==='c3'?{...x,status:selected.some(r=>r.historical_reference)?'available':'no_records'}:x);
    p.analysis_status=p.i5.length||selected.length||p.dong_skt.length?'available':'no_observations';
    return p;
  }
  const stableAnalysisValue=value=>JSON.stringify(value===undefined?null:Array.isArray(value)?value.map(item=>JSON.parse(stableAnalysisValue(item))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(stableAnalysisValue(value[key]))])):value);
  function validateAnalysisResearch(base,result) {
    if(!result||typeof result.report_id!=='string'||!result.report_id||typeof result.markdown!=='string'||result.report_type!=='context_cause_analysis'||result.storage_status!=='saved'||!['completed','no_evidence'].includes(result.context_investigation_status)||result.context_investigation?.status!==result.context_investigation_status||result.parent_report_id!==(base.parent_report_id||base.report_id))throw Error('원인 조사 보고서의 저장 결과를 확인할 수 없습니다.');
    for(const key of ['scope','region_name','rule_version','threshold_percent','assessments','activity_availability','report_status','context','provenance','quality_status','operational_alert_allowed','lifecycle_interpretation'])if(stableAnalysisValue(base[key])!==stableAnalysisValue(result[key]))throw Error('원인 조사 보고서의 관측 범위 또는 근거가 달라졌습니다.');
    return result;
  }
  async function liveAnalysisReports(input) {
    const s=validate(scopeOf(input));
    if(!s.region_code)return [];
    // Keep the selected dong for I5/report context; activity remains its parent SGG.
    const code=s.region_code.slice(0,5);
    const dong=s.region_level==='administrative_dong'?s.region_code:null;
    const sexes=s.sex_codes.length===1?s.sex_codes:[null];
    const ages=s.age_codes.length&&s.age_codes.length<AGES.length?[...new Set(s.age_codes)]:[null];
    const reports=[],seen=new Set(),missing=new Set();
    for(const sex of sexes)for(const age of ages) {
      const request={region_code:code,...(dong?{dong_code:dong}:{}),month:s.month,...(sex?{sex_code:sex}:{}),...(age?{age_code:age}:{})};
      const baseline=await serverJSON('/api/model/analysis-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)});
      if(typeof baseline.report_id!=='string'||!baseline.report_id||baseline.threshold_percent!==5||!Array.isArray(baseline.assessments)||baseline.operational_alert_allowed!==false||typeof baseline.rule_version!=='string')throw Error('현황 보고서 응답 계약을 확인할 수 없습니다.');
      if(baseline.scope?.region_code!==code||(baseline.scope?.dong_code||null)!==dong||baseline.scope?.month!==s.month)throw Error('현황 보고서의 지역 또는 관측월이 요청과 다릅니다.');
      const requested=(sex?[sex]:['MAN','WMAN']).flatMap(value=>(age?[age]:AGES).map(group=>value+':'+group));
      const observed=new Set();
      for(const row of baseline.assessments) {
        if(row.scope?.region_code!==code||row.scope?.dong_code||row.scope?.month!==s.month||!['MAN','WMAN'].includes(row.scope?.sex_code)||!AGES.includes(row.scope?.age_code)||sex&&row.scope?.sex_code!==sex||age&&row.scope?.age_code!==age||row.operational_alert_allowed!==false)throw Error('현황 보고서의 집단별 근거가 요청 범위와 다릅니다.');
        const key=row.scope.sex_code+':'+row.scope.age_code;
        if(seen.has(key)||missing.has(key))throw Error('현황 보고서에 같은 집단이 중복되었습니다.');
        seen.add(key);observed.add(key);
      }
      const availability=baseline.activity_availability;
      if(dong&&availability) {
        if(!['available','partial','unavailable'].includes(availability.status)||availability.spatial_unit!=='sgg'||availability.region_code!==code||availability.requested_group_count!==requested.length||availability.observed_group_count!==observed.size||!Array.isArray(availability.missing_groups))throw Error('현황 보고서의 활동 자료 범위를 확인할 수 없습니다.');
        const absent=new Set();
        for(const group of availability.missing_groups) {
          const key=group.sex_code+':'+group.age_code;
          if(!requested.includes(key)||seen.has(key)||missing.has(key)||absent.has(key))throw Error('현황 보고서의 누락 집단 범위가 요청과 다릅니다.');
          absent.add(key);
        }
        const status=!observed.size?'unavailable':absent.size?'partial':'available';
        if(status!==availability.status||observed.size+absent.size!==requested.length||requested.some(key=>!observed.has(key)&&!absent.has(key)))throw Error('현황 보고서의 활동 자료 범위를 확인할 수 없습니다.');
        if(absent.size&&(baseline.report_status!=='partial'||baseline.context?.i5?.status!=='available'||baseline.context.i5.record?.area_code!==dong||baseline.context.i5.record?.spatial_unit!=='administrative_dong'))throw Error('활동 자료가 없는 보고서의 행정동 I5를 확인할 수 없습니다.');
        for(const key of absent)missing.add(key);
        if(!observed.size) {
          if(baseline.context_investigation_status!=='not_applicable')throw Error('활동 자료가 없는 보고서의 조사 상태를 확인할 수 없습니다.');
          reports.push(baseline);continue;
        }
      }
      try {
        const enriched=await serverJSON('/api/model/analysis-reports/'+encodeURIComponent(baseline.report_id)+'/investigate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        reports.push(validateAnalysisResearch(baseline,enriched));
      } catch(error) {
        // The saved observation remains available; this is explicitly an incomplete investigation.
        reports.push({...baseline,investigation_error:error.message||'지역 맥락·원인 조사를 완료하지 못했습니다.'});
      }
    }
    const expected=(s.sex_codes.length===1?s.sex_codes:['MAN','WMAN']).flatMap(sex=>(s.age_codes.length?[...new Set(s.age_codes)]:AGES).map(age=>sex+':'+age));
    if(expected.length!==seen.size+missing.size||expected.some(key=>!seen.has(key)&&!missing.has(key)))throw Error('현황 보고서에 선택한 집단의 일부가 빠졌습니다.');
    return reports;
  }
  function liveResearchDetails(reports) {
    const investigations=reports.filter(r=>['completed','no_evidence'].includes(r.context_investigation_status)).map(r=>r.context_investigation);
    const eligible=reports.filter(r=>r.context_investigation_status!=='not_applicable');
    const notApplicable=reports.length>0&&!eligible.length;
    return {investigations,not_applicable:notApplicable,observed:investigations.flatMap(r=>(r.observed_context||[]).map(v=>v.text)),
      causes:investigations.flatMap(r=>(r.possible_causes||[]).map(v=>v.title+': '+v.explanation)),
      questions:investigations.flatMap(r=>r.verification_questions||[]),
      summary:notApplicable?'상위 시군구 활동 자료가 없어 활동 변화의 원인 조사는 수행하지 않았습니다.':reports.length?`지역 맥락·원인 조사: ${investigations.length}건 완료${eligible.length>investigations.length?' · '+(eligible.length-investigations.length)+'건 미완료. 저장된 관측 보고서에서 다시 조사할 수 있습니다.':'. 근거와 가능한 설명을 구분해 보고서에 저장했습니다.'}`:''};
  }
  if(typeof window!=='undefined')window.addEventListener('hermes-analysis-report-updated',event=>{
    const {previous_id,report}=event.detail||{};
    if(!previous_id||!report)return;
    const changed=[];
    for(const record of cases)for(const brief of record.briefs||[]) {
      const index=(brief.server_analysis_reports||[]).findIndex(item=>item.report_id===previous_id);
      if(index<0)continue;
      try{validateAnalysisResearch(brief.server_analysis_reports[index],report);}catch{continue;}
      brief.server_analysis_reports[index]=clone(report);
      const research=liveResearchDetails(brief.server_analysis_reports);
      brief.summary=brief.summary.filter(text=>!text.startsWith('지역 맥락·원인 조사:'));
      brief.summary.push(research.summary);
      brief.investigation.alternative_explanations=research.causes.length?research.causes:['확인한 공개 근거만으로 활동 변화의 원인을 특정하지 못했습니다.'];
      brief.investigation.verification_questions=research.questions;
      brief.model_called=research.investigations.length>0;
      changed.push(record.case_id);
    }
    if(changed.length){try{persist();}catch{ return; }for(const caseId of new Set(changed))window.dispatchEvent(new CustomEvent('hermes-case-updated',{detail:{caseId}}));}
  });
  async function liveBriefFor(c) {
    const p=await livePacket(c.request),s=p.scope;
    const reports=await liveAnalysisReports(c.request);
    for(const report of reports)if(p.live_run_ids&&(report.provenance?.activity?.run_id!==p.live_run_ids.activity||report.provenance?.survey?.run_id!==p.live_run_ids.i5))throw Error('활동 화면과 현황 보고서의 자료 버전이 다릅니다. 새로고침 후 다시 확인해 주세요.');
    const assessments=reports.flatMap(r=>r.assessments),research=liveResearchDetails(reports);
    const purpose=c.request.purpose||'';
    const firstReportRequested=/(?:현황|원인).*(?:보고서)|보고서.*(?:현황|원인)/.test(purpose);
    const supportRequested=!firstReportRequested&&/복지|정책|지원|사업|대응안/.test(purpose);
    let support={verified_candidates:[],excluded_candidates:[],unverified_candidates:[],support_fields:[]};
    if(supportRequested) {
      try { support=await liveSupports(c.request); }
      catch(error) { support.unverified_candidates.push({title:'후속 복지 조회 미완료',reason:error.message||'복지 자료를 조회하지 못했습니다. 현황 보고서는 서버에 저장되었습니다.'}); }
    }
    const name=p.i5.length===1?p.i5[0].area_name:s.region_code||'전국';
    const label=s.age_codes.map(a=>LABEL[a]).join('·')||'전체 연령';
    const observed=p.activity.concat(p.parent_activity).map(x=>x.behavior.explanation);
    if(p.i5.length===1)observed.unshift(`${name} I5 ${Number(p.i5[0].isolation_index).toFixed(2)}점: 지역 전체 인구구성 참고값이며 ${label} 전용 점수가 아닙니다.`);
    const reasons=assessments.flatMap(a=>[`${a.scope.sex_code==='MAN'?'남성':'여성'} ${LABEL[a.scope.age_code]||a.scope.age_code}: ${a.category_label}`,...(a.reasons||[])]);
    if(s.region_level==='administrative_dong')reasons.unshift(`I5는 선택 행정동의 인구구성 참고값입니다. 활동 범주·C3·MOIS는 상위 시군구 ${s.region_code.slice(0,5)}의 참고 자료이며, 행정동의 직접 활동 관측으로 옮기지 않습니다.`);
    if(!s.region_code)reasons.push('전국 조회는 지역 배경 탐색입니다. 행정동을 선택하면 해당 동의 현황 보고서를 서버에 생성·저장합니다.');
    const ids=[...new Set([...p.i5.map(r=>r.record_id),...assessments.flatMap(a=>a.evidence_ids||[])])];
    const summary=[`${name}의 ${s.month.slice(0,4)}년 ${Number(s.month.slice(4))}월 ${label} 관측을 확인했습니다.`];
    if(reports.length&&!assessments.length&&reports.every(report=>report.activity_availability?.status==='unavailable')) {
      summary.push(`선택 행정동의 I5를 담은 부분 현황 보고서 ${reports.length}건을 서버에 저장했습니다. 상위 시군구 활동 자료가 없어 활동 범주를 판정하지 않았습니다.`);
    } else if(reports.length) {
      summary.push(`서버의 5% 감소 기준으로 ${assessments.length}개 집단을 구분하고 현황 보고서 ${reports.length}건을 서버에 저장했습니다.`);
      const labels=[...new Set(assessments.map(a=>a.category_label))];
      summary.push(labels.map(label=>`${label} ${assessments.filter(a=>a.category_label===label).length}개 집단`).join(' · '));
    } else summary.push('행정동을 선택하면 동별 참고지수와 상위 시군구 활동을 담은 현황 보고서를 확인할 수 있습니다.');
    if(research.summary)summary.push(research.summary);
    observed.push(...research.observed);
    if(supportRequested)summary.push(`후속 복지 조회: 후보 ${support.verified_candidates.length}건. 개인 자격과 현재 접수 여부는 별도 확인이 필요합니다.`);
    summary.push('원자료 확인이 필요한 상태를 유지합니다. 활동 변화의 검토 범주이며 개인 고립 판정이나 운영 경보가 아닙니다.');
    return {brief_id:'html_brief_'+c.case_id,brief_version:1,execution_id:c.executions.at(-1).execution_id,case_id:c.case_id,scope:s,summary,model_evidence:p,server_analysis_reports:reports,activity_assessments:assessments,investigation:{observed_facts:observed,judgment_reasons:reasons,alternative_explanations:research.causes.length?research.causes:[research.not_applicable?'상위 시군구 활동 관측이 없어 변화 원인을 조사하지 않았습니다.':research.investigations.length?'확인한 공개 근거만으로 활동 변화의 원인을 특정하지 못했습니다.':'지역 맥락·원인 조사를 완료하지 못했습니다. 저장된 관측 보고서에서 다시 조사할 수 있습니다.'],verification_questions:research.questions.length?research.questions:['원자료 품질과 관측 범위, 지역 사정을 담당자가 확인해 주세요.'],evidence_ids:ids},evidence_ids:ids,support_candidates:support.verified_candidates,support_fields:support.support_fields,excluded_candidates:[...support.excluded_candidates,...support.unverified_candidates],strategy:'server_signal_rules_with_context_research',model_called:research.investigations.length>0,quality_status:'hold',operational_alert_allowed:false,created_at:now()};
  }
  function supportSourceURL(value) {
    try { const url=new URL(value); return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.href:null; } catch { return null; }
  }
  async function liveSupports(input) {
    const s=validate(scopeOf(input));
    const result={scope:s,verified_candidates:[],excluded_candidates:[],unverified_candidates:[],support_fields:[],policy_as_of:input.support_as_of||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),model_observation_month:s.month,application_status:'db_research_graph',synthetic:null};
    if(!s.region_code){result.unverified_candidates.push({title:'지역 선택 필요',reason:'시군구 또는 행정동을 선택하면 상위 시군구 활동신호와 I5로 추천 그래프를 실행합니다.'});return result;}
    const code=s.region_code.slice(0,5), sexes=s.sex_codes.length?s.sex_codes:['MAN','WMAN'], ages=s.age_codes.length?s.age_codes:AGES;
    const groups=sexes.flatMap(sex=>ages.map(age=>({sex,age})));
    const merged=new Map(),fields=new Map(),corpusKinds=new Set(),mappingHolds=new Set();
    // Bounded concurrency, per-group decisions are kept distinct in the reasons.
    for(let start=0;start<groups.length;start+=2) {
      const runs=await Promise.all(groups.slice(start,start+2).map(async g=>{
        const params={region_code:code,month:s.month,sex_code:g.sex,age_code:g.age,as_of:result.policy_as_of};
        const data=await once('welfare:'+JSON.stringify(params),()=>serverJSON('/api/model/welfare?'+new URLSearchParams(params)));
        if(data.contract_version!=='welfare_research_pipeline_v1'||data.operational_alert_allowed!==false)throw Error('추천 응답 계약을 확인할 수 없습니다.');
        return {g,data};
      }));
      for(const {g,data} of runs) {
        if(typeof data.welfare_data_synthetic==='boolean')corpusKinds.add(data.welfare_data_synthetic);
        if(data.status==='held'&&data.mapping_status==='unconfigured') {
          const reason=(data.mapping.reasons||[]).at(-1)||'사업 분류와 분석 영역을 연결하는 기준을 확인해야 합니다. 복지 목록에서 실제 사업을 검색할 수 있습니다.';
          if(!mappingHolds.has(reason)) {
            mappingHolds.add(reason);
            result.unverified_candidates.push({title:'추천 연결 기준 확인 필요',reason});
          }
        }
        const label=(g.sex==='MAN'?'남성':'여성')+' '+LABEL[g.age];
        for(const p of data.recommendations) {
          const id=p.version_id;
          const reasons=p.observation_reasons||[];
          const serviceReasons=p.recommendation_reasons||[];
          const context=label+': '+(data.mapping.reasons||[]).join(' ')+' '+serviceReasons.map(r=>r.reason||r.content_reason||r.service_action).filter(Boolean).join(' · ');
          const synthetic=typeof p.is_synthetic==='boolean'?p.is_synthetic:typeof data.welfare_data_synthetic==='boolean'?data.welfare_data_synthetic:null;
          if(synthetic!==null)corpusKinds.add(synthetic);
          const item=merged.get(id)||{support_id:id,title:p.title,summary:p.support_content,institution:synthetic===true?'예시 복지사업 자료':p.institution||p.source?.name||'출처 확인 필요',url:synthetic===false?supportSourceURL(p.source_url):null,source_url_type:p.source_url_type||null,source_hash:p.source_hash||null,retrieved_at:p.retrieved_at||null,synthetic,conditions:[],unknown_conditions:[],evidence_ids:[],related_reason:'',groups:[]};
          item.groups.push(label);item.related_reason+=(item.related_reason?'\n':'')+context;
          item.unknown_conditions=[...new Set([...item.unknown_conditions,...p.unconfirmed_conditions.map(x=>({sex:'성별 조건',age:'연령 조건',personal_eligibility:'개인 자격'})[x]||x)])];
          item.conditions=item.unknown_conditions.map(label=>({label,status:'unknown'}));
          item.evidence_ids=[...new Set([...item.evidence_ids,...reasons.flatMap(r=>[r.i5_record_id,r.behavior_record_id]),...(p.support_links||p.service_links||[]).map(r=>r.support_evidence_id)].filter(Boolean))];
          merged.set(id,item);
          const categoryMapping=data.mapping.category_mapping;
          if(categoryMapping)for(const category of categoryMapping.categories) {
            const matched=(p.service_links||p.support_links||[]).some(link=>(link.category_code||link.category_id)===category.category_code);
            if(matched)fields.set(category.category_code,{domain:category.category_code,title:category.label||category.category_name||category.category_code,reason:category.reason,evidence_ids:item.evidence_ids});
          }
          else for(const r of reasons)fields.set(r.domain,{domain:r.domain,title:DOM[r.domain]+' 관련 분야',reason:'활동 변화와 지역의 생활·관계 여건을 함께 참고해 살펴볼 사업입니다.',evidence_ids:item.evidence_ids});
        }
        for(const p of data.excluded)result.excluded_candidates.push({title:p.title+' · '+label,reason:p.exclusion_reasons.join(' / ')});
        for(const p of data.held)result.unverified_candidates.push({title:p.title+' · '+label,reason:p.unconfirmed_conditions.join(' / ')||'원문 확인 보류'});
      }
    }
    const terms=(input.query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    result.verified_candidates=[...merged.values()].filter(p=>terms.every(t=>(p.title+' '+p.summary).toLocaleLowerCase().includes(t)));
    result.support_fields=[...fields.values()];
    result.synthetic=corpusKinds.has(true)?true:corpusKinds.has(false)?false:null;
    result.application_status=result.synthetic===true?'synthetic_db_research_graph':'db_research_graph';
    return result;
  }
