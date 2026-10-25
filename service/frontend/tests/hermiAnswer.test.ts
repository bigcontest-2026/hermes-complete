import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';

const context = createContext({ window: {}, URL });
new Script(readFileSync(new URL('../../shared/hermi-answer.js', import.meta.url), 'utf8')).runInContext(context);
const answer = context.window.HERMI_ANSWER as { inline(value: unknown): string; blocks(value: unknown): string };

describe('assistant narrative formatting', () => {
  it('separates headings, paragraphs and lists without exposing Markdown markers', () => {
    expect(answer.blocks('## 분석 결과\n\n**통신 활동**이 줄었습니다.\n지난달과 비교했습니다.\n\n- 원자료 확인\n- 담당자 검토\n\n1. 기간 확인\n2. 조건 확인')).toBe(
      '<h4>분석 결과</h4><p><strong>통신 활동</strong>이 줄었습니다.<br>지난달과 비교했습니다.</p><ul><li>원자료 확인</li><li>담당자 검토</li></ul><ol><li>기간 확인</li><li>조건 확인</li></ol>');
  });
  it('keeps source identifiers and code literal', () => {
    expect(answer.inline('survey_i5:2025:11680 `**원문**`')).toBe('survey_i5:2025:11680 <code>**원문**</code>');
    expect(answer.blocks('```html\n<img src=x onerror=alert(1)>\n```')).toBe('<pre><code>&lt;img src=x onerror=alert(1)&gt;</code></pre>');
  });
  it('escapes source HTML and attributes and only makes safe web links clickable', () => {
    const result = answer.blocks('## <img src=x onerror=alert(1)>\n\n[출처](https://example.gov/?q=%22) **<script>bad</script>**');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('<script>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('<strong>&lt;script&gt;bad&lt;/script&gt;</strong>');
    expect(answer.inline('[출처](javascript:alert(1))')).not.toContain('<a ');
    expect(answer.inline('[출처](https://user:password@example.gov/)')).toBe('출처');
  });
  it('handles incomplete code fences and missing text without creating broken markup', () => {
    expect(answer.blocks(null)).toBe('');
    expect(answer.blocks('확인 사항\n\n```\n## 원문')).toBe('<p>확인 사항</p><pre><code>## 원문</code></pre>');
  });
  it('upgrades list-only saved replies and preserves existing controls on restore', () => {
    const replacements: {innerHTML: string}[] = [];
    context.document = { createElement: () => ({className: '', innerHTML: ''}) };
    const list = {children: [], textContent: '- 원자료 확인\n- 담당자 검토', tagName: 'P', replaceWith: (node: {innerHTML: string}) => replacements.push(node)};
    const formatted = {children: [{}], textContent: '**원문 확인**', tagName: 'P', replaceWith: () => { throw new Error('Existing formatted content changed'); }};
    context.window.HERMI_ANSWER.apply({querySelectorAll: () => [list, formatted]});
    expect(replacements.map(node => node.innerHTML)).toEqual(['<ul><li>원자료 확인</li><li>담당자 검토</li></ul>']);
  });
});
