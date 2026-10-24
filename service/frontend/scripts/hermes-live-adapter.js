// Inserted inside the supplied HTML's data adapter. Layout and interaction stay intact.
// Browser cases are local; model reads and welfare decisions use the existing server.
  const liveRequests = new Map();
  async function serverJSON(path) {
    const response = await originalFetch(path);
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
  async function liveSupports(input) {
    const s=validate(scopeOf(input));
    const result={scope:s,verified_candidates:[],excluded_candidates:[],unverified_candidates:[],support_fields:[],policy_as_of:input.support_as_of||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),model_observation_month:s.month,application_status:'synthetic_db_research_graph',synthetic:true};
    if(!s.region_code){result.unverified_candidates.push({title:'지역 선택 필요',reason:'시군구 또는 행정동을 선택하면 상위 시군구 활동신호와 I5로 추천 그래프를 실행합니다.'});return result;}
    const code=s.region_code.slice(0,5), sexes=s.sex_codes.length?s.sex_codes:['MAN','WMAN'], ages=s.age_codes.length?s.age_codes:AGES;
    const groups=sexes.flatMap(sex=>ages.map(age=>({sex,age})));
    const merged=new Map(),fields=new Map();
    // Bounded concurrency, per-group decisions are kept distinct in the reasons.
    for(let start=0;start<groups.length;start+=2) {
      const runs=await Promise.all(groups.slice(start,start+2).map(async g=>{
        const params={region_code:code,month:s.month,sex_code:g.sex,age_code:g.age,as_of:result.policy_as_of};
        const data=await once('welfare:'+JSON.stringify(params),()=>serverJSON('/api/model/welfare?'+new URLSearchParams(params)));
        if(data.contract_version!=='welfare_research_pipeline_v1'||data.operational_alert_allowed!==false)throw Error('추천 응답 계약을 확인할 수 없습니다.');
        return {g,data};
      }));
      for(const {g,data} of runs) {
        const label=(g.sex==='MAN'?'남성':'여성')+' '+LABEL[g.age];
        for(const p of data.recommendations) {
          const id=p.version_id;
          const reasons=p.observation_reasons||[];
          const context=label+': '+(data.mapping.reasons||[]).join(' ')+' '+reasons.map(r=>DOM[r.domain]+' '+Number(r.score).toFixed(2)+'점').join(' · ');
          const item=merged.get(id)||{support_id:id,title:p.title,summary:p.support_content,institution:'임시 복지 DB · 가상 사업',url:null,source_hash:null,retrieved_at:result.policy_as_of,synthetic:true,conditions:[],unknown_conditions:[],evidence_ids:[],related_reason:'',groups:[]};
          item.groups.push(label);item.related_reason+=(item.related_reason?'\n':'')+context;
          item.unknown_conditions=[...new Set([...item.unknown_conditions,...p.unconfirmed_conditions.map(x=>({sex:'성별 조건',age:'연령 조건',personal_eligibility:'개인 자격'})[x]||x)])];
          item.conditions=item.unknown_conditions.map(label=>({label,status:'unknown'}));
          item.evidence_ids=[...new Set([...item.evidence_ids,...reasons.flatMap(r=>[r.i5_record_id,r.behavior_record_id]).filter(Boolean)])];
          merged.set(id,item);
          for(const r of reasons)fields.set(r.domain,{domain:r.domain,title:DOM[r.domain]+' 관련 분야',reason:'활동신호별 조사 경로와 I5 참고값의 연구용 연결. I5 고저 임계값은 적용하지 않습니다.',evidence_ids:item.evidence_ids});
        }
        for(const p of data.excluded)result.excluded_candidates.push({title:p.title+' · '+label,reason:p.exclusion_reasons.join(' / ')});
        for(const p of data.held)result.unverified_candidates.push({title:p.title+' · '+label,reason:p.unconfirmed_conditions.join(' / ')||'원문 확인 보류'});
      }
    }
    const terms=(input.query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
    result.verified_candidates=[...merged.values()].filter(p=>terms.every(t=>(p.title+' '+p.summary).toLocaleLowerCase().includes(t)));
    result.support_fields=[...fields.values()];
    return result;
  }
