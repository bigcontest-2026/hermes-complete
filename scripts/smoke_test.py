"""Check included bundles and recommendation graph without a running web server."""
import run_api
from app.config import Settings
from app.final_model import FinalModel
from donghaeng_agent.welfare_graph import build_welfare_graph

settings=Settings.from_env()
model=FinalModel(settings)
status=model.status()
assert all(value['ready'] for value in status['sources'].values()),status
result=build_welfare_graph().invoke({'request':dict(
    i5_bundle=model.bundle_path('survey'),activity_bundle=model.bundle_path('activity'),
    db_path=run_api.database,publication_id='erd-demo-v2',region_code='11680',month='202508',
    sex_code='MAN',age_code='20G',as_of='2026-10-25',research_context=True,allow_synthetic=True)})['result']
assert len(result['recommendations'])==2,result['status']
assert len(result['excluded'])==1
assert len(result['held'])==1
assert result['operational_alert_allowed'] is False
print('Standalone bundles verified; recommendation graph: 2 candidates, 1 excluded, 1 held.')
