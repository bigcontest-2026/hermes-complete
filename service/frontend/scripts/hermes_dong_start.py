"""Preserve full administrative-dong scope when starting or queuing a chat."""
from pathlib import Path


def patch_dong_start(html):
    register = "registerDong:value=>{if(value?.region_level!=='administrative_dong'||!/^\\d{10}$/.test(value.region_code||''))return;const code=value.region_code,parent=registry.find(row=>row.spatial_unit==='sgg'&&row.area_code===code.slice(0,5)),name=value.area_name||String(value.region_name||'').trim().split(/\\s+/).at(-1);if(!name||name===code)return;const row={spatial_unit:'administrative_dong',area_code:code,area_name:name,region_code:code.slice(0,5),region_name:parent?.region_name||value.parent_region_name||''};const index=registry.findIndex(item=>item.spatial_unit==='administrative_dong'&&item.area_code===code);if(index<0)registry.push(row);else registry[index]={...registry[index],...row};}"
    setter = "setStartingScope:(value,displayName)=>{initialScope=value?structuredClone(value):null;if(initialScope){if(displayName)initialScope.region_name=displayName;window.HERMES_HTML_DATA?.registerDong(initialScope);}return initialScope?structuredClone(initialScope):null;}"
    old_setter = "setStartingScope:value=>{initialScope=value?structuredClone(value):null;return initialScope?structuredClone(initialScope):null;}"
    if old_setter in html:
        html = html.replace(old_setter, setter, 1)
    replacements = (
        ("window.HERMES_HTML_DATA={packet,resolve,supports,getCases:",
         "window.HERMES_HTML_DATA={packet,resolve,supports," + register + ",getCases:"),
        ("const thread=currentThread(tid),starting=initialScope;",
         "const thread=currentThread(tid),starting=msg.startingScope===undefined?initialScope:msg.startingScope;"),
        ("const previousScopes=thread.context?.agentContext?.serverScopes;",
         "const previousScopes=starting?null:thread.context?.agentContext?.serverScopes;"),
        ("previous_scope:thread.context?.agentContext?.serverScope||null,starting_scope:starting,",
         "previous_scope:starting||thread.context?.agentContext?.serverScope||null,starting_scope:starting,selected_scope:starting,"),
        ("scopeOf(body.previous_scope||body.starting_scope||{})",
         "scopeOf(body.selected_scope||body.previous_scope||body.starting_scope||{})"),
        ("let selected=dg.length?dg:sg;if(!selected.length",
         "let selected=dg.length?dg:sg;const explicit=body.selected_scope;if(explicit?.region_level==='administrative_dong'&&/^\\d{10}$/.test(explicit.region_code||'')&&selected.length&&selected.every(row=>row.spatial_unit==='sgg'&&row.area_code===explicit.region_code.slice(0,5)||row.spatial_unit==='administrative_dong'&&row.area_code===explicit.region_code)){selected=registry.filter(row=>row.spatial_unit==='administrative_dong'&&row.area_code===explicit.region_code);}if(!selected.length"),
        ("startingRegion:startRegion});",
         "startingRegion:startRegion,startingScope:initialScope?structuredClone(initialScope):null});"),
        ("window.HERMES_AGENT={api,caseHtml,",
         "window.HERMES_AGENT={api," + setter + ",caseHtml,"),
    )
    for old, new in replacements:
        if new in html:
            continue
        if html.count(old) != 1:
            raise ValueError(f'Missing administrative-dong start boundary: {old}')
        html = html.replace(old, new, 1)
    return html


if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1])
    target.write_text(patch_dong_start(target.read_text(encoding='utf-8')), encoding='utf-8')
