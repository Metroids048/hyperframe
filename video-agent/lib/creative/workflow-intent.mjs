import {CreativeError,stableId} from './contracts.mjs';
import {explicitBusinessConstraints} from './business-constraints.mjs';
import {isDeepStrictEqual} from 'node:util';

export function requiresActionProtection(contract={}){
 const workflow=contract?.workflow||contract?.workflowContract||contract||{};
 return [contract?.scenarioId,workflow.businessScenario,...(workflow.auxiliaryScenarios||[])].some(id=>['product_demo','product_howto'].includes(id));
}

const requirementField=r=>r.field||(/音乐|配乐|BGM/i.test(r.quote)?'sound.music':/旁白|配音|口播/.test(r.quote)?'sound.narration':/原声/.test(r.quote)?'sound.original':r.kind);
export function productionContractMessage(workflow,fallback){
 if(!workflow?.planningConsumption)return fallback;
 const quotes=[...new Set((workflow.requirements||[]).map(r=>r.quote).filter(Boolean))];
 if(!quotes.length)throw new CreativeError('制作单没有可执行的有效要求','WORKFLOW_REQUIREMENTS_EMPTY');
 return quotes.join('；\n');
}
export function mergeWorkflowRequirements(prior=[],incoming=[],{message='',overrides=[]}={}){
 const normalize=(r,inherited)=>({...structuredClone(r),id:r.id||stableId('requirement',requirementField(r),r.kind,r.quote,r.targetIds||[],r.excludeIds||[]),field:requirementField(r),inherited});
 const splitSound=r=>{
  if(r.fieldSpecific)return [r];
  const parts=String(r.quote||'').split(/[，,;；]/).map(s=>s.trim()).filter(Boolean);
  const fields=parts.map(quote=>requirementField({kind:r.kind,quote}));
  if(parts.length<2||!fields.every(f=>f.startsWith('sound.'))||new Set(fields).size<2)return [r];
  return parts.map((quote,i)=>({...r,quote,field:fields[i],id:i===0?r.id:undefined,...(r.id?{sourceRequirementId:r.id}:{})}));
 };
 const old=prior.flatMap(splitSound).map(r=>normalize(r,true)),next=incoming.flatMap(splitSound).map(r=>normalize(r,false)),removed=new Set(),changes=[];
 for(const override of overrides){
  const original=old.find(r=>r.id===override.requirementId),replacement=next.find(r=>r.quote===override.replacementQuote&&r.field===original?.field);
  if(!original||!replacement||!message.includes(replacement.quote)||original.field!==replacement.field||JSON.stringify(original.targetIds||[])!==JSON.stringify(replacement.targetIds||[])||JSON.stringify(original.excludeIds||[])!==JSON.stringify(replacement.excludeIds||[]))throw new CreativeError('覆盖要求必须指向同字段、同范围的旧要求及本轮原话','WORKFLOW_OVERRIDE_SCOPE');
  if(!original.fieldSpecific&&[/音乐|配乐|BGM/i,/旁白|配音|口播/,/原声/].filter(pattern=>pattern.test(original.quote)).length>1)throw new CreativeError('旧声音要求合并了多个字段，请分别说明本次修改与保持的声音要求','WORKFLOW_OVERRIDE_SCOPE');
  if(!/(?:现在|允许|授权|改为|改成|替换|添加|加上|加入|不要|取消|删除|不加)/.test(replacement.quote))throw new CreativeError('覆盖旧约束需要本轮明确修改依据','WORKFLOW_OVERRIDE_SOURCE');
  removed.add(original.id);changes.push({before:original,after:replacement});
 }
 const unique=new Map();
 for(const r of [...old.filter(r=>!removed.has(r.id)),...next]){
  const previous=unique.get(r.id);
  if(previous&&!isDeepStrictEqual({...previous,inherited:undefined},{...r,inherited:undefined}))throw new CreativeError('同一要求ID对应不同内容，不能隐式替换','WORKFLOW_REQUIREMENT_ID_CONFLICT');
  unique.set(r.id,r);
 }
 return {requirements:[...unique.values()],changes};
}

export function inheritRevisionWorkflow(document,contract){
 if(contract?.baseRevisionId&&contract.baseRevisionId!==document.revisionId)throw new CreativeError('制作合同不属于当前基准版本','WORKFLOW_BASE_CONFLICT');
 const prior=document.workflowContract||document.businessContract?.workflow||{};
 const requirements=structuredClone(prior.requirements||[]),original=document.businessContract?.originalRequest||document.brief?.originalRequest||'';
 const policy=explicitBusinessConstraints(original);
 for(const role of ['music','narration','original'])if(policy[role]==='forbidden'&&!requirements.some(r=>requirementField(r)==='sound.'+role))requirements.push({kind:'prohibit',field:'sound.'+role,fieldSpecific:true,quote:original,targetIds:[],excludeIds:[]});
 return {...contract,businessScenario:contract.businessScenario||prior.businessScenario||document.businessContract?.scenarioId,
   auxiliaryModes:[...new Set([...(prior.auxiliaryModes||[]),...(contract.auxiliaryModes||[])])],
   auxiliaryScenarios:[...new Set([...(prior.auxiliaryScenarios||[]),...(contract.auxiliaryScenarios||[])])],
   procedureSubtype:prior.procedureSubtype||contract.procedureSubtype||'not_applicable',steps:structuredClone(prior.steps||contract.steps||[]),
   requirements:mergeWorkflowRequirements(requirements,[]).requirements,parentContractId:prior.contractId||null,sourceRequests:structuredClone(prior.sourceRequests||[original].filter(Boolean)),facts:structuredClone(prior.facts||[])};
}

export function bindRevisionWorkflow(document,next,contract,{message,operations=[],interpreted=null}={}){
 const inherited=inheritRevisionWorkflow(document,contract),incoming=interpreted?.requirements?.filter(r=>!r.inherited)||[];
 const overrides=[];
 // Direct UI/exact edits do not pass through a model. Only explicit sound words
 // in the actual user command authorize replacing the corresponding old rule.
 if(!interpreted){
  const denied=explicitBusinessConstraints(message),affirmative=/(?:允许|授权|添加|加入|加上|换成|替换)/.test(message)&&!/(?:不要|不许|禁止|无需)(?:添加|加入|加上|替换)/.test(message);
  for(const [role,pattern] of [['music',/音乐|配乐|BGM/i],['narration',/旁白|配音|口播/],['original',/原声/]])if(pattern.test(message)&&(denied[role]==='forbidden'||affirmative)){
   const quote=message,r={kind:denied[role]==='forbidden'?'prohibit':'change',field:'sound.'+role,quote,targetIds:[],excludeIds:[]};incoming.push(r);for(const old of inherited.requirements.filter(r=>r.field==='sound.'+role))overrides.push({requirementId:old.id,replacementQuote:quote});
  }
  if(operations.length)incoming.push({kind:'change',field:'edit.objects',quote:message,targetIds:[...new Set(operations.flatMap(op=>[op.nodeId,op.sceneId,op.fromSceneId,op.toSceneId,...(op.sceneIds||[])].filter(Boolean)))],excludeIds:[]});
 }
 const merged=interpreted?{requirements:interpreted.requirements,changes:interpreted.requirementChanges||[]}:mergeWorkflowRequirements(inherited.requirements,incoming,{message,overrides});
 const policy={};for(const r of merged.requirements){if(!r.field?.startsWith('sound.'))continue;const role=r.field.slice(6);policy[role]=policy[role]==='forbidden'||explicitBusinessConstraints(r.quote)[role]==='forbidden'?'forbidden':'allowed';}
 for(const track of next.audioGraph||[]){const role=['narration','voiceover'].includes(track.role)?'narration':track.role==='original'?'original':'music';if(policy[role]==='forbidden'&&!document.audioGraph?.some(old=>old.id===track.id&&old.assetId===track.assetId))throw new CreativeError('新音轨违反继承的声音约束，请明确授权修改该字段','WORKFLOW_SOUND_CONFLICT');}
 const targetDiff={changed:[],preserved:[],added:[],removed:[]};
 for(const key of ['scenes','nodes','audioGraph','captions','transitions']){const before=new Map((document[key]||[]).map(o=>[o.id,o])),after=new Map((next[key]||[]).map(o=>[o.id,o]));for(const [id,value]of before)targetDiff[!after.has(id)?'removed':JSON.stringify(value)===JSON.stringify(after.get(id))?'preserved':'changed'].push(id);for(const id of after.keys())if(!before.has(id))targetDiff.added.push(id);}
 return {...inherited,...(interpreted||{}),version:2,baseRevisionId:document.revisionId,originalRequest:message,requirements:merged.requirements,requirementChanges:merged.changes,sourceRequests:[...inherited.sourceRequests,message],soundPolicy:policy,targetDiff,operations:structuredClone(operations),contractId:stableId('contract',inherited.parentContractId,document.revisionId,message,merged.requirements,operations),facts:structuredClone(inherited.facts)};
}

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
  overrides:{type:'array',items:obj({requirementId:str,replacementQuote:str})},assumptions:strings,gaps:strings});

export function workflowContract(input={},base={}) {
  const entry=workflowEntry(input.workflowProfile)||workflowEntry(input.scenarioId)||workflowEntry(input.businessGoal?.[0]);
  const inherited=base.scenarioId||input.businessContract?.scenarioId||input.workflow?.businessScenario||null;
  const taskMode=input.taskMode||input.workflow?.taskMode||((entry?.taskMode!=='create'&&entry?.taskMode)||((base.baseRevisionId||input.baseRevisionId)?'edit':'create'));
  const taskModeExplicit=input.taskModeExplicit??Boolean(input.taskMode||entry?.taskMode==='recut'||entry?.taskMode==='variant');
  if(!modes.has(taskMode))throw new CreativeError('制作操作模式无效','TASK_MODE_INVALID');
  const scenarioId=entry?.taskMode==='create'?entry.id:inherited;
  // Old queued jobs carry an unvalidated v1 intake stub. Recreate that stub;
  // only a versioned semantic contract is eligible for production inheritance.
  const prior=input.workflow?.version===1&&!input.workflow.contractId?null:input.workflow;
  if(prior){
    if(!Array.isArray(prior.requirements)||!Array.isArray(prior.sourceRequests)||!prior.contractId)throw new CreativeError('生产制作单缺少约束或来源版本','WORKFLOW_PROVENANCE');
    if(prior.taskMode&&prior.taskMode!==taskMode)throw new CreativeError('生产操作不能隐式改变已有制作单','WORKFLOW_MODE_CONFLICT');
  }
  return {...(prior?structuredClone(prior):{}),version:prior?2:1,taskMode,taskModeExplicit,workflowProfile:taskMode==='create'?'create':taskMode,
    businessScenario:scenarioId,baseProjectId:base.baseProjectId||input.baseProjectId||input.projectId||null,
    baseRevisionId:base.baseRevisionId||input.baseRevisionId||null,
    assetScope:(input.assets||[]).map(a=>a.id),originalRequest:String(input.message||''),
    requirements:prior?structuredClone(prior.requirements):[],assumptions:prior?.assumptions||[],gaps:prior?.gaps||[],interpretation:prior?'inherited-production-contract':'pending-semantic-analysis'};
}

export function resolveWorkflowIntent(contract,parsed,{objectIds=[],durationSeconds=Infinity}={}) {
  if(!parsed||!modes.has(parsed.taskMode)||!Array.isArray(parsed.requirements))throw new CreativeError('缺少结构化制作单','WORKFLOW_INTENT_INVALID');
  if((contract.taskModeExplicit??(contract.taskMode!=='create'))&&parsed.taskMode!==contract.taskMode)throw new CreativeError('理解结果改变了用户指定的操作模式','WORKFLOW_MODE_CONFLICT');
  if(contract.baseRevisionId&&contract.taskMode!=='create'&&parsed.taskMode==='create')throw new CreativeError('已有工程续改不能被隐式改成新建','WORKFLOW_MODE_CONFLICT');
  if(parsed.taskMode==='edit'&&!contract.baseRevisionId)throw new CreativeError('修改需要已有工程版本','EDIT_BASE_REQUIRED');
  if(parsed.taskMode==='variant'&&!contract.baseRevisionId)throw new CreativeError('变体需要已有工程及基准版本','VARIANT_BASE_REQUIRED');
  const known=new Set(objectIds);
  const requirements=parsed.requirements.map(r=>{
    if(!r.quote||!contract.originalRequest.includes(r.quote))throw new CreativeError('要求来源必须逐字引用本轮原话','WORKFLOW_SOURCE_INVALID');
    if(!Array.isArray(r.targetIds)||!Array.isArray(r.excludeIds)||[...r.targetIds,...r.excludeIds].some(id=>!known.has(id)))throw new CreativeError('修改目标不属于当前版本','WORKFLOW_TARGET_INVALID');
    if(r.targetIds.length&&/第[一二三四五六七八九十\d]+个(?!镜头|场景|字幕|标题|文字|音轨|转场)/.test(r.quote))throw new CreativeError('请说明“第几个”指镜头、文字、音轨还是转场','WORKFLOW_TARGET_AMBIGUOUS');
    if(r.startSeconds!==null&&(!Number.isFinite(r.startSeconds)||r.startSeconds<0))throw new CreativeError('作用时间无效','WORKFLOW_SCOPE_INVALID');
    if(r.endSeconds!==null&&(!Number.isFinite(r.endSeconds)||r.endSeconds<=(r.startSeconds??0)))throw new CreativeError('作用时间无效','WORKFLOW_SCOPE_INVALID');
    if((r.endSeconds??r.startSeconds??0)>durationSeconds)throw new CreativeError('作用范围超出当前版本时长','WORKFLOW_SCOPE_INVALID');
    if(r.targetIds.some(id=>r.excludeIds.includes(id)))throw new CreativeError('同一要求的包含与排除目标冲突','WORKFLOW_SCOPE_CONFLICT');
    return structuredClone(r);
  });
  const merged=mergeWorkflowRequirements(contract.requirements||[],requirements,{message:contract.originalRequest,overrides:parsed.overrides||[]});
  return {...contract,taskMode:parsed.taskMode,workflowProfile:parsed.taskMode,objective:parsed.objective,
    contractId:stableId('contract',contract.contractId||null,contract.baseRevisionId,contract.originalRequest,merged.requirements),parentContractId:contract.contractId||null,
    sourceRequests:[...new Set([...(contract.sourceRequests||[]),contract.originalRequest].filter(Boolean))],
    requirements:merged.requirements,requirementChanges:merged.changes,changeTargets:merged.requirements.filter(r=>r.kind==='change'),preserveTargets:merged.requirements.filter(r=>r.kind==='preserve'),
    resourceNeeds:merged.requirements.filter(r=>r.kind==='resource'),prohibitions:merged.requirements.filter(r=>r.kind==='prohibit'),
    assumptions:parsed.assumptions,gaps:parsed.gaps,interpretation:'validated-semantic-analysis'};
}
