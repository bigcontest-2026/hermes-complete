"""Real model evidence -> explicit research rule -> ERD welfare candidates.

No I5 threshold is assumed. Context mode uses available domain scores as
explanatory references, not high/low classifications or individual needs.
"""
import argparse
import json
import math
import sqlite3
from contextlib import closing
from pathlib import Path

from .welfare_erd import ERDWelfareDB, review_candidates

RULE_VERSION = 'research-context-v1'
AGES = {'20G': (20,29), '30G': (30,39), '40G': (40,49),
        '50G': (50,59), '60GU': (60,float('inf'))}


def build_intent(i5, behavior, *, research_context=False):
    result = {'status':'held', 'rule_version':RULE_VERSION, 'rule_status':'draft',
              'mode':'context_only' if research_context else 'unconfigured',
              'i5_domains':[], 'evidence':[], 'reasons':[], 'route':'insufficient_evidence'}
    if not research_context:
        result['reasons']=['I5 임계값 미확정: 연구용 context 모드를 명시해야 실행합니다.']
        return result
    if i5 is None or behavior is None:
        result['reasons']=['동일 지역·월의 I5 또는 활동 근거가 없습니다.']
        return result
    key=behavior['key']
    if (i5['region_code'],i5['month']) != (key['region_code'],key['month']):
        raise ValueError('I5 and activity region/month mismatch')
    if i5.get('spatial_unit')!='sgg' or behavior.get('spatial_unit')!='sgg':
        raise ValueError('only explicit SGG context join is supported')
    if behavior.get('comparison_status')!='computed':
        result['reasons']=['활동 전월 비교가 계산 가능한 상태가 아닙니다.']
        return result
    joint=behavior['rule'].get('candidate') is True
    robust=behavior['robust'].get('candidate') is True
    streak=behavior['rule'].get('two_month_streak') is True
    declines=[]
    for source in ('skt','card_a'):
        data=behavior.get('sources',{}).get(source,{})
        change=data.get('change_percent')
        if data.get('calculation_status')=='computed' and isinstance(change,(int,float)) and not isinstance(change,bool) and math.isfinite(change) and change<0:
            declines.append(source)
    if joint or robust or streak:
        result['route']='focused_investigation' if robust or streak else 'common_factor_review'
        proposed=['P','C','U']
        if 'card_a' in declines:
            proposed.append('E')
    elif declines:
        result['route']='single_source_review'
        proposed=['O','P'] if 'skt' in declines else ['E']
    else:
        result.update(status='no_signal',route='no_active_signal',reasons=['발동한 활동신호가 없어 자동 검색하지 않습니다.'])
        return result
    for domain in proposed:
        score=i5.get('domain_scores',{}).get(domain)
        if not isinstance(score,(int,float)) or isinstance(score,bool) or not math.isfinite(score) or not 0<=score<=100:
            continue
        result['i5_domains'].append(domain)
        result['evidence'].append({'domain':domain,'score':score,'i5_record_id':i5['record_id'],
                                  'behavior_record_id':behavior['record_id']})
    result['status']='selected' if result['i5_domains'] else 'held'
    result['signals']={'joint_decline':joint,'robust':robust,'two_month_streak':streak,'declining_sources':declines}
    result['reasons']=['제안 규칙: 활동신호의 조사 경로와 관련 I5 영역 참고값으로 사업을 탐색합니다.',
                       'I5가 높다고 판정하지 않았으며, 소비 감소를 소득 부족으로 확정하지 않습니다.']
    return result


def run(*, i5_bundle, activity_bundle, db_path, publication_id, region_code, month,
        sex_code, age_code, as_of, research_context=False, allow_synthetic=False):
    # Use model public readers: completion, real-data marker and output hashes are verified.
    from final_model.src.survey_area_index import query as i5_query
    from final_model.src.query import query as activity_query
    from datetime import date
    date.fromisoformat(as_of)
    if age_code not in AGES:
        raise ValueError('unsupported age group')
    survey=i5_query(i5_bundle,level='sgg',region_code=region_code,month=month,limit=2)
    activity=activity_query(activity_bundle,region_code=region_code,month=month,
                            sex_code=sex_code,age_code=age_code,limit=2)
    if survey['total_matched']>1 or activity['total_matched']>1:
        raise ValueError('ambiguous model evidence')
    i5=survey['records'][0] if survey['records'] else None
    behavior=activity['records'][0]['behavior'] if activity['records'] else None
    intent=build_intent(i5,behavior,research_context=research_context)
    result={'contract_version':'welfare_research_pipeline_v1','request':{
        'region_code':region_code,'month':month,'sex_code':sex_code,'age_code':age_code,'support_as_of':as_of},
        'mapping':intent,'quality_status':'hold','operational_alert_allowed':False,
        'model_inputs_synthetic':False,'i5':i5,'activity':behavior,
        'availability':{'i5':survey['availability'],'activity':activity['availability']},
        'provenance':{'i5_bundle':str(Path(i5_bundle).resolve()),
                      'activity_bundle':str(Path(activity_bundle).resolve()),'activity_run_id':activity['run_id']},
        'limitations':['지역 I5는 전국 성·연령 평균을 지역 인구구성으로 가중한 참고값입니다.',
            '활동자료는 성·연령 집단의 장소 유동·가맹점 거래입니다. 지역 거주자의 개인 상태가 아닙니다.',
            '지역 전체 I5와 활동 집단을 맥락으로 연결했으며 동일 성·연령 집단 점수로 결합하지 않았습니다.',
            '관측 월과 사업 검토 기준일은 별개입니다. 과거 활동신호를 현재 위험으로 단정하지 않습니다.',
            '연구·시연용 제안 규칙이며 운영 경보·개인 자격 확정에 사용하지 않습니다.'],
        'recommendations':[],'excluded':[],'held':[]}
    if intent['status']!='selected':
        result['status']=intent['status']
        return result
    db=ERDWelfareDB(db_path,publication_id,allow_synthetic=allow_synthetic)
    candidates=db.search(i5_domains=intent['i5_domains'])
    # Exact same code system only. No name/prefix or automatic 10->5 digit conversion.
    with closing(sqlite3.connect(Path(db_path).resolve().as_uri()+'?mode=ro',uri=True)) as con:
        regions={r[0] for r in con.execute('SELECT region_id FROM administrative_regions WHERE code_system=? AND code=?',('KR_SGG',region_code))}
    if not regions:
        # Unknown mapping must not be interpreted as known regional mismatch.
        for p in candidates['programs']:
            if any(r['scope_type']=='specific' for r in p['regions']):
                p['regions']=[{'scope_type':'unknown','region_id':None}]
    reviewed=review_candidates(candidates,region_ids=regions,age_range=AGES[age_code],as_of=as_of)
    for p in reviewed['programs']:
        matched={r['domain'] for r in p['search_reasons'] if r['type']=='i5_link'}
        p['observation_reasons']=[e for e in intent['evidence'] if e['domain'] in matched]
        p['mapping_rule_version']=RULE_VERSION
        p['unconfirmed_conditions'].append('실제 지원 필요 및 활동 감소 원인')
        result[{'needs_confirmation':'recommendations','excluded':'excluded','source_hold':'held'}[p['status']]].append(p)
    result.update(status='completed',welfare_data_synthetic=reviewed['is_synthetic'],
                  publication_id=publication_id,coverage=reviewed['coverage'],region_mapping_verified=bool(regions))
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('i5-bundle','activity-bundle','db-path','publication-id','region-code','month','sex-code','age-code','as-of','output'):
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--research-context',action='store_true')
    parser.add_argument('--allow-synthetic',action='store_true')
    args=vars(parser.parse_args())
    output=Path(args.pop('output'))
    result=run(**args)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'status':result['status'],'domains':result['mapping']['i5_domains'],
                      **{k:len(result[k]) for k in ('recommendations','excluded','held')}},ensure_ascii=False))


if __name__=='__main__':
    main()
