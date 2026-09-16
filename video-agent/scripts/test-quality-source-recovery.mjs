import test from 'node:test';import assert from 'node:assert/strict';
import {sourceWindowRecoveryTarget,replaceSourceWindow} from '../lib/creative/quality-source-recovery.mjs';
import {productionDependencyScopes,invalidatedProductionCheckpoints,captureRuntimeBuild} from '../lib/creative/runtime-build.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {resourceHash} from '../lib/creative/capabilities.mjs';
const assets=[{id:'a',kind:'video',mediaMetadata:{duration:90}}],shot={id:'scene-01',durationSeconds:3,media:[{assetId:'a',sourceStartSeconds:29.5,playbackRate:1,fit:'contain'}],text:[{text:'正面风扇'}],resourceId:'native-original'};
const story={scenes:[shot,{...shot,id:'scene-02'}],audio:[],design:{color:'#111111'}},doc={scenes:story.scenes.map(s=>({id:s.id}))},run={checkpoints:{story:{result:story},'shot-0':{result:{repairCount:2,sourceHash:'checked'}}},artifacts:{},modelCalls:25,maxModelCalls:128,repairCount:2},report={issues:[{severity:'major',repairKind:'source-selection',sceneId:'scene-01',problem:'dark tail'}]};
test('late source defect retains independent remaining source budget and refuses other repair owners',()=>{
 const target=sourceWindowRecoveryTarget(run,doc,report,assets);assert.equal(target.index,0);assert.equal(target.inspection.startSeconds,27.5);
 for(const repairKind of ['layout','text-contract','text-evidence'])assert.equal(sourceWindowRecoveryTarget(run,doc,{issues:[{...report.issues[0],repairKind}]},assets),null);
 assert.equal(sourceWindowRecoveryTarget({...run,artifacts:{sourceShotRepairCounts:{0:2}}},doc,report,assets),null);
 assert.equal(run.repairCount,2);assert.equal(run.modelCalls,25);assert.equal(run.maxModelCalls,128);
});
test('source repair changes only the selected in-point and its explanation',()=>{
 const revised=replaceSourceWindow(story,0,{sourceStartSeconds:28.8,reason:'clear decoded window'},assets);
 const expected=structuredClone(story);expected.scenes[0].media[0].sourceStartSeconds=28.8;expected.scenes[0].reason='clear decoded window';
 assert.deepEqual(revised,expected);assert.equal(story.scenes[0].media[0].sourceStartSeconds,29.5);
 for(const start of [29.5,-1,88,NaN])assert.throws(()=>replaceSourceWindow(story,0,{sourceStartSeconds:start,reason:'invalid'},assets));
});
test('quality-only source changes invalidate review, while any planning or helper dependency change remains conservative',()=>{
 const base="function produce(){ registry.register('story.plan',async()=>1);registry.register('preview.review',async()=>2); }";
 const changed=base.replace('async()=>2','async()=>3'),scope=productionDependencyScopes(base),next=productionDependencyScopes(changed);
 assert.equal(scope.planningAndAssembly,next.planningAndAssembly);
 const before={files:{'lib/creative/production.mjs':'old'},dependencyScopes:{production:scope}},after={files:{'lib/creative/production.mjs':'new'},dependencyScopes:{production:next}};
 const checkpoints=Object.fromEntries(['brief','observe','story','shot-0','assemble','quality'].map(k=>[k,{}]));
 assert.deepEqual(invalidatedProductionCheckpoints(before,after,checkpoints).keys,['quality']);
 assert.deepEqual(invalidatedProductionCheckpoints({...before,dependencyScopes:{}},{...after,historicalProductionScopes:{old:scope}},checkpoints).keys,['quality']);
 assert(invalidatedProductionCheckpoints({...before,dependencyScopes:{}},after,checkpoints).keys.includes('brief'));
 assert(invalidatedProductionCheckpoints(before,{...after,dependencyScopes:{production:productionDependencyScopes(changed.replace('async()=>1','async()=>4'))}},checkpoints).keys.includes('brief'));
 const outside="import {replaceSourceWindow} from './quality-source-recovery.mjs';function produce(){replaceSourceWindow();registry.register('preview.review',async()=>2);}";
 const outsideScope=productionDependencyScopes(outside);assert.equal(outsideScope.qualityHelperIsolated,false);
 assert(invalidatedProductionCheckpoints({files:{'lib/creative/quality-source-recovery.mjs':'old'},dependencyScopes:{production:outsideScope}},{files:{'lib/creative/quality-source-recovery.mjs':'new'},dependencyScopes:{production:outsideScope}},checkpoints).keys.includes('brief'));
});

test('historical stage proof must match the exact retained runtime source bytes',async()=>{
 const base=path.resolve('outputs/quality-source-tests');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'scope-'));
 const source="function produce(){registry.register('preview.review',async()=>2);}",hash=resourceHash(source);
 const required=['server.mjs','package-lock.json','scripts/native-scene-worker.mjs','scripts/native-scene-job.ps1','scripts/local-speak.py','scripts/local-transcribe.py','scripts/speech-worker.py','web/commerce.html','web/commerce.js','lib/creative/capabilities.mjs','lib/creative/production.mjs'];
 for(const file of required){await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});await fs.writeFile(path.join(dir,file),file.endsWith('production.mjs')?source:'');}
 const proof=path.join(dir,'.cache/runtime-scope-sources',hash+'.mjs');await fs.mkdir(path.dirname(proof),{recursive:true});await fs.writeFile(proof,source);
 assert.equal((await captureRuntimeBuild(dir)).historicalProductionScopes[hash].planningAndAssembly,productionDependencyScopes(source).planningAndAssembly);
 await fs.writeFile(proof,source+'/* changed */');await assert.rejects(()=>captureRuntimeBuild(dir),{code:'CHECKPOINT_HASH'});
});
