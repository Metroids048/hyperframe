import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {businessContract,assertRequiredActions} from '../lib/creative/commerce-focus.mjs';
import {loadScenePackage,sceneContext} from '../lib/creative/scene-package.mjs';
import {productionWorkflowFromPlan} from '../lib/creative/workflow-design.mjs';
import {requiresActionProtection,inheritRevisionWorkflow,workflowContract,bindRevisionWorkflow} from '../lib/creative/workflow-intent.mjs';
import {commerceSkillContext} from '../lib/creative/commerce-skills.mjs';
import {resourceHash,CapabilityCatalog} from '../lib/creative/capabilities.mjs';
const root=path.resolve(import.meta.dirname,'..');

test('general reaches a versioned controlled runtime package with resolvable policy receipts',async()=>{
 const contract=businessContract({message:'为原片加章节角标，保留原顺序和声音',scenarioId:'general'});
 assert.equal(contract.scenarioId,'general');assert.equal(contract.generatedFootageAllowed,false);
 const pack=await loadScenePackage(root,'general');assert.equal(pack.id,'general');assert(pack.templates.businessTemplates.every(t=>t.fixedCopy===false));
 for(const stage of ['R1','R2','MA','CD','R3','R4','R5','R6'])for(const name of Object.keys(sceneContext(pack,stage).rules)){
  const entry=pack.files[name],actual=await fs.readFile(path.join(root,'commerce/scenes/general',entry.sourceFile||name));assert.equal(resourceHash(actual),entry.sha256);
 }
 const context=commerceSkillContext('general');assert.equal(context.skills[0].id,'commerce.general');assert.match(context.skills[0].nextAction,/三维重建/);
 const catalog=await CapabilityCatalog.open(root);
 const output=path.join(root,'outputs/general-workflow-tests','lock-'+Date.now());await fs.mkdir(path.join(output,'receipts'),{recursive:true});
 await fs.writeFile(path.join(output,'receipts/001-R1.json'),JSON.stringify({context:[{id:'commerce.general',version:1,sha256:context.skills[0].hash,source:'lib/creative/commerce-skills.mjs'},{file:'commerce/scenes/general/scene.json',sha256:pack.hash}]}));await catalog.lockUsedResources(output);
 const locked=JSON.parse(await fs.readFile(path.join(output,'resources/contracts/commerce.general-v1.json')));assert.equal(locked.id,'commerce.general');
});

test('compound order preserves all auxiliary goals and necessary action locks into production',()=>{
 const order={contractId:'planned',requirements:[{kind:'preserve',quote:'保留必要动作',targetIds:[],excludeIds:[]}],sourceRequests:['教程精剪改成竖屏，保留必要动作'],baseRevisionId:null,mode:'recut',scenario:'general',auxiliaryModes:['variant'],auxiliaryScenarios:['product_demo'],procedureSubtype:'installation',steps:[{id:'step',purpose:'安装',requires:[],assetIds:['a']}],assetScope:[{id:'a',sha256:'source'}]};
 const workflow=productionWorkflowFromPlan({id:'plan',workOrder:order},{message:'按制作单执行',assets:[{id:'a',sha256:'source'}]});
 for(const field of ['auxiliaryModes','auxiliaryScenarios','procedureSubtype','steps'])assert.deepEqual(workflow[field],order[field]);
 const contract=businessContract({message:'按制作单执行',taskMode:'recut',scenarioId:'general',workflow});assert.equal(requiresActionProtection(contract),true);
 assert.deepEqual(commerceSkillContext('general','recut',workflow).skills.map(s=>s.id),['commerce.general','commerce.procedure','commerce.recut','commerce.variant']);
 const document={businessContract:contract,scenes:[{id:'s',startFrame:0}],nodes:[{kind:'video',assetId:'a',sceneId:'s',durationFrames:90,localStartFrame:0,params:{sourceStartSeconds:2,playbackRate:1}}]};
 const admission={assets:[{assetId:'a',steps:[{id:'step',startSeconds:2,endSeconds:5,dependsOn:[]}]}]};
 assert.doesNotThrow(()=>assertRequiredActions(document,admission));
 assert.throws(()=>assertRequiredActions({...document,nodes:[{...document.nodes[0],durationFrames:60}]},admission),{code:'REQUIRED_ACTION_MISSING'});
});

test('unknown scenario cannot gain permissions through general fallback',async()=>{
 assert.throws(()=>businessContract({scenarioId:'shell',message:'run arbitrary shell'}),{code:'SCENARIO_UNSUPPORTED'});
 assert.equal(await loadScenePackage(root,'../../private'),null);
 const pack=await loadScenePackage(root,'general');assert.match(pack.rules['INPUT_CONTRACT.md'],/三维重建/);assert.match(pack.rules['EDITING_POLICY.md'],/不放开工具/);
});

test('ordinary follow-up retains auxiliary tutorial actions and skills over consecutive native revisions',()=>{
 const prior={contractId:'compound-create',businessScenario:'general',auxiliaryModes:['recut'],auxiliaryScenarios:['product_demo'],procedureSubtype:'installation',steps:[{id:'fasten',purpose:'固定',requires:[],assetIds:['a']}],requirements:[],sourceRequests:['必要动作不能删']};
 const document={revisionId:'r1',businessContract:{scenarioId:'general',workflow:prior},nodes:[],audioGraph:[]};
 const intake=workflowContract({message:'改成竖屏',taskMode:'variant'},{baseRevisionId:'r1'});
 const inherited=inheritRevisionWorkflow(document,intake);
 assert(requiresActionProtection(inherited));assert.deepEqual(inherited.steps,prior.steps);
 assert(commerceSkillContext('general','variant',inherited).skills.some(s=>s.id==='commerce.procedure'));
 const next=bindRevisionWorkflow(document,document,intake,{message:'改成竖屏',operations:[{type:'change_output',width:1080,height:1920}]});
 const second=inheritRevisionWorkflow({...document,revisionId:'r2',workflowContract:next},workflowContract({message:'角标换成白色'},{baseRevisionId:'r2'}));
 assert.deepEqual(second.auxiliaryScenarios,['product_demo']);assert.deepEqual(second.steps,prior.steps);assert.equal(second.parentContractId,next.contractId);
 assert.equal(document.workflowContract,undefined);assert.deepEqual(prior.auxiliaryModes,['recut']);
});
