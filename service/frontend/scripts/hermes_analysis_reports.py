"""Keep the supplied UI and regenerated imports connected to server analysis reports."""
import hashlib
import re
from pathlib import Path
from hermes_draft_scope import patch_draft_scope


def patch_analysis_reports(html):
    # Version public scripts/styles so a refreshed existing tab gets this UI.
    assets = ('hermi-overview.js', 'hermi-overview.css', 'hermi-copy.js',
              'hermi-analysis-reports.js', 'hermi-lifecycle-guide.js',
              'hermi-report-library.css', 'hermi-lifecycle-guide.css',
              'hermi-response-workspace.js', 'hermi-response-workspace.css', 'hermi-desktop.js', 'hermi-desktop.css')
    for asset in assets:
        html = re.sub(r'((?:src|href)="' + re.escape(asset) + r')\?v=[^"\s]*(")',
                      r'\1\2', html)
    adapter = (Path(__file__).parent / 'hermes-live-adapter.js').read_text(encoding='utf-8')
    start = html.find('// Inserted inside the supplied HTML\'s data adapter.')
    end = html.find('  function supports(s)', start)
    if start < 0 or end < 0:
        raise ValueError('Missing live adapter boundary for analysis reports')
    html = html[:start] + adapter + '\n' + html[end:]
    html, count = re.subn(r'  async function briefFor\(c\)\{.*?\n(?=  function hydrate)',
                         '  async function briefFor(c){return liveBriefFor(c);}\n', html, flags=re.S)
    if count != 1:
        raise ValueError('Missing brief generation boundary')
    if '<script src="hermi-analysis-reports.js"></script>' not in html:
        html = html.replace('</head>', '<script src="hermi-analysis-reports.js"></script></head>')
    for asset in ('hermi-report-library.css', 'hermi-response-workspace.css', 'hermi-lifecycle-guide.css'):
        tag = f'<link rel="stylesheet" href="{asset}">'
        if tag not in html:
            html = html.replace('</head>', tag + '</head>')
    workspace_script = '<script src="hermi-response-workspace.js"></script>'
    if workspace_script not in html:
        html = html.replace('</head>', workspace_script + '</head>')
    lifecycle_script = '<script src="hermi-lifecycle-guide.js"></script>'
    if lifecycle_script not in html:
        html = html.replace('</head>', lifecycle_script + '</head>')
    case_target = 'data-case-id="${esc(record.case_id)}">\n'
    case_render = '${window.HERMES_ANALYSIS_REPORTS.render(brief)}'
    if case_render not in html:
        if html.count(case_target) != 1:
            raise ValueError('Missing case report render boundary')
        html = html.replace(case_target, case_target + '      ' + case_render + '\n')
    report_target = '${window.HERMI_ANSWER.blocks(r.summary.join(\'\\n\\n\'))}'
    report_render = '${window.HERMES_ANALYSIS_REPORTS.render(r)}'
    if report_render not in html:
        if html.count(report_target) != 1:
            raise ValueError('Missing report render boundary')
        html = html.replace(report_target, report_render + report_target)
    html = html.replace("storage:'browser_local_only'};}\n  function markdown", "storage:b.server_analysis_reports?.length?'server_analysis_with_browser_followup':'browser_local_only'};}\n  function markdown")
    html = html.replace("action('텍스트 보고서 다운로드','data-live-download-report')", "action('서버 현황 보고서 다운로드','data-live-download-report')")
    html, count = re.subn(r"      if\(element.hasAttribute\('data-live-download-report'\)\)\{.*?\n(?=      if\(element.hasAttribute\('data-live-print-report'\))",
                         "      if(element.hasAttribute('data-live-download-report')){if(!currentCase)throw Error('보고서로 저장할 분석을 선택해 주세요.');await window.HERMES_ANALYSIS_REPORTS.download(currentCase.briefs.at(-1));return}\n", html, flags=re.S)
    if count != 1:
        raise ValueError('Missing saved report download boundary')
    html = html.replace('${esc(activeName())} 분석 및 대응 검토', '${esc(activeName())} 현황 및 후속 검토 기록')
    html = html.replace("storage:'browser_local_only',model:{ready:false}", "storage:'server_analysis_with_browser_followup',model:{ready:false}")
    html = html.replace("graph_version:'html-local-evidence-view-v1'", "graph_version:'server-activity-review-with-local-followup-v1'")
    html = html.replace("detail('활동변화 신호 근거',activityHtml(p)", "detail('모델 원본 활동 관측 · 서버 5% 범주와 별도',activityHtml(p)")
    html = html.replace('실제 I5·활동 API + 복지 자료 연결 · 대화·검토는 이 브라우저 저장', '실제 I5·활동 API · 현황 보고서는 서버 저장 · 대화·검토는 이 브라우저 저장')
    html = html.replace('대화·검토·정책 초안은 이 브라우저에 저장됩니다. 자유형 LLM 및 외부 원인 조사는 연결하지 않았습니다.',
                        '현황 보고서는 서버에 저장되며 보고서 번호로 다시 조회합니다. 대화·검토·후속 정책 초안은 이 브라우저에 저장됩니다. 현황 보고서의 가능한 원인은 확인할 가설이며 외부 원인 조사는 아직 연결하지 않았습니다.')
    html = html.replace('현황 보고서의 가능한 원인은 확인할 가설이며 외부 원인 조사는 아직 연결하지 않았습니다.',
                        '현황 보고서는 공개 자료에서 확인한 지역 맥락과 가능한 원인을 구분합니다. 조사 미완료 시 저장된 관측 보고서에서 다시 조사할 수 있습니다.')
    html = html.replace("context_connector:'not_configured'", "context_connector:'analysis_report_research'")
    shared = Path(__file__).resolve().parents[2] / 'shared'
    for asset in assets:
        version = hashlib.sha256((shared / asset).read_bytes()).hexdigest()[:12]
        html = html.replace(f'="{asset}"', f'="{asset}?v={version}"')
    return patch_draft_scope(html)


if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1])
    target.write_text(patch_analysis_reports(target.read_text(encoding='utf-8')), encoding='utf-8')
