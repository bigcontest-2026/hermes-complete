import unittest
from donghaeng_agent.welfare_pipeline import build_intent


class IntentTests(unittest.TestCase):
    def setUp(self):
        self.i5={'region_code':'11680','month':'202508','spatial_unit':'sgg',
                 'record_id':'i5:fixture','domain_scores':dict(E=20,P=30,C=40,U=50,O=10)}
        self.activity={'key':{'region_code':'11680','month':'202508'},'spatial_unit':'sgg',
            'record_id':'activity:fixture','comparison_status':'computed',
            'rule':{'candidate':True,'two_month_streak':None},'robust':{'candidate':False},
            'sources':{'skt':{'calculation_status':'computed','change_percent':-4},
                       'card_a':{'calculation_status':'computed','change_percent':-1}}}

    def intent(self):
        return build_intent(self.i5,self.activity,research_context=True)

    def test_explicit_research_mode_required(self):
        self.assertEqual(build_intent(self.i5,self.activity)['status'],'held')

    def test_joint_signal_has_real_score_references(self):
        result=self.intent()
        self.assertEqual(result['route'],'common_factor_review')
        self.assertEqual(result['i5_domains'],['P','C','U','E'])
        self.assertEqual(result['evidence'][0]['score'],30)

    def test_missing_evidence_holds(self):
        self.assertEqual(build_intent(None,self.activity,research_context=True)['status'],'held')

    def test_mismatched_month_rejected(self):
        self.i5['month']='202507'
        with self.assertRaises(ValueError): self.intent()

    def test_invalid_scores_not_selected(self):
        self.i5['domain_scores']={'P':float('nan'),'C':None,'U':101,'E':True}
        self.assertEqual(self.intent()['status'],'held')

    def test_no_signal_does_not_search(self):
        self.activity['rule']['candidate']=False
        for source in self.activity['sources'].values(): source['change_percent']=1
        self.assertEqual(self.intent()['status'],'no_signal')

    def test_robust_route_preserved(self):
        self.activity['robust']['candidate']=True
        self.assertEqual(self.intent()['route'],'focused_investigation')

    def test_uncomputed_comparison_holds(self):
        self.activity['comparison_status']='not_comparable'
        self.assertEqual(self.intent()['status'],'held')
