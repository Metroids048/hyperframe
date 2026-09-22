import {createHash} from 'node:crypto';
import {analyzeCommerceRouting} from '../orchestration/commerce-router-v2.mjs';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sceneLabels={
  product_launch:'新品种草',product_detail:'商品详情',product_demo:'使用演示',product_collection:'系列展示',
  product_promotion:'活动促销',product_faq:'选购问答',general:'通用剪辑',
};
const sceneQueries={
  product_launch:['product reveal','dynamic typography','rhythmic transition'],
  product_detail:['detail emphasis','guided callout','comparison layout'],
  product_demo:['step caption','guided callout','natural transition'],
  product_collection:['product grid','collection reveal','identity caption'],
  product_promotion:['kinetic typography','cta end card','rhythmic transition'],
  product_faq:['question answer card','evidence callout','caption hierarchy'],
  general:['product reveal','caption','transition'],
};

function audioPlan(message,input){
  if(input&&typeof input==='object'&&!Array.isArray(input))return structuredClone(input);
  if(typeof input==='string'&&input)return {mode:input};
  if(/(?:静音|无声|不要声音)/u.test(message))return {mode:'silent',narration:'none',music:'none',original:'muted'};
  if(/(?:保留|保持).{0,8}(?:原声|配音)/u.test(message))return {mode:'preserve-original',narration:'preserve',music:'none',original:'preserve'};
  const narration=/(?:旁白|配音|讲解|口播)/u.test(message)?'requested':'light-default';
  const music=/(?:不要|不加|禁止).{0,8}(?:音乐|配乐|BGM)/iu.test(message)?'none':'background-default';
  return {mode:'planned',narration,music,original:'inspect-source'};
}

function selectedSkills(scenarioId,taskMode){
  const skills=[
    {id:'commerce-orchestrator',reason:'统一需求、素材与生产状态'},
    {id:'product-understanding',reason:'商品事实和素材证据进入 ProductBrief'},
    {id:'marketing-planner',reason:'平台、受众、Hook 与营销结构'},
    {id:'video-director',reason:'逐镜头商业目的和声画控制'},
    {id:'commerce-hyperframes',reason:'检索并绑定 HyperFrames 0.8.33 可执行资源'},
    {id:'commerce-audio-captions',reason:'声音策略与字幕同步'},
  ];
  if(taskMode!=='create')skills.push({id:'conversation-edit',reason:'保持未指定对象和当前 revision'});
  skills.push({id:`commerce-${scenarioId.replaceAll('_','-')}`,reason:`执行 ${sceneLabels[scenarioId]||scenarioId} 场景规则`});
  return skills;
}

export function buildCommercePreparation(input={}, {project=null,mediaAcquisitionPolicy={}}={}){
  const message=String(input.message||'').trim();
  const intent=analyzeCommerceRouting(message,{selectedScenarioId:input.scenarioId,currentRevisionId:project?.currentRevisionId||null,taskMode:input.taskMode,taskModeExplicit:Boolean(input.taskMode)});
  const taskMode=input.taskMode||intent.videoType||((project?.currentRevisionId)?'edit':'create');
  const scenarioId=input.scenarioId||intent.scenario.id||project?.request?.scenarioId||'general';
  const product=input.product||project?.request?.product||intent.product||null;
  const platform=input.platform||intent.platform?.id||project?.request?.platform||null;
  const inferred=intent.outputConstraints||{};
  const output={width:1080,height:1920,durationSeconds:30,...(project?.request?.output||{}),...Object.fromEntries(Object.entries(inferred).filter(([key,value])=>['width','height','durationSeconds'].includes(key)&&value!=null)),...(input.output||{})};
  const audio=audioPlan(message,input.audio||project?.request?.audioRequirements);
  const assets=project?.assets||[];
  const hasVisual=assets.some(asset=>['image','video'].includes(asset.kind));
  const acquisitionSteps=[];
  if(hasVisual)acquisitionSteps.push({id:'project-assets',status:'available',count:assets.filter(asset=>['image','video'].includes(asset.kind)).length});
  for(const [key,label] of [['local_library','本地素材库'],['web_research','公开资料研究'],['runninghub_generation','RunningHub 缺失镜头生成']]){
    if(mediaAcquisitionPolicy[key]==='allowed')acquisitionSteps.push({id:key,status:'available',label});
  }
  if(mediaAcquisitionPolicy.external_media_download==='rights-gated')acquisitionSteps.push({id:'external_media_download',status:'rights-gated',label:'外部素材下载需权利核验'});
  const blockingGaps=[];
  if(intent.scenario.status==='conflict')blockingGaps.push({field:'scenarioId',question:'文字目标与已选场景冲突，请确认本轮以哪个场景为准'});
  else if(intent.scenario.status==='ambiguous')blockingGaps.push({field:'scenarioId',question:'这轮同时包含多个主要场景，请确认最优先的一个目标'});
  if(!hasVisual&&!acquisitionSteps.some(step=>['available','rights-gated'].includes(step.status)))blockingGaps.push({field:'visuals',question:'当前没有可执行的素材来源，请提供一份商品图片或视频'});
  if(taskMode==='variant'&&!project?.currentRevisionId)blockingGaps.push({field:'baseRevisionId',question:'请打开要派生的真实成片工程'});
  const marketingObjective=intent.marketingGoal||sceneLabels[scenarioId]||'完成本轮视频目标';
  const assumptions=[
    !platform?'未明确平台，按素材构图选择通用社媒规格':null,
    !intent.outputConstraints?.durationSeconds?'未明确时长，暂按 30 秒制作并根据有效素材调整':null,
    !product?.facts?.length?'商品卖点只采用上传素材和公开来源能够核验的事实':null,
  ].filter(Boolean);
  const briefLines=[
    `商品：${product?.label||product?.name||'待从素材与公开资料确认'}`,
    `场景：${scenarioId}`,
    `平台：${platform||'通用社媒'}`,
    `目标：${marketingObjective}`,
    `操作：${taskMode}`,
    `画幅：${output.width}:${output.height}`,
    `目标时长：${output.durationSeconds}s`,
    `声音：${audio.mode}`,
    `素材策略：${hasVisual?'现有素材优先，不足时按服务端策略补齐':'先检索公开信息与合规素材，再按策略生成缺失镜头'}`,
  ];
  const selected=selectedSkills(scenarioId,taskMode);
  const result={
    schemaVersion:2,originalRequest:message,optimizedBrief:briefLines.join('\n'),product,platform,
    audience:intent.audience,marketingObjective,taskMode,scenarioId,workflowProfile:input.workflowProfile||taskMode,
    selectedNodeId:input.selectedNodeId||null,output,audio,facts:structuredClone(input.facts||product?.facts||[]),assumptions,blockingGaps,
    mediaAcquisition:{policy:structuredClone(mediaAcquisitionPolicy),hasProjectVisuals:hasVisual,steps:acquisitionSteps},
    resourceQueries:sceneQueries[scenarioId]||sceneQueries.general,
    selectedSkills:selected.map(skill=>skill.id),whySelected:Object.fromEntries(selected.map(skill=>[skill.id,skill.reason])),
    scenePackage:scenarioId,fallbackStrategy:'保持真实素材、事实、当前 revision；只在所有获准素材路径耗尽后提出一个 blocking question',
    status:blockingGaps.length?'needs_input':'prepared',
  };
  result.receiptId='prep-'+hash(result).slice(0,24);
  return result;
}
