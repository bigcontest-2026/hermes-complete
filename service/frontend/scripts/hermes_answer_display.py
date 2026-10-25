"""Preserve the approved answer layout when reimporting the supplied HTML."""


def patch_answers(html):
    if '<script src="hermi-answer.js"></script>' not in html:
        html = html.replace('</head>', '<script src="hermi-answer.js"></script></head>')
    html = html.replace(
        '<div class="answer-guide">${brief.summary.map(t=>`<p>${esc(t)}</p>`).join(\'\')}</div>',
        '<section class="answer-guide hermi-answer" aria-label="분석 요약"><h3 class="hermi-answer-title">분석 요약</h3><div class="hermi-answer-body">${window.HERMI_ANSWER.blocks(brief.summary.join(\'\\n\\n\'))}</div></section>',
    )
    html = html.replace(
        "${r.summary.map(s=>`<p>${esc(s)}</p>`).join('')}",
        "${window.HERMI_ANSWER.blocks(r.summary.join('\\n\\n'))}",
    )
    html = html.replace(
        "<span class=\"badge\">${p.scope.region_level==='administrative_dong'?'행정동':p.scope.region_level==='sgg'?'시군구':'전국 조회'}</span></div>",
        "<span class=\"badge\">${p.scope.region_level==='administrative_dong'?'행정동':p.scope.region_level==='sgg'?'시군구':'전국 조회'}</span><span class=\"badge\" data-answer-group>${esc(p.scope.sex_codes.map(s=>s==='MAN'?'남성':'여성').join('·')||'전체 성별')} · ${esc(p.scope.age_codes.map(a=>AGE[a]||a).join('·')||'전체 연령')}</span></div>",
    )
    return html
