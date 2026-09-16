import {insist} from './contracts.mjs';
export function selectiveEffectRestore(current,before,after,{sceneIds}={}){
  const operations=[];
  for(const s of after.scenes){
    if(sceneIds&&!sceneIds.includes(s.id))continue;
    const old=before.scenes.find(x=>x.id===s.id),live=current.scenes.find(x=>x.id===s.id);if(!old||!live)continue;
    if(old.effect==='custom-native'&&s.effect==='custom-native'){
      const priorSource=before.sourceBundles.find(b=>b.sceneId===s.id),afterSource=after.sourceBundles.find(b=>b.sceneId===s.id),liveSource=current.sourceBundles.find(b=>b.sceneId===s.id);
      if(JSON.stringify(priorSource)!==JSON.stringify(afterSource)){
        insist(JSON.stringify(liveSource)===JSON.stringify(afterSource)&&JSON.stringify(live.effectParams)===JSON.stringify(s.effectParams),'这个原创动效后来又修改过，请选择具体历史版本','RESTORE_CONFLICT');
        const source=Object.fromEntries(['html','css','timeline','parameters','objects','motionTargets'].map(key=>[key,priorSource[key]]));operations.push({type:'update_custom_source',sceneId:s.id,params:{...source,textStyles:priorSource.textStyles??[],values:old.effectParams}});continue;
      }
    }
    if(old.effect!==s.effect){
      insist(live.effect===s.effect&&JSON.stringify(live.effectParams)===JSON.stringify(s.effectParams),'这个动效后来又修改过，请选择具体历史版本','RESTORE_CONFLICT');
      operations.push({type:'set_scene_effect',sceneId:s.id,effect:old.effect,params:old.effectParams});
    }else{
      const params={};for(const key of new Set([...Object.keys(old.effectParams),...Object.keys(s.effectParams)]))if(JSON.stringify(old.effectParams[key])!==JSON.stringify(s.effectParams[key])){insist(JSON.stringify(live.effectParams[key])===JSON.stringify(s.effectParams[key]),'这个动效属性后来又修改过，不能自动覆盖','RESTORE_CONFLICT');params[key]=old.effectParams[key];}
      if(Object.keys(params).length)operations.push({type:'update_effect_params',sceneId:s.id,params});
    }
  }
  insist(operations.length,'没有可恢复的动效修改','RESTORE_NOT_FOUND');return operations;
}
