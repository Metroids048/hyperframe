import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceRequests,resolveResourceTargets,applyRequestedTransitions} from '../lib/creative/resource-catalog.mjs';
const targets=text=>resolveResourceTargets(resourceRequests(text),4);
test('S02 real request: generic HyperFrames use does not require a skill or frames executor',()=>{
 const catalog=[{name:'hyperframes',type:'skills'},{name:'frames',type:'docs'},{name:'mask-reveal',type:'registryBlocks'}];
 assert.deepEqual(resourceRequests('自主选材，应用合适的本地HyperFrames资源',catalog),[]);
 assert.deepEqual(resourceRequests('应用 mask reveal，保留商品主体',catalog).map(r=>r.canonicalId),['mask-reveal']);
 assert.deepEqual(resourceRequests('标题写 HyperFrames',catalog),[]);
});
for(const text of ['只在第二处用色散，其余不用','只在第二处用色散，其余不要色散'])test(text,()=>assert.deepEqual(targets(text),{include:[1],exclude:[0,2,3]}));
for(const text of ['第一处和第三处用色散','色散用在第三处和第一处','第一处用色散，第三处也用色散'])test(text,()=>assert.deepEqual(targets(text),{include:[0,2],exclude:[]}));
test('scoped cancellation preserves another use of the same resource',()=>assert.deepEqual(targets('第一处和第三处用色散，第三处取消，第一处保留'),{include:[0],exclude:[2]}));
test('duplicate clauses are idempotent',()=>assert.deepEqual(targets('第一处用色散，第一处用色散'),targets('第一处用色散')));
test('global withdrawal overrides earlier global request',()=>assert.deepEqual(targets('使用色散，不要色散'),{include:[],exclude:[0,1,2,3]}));
test('missing cut fails without mutating any transition',()=>{
 const doc={revisionId:'r',transitions:[{fromSceneId:'s1',toSceneId:'s2',effect:'dissolve-transition',durationFrames:9}]},before=structuredClone(doc);
 assert.throws(()=>applyRequestedTransitions(doc,'第一处和第三处用色散'),{code:'RESOURCE_SCOPE'});assert.deepEqual(doc,before);
});
test('actual binding uses current scene boundaries and keeps unrelated transitions',()=>{
 const doc={revisionId:'r',transitions:Array.from({length:4},(_,i)=>({fromSceneId:'s'+i,toSceneId:'s'+(i+1),effect:'dissolve-transition',durationFrames:9}))};
 applyRequestedTransitions(doc,'第一处和第三处用色散');assert.deepEqual(doc.transitions.map(t=>t.effect),['chromatic-split','dissolve-transition','chromatic-split','dissolve-transition']);assert.equal(doc.resourceBindings[1].fromSceneId,'s2');assert.equal(doc.resourceBindings[1].baseRevisionId,'r');
});
