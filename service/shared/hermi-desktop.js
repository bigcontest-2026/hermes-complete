/* Selected welfare conversations stay separate from regional investigations. */
window.HERMI_WELFARE_CHAT = (() => {
  'use strict';
  function reportFilename(report) {
    let name = String(report.filename || `${report.title || '복지사업_검토보고서'}.md`)
      .split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '').trim().slice(0,160);
    if (!name) name = '복지사업_검토보고서.md';
    return /\.md$/i.test(name) ? name : name+'.md';
  }
  function download(report) {
    if (!report || typeof report.markdown !== 'string' || !report.markdown.trim())
      throw new Error('내려받을 보고서를 먼저 만들어 주세요.');
    const filename = reportFilename(report);
    const url = URL.createObjectURL(new Blob([report.markdown],{type:'text/markdown;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.hidden = true;
    document.body.append(link);
    try {link.click();} finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
    return filename;
  }
  function createSession(program, meta = {}, options = {}) {
    const programId = String(program?.version_id || '').trim();
    if (!programId) throw new Error('대화할 복지사업을 먼저 선택해 주세요.');
    const title = String(program.title || '선택한 복지사업');
    const messages = [{role:'assistant',text:`「${title}」의 등록 자료를 함께 보고 있어요. 지원 내용과 신청 조건을 물어보세요. 대응 보고서는 저장된 지역 분석에 연결해 작성할 수 있어요.`}];
    const history = [];
    let busy = false, failedText = null, latestReport = null;
    async function send(text, requestOptions = {}) {
      const message = String(text || '').trim();
      if (!message) throw new Error('궁금한 내용을 입력해 주세요.');
      if (message.length > 2000) throw new Error('질문은 2,000자 안으로 입력해 주세요.');
      if (busy) throw new Error('답변을 준비하고 있어요. 잠시만 기다려 주세요.');
      const intent = requestOptions.intent || (/보고서|리포트/i.test(message) ? 'report' : 'chat');
      if (!['chat','report'].includes(intent)) throw new Error('요청한 대화 방식을 확인해 주세요.');
      const previous = messages.at(-1);
      if (!(failedText === message && previous?.role === 'user' && previous.text === message))
        messages.push({role:'user',text:message});
      busy = true;
      try {
        let response;
        try {
          response = await fetch('/api/model/welfare/chat',{
            method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},
            body:JSON.stringify({program_version_id:programId,message,history:history.slice(-10),intent}),
          });
        } catch {throw new Error('헤르미에게 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');}
        let result;
        try {result=await response.json();} catch {throw new Error('헤르미의 답변을 확인하지 못했어요. 다시 시도해 주세요.');}
        if (!response.ok) {
          const detail = result?.detail;
          throw new Error(typeof detail==='string' ? detail : detail?.message || '답변을 준비하지 못했어요. 다시 시도해 주세요.');
        }
        if (result?.program_version_id !== programId || result.mode !== 'model' || typeof result.reply !== 'string' || !result.reply.trim())
          throw new Error('선택한 사업의 답변을 확인하지 못했어요. 다시 시도해 주세요.');
        const report = result.report;
        if ((intent==='report' && !report) || (report && (typeof report.title!=='string' || typeof report.markdown!=='string' || !report.markdown.trim())))
          throw new Error('보고서 내용을 확인하지 못했어요. 다시 요청해 주세요.');
        const reply = {role:'assistant',text:result.reply,...(report?{report}: {})};
        messages.push(reply);
        history.push({role:'user',content:message},{role:'assistant',content:Array.from(result.reply).slice(0,8000).join('')});
        if (history.length > 10) history.splice(0,history.length-10);
        if (report) latestReport=report;
        failedText=null;
        return {...result,text:result.reply,role:'assistant'};
      } catch (error) {failedText=message;throw error;} finally {busy=false;}
    }
    return {programId,title,messages,send,get busy(){return busy;},get report(){return latestReport;}};
  }
  return {createSession,download};
})();

/* The starting selector keeps the administrative-dong code intact. */
window.HERMI_DONG_START = (() => {
  'use strict';
  function create(request = path => fetch(path).then(async response => {
    if (!response.ok) throw new Error('지역 목록을 불러오지 못했어요. 다시 시도해 주세요.');
    return response.json();
  })) {
    let regions = [], dongs = [], province = '', region = '', dong = '', revision = 0, catalogRequest;
    const cache = new Map();
    async function loadCatalog(month = '202512') {
      catalogRequest ||= request('/api/model/regions?month=' + month).then(result => {
        if (!Array.isArray(result.regions)) throw new Error('지역 목록을 확인하지 못했어요.');
        regions = result.regions.filter(row => /^\d{5}$/.test(row.code));
        return regions;
      }).catch(error => {catalogRequest = null; throw error;});
      return catalogRequest;
    }
    async function loadDongs(code, month) {
      const key = month + ':' + code;
      if (!cache.has(key)) cache.set(key, (async () => {
        const rows = [], seen = new Set(); let offset = 0, first;
        while (true) {
          const result = await request('/api/model/survey-area?' + new URLSearchParams({level:'administrative_dong',region_code:code,month,limit:'500',offset:String(offset)}));
          if (!Array.isArray(result.records) || typeof result.run_id !== 'string' || !Number.isInteger(result.total_matched))
            throw new Error('행정동 목록을 확인하지 못했어요.');
          first ||= result;
          if (result.run_id !== first.run_id || result.total_matched !== first.total_matched)
            throw new Error('조회 중 지역 자료가 바뀌었어요. 다시 선택해 주세요.');
          for (const row of result.records) {
            if (row.spatial_unit !== 'administrative_dong' || !/^\d{10}$/.test(row.area_code) || row.region_code !== code || row.month !== month || seen.has(row.area_code))
              throw new Error('행정동 목록의 지역·관측월을 확인하지 못했어요.');
            seen.add(row.area_code); rows.push(row);
          }
          if (result.next_offset == null) break;
          if (!Number.isInteger(result.next_offset) || result.next_offset <= offset) throw new Error('행정동 목록의 다음 페이지를 확인하지 못했어요.');
          offset = result.next_offset;
        }
        if (rows.length !== first.total_matched) throw new Error('일부 행정동 목록을 불러오지 못했어요.');
        return rows.sort((a,b) => a.area_name.localeCompare(b.area_name,'ko'));
      })().catch(error => {cache.delete(key); throw error;}));
      return cache.get(key);
    }
    function setProvince(code) {
      revision++; province = code; region = ''; dong = ''; dongs = [];
    }
    async function setRegion(code, month = '202512') {
      const turn = ++revision;
      const found = regions.find(row => row.code === code && (!province || row.province_code === province));
      region = found?.code || ''; province = found?.province_code || province; dong = ''; dongs = [];
      if (!region) return;
      try {
        const rows = await loadDongs(region, month);
        if (turn === revision) dongs = rows;
      } catch (error) {if (turn === revision) throw error;}
    }
    function setDong(code) {dong = dongs.some(row => row.area_code === code) ? code : '';}
    function scope(base = {}) {
      const selected = dongs.find(row => row.area_code === dong), parent = regions.find(row => row.code === region);
      return selected ? {region_level:'administrative_dong',region_code:selected.area_code,
        region_name:[parent?.province_name,parent?.name,selected.area_name].filter(Boolean).join(' '),
        month:base.month || selected.month,sex_codes:[...(base.sex_codes || [])],age_codes:[...(base.age_codes || [])]} : null;
    }
    return {loadCatalog,setProvince,setRegion,setDong,scope,
      reset:()=>setProvince(''),
      get state(){return {regions,dongs,province,region,dong};}};
  }
  return {create};
})();

/* Presentation layer for the supplied desktop chat design.
 * Keep the existing forms, page renderers, evidence API, and local history intact. */
(() => {
  'use strict';
  const icons = {
    chart: '<path d="M4 19V5m0 14h16M8 15v-4m5 4V7m5 8v-6"/>',
    heart: '<path d="M20 5.5c-2-2-5-1.5-8 1.5-3-3-6-3.5-8-1.5S2 11 5 14l7 6 7-6c3-3 3-6.5 1-8.5Z"/>',
    edit: '<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6ZM12 20h8"/>',
    send: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2"/>',
  };
  const svg = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.chart}</svg>`;
  const art = (pose, className = '', alt = '') => `<img class="${className}" src="hermes/hermi/${pose}.png" alt="${alt}" width="180" height="180" decoding="async">`;
  const labels = { agent: '헤르미와 대화', map: '지역 지도', analysis: '근거 분석', welfare: '관련 복지', studio: '복지 대응안', records: '보고서', candidates: '활동 변화 사례' };
  const panelLabels = { analysis: '근거보고서', welfare: '관련 복지', studio: '대응안 초안', records: '보고서' };

  function init() {
    if (document.body.classList.contains('hermi-desktop')) return;
    const get = id => document.getElementById(id);
    const body = document.body;
    body.classList.add('hermi-desktop');
    document.title = 'HERMES · 헤르미와 함께하는 지역 복지';
    let panelPage = S.page === 'agent' ? null : S.page;
    let overviewPage = null;
    let preparingMessage = false;
    let openReportWhenReady = panelPage === 'records';
    const draftEdits = new Map();
    const draftKey = () => get('page-studio').querySelector('[data-live-case-select]')?.value || 'local';
    function rememberDraft() {
      const fields = [...get('page-studio').querySelectorAll('[data-live-draft]')];
      if (fields.length) draftEdits.set(draftKey(), Object.fromEntries(fields.map(field => [field.dataset.liveDraft, field.value])));
    }
    function restoreDraft() {
      const saved = draftEdits.get(draftKey());
      if (!saved) return;
      get('page-studio').querySelectorAll('[data-live-draft]').forEach(field => {
        if (saved[field.dataset.liveDraft] !== undefined) field.value = saved[field.dataset.liveDraft];
      });
    }

    // Retain the original button and its home/reset listener.
    get('home-logo').innerHTML = `${art('guide', 'hermi-brand-art')}<span class="hermi-wordmark">HERMES<small>지역과 복지를 잇다</small></span>`;
    get('home-logo').setAttribute('aria-label', 'HERMES 홈 · 새 대화');
    get('nav').innerHTML = '<button type="button" data-go="agent" class="active">헤르미와 대화</button><button type="button" data-go="dashboard">대시보드</button><button type="button" data-go="welfare-list">복지 리스트</button>';
    const topActions = document.querySelector('.top-actions');
    topActions.querySelectorAll('.mini-pill').forEach(button => { button.hidden = true; });
    const historyButton = get('history-open-btn');
    historyButton.innerHTML = `${svg('history')}<span>대화 이력</span>`;
    topActions.append(historyButton);

    const welcome = get('agent-welcome');
    const emblem = welcome.querySelector('.agent-emblem');
    emblem.className = 'hermi-welcome-art';
    emblem.innerHTML = art('wave', '', '인사하는 헤르미');
    emblem.insertAdjacentHTML('afterend', '<p class="hermi-greeting">안녕하세요, 지역 복지 길잡이 헤르미예요</p>');
    welcome.querySelector('h1').innerHTML = '지역의 변화에서,<br>다음 복지 대응까지.';
    welcome.querySelector('.prompt-sub').textContent = '지역을 살펴보고, 근거를 확인하고, 함께 대응안을 만들어 보세요.';
    const homeForm = get('home-form');
    get('home-input').placeholder = '어느 지역의 어떤 변화를 살펴볼까요?';
    get('home-input').maxLength = 2000;
    get('home-input').setAttribute('aria-label', '헤르미에게 요청');
    const scope = welcome.querySelector('.start-scope');
    homeForm.querySelector('.prompt-bottom').prepend(scope);
    scope.querySelector('.scope-hint').remove();
    const legacyStart = get('start-region');
    legacyStart.closest('label').hidden = true;
    const dongStart = window.HERMI_DONG_START.create();
    let startingDistrict = '';
    const chooser = document.createElement('div');
    chooser.className = 'hermi-dong-start';
    chooser.innerHTML = '<div class="hermi-dong-selects"><label>시도<select data-start-province aria-label="분석할 시도"><option value="">지역 불러오는 중</option></select></label><label>시군구<select data-start-district aria-label="분석할 시군구" disabled><option value="">시군구 선택</option></select></label></div><span class="hermi-dong-status" aria-live="polite">시군구를 선택하거나 질문에 지역을 적어 주세요.</span>';
    scope.prepend(chooser);
    const provinceSelect = chooser.querySelector('[data-start-province]');
    const districtSelect = chooser.querySelector('[data-start-district]');
    const dongStatus = chooser.querySelector('.hermi-dong-status');
    const escapeOption = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const option = (code,name) => `<option value="${escapeOption(code)}">${escapeOption(name)}</option>`;
    function startingRegionScope() {
      const selected = dongStart.state;
      const region = selected.regions.find(row=>row.code===startingDistrict && row.province_code===selected.province);
      if (!region) return null;
      const current = window.HERMES_PAGES.getScope();
      return {region_level:'sgg',region_code:region.code,region_name:[region.province_name,region.name].filter(Boolean).join(' '),month:current.month,sex_codes:[...(current.sex_codes||[])],age_codes:[...(current.age_codes||[])]};
    }
    function renderStartingDongs() {
      const selected = dongStart.state;
      const provinces = [...new Map(selected.regions.map(row=>[row.province_code,row.province_name]))];
      provinceSelect.innerHTML = option('','시도 선택') + provinces.map(([code,name])=>option(code,name)).join('');
      provinceSelect.value = selected.province;
      districtSelect.innerHTML = option('','시군구 선택') + selected.regions.filter(row=>row.province_code===selected.province).map(row=>option(row.code,row.name)).join('');
      districtSelect.value = startingDistrict; districtSelect.disabled = !selected.province;
      const selectedScope = startingRegionScope();
      dongStatus.textContent = selectedScope ? selectedScope.region_name : '시군구를 선택하거나 질문에 지역을 적어 주세요.';
    }
    function syncStartingDong() {
      const selected = startingRegionScope();
      startRegion = selected?.region_code || 'all';
      window.HERMES_AGENT.setStartingScope(selected);
      if (selected) window.HERMES_PAGES.setScope(selected);
      return selected;
    }
    function resetStartingDong() {
      startingDistrict = ''; dongStart.reset(); window.HERMES_AGENT.setStartingScope(null); renderStartingDongs();
    }
    chooser.addEventListener('change',async event=>{
      try {
        if (event.target === provinceSelect) {startingDistrict='';dongStart.setProvince(event.target.value);syncStartingDong();renderStartingDongs();}
        if (event.target === districtSelect) {
          startingDistrict = event.target.value;
          syncStartingDong();renderStartingDongs();
        }
      } catch(error) {renderStartingDongs();dongStatus.textContent = error.message || '지역 목록을 불러오지 못했어요.';}
    });
    const initialDongScope = window.HERMES_PAGES.getScope();
    dongStart.loadCatalog(initialDongScope.month).then(()=>{
      const initialCode = String(initialDongScope.region_code||'').slice(0,5);
      const initialRegion = dongStart.state.regions.find(row=>row.code===initialCode);
      if (initialRegion) {
        dongStart.setProvince(initialRegion.province_code);
        startingDistrict = initialRegion.code;syncStartingDong();
      }
      renderStartingDongs();
    }).catch(error=>{provinceSelect.innerHTML=option('','지역 조회 실패');dongStatus.textContent=error.message;});
    // The supported rule-based mode remains selected. Explain its scope in the details.
    const strategy = get('agent-strategy');
    strategy.hidden = true;
    const send = homeForm.querySelector('.send');
    send.innerHTML = `${svg('send')}<span>분석 시작</span>`;
    send.setAttribute('aria-label', '헤르미에게 분석 요청 보내기');
    homeForm.querySelector('.prompt-bottom > .small')?.remove();
    const suggestions = [
      ['chart', '우리 동 살펴보기', '신사동의 지역 자료와 활동 참고', '서울특별시 강남구 신사동의 지역 자료와 상위 시군구 활동 변화를 분석해 줘'],
      ['heart', '관련 복지 찾아보기', '행정동에 맞는 지원과 조건 확인', '강원특별자치도 춘천시 석사동의 관련 복지사업과 지원 조건을 확인해 줘'],
      ['edit', '복지 대응안 함께 만들기', '기존 사업부터 활용·보완 검토', '서울특별시 강남구 신사동의 지역 자료를 바탕으로 기존 사업을 보완할 대응안을 검토해 줘'],
    ];
    welcome.querySelector('.examples').innerHTML = suggestions.map(([icon, title, description, question]) =>
      `<button class="example" type="button" data-ask="${question}"><span class="hermi-example-icon">${svg(icon)}</span><span class="hermi-example-copy"><b>${title}</b><small>${description}</small></span></button>`).join('');
    const homeNote = document.createElement('div');
    homeNote.className = 'hermi-home-note';
    homeNote.innerHTML = '<p>확인한 자료를 바탕으로, 최종 판단은 담당자와 함께해요.</p>';
    const info = document.querySelector('.html-snapshot-info');
    if (info) homeNote.append(info);
    welcome.append(homeNote);
    document.querySelector('.evidence-api-bar').hidden = true;

    const chat = get('page-agent');
    const workspace = document.createElement('div');
    workspace.className = 'hermi-workspace';
    chat.before(workspace);
    workspace.append(chat);
    const workPanel = document.createElement('aside');
    workPanel.id = 'hermi-work-panel';
    workPanel.setAttribute('aria-label', '대화와 연결된 작업 패널');
    workPanel.innerHTML = `<div class="hermi-panel-header"><div class="hermi-panel-state"><span>함께 보는 자료</span><span class="hermi-panel-caption">대화의 근거를 차근차근</span></div><nav class="hermi-panel-tabs" aria-label="작업 패널">${Object.entries(panelLabels).map(([page, label]) => `<button type="button" data-go="${page}">${label}</button>`).join('')}</nav></div><section class="hermi-work-empty">${art('explore', 'hermi-empty-art', '자료를 살펴보는 헤르미')}<h2>대화 옆에, 필요한 근거를 모아둘게요.</h2><p>지역의 변화를 확인한 뒤 관련 복지와<br>대응안을 같은 흐름에서 살펴보세요.</p><div class="hermi-empty-actions"><button type="button" class="btn" data-go="map">지역 지도 살펴보기</button><button type="button" class="btn" data-go="analysis">근거 분석 열기</button></div><small>분석을 마치면 이곳에서 근거를 확인할 수 있어요.</small></section>`;
    workspace.append(workPanel);
    document.querySelectorAll('.page:not(#page-agent)').forEach(page => workPanel.append(page));
    const mobileSwitch = document.createElement('div');
    mobileSwitch.className = 'hermi-mobile-switch';
    mobileSwitch.setAttribute('aria-label', '대화와 자료 전환');
    mobileSwitch.innerHTML = '<button type="button" data-hermi-view="chat" aria-pressed="true">헤르미와 대화</button><button type="button" data-hermi-view="work" aria-pressed="false">함께 보는 자료</button>';
    workspace.before(mobileSwitch);
    body.dataset.hermiView = 'chat';
    const overview = window.HERMI_OVERVIEW.mount(workspace);

    const convo = get('agent-convo');
    convo.querySelector('.agent-convo-head > div').innerHTML = `<div class="hermi-chat-heading">${art('guide')}<div><h2>헤르미</h2><p class="small">지역의 변화부터, 다음 복지 대응까지</p></div></div>`;
    get('new-chat').innerHTML = `${svg('plus')}<span>새 대화</span>`;
    get('agent-input').placeholder = '궁금한 근거나 보완할 내용을 헤르미에게 알려주세요';
    get('agent-input').setAttribute('aria-label', '헤르미에게 이어서 요청');
    get('agent-input').maxLength = 2000;
    get('agent-form').querySelector('.send').innerHTML = svg('send');
    get('agent-form').querySelector('.send').setAttribute('aria-label', '메시지 보내기');
    get('agent-form').insertAdjacentHTML('afterend', '<p class="hermi-composer-note">Enter로 보내기 · Shift + Enter로 줄바꿈<span>대화는 이 브라우저에 저장돼요</span></p>');
    get('agent-feed').setAttribute('aria-label', '헤르미와 나눈 대화');
    get('agent-feed').setAttribute('aria-live', 'polite');
    get('drawer').hidden = true;
    get('drawer-toggle').hidden = true;
    // A long evidence reply should begin at its question, not hide its summary.
    scrollFeed = function () {
      const feed = get('agent-feed');
      const latestQuestion = [...feed.querySelectorAll('.bubble-row.mine')].at(-1);
      if (latestQuestion) feed.scrollTop += latestQuestion.getBoundingClientRect().top - feed.getBoundingClientRect().top - 12;
    };

    function selectMobile(view) {
      body.dataset.hermiView = view;
      mobileSwitch.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.hermiView === view)));
    }

    function syncLayout() {
      const browsing = !!overviewPage;
      body.classList.toggle('hermi-browsing', browsing);
      workspace.hidden = browsing;
      mobileSwitch.hidden = browsing;
      overview.hidden = !browsing;
      if (browsing) {
        body.classList.remove('hermi-working', 'hermi-landing');
        document.querySelectorAll('#nav [data-go]').forEach(button => {
          const active = button.dataset.go === overviewPage;
          button.classList.toggle('active', active);
          active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
        });
        return;
      }
      const hasChat = S.chat.length > 0;
      const working = hasChat || S.page !== 'agent';
      body.classList.toggle('hermi-working', working);
      body.classList.toggle('hermi-landing', !working);
      chat.classList.add('active');
      welcome.style.display = working ? 'none' : 'flex';
      convo.classList.toggle('on', working);
      workPanel.hidden = !working;
      workPanel.querySelector('.hermi-work-empty').hidden = !!panelPage;
      workPanel.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === 'page-' + panelPage));
      workPanel.querySelectorAll('[data-go]').forEach(button => {
        button.classList.toggle('active', button.dataset.go === panelPage);
        button.setAttribute('aria-pressed', String(button.dataset.go === panelPage));
      });
      document.querySelectorAll('#nav [data-go]').forEach(button => {
        const active = button.dataset.go === 'agent';
        button.classList.toggle('active', active);
        active ? button.setAttribute('aria-current', 'page') : button.removeAttribute('aria-current');
      });
      // The persistent left conversation replaces the old right-hand drawer.
      S.drawerPreferred = false;
      setDrawerVisible(false);
      const lastUser = [...S.chat].reverse().find(message => message.role === 'user');
      const subtitle = convo.querySelector('.agent-convo-head .small');
      subtitle.textContent = lastUser ? '대화의 맥락을 이어서 살펴보고 있어요' : '어느 지역을 함께 살펴볼까요?';
      convo.querySelector('h2').textContent = '헤르미';
    }

    function decorateChat() {
      get('agent-feed').querySelectorAll('.agent-mark').forEach(mark => {
        const pending = mark.parentElement.querySelector('.evidence-pending');
        mark.innerHTML = art(pending ? 'think' : 'guide');
        mark.setAttribute('aria-hidden', 'true');
      });
      get('agent-feed').querySelectorAll('.bubble.assistant').forEach(bubble => {
        window.HERMI_ANSWER.apply(bubble);
        if (!bubble.previousElementSibling?.classList.contains('hermi-author')) {
          // Keep message HTML untouched: review actions serialize this content to history.
          bubble.setAttribute('aria-label', '헤르미의 답변');
        }
      });
      if (!S.chat.length) get('agent-feed').innerHTML = `<div class="hermi-chat-empty">${art('happy', '', '함께할 준비가 된 헤르미')}<h3>안녕하세요, 헤르미예요.</h3><p>오른쪽에서 자료를 살펴보거나,<br>궁금한 지역과 대상을 알려주세요.</p></div>`;
    }

    const originalNavigate = navigate;
    navigate = function (page) {
      if (page === 'dashboard' || page === 'welfare-list') {
        if (S.page === 'studio') rememberDraft();
        overviewPage = page;
        S.page = page;
        setHistoryOpen(false);
        syncLayout();
        const url = new URL(location.href);
        url.searchParams.set('page', page);
        history.replaceState(null, '', url.pathname + url.search);
        window.HERMI_OVERVIEW.show(page);
        window.scrollTo({top:0,behavior:'instant'});
        return;
      }
      overviewPage = null;
      const previousPage = panelPage;
      if (page === 'records' && previousPage !== 'records') openReportWhenReady = true;
      if (S.page === 'studio') rememberDraft();
      if (page !== 'agent') panelPage = page;
      else if (!S.chat.length) panelPage = null;
      // Retain the selected work page when the next message returns to the agent.
      const target = page === 'agent' && S.chat.length && panelPage ? panelPage : page;
      if (!(page === 'agent' && S.page === target && S.chat.length)) originalNavigate(target);
      if (previousPage !== panelPage) workPanel.scrollTop = 0;
      decorateChat();
      syncLayout();
      if (!preparingMessage) selectMobile(page === 'agent' ? 'chat' : 'work');
    };
    const originalRender = renderMainChat;
    renderMainChat = function () {
      originalRender();
      decorateChat();
      syncLayout();
    };
    const originalAddChat = addChat;
    addChat = function (question) {
      originalAddChat(question);
      selectMobile('chat');
      decorateChat();
      syncLayout();
    };
    const originalTitle = updateConversationTitle;
    updateConversationTitle = function () {
      originalTitle();
      convo.querySelector('h2').textContent = '헤르미';
    };
    const originalHome = goToMain;
    goToMain = function () {
      rememberDraft();
      window.HERMES_PAGES.resetCase();
      panelPage = null;
      originalHome();
      resetStartingDong();
      setHistoryOpen(false);
      syncLayout();
      selectMobile('chat');
    };
    // Some original controls captured the old home function as a listener.
    [get('home-logo'), get('history-new-chat')].forEach(button => button.addEventListener('click', () => {
      rememberDraft();
      window.HERMES_PAGES.resetCase();
      panelPage = null;
      resetStartingDong();
      setHistoryOpen(false);
      syncLayout();
      selectMobile('chat');
    }));
    historyButton.addEventListener('click', () => {
      if (overviewPage) { navigate('agent'); setHistoryOpen(true); }
      if (body.classList.contains('hermi-working')) selectMobile('chat');
    });
    const originalRestore = restoreChatThread;
    restoreChatThread = function (id) {
      rememberDraft();
      window.HERMES_PAGES.resetCase();
      panelPage = null;
      originalRestore(id);
      setHistoryOpen(false);
      selectMobile('chat');
      const thread = chatThreads.find(item => item.id === id);
      const caseId = [...(thread?.messages || [])].reverse().find(message => message.investigationRefs?.length)?.investigationRefs?.at(-1);
      if (caseId) window.HERMES_PAGES.openCase(caseId).then(() => {
        if (activeThreadId !== id) return;
        preparingMessage = true;
        navigate('analysis');
        preparingMessage = false;
      }).catch(() => { /* Restored chat remains readable if its case cannot be opened. */ });
      syncLayout();
    };
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-hermi-view]');
      if (button) selectMobile(button.dataset.hermiView);
    });
    document.addEventListener('input', event => {
      if (event.target.matches('[data-live-draft]')) rememberDraft();
    });
    window.addEventListener('hermes-investigation-saved', event => {
      if (event.detail.threadId !== activeThreadId) return;
      const record = event.detail.records?.at(-1);
      if (!record?.briefs?.length) return;
      if (overviewPage) return;
      if (panelPage === 'studio') rememberDraft();
      preparingMessage = true;
      navigate(panelPage || 'analysis');
      preparingMessage = false;
    });
    window.addEventListener('hermes-page-ready', event => {
      const page = get('page-' + event.detail.page);
      if (event.detail.page === 'studio') restoreDraft();
      if (event.detail.page === 'records' && openReportWhenReady) {
        openReportWhenReady = false;
        page.querySelector('[data-live-record-tab="report"]')?.click();
      }
      const heading = page.querySelector('.page-head h1');
      if (heading) heading.textContent = labels[event.detail.page];
      const caption = workPanel.querySelector('.hermi-panel-caption');
      const month = event.detail.scope.month;
      caption.textContent = `자료 기준 ${month.slice(0, 4)}년 ${Number(month.slice(4))}월`;
      syncLayout();
    });
    // Scope remains the existing server-backed selection, including query-string links.
    setHistoryOpen(false);
    decorateChat();
    syncLayout();
    if (panelPage) selectMobile('work');
    const requestedPage = new URLSearchParams(location.search).get('page');
    if (requestedPage === 'dashboard' || requestedPage === 'welfare-list') navigate(requestedPage);
  }

  window.HERMES_HTML_READY.then(init).catch(error => {
    console.error('Hermi desktop initialization failed', error);
  });
})();
