"""Start the standalone HERMES evidence/recommendation API from any directory."""
import os
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
for path in ['service/backend','agent/src','model']:
    sys.path.insert(0,str(ROOT/path))
os.environ.setdefault('APP_MODE','final')
os.environ.setdefault('DONGHAENG_MODEL_ROOT',str(ROOT/'model'))
os.environ.setdefault('DONGHAENG_AGENT_ROOT',str(ROOT/'agent'))
os.environ.setdefault('FINAL_MODEL_BUNDLE',str(ROOT/'bundles/activity'))
os.environ.setdefault('I5_BUNDLE_PATH',str(ROOT/'model/data/i5/national_2025'))
os.environ.setdefault('MODEL_RUNTIME_ROOT',str(ROOT/'runtime/model'))
os.environ.setdefault('WELFARE_DB_PATH',str(ROOT/'runtime/welfare_erd_v2.sqlite'))
os.environ.setdefault('WELFARE_PUBLICATION_ID','erd-demo-v2')
os.environ.setdefault('ACCESS_MODE','local_development')
from donghaeng_agent.welfare_erd import create_demo
database=Path(os.environ['WELFARE_DB_PATH'])
if not database.exists():
    database.parent.mkdir(parents=True,exist_ok=True)
    create_demo(database)

if __name__=='__main__':
    import uvicorn
    uvicorn.run('app.main:app',host='127.0.0.1',port=int(os.getenv('PORT','8011')))
