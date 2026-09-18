import assert from 'node:assert/strict';
import {buildVoiceProfiles,audioRequirement,voiceCandidates} from '../lib/creative/voice-matching.mjs';
import {scoreCommerceVideo} from '../lib/creative/quality-scoring.mjs';

const catalog={engine:'fixture',voices:[
  {id:'ad-young',name:'年轻女声',description:'年轻 活泼 元气 适合广告促销'},
  {id:'tutorial-man',name:'专业男声',description:'男声 沉稳 专业 教程'},
  {id:'brand-woman',name:'质感女声',description:'女声 成熟 高级 品牌故事'}
]};
const profiles=await buildVoiceProfiles(catalog);
assert.equal(profiles.voice_count,3);
const cases=[
  ['广告','product_launch','advertising'],
  ['教程','product_tutorial','tutorial'],
  ['品牌故事','product_detail','brand_story'],
  ['促销','product_promotion','promotion']
];
for(const [name,scene,style] of cases){
  const requirement=audioRequirement({message:name,sceneId:scene,marketingPlan:{platform:'douyin'}});requirement.commercial_style=style;
  const candidates=voiceCandidates(profiles.profiles,requirement,{limit:3});
  assert(candidates.length&&candidates[0].score>=candidates.at(-1).score,`${name}候选必须排序`);
}

const document={fps:30,durationFrames:900,output:{width:1080,height:1920},businessContract:{audio:'original'},scenes:[{id:'s1',startFrame:0,durationFrames:90},{id:'s2',startFrame:90,durationFrames:360},{id:'s3',startFrame:450,durationFrames:450}],nodes:[{id:'v1',kind:'video',startFrame:0,durationFrames:90,semanticRole:'hero',params:{}},{id:'t1',kind:'text',semanticRole:'title',params:{text:'三秒看懂新品'}},{id:'cta',kind:'text',semanticRole:'cta',params:{text:'查看详情'}}],transitions:[{fromSceneId:'s1',toSceneId:'s2'}],audioGraph:[{id:'a',volume:1}],productBrief:{selling_points:[{id:'sp1'}]},marketingPlan:{marketing_objective:'建立认知',hook:{first_three_seconds:'结果先行'},caption_strategy:{},music_style:{},cta:{text:'查看详情'}},directorTimeline:{shots:[{id:'s1',commercial_purpose:'建立兴趣',selling_point_refs:['sp1'],visual_focus:{primary:'商品主体'},transition:{purpose:'从结果进入使用'},audio:{design:'保留原声'}},{id:'s2',commercial_purpose:'证明卖点',selling_point_refs:['sp1'],visual_focus:{primary:'使用动作'},transition:{purpose:'进入细节'},audio:{design:'动作节奏'}},{id:'s3',commercial_purpose:'行动',selling_point_refs:[],visual_focus:{primary:'完整商品'},transition:{purpose:'收束'},audio:{design:'结尾'}}]},hyperframesDesignPlan:{differentiation_budget:{enhanced_shots:3,product_emphasis_shots:2}}};
const quality=scoreCommerceVideo({document,mediaReview:{status:'media-contract-passed',sha256:'fixture'},playbackReview:{fullVideoObserved:false,audioPerceptionVerified:false}});
assert.equal(typeof quality.score,'number');
assert.equal(quality.coverage.actual_mp4,true);
assert.equal(quality.human_acceptance,'pending');
assert(quality.suggestions.some(x=>x.includes('连续观片')));
console.log('PASS voice retrieval/rerank fixtures for ad/tutorial/brand/promotion and MP4-bound quality score');
