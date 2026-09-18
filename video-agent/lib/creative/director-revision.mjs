const unique=value=>[...new Set(value.filter(Boolean))];

function mentionedSceneIds(document,message){
  const ids=[];
  const chinese={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
  for(const match of String(message||'').matchAll(/第\s*([一二三四五六七八九十\d]+)\s*(?:幕|段|镜头)/g)){
    const index=/^\d+$/.test(match[1])?Number(match[1]):chinese[match[1]];
    if(document.scenes[index-1])ids.push(document.scenes[index-1].id);
  }
  if(/开头|前三秒|前3秒|hook/i.test(message)&&document.scenes[0])ids.push(document.scenes[0].id);
  if(/结尾|片尾|CTA/i.test(message)&&document.scenes.at(-1))ids.push(document.scenes.at(-1).id);
  return ids;
}

export function directorRevisionIntent(document,message,operations=[]){
  const operationScenes=operations.flatMap(op=>[op.sceneId,op.fromSceneId,op.toSceneId,document.nodes.find(n=>n.id===op.nodeId)?.sceneId]);
  const target_shots=unique([...mentionedSceneIds(document,message),...operationScenes]);
  const level=/受众|人群|年轻女性|用户|种草|转化|购买理由|卖点|hook|吸引/i.test(message)?'marketing':/第.+(?:幕|段|镜头)|快一点|慢一点|节奏|商品展示|前三秒|开头|结尾|片尾/i.test(message)?'director':'native_object';
  return {schema_version:1,level,user_request:message,target_shots,target_objects:unique(operations.map(op=>op.nodeId)),operations:operations.map(op=>op.type),preserve:['未命中的镜头','未请求的商品事实','未请求的音轨','历史版本'],created_at:new Date().toISOString()};
}

export function applyDirectorRevisionIntent(before,after,message,operations=[]){
  const intent=directorRevisionIntent(before,message,operations),fps=after.fps||30;
  if(after.directorTimeline?.shots){
    const priorShots=new Map(after.directorTimeline.shots.map(shot=>[shot.id,shot]));
    after.directorTimeline.shots=after.scenes.map(scene=>{
      const shot=priorShots.get(scene.id);
      // New split scenes retain native execution evidence without fabricating a
      // commercial explanation that was never planned for the new shot.
      const current=shot||{id:scene.id,purpose:'局部修改产生的镜头',commercial_purpose:'继承原工程的局部剪辑目的，待导演复核',selling_point_refs:[],camera_motion:'保留原生对象运动',visual_focus:{primary:'原工程主体',secondary:'',protection:'继承原生对象'},caption:{role:'',text:'',timing:''},audio:{role:'',emotion:'',design:'继承原音轨'},hyperframes_intent:['natural-footage'],success_criteria:[],review_required:true};
      current.start_seconds=scene.startFrame/fps;current.duration=scene.durationFrames/fps;
      const media=after.nodes.filter(n=>n.sceneId===scene.id&&['image','video'].includes(n.kind));
      current.source=media.map(node=>{
        const previous=(shot?.source||[]).find(source=>source.asset_id===node.assetId);
        const start=node.params?.sourceStartSeconds??previous?.start_seconds??0;
        return {asset_id:node.assetId,start_seconds:start,end_seconds:node.kind==='video'?start+node.durationFrames/fps*(node.params?.playbackRate??1):start,reason:previous?.reason||'用户局部修改后的实际素材绑定',evidence_refs:previous?.evidence_refs||[],node_id:node.id};
      });
      const texts=after.nodes.filter(n=>n.sceneId===scene.id&&n.kind==='text').map(n=>n.params?.text).filter(Boolean);
      current.caption={...current.caption,text:texts.join('；')};
      const transition=after.transitions.find(t=>t.fromSceneId===scene.id);
      current.transition={...current.transition,type:transition?.effect||transition?.type||'cut'};
      if(intent.target_shots.includes(scene.id))(current.revision_history??=[]).push({request:message,level:intent.level,operations:intent.operations,time:intent.created_at});
      return current;
    });
    intent.timeline_changes=after.directorTimeline.shots.flatMap(shot=>{
      const prior=before.directorTimeline?.shots?.find(s=>s.id===shot.id);
      const fields=['start_seconds','duration','source','caption','transition'].filter(key=>JSON.stringify(prior?.[key])!==JSON.stringify(shot[key]));
      return fields.length?[{shot_id:shot.id,fields}]:[];
    });
    after.directorTimeline.duration=after.durationFrames/fps;
  }
  if(after.marketingPlan&&intent.level==='marketing'){
    (after.marketingPlan.revision_history??=[]).push({request:message,target_shots:intent.target_shots,time:intent.created_at});
  }
  if(after.hyperframesDesignPlan?.shot_bindings)for(const binding of after.hyperframesDesignPlan.shot_bindings)if(intent.target_shots.includes(binding.shot_id))(binding.revision_history??=[]).push({request:message,operations:intent.operations,time:intent.created_at});
  (after.directorRevisionHistory??=[]).push(intent);
  return intent;
}
