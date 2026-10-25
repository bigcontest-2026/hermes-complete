/* User-facing vocabulary. Data keys, saved messages and user-authored text stay intact. */
window.HERMI_COPY = (() => {
  'use strict';
  const phrases = [
    ['지역 고립 참고점수', '지역 고립 지수'],
    ['[가상] social', '[예시] 모임 활동과 안부 확인'],
    ['[가상] work', '[예시] 일경험과 동료 교류'],
    ['[가상] expired', '[예시] 운영 기간이 끝난 생활지원'],
    ['[가상] unclassified', '[예시] 지원 분야 확인이 필요한 사업'],
    ['[가상] unknown', '[예시] 상세 내용을 확인 중인 사업'],
    ['제안 규칙: 활동신호의 조사 경로와 관련 I5 영역 참고값으로 사업을 탐색합니다.', '확인한 활동 변화와 관련 생활 여건을 함께 참고해 사업을 살펴봅니다.'],
    ['I5가 높다고 판정하지 않았으며, 소비 감소를 소득 부족으로 확정하지 않습니다.', '점수만으로 지원 필요를 판단하거나, 소비 감소를 소득 부족으로 단정하지 않습니다.'],
    ['동·월·교차 성연령 관측으로 변환하지 않습니다.', '동별·월별·성별과 연령을 함께 나눈 자료로 바꾸어 해석하지 않습니다.'],
    ['연간 자치구 직접응답 참고자료. 공개 표본 규칙 n≥30·유효표본수≥20 충족.', '자치구 주민의 연간 설문 응답입니다. 응답 수와 응답 비중을 반영한 표본 수가 공개 기준을 충족한 자료입니다.'],
    ['I5와 다른 구성지수이며 동·월·성별 실측으로 복제하지 않습니다.', '지역 고립 지수와는 설문 항목이 다르며, 동별·월별·성별 결과로 바꾸어 해석하지 않습니다.'],
    ['첨부 HTML에 포함된 보관 자료입니다. 현재 서버의 신규 조사 결과가 아닙니다.', '화면과 함께 보관된 참고자료이며, 새로 조사한 결과는 아닙니다.'],
    ['활동 관측', '활동 자료'],
    ['관측 기간', '자료 기준 기간'],
    ['원천 후보', '큰 감소 여부'],
    ['전월/일', '지난달 하루 평균'],
    ['이번 달/일', '이번 달 하루 평균'],
    ['근거와 모델 버전', '사용한 자료와 갱신 기록'],
    ['지역 참고지수', '지역 고립 지수'],
    ['분석 근거 ID', '분석 자료 확인번호'],
    ['활동량·Q/H/T·원천별 판정 근거', '활동량과 비교 기준 자세히 보기'],
    ['분석 방법·모델 검증', '계산 방법과 확인한 범위'],
    ['Q는 전월 로그 감소량, H는 같은 지역·월 10집단 Q 중앙값, T=Q−H입니다. Q/H/T를 독립 근거로 더하지 않습니다.', '지난달 대비 감소 정도를 같은 지역·월의 다른 성별·연령 집단과 비교합니다. 감소 정도와 일반적인 변화의 차이를 따로 살펴보며, 이 값들을 더해 위험점수로 만들지 않습니다. 감소 정도는 변화 비율을 로그로 환산한 계산값으로, 변화율(%)과 단위가 다릅니다.'],
    ['Rule: 두 원천 Q>0. Robust: 원천별 Q>0 및 강건 z≥3.5인 원천이 하나 이상. 연속성: 두 비교월 모두 Rule 성립. 미산출값은 0·해당 없음으로 바꾸지 않습니다.', '통신·카드가 함께 줄었는지, 다른 성별·연령 집단보다 감소가 두드러지는지, 두 달 연속 함께 줄었는지를 따로 확인합니다. 자료가 부족하면 해당하지 않는다고 판단하지 않고 확인이 필요하다고 표시합니다.'],
    ['판정 미산출', '판단할 자료 부족'],
    ['비교 미산출', '비교할 자료 부족'],
    ['최근 보유 관측', '확인한 자료의 기준월'],
    ['관측을 확인했어요.', '자료를 확인했어요.'],
    ['중복 신호를 합산하지 않습니다.', '한 집단이 여러 항목에 해당할 수 있어 항목 수를 더하지 않아요.'],
    ['선택 시군구 V3 관측', '선택 지역의 지난달 대비 활동 변화'],
    ['합성 감소 주입 반응과 달력 민감도 검증은 아래 원보고서에서 확인할 수 있으며 실제 고립 진단 정확도와 구분합니다.', '활동량을 시험적으로 줄이거나 달력 조건을 바꾸었을 때 결과가 달라지는지는 아래 자료에서 확인할 수 있습니다. 실제 고립 상태를 알아내는 정확도를 확인한 결과는 아닙니다.'],
    ['사회조사 기반 인구구성 고립취약성 참고지수(I5)', '지역 고립 지수'],
    ['사회조사 기반 고립취약성 참고지수(I5)', '지역 고립 지수'],
    ['지역사회 모임 P3 미참여 비율', '지역사회 모임 미참여 비율'],
    ['분석 지표 쉽게 이해하기 · I5 / V3 / C3', '점수와 활동 변화 이해하기'],
    ['분석 지표 쉽게 이해하기 · I5 / V3', '점수와 활동 변화 이해하기'],
    ['사회조사 기반 고립취약성 참고지수 (I5)', '지역 고립 지수'],
    ['인구구성 I5 참고지수', '지역 고립 지수'],
    ['인구구성 가중 I5', '지역 인구구성을 반영한 참고점수'],
    ['고립취약성 참고지수 I5', '지역 고립 지수'],
    ['I5 지역 참고지수', '지역 고립 지수'],
    ['I5 지역 참고값', '지역 고립 지수'],
    ['I5 취약성 분석 근거', '지역 고립 지수의 계산 근거'],
    ['I5 · 장기 취약성 참고지수', '지역 고립 지수'],
    ['I5 참고지수', '지역 고립 지수'],
    ['I5 참고값', '지역 고립 지수'],
    ['I5 지수', '지역 고립 지수'],
    ['V3 · 단기 활동변화와 이상 신호', '지난달 대비 통신·카드 활동 변화'],
    ['C3 · 과거 동일요일 카드 비교', '카드 이용 변화(같은 요일 비교)'],
    ['C3 · 과거 같은 요일 카드 기준', '카드 이용 변화(같은 요일 비교)'],
    ['과거 같은 요일 · C3', '카드 이용 변화(같은 요일 비교)'],
    ['과거 동일요일 C3', '카드 이용 변화(같은 요일 비교)'],
    ['과거 동일요일 비교(C3)', '카드 이용 변화(같은 요일 비교)'],
    ['V3 전월 대비', '지난달 대비 활동 변화'],
    ['실제 LLM 호출 없이 구성했으며', '확인된 자료와 정해진 작성 기준으로 구성했으며'],
    ['없음(규칙 기반 근거 조사)', '사용하지 않음(확인된 자료와 정해진 기준으로 작성)'],
    ['실제 LLM 호출', 'AI 추가 분석 사용'],
    ['자유형 LLM', '자유로운 AI 대화'],
    ['LLM 도구 조사', 'AI 추가 자료 조사'],
    ['임시 복지 DB · 가상 사업', '신청할 수 없는 예시 복지사업'],
    ['ERD 임시 DB의 가상 자료', '화면을 확인하기 위한 예시 자료'],
    ['임시 DB 추천 후보', '검토할 예시 복지사업'],
    ['임시 DB 사업 검색', '등록된 복지사업 검색'],
    ['임시 DB 추천 조건 (가상 사업)', '예시 복지사업의 지원 조건'],
    ['가상 복지 DB', '예시 복지사업 자료'],
    ['임시 복지 DB', '예시 복지사업 자료'],
    ['임시 DB', '예시 사업 자료'],
    ['가상 API; 공식 수집 아님', '화면 확인용 예시 자료'],
    ['추천 그래프', '복지사업 검토 절차'],
    ['전월비', '지난달 대비'],
    ['전월 대비', '지난달 대비'],
    ['동일요일', '같은 요일'],
    ['비공휴일', '공휴일을 제외한 날'],
    ['양원천 감소 후보', '통신·카드가 함께 감소한 경우'],
    ['강건 후보', '다른 집단보다 감소가 큰 경우'],
    ['강건 z', '다른 집단과 비교한 감소 정도'],
    ['상대 급감', '다른 집단보다 큰 감소'],
    ['연속 관측', '두 달 연속 감소'],
    ['관측월', '자료 기준월'],
    ['첫 관측월', '첫 자료 기준월'],
    ['관측 사례', '활동 변화 사례'],
    ['관측 자료', '확인한 자료'],
    ['관측자료', '확인한 자료'],
    ['관측 근거', '확인한 자료'],
    ['관측 사실', '자료에서 확인한 사실'],
    ['관측값', '자료에서 확인한 값'],
    ['실제 활동 관측', '자료에서 확인한 활동 변화'],
    ['활동 실측', '실제 활동 자료'],
    ['활동신호', '활동 변화'],
    ['활동변화 신호', '활동 변화'],
    ['장기 취약성 참고지수', '지역 고립 지수'],
    ['고립취약성 참고지수', '지역 고립 지수'],
    ['설문 기반 지역 참고지수', '지역 고립 지수'],
    ['원천별', '자료별'],
    ['두 원천', '통신·카드 두 자료'],
    ['같은 카드 원천', '같은 카드 자료'],
    ['독립 원천', '별개의 자료'],
    ['자료 버전', '자료 갱신 기록'],
    ['브리프', '분석 요약'],
    ['미산출', '계산할 자료 부족'],
    ['품질 보류', '자료 확인 필요'],
    ['Markdown 다운로드', '텍스트 보고서 다운로드'],
    ['PDF 인쇄 또는 저장', '보고서 인쇄·PDF 저장'],
    ['매니페스트 해시', '자료 원본 확인번호'],
    ['원문 SHA256', '원문 확인번호'],
    ['해시 검증', '원본 일치 확인'],
    ['HERMES ANALYSIS REPORT', '헤르미 지역 분석 보고서'],
  ].sort((a, b) => b[0].length - a[0].length);
  const tokens = {
    I5: '지역 고립 지수', V3: '지난달 대비 활동 변화', C3: '카드 이용 변화(같은 요일 비교)',
    P3: '지역사회 모임 미참여 비율', Rule: '통신·카드 동시 감소', Robust: '다른 집단보다 큰 감소',
    LLM: 'AI 언어 모델', API: '자료 연결', JSONL: '자료 파일',
    rule_baseline: '확인된 자료로 분석', single_search: '자료 검색 후 요약',
    agent: '추가 자료 조사', accepted: '검토 수락', rejected: '검토 반려',
    accept: '검토 수락', reject: '검토 반려', request_info: '추가 확인 요청',
    referral_reported: '기관 연계 검토·요청 기록', closed: '후속 검토 종료',
    held: '자료 확인 필요', hold: '자료 확인 필요', available: '자료 있음',
    no_records: '해당 자료 없음', no_data: '해당 자료 없음', completed: '확인 완료',
    match: '공개 조건과 일치', no_match: '공개 조건과 불일치', unknown: '추가 확인 필요',
    administrative_dong: '행정동', sgg: '시군구', national: '전국',
    personal_eligibility: '개별 신청 자격', sex: '성별 조건', age: '연령 조건',
    c1: '서울 분기별 상권 자료', district_survey: '자치구 설문 자료',
    legacy_seoul: '이전 서울 지역 참고자료', research_snapshot: '보관된 참고자료',
    CARD_INDUSTRY_SUBTYPE_UNVERIFIED: '카드 업종 세부 분류 확인 필요',
    CARD_MISSINGNESS_RULE_UNVERIFIED: '누락된 카드 자료의 처리 기준 확인 필요',
    SKT_MONTHLY_COVERAGE_UNVERIFIED: '통신 자료의 월별 수집 범위 확인 필요',
    SKT_ORIGINAL_BOUNDARY_CRS_UNVERIFIED: '통신 자료의 지역 경계·위치 기준 확인 필요',
    SKT_PRODUCTION_RULES_UNVERIFIED: '통신 자료의 계산 기준 확인 필요',
    SKT_SEP_OCT_BOUNDARY_VERSION_CHANGED: '9월과 10월 통신 자료의 지역 경계 기준이 달라짐',
  };
  const tokenPattern = new RegExp('(?<![A-Za-z0-9_/.-])(' + Object.keys(tokens).join('|') + ')(?![A-Za-z0-9_/-])', 'g');
  const source = code => ({i5:'지역 고립 지수',v3:'지난달 대비 통신·카드 활동',c3:'같은 요일 카드 비교',c1:'서울 분기별 상권 자료',dong_skt:'행정동 통신 자료',legacy_seoul:'이전 서울 지역 참고자료',district_survey:'자치구 설문 자료',research_snapshot:'보관된 참고자료'}[code] || code);
  function text(value) {
    let result = String(value ?? '');
    const column = {Q:'감소 정도',H:'다른 집단의 일반 변화',T:'일반 변화와의 차이'}[result.trim()];
    if (column) return result.replace(result.trim(), column);
    // Keep URLs, quoted source identifiers and original code examples exact.
    return result.split(/(`[^`]*`|https?:\/\/[^\s<>]+|\b[A-Za-z][A-Za-z0-9_]*(?::[A-Za-z0-9_-]+)+\b|\b[A-Za-z][A-Za-z0-9_.-]*\.(?:jsonl?|csv|md|html|pdf|zip|png|js|ts)\b)/g).map((part, i) => {
      if (i % 2) return part;
      for (const [from, to] of phrases) part = part.split(from).join(to);
      return part.replace(tokenPattern, token => tokens[token])
        .replace(/관측 (20\d{2})(\d{2})/g, (_, year, month) => `자료 기준 ${year}년 ${Number(month)}월`)
        .replace(/\b(20\d{2})Q([1-4])\b/g, '$1년 $2분기')
        .replace(/(동시 감소|다른 집단보다 큰 감소|연속 감소)\s+(true|false|null)\b/g, (_, label, value) => label + ': ' + ({true:'해당',false:'해당 없음',null:'확인할 자료 부족'}[value]))
        .replace(/([남여])_(20-39|40-59|60\+)/g, (_, sex, age) => (sex === '남' ? '남성 ' : '여성 ') + (age === '60+' ? '60세 이상' : age.replace('-', '~') + '세'));
    }).join('');
  }
  const preserve = 'script,style,code,pre,.msg.user,.bubble.mine,.bubble-row.mine,.user-bubble,#chat-history-items,[data-live-case-select],[data-hermi-preserve]';
  const excluded = preserve + ',textarea,input';
  function apply(root) {
    if (!root || root.nodeType === 1 && root.closest(preserve)) return;
    if (root.nodeType === 3) {
      if (!root.parentElement || root.parentElement.closest(excluded)) return;
      const next = text(root.nodeValue);
      if (next !== root.nodeValue) {
        const option = root.parentElement.closest('option');
        if (option && !option.hasAttribute('value')) option.value = option.textContent;
        root.nodeValue = next;
      }
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    // Record IDs remain available without occupying the main reading flow.
    if (root.nodeType === 1 && root.matches('.evidence-meta,.live-meta') && !root.closest('details')
      && /survey_i5:|behavior:|html_case_|published_research_snapshot|final_\d/.test(root.textContent)) {
      const details = document.createElement('details');
      details.className = 'hermi-source-note';
      const summary = document.createElement('summary');
      summary.textContent = '자료 출처와 기록 번호';
      details.append(summary); root.before(details); details.append(root);
    }
    if (root.nodeType === 1) for (const attr of ['title', 'aria-label', 'placeholder', 'alt']) {
      if (root.hasAttribute(attr)) {
        const old = root.getAttribute(attr), next = text(old);
        if (old !== next) root.setAttribute(attr, next);
      }
    }
    if (root.nodeType === 1 && root.matches('input,textarea')) return;
    for (const child of root.childNodes) apply(child);
  }
  function html(markup) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    apply(template.content);
    return template.innerHTML;
  }
  function start() {
    apply(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') for (const node of record.addedNodes) apply(node);
        else apply(record.target);
      }
    });
    observer.observe(document.body, {childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder','alt']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
  return {text,html,apply,source};
})();
