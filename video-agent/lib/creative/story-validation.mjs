import {insist,FPS,MAX_SCENES} from './contracts.mjs';

// Unbuilt scenes remain valid while a neighboring custom scene is compiled.
// These placeholders never become the published production output.
export function nativeScenePlan(scene,source){
  return {...scene,effect:source?'custom-native':scene.media?.length?'media-cut':'title-reveal',effectParamsJson:'{}',customSourceJson:source?JSON.stringify(source):''};
}

export function validateStory(story,brief,resources,{original,index}={}){
  insist(story.scenes.length>0&&story.scenes.length<=MAX_SCENES,'镜头数量超过资源预算','INVALID_SCENES');
  const total=story.scenes.reduce((sum,s)=>sum+Math.round(s.durationSeconds*FPS),0)-(story.transition==='cut'?0:9*(story.scenes.length-1));
  insist(total===Math.round(brief.request.output.durationSeconds*FPS),'镜头时间必须精确匹配需求；重新选择有内容的区间，不能延长停留补齐','INVALID_SCENE_TIME');
  for(const s of story.scenes){insist(s.newInformation.trim()&&story.paragraphs.some(p=>p.id===s.paragraphId),'镜头缺少信息作用或段落','STORY_INFORMATION');insist(s.resourceId==='native-original'||resources.selected.some(r=>r.id===s.resourceId),'镜头使用未选择资源','RESOURCE_UNKNOWN');}
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

export function validateShotRepair(original,repaired,message){
  insist(repaired.media.length===original.media.length&&repaired.text.length===original.text.length,'镜头修复不能改变对象数量','REPLAN_SCOPE');
  for(const [i,before]of original.text.entries()){
    const after=repaired.text[i],protectedText=before.factRefs?.length||['price','cta'].includes(before.role)||message.includes(before.text);
    insist(after.role===before.role&&JSON.stringify(after.factRefs)===JSON.stringify(before.factRefs),'镜头修复不能改变文字角色或事实引用','REPLAN_SCOPE');
    insist(!protectedText||after.text===before.text,'用户原文和事实文字必须保留','REPLAN_SCOPE');
    if(after.text!==before.text)insist(!/[0-9¥￥$%]/.test(after.text),'修正观察说明不能新增参数、数值或价格','REPLAN_SCOPE');
  }
}
