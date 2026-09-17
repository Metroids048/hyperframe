import {insist} from '../creative/contracts.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function conversationJobs(project){return [...new Map([...(project.imported?.originalJobs||[]),...(project.jobs||[])].filter(j=>j&&typeof j.id==='string').map(j=>[j.id,j])).values()];}
export function acceptedChanges(project){
  const ancestry=new Set();let revision=project.revisions?.find(r=>r.id===project.currentRevisionId);
  while(revision){ancestry.add(revision.id);revision=project.revisions.find(r=>r.id===revision.parentId);}
  return conversationJobs(project).filter(j=>j.status==='complete'&&Array.isArray(j.changeReceipt?.changeSet)&&ancestry.has(j.revisionId)).map(j=>j.changeReceipt);
}
const relativeMove=message=>/^(?:再)?(?:往)?(?:上|下)(?:挪|移)?(?:一点)?[。！!\s]*$/.test(message);
// Resolve scope from the request and PREVIOUS accepted edit, before planning.
// Never derive the permitted targets from the plan being checked.
export function conversationTargetScope(document,message,history=[],routeTargets=[]){
  if(!relativeMove(message)){
    // The semantic router has already bound request evidence to real objects.
    // Freeze that independently of the subsequent editing model's operations.
    if(!routeTargets.length||!routeTargets.every(t=>t.kind==='caption'&&t.id))return null;
    const ids=[...new Set(routeTargets.map(t=>t.id))];
    insist(ids.every(id=>document.captions?.some(c=>c.id===id)),'请求引用的字幕已变化','AMBIGUOUS_TARGET');
    return {baseRevision:document.revisionId,userRequest:message,kind:'caption',targetIds:ids,allowedTypes:['update_caption','update_caption_style','remove_caption'],basis:'message-route'};
  }
  const last=history.filter(h=>h.changeSet?.length).at(-1);
  insist(last&&last.changeSet.every(op=>['update_caption_style','update_caption'].includes(op.type)),'请说明要移动字幕还是画面文字。','AMBIGUOUS_TARGET');
  const ids=[...new Set(last.changeSet.flatMap(op=>op.nodeId?[op.nodeId]:(document.captions||[]).map(c=>c.id)))];
  insist(ids.length&&ids.every(id=>document.captions?.some(c=>c.id===id)),'上一轮字幕对象已变化，请明确要移动的字幕。','AMBIGUOUS_TARGET');
  return {baseRevision:document.revisionId,sourceRevision:last.newRevision||null,userRequest:message,kind:'caption',targetIds:ids,allowedTypes:['update_caption_style']};
}
export function resolveConversationMessage(message,history=[]){
  if(!relativeMove(message))return message;
  const last=history.filter(h=>h.changeSet?.length).at(-1);
  insist(last&&last.changeSet.every(op=>['update_caption_style','update_caption'].includes(op.type)),'请说明要移动字幕还是画面文字。','AMBIGUOUS_TARGET');
  return '字幕'+(message.includes('上')?'往上移一点':'往下移一点');
}
export function validateConversationTargetScope(document,operations,scope){
  if(!scope)return;
  insist(scope.baseRevision===document.revisionId,'局部修改基准版本已变化','REVISION_CONFLICT');
  insist(operations.length&&operations.every(op=>scope.allowedTypes.includes(op.type)&&scope.targetIds.includes(op.nodeId)),'修改计划超出了预先确定的字幕对象','PRESERVE_VIOLATION');
}
export function nativeChangeReceipt(before,after,message,operations,scope=null){
  validateConversationTargetScope(before,operations,scope);
  if(scope)for(const cue of before.captions||[])if(!scope.targetIds.includes(cue.id))insist(same(cue,after.captions?.find(c=>c.id===cue.id)),'未选中的字幕发生变化：'+cue.id,'PRESERVE_VIOLATION');
  const types=new Set(operations.map(o=>o.type));
  const structural=[...types].some(t=>['trim_scene','split_scene','set_scene_duration','retime_document','reorder_scenes','set_transition','change_output'].includes(t));
  const checks=[];
  const check=(field,required)=>{if(required){const passed=same(before[field]||[],after[field]||[]);checks.push({field,passed});insist(passed,'本次修改意外改变了应保留的'+field,'PRESERVE_VIOLATION');}};
  const explicitAudio=/(?:声音|音频|原声|配音|音乐)(?:都)?(?:不要动|别动|不动|不变|保持)|(?:不要动|别动)(?:声音|音频|原声|配音|音乐)/.test(message);
  const transitionOnly=types.has('set_transition')&&[...types].every(t=>['set_transition','set_scene_duration'].includes(t));
  check('audioGraph',explicitAudio||transitionOnly||(!structural&&![...types].some(t=>/audio/.test(t))));
  check('captions',transitionOnly||(!structural&&![...types].some(t=>/caption|audio/.test(t))));
  check('transitions',!structural&&![...types].some(t=>/transition/.test(t)));
  const touched=new Set(operations.map(o=>o.nodeId).filter(Boolean));
  if(!types.has('set_captions')&&![...types].some(t=>/audio/.test(t))&&!operations.some(o=>/caption/.test(o.type)&&!o.nodeId)){
    for(const cue of before.captions||[])if(!touched.has(cue.id))insist(same(cue,after.captions?.find(c=>c.id===cue.id)),'未选中的字幕发生变化：'+cue.id,'PRESERVE_VIOLATION');
  }
  const scopedScenes=new Set(operations.map(o=>o.sceneId).filter(Boolean));
  const content=value=>{if(!value||!structural)return value;const {startFrame,...rest}=value;return rest;};
  if(!types.has('retime_document')){
    for(const node of before.nodes||[])if(!touched.has(node.id)&&!scopedScenes.has(node.sceneId))insist(same(content(node),content(after.nodes.find(n=>n.id===node.id))),'未选中的对象发生变化：'+node.id,'PRESERVE_VIOLATION');
    for(const scene of before.scenes||[])if(!scopedScenes.has(scene.id))insist(same(content(scene),content(after.scenes.find(s=>s.id===scene.id))),'未选中的场景内容发生变化：'+scene.id,'PRESERVE_VIOLATION');
    checks.push({field:'untargeted-content',passed:true});
  }
  check('output',!types.has('change_output'));
  return {baseRevision:before.revisionId,userRequest:message,...(scope?{requestedScope:structuredClone(scope)}:{}),targetSet:operations.map(o=>({type:o.type,id:o.nodeId||o.sceneId||o.fromSceneId||null})),preserveSet:checks.map(c=>c.field),changeSet:structuredClone(operations),validation:{passed:true,checks},newRevision:after.revisionId};
}
export function transitionRestorePlan(current,previous){
  insist(current.scenes.map(s=>s.id).join()===previous.scenes.map(s=>s.id).join(),'场景顺序已变化，不能直接恢复旧转场','REVISION_CONFLICT');
  const operations=previous.transitions.filter(t=>!same(t,current.transitions.find(c=>c.id===t.id))).map(t=>({type:'set_transition',fromSceneId:t.fromSceneId,toSceneId:t.toSceneId,effect:t.effect,durationFrames:t.durationFrames,params:t.params||{}}));
  for(const t of current.transitions)if(!previous.transitions.some(p=>p.fromSceneId===t.fromSceneId&&p.toSceneId===t.toSceneId)){
    operations.push({type:'set_transition',fromSceneId:t.fromSceneId,toSceneId:t.toSceneId,effect:'cut'});
    const from=current.scenes.find(s=>s.id===t.fromSceneId),old=previous.scenes.find(s=>s.id===t.fromSceneId);
    if(from.durationFrames-old.durationFrames===t.durationFrames)operations.push({type:'set_scene_duration',sceneId:from.id,durationFrames:old.durationFrames});
  }
  insist(operations.length,'上一版没有不同的转场','RESTORE_NOT_FOUND');
  return {operations,mode:'selective-transition-restore',summary:'仅恢复真实上一版转场，保留当前字幕及其他内容。'};
}

export function audioRestorePlan(current,previous){
  insist(current.durationFrames===previous.durationFrames,'时长已经变化，旧声音需要重新核对时间范围','REVISION_CONFLICT');
  insist(!same(current.audioGraph,previous.audioGraph),'上一版没有不同的声音','RESTORE_NOT_FOUND');
  const captions=(current.captions||[]).map(c=>{
    const track=current.audioGraph.find(t=>t.assetId===c.assetId&&(t.captionSourceId||t.id)===c.trackId);
    if(previous.audioGraph.some(t=>t.assetId===c.assetId&&(t.captionSourceId||t.id)===c.trackId))return c;
    // Only measured prior cues can supply timings. Never stretch caption times
    // proportionally to a different voice or reuse another sentence's timings.
    const prior=(previous.captions||[]).filter(p=>previous.audioGraph.some(t=>t.assetId===p.assetId&&(t.captionSourceId||t.id)===p.trackId&&t.startFrame===track?.startFrame)).sort((a,b)=>a.sourceStartSeconds-b.sourceStartSeconds);
    const matches=[];
    for(let i=0;i<prior.length;i++){
      let text='';
      for(let j=i;j<prior.length;j++){
        const first=prior[i],last=prior[j];
        if(j>i&&(last.assetId!==first.assetId||last.trackId!==first.trackId||last.sourceStartSeconds-prior[j-1].sourceEndSeconds>.6||last.sourceStartSeconds<prior[j-1].sourceEndSeconds-1/30))break;
        text+=last.text;
        if(text===c.text)matches.push({...first,sourceEndSeconds:last.sourceEndSeconds});
        if(text.length>=c.text.length)break;
      }
    }
    insist(matches.length===1,'旧声音与当前字幕分段不对应，需要重新对齐该句，当前版本保留','CAPTION_ALIGNMENT_REQUIRED');
    const p=matches[0];return {...c,assetId:p.assetId,trackId:p.trackId,sourceStartSeconds:p.sourceStartSeconds,sourceEndSeconds:p.sourceEndSeconds};
  });
  const allowed=['startFrame','durationFrames','speechWindowFrames','sourceStartSeconds','playbackRate','volume','fadeInFrames','fadeOutFrames','ducking','role','sourceNodeId'];
  insist(previous.audioGraph.every(t=>!t.captionSourceId&&!t.sceneId),'旧声音带有剪切关联，需要通过原有时间线恢复','REVISION_CONFLICT');
  return {mode:'selective-audio-restore',summary:'恢复上一版声音；当前画面、文案和字幕样式保持。',operations:[...current.audioGraph.map(t=>({type:'remove_audio',nodeId:t.id})),...previous.audioGraph.map(t=>({type:'add_audio',nodeId:t.id,assetId:t.assetId,params:Object.fromEntries(allowed.filter(k=>Object.hasOwn(t,k)).map(k=>[k,t[k]]))})),{type:'set_captions',captions}]};
}
