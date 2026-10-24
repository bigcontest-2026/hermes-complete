"""Read-only research recommendation API using the agent's shared graph."""
import logging
import os
import sys
from datetime import date, datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, HTTPException, Request
from .config import Settings
from .final_model import FinalModel
from .final_model_api import Region, Month, Sex, Age

logger=logging.getLogger(__name__)


def welfare_router(settings: Settings):
    router=APIRouter()
    # Trusted server configuration only; browser never chooses filesystem paths.
    for path in (settings.agent_resource_root/'src',settings.model_root):
        if str(path) not in sys.path:
            sys.path.insert(0,str(path))

    @router.get('/api/model/welfare')
    def welfare(request: Request, region_code: Region, month: Month, sex_code: Sex, age_code: Age,
                as_of: date | None = None):
        if set(request.query_params)-{'region_code','month','sex_code','age_code','as_of'}:
            raise HTTPException(422,'지원하지 않는 추천 조회 조건입니다.')
        if settings.access_mode!='local_development' and os.getenv('WELFARE_RESEARCH_ENABLED')!='true':
            raise HTTPException(503,'연구용 추천이 활성화되지 않았습니다.')
        try:
            from donghaeng_agent.welfare_graph import build_welfare_graph
            model=FinalModel(settings)
            args=dict(i5_bundle=model.bundle_path('survey'),activity_bundle=model.bundle_path('activity'),
                db_path=os.getenv('WELFARE_DB_PATH',str(settings.agent_resource_root/'runtime/welfare_demo/welfare_erd_v2.sqlite')),
                publication_id=os.getenv('WELFARE_PUBLICATION_ID','erd-demo-v2'),
                region_code=region_code,month=month,sex_code=sex_code,age_code=age_code,
                as_of=(as_of or datetime.now(ZoneInfo('Asia/Seoul')).date()).isoformat(),
                research_context=True,allow_synthetic=settings.access_mode=='local_development' or os.getenv('WELFARE_ALLOW_SYNTHETIC')=='true')
            result=build_welfare_graph().invoke({'request':args})['result']
            # Keep server filesystem/provenance input paths out of the HTTP response.
            result.pop('provenance',None)
            if result.get('activity'):
                result['activity']={k:v for k,v in result['activity'].items() if k!='provenance'}
            return result
        except Exception as exc:
            logger.exception('Welfare recommendation unavailable')
            raise HTTPException(503,detail={'code':'welfare_unavailable','message':'추천 자료 또는 실행 환경을 확인해 주세요.'}) from exc
    return router
