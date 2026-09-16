import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {ROOT} from '../lib/workflow.mjs';
import {businessScenarios,validateWorkOrder,planWorkbenchWorkflow,workflowStages} from '../lib/creative/workflow-design.mjs';
import {advanceWorkflow,recoveryDecision} from '../lib/creative/workflow-gates.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
const message='只在第二处用色散，其余不要；文字别挡商品。';
const order=()=>({mode:'create',scenario:'general',objective:'说明商品',auxiliaryModes:[],auxiliaryScenarios:[],requirements:[{kind:'prohibit',quote:'其余不要',targetIds:[],excludeIds:[]}],resources:[],gaps:[],procedureSubtype:'not_applicable',steps:[]});
const provider=result=>({structured:async()=>({result,model:'offline-test'})});
test('six business contracts plus general stay distinct and planning never accepts quality',async()=>{
 const catalog=await CapabilityCatalog.open(ROOT);
 for(const scenario of businessScenarios){const result=await planWorkbenchWorkflow({root:ROOT,message,catalog,provider:provider({...order(),scenario})});assert.equal(result.workOrder.scenario,scenario);assert.equal(result.productionStarted,false);assert.equal(result.qualityAccepted,false);assert.equal(result.status,'needs_input');assert.equal(result.skills.skills.length,scenario==='general'?0:1);}
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
 const service=await createCreativeService({dataDir,planningProvider:provider(order())});const p=await service.create({message});
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
