import {canonicalScene} from '../lib/creative/scene-package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowEntries,workflowContract,resolveWorkflowIntent,workflowObjectIds} from '../lib/creative/workflow-intent.mjs';
import {businessContract} from '../lib/creative/commerce-focus.mjs';
import {commerceIntake} from '../lib/creative/intake.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
for(const entry of workflowEntries)test(entry.id+' dropdown and shortcut preserve the same business/mode',()=>{
 const base={businessContract:{scenarioId:'product_faq'},baseRevisionId:'rev-base'};
 const a=businessContract({...base,scenarioId:entry.id}),b=businessContract({...base,businessGoal:[entry.alias]});
 assert.equal(canonicalScene(a.scenarioId),canonicalScene(b.scenarioId));assert.equal(a.taskMode,b.taskMode);
 if(entry.taskMode!=='create'){assert.equal(a.scenarioId,'product_faq');assert.equal(a.taskMode,entry.taskMode);}
 const intake=commerceIntake({...base,scenarioId:entry.id});assert.equal(intake.taskMode,a.taskMode);
});
const message='这一版改竖屏，前三秒先看细节，声音不变';
const base=workflowContract({message,taskMode:'variant'},{scenarioId:'product_detail',baseProjectId:'p',baseRevisionId:'r'});
const requirement=(kind,quote,targetIds=[],startSeconds=null,endSeconds=null)=>({kind,quote,targetIds,excludeIds:[],startSeconds,endSeconds});
const parsed={taskMode:'variant',objective:'手机观看',requirements:[requirement('change','改竖屏'),requirement('change','前三秒先看细节',['opening'],0,3),requirement('preserve','声音不变',['audio'])],assumptions:[],gaps:[]};
test('S01 real regression: preserving transitions and source assets refers to existing objects',()=>{
 const document={scenes:[{id:'scene-01'}],nodes:[{id:'title'}],transitions:[{id:'transition-2'}],assetRefs:['source-video'],sourceBundles:[{id:'source-scene-01'}]};
 assert.ok(workflowObjectIds(document).includes('source-scene-01'));
 const contract=workflowContract({message:'两处转场不变，不替换已有素材',taskMode:'edit'},{baseRevisionId:'base'});
 const r=resolveWorkflowIntent(contract,{...parsed,taskMode:'edit',requirements:[requirement('preserve','转场不变',['transition-2']),requirement('prohibit','不替换已有素材',['source-video'])]},{objectIds:workflowObjectIds(document)});
 assert.equal(r.preserveTargets[0].targetIds[0],'transition-2');
 assert.throws(()=>resolveWorkflowIntent(contract,{...parsed,taskMode:'edit',requirements:[requirement('preserve','转场不变',['deleted-transition'])]},{objectIds:workflowObjectIds(document)}),{code:'WORKFLOW_TARGET_INVALID'});
});
test('compound variant preserves business, revision, separate targets and sound',()=>{
 const r=resolveWorkflowIntent(base,parsed,{objectIds:['opening','audio']});assert.equal(r.businessScenario,'product_detail');assert.equal(r.baseRevisionId,'r');assert.equal(r.changeTargets.length,2);assert.equal(r.preserveTargets[0].targetIds[0],'audio');
});
test('invented requirements and stale objects rejected',()=>{
 assert.throws(()=>resolveWorkflowIntent(base,{...parsed,requirements:[requirement('goal','售价99元')]}),{code:'WORKFLOW_SOURCE_INVALID'});
 assert.throws(()=>resolveWorkflowIntent(base,parsed,{objectIds:['opening']}),{code:'WORKFLOW_TARGET_INVALID'});
});
test('explicit operation cannot become a new product creation',()=>assert.throws(()=>resolveWorkflowIntent(base,{...parsed,taskMode:'create'}),{code:'WORKFLOW_MODE_CONFLICT'}));
test('ordinary continuation can infer a variant without requiring the user to select a component or mode',()=>{
 const implicit=workflowContract({message,taskMode:'edit',taskModeExplicit:false},{scenarioId:'product_detail',baseProjectId:'p',baseRevisionId:'r'});
 const actual=resolveWorkflowIntent(implicit,parsed,{objectIds:['opening','audio']});assert.equal(actual.taskMode,'variant');assert.equal(actual.businessScenario,'product_detail');assert.equal(actual.baseRevisionId,'r');assert.equal(actual.preserveTargets[0].targetIds[0],'audio');
 assert.throws(()=>resolveWorkflowIntent(implicit,{...parsed,taskMode:'create'},{objectIds:['opening','audio']}),{code:'WORKFLOW_MODE_CONFLICT'});
});
test('explicit create and implicit edit both retain their required base constraints',()=>{
 assert.throws(()=>resolveWorkflowIntent(workflowContract({message,taskMode:'create'}),parsed),{code:'WORKFLOW_MODE_CONFLICT'});
 assert.throws(()=>resolveWorkflowIntent(workflowContract({message}),{...parsed,taskMode:'edit'}),{code:'EDIT_BASE_REQUIRED'});
});
test('variant without native base fails before generation',()=>assert.throws(()=>resolveWorkflowIntent(workflowContract({message}),parsed),{code:'VARIANT_BASE_REQUIRED'}));
test('normalization retains operation and base version',()=>{
 const r=normalizeCommerceRequest({message,inferRequest:true,taskMode:'variant',baseProjectId:'p',baseRevisionId:'r'});assert.equal(r.taskMode,'variant');assert.equal(r.baseRevisionId,'r');
});
test('each model requirement retains exact quotation and scope across repeated resources',()=>{
 const originalRequest='第一处和第三处用色散，第二处不要色散';
 const r=resolveWorkflowIntent({...base,originalRequest},{...parsed,requirements:[{...requirement('resource','第一处和第三处用色散',['cut1','cut3']),excludeIds:['cut2']}]},{objectIds:['cut1','cut2','cut3']});assert.deepEqual(r.resourceNeeds[0].targetIds,['cut1','cut3']);assert.deepEqual(r.resourceNeeds[0].excludeIds,['cut2']);
});
