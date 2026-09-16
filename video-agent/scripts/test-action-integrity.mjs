import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStorySources} from '../lib/creative/commerce-directors.mjs';
import {assertRequiredActions,businessContract} from '../lib/creative/commerce-focus.mjs';
const asset={id:'source',kind:'video',mediaMetadata:{duration:30}};
const actions=[{id:'insert',assetId:asset.id,startSeconds:2,endSeconds:5,importance:'necessary',dependsOn:[]},{id:'lock',assetId:asset.id,startSeconds:10,endSeconds:14,importance:'necessary',dependsOn:['insert']}];
const material={actions,evidence:[]};
const scene=(start,duration,rate=1)=>({durationSeconds:duration,media:[{assetId:asset.id,sourceStartSeconds:start,playbackRate:rate}],text:[{text:'已完成锁紧'}]});
test('cutting the wait keeps both actual steps in order at original speed',()=>{
 const selected=selectStorySources({transition:'cut',scenes:[scene(2,3),scene(10,4)]},[asset],material,{demo:true});
 assert.deepEqual(selected.ranges.map(r=>r.protectedAction),[['insert'],['lock']]);
 assert.deepEqual(selected.ranges.map(r=>r.outputStartSeconds),[0,3]);
});
test('a caption cannot replace insertion; reversing steps and accelerating cannot pass',()=>{
 assert.throws(()=>selectStorySources({transition:'cut',scenes:[scene(10,4)]},[asset],material,{demo:true}),{code:'ACTION_MISSING'});
 assert.throws(()=>selectStorySources({transition:'cut',scenes:[scene(10,4),scene(2,3)]},[asset],material,{demo:true}),{code:'ACTION_ORDER'});
 assert.throws(()=>selectStorySources({transition:'cut',scenes:[scene(2,6,2)]},[asset],material,{demo:true}),{code:'ACTION_SPEED'});
});
test('export admission independently rejects accelerated essential steps and permits omitted optional waiting',()=>{
 const document={businessContract:businessContract({scenarioId:'product_demo'}),scenes:[{id:'s',startFrame:0}],nodes:[{kind:'video',sceneId:'s',assetId:asset.id,localStartFrame:0,durationFrames:360,params:{sourceStartSeconds:2,playbackRate:1}}]};
 const admission={assets:[{assetId:asset.id,steps:[...actions,{id:'wait',startSeconds:20,endSeconds:25,importance:'optional',dependsOn:['lock']}]}]};
 assert.doesNotThrow(()=>assertRequiredActions(document,admission));
 const accelerated=structuredClone(document);accelerated.nodes[0].durationFrames=180;accelerated.nodes[0].params.playbackRate=2;
 assert.throws(()=>assertRequiredActions(accelerated,admission),{code:'ACTION_SPEED'});
});
