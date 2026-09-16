import {CreativeError} from './contracts.mjs';

// One vocabulary for entry points; recut and variant are operations, not products.
export const workflowEntries = [
  {id:'product_launch',alias:'launch',label:'新品首发／品牌亮相',taskMode:'create'},
  {id:'product_detail',alias:'detail',label:'商品详情／卖点图解',taskMode:'create'},
  {id:'product_demo',alias:'demo',label:'开箱／安装／使用教程',taskMode:'create'},
  {id:'product_collection',alias:'style',label:'穿搭／组合／系列展示',taskMode:'create'},
  {id:'product_promotion',alias:'promotion',label:'活动促销／直播预告',taskMode:'create'},
  {id:'product_faq',alias:'faq',label:'选购说明／场景问答',taskMode:'create'},
  {id:'recut',alias:'recut',label:'已有视频精剪与包装',taskMode:'recut'},
  {id:'variant',alias:'versions',label:'一稿多版／开头／画幅调整',taskMode:'variant'},
];
export const workflowEntry = id => workflowEntries.find(e=>e.id===id||e.alias===id||(id==='product_howto'&&e.id==='product_demo'));
export const workflowObjectIds = document => [...new Set([
  ...(document.assetRefs||[]),
  ...['nodes','scenes','audioGraph','captions','transitions','sourceBundles','fontResources'].flatMap(key=>(document[key]||[]).map(object=>object.id)),
].filter(id=>typeof id==='string'&&id))];
const modes=new Set(['create','edit','recut','variant']);
const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const str={type:'string'},strings={type:'array',items:str};
export const workflowIntentSchema=obj({taskMode:{type:'string',enum:[...modes]},objective:str,
  requirements:{type:'array',items:obj({kind:{type:'string',enum:['change','preserve','prohibit','resource','goal']},quote:str,targetIds:strings,excludeIds:strings,startSeconds:{type:['number','null']},endSeconds:{type:['number','null']}})},
  assumptions:strings,gaps:strings});

export function workflowContract(input={},base={}) {
  const entry=workflowEntry(input.workflowProfile)||workflowEntry(input.scenarioId)||workflowEntry(input.businessGoal?.[0]);
  const inherited=base.scenarioId||input.businessContract?.scenarioId||null;
  const taskMode=input.taskMode||((entry?.taskMode!=='create'&&entry?.taskMode)||((base.baseRevisionId||input.baseRevisionId)?'edit':'create'));
  const taskModeExplicit=input.taskModeExplicit??Boolean(input.taskMode||entry?.taskMode==='recut'||entry?.taskMode==='variant');
  if(!modes.has(taskMode))throw new CreativeError('制作操作模式无效','TASK_MODE_INVALID');
  const scenarioId=entry?.taskMode==='create'?entry.id:inherited;
  return {version:1,taskMode,taskModeExplicit,workflowProfile:taskMode==='create'?'create':taskMode,
    businessScenario:scenarioId,baseProjectId:base.baseProjectId||input.baseProjectId||input.projectId||null,
    baseRevisionId:base.baseRevisionId||input.baseRevisionId||null,
    assetScope:(input.assets||[]).map(a=>a.id),originalRequest:String(input.message||''),
    requirements:[],assumptions:[],gaps:[],interpretation:'pending-semantic-analysis'};
}

export function resolveWorkflowIntent(contract,parsed,{objectIds=[]}={}) {
  if(!parsed||!modes.has(parsed.taskMode)||!Array.isArray(parsed.requirements))throw new CreativeError('缺少结构化制作单','WORKFLOW_INTENT_INVALID');
  if((contract.taskModeExplicit??(contract.taskMode!=='create'))&&parsed.taskMode!==contract.taskMode)throw new CreativeError('理解结果改变了用户指定的操作模式','WORKFLOW_MODE_CONFLICT');
  if(contract.baseRevisionId&&contract.taskMode!=='create'&&parsed.taskMode==='create')throw new CreativeError('已有工程续改不能被隐式改成新建','WORKFLOW_MODE_CONFLICT');
  if(parsed.taskMode==='edit'&&!contract.baseRevisionId)throw new CreativeError('修改需要已有工程版本','EDIT_BASE_REQUIRED');
  if(parsed.taskMode==='variant'&&!contract.baseRevisionId)throw new CreativeError('变体需要已有工程及基准版本','VARIANT_BASE_REQUIRED');
  const known=new Set(objectIds);
  const requirements=parsed.requirements.map(r=>{
    if(!r.quote||!contract.originalRequest.includes(r.quote))throw new CreativeError('要求来源必须逐字引用本轮原话','WORKFLOW_SOURCE_INVALID');
    if(!Array.isArray(r.targetIds)||!Array.isArray(r.excludeIds)||[...r.targetIds,...r.excludeIds].some(id=>!known.has(id)))throw new CreativeError('修改目标不属于当前版本','WORKFLOW_TARGET_INVALID');
    if(r.startSeconds!==null&&(!Number.isFinite(r.startSeconds)||r.startSeconds<0))throw new CreativeError('作用时间无效','WORKFLOW_SCOPE_INVALID');
    if(r.endSeconds!==null&&(!Number.isFinite(r.endSeconds)||r.endSeconds<=(r.startSeconds??0)))throw new CreativeError('作用时间无效','WORKFLOW_SCOPE_INVALID');
    if(r.targetIds.some(id=>r.excludeIds.includes(id)))throw new CreativeError('同一要求的包含与排除目标冲突','WORKFLOW_SCOPE_CONFLICT');
    return structuredClone(r);
  });
  return {...contract,taskMode:parsed.taskMode,workflowProfile:parsed.taskMode,objective:parsed.objective,
    requirements,changeTargets:requirements.filter(r=>r.kind==='change'),preserveTargets:requirements.filter(r=>r.kind==='preserve'),
    resourceNeeds:requirements.filter(r=>r.kind==='resource'),prohibitions:requirements.filter(r=>r.kind==='prohibit'),
    assumptions:parsed.assumptions,gaps:parsed.gaps,interpretation:'validated-semantic-analysis'};
}
