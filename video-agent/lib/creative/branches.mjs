import {insist} from './contracts.mjs';
export function assertOpeningOnly(base,candidate){
  const id=base.scenes[0].id,same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  insist(candidate.scenes[0].id===id&&candidate.scenes[0].durationFrames===base.scenes[0].durationFrames&&same(candidate.scenes.slice(1),base.scenes.slice(1)),'开头分支改变了后文或时长','BRANCH_SCOPE_CONFLICT');
  insist(same(candidate.nodes.filter(n=>n.sceneId!==id),base.nodes.filter(n=>n.sceneId!==id))&&same(candidate.audioGraph,base.audioGraph)&&same(candidate.captions,base.captions)&&same(candidate.output,base.output)&&same(candidate.transitions,base.transitions),'开头分支改变了非目标内容','BRANCH_SCOPE_CONFLICT');
}
