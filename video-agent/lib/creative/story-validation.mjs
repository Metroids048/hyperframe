import {insist,FPS,MAX_SCENES} from './contracts.mjs';
import {resourceCompatibility} from './resource-catalog.mjs';

// Unbuilt scenes remain valid while a neighboring custom scene is compiled.
// These placeholders never become the published production output.
export function nativeScenePlan(scene,source){
  return {...scene,effect:source?'custom-native':scene.media?.length?'media-cut':'title-reveal',effectParamsJson:'{}',customSourceJson:source?JSON.stringify(source):''};
}

export function validateStory(story,brief,resources,{original,index}={}){
  insist(story.scenes.length>0,'尚未形成有效分镜，请检查素材证据是否已送达','INVALID_SCENES');
  insist(story.scenes.length<=MAX_SCENES,'镜头数量超过资源预算','INVALID_SCENES');
  const total=story.scenes.reduce((sum,s)=>sum+Math.round(s.durationSeconds*FPS),0)-(story.transition==='cut'?0:9*(story.scenes.length-1));
  insist(total===Math.round(brief.request.output.durationSeconds*FPS),'镜头时间必须精确匹配需求；重新选择有内容的区间，不能延长停留补齐','INVALID_SCENE_TIME');
  for(const s of story.scenes){insist(s.newInformation.trim()&&story.paragraphs.some(p=>p.id===s.paragraphId),'镜头缺少信息作用或段落','STORY_INFORMATION');insist(s.resourceId==='native-original'||resources.selected.some(r=>r.id===s.resourceId)||(resources.candidates||[]).some(r=>r.id===s.resourceId&&r.eligible&&r.compatible),'镜头使用未选择资源','RESOURCE_UNKNOWN');}
  for(const s of story.scenes){
    const adapter=resources.candidates?.find(r=>r.id===s.resourceId);
    if(adapter?.requirements){
      const check=resourceCompatibility(adapter,{message:resources.originalRequest||'',output:brief.request.output,mediaCount:s.media.length,mediaKinds:s.media.map(m=>resources.assetKinds?.[m.assetId]).filter(Boolean),texts:s.text.map(t=>t.text)});
      insist(check.eligible,'镜头资源输入不满足：'+s.resourceId+' / '+check.reasons.join(',')+'；请选可行资源，不增加虚假素材或隐藏超长文字','RESOURCE_INPUT');
    }
  }
  if(original){
    insist(story.scenes.length===original.scenes.length&&story.transition===original.transition,'局部重规划不能改变镜头数量或转场','REPLAN_SCOPE');
    for(const [i,s] of story.scenes.entries())insist(i===index?Math.round(s.durationSeconds*FPS)===Math.round(original.scenes[i].durationSeconds*FPS):JSON.stringify(s)===JSON.stringify(original.scenes[i]),'局部重规划改变了范围外内容或本镜头时长','REPLAN_SCOPE');
    for(const key of Object.keys(original).filter(k=>k!=='scenes'))insist(JSON.stringify(story[key])===JSON.stringify(original[key]),'局部重规划改变了整片设计或声音','REPLAN_SCOPE');
  }
  return story;
}

export function replaceStoryShot(story,index,shot,brief,resources){
  const changed=structuredClone(story);changed.scenes[index]=shot;
  return validateStory(changed,brief,resources,{original:story,index});
}

export function validateShotRepair(original,repaired,message,{removeRedundantText=false,allowDuplicateMedia=false,allowRequiredText=false}={}){
  if(allowDuplicateMedia){
    insist(repaired.media.length>=original.media.length&&repaired.media.length<=4,'同源窗口修复只能追加有限媒体绑定','REPLAN_SCOPE');
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    insist(original.media.every((m,i)=>same(m,repaired.media[i]))&&repaired.media.slice(original.media.length).every(m=>original.media.some(o=>same(o,m))),'同源窗口必须保持既有素材、源时间、播放率和顺序','REPLAN_SCOPE');
  }else insist(repaired.media.length===original.media.length,'镜头修复不能改变媒体数量','REPLAN_SCOPE');
  if(allowRequiredText&&repaired.text.length>original.text.length){
    insist(repaired.text.length<=32&&original.text.every((t,i)=>JSON.stringify(t)===JSON.stringify(repaired.text[i])),'补齐必需文字必须保留已有对象及顺序','REPLAN_SCOPE');
    insist(repaired.text.slice(original.text.length).every(t=>typeof t.text==='string'&&t.text.trim()&&message.includes(t.text)&&!t.factRefs?.length&&!['price','cta'].includes(t.role)),'新增文字必须逐字来自用户要求，不得增加事实或价格','REPLAN_SCOPE');
    return;
  }
  if(removeRedundantText&&repaired.text.length<original.text.length){
    // Only the story owner may remove model-authored redundant overlays.
    // Explicit copy, facts, prices and CTA remain immutable, as does the
    // order/content of every retained object. No hidden layout deletion.
    let at=0;
    for(const before of original.text){
      if(JSON.stringify(before)===JSON.stringify(repaired.text[at])){at++;continue;}
      insist(!before.factRefs?.length&&!['price','cta'].includes(before.role)&&!message.includes(before.text),'用户原文和事实文字必须保留','REPLAN_SCOPE');
    }
    insist(at===repaired.text.length,'删除重复文字时不能改写或增加其他文字','REPLAN_SCOPE');
    return;
  }
  insist(repaired.text.length===original.text.length,'镜头修复不能改变文字数量','REPLAN_SCOPE');
  for(const [i,before]of original.text.entries()){
    const after=repaired.text[i],protectedText=before.factRefs?.length||['price','cta'].includes(before.role)||message.includes(before.text);
    insist(after.role===before.role&&JSON.stringify(after.factRefs)===JSON.stringify(before.factRefs),'镜头修复不能改变文字角色或事实引用','REPLAN_SCOPE');
    insist(!protectedText||after.text===before.text,'用户原文和事实文字必须保留','REPLAN_SCOPE');
    if(after.text!==before.text)insist(!/[0-9¥￥$%]/.test(after.text),'修正观察说明不能新增参数、数值或价格','REPLAN_SCOPE');
  }
}

export function requireSourceChange(original,repaired,feedback){
 if(!feedback?.some(i=>i.repairKind==='source-selection'))return;
 const changed=repaired.media.some((m,i)=>m.assetId!==original.media[i]?.assetId||m.sourceStartSeconds!==original.media[i]?.sourceStartSeconds||m.sourceEndSeconds!==original.media[i]?.sourceEndSeconds);
 insist(changed,'源选段修复没有改变实际源区间；请重新选择已观察且能满足画面问题的连续区间','REPLAN_NO_PROGRESS');
}

// Bind factual references to this request before asking the model. Visual
// descriptions may use [], but cannot invent fact IDs when no facts exist.
export function withKnownFacts(schema,facts=[]){
  const bound=structuredClone(schema),ids=facts.map((_,i)=>'fact-'+(i+1));
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(node.properties?.factRefs){
      node.properties.factRefs=ids.length?{type:'array',items:{type:'string',enum:ids}}:{type:'array',items:{type:'string'},maxItems:0};
    }
    for(const value of Object.values(node))if(value&&typeof value==='object')visit(value);
  }
  visit(bound);return bound;
}
