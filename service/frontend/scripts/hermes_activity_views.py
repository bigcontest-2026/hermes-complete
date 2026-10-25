"""Keep read-only dashboard, evidence and observation views on the server 5% rule."""
from pathlib import Path


ACTIVITY = r'''  function activityHtml(p){
    const rows=p.activity.length?p.activity:p.parent_activity;
    const parent=p.scope.region_level==='administrative_dong';
    const scopeNote=parent?'선택 행정동의 상위 시군구 참고입니다. 이 범주를 행정동이나 주민 개인의 판정으로 옮기지 않습니다.':'선택한 지역·월·성별·연령의 시군구 관측입니다.';
    return window.HERMES_ACTIVITY_VIEW.render(rows,{title:'활동 범주와 판정 근거',scopeNote,detailActions:false})+detail('활동량·월별 흐름·C3 원본 관측',activityRawHtml(p));
  }
'''

ANALYSIS = r'''  function analysisHTML(p){
    if(selectedProvince&&!scope.region_code)p={...p,activity:p.activity.filter(({behavior:r})=>r.key.region_code.startsWith(selectedProvince)),i5:p.i5.filter(r=>(r.region_code||r.area_code).startsWith(selectedProvince))};
    const facts=p.source_availability.map(s=>`${window.HERMI_COPY.source(s.source)}: ${s.status==='available'?'근거 확인':s.status==='verification_failed'?'검증 실패':'해당 범위 미제공'}`);
    return `${A.activityHtml(p)}${panel('설문 기반 지역 참고지수',A.i5Html(p))}${panel('이 변화는 어떻게 해석하나요?',`<p>위 범주와 판정 근거는 현황 보고서와 같은 서버의 5% 감소 규칙으로 계산합니다. 지역 전체 I5와 인구구성은 배경 자료이며 활동 범주에 합산하지 않습니다.</p><p>날씨·행사 등 변화의 원인은 추가 자료를 확인해야 합니다. 자료가 없는 지역·집단은 안전이나 감소 미포착으로 분류하지 않습니다.</p>${list(facts)}${p.contexts.map(c=>`<p>${esc(window.HERMI_COPY.source(c.family))} · ${esc(c.period)} · ${esc(c.observed_level)} · ${esc(c.note)}</p>`).join('')}<div class="live-actions">${action('이 지역을 에이전트에서 조사','data-live-ask-scope',true)}${action('전체 관측 사례','data-go="candidates"')}${action('관련 공식 복지','data-go="welfare"')}</div>`)}${statusLine(p)}`;
  }
'''

SIGNALS = r'''  async function signalsHTML(){
    const filters={};if(scope.region_code)filters.region_code=scope.region_code.slice(0,5);if(signalMonths!=='all')filters.month=scope.month;
    const result=await window.HERMES_ACTIVITY_VIEW.load(filters);
    const rows=result.records.filter(({behavior:r})=>(scope.region_code||!selectedProvince||r.key.region_code.startsWith(selectedProvince))&&(!scope.sex_codes.length||scope.sex_codes.includes(r.key.sex_code))&&(!scope.age_codes.length||scope.age_codes.includes(r.key.age_code)));
    return `<div class="live-actions"><label>비교월 <select data-live-signal-months><option value="selected">선택한 월</option><option value="all" ${signalMonths==='all'?'selected':''}>전체 비교월</option></select></label></div>${window.HERMES_ACTIVITY_VIEW.render(rows,{title:'활동 관측 목록 · 5% 범주',scopeNote:scope.region_level==='administrative_dong'?'선택 행정동의 상위 시군구 관측입니다. 행정동 판정으로 해석하지 않습니다.':'선택 범위에 실제 활동 자료가 있는 지역·월·집단만 집계합니다.'})}${heatmap(rows,'skt','통신')}${heatmap(rows,'card_a','카드')}<p class="live-meta">${esc(result.run_id)} · 관측 자료와 동일한 서버 분류 · 7월은 전월 비교 자료가 없어 활동 범주를 판정할 수 없습니다.</p>`;
  }
'''


def replace_block(html, start, end, replacement):
    first = html.find(start)
    last = html.find(end, first)
    if first < 0 or last < 0:
        raise ValueError(f'Missing activity view boundary: {start}')
    return html[:first] + replacement + html[last:]


def patch_activity_views(html):
    includes = '<link rel="stylesheet" href="hermi-activity-view.css"><script src="hermi-activity-view.js"></script>'
    if '<script src="hermi-activity-view.js"></script>' not in html:
        html = html.replace('</head>', includes + '</head>')
    if '  function activityRawHtml(p){' not in html:
        first = html.find('  function activityHtml(p){')
        last = html.find('  function policyHtml(', first)
        if first < 0 or last < 0:
            raise ValueError('Missing raw activity function')
        raw = html[first:last].replace('  function activityHtml(p){', '  function activityRawHtml(p){', 1)
        # Preserve numeric original observations, but remove the legacy Q>0 flag columns.
        raw = raw.replace("['지역·집단','통신 전월비','카드 전월비','동시 감소','상대 급감','연속 관측']", "['지역·집단','통신 전월비','카드 전월비']")
        raw = raw.replace(',flag(r.rule.candidate),flag(r.robust.candidate),flag(r.rule.two_month_streak)', '')
        html = html[:first] + ACTIVITY + raw + html[last:]
    else:
        html = replace_block(html, '  function activityHtml(p){', '  function activityRawHtml(p){', ACTIVITY)
    html = replace_block(html, '  function analysisHTML(p){', '  async function signalsHTML(', ANALYSIS)
    html = replace_block(html, '  async function signalsHTML(', '  function heatmap(', SIGNALS)
    html = html.replace("detail('모델 원본 활동 관측 · 서버 5% 범주와 별도',activityHtml(p)", "detail('5% 범주와 활동 관측 근거',activityHtml(p)")
    return html


if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1])
    target.write_text(patch_activity_views(target.read_text(encoding='utf-8')), encoding='utf-8')
