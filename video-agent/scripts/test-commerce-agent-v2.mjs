import assert from 'node:assert/strict';
import {validateProductBrief,validateMarketingPlan,validateDirectorTimeline,buildHyperFramesDesignPlan,evaluateHyperFramesPolicy} from '../lib/creative/commerce-agent-v2.mjs';

const assets=[{id:'coffee-video',kind:'video',mediaMetadata:{duration:20}},{id:'coffee-image',kind:'image',mediaMetadata:{}}];
const product={schema_version:2,product_name:'咖啡机',category:'家用咖啡机',visual_features:[{feature:'紧凑机身',evidence_refs:[{ref:'asset:coffee-image@0-0',reason:'商品整体图可见'}]}],selling_points:[{id:'selling-point-1',text:'一键制作咖啡',evidence_refs:[{ref:'asset:coffee-video@1-4',reason:'真实操作和出杯画面'}],confidence:.9}],target_customer:['希望快速制作咖啡的都市用户'],usage_scenarios:['早晨居家咖啡'],brand_style:{tone:['温暖','精致'],visual_keywords:['晨光','咖啡棕'],colors:['#3B2418']},recommended_platform:['xiaohongshu'],forbidden_claims:['未提供时不得宣称具体萃取压力'],unknowns:['型号'],fusion_summary:'图片确认外观，视频确认操作和出杯。'};
validateProductBrief(product,assets);

const marketing={schema_version:2,scene_type:'product_launch',platform:'xiaohongshu',audience:['都市咖啡爱好者'],marketing_objective:'建立新品认知并激发进一步了解',hook:{message:'早晨也能从容喝咖啡',visual_proof:'真实出杯近景',first_three_seconds:'先给结果，再露出机器',rationale:'结果比参数更快建立兴趣'},story_structure:[{id:'beat-1',beat:'hook',purpose:'建立欲望',selling_point_refs:['selling-point-1'],evidence_refs:['asset:coffee-video@1-4']},{id:'beat-2',beat:'use',purpose:'证明操作',selling_point_refs:['selling-point-1'],evidence_refs:['asset:coffee-video@1-4']},{id:'beat-3',beat:'cta',purpose:'推动了解',selling_point_refs:[],evidence_refs:[]}],shot_strategy:['结果先行','整体和细节交替'],caption_strategy:{tone:'生活化',max_chars_per_card:12,rhythm:'短句随镜头',roles:['hook','benefit','cta']},music_style:{mood:'温暖轻快',energy_curve:'开场明确，中段稳定，结尾抬升',beat_strategy:'切点跟随动作'},transition_style:{principle:'信息关系优先',preferred:['match-cut'],avoid:['无意义闪白']},cta:{text:'查看详情',placement:'片尾',reason:'未提供促销信息'},rationale:['真实出杯是最强证据']};
validateMarketingPlan(marketing,product,'product_launch');

const story={transition:'cut',design:{background:'#1B1210',foreground:'#FFF7ED',panel:'#2B1D18',accent:'#D38B5D',fontFamily:'Arial',typeScale:{title:72,body:42,label:28},labelStyle:'rounded'},scenes:[{id:'scene-01',purpose:'hook',newInformation:'先看出杯结果',durationSeconds:3,resourceId:'video-text-pivot',productionMethod:'composition-adapt',layoutVariant:'auto',media:[{assetId:'coffee-video',sourceStartSeconds:1,playbackRate:1}],text:[{role:'title',text:'早晨，也能从容',factRefs:[]}]}]};
const director={schema_version:2,duration:3,aspect_ratio:'9:16',director_statement:'用结果建立兴趣',shots:[{id:'scene-01',start_seconds:0,duration:3,purpose:'前三秒建立兴趣',commercial_purpose:'用真实出杯证明便利体验',selling_point_refs:['selling-point-1'],source:[{asset_id:'coffee-video',start_seconds:1,end_seconds:4,reason:'出杯动作清楚',evidence_refs:['asset:coffee-video@1-4']}],camera_motion:'保持实拍运动，叠加轻微视觉聚焦',visual_focus:{primary:'咖啡流和杯子',secondary:'机器轮廓',protection:'不遮挡出杯区域'},transition:{type:'cut',purpose:'直接进入操作'},caption:{role:'hook',text:'早晨，也能从容',timing:'0.3秒进入'},audio:{role:'original',emotion:'温暖',design:'保留出杯原声'},hyperframes_intent:['dynamic-typography','product-reveal'],success_criteria:['1秒内看到咖啡结果','3秒内识别商品类别']}]};
validateDirectorTimeline(director,story,assets);
const plan=buildHyperFramesDesignPlan({directorTimeline:director,story,creativeDirection:{motionDirection:'克制推进',typeDirection:'短句强调'},resourcePlan:{candidates:[{id:'video-text-pivot',eligible:true,compatible:true}]},output:{width:1080,height:1920},scenarioId:'product_launch'});
assert.equal(plan.shot_bindings[0].component,'video-text-pivot');
assert.equal(plan.differentiation_budget.enhanced_shots,1);
assert.equal(plan.differentiation_budget.product_emphasis_shots,1);
assert.equal(plan.differentiation_budget.policy_passed,true);
const scenarioIntents={
  product_launch:['product-reveal','dynamic-typography'],
  product_detail:['guided-callout','spatial-layout'],
  product_demo:['natural-footage','guided-callout'],
  product_collection:['spatial-layout','brand-system'],
  product_promotion:['dynamic-typography','rhythmic-transition'],
  product_faq:['guided-callout','dynamic-typography']
};
for(const [scenarioId,intents] of Object.entries(scenarioIntents))assert.equal(evaluateHyperFramesPolicy(scenarioId,{intents,shotCount:4,enhancedShots:3}).passed,true,scenarioId);
assert.equal(evaluateHyperFramesPolicy('product_promotion',{intents:['natural-footage'],shotCount:4,enhancedShots:0}).passed,false);
assert.throws(()=>validateMarketingPlan({...marketing,scene_type:'product_detail'},product,'product_launch'),error=>error.code==='MARKETING_SCENE');
console.log('PASS ProductBrief → MarketingPlan → DirectorTimeline → HyperFramesDesignPlan');
