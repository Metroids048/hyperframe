import {insist} from './contracts.mjs';
// Closed grammar: compound requests outside these exact scopes go to the model.
export function scopedCommerceEdit(document,message){
 const text=String(message).trim().replace(/[。！!\s]/g,'');
 if(/^(?:把)?细节镜头提前[，,]只在第(?:一|1)个转场使用(?:色散|ChromaticRadialSplit|chromatic-split)[，,](?:其他内容保持|其他保持|其余不动)$/i.test(text)){
  const matches=document.scenes.flatMap((s,i)=>i>0&&(/细节|detail|结构/i.test(s.purpose)||document.nodes?.some(n=>n.sceneId===s.id&&n.kind==='text'&&/细节|detail|结构/i.test(n.params?.text||'')))?[i]:[]);
  insist(matches.length<=1,'有多个细节镜头，请指定镜头编号','DETAIL_TARGET_AMBIGUOUS');
  const index=matches[0]??-1;
  insist(index>0,'没有明确的细节镜头，请指定镜头编号','DETAIL_TARGET_MISSING');
  // A match inside the already-second continuous scene is not a completed
  // "move earlier" edit. Let the full planner inspect and split its source.
  if(index===1)return null;
  const ids=document.scenes.map(s=>s.id),[detail]=ids.splice(index,1);ids.splice(1,0,detail);
  const operations=index===1?[]:[{type:'reorder_scenes',sceneIds:ids}];
  const duration=document.transitions[0]?.durationFrames;
  insist(duration,'当前为直切；添加重叠会改变时长，需要先明确转场时长','TRANSITION_MISSING');
  operations.push({type:'set_transition',fromSceneId:ids[0],toSceneId:ids[1],effect:'chromatic-split',durationFrames:duration,params:{}});
  for(let i=1;i<ids.length-1;i++){
   const prior=document.transitions.find(t=>t.fromSceneId===ids[i]&&t.toSceneId===ids[i+1]);
   if(prior?.effect==='chromatic-split')operations.push({type:'set_transition',fromSceneId:ids[i],toSceneId:ids[i+1],effect:document.design.transition==='chromatic-split'?'cut':document.design.transition,durationFrames:prior.durationFrames,params:{}});
  }
  return {mode:'local-scoped',operations,summary:(index===1?'细节已在第二幕，保持位置；':'细节镜头提前至第二幕；')+'仅第一个转场使用官方色散，保留文案、媒体和音轨。'};
 }
 // Quoted copy is data: do not strip its spaces, punctuation or line breaks.
 const finalText=/^(?:最后一句|结尾文字)\s*改为\s*[“"]([^”"]+)[”"]\s*[，,]\s*只改画面文字[。！!\s]*$/.exec(String(message).trim());
 if(finalText){
  const last=document.scenes.at(-1),nodes=document.nodes.filter(n=>n.sceneId===last.id&&n.kind==='text');
  const candidates=nodes.filter(n=>n.semanticRole==='cta'),node=candidates.length===1?candidates[0]:nodes.length===1?nodes[0]:null;
  insist(node,'结尾有多个文字对象，需指定要改的一句','CTA_TARGET_MISSING');
  return {mode:'local-scoped',operations:[{type:'update_text',nodeId:node.id,text:finalText[1]}],summary:'仅替换结尾显示文字，镜头和声音保持。'};
 }
 const recut=/^将当前工程整理为(\d+)秒竖屏[，,]使用简洁的原生图文布局和0[.]3秒淡化转场[，,]保留现有素材文案和声音$/.exec(text);
 if(recut){
  const operations=[{type:'change_output',width:1080,height:1920},...document.scenes.map(s=>({type:'set_scene_effect',sceneId:s.id,effect:'split-detail'}))];
  for(let i=0;i<document.scenes.length-1;i++)operations.push({type:'set_transition',fromSceneId:document.scenes[i].id,toSceneId:document.scenes[i+1].id,effect:'dissolve-transition',durationFrames:9,params:{}});
  operations.push({type:'retime_document',durationFrames:Number(recut[1])*30});
  return {mode:'local-scoped',operations,summary:'使用现有媒体与文案整理竖屏候选，保留音轨；需要重新检查画面。'};
 }
 if(/^(?:只把|只在)?第(?:一|1)个转场(?:换成|使用)(?:ChromaticRadialSplit|chromatic-split|色散)[，,]?(?:其余保持|其余不动|其他不动)?$/i.test(text)){
  const t=document.transitions[0];insist(t,'第一个切点尚无转场，请先指定转场时长','TRANSITION_MISSING');
  return {mode:'local-scoped',operations:[{type:'set_transition',fromSceneId:t.fromSceneId,toSceneId:t.toSceneId,effect:'chromatic-split',durationFrames:t.durationFrames,params:{}}],summary:'仅替换第一个转场，保持时长、素材和声音。'};
 }
 if(/^字幕小一点[，,]往上移[，,]声音和其他画面不变$/.test(text)){
  const nodes=document.nodes.filter(n=>n.kind==='text'&&['subtitle','caption','body','description','feature'].includes(n.semanticRole));
  insist(nodes.length,'没有可独立调整的字幕对象','CAPTION_TARGET_MISSING');
  return {mode:'local-scoped',operations:nodes.map(n=>({type:'update_text_style',nodeId:n.id,params:{fontSize:Math.max(18,Math.round((n.params?.style?.fontSize||36)*.85)),offsetY:(n.params?.style?.offsetY||0)-40}})),summary:'缩小字幕并上移40像素，声音及其他画面保持。'};
 }
 const detail=/^把细节镜头提前[，,]结尾文字改成[“"]([^”"]+)[”"][，,]其他不动$/.exec(text);
 if(detail){
  const index=document.scenes.findIndex((s,i)=>i>1&&/细节|detail|滴管/.test(s.purpose));
  insist(index>1,'没有明确可提前的细节镜头，请指定镜头编号','DETAIL_TARGET_MISSING');
  const last=document.scenes.at(-1),node=document.nodes.find(n=>n.sceneId===last.id&&n.kind==='text'&&n.semanticRole==='cta');insist(node,'结尾没有独立CTA对象','CTA_TARGET_MISSING');
  const ids=document.scenes.map(s=>s.id),[id]=ids.splice(index,1);ids.splice(1,0,id);
  return {mode:'local-scoped',operations:[{type:'reorder_scenes',sceneIds:ids},{type:'update_text',nodeId:node.id,text:detail[1]}],summary:'细节镜头提前至第二幕，只替换结尾显示文字，声音保留。'};
 }
 return null;
}
