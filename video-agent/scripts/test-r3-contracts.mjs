import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {submissionSpec} from '../lib/creative/runninghub.mjs';
import {trustedAssetProvenance} from '../lib/creative/asset-provenance.mjs';
import {HyperFramesResourceCatalog,HyperFramesResourcePlanner} from '../lib/creative/resource-catalog.mjs';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';
import {commerceIntake} from '../lib/creative/intake.mjs';
test('model and AI App do not acquire a workflowId requirement',()=>{
 assert.equal(submissionSpec({mode:'model',endpoint:'/openapi/v2/example/image',body:{prompt:'$prompt'}},{prompt:'x'}).body.prompt,'x');
 assert.equal(submissionSpec({mode:'app',body:{webappId:'fixture',nodeInfoList:[]}},{ }).endpoint,'/task/openapi/ai-app/run');
 assert.throws(()=>submissionSpec({mode:'workflow',body:{}},{}),{code:'GENERATION_CONFIG'});
});
test('trusted asset references require server ID and exact source hash, without approval',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r3-source-'));try{
  await fs.mkdir(path.join(root,'data/generated-assets'),{recursive:true});
  await fs.writeFile(path.join(root,'data/generated-assets/test.json'),JSON.stringify({assetId:'a',sha256:'s',provider:'runninghub',providerTaskId:'test-only',status:'downloaded',requestHash:'r',mediaDecoded:true}));
  assert.deepEqual(await trustedAssetProvenance(root,'forged','s'),{});assert.deepEqual(await trustedAssetProvenance(root,'a','changed'),{});
  const a=await trustedAssetProvenance(root,'a','s');assert.equal(a.providerTaskId,'test-only');assert.equal(a.provenance.reviewStatus,'pending');assert.equal(a.approved,undefined);
 }finally{await fs.rm(root,{recursive:true});}
});
test('explicit Chinese shader request cannot resolve to a titlecard',async()=>{
 const catalog=await HyperFramesResourceCatalog.open(path.resolve(import.meta.dirname,'..'));
 const planner=new HyperFramesResourcePlanner(catalog,[{id:'titlecard-reveal',eligible:true,compatible:true,score:10}]);
 const r=planner.plan('只在第一个转场使用色散，其余不动');assert.equal(r.requestedCanonicalId,'chromatic-radial-split');assert.deepEqual(r.selected,[]);assert.equal(r.status,'pending_adapter');
 assert.ok(r.alternatives.some(r=>r.name==='chromatic-radial-split'));
});
test('scoped shader edit preserves the original overlap and rejects negation',()=>{
 const d={transitions:[{fromSceneId:'a',toSceneId:'b',durationFrames:9}]};
 assert.equal(scopedCommerceEdit(d,'只把第一个转场换成 Chromatic Radial Split，其余保持。').operations[0].durationFrames,9);
 assert.equal(scopedCommerceEdit(d,'不要色散，其余不动'),null);
});
test('three targets retain dimensions and output duration',()=>{
 for(const target of ['image','video','marketing'])assert.deepEqual(commerceIntake({target,output:{width:1080,height:1920,durationSeconds:24}}).output,{width:1080,height:1920,durationSeconds:24,fps:30});
});
