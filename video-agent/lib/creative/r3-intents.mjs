import {insist} from './contracts.mjs';
// Closed grammar: compound requests outside these exact scopes go to the model.
export function scopedCommerceEdit(document,message){
 const text=String(message).trim().replace(/[。！!\s]/g,'');
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
