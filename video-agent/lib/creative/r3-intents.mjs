import {insist} from './contracts.mjs';
import {projectNativeCaptions} from './captions.mjs';
// Closed grammar: compound requests outside these exact scopes go to the model.
export function scopedCommerceEdit(document,message){
 const text=String(message).trim().replace(/[。！!\s]/g,'');
 const propertyPlan=exactPropertyEdit(document,text);if(propertyPlan)return propertyPlan;
 const firstBoundary=/^(?:把)?(?:第(?:一|1)个转场|第(?:一|1)幕(?:到|切)第(?:二|2)幕)(?:改成|换成|用|使用)(色散|chromatic-split|淡化|dissolve-transition|directional|directional-transition|闪白|flash-transition)(?:[，,](?:其他|其余)不动)?$/i.exec(text);
 if(firstBoundary){
  insist(document.scenes.length>1,'当前工程没有两个相邻场景','TRANSITION_MISSING');
  const t=text.includes('幕')?document.transitions.find(t=>t.fromSceneId===document.scenes[0].id&&t.toSceneId===document.scenes[1].id):[...document.transitions].sort((a,b)=>document.scenes.findIndex(s=>s.id===a.fromSceneId)-document.scenes.findIndex(s=>s.id===b.fromSceneId))[0],from=t?document.scenes.find(s=>s.id===t.fromSceneId):document.scenes[0],to=t?document.scenes.find(s=>s.id===t.toSceneId):document.scenes[1];
  const effect=({'色散':'chromatic-split','淡化':'dissolve-transition',directional:'directional-transition','闪白':'flash-transition'}[firstBoundary[1]]||firstBoundary[1]),durationFrames=t?.durationFrames||9;
  return {mode:'local-scoped',operations:[...(!t?[{type:'set_scene_duration',sceneId:from.id,durationFrames:from.durationFrames+durationFrames}]:[]),{type:'set_transition',fromSceneId:from.id,toSceneId:to.id,effect,durationFrames,params:{}}],summary:'只调整第一个切点；新增转场时补足重叠，保持后续场景入点、总时长与声音。'};
 }
 if(/^(?:给讲话|给视频|给这段讲话)?(?:加|添加)(?:中文|英文)?字幕$/.test(text))return {mode:'local-scoped',operations:[{type:'generate_captions',params:{language:text.includes('中文')?'zh':text.includes('英文')?'en':'source'}}],summary:'从真实人声音轨生成字幕，声音保持。'};
 const lastCaption=/^(?:再把|把)?最后一条字幕(?:改成|改为)[“"]([^”"]+)[”"][。！!\s]*$/.exec(String(message).trim());
 if(lastCaption){
  const projected=projectNativeCaptions(document),last=projected.at(-1),cue=document.captions?.find(c=>c.id===last?.id);insist(cue,'当前没有可修改的独立字幕','CAPTION_TARGET_MISSING');
  insist(projected.filter(c=>c.startFrame===last.startFrame).length===1,'结尾有同时显示的字幕，请指定要改的文字','AMBIGUOUS_TARGET');
  return {mode:'local-scoped',operations:[{type:'update_caption',nodeId:cue.id,text:lastCaption[1]}],summary:'只修改最后一条字幕文字，配音及其他内容保持。'};
 }
 if(/^(?:不要|去掉)配音[，,](?:只留|保留)字幕$/.test(text)){
  const tracks=(document.audioGraph||[]).filter(t=>['narration','voiceover'].includes(t.role));
  insist(tracks.length,'当前没有可关闭的配音音轨','PATCH_TARGET_MISSING');
  return {mode:'local-scoped',operations:tracks.map(t=>({type:'update_audio',nodeId:t.id,params:{volume:0}})),summary:'关闭配音，保留字幕文字、样式和时间，以及其他音轨。'};
 }
 if(/^字幕(?:再)?小一点(?:[，,](?:再)?往上(?:挪|移)(?:一点)?)?$/.test(text)&&document.captions?.length)return {mode:'local-scoped',operations:document.captions.map(c=>({type:'update_caption_style',nodeId:c.id,params:{fontSize:Math.max(12,Math.round((c.style?.fontSize??46)*.85)),...(text.includes('往上')?{offsetYDelta:-40}:{})}})),summary:'只缩小字幕'+(text.includes('往上')?'并上移':'')+'，内容和声音保持。'};
 const captionMove=/^字幕(?:再)?(?:往)?(上|下)移(?:一点)?$/.exec(text);
 if(captionMove){
  const delta=captionMove[1]==='上'?-40:40;
  if(document.captions?.length)return {mode:'local-scoped',operations:[{type:'update_caption_style',params:{offsetYDelta:delta}}],summary:'基于当前字幕位置'+(delta<0?'上':'下')+'移40像素，保留文案、字幕时间和声音。'};
  const nodes=document.nodes.filter(n=>n.kind==='text'&&['subtitle','caption'].includes(n.semanticRole));
  insist(nodes.length,'工程没有独立字幕；画面中的烧录字幕不能直接移动','CAPTION_TARGET_MISSING');
  return {mode:'local-scoped',operations:nodes.map(n=>({type:'update_text_style',nodeId:n.id,params:{offsetY:(n.params?.style?.offsetY||0)+delta}})),summary:'基于当前独立字幕位置移动，其他文字和声音保持。'};
 }
 const musicLower=/^(?:音乐|背景音乐)(?:音量)?(?:再)?(?:轻一点|小一点)(?:[，,](?:片尾|结尾)(?:自然)?淡出)?$/.test(text);
 if(musicLower){
  const tracks=(document.audioGraph||[]).filter(a=>a.role==='music');
  insist(tracks.length,'工程没有独立音乐轨；不能把旁白或混合原声当音乐调小','AUDIO_TARGET_MISSING');
  const lastEnd=Math.max(...tracks.map(t=>t.startFrame+t.durationFrames));
  return {mode:'local-scoped',operations:tracks.map(t=>({type:'update_audio',nodeId:t.id,params:{volume:Math.round((t.volume??1)*.8*1000)/1000,...(/淡出/.test(text)&&t.startFrame+t.durationFrames===lastEnd?{fadeOutFrames:Math.min(30,t.durationFrames)}:{})}})),summary:'仅降低独立音乐轨音量'+(/淡出/.test(text)?'并设置结尾音乐淡出':'')+'，旁白和画面保持。'};
 }
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
  if(document.captions?.length)return {mode:'local-scoped',operations:document.captions.map(c=>({type:'update_caption_style',nodeId:c.id,params:{fontSize:Math.max(12,Math.round((c.style?.fontSize??46)*.85)),offsetYDelta:-40}})),summary:'按当前独立字幕字号缩小并上移，声音及其他画面保持。'};
  const nodes=document.nodes.filter(n=>n.kind==='text'&&['subtitle','caption'].includes(n.semanticRole));
  insist(nodes.length,'没有可独立调整的字幕对象','CAPTION_TARGET_MISSING');
  const sizes=nodes.map(n=>{
   if(Number.isFinite(n.params?.style?.fontSize))return n.params.style.fontSize;
   const bundle=document.sourceBundles?.find(b=>b.sceneId===n.sceneId),elementId=bundle?.objects.find(o=>o.nodeId===n.id)?.elementId;
   const styles=bundle?.textStyles?.filter(s=>s.elementId===elementId)||[];
   // Only a complete, unambiguous authored text style is a reliable baseline.
   // Unknown/CSS-responsive sizes go through the normal planner, not a guessed 36px.
   return styles.length===1&&styles[0].match===n.params.text?styles[0].fontSize:null;
  });
  if(sizes.some(size=>!Number.isFinite(size)))return null;
  return {mode:'local-scoped',operations:nodes.map((n,i)=>({type:'update_text_style',nodeId:n.id,params:{fontSize:Math.max(12,Math.round(sizes[i]*.85)),offsetY:Math.max(-400,(n.params?.style?.offsetY||0)-40)}})),summary:'按当前实际字号缩小字幕并上移，声音及其他画面保持；需复核安全区。'};
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

// Deterministic numeric properties with a closed preservation suffix. Anything
// with additional actions, negation, ambiguity or unsupported units stays semantic.
export function exactPropertyEdit(document,text){
 const parts=text.split(/[，,；;]/),command=parts.shift();
 if(parts.length&&!parts.every(p=>/^(?:(?:位置|文字|时间|字号|颜色|其他字幕|其余字幕|全部声音画面|声音|画面|旁白|配音|音乐|其他内容|其余内容)[、和与及]?)+(?:都)?(?:保持不变|保持|不动|不变)$/.test(p)))return null;
 const match=/^(?:请)?(?:只)?(?:把|将)?(全部字幕|所有字幕|字幕|最后一[句条]字幕|第[一二三四五六七八九十0-9]+[句条]字幕)的?(字号|字体大小|垂直偏移)(?:设为|设置为|调到|改为)(-?\d+(?:\.\d+)?)(?:像素|px)?$/.exec(command);
 if(match){
  const [,target,property,raw]=match,value=Number(raw),key=property==='垂直偏移'?'offsetY':'fontSize';
  // Preservation clauses cannot contradict the property being changed.
  if(parts.some(p=>p.includes(key==='fontSize'?'字号':'位置')))return null;
  insist(key==='fontSize'?value>=12&&value<=200:value>=-400&&value<=400,'指定字幕属性超出可用范围','PATCH_VALUE');
  const projected=projectNativeCaptions(document),ordered=[...new Map(projected.map(c=>[c.id,c])).values()];
  let cues=document.captions||[];
  if(target.startsWith('最后'))cues=ordered.slice(-1);
  else if(target.startsWith('第')){const index=target.match(/第(.+)[句条]/)[1],number=Number(index)||'一二三四五六七八九十'.indexOf(index)+1;cues=ordered.slice(number-1,number);}
  insist(cues.length,'当前没有对应的独立字幕；烧录文字不能作为原生字幕修改','CAPTION_TARGET_MISSING');
  if(cues.length===1)insist(projected.filter(c=>c.startFrame===cues[0].startFrame).length===1,'同一时间有多条字幕，请指定具体文字','AMBIGUOUS_TARGET');
  return {mode:'local-scoped',operations:cues.map(c=>({type:'update_caption_style',nodeId:c.id,params:{[key]:value}})),summary:'仅调整已确定字幕的'+property+'，其他内容保持。'};
 }
 const volume=/^(?:请)?(?:只)?(?:把|将)?(?:背景音乐|音乐)(?:的)?音量(?:设为|设置为|调到|改为)(0(?:\.\d+)?|1(?:\.0+)?|\d{1,3}%)$/.exec(command);
 if(volume){
  if(parts.some(p=>p.includes('音乐')))return null;
  const value=volume[1].endsWith('%')?Number(volume[1].slice(0,-1))/100:Number(volume[1]);if(value>1)return null;
  const tracks=(document.audioGraph||[]).filter(t=>t.role==='music');insist(tracks.length,'工程没有独立音乐轨','AUDIO_TARGET_MISSING');
  return {mode:'local-scoped',operations:tracks.map(t=>({type:'update_audio',nodeId:t.id,params:{volume:value}})),summary:'仅调整独立音乐轨音量，旁白保持。'};
 }
 return null;
}
