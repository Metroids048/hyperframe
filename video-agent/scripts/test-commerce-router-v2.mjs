import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeCommerceRouting} from '../lib/orchestration/commerce-router-v2.mjs';
import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';
import {validateMarketingPlan} from '../lib/creative/commerce-agent-v2.mjs';

const draft=()=>({currentRevisionId:null,revisions:[],assets:[],jobs:[],messages:[],request:{}});

test('coffee machine Xiaohongshu request resolves product, platform and launch without free model classification',async()=>{
  const message='帮我做一个30秒、9:16竖屏的咖啡机小红书视频，前3秒用强画面开场';
  const intent=analyzeCommerceRouting(message);
  assert.equal(intent.product.id,'coffee_machine');
  assert.equal(intent.platform.id,'xiaohongshu');
  assert.equal(intent.marketingGoal,'awareness');
  assert.equal(intent.videoType,'create');
  assert.equal(intent.scenario.id,'product_launch');
  assert.equal(intent.scenario.source,'rule:social-product-default');
  assert.deepEqual({durationSeconds:intent.outputConstraints.durationSeconds,width:intent.outputConstraints.width,height:intent.outputConstraints.height,aspect:intent.outputConstraints.aspect},{durationSeconds:30,width:1080,height:1920,aspect:'9:16'});
  let called=false;
  const route=await routeWorkbenchMessage(draft(),message,{provider:{structured:async()=>{called=true;throw Error('must not call model');}}});
  assert.equal(called,false);
  assert.equal(route.mode,'create');
  assert.equal(route.scenario,'product_launch');
  for(const id of ['commerce-promo','product-understanding','marketing-planner','video-director','hyperframes'])assert(route.selectedSkills.includes(id),id);
});

test('opening seconds are not mistaken for whole-film duration',()=>{
  const intent=analyzeCommerceRouting('做一条45秒横屏的商品转化视频，前3秒突出商品');
  assert.equal(intent.outputConstraints.durationSeconds,45);
  assert.equal(intent.outputConstraints.aspect,'16:9');
});

test('generic product extraction ignores duration, aspect and audience qualifiers',()=>{
  const intent=analyzeCommerceRouting('请制作一条30秒、9:16、适合小红书的桌面护眼台灯商品视频');
  assert.equal(intent.product.label,'桌面护眼台灯');
  assert.equal(intent.platform.id,'xiaohongshu');
  assert.equal(intent.outputConstraints.durationSeconds,30);
  assert.equal(intent.outputConstraints.aspect,'9:16');
});

test('strong business rules distinguish conversion, tutorial, promotion, faq and collection',()=>{
  const cases=[
    ['做一条化妆品商品转化视频','product_detail'],
    ['做一个咖啡机安装教程','product_demo'],
    ['做一个限时活动促销预告','product_promotion'],
    ['做一条这款是否适合新手的FAQ视频','product_faq'],
    ['把三款香氛做成系列展示视频','product_collection'],
  ];
  for(const [message,scenario] of cases)assert.equal(analyzeCommerceRouting(message).scenario.id,scenario,message);
});

test('selected scene conflicting with explicit text becomes a clarification',async()=>{
  const message='做一个咖啡机安装教程';
  const route=await routeWorkbenchMessage(draft(),message,{scenarioId:'product_promotion',taskMode:'create',taskModeExplicit:false,provider:{structured:async()=>{throw Error('must not call model');}}});
  assert.equal(route.mode,'clarify');
  assert.equal(route.source,'explicit-scenario-conflict');
  assert.equal(route.businessIntent.scenario.status,'conflict');
});

test('multi-purpose tie is kept ambiguous for semantic interpretation',()=>{
  const intent=analyzeCommerceRouting('把商品做成系列展示和活动预告视频');
  assert.equal(intent.scenario.status,'ambiguous');
  assert.equal(intent.llmRequired,true);
  assert.deepEqual(intent.scenario.candidates.slice(0,2).map(x=>x.id),['product_promotion','product_collection']);
});

test('negative create instruction cannot trigger social-product default',()=>{
  const intent=analyzeCommerceRouting('不要做咖啡机小红书视频，只分析素材');
  assert.equal(intent.creationRequested,false);
  assert.equal(intent.scenario.id,null);
});

test('collection is a first-class MarketingPlan type',()=>{
  const product={selling_points:[]};
  const plan={schema_version:2,scene_type:'product_collection',platform:'xiaohongshu',audience:['系列用户'],marketing_objective:'讲清组合关系',hook:{message:'三款各有位置',visual_proof:'三款真实画面',first_three_seconds:'先给群像',rationale:'先建立关系'},story_structure:[{id:'1',beat:'group',purpose:'建立系列',selling_point_refs:[],evidence_refs:[]},{id:'2',beat:'items',purpose:'分别识别',selling_point_refs:[],evidence_refs:[]},{id:'3',beat:'recap',purpose:'回顾关系',selling_point_refs:[],evidence_refs:[]}],shot_strategy:['单款与群像交替'],caption_strategy:{tone:'清楚',max_chars_per_card:12,rhythm:'按款切换',roles:['identity']},music_style:{mood:'协调',energy_curve:'稳定',beat_strategy:'按关系切换'},transition_style:{principle:'不混淆身份',preferred:['cut'],avoid:['形变']},cta:{text:'查看系列',placement:'片尾',reason:'收束'},rationale:['保持身份和事实绑定']};
  assert.equal(validateMarketingPlan(plan,product,'product_collection'),plan);
});
