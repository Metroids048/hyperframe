import fs from 'node:fs/promises';
import path from 'node:path';
import {resourceHash} from './capabilities.mjs';
import {insist} from './contracts.mjs';

export const evidenceStates=['unobserved','uncertain','observed','absent','budget_exhausted','media_error'];

/** Sampling coverage is a density check, never evidence of continuous playback. */
export function samplingCoverage(records,{assetId,startSeconds,endSeconds},{action=false}={}){
 const maxGapSeconds=action ? .3 : 1.05,boundaryLimitSeconds=action ? .3 : .05;
  const times=[...new Set(records.filter(e=>e.assetId===assetId&&(!action||e.tool==='assets.inspect_actions'&&e.precisionLimitSeconds<=.25))
    .flatMap(e=>e.times||[]).filter(t=>Number.isFinite(t)&&t>=startSeconds&&t<=endSeconds))].sort((a,b)=>a-b);
  const gaps=[];
  if(!times.length)gaps.push({startSeconds,endSeconds,kind:'unobserved'});
  else{
    if(times[0]-startSeconds>boundaryLimitSeconds)gaps.push({startSeconds,endSeconds:times[0],kind:'start-boundary'});
    for(let i=1;i<times.length;i++)if(times[i]-times[i-1]>maxGapSeconds)gaps.push({startSeconds:times[i-1],endSeconds:times[i],kind:'sparse-sampling'});
    if(endSeconds-times.at(-1)>boundaryLimitSeconds)gaps.push({startSeconds:times.at(-1),endSeconds,kind:'end-boundary'});
  }
  return {assetId,startSeconds,endSeconds,sampledTimes:times,unobservedAtRequiredDensity:gaps,
    samplingSufficient:times.length>0&&!gaps.length,maxGapSeconds,boundaryLimitSeconds,
    state:!times.length?'unobserved':gaps.length?'sparse_sampling':'sampled',continuousPlaybackVerified:false};
}

// An index is derived from durable observations; it never turns a sampling gap
// into a claim that the source has no usable content.
export function buildEvidenceIndex(assets,batches=[],observations=[]){
  const entries=[];
  for(const batch of batches)for(const record of batch.records||[]){
    const asset=assets.find(a=>a.id===record.assetId);
    insist(asset&&(!record.sourceSha256||record.sourceSha256===asset.sha256),'观察证据与当前素材不匹配','CHECKPOINT_HASH');
    const notes=observations.filter(o=>o.assetId===asset.id);
    entries.push({...record,id:resourceHash({file:record.file,sha256:record.sha256}),sourceSha256:asset.sha256,
      tool:batch.tool||'assets.observe',batchKey:batch.key,state:'observed',
      observations:notes.map(o=>({visibleContent:o.visibleContent,uncertainty:o.uncertainty,confidence:o.confidence})),
      precisionLimitSeconds:batch.precisionLimitSeconds??null,continuousPlaybackVerified:false});
  }
  const unique=[...new Map(entries.map(e=>[e.id,e])).values()];
  return {version:2,assets:assets.map(a=>({assetId:a.id,sourceSha256:a.sha256,duration:a.mediaMetadata?.duration,
    ...(a.kind==='video'?{samplingCoverage:samplingCoverage(unique,{assetId:a.id,startSeconds:0,endSeconds:a.mediaMetadata.duration})}:{})})),entries:unique};
}

export function queryEvidence(index,{ranges=[],preferredRanges=[],preferredBatchKeys=[],requiredBatchKeys=[],assetIds=[],limit=12}={}){
  insist(Number.isInteger(limit)&&limit>0&&limit<=24,'证据查询超过图片预算','OBSERVATION_BUDGET');
  const relevant=index.entries.filter(e=>(!assetIds.length||assetIds.includes(e.assetId))&&(!ranges.length||ranges.some(r=>r.assetId===e.assetId&&(!(e.times||[]).length||(e.times||[]).some(t=>t>=r.startSeconds-.25&&t<=r.endSeconds+.25)))));
  const preferred=e=>preferredRanges.some(r=>r.assetId===e.assetId&&(e.times||[]).some(t=>t>=r.startSeconds-.25&&t<=r.endSeconds+.25));
  relevant.sort((a,b)=>Number(preferredBatchKeys.includes(b.batchKey))-Number(preferredBatchKeys.includes(a.batchKey))||Number(preferred(b))-Number(preferred(a)));
  // Round robin across source intervals/batches: latest observations cannot
  // evict every older observation simply because they were produced last.
  // Action-boundary reconciliation needs the entire requested contact sequence.
  // Old overview groups must not evict its later frames through round robin.
  const required=relevant.filter(e=>requiredBatchKeys.includes(e.batchKey));
  insist(required.length<=limit,'必要动作观察图片超过本次预算，不能静默遗漏','OBSERVATION_BUDGET');
  const groups=new Map();for(const e of relevant.filter(e=>!required.includes(e))){const k=[e.assetId,e.batchKey,e.startSeconds,e.endSeconds].join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
  const records=[...required];while(records.length<limit&&[...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length&&records.length<limit)records.push(g.shift());
  return {records,requestedRanges:ranges,preferredRanges,samplingCoverage:ranges.map(r=>samplingCoverage(records,r)),continuousPlaybackVerified:false,omitted:relevant.filter(e=>!records.includes(e)).map(e=>({id:e.id,assetId:e.assetId,file:e.file,times:e.times})),state:relevant.length?'observed':'unobserved',truncated:records.length<relevant.length};
}

export async function readEvidenceImages(directory,records){
  const images=[];
  for(const record of records){
    insist(/^evidence\/[a-zA-Z0-9_.-]+\.(?:jpg|png)$/.test(record.file),'观察证据路径无效','CHECKPOINT_HASH');
    const bytes=await fs.readFile(path.join(directory,record.file));
    insist(record.sha256&&resourceHash(bytes)===record.sha256,'观察图片已变化','CHECKPOINT_HASH');
    images.push({type:'input_text',text:JSON.stringify({file:record.file,assetId:record.assetId,sourceSha256:record.sourceSha256,times:record.times,precisionLimitSeconds:record.precisionLimitSeconds})},
      {type:'input_image',image_url:'data:image/'+(record.file.endsWith('.png')?'png':'jpeg')+';base64,'+bytes.toString('base64')});
  }
  return images;
}

export function reusableInspection(batches,ranges,assets){
  if(!assets)return undefined;
  return batches.find(b=>ranges.every(r=>{
    const asset=assets.find(a=>a.id===r.assetId);
    if(!asset)return false;
    const records=(b.records||[]).filter(e=>e.assetId===r.assetId&&e.sourceSha256===asset.sha256).map(e=>({...e,tool:b.tool,precisionLimitSeconds:b.precisionLimitSeconds}));
    return samplingCoverage(records,r,{action:b.tool==='assets.inspect_actions'}).samplingSufficient;
  }));
}

/** Keep each image together with its immediately preceding provenance text. */
export function selectEvidenceInputs(inputs,maxImages){
 const groups=[];let pending=[];
 for(const item of inputs){if(item.type==='input_image'){groups.push([...pending,item]);pending=[];}else pending.push(item);}
 const selected=groups.slice(0,maxImages),omitted=groups.slice(maxImages);
 return {inputs:selected.flat(),sent:selected.length,available:groups.length,omitted:omitted.map(group=>({labels:group.filter(i=>i.type==='input_text').map(i=>i.text),imageHash:resourceHash(group.find(i=>i.type==='input_image').image_url)}))};
}
