import { useEffect, useState } from 'react';
import { fetchModel, fetchModelPages } from './finalModel';

export function useResource<T>(path: string, params: Record<string,string>, contract?: string, enabled=true) {
  const key=JSON.stringify([path,params,contract,enabled]);
  const [state,setState]=useState<{key:string;data?:T;error?:string}>({key:''});
  useEffect(()=>{
    if(!enabled) return;
    const controller=new AbortController();
    setState({key});
    const promise=contract ? fetchModelPages(path,params,contract,controller.signal) : fetchModel(path,params,controller.signal);
    promise.then(data=>{if(!controller.signal.aborted)setState({key,data:data as T});})
      .catch(error=>{if(!controller.signal.aborted)setState({key,error:String(error.message)});});
    return ()=>controller.abort();
    // Serialized key covers all input values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  return state.key===key ? {...state,loading:enabled&&!state.data&&!state.error} : {key,loading:enabled,data:undefined,error:undefined};
}
export type WelfareProgram={version_id:string;title:string;support_content:string;status:string;
  source_categories:{category_id:string;label:string}[];
  observation_reasons:{domain:string;score:number;i5_record_id:string;behavior_record_id:string}[];
  unconfirmed_conditions:string[];exclusion_reasons:string[];search_reasons:{type:string;reason?:string;domain?:string}[]};
export type WelfareResult={status:string;welfare_data_synthetic?:boolean;request:{support_as_of:string};
  mapping:{reasons:string[];rule_version:string}; recommendations:WelfareProgram[];excluded:WelfareProgram[];held:WelfareProgram[]};
export type ReviewEntry={id:string;at:string;type:string;region:string;text:string;owner:string;status:string};
export const storageKey='hermes-review-v1';
export function loadReviews():ReviewEntry[]{try {const value=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(value)?value.filter(x=>typeof x?.id==='string'&&typeof x?.text==='string'):[];}catch{return [];}}
export function downloadReport(data:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='hermes-review.json';link.click();URL.revokeObjectURL(url);}
