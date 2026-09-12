import {rebaseTextStyles} from './rich-text.mjs';
import {bindResourceChecks} from './resource-receipts.mjs';
import {insist, stableId} from './contracts.mjs';
import {cloneDocument, recomputeSceneStarts, validateDocument, solveSceneDurations} from './document.mjs';
import {normalizeEffectParams, validateEffect, EFFECTS} from './effects.mjs';
import {sceneLocks, lockScope, requestedLocks} from './locks.mjs';
import {cutNativeScene} from './cuts.mjs';
import {customParameters,compileCustomSource} from './custom-source.mjs';
import {alignSourceAudio} from './source-audio.mjs';

const allowed = new Set(['update_text', 'update_effect_params', 'set_scene_effect', 'replace_asset', 'set_scene_duration', 'reorder_scenes', 'set_transition', 'change_output','lock_scene','unlock_scene','update_media','retime_document']);
for(const type of ['add_audio','update_audio','remove_audio','split_scene','trim_scene','update_caption','set_captions','update_custom_source'])allowed.add(type);

export function applyDocumentPatch(input, operations, assets) {
  insist(Array.isArray(operations) && operations.length > 0 && operations.length <= 100, '修改清单必须为 1～100 项', 'INVALID_PATCH');
  const document = cloneDocument(input);
  const locks=new Map(input.scenes.flatMap(s=>Object.entries(sceneLocks(s)).filter(([,on])=>on).map(([kind])=>[s.id+':'+kind,{id:s.id,kind,before:lockScope(input,s.id,kind)}])));
  for (const op of operations) {
    insist(op && allowed.has(op.type), `不支持的原生工程修改：${op?.type}`, 'UNSUPPORTED_PATCH');
    if(op.type==='split_scene'||op.type==='trim_scene')cutNativeScene(document,op);
    if(op.type==='set_captions')document.captions=structuredClone(op.captions);
    if(op.type==='update_caption'){
      const cue=document.captions?.find(c=>c.id===op.nodeId);insist(cue,'目标字幕不存在','PATCH_TARGET_MISSING');
      insist(typeof op.text==='string'&&op.text.trim()&&[...op.text].length<=240,'字幕文字必须为1—240字','INVALID_TEXT');cue.text=op.text.trim();cue.reviewRequired=false;cue.corrected=true;
    }
    if(op.type==='lock_scene'||op.type==='unlock_scene'){
      const scene=document.scenes.find(s=>s.id===op.sceneId);insist(scene,'目标场景不存在','PATCH_TARGET_MISSING');scene.locks=sceneLocks(scene);delete scene.locked;
      recomputeSceneStarts(document);
      for(const kind of requestedLocks(op.params)){scene.locks[kind]=op.type==='lock_scene';const key=scene.id+':'+kind;if(scene.locks[kind]){if(!locks.has(key))locks.set(key,{id:scene.id,kind,before:lockScope(document,scene.id,kind)});}else locks.delete(key);}
    }
    if(op.type==='update_media'){
      const node=document.nodes.find(n=>n.id===op.nodeId);insist(node&&['image','video'].includes(node.kind),'目标素材节点不存在','PATCH_TARGET_MISSING');
      const p=op.params||{};insist(Object.keys(p).every(k=>['fit','sourceStartSeconds','playbackRate'].includes(k)),'不支持的媒体参数','INVALID_PATCH');
      if(p.fit!==undefined)insist(['contain','cover'].includes(p.fit),'取景方式无效','INVALID_PATCH');
      if(p.sourceStartSeconds!==undefined)insist(Number.isFinite(p.sourceStartSeconds)&&p.sourceStartSeconds>=0,'源入点无效','INVALID_SOURCE_RANGE');
      node.params={...node.params,...p};
    }
    if(['add_audio','update_audio','remove_audio'].includes(op.type)){
      document.audioGraph??=[];const index=document.audioGraph.findIndex(a=>a.id===op.nodeId);
      if(op.type!=='add_audio')insist(index>=0,'目标音轨不存在','PATCH_TARGET_MISSING');
      if(op.type==='remove_audio'){document.audioGraph.splice(index,1);continue;}
      const params=op.params||{};insist(Object.keys(params).every(k=>['startFrame','durationFrames','sourceStartSeconds','playbackRate','volume','fadeInFrames','fadeOutFrames','ducking','role'].includes(k)),'不支持的音轨参数','INVALID_PATCH');
      if(op.type==='add_audio'){insist(assets[op.assetId]?.mediaMetadata?.hasAudio,'素材没有可用声音','INVALID_AUDIO_ASSET');document.audioGraph.push({id:stableId('audio',input.revisionId,op,document.audioGraph.length),assetId:op.assetId,startFrame:0,sourceStartSeconds:0,playbackRate:1,volume:1,...params});}
      else {
        document.audioGraph[index]={...document.audioGraph[index],...params};
        // A requested audio-only timing edit deliberately separates this track.
        if(['startFrame','durationFrames','sourceStartSeconds','playbackRate'].some(k=>Object.hasOwn(params,k))){delete document.audioGraph[index].sourceNodeId;delete document.audioGraph[index].sceneId;}
      }
    }
    if(op.type==='retime_document'){
      insist(Number.isInteger(op.durationFrames)&&op.durationFrames>=150&&op.durationFrames<=18000,'总时长必须为5—600秒','INVALID_DURATION');
      const legacyPrice=s=>!document.production&&s.purpose==='price';
      const fixed=new Map(document.scenes.filter(s=>sceneLocks(s).timing||legacyPrice(s)).map(s=>[s.id,legacyPrice(s)&&!sceneLocks(s).timing?90:s.durationFrames]));
      const flexible=document.scenes.filter(s=>!fixed.has(s.id)),gross=op.durationFrames+document.transitions.reduce((n,t)=>n+t.durationFrames,0),remaining=gross-[...fixed.values()].reduce((a,b)=>a+b,0);
      insist(flexible.length?remaining>=flexible.length*45:remaining===0,'锁定内容与目标时长冲突','LOCK_CONFLICT');
      const durations=flexible.length?solveSceneDurations(remaining,flexible.length,0,flexible.map(s=>s.durationFrames)):[];
      for(const scene of document.scenes){const old=scene.durationFrames;scene.durationFrames=fixed.get(scene.id)??durations[flexible.indexOf(scene)];for(const node of document.nodes.filter(n=>n.sceneId===scene.id))if(node.localDurationFrames===old)node.localDurationFrames=scene.durationFrames;}
      for(const audio of document.audioGraph||[])audio.durationFrames=Math.min(audio.durationFrames,op.durationFrames-audio.startFrame);
    }
    if (op.type === 'update_text') {
      const node = document.nodes.find(n => n.id === op.nodeId);
      insist(node?.kind === 'text', '目标文字节点不存在', 'PATCH_TARGET_MISSING');
      insist(typeof op.text === 'string' && op.text.trim() && [...op.text].length <= 240, '文字必须为 1～240 字', 'INVALID_TEXT');
      for(const bundle of document.sourceBundles||[])rebaseTextStyles(bundle,node.id,node.params.text,op.text.trim());
      node.params = {...node.params, text: op.text.trim()};
      if(node.semanticRole==='price')document.brief.price=op.text.trim();
    }
    if (op.type === 'update_effect_params') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      if(scene.effect==='custom-native'){scene.effectParams=customParameters(document.sourceBundles.find(b=>b.sceneId===scene.id),{...scene.effectParams,...op.params});continue;}
      insist(Object.keys(op.params||{}).every(k=>EFFECTS[scene.effect]?.mutableParams.includes(k)), '这个动效不支持所请求参数', 'INVALID_EFFECT_PARAM');
      validateEffect(scene.effect, {
        assetCount: document.nodes.filter(n => n.sceneId === scene.id && n.assetId).length,
        nodeKinds: document.nodes.filter(n => n.sceneId === scene.id).map(n => n.kind),
      });
      scene.effectParams = normalizeEffectParams(scene.effect, {...scene.effectParams, ...(op.params || {})});
    }
    if(op.type==='update_custom_source'){
      const scene=document.scenes.find(s=>s.id===op.sceneId),index=document.sourceBundles?.findIndex(b=>b.sceneId===op.sceneId);
      insist(scene?.effect==='custom-native'&&index>=0,'目标原创场景不存在','PATCH_TARGET_MISSING');
      const params=op.params||{},keys=['html','css','timeline','parameters','objects','motionTargets'];
      insist(keys.every(k=>Object.hasOwn(params,k))&&Object.keys(params).every(k=>keys.includes(k)||['values','textStyles'].includes(k)),'原创场景需要完整的受控源码与对象图','CUSTOM_SOURCE');
      const before=document.sourceBundles[index],bundle={...Object.fromEntries(keys.map(k=>[k,structuredClone(params[k])])),...(Object.hasOwn(params,'textStyles')?(Array.isArray(params.textStyles)&&!params.textStyles.length?{}:{textStyles:structuredClone(params.textStyles)}):before.textStyles?{textStyles:structuredClone(before.textStyles)}:{}),id:before.id,sceneId:scene.id,...(before.contractVersion?{contractVersion:before.contractVersion,tokens:before.tokens}: {})};
      insist(Array.isArray(bundle.parameters),'原创参数列表无效','CUSTOM_PARAMETERS');
      const kept=Object.fromEntries(bundle.parameters.filter(p=>Object.hasOwn(scene.effectParams,p.name)).map(p=>[p.name,scene.effectParams[p.name]]));
      scene.effectParams=customParameters(bundle,params.values??kept);
      compileCustomSource(bundle,{scene,nodes:document.nodes.filter(n=>n.sceneId===scene.id),assets});
      document.sourceBundles[index]=bundle;
    }
    if (op.type === 'set_scene_effect') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      insist(typeof op.effect === 'string' && op.effect, '必须提供目标动效组件', 'MISSING_EFFECT');
      const sceneNodes = document.nodes.filter(n => n.sceneId === scene.id);
      validateEffect(op.effect, {
        assetCount: sceneNodes.filter(n => n.assetId).length,
        nodeKinds: sceneNodes.map(n => n.kind),
      });
      const previousEffect = scene.effect;
      insist(Object.keys(op.params||{}).every(k=>EFFECTS[op.effect]?.mutableParams.includes(k)), '这个动效不支持所请求参数', 'INVALID_EFFECT_PARAM');
      scene.effect = op.effect;
      // Preserve tuned values when a conversation re-applies the same effect
      // with only one parameter changed; switching to a new effect uses its
      // documented defaults.
      const baseParams = previousEffect === op.effect ? (scene.effectParams || {}) : {};
      scene.effectParams = normalizeEffectParams(op.effect, {...baseParams, ...(op.params || {})});
    }
    if (op.type === 'replace_asset') {
      const node = document.nodes.find(n => n.id === op.nodeId);
      insist(node && ['image', 'video'].includes(node.kind), '目标媒体节点不存在', 'PATCH_TARGET_MISSING');
      insist(assets[op.assetId] && ['image', 'video'].includes(assets[op.assetId].kind), '替换素材不存在或类型不支持', 'MISSING_ASSET');
      node.assetId = op.assetId;
      node.kind = assets[op.assetId].kind;
    }
    if (op.type === 'set_scene_duration') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      insist(Number.isInteger(op.durationFrames) && op.durationFrames >= 30 && op.durationFrames <= 3600, '场景时长必须为 30～3600 帧', 'INVALID_SCENE_TIME');
      const previousDuration=scene.durationFrames;scene.durationFrames = op.durationFrames;
      for (const node of document.nodes.filter(n => n.sceneId === scene.id)) node.localDurationFrames = node.localDurationFrames===previousDuration?op.durationFrames:Math.min(node.localDurationFrames || op.durationFrames, op.durationFrames - (node.localStartFrame || 0));
    }
    if (op.type === 'reorder_scenes') {
      insist(Array.isArray(op.sceneIds) && op.sceneIds.length === document.scenes.length, '必须提供完整场景顺序', 'INVALID_SCENE_ORDER');
      const current = new Set(document.scenes.map(s => s.id));
      insist(new Set(op.sceneIds).size === current.size && op.sceneIds.every(id => current.has(id)), '场景顺序包含缺失或重复 ID', 'INVALID_SCENE_ORDER');
      document.scenes = op.sceneIds.map(id => document.scenes.find(s => s.id === id));
      const transitions = [];
      const defaultOverlap = document.transitions[0]?.durationFrames || 9;
      const useDefaultTransition=document.transitions.length>0&&document.design.transition!=='cut';
      for (let i = 0; i < document.scenes.length - 1; i++) {
        const fromSceneId = document.scenes[i].id, toSceneId = document.scenes[i + 1].id;
        const old = document.transitions.find(t => t.fromSceneId === fromSceneId && t.toSceneId === toSceneId);
        if(old||useDefaultTransition)transitions.push(old || {id: stableId('transition', fromSceneId, toSceneId), fromSceneId, toSceneId, effect: document.design.transition, durationFrames: defaultOverlap, params: normalizeEffectParams(document.design.transition, {durationFrames: defaultOverlap})});
      }
      document.transitions = transitions;
    }
    if (op.type === 'set_transition') {
      const index = document.scenes.findIndex(s => s.id === op.fromSceneId);
      insist(index >= 0 && document.scenes[index + 1]?.id === op.toSceneId, '转场必须连接相邻场景', 'INVALID_TRANSITION_PAIR');
      const effect = op.effect || document.design.transition;
      if(effect==='cut'){document.transitions=document.transitions.filter(t=>t.fromSceneId!==op.fromSceneId||t.toSceneId!==op.toSceneId);continue;}
      validateEffect(effect);
      insist(['dissolve-transition', 'directional-transition', 'flash-transition'].includes(effect), '这里只允许转场组件', 'INVALID_TRANSITION_EFFECT');
      const durationFrames = Number(op.durationFrames ?? 9);
      insist(Number.isInteger(durationFrames) && durationFrames >= 1 && durationFrames <= 30, '转场必须为 1～30 帧', 'INVALID_TRANSITION_TIME');
      const next = {id: stableId('transition', op.fromSceneId, op.toSceneId), fromSceneId: op.fromSceneId, toSceneId: op.toSceneId, effect, durationFrames, params: normalizeEffectParams(effect, {...op.params, durationFrames})};
      const found = document.transitions.findIndex(t => t.fromSceneId === op.fromSceneId && t.toSceneId === op.toSceneId);
      if (found >= 0) document.transitions[found] = next; else document.transitions.push(next);
    }
    if (op.type === 'change_output') {
      const width = Number(op.width ?? document.output.width), height = Number(op.height ?? document.output.height);
      insist(Number.isInteger(width) && Number.isInteger(height) && width >= 64 && height >= 64 && width <= 1920 && height <= 1920 && Math.min(width, height) <= 1080 && width % 2 === 0 && height % 2 === 0, '输出尺寸无效', 'INVALID_OUTPUT');
      document.output = {...document.output, width, height};
      document.design = {...document.design, output: {width, height}};
    }
  }
  recomputeSceneStarts(document);
  alignSourceAudio(document);
  for(const {id,kind,before} of locks.values())insist(lockScope(document,id,kind)===before,`修改触及第 ${input.scenes.findIndex(s=>s.id===id)+1} 幕的${{content:'内容',layout:'布局',timing:'段内时长',absolute:'绝对位置'}[kind]}锁，上一版本已保留`,'LOCK_CONFLICT');
  document.revisionId = stableId('rev', input.revisionId, operations, document.scenes, document.nodes, document.transitions, document.output,document.audioGraph,document.sourceBundles);
  bindResourceChecks(document);
  if(document.quality){const invalidation=computeInvalidation(input,document);document.quality={status:'needs-review',engineering:'pending',revisionId:document.revisionId,priorReportRevisionId:input.quality.revisionId,fullPlayback:'pending',humanReview:'pending',rights:input.quality.rights||'requires-publisher-review',issues:[],invalidation};}
  if(document.timingPlan)document.timingPlan={...document.timingPlan,durationFrames:document.durationFrames,scenes:document.scenes.map(s=>({id:s.id,startFrame:s.startFrame,durationFrames:s.durationFrames})),audioGraph:document.audioGraph,readingAndActionsReviewed:false};
  validateDocument(document, assets);
  return document;
}

export function computeInvalidation(input, output) {
  const changedScenes = new Set();
  const beforeNodes = new Map(input.nodes.map(n => [n.id, n]));
  for (const node of output.nodes) {
    const before = beforeNodes.get(node.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(node)) changedScenes.add(node.sceneId);
  }
  for (const scene of output.scenes) {
    const before = input.scenes.find(s => s.id === scene.id);
    const visual=({locks,locked,...s})=>s;
    if (!before || JSON.stringify(visual(before)) !== JSON.stringify(visual(scene))) changedScenes.add(scene.id);
  }
  for(const source of output.sourceBundles||[])if(JSON.stringify(source)!==JSON.stringify(input.sourceBundles?.find(b=>b.sceneId===source.sceneId)))changedScenes.add(source.sceneId);
  return {
    changedScenes: [...changedScenes],
    fullRecompile: input.output.width !== output.output.width || input.output.height !== output.output.height || input.scenes.map(s => s.id).join('|') !== output.scenes.map(s => s.id).join('|'),
  };
}
