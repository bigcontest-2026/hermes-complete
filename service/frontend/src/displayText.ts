// Render known server descriptions in plain Korean. Keep the source data and IDs intact.
const descriptions: Record<string, string> = {
  SKT_ORIGINAL_BOUNDARY_CRS_UNVERIFIED: '통신자료의 원래 지역 경계와 지도 좌표 기준을 확인해야 합니다.',
  SKT_MONTHLY_COVERAGE_UNVERIFIED: '통신자료가 매월 같은 범위에서 수집됐는지 확인해야 합니다.',
  SKT_PRODUCTION_RULES_UNVERIFIED: '통신자료가 어떤 기준으로 집계됐는지 확인해야 합니다.',
  CARD_MISSINGNESS_RULE_UNVERIFIED: '카드자료에서 빠진 값이 어떻게 처리됐는지 확인해야 합니다.',
  CARD_INDUSTRY_SUBTYPE_UNVERIFIED: '카드자료에 포함된 세부 업종을 확인해야 합니다.',
  SKT_SEP_OCT_BOUNDARY_VERSION_CHANGED: '9월과 10월 통신자료의 지역 경계가 달라 직접 비교에 주의가 필요합니다.',
  BOTH_SOURCES_DECREASE: '통신자료 유동인구와 카드 이용이 모두 전월보다 줄었습니다.',
  JOINT_DECLINE_NOT_MET: '통신자료 유동인구와 카드 이용이 모두 감소한 경우는 아닙니다.',
  COMPARISON_UNAVAILABLE: '전월과 비교하는 데 필요한 자료가 부족합니다.',
  seasonality: '계절의 영향',
  calendar_composition: '요일과 공휴일 구성의 차이',
  observation_footprint_change: '관측장소 범위의 변화',
  place_flow_not_resident_mobility: '관측장소의 유동인구이며, 지역 주민의 이동만을 나타내지는 않습니다.',
  merchant_transactions_not_people: '가맹점의 결제 건수이며, 이용한 사람 수가 아닙니다.',
  no_isolation_ground_truth_or_probability: '개인의 고립 여부나 고립 확률을 확인한 자료가 아닙니다.',
  six_month_window_no_annual_seasonality: '6개월 자료이므로 한 해의 계절적 변화를 확인할 수 없습니다.',
  same_source_evidence_not_independent: '같은 자료를 다른 기준으로 비교한 값이므로 별개의 근거로 세지 않습니다.',
  source_release_date_backtest_unverified: '당시 공개되어 있던 자료만으로 같은 결과를 얻을 수 있었는지는 확인되지 않았습니다.',
  exact_category: '사업의 지원 분야가 일치합니다.',
  equivalent: '같은 의미의 지원 분야로 연결된 사업입니다.',
  related: '관련된 지원 분야의 사업입니다.',
  content_keyword: '사업 내용에 관련 검색어가 포함되어 있습니다.',
  i5_link: '지역 고립 참고점수의 관련 영역을 참고해 살펴본 사업입니다.',
  sex: '성별 조건',
  age: '연령 조건',
  region: '지원 대상 지역',
  period: '신청 기간',
  start_date: '신청 시작일',
  end_date: '신청 종료일',
  personal_eligibility: '개인별 신청 자격',
  individual_eligibility_and_current_acceptance: '개인별 신청 자격과 현재 접수 여부',
  support_content: '구체적인 지원 내용',
  tag_mismatch: '검토 중인 지원 분야와 사업 분류가 다릅니다.',
  content_mismatch: '검토 중인 지원 분야와 사업 내용이 다릅니다.',
  conditions_not_checked: '신청 조건을 아직 확인하지 못했습니다.',
  unverified_source: '공식 원문 확인이 필요합니다.',
  detail_missing: '사업 상세정보가 없습니다.',
  official_manifest_missing: '공식 지원정보 목록이 준비되지 않았습니다.',
  adequate_descriptive_sample: '설문 결과를 요약할 응답 수 확보',
  insufficient_sample: '응답 수 부족 · 계산 보류',
  complete_fixed_footprint: '같은 관측장소의 자료 모두 확보',
  incomplete_fixed_footprint: '같은 관측장소의 자료 일부 부족',
  low_effective_sample: '응답 비중을 반영한 표본 수 부족 · 계산 보류',
  complete_descriptive_proxy: '필수 활동자료 확보 · 참고점수',
  held_missing_inputs: '필수 항목 부족 · 계산 보류',
  evaluation_missing_selected_month: '자료 누락 시험 · 선택한 월의 자료 없음',
  'I5 임계값 미확정: 연구용 context 모드를 명시해야 실행합니다.': '점수만으로 사업을 추천하는 기준은 정해지지 않았습니다. 참고자료를 함께 검토하는 방식으로 설정해야 합니다.',
  '동일 지역·월의 I5 또는 활동 근거가 없습니다.': '같은 지역과 월에 해당하는 지역 고립 참고점수 또는 활동 변화 자료가 없습니다.',
  '발동한 활동신호가 없어 자동 검색하지 않습니다.': '현재 사업 검색 기준에 해당하는 활동 감소가 없어 자동으로 사업을 찾지 않았습니다.',
  '제안 규칙: 활동신호의 조사 경로와 관련 I5 영역 참고값으로 사업을 탐색합니다.': '관측된 활동 감소와 관련 영역의 지역 고립 참고점수를 함께 참고해 사업을 살펴봅니다.',
  'I5가 높다고 판정하지 않았으며, 소비 감소를 소득 부족으로 확정하지 않습니다.': '점수만으로 지원 필요를 판단하거나, 소비 감소를 소득 부족으로 단정하지 않습니다.',
};

/** Use for explanatory copy only, never URLs, evidence IDs, keys, or user input. */
export function displayText(value: string): string {
  if (descriptions[value]) return descriptions[value];
  return value
    .replace(/인구구성 가중 I5 참고지수/g, '인구구성을 반영한 고립 참고지수')
    .replace(/I5 참고지수/g, '지역 고립 참고점수')
    .replace(/Q\/H\/T/g, '전월 대비 감소량과 지역 내 집단 비교값')
    .replace(/(?<![A-Za-z0-9_:])I5(?![A-Za-z0-9_:])/g, '지역 고립 참고점수')
    .replace(/(?<![A-Za-z0-9_:])C3(?![A-Za-z0-9_:])/g, '카드 이용 변화(같은 요일 비교)')
    .replace(/(?<![A-Za-z0-9_:])V3(?![A-Za-z0-9_:])/g, '전월 대비 활동 변화')
    .replace(/(?<![A-Za-z0-9_:])SKT(?![A-Za-z0-9_:])/g, '통신자료')
    .replace(/(?<![A-Za-z0-9_:])WMAN(?![A-Za-z0-9_:])/g, '여성')
    .replace(/(?<![A-Za-z0-9_:])MAN(?![A-Za-z0-9_:])/g, '남성')
    .replace(/(?<![A-Za-z0-9_:])60GU(?![A-Za-z0-9_])/g, '60세 이상')
    .replace(/(?<![A-Za-z0-9_:])(20|30|40|50)G(?![A-Za-z0-9_])/g, '$1대');
}

export function populationGroupLabel(group: string): string {
  const match = /^(남|여)_(20-39|40-59|60\+)$/.exec(group);
  if (!match) return group;
  return `${match[1] === '남' ? '남성' : '여성'} ${match[2] === '60+' ? '60세 이상' : `${match[2].replace('-', '~')}세`}`;
}
