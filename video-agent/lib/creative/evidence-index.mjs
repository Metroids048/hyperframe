import fs from 'node:fs/promises';
import path from 'node:path';
import {resourceHash} from './capabilities.mjs';
import {insist} from './contracts.mjs';

export const evidenceStates=['unobserved','uncertain','observed','absent','budget_exhausted','media_error'];

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
  return {version:1,assets:assets.map(a=>({assetId:a.id,sourceSha256:a.sha256,duration:a.mediaMetadata?.duration})),entries:[...new Map(entries.map(e=>[e.id,e])).values()]};
}

export function queryEvidence(index,{ranges=[],preferredRanges=[],assetIds=[],limit=12}={}){
  insist(Number.isInteger(limit)&&limit>0&&limit<=24,'证据查询超过图片预算','OBSERVATION_BUDGET');
  const relevant=index.entries.filter(e=>(!assetIds.length||assetIds.includes(e.assetId))&&(!ranges.length||ranges.some(r=>r.assetId===e.assetId&&(!(e.times||[]).length||(e.times||[]).some(t=>t>=r.startSeconds-.25&&t<=r.endSeconds+.25)))));
  const preferred=e=>preferredRanges.some(r=>r.assetId===e.assetId&&(e.times||[]).some(t=>t>=r.startSeconds-.25&&t<=r.endSeconds+.25));
  relevant.sort((a,b)=>Number(preferred(b))-Number(preferred(a)));
  // Round robin across source intervals/batches: latest observations cannot
  // evict every older observation simply because they were produced last.
  const groups=new Map();for(const e of relevant){const k=[e.assetId,e.batchKey,e.startSeconds,e.endSeconds].join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e);}
  const records=[];while(records.length<limit&&[...groups.values()].some(g=>g.length))for(const g of groups.values())if(g.length&&records.length<limit)records.push(g.shift());
  return {records,requestedRanges:ranges,preferredRanges,omitted:relevant.filter(e=>!records.includes(e)).map(e=>({id:e.id,assetId:e.assetId,file:e.file,times:e.times})),state:relevant.length?'observed':'unobserved',truncated:records.length<relevant.length};
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

export function reusableInspection(batches,ranges){
  return batches.find(b=>ranges.every(r=>(b.records||[]).some(e=>e.assetId===r.assetId&&e.startSeconds<=r.startSeconds&&e.endSeconds>=r.endSeconds)));
}
