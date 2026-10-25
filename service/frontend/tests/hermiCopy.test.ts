import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

type Copy = {
  text: (value: unknown) => string;
  source: (code: string) => string;
};

// Exercise the production vocabulary without starting its DOM observer.
const addEventListener = vi.fn();
const context = createContext({
  window: {},
  document: { readyState: 'loading', addEventListener },
});
new Script(readFileSync(new URL('../../shared/hermi-copy.js', import.meta.url), 'utf8')).runInContext(context);
const copy = context.window.HERMI_COPY as Copy;

describe('Hermi user-facing terminology', () => {
  it('waits for the page before starting DOM translation', () => {
    expect(addEventListener).toHaveBeenCalledWith('DOMContentLoaded', expect.any(Function), { once: true });
  });

  it('distinguishes population-reference scores, previous-month activity and same-weekday card comparisons', () => {
    expect(copy.text('I5')).toBe('지역 고립 지수');
    expect(copy.text('V3')).toBe('지난달 대비 활동 변화');
    expect(copy.text('C3')).toBe('카드 이용 변화(같은 요일 비교)');
    expect(copy.text('C3')).not.toContain('지난달');
    expect(copy.text('V3')).not.toContain('같은 요일');
  });

  it('uses whole display phrases before shorter token replacements', () => {
    expect(copy.text('분석 지표 쉽게 이해하기 · I5 / V3 / C3')).toBe('점수와 활동 변화 이해하기');
    expect(copy.text('V3 · 단기 활동변화와 이상 신호')).toBe('지난달 대비 통신·카드 활동 변화');
    expect(copy.text('C3 · 과거 동일요일 카드 비교')).toBe('카드 이용 변화(같은 요일 비교)');
  });

  it.each([
    '사회조사 기반 고립취약성 참고지수 (I5)',
    '사회조사 기반 고립취약성 참고지수(I5)',
    '사회조사 기반 인구구성 고립취약성 참고지수(I5)',
    '고립취약성 참고지수 I5',
  ])('avoids a duplicated score name in %s', input => {
    expect(copy.text(input)).toBe('지역 고립 지수');
  });

  it('does not repeat the description around a P3 label', () => {
    expect(copy.text('P3')).toBe('지역사회 모임 미참여 비율');
    expect(copy.text('지역사회 모임 P3 미참여 비율')).toBe('지역사회 모임 미참여 비율');
  });

  it('explains unresolved data-quality codes without marking them as confirmed', () => {
    const output = copy.text('CARD_INDUSTRY_SUBTYPE_UNVERIFIED · SKT_SEP_OCT_BOUNDARY_VERSION_CHANGED · hold');
    expect(output).toBe('카드 업종 세부 분류 확인 필요 · 9월과 10월 통신 자료의 지역 경계 기준이 달라짐 · 자료 확인 필요');
    expect(output).not.toContain('확인 완료');
  });

  it('distinguishes review decisions and recorded follow-up from completed support', () => {
    expect(copy.text('accepted / rejected / request_info')).toBe('검토 수락 / 검토 반려 / 추가 확인 요청');
    expect(copy.text('referral_reported · closed')).toBe('기관 연계 검토·요청 기록 · 후속 검토 종료');
    expect(copy.text('no_records · unknown')).toBe('해당 자료 없음 · 추가 확인 필요');
  });

  it('keeps true, false and unknown activity findings distinct', () => {
    expect(copy.text('Rule true')).toBe('통신·카드 동시 감소: 해당');
    expect(copy.text('Robust false')).toBe('다른 집단보다 큰 감소: 해당 없음');
    expect(copy.text('연속 관측 null')).toBe('두 달 연속 감소: 확인할 자료 부족');
  });

  it('renders sex and age groups as readable ranges', () => {
    expect(copy.text('남_20-39 / 여_40-59 / 남_60+')).toBe('남성 20~39세 / 여성 40~59세 / 남성 60세 이상');
  });

  it('uses distinct source labels and leaves unrecognized source identifiers intact', () => {
    expect(copy.source('i5')).toBe('지역 고립 지수');
    expect(copy.source('v3')).toBe('지난달 대비 통신·카드 활동');
    expect(copy.source('c3')).toBe('같은 요일 카드 비교');
    expect(copy.source('dong_skt')).toBe('행정동 통신 자료');
    expect(copy.source('future_source_v4')).toBe('future_source_v4');
  });
});

describe('Hermi copy preservation and idempotence', () => {
  it('preserves URLs including query values while translating surrounding prose', () => {
    const url = 'https://example.test/I5/V3?reference=C3&status=hold&strategy=agent#P3';
    expect(copy.text(`V3 자세히 보기 ${url} · C3`))
      .toBe(`지난달 대비 활동 변화 자세히 보기 ${url} · 카드 이용 변화(같은 요일 비교)`);
  });

  it('preserves quoted code, its punctuation and its original model wording', () => {
    const code = '`{ I5: 34.5, V3: "hold", note: "I5 지수", group: "남_20-39" }`';
    expect(copy.text(`I5 계산 예시 ${code}`)).toBe(`지역 고립 지수 계산 예시 ${code}`);
  });

  it('does not rewrite tokens embedded in source IDs, filenames or API paths', () => {
    const identifiers = 'I5_2025_final_v1 C3:test V3:202512 survey_i5:2025:sgg:11680:202512 I5.json /api/agent evidence.hold preagent';
    expect(copy.text(identifiers)).toBe(identifiers);
  });

  it('does not rewrite unrelated user wording or turn missing input into the word null', () => {
    expect(copy.text('주민과 함께 지역의 변화를 살펴봐요.')).toBe('주민과 함께 지역의 변화를 살펴봐요.');
    expect(copy.text(null)).toBe('');
    expect(copy.text(undefined)).toBe('');
    expect(copy.text(0)).toBe('0');
  });

  it.each([
    '사회조사 기반 인구구성 고립취약성 참고지수(I5)',
    '지역사회 모임 P3 미참여 비율',
    'V3 · 단기 활동변화와 이상 신호 / C3 · 과거 동일요일 카드 비교',
    'CARD_MISSINGNESS_RULE_UNVERIFIED hold · 관측월 202512',
    'Rule true · Robust false · 연속 관측 null',
    '임시 복지 DB · 가상 사업 / 실제 LLM 호출 없이 구성했으며',
    '남_20-39 / 여_60+ · referral_reported · closed',
    'I5 https://example.test/I5?source=C3 `V3 전월 대비`',
  ])('stops changing after the first pass: %s', input => {
    const first = copy.text(input);
    let repeated = first;
    // Repeated mutation-observer callbacks must reach a fixed point immediately.
    for (let iteration = 0; iteration < 10; iteration += 1) {
      repeated = copy.text(repeated);
      expect(repeated).toBe(first);
    }
  });
});
