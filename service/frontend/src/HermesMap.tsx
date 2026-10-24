import { useEffect, useState } from 'react';
type Geometry={type:string;coordinates:number[][][]|number[][][][]};
type Province={properties:{name:string;name_eng:string;code:string};geometry:Geometry};
// Explicit navigation-only crosswalk from KOSTAT 2018 names to current MOIS province codes.
const codes:Record<string,string>={Seoul:'11',Busan:'26',Daegu:'27',Incheon:'28',Gwangju:'29',Daejeon:'30',Ulsan:'31',Sejong:'36',Gyeonggi:'41',Gangwon:'51',Chungcheongbuk:'43',Chungcheongnam:'44',Jeollabuk:'52',Jeollanam:'46',Gyeongsangbuk:'47',Gyeongsangnam:'48',Jeju:'50'};
export default function HermesMap({province,onSelect}:{province:string;onSelect:(code:string)=>void}){
  const [features,setFeatures]=useState<Province[]>([]);const [error,setError]=useState('');
  useEffect(()=>{const c=new AbortController();fetch(`${import.meta.env.BASE_URL}hermes/provinces.geojson`,{signal:c.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>setFeatures(d.features)).catch(()=>{if(!c.signal.aborted)setError('지도 경계를 불러오지 못했습니다. 상단 시도 선택을 이용해 주세요.');});return()=>c.abort();},[]);
  const project=(p:number[])=>`${((p[0]-124.5)*94).toFixed(1)},${((39-p[1])*110).toFixed(1)}`;
  return <div className="hm-national">{error&&<p role="alert">{error}</p>}<svg viewBox="0 0 650 690" role="img" aria-label="전국 시도 탐색 지도">
    {features.map(f=>{const code=codes[f.properties.name_eng.replace(/-do$/,'').replace('Sejongsi','Sejong')];const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates as number[][][]]:f.geometry.coordinates as number[][][][];
      const d=polygons.map(p=>p.map(r=>'M'+r.map(project).join('L')+'Z').join('')).join('');
      return <path key={f.properties.code} d={d} fillRule="evenodd" className={province===code?'chosen':''} role="button" tabIndex={code?0:-1} aria-label={f.properties.name} onClick={()=>code&&onSelect(code)} onKeyDown={e=>{if(code&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onSelect(code);}}}><title>{f.properties.name}</title></path>;})}
  </svg><p className="hm-source">시도 탐색용 2018 경계 · 현재 지수의 지역 경계가 아닙니다.<br/><a href="https://github.com/southkorea/southkorea-maps" target="_blank" rel="noreferrer">경계 출처: southkorea-maps / KOSTAT</a></p></div>;
}
