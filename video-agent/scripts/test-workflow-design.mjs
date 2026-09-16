import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {ROOT} from '../lib/workflow.mjs';
import {businessScenarios,validateWorkOrder,planWorkbenchWorkflow,workflowStages,productionWorkflowFromPlan} from '../lib/creative/workflow-design.mjs';
import {advanceWorkflow,recoveryDecision} from '../lib/creative/workflow-gates.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {businessContract} from '../lib/creative/commerce-focus.mjs';
import {resolveWorkflowIntent,productionContractMessage} from '../lib/creative/workflow-intent.mjs';
import {explicitBusinessConstraints,validateBriefAudio} from '../lib/creative/business-constraints.mjs';
const message='只在第二处用色散，其余不要；文字别挡商品。';
const order=()=>({mode:'create',scenario:'general',objective:'说明商品',auxiliaryModes:[],auxiliaryScenarios:[],requirements:[{kind:'prohibit',quote:'其余不要',targetIds:[],excludeIds:[]}],resources:[],gaps:[],procedureSubtype:'not_applicable',steps:[]});
const provider=result=>({structured:async()=>({result,model:'offline-test'})});

test('explicit duration override repairs malformed model references once and retains unrelated prohibitions',async()=>{
 const first='总时长24秒；不要音乐',message='总时长改为48秒；保持原素材';
 const prior=validateWorkOrder({...order(),requirements:[{kind:'change',quote:'总时长24秒',targetIds:[],excludeIds:[]},{kind:'prohibit',quote:'不要音乐',targetIds:[],excludeIds:[]}]},{message:first});
 const valid={...order(),requirements:[{kind:'change',quote:'总时长改为48秒',targetIds:[],excludeIds:[]}],overrides:[{requirementId:prior.requirements[0].id,replacementQuote:'总时长改为48秒'}]};
 const invalid={...valid,overrides:[{...valid.overrides[0],replacementQuote:message}]};
 let calls=0;
 const repairProvider={structured:async(_system,messages)=>{calls++;if(calls===2)assert.equal(JSON.parse(messages[0].content).validationCorrection.code,'WORKFLOW_OVERRIDE_SCOPE');return {result:calls===1?invalid:valid,model:'offline-test'};}};
 const plan=await planWorkbenchWorkflow({root:ROOT,message,prior,provider:repairProvider});
 assert.equal(calls,2);assert.equal(plan.validationRepairs.length,1);
 assert.deepEqual(plan.workOrder.requirements.map(r=>r.quote),['不要音乐','总时长改为48秒']);
 assert.equal(prior.requirements[0].quote,'总时长24秒');
 let failedCalls=0;
 await assert.rejects(planWorkbenchWorkflow({root:ROOT,message,prior,provider:{structured:async()=>{failedCalls++;return {result:invalid};}}}),{code:'WORKFLOW_OVERRIDE_SCOPE'});
 assert.equal(failedCalls,2);
});

test('repeated planning keeps one stable requirement per obligation without permitting ID substitution',()=>{
 const input={...order(),requirements:[{kind:'prohibit',quote:'其余不要',targetIds:[],excludeIds:[]}]};
 let prior=validateWorkOrder(input,{message});
 const id=prior.requirements[0].id;
 for(let i=0;i<8;i++)prior=validateWorkOrder(input,{message,prior});
 assert.equal(prior.requirements.length,1);assert.equal(prior.requirements[0].id,id);
 const reordered=Object.fromEntries(Object.entries(prior.requirements[0]).reverse());
 const mixed={...prior,requirements:[prior.requirements[0],reordered]};
 assert.equal(validateWorkOrder(input,{message,prior:mixed}).requirements.length,1);
 assert.throws(()=>validateWorkOrder({...input,requirements:[{...input.requirements[0],id,quote:'不能删镜头'}]},{message:'不能删镜头',prior}),{code:'WORKFLOW_REQUIREMENT_ID_CONFLICT'});
});
test('M01-F03 normalized production request retains the supplied versioned workflow',()=>{
 const workflow={version:2,contractId:'contract-plan',taskMode:'create',sourceRequests:['商品详情，不加背景音乐'],requirements:[{id:'no-music',kind:'prohibit',field:'sound.music',quote:'不加背景音乐',targetIds:[],excludeIds:[]}]};
 const normalized=normalizeCommerceRequest({message:'按规划制作',scenarioId:'product_detail',inferRequest:true,workflow});
 const contract=businessContract(normalized);
 assert.equal(contract.workflow.contractId,workflow.contractId);assert.deepEqual(contract.workflow.requirements,workflow.requirements);
 contract.workflow.requirements[0].quote='changed';assert.equal(workflow.requirements[0].quote,'不加背景音乐');
 assert.throws(()=>businessContract({...normalized,workflow:{requirements:[]}}),{code:'WORKFLOW_PROVENANCE'});
 assert.throws(()=>businessContract({...normalized,taskMode:'variant'}),{code:'WORKFLOW_MODE_CONFLICT'});
});
test('M01-F03 compound sound exclusions stay independent when only music is explicitly changed',()=>{
 const source='不加背景音乐，不加旁白，不保留原声；';
 assert.equal(explicitBusinessConstraints(source).original,'forbidden');
 assert.equal(explicitBusinessConstraints('保留原声').original,'required');
 assert.throws(()=>validateBriefAudio(source,{keepOriginalAudio:true}),{code:'AUDIO_CONSTRAINT'});
 const first=validateWorkOrder({...order(),scenario:'product_detail',requirements:[{kind:'sound',quote:source,targetIds:[],excludeIds:[]}]},{message:source});
 assert.deepEqual(first.requirements.map(r=>r.field).sort(),['sound.music','sound.narration','sound.original']);
 const music=first.requirements.find(r=>r.field==='sound.music');
 const second=validateWorkOrder({...order(),scenario:'product_detail',requirements:[{kind:'sound',quote:'现在允许添加背景音乐',targetIds:[],excludeIds:[]}],overrides:[{requirementId:music.id,replacementQuote:'现在允许添加背景音乐'}]},{message:'现在允许添加背景音乐',prior:first});
 assert(second.requirements.some(r=>r.quote==='不加旁白'));assert(second.requirements.some(r=>r.quote==='不保留原声'));
 assert(!second.requirements.some(r=>r.quote.includes('不加背景音乐')));assert.equal(second.requirementChanges.length,1);
});
test('M01-F03 plan consumption retains requirements but never promotes observations or resource execution',()=>{
 const assets=[{id:'v1',sha256:'old'}],source='商品详情，不加背景音乐';
 const workOrder=validateWorkOrder({...order(),scenario:'product_detail',requirements:[{kind:'sound',quote:'不加背景音乐',targetIds:['v1'],excludeIds:[]}]},{message:source,assets});
 const plan={id:'plan-source',workOrder,status:'planned_pending_observation',resources:[{status:'resolved'}]};
 const consumed=productionWorkflowFromPlan(plan,{message:'开始制作',assets});
 assert.equal(consumed.parentContractId,workOrder.contractId);assert.deepEqual(consumed.requirements,workOrder.requirements);
 assert.equal(consumed.planningConsumption.observationReused,false);assert.equal(consumed.planningConsumption.resourceExecutionReused,false);
 const changed=productionWorkflowFromPlan(plan,{message:'开始制作',assets:[{id:'v1',sha256:'new'}]});
 assert.equal(changed.planningConsumption.materialChanged,true);assert.notEqual(changed.contractId,consumed.contractId);
 assert.throws(()=>productionWorkflowFromPlan(plan,{message:'开始制作',assets:[],baseRevisionId:null}),{code:'WORK_ORDER_TARGET'});
 assert.throws(()=>productionWorkflowFromPlan(plan,{message:'开始制作',assets,baseRevisionId:'old-revision'}),{code:'WORK_ORDER_BASE'});
 assert.equal(plan.status,'planned_pending_observation');assert.equal(workOrder.qualityAccepted,false);
 const followup=productionWorkflowFromPlan(plan,{message:'现在允许添加背景音乐',assets});
 const resolved=resolveWorkflowIntent(followup,{taskMode:'create',objective:'制作商品片',requirements:[{kind:'change',quote:followup.originalRequest,targetIds:['v1'],excludeIds:[],startSeconds:null,endSeconds:null}],overrides:[{requirementId:workOrder.requirements[0].id,replacementQuote:followup.originalRequest}],assumptions:[],gaps:[]},{objectIds:['v1']});
 assert.equal(productionContractMessage(resolved,'unused'),'现在允许添加背景音乐');
 assert(resolved.sourceRequests.includes(source));assert.notEqual(resolved.contractId,followup.contractId);
 assert.equal(productionContractMessage(null,'原始输入'),'原始输入');
});
test('six business contracts plus general stay distinct and planning never accepts quality',async()=>{
 const catalog=await CapabilityCatalog.open(ROOT);
 for(const scenario of businessScenarios){const result=await planWorkbenchWorkflow({root:ROOT,message,catalog,provider:provider({...order(),scenario})});assert.equal(result.workOrder.scenario,scenario);assert.equal(result.productionStarted,false);assert.equal(result.qualityAccepted,false);assert.equal(result.status,'needs_input');assert.equal(result.skills.skills.length,1);}
 const mixed=await planWorkbenchWorkflow({root:ROOT,message,catalog,provider:provider({...order(),scenario:'product_faq',auxiliaryScenarios:['product_demo'],auxiliaryModes:['recut']})});
 assert.deepEqual(mixed.skills.skills.map(s=>s.id),['commerce.evidence_qa','commerce.recut','commerce.procedure']);
 const required={purpose:'指定效果',query:'chromatic radial split',quote:message,required:true,targetIds:[],texts:[],actionProtected:true};
 const blocked=await planWorkbenchWorkflow({root:ROOT,message,catalog,assets:[{id:'v1',kind:'video'},{id:'v2',kind:'video'}],provider:provider({...order(),resources:[required]})});
 assert(blocked.blockers.some(b=>b.code==='RESOURCE_UNAVAILABLE'));
 const ready=await planWorkbenchWorkflow({root:ROOT,message,catalog,assets:[{id:'v',kind:'video'}],provider:provider(order())});
 assert.equal(ready.stages[0].status,'verified');assert.equal(ready.nextStage,'inspect');assert.equal(ready.qualityAccepted,false);
});
test('scope, quoted evidence, cyclic steps and missing bases fail closed',()=>{
 assert.throws(()=>validateWorkOrder({...order(),mode:'variant'},{message}),{code:'EDIT_BASE_REQUIRED'});
 assert.throws(()=>validateWorkOrder({...order(),requirements:[{kind:'change',quote:'伪造原话',targetIds:[],excludeIds:[]}]},{message}),{code:'WORK_ORDER_QUOTE'});
 assert.throws(()=>validateWorkOrder({...order(),requirements:[{kind:'change',quote:'其余不要',targetIds:['alien'],excludeIds:[]}]},{message}),{code:'WORK_ORDER_TARGET'});
 assert.throws(()=>validateWorkOrder({...order(),steps:[{id:'a',purpose:'a',requires:['a'],assetIds:[]}]},{message}),{code:'WORK_ORDER_STEPS'});
});

test('explicit recut intake survives planning and provided source is not an effect-adapter search',async()=>{
 const assets=[{id:'source',kind:'video',sha256:'real-source'}],intake={taskMode:'recut',taskModeExplicit:true,output:{width:1080,height:1920}};
 const source={resourceKind:'source-asset',purpose:'原片与原声',query:'provided source',quote:message,required:true,targetIds:['source'],texts:[],actionProtected:true};
 const catalog={executionCandidates:()=>[],discovery:{resources:[],data:{contentHash:'test'}}};let calls=0;
 const result=await planWorkbenchWorkflow({root:ROOT,message,assets,intake,catalog,provider:{structured:async(_,messages)=>{
  assert.deepEqual(JSON.parse(messages[0].content).intake,intake);calls++;
  return {result:{...order(),mode:calls===1?'create':'recut',scenario:'product_demo',resources:[source],auxiliaryModes:['variant'],procedureSubtype:'usage'}};
 }}});
 assert.equal(calls,2);assert.equal(result.validationRepairs[0].code,'WORK_ORDER_MODE');
 assert.equal(result.workOrder.mode,'recut');assert.equal(result.status,'planned_pending_observation');
 assert.equal(result.resources[0].status,'source_pending_observation');assert.deepEqual(result.resources[0].sourceBindings,[{assetId:'source',sha256:'real-source'}]);
 assert.equal(result.qualityAccepted,false);assert.equal(result.workOrder.assetObservation,'pending');
 assert(result.skills.skills.some(s=>s.id==='commerce.procedure'));assert(result.skills.skills.some(s=>s.id==='commerce.recut'));
 assert.throws(()=>validateWorkOrder({...order(),mode:'recut',resources:[{...source,targetIds:[]}]},{message,assets,intake}),{code:'WORK_ORDER_RESOURCE'});
 assert.throws(()=>validateWorkOrder({...order(),mode:'recut',resources:[{...source,targetIds:['missing']}]},{message,assets,intake}),{code:'WORK_ORDER_TARGET'});
});
test('invalid model structure gets at most one correction; provider failures never blind retry',async()=>{
 let calls=0;const catalog={executionCandidates:()=>[],discovery:{resources:[],data:{contentHash:'test'}}};
 const bad={...order(),steps:[{id:'a',purpose:'a',requires:['missing'],assetIds:[]}]};
 const result=await planWorkbenchWorkflow({root:ROOT,message,catalog,provider:{structured:async()=>({result:++calls===1?bad:order()})}});
 assert.equal(calls,2);assert.equal(result.validationRepairs.length,1);
 calls=0;await assert.rejects(()=>planWorkbenchWorkflow({root:ROOT,message,catalog,provider:{structured:async()=>{calls++;return {result:bad};}}}),{code:'WORK_ORDER_STEPS'});assert.equal(calls,2);
 calls=0;await assert.rejects(()=>planWorkbenchWorkflow({root:ROOT,message,catalog,provider:{structured:async()=>{calls++;throw Object.assign(Error('offline'),{code:'CODEX_TIMEOUT'});}}}),{code:'CODEX_TIMEOUT'});assert.equal(calls,1);
});
test('model receives existing scene order, native text and sound timing without asking the user',async()=>{
 const document={scenes:[{id:'s3',purpose:'接口',startFrame:30,durationFrames:60}],nodes:[{id:'n3',sceneId:'s3',semanticRole:'title',params:{text:'接口'}}],audioGraph:[{id:'a1',role:'narration',startFrame:30,durationFrames:60}]};
 const catalog={executionCandidates:()=>[],discovery:{resources:[],data:{contentHash:'test'}}};
 const plan=await planWorkbenchWorkflow({root:ROOT,message,document,baseRevisionId:'r1',catalog,provider:{structured:async(_,messages)=>{const {objectIndex}=JSON.parse(messages[0].content);assert.equal(objectIndex.scenes[0].ordinal,1);assert.equal(objectIndex.nodes[0].text,'接口');assert.equal(objectIndex.audio[0].startFrame,30);return {result:{...order(),mode:'variant'}};}}});
 assert.equal(plan.nextStage,'inspect');assert.equal(plan.qualityAccepted,false);
});
test('recut and variant preserve tutorial rules and compound operations',()=>{
 for(const mode of ['recut','variant']){const data={...order(),mode,scenario:'product_demo',auxiliaryModes:['recut','variant']};const context={message,baseRevisionId:'r1',document:{businessContract:{scenarioId:'product_demo'},scenes:[],audioTracks:[]},prior:{requirements:[{kind:'preserve',quote:'原声保留'}],sourceRequests:['原声保留']}};
 assert.equal(validateWorkOrder(data,context).requirements[0].inherited,true);
 assert.throws(()=>validateWorkOrder({...data,scenario:'product_launch'},context),{code:'WORK_ORDER_BUSINESS'});}
});

test('M01-F02 same-draft follow-up preserves sound and fact constraints instead of resetting create-mode history',()=>{
 const firstMessage='不加背景音乐，材质是铝合金';
 const first=validateWorkOrder({...order(),requirements:[{kind:'sound',quote:'不加背景音乐',targetIds:[],excludeIds:[]},{kind:'fact',quote:'材质是铝合金',targetIds:[],excludeIds:[]}]},{message:firstMessage});
 const second=validateWorkOrder({...order(),requirements:[{kind:'change',quote:'改标题',targetIds:[],excludeIds:[]}]},{message:'改标题',prior:first});
 assert(second.requirements.some(r=>r.quote==='不加背景音乐'&&r.inherited));
 assert(second.facts.some(f=>f.text==='材质是铝合金'&&f.verification==='not_independently_verified'));
 assert.deepEqual(second.sourceRequests,[firstMessage,'改标题']);
 const music=second.requirements.find(r=>r.field==='sound.music');
 const third=validateWorkOrder({...order(),requirements:[{kind:'sound',quote:'现在允许添加背景音乐',targetIds:[],excludeIds:[]}],overrides:[{requirementId:music.id,replacementQuote:'现在允许添加背景音乐'}]},{message:'现在允许添加背景音乐',prior:second});
 assert(!third.requirements.some(r=>r.id===music.id));assert(third.requirements.some(r=>r.quote==='改标题'));assert.equal(third.facts.length,1);assert.equal(third.parentContractId,second.contractId);assert.equal(third.requirementChanges.length,1);assert(first.requirements.some(r=>r.id===music.id));
 assert.throws(()=>validateWorkOrder({...order(),requirements:[{kind:'change',quote:'改标题',targetIds:[],excludeIds:[]}],overrides:[{requirementId:music.id,replacementQuote:'改标题'}]},{message:'改标题',prior:second}),{code:'WORKFLOW_OVERRIDE_SCOPE'});
});
test('stage evidence cannot skip dependency, missing input or quality acceptance',()=>{
 const plan={workOrder:{baseRevisionId:null},stages:workflowStages(),blockers:[]};
 assert.throws(()=>advanceWorkflow(plan,'review',[]),{code:'WORKFLOW_DEPENDENCY'});
 assert.throws(()=>advanceWorkflow(plan,'understand',[]),{code:'WORKFLOW_EVIDENCE'});
 const evidence=plan.stages[0].evidence.map(name=>({name,sha256:'a'.repeat(64),verified:true,source:'application'}));
 assert.equal(advanceWorkflow(plan,'understand',evidence).qualityAccepted,false);
 assert.throws(()=>advanceWorkflow({...plan,blockers:[{}]},'understand',evidence),{code:'WORKFLOW_BLOCKED'});
});
test('fallback protects explicit effects, fee ambiguity and retry budget',()=>{
 assert.equal(recoveryDecision({code:'MINIMAX_SUBMISSION_UNKNOWN'}).retryAllowed,false);
 assert.equal(recoveryDecision({code:'CODEX_TIMEOUT',attempts:2}).retryAllowed,false);
 assert.equal(recoveryDecision({code:'RESOURCE_MISSING',alternativeApproved:true,alternativeCompatible:true}).alternativeAllowed,false);
 assert.equal(recoveryDecision({code:'RESOURCE_MISSING',required:false,alternativeApproved:true,alternativeCompatible:true}).qualityAccepted,false);
});
test('plan jobs persist and deduplicate without publishing a video revision',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/workflow-test-'));
 const service=await createCreativeService({dataDir,planningProvider:{structured:async(_,messages)=>{const {intake}=JSON.parse(messages[0].content);assert.equal(intake.taskMode,'recut');assert.equal(intake.taskModeExplicit,true);return {result:{...order(),mode:'recut'},model:'offline-test'};}}});const p=await service.create({message,taskMode:'recut',taskModeExplicit:true});
 const input={action:'plan-workflow',message,idempotencyKey:'workflow-test-123456'};
 const job=await service.enqueue(p,input);assert.equal((await service.enqueue(p,input)).id,job.id);
 const end=Date.now()+120000;while(['queued','running'].includes(job.status)&&Date.now()<end)await new Promise(r=>setTimeout(r,30));
 assert.equal(job.status,'complete',job.error);assert.equal(job.workflowPlan.productionStarted,false);assert.equal(p.currentRevisionId,null);assert.equal(p.revisions.length,0);
 while(Date.now()<end){const saved=JSON.parse(await fs.readFile(path.join(dataDir,p.id,'native-project.json'),'utf8'));if(saved.jobs.find(j=>j.id===job.id)?.status==='complete')break;await new Promise(r=>setTimeout(r,30));}
 const reopened=await createCreativeService({dataDir});assert.equal(reopened.get(p.id).workflowPlan.id,job.workflowPlan.id);
});
test('cancelled plan cannot publish a late model result or change the project',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/workflow-cancel-'));let release,started;
 const ready=new Promise(r=>started=r),pending=new Promise(r=>release=r);
 const service=await createCreativeService({dataDir,planningProvider:{structured:async()=>{started();await pending;return {result:order()};}}});
 const p=await service.create({message}),job=await service.enqueue(p,{action:'plan-workflow',message});await ready;await service.cancel(p,job.id);release();
 const end=Date.now()+120000;while(['queued','running'].includes(job.status)&&Date.now()<end)await new Promise(r=>setTimeout(r,30));
 assert.equal(job.status,'cancelled');assert.equal(p.workflowPlan,undefined);assert.equal(p.currentRevisionId,null);
});
