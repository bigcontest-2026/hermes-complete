import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import create_app
from app.config import Settings


class WelfareAPITests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(create_app(Settings()))
        self.params=dict(region_code='11680',month='202508',sex_code='MAN',age_code='20G',as_of='2026-10-25')

    def test_rejects_unknown_filters(self):
        self.assertEqual(self.client.get('/api/model/welfare',params={**self.params,'db_path':'other'}).status_code,422)

    def test_rejects_invalid_region(self):
        self.assertEqual(self.client.get('/api/model/welfare',params={**self.params,'region_code':'1168010100'}).status_code,422)

    def test_graph_response_and_private_paths(self):
        from donghaeng_agent.welfare_graph import build_welfare_graph
        graph=build_welfare_graph(lambda **kw: {'operational_alert_allowed':False,
            'provenance':{'path':'private'},'activity':{'provenance':{'inputs':'private'},'record_id':'real'},'status':'completed'})
        with patch('donghaeng_agent.welfare_graph.build_welfare_graph',return_value=graph):
            response=self.client.get('/api/model/welfare',params=self.params)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['execution_graph'],'welfare-research-v1')
        self.assertNotIn('provenance',response.json())
        self.assertNotIn('provenance',response.json()['activity'])

    def test_missing_db_is_not_empty_success(self):
        with patch.dict('os.environ',{'WELFARE_DB_PATH':'missing-welfare-file.sqlite'}):
            response=self.client.get('/api/model/welfare',params=self.params)
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['detail']['code'],'welfare_unavailable')
