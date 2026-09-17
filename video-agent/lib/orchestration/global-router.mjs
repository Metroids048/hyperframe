import {readFileSync} from 'node:fs';
import {resolveSkills} from './skill-resolver.mjs';
import {parseRevisionNumber} from '../edit/revision-history.mjs';
export const routePolicy=JSON.parse(readFileSync(new URL('../../config/routing/route-policy.v1.json',import.meta.url),'utf8'));
export const fallbackPolicy=JSON.parse(readFileSync(new URL('../../config/routing/fallback-policy.v1.json',import.meta.url),'utf8'));
export function classifyFailure(error){return fallbackPolicy.classifiers.find(([,pattern])=>new RegExp(pattern).test(error.code||''))?.[0]||'quality_failure';}
export function selectiveHistoryTarget(message){
  if(/^(?:不行[，,]?)?(?:恢复|还原)(?:刚才|上一版)(?:的)?转场(?:[，,](?:但)?保留(?:现在|当前)(?:的)?字幕)?[。！!\s]*$/.test(message))return 'transition';
  if(/^(?:(?:声音|音频)(?:还是|用|恢复成)上一版的?|(?:恢复|还原)上一版(?:的)?(?:声音|音频))[。！!\s]*$/.test(message))return 'audio';
  return null;
}
export function controlRoute(project,message){
  const text=String(message).trim().replace(/[。！!？?\s]+$/,'');
  let mode=routePolicy.controls[text]||routePolicy.controls[text.toLowerCase()],revisionId=null;
  const match=/^(?:回到|恢复到)第([\d零〇一二两三四五六七八九十百千]+)版$/.exec(text);
  if(match){const n=parseRevisionNumber(match[1]);revisionId=project.revisions?.find((r,i)=>(r.number||i+1)===n)?.id;mode=revisionId?'restore':'clarify';}
  if(!mode)return null;
  if(['export','undo','redo','restore'].includes(mode)&&!project.currentRevisionId)mode='clarify';
  return {mode,quote:message,revisionId,assetIds:[],question:mode==='clarify'?'没有可操作的对应版本，请先打开已有工程。':'',source:'exact-control'};
}
export function routeDecision(project,message,route,{document,revision,operations=[]}={}){
  if(['restore','undo','redo'].includes(route.mode)&&route.targets?.length)route={...route,mode:'edit',revisionId:null,reason:'局部对象恢复必须作为编辑执行；'+(route.reason||'')};
  if(!routePolicy.modes.includes(route.mode))throw Object.assign(new Error('未知路由模式'),{code:'MESSAGE_ROUTE_INVALID'});
  const targets=route.targets||operations.map(op=>({id:op.nodeId||op.sceneId||op.fromSceneId||op.id||null,kind:/caption/.test(op.type)?'caption':/speech|voiceover/.test(op.type)?'voice':/audio/.test(op.type)?'audio':/transition/.test(op.type)?'transition':/text/.test(op.type)?'text':'timeline',operation:op.type}));
  const ids=new Set([...(document?.nodes||[]),...(document?.scenes||[]),...(document?.captions||[]),...(document?.audioGraph||[]),...(document?.transitions||[])].map(o=>o.id));
  if(document&&targets.some(t=>t.id&&!ids.has(t.id)))throw Object.assign(new Error('路由引用了当前版本不存在的对象'),{code:'AMBIGUOUS_TARGET'});
  const decision={...route,version:1,message,scenario:route.scenarioId||project.request?.businessContract?.scenarioId||project.request?.scenarioId||null,targets,preserve:[...new Set(['unmentioned-objects','source-assets','revision-history',...(route.preserve||[])])],executionStrategy:route.mode==='clarify'?'L3':route.source==='exact-control'?'L0':route.source==='exact-edit'?'L1':operations.length&&route.source!=='semantic'&&route.source!=='model'?'L1':'L2',confidence:['semantic','model'].includes(route.source)?.8:1,reason:route.reason||route.source||'existing-executor',fallback:structuredClone(fallbackPolicy),baseRevisionId:project.currentRevisionId||null};
  const selected=resolveSkills(decision,{project,document,revision,operations});
  return {...decision,selectedSkills:selected.skills.map(s=>s.id),skillReasons:selected.reasons};
}
export function assertNoEffectSubstitution(requested,actual){
  for(const op of requested.filter(o=>['transition','set_transition','set_scene_effect'].includes(o.type))){
    const candidate=actual.find(o=>o.type===op.type&&(o.fromId||o.fromSceneId||o.sceneId)===(op.fromId||op.fromSceneId||op.sceneId));
    if(!candidate||(candidate.effect||candidate.style)!==(op.effect||op.style))throw Object.assign(new Error('指定效果未完成；保留上一有效版本，不替换效果'),{code:'EXPLICIT_EFFECT_FAILURE'});
  }
}
// Adapters supply their existing planners; executors remain in creative/edit.
// Every entry observes the same control -> exact -> semantic ordering.
export async function routeUserMessage(project,message,{document,revision,localPlanner,semanticPlanner,skipLocal=false}={}){
  const control=controlRoute(project,message);
  if(control)return {decision:routeDecision(project,message,control,{document,revision}),plan:null};
  const historyTarget=selectiveHistoryTarget(message);
  if(historyTarget&&document)return {decision:routeDecision(project,message,{mode:'edit',source:'exact-edit',targets:[{id:null,kind:historyTarget,requirement:message}],reason:'按真实历史恢复指定对象，保持当前版本的其他内容'},{document,revision}),plan:null};
  let local;
  try{local=!skipLocal&&localPlanner?await localPlanner():null;}
  catch(error){
    if(!/AMBIGUOUS|TARGET_MISSING|TRANSITION_MISSING/.test(error.code||''))throw error;
    return {decision:routeDecision(project,message,{mode:'clarify',source:'local-target-check',question:error.message,reason:error.code},{document,revision}),plan:null};
  }
  if(local)return {decision:routeDecision(project,message,{mode:'edit',source:'exact-edit',quote:message,question:'',revisionId:null,assetIds:[]},{document,revision,operations:local.operations||local.result?.operations||[]}),plan:local};
  if(!semanticPlanner)return {decision:routeDecision(project,message,{mode:'clarify',source:'unsupported-capability',question:'当前入口没有可执行的对应能力。'},{document,revision}),plan:null};
  const planned=await semanticPlanner();
  const route=planned.mode?planned:{mode:planned.result?.clarification?'clarify':planned.result?.action==='export'?'export':'edit',source:'semantic'};
  return {decision:routeDecision(project,message,route,{document,revision,operations:planned.result?.operations||[]}),plan:planned};
}
