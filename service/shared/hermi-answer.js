/* Render narrative text as a small, safe Markdown subset. Source HTML is text. */
window.HERMI_ANSWER = (() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function inline(value) {
    const text = String(value ?? '');
    // Tokens are rendered separately so markup in code or a link cannot be reparsed.
    const token = /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
    let html = '', start = 0;
    for (const match of text.matchAll(token)) {
      html += esc(text.slice(start, match.index));
      if (match[1] !== undefined) html += `<code>${esc(match[1])}</code>`;
      else if (match[2] !== undefined) {
        let url;
        try { url = new URL(match[3]); } catch {}
        html += url && /^https?:$/.test(url.protocol) && !url.username && !url.password
          ? `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(match[2])}</a>` : esc(match[2]);
      } else html += `<strong>${esc(match[4])}</strong>`;
      start = match.index + match[0].length;
    }
    return html + esc(text.slice(start));
  }
  function blocks(value) {
    const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
    let html = '', paragraph = [], list = null, code = null;
    const flushParagraph = () => { if (paragraph.length) html += `<p>${paragraph.map(inline).join('<br>')}</p>`; paragraph = []; };
    const closeList = () => { if (list) html += `</${list}>`; list = null; };
    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        flushParagraph(); closeList();
        if (code !== null) { html += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = null; }
        else code = [];
        continue;
      }
      if (code !== null) { code.push(line); continue; }
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/);
      const item = line.match(/^\s*(?:([-*•])\s+|\d+[.)]\s+)(.+)$/);
      if (!line.trim()) { flushParagraph(); closeList(); }
      else if (heading) { flushParagraph(); closeList(); html += `<h4>${inline(heading[1])}</h4>`; }
      else if (item) {
        flushParagraph(); const type = item[1] ? 'ul' : 'ol';
        if (list !== type) { closeList(); html += `<${type}>`; list = type; }
        html += `<li>${inline(item[2])}</li>`;
      } else { closeList(); paragraph.push(line); }
    }
    flushParagraph(); closeList();
    if (code !== null) html += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
    return html;
  }
  function apply(root) {
    // Only upgrade plain narrative leaves in saved assistant replies. Controls,
    // original evidence, user text, links and existing formatted content survive.
    root.querySelectorAll('.answer-guide > p, .answer-guide > ul > li').forEach(node => {
      if (node.children.length || !/(?:^|\n)\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s|```)|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\//.test(node.textContent)) return;
      if (node.tagName === 'P') {
        const section = document.createElement('div');
        section.className = 'hermi-answer-body'; section.innerHTML = blocks(node.textContent);
        node.replaceWith(section);
      } else node.innerHTML = inline(node.textContent);
    });
  }
  return { inline, blocks, apply };
})();
