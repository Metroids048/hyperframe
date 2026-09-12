import {insist} from './contracts.mjs';
// Tool-side sampling budget, not a claim that the entire requested span was observed.
export function boundObservationRanges(ranges,assets){
 insist(Array.isArray(ranges)&&ranges.length<=6,'观察申请最多6段','INVALID_OBSERVATION_REQUEST');
 const byId=Object.fromEntries(assets.map(a=>[a.id,a])),omitted=[];
 const selected=ranges.map(r=>{const a=byId[r.assetId],duration=a?.mediaMetadata?.duration;
  insist(a?.kind==='video'&&Number.isFinite(r.startSeconds)&&Number.isFinite(r.endSeconds)&&r.startSeconds>=0&&r.endSeconds>r.startSeconds&&r.endSeconds<=duration,'观察申请含无效素材或越界区间','INVALID_OBSERVATION_REQUEST');
  if(r.endSeconds-r.startSeconds<=45)return {...r};
  const endAnchored=Math.abs(r.endSeconds-duration)<.05,start=endAnchored?r.endSeconds-45:r.startSeconds,end=endAnchored?r.endSeconds:r.startSeconds+45;
  omitted.push({assetId:r.assetId,startSeconds:endAnchored?r.startSeconds:end,endSeconds:endAnchored?start:r.endSeconds,status:'not-densely-observed'});
  return {...r,startSeconds:start,endSeconds:end};
 });return {requested:ranges,selected,omitted,limits:{maxRanges:6,maxSecondsPerRange:45}};
}
