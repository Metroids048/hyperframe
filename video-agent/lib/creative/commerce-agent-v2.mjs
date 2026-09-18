import {insist} from './contracts.mjs';

const str={type:'string'},num={type:'number'},arr=items=>({type:'array',items});
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const evidenceRef=obj({ref:str,reason:str});

export const productBriefSchema=obj({
  schema_version:{type:'integer',enum:[2]},
  product_name:str,
  category:str,
  visual_features:arr(obj({feature:str,evidence_refs:arr(evidenceRef)})),
  selling_points:arr(obj({id:str,text:str,evidence_refs:arr(evidenceRef),confidence:num})),
  target_customer:arr(str),
  usage_scenarios:arr(str),
  brand_style:obj({tone:arr(str),visual_keywords:arr(str),colors:arr(str)}),
  recommended_platform:arr({type:'string',enum:['xiaohongshu','douyin','ecommerce_detail','taobao','jingdong','video_account','general']}),
  forbidden_claims:arr(str),
  unknowns:arr(str),
  fusion_summary:str
});

export const marketingPlanSchema=obj({
  schema_version:{type:'integer',enum:[2]},
  scene_type:{type:'string',enum:['product_launch','product_detail','product_tutorial','product_promotion','product_faq']},
  platform:str,
  audience:arr(str),
  marketing_objective:str,
  hook:obj({message:str,visual_proof:str,first_three_seconds:str,rationale:str}),
  story_structure:arr(obj({id:str,beat:str,purpose:str,selling_point_refs:arr(str),evidence_refs:arr(str)})),
  shot_strategy:arr(str),
  caption_strategy:obj({tone:str,max_chars_per_card:num,rhythm:str,roles:arr(str)}),
  music_style:obj({mood:str,energy_curve:str,beat_strategy:str}),
  transition_style:obj({principle:str,preferred:arr(str),avoid:arr(str)}),
  cta:obj({text:str,placement:str,reason:str}),
  rationale:arr(str)
});

const directorSource=obj({asset_id:str,start_seconds:num,end_seconds:num,reason:str,evidence_refs:arr(str)});
const directorShot=obj({
  id:str,
  start_seconds:num,
  duration:num,
  purpose:str,
  commercial_purpose:str,
  selling_point_refs:arr(str),
  source:arr(directorSource),
  camera_motion:str,
  visual_focus:obj({primary:str,secondary:str,protection:str}),
  transition:obj({type:str,purpose:str}),
  caption:obj({role:str,text:str,timing:str}),
  audio:obj({role:str,emotion:str,design:str}),
  hyperframes_intent:arr({type:'string',enum:['dynamic-typography','product-reveal','detail-emphasis','guided-callout','spatial-layout','brand-system','rhythmic-transition','natural-footage']}),
  success_criteria:arr(str)
});

export const directorTimelineSchema=obj({
  schema_version:{type:'integer',enum:[2]},
  duration:num,
  aspect_ratio:str,
  director_statement:str,
  shots:arr(directorShot)
});

const clean=value=>String(value??'').trim();
const knownEvidencePrefixes=['request.','material.','observation.','asset:','source:','fact-','selling-point-'];

export function validateProductBrief(value,assets=[]){
  insist(value?.schema_version===2,'ProductBrief schema 版本无效','PRODUCT_BRIEF');
  insist(clean(value.product_name)&&clean(value.category)&&clean(value.fusion_summary),'ProductBrief 缺少商品名称、类别或融合结论','PRODUCT_BRIEF');
  insist(Array.isArray(value.visual_features)&&Array.isArray(value.selling_points)&&Array.isArray(value.target_customer)&&Array.isArray(value.usage_scenarios),'ProductBrief 核心字段不完整','PRODUCT_BRIEF');
  const assetIds=new Set(assets.map(a=>a.id));
  const refs=[...value.visual_features.flatMap(x=>x.evidence_refs||[]),...value.selling_points.flatMap(x=>x.evidence_refs||[])];
  for(const item of refs){
    insist(clean(item.ref)&&clean(item.reason),'ProductBrief 证据引用不完整','PRODUCT_BRIEF_EVIDENCE');
    const assetId=item.ref.startsWith('asset:')?item.ref.slice(6).split('@')[0]:null;
    insist(!assetId||assetIds.has(assetId),'ProductBrief 引用了不存在的素材：'+assetId,'PRODUCT_BRIEF_EVIDENCE');
    insist(assetId||knownEvidencePrefixes.some(prefix=>item.ref.startsWith(prefix)),'ProductBrief 证据引用格式无效：'+item.ref,'PRODUCT_BRIEF_EVIDENCE');
  }
  for(const point of value.selling_points){
    insist(clean(point.id)&&clean(point.text)&&point.confidence>=0&&point.confidence<=1,'ProductBrief 卖点无效','PRODUCT_BRIEF');
    insist(point.evidence_refs.length,'商品卖点缺少用户事实或素材证据：'+point.id,'PRODUCT_BRIEF_EVIDENCE');
  }
  insist(new Set(value.selling_points.map(x=>x.id)).size===value.selling_points.length,'ProductBrief 卖点 ID 重复','PRODUCT_BRIEF');
  return value;
}

export function validateMarketingPlan(value,productBrief,scenarioId){
  insist(value?.schema_version===2,'MarketingPlan schema 版本无效','MARKETING_PLAN');
  const expected={product_launch:'product_launch',product_detail:'product_detail',product_demo:'product_tutorial',product_howto:'product_tutorial',product_promotion:'product_promotion',product_faq:'product_faq'}[scenarioId];
  if(expected)insist(value.scene_type===expected,'营销场景与制作合同不一致','MARKETING_SCENE');
  insist(value.audience.length&&clean(value.marketing_objective)&&clean(value.hook?.first_three_seconds),'MarketingPlan 缺少受众、目标或前三秒策略','MARKETING_PLAN');
  insist(value.story_structure.length>=3,'MarketingPlan 故事结构不足','MARKETING_PLAN');
  const ids=new Set(productBrief.selling_points.map(x=>x.id));
  for(const beat of value.story_structure)for(const id of beat.selling_point_refs)insist(ids.has(id),'MarketingPlan 引用了未知卖点：'+id,'MARKETING_PLAN');
  insist(value.rationale.length,'MarketingPlan 必须说明设计原因','MARKETING_PLAN');
  return value;
}

function storyShotStartSeconds(story,index){
  let start=0;
  for(let i=0;i<index;i++)start+=story.scenes[i].durationSeconds-(story.transition==='cut'?0:.3);
  return start;
}

export function validateDirectorTimeline(value,story,assets=[]){
  insist(value?.schema_version===2&&value.shots?.length===story.scenes.length,'DirectorTimeline 镜头数量或版本无效','DIRECTOR_TIMELINE');
  const byId=new Map(assets.map(a=>[a.id,a]));
  const expectedDuration=story.scenes.reduce((n,s)=>n+s.durationSeconds,0)-Math.max(0,story.scenes.length-1)*(story.transition==='cut'?0:.3);
  insist(Math.abs(value.duration-expectedDuration)<1/30+.001,'DirectorTimeline 总时长与执行分镜不一致','DIRECTOR_TIMELINE');
  for(const [index,shot] of value.shots.entries()){
    const source=story.scenes[index];
    insist(shot.id===source.id,'DirectorTimeline 改变了镜头 ID','DIRECTOR_TIMELINE');
    insist(Math.abs(shot.start_seconds-storyShotStartSeconds(story,index))<1/30+.001&&Math.abs(shot.duration-source.durationSeconds)<1/30+.001,'DirectorTimeline 改变了已验证时间','DIRECTOR_TIMELINE');
    insist(shot.source.length===source.media.length,'DirectorTimeline 改变了素材绑定数量','DIRECTOR_SOURCE');
    for(const [mediaIndex,record] of shot.source.entries()){
      const media=source.media[mediaIndex],asset=byId.get(media.assetId);
      const expectedEnd=asset?.kind==='video'?(media.sourceStartSeconds||0)+source.durationSeconds*(media.playbackRate||1):(media.sourceStartSeconds||0);
      insist(record.asset_id===media.assetId&&Math.abs(record.start_seconds-(media.sourceStartSeconds||0))<1/30+.001,'DirectorTimeline 改变了素材或源入点','DIRECTOR_SOURCE');
      if(asset?.kind==='video')insist(Math.abs(record.end_seconds-expectedEnd)<1/30+.001,'DirectorTimeline 改变了源出点','DIRECTOR_SOURCE');
    }
    insist(clean(shot.purpose)&&clean(shot.commercial_purpose)&&shot.success_criteria.length,'每个导演镜头必须有商业目的和验收标准','DIRECTOR_PURPOSE');
  }
  return value;
}

function aspectRatio(output){
  if(output.height>output.width)return '9:16';
  if(output.width>output.height)return '16:9';
  return '1:1';
}

export function directorTimelineSeed(story,assets,marketingPlan,output){
  const byId=new Map(assets.map(a=>[a.id,a]));
  return {
    duration:story.scenes.reduce((n,s)=>n+s.durationSeconds,0)-Math.max(0,story.scenes.length-1)*(story.transition==='cut'?0:.3),
    aspect_ratio:aspectRatio(output),
    marketing_plan:marketingPlan,
    shots:story.scenes.map((shot,index)=>({
      id:shot.id,
      start_seconds:storyShotStartSeconds(story,index),
      duration:shot.durationSeconds,
      purpose:shot.purpose,
      new_information:shot.newInformation,
      visual_direction:shot.visualDirection,
      resource_id:shot.resourceId,
      production_method:shot.productionMethod,
      layout_variant:shot.layoutVariant,
      text:shot.text,
      audio_relationship:shot.editorialDecision?.audioRelationship||'',
      transition_purpose:shot.editorialDecision?.transitionPurpose||'',
      source:shot.media.map(media=>({asset_id:media.assetId,start_seconds:media.sourceStartSeconds||0,end_seconds:byId.get(media.assetId)?.kind==='video'?(media.sourceStartSeconds||0)+shot.durationSeconds*(media.playbackRate||1):(media.sourceStartSeconds||0),kind:byId.get(media.assetId)?.kind||'unknown'}))
    }))
  };
}

export function buildHyperFramesDesignPlan({directorTimeline,story,creativeDirection,resourcePlan,output,scenarioId}){
  const candidateIds=new Set((resourcePlan?.candidates||[]).filter(x=>x.eligible&&x.compatible).map(x=>x.id));
  const bindings=directorTimeline.shots.map((shot,index)=>{
    const source=story.scenes[index];
    const resourceId=candidateIds.has(source.resourceId)?source.resourceId:'native-original';
    const enhanced=source.productionMethod!=='footage-cut'||shot.hyperframes_intent.some(x=>x!=='natural-footage');
    return {
      shot_id:shot.id,
      commercial_purpose:shot.commercial_purpose,
      production_method:source.productionMethod,
      component:resourceId,
      layout:source.layoutVariant||'auto',
      typography:{font_family:story.design.fontFamily,title_px:story.design.typeScale?.title,body_px:story.design.typeScale?.body,label_px:story.design.typeScale?.label,label_style:story.design.labelStyle},
      animation:{camera_motion:shot.camera_motion,intents:shot.hyperframes_intent,entrance_required:true,seek_safe:true},
      transition:shot.transition,
      product_emphasis:{focus:shot.visual_focus.primary,protection:shot.visual_focus.protection,success_criteria:shot.success_criteria},
      enhanced,
      resource_receipt_ref:resourceId==='native-original'?null:'resource-plan.json#'+resourceId
    };
  });
  const enhanced=bindings.filter(x=>x.enhanced).length,dynamic=bindings.filter(x=>x.animation.intents.includes('dynamic-typography')).length,emphasis=bindings.filter(x=>x.animation.intents.some(i=>['product-reveal','detail-emphasis','guided-callout'].includes(i))).length;
  const plan={schema_version:2,runtime:'0.8.33',scenario_id:scenarioId,output,design_system:{background:story.design.background,foreground:story.design.foreground,panel:story.design.panel,accent:story.design.accent,font_family:story.design.fontFamily,motion_direction:creativeDirection.motionDirection,type_direction:creativeDirection.typeDirection},shot_bindings:bindings,differentiation_budget:{total_shots:bindings.length,enhanced_shots:enhanced,dynamic_typography_shots:dynamic,product_emphasis_shots:emphasis,advanced_ratio:bindings.length?enhanced/bindings.length:0},rules:['镜头目的先于组件选择','静态 hero frame 先于动画','商品主体与动作保护优先','只使用可执行且有回执的资源','动效必须可 seek 且有限']};
  if(['product_launch','product_detail'].includes(scenarioId)&&bindings.some((_,i)=>story.scenes[i].text?.length))insist(enhanced>0&&emphasis>0,'核心商业场景没有兑现 HyperFrames 产品强调能力','HF_DIFFERENTIATION');
  return plan;
}

export function directorBinding(plan,shotId){
  const binding=plan?.shot_bindings?.find(x=>x.shot_id===shotId);
  insist(binding,'导演镜头缺少 HyperFrames 执行绑定：'+shotId,'HF_DESIGN_BINDING');
  return binding;
}
