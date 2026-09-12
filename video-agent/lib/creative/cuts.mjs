import {insist,stableId} from './contracts.mjs';
import {recomputeSceneStarts} from './document.mjs';
import {alignSourceAudio,sliceSourceAudio} from './source-audio.mjs';

function sliceNodes(document,scene,start,end,newSceneId,suffix){
  return document.nodes.filter(n=>n.sceneId===scene.id).flatMap(n=>{
    const first=Math.max(start,n.localStartFrame||0),last=Math.min(end,(n.localStartFrame||0)+n.localDurationFrames);if(last<=first)return [];
    const node=structuredClone(n);node.sceneId=newSceneId;if(suffix)node.id=stableId('node',n.id,suffix);
    node.localStartFrame=first-start;node.localDurationFrames=last-first;node.durationFrames=last-first;
    if(node.kind==='video')node.params={...node.params,sourceStartSeconds:(node.params?.sourceStartSeconds||0)+(first-(n.localStartFrame||0))/30*(node.params?.playbackRate??1)};
    return [node];
  });
}
function removeAudioRange(document,start,end){
  const removed=end-start;
  document.audioGraph=(document.audioGraph||[]).flatMap(a=>{
    if(a.sourceNodeId)return [a];
    const originalEnd=a.startFrame+a.durationFrames;
    const parts=[[a.startFrame,Math.min(originalEnd,start)],[Math.max(a.startFrame,end),originalEnd]].filter(([s,e])=>e>s);
    return parts.map(([s,e],i)=>{
      const shift=s>=end?removed:0,node={...a,captionSourceId:a.captionSourceId||a.id,id:i?stableId('audio',a.id,'cut',start,end):a.id,startFrame:s-shift,durationFrames:e-s,sourceStartSeconds:(a.sourceStartSeconds||0)+(s-a.startFrame)/30*(a.playbackRate??1)};
      node.fadeInFrames=s===a.startFrame?Math.min(a.fadeInFrames||0,node.durationFrames):0;
      node.fadeOutFrames=e===originalEnd?Math.min(a.fadeOutFrames||0,node.durationFrames-node.fadeInFrames):0;
      node.ducking=(a.ducking||[]).flatMap(d=>{const first=Math.max(s,d.startFrame),last=Math.min(e,d.endFrame);return last>first?[{...d,startFrame:first-shift,endFrame:last-shift}]:[];});return node;
    });
  });
}
export function cutNativeScene(document,op){
  recomputeSceneStarts(document);const index=document.scenes.findIndex(s=>s.id===op.sceneId),scene=document.scenes[index];insist(scene,'目标场景不存在','PATCH_TARGET_MISSING');
  insist(scene.purpose!=='price','价格场景须保持完整，不能剪分','PRICE_RANGE_CONFLICT');
  const oldNodes=document.nodes.filter(n=>n.sceneId===scene.id);let splitId;
  if(op.type==='split_scene'){
    insist(Object.keys(op.params||{}).every(k=>k==='atFrame'),'不支持的分割参数','INVALID_PATCH');
    const at=op.params?.atFrame;insist(Number.isInteger(at)&&at>0&&at<scene.durationFrames,'分割点必须在场景内部','INVALID_SPLIT');
    const newId=stableId('scene',scene.id,'split',at,document.revisionId),right={...structuredClone(scene),id:newId,durationFrames:scene.durationFrames-at};
    splitId=newId;
    const nodes=[...sliceNodes(document,scene,0,at,scene.id),...sliceNodes(document,scene,at,scene.durationFrames,newId,newId)];
    insist(nodes.some(n=>n.sceneId===scene.id)&&nodes.some(n=>n.sceneId===newId),'分割会产生空场景','INVALID_SPLIT');
    for(const t of document.transitions)if(t.fromSceneId===scene.id)t.fromSceneId=newId;
    scene.durationFrames=at;document.scenes.splice(index+1,0,right);document.nodes=document.nodes.filter(n=>n.sceneId!==scene.id).concat(nodes);
  }else{
    insist(Object.keys(op.params||{}).every(k=>['startFrame','endFrame'].includes(k)),'不支持的剪切参数','INVALID_PATCH');
    const start=op.params?.startFrame,end=op.params?.endFrame;insist(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=scene.durationFrames,'保留范围必须在场景内部','INVALID_TRIM');
    const nodes=sliceNodes(document,scene,start,end,scene.id);insist(nodes.length,'剪辑会产生空场景','INVALID_TRIM');
    const tailStart=scene.startFrame+end,tailEnd=scene.startFrame+scene.durationFrames;
    if(tailEnd>tailStart)removeAudioRange(document,tailStart,tailEnd);
    if(start)removeAudioRange(document,scene.startFrame,scene.startFrame+start);
    document.nodes=document.nodes.filter(n=>n.sceneId!==scene.id).concat(nodes);scene.durationFrames=end-start;
  }
  document.audioGraph=(document.audioGraph||[]).flatMap(track=>{
    const old=oldNodes.find(n=>n.id===track.sourceNodeId);if(!old)return [track];
    const children=document.nodes.filter(n=>n.id===old.id||splitId&&n.id===stableId('node',old.id,splitId));
    return children.map((node,i)=>({...sliceSourceAudio(track,old,node),id:i?stableId('audio',track.id,'split',splitId):track.id}));
  });
  recomputeSceneStarts(document);
  alignSourceAudio(document);
}
