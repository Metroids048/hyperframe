import {performance} from 'node:perf_hooks';
export async function measure(job,name,work,details={}){
  const start=performance.now(),startedAt=new Date().toISOString();
  job.metrics??={stages:[],modelCalls:0,cacheHits:0};
  try{const value=await work();const cacheHit=value?.cacheHit??value?.metrics?.cacheHit??(name==='prepare_asset'||name==='prepare_voice'?value?.preparationCacheHit:name==='prepare_analysis'?value?.analysisCacheHit:undefined);if(cacheHit)job.metrics.cacheHits++;job.metrics.stages.push({name,startedAt,elapsedMs:Math.round(performance.now()-start),status:'complete',...(cacheHit!==undefined?{cacheHit}:{}),...(value?.cache?{cache:value.cache}:{}),...details});return value;}
  catch(error){job.metrics.stages.push({name,startedAt,elapsedMs:Math.round(performance.now()-start),status:'failed',error:error.message,...details});throw error;}
}
export function jobEvent(job){return {type:'job',jobId:job.id,kind:job.kind,status:job.status,stage:job.stage,progress:job.progress,revisionId:job.revisionId||null,error:job.error||null,question:job.question||null,metrics:job.metrics||null};}
