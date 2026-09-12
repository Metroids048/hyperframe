import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {selectiveEffectRestore} from '../lib/creative/history.mjs';

function fixture(){
 const request=normalizeCommerceRequest({projectId:'lock-test',creativeMode:'text',message:'文字动画',output:{width:1080,height:1920,durationSeconds:30},product:{name:'标题',facts:['说明'],price:'¥199'}});
 const doc=planCommerceDocument(request,[]);
 return {doc,scene:doc.scenes[1],title:doc.nodes.find(n=>n.sceneId===doc.scenes[1].id&&n.kind==='text')};
}
const patch=(doc,ops)=>applyDocumentPatch(doc,ops,{});
test('content and timing locks permit layout edits and global movement, while preserving local content',()=>{
 const {doc,scene,title}=fixture(),locked=patch(doc,[{type:'lock_scene',sceneId:scene.id}]);
 const style=patch(locked,[{type:'update_effect_params',sceneId:scene.id,params:{accentScale:1.2}}]);
 assert.deepEqual(style.nodes,locked.nodes);
 const moved=patch(style,[{type:'reorder_scenes',sceneIds:[scene.id,...style.scenes.filter(s=>s.id!==scene.id).map(s=>s.id)]}]);
 assert.equal(moved.scenes[0].startFrame,0);
 assert.throws(()=>patch(locked,[{type:'update_text',nodeId:title.id,text:'覆盖'}]),e=>e.code==='LOCK_CONFLICT');
 assert.throws(()=>patch(locked,[{type:'set_scene_duration',sceneId:scene.id,durationFrames:scene.durationFrames+30}]),e=>e.code==='LOCK_CONFLICT');
 assert.deepEqual(doc,fixture().doc,'input is immutable after rejected transactions');
});
test('unlocking content retains independent timing and absolute locks',()=>{
 const {doc,scene,title}=fixture();
 const locked=patch(doc,[{type:'lock_scene',sceneId:scene.id,params:{kinds:['content','timing','absolute']}}]);
 const next=patch(locked,[{type:'unlock_scene',sceneId:scene.id,params:{kinds:['content']}},{type:'update_text',nodeId:title.id,text:'允许更新的内容'}]);
 assert.equal(next.scenes[1].locks.timing,true);assert.equal(next.scenes[1].locks.absolute,true);
 assert.throws(()=>patch(next,[{type:'set_scene_duration',sceneId:doc.scenes[0].id,durationFrames:doc.scenes[0].durationFrames+30}]),e=>e.code==='LOCK_CONFLICT');
 assert.throws(()=>patch(next,[{type:'retime_document',durationFrames:150}]),e=>e.code==='LOCK_CONFLICT');
});
test('reasserting an existing lock cannot authorize earlier conflicting operations',()=>{
 const {doc,scene,title}=fixture(),locked=patch(doc,[{type:'lock_scene',sceneId:scene.id}]);
 assert.throws(()=>patch(locked,[{type:'update_text',nodeId:title.id,text:'绕过锁'},{type:'lock_scene',sceneId:scene.id}]),e=>e.code==='LOCK_CONFLICT');
});
test('selective motion restoration preserves later price and lock edits',()=>{
 const {doc,scene}=fixture();
 const changed=patch(doc,[{type:'update_effect_params',sceneId:scene.id,params:{accentScale:1.2}}]);
 const price=changed.nodes.find(n=>n.semanticRole==='price');
 const later=patch(changed,[{type:'update_text',nodeId:price.id,text:'¥179'},{type:'lock_scene',sceneId:scene.id}]);
 const restored=patch(later,selectiveEffectRestore(later,doc,changed));
 assert.equal(restored.nodes.find(n=>n.id===price.id).params.text,'¥179');
 assert.deepEqual(restored.scenes[1].locks,later.scenes[1].locks);
 assert.deepEqual(restored.scenes[1].effectParams,doc.scenes[1].effectParams);
});
test('selective restore detects a later edit to the same property',()=>{
 const {doc,scene}=fixture(),changed=patch(doc,[{type:'update_effect_params',sceneId:scene.id,params:{accentScale:1.2}}]);
 const later=patch(changed,[{type:'update_effect_params',sceneId:scene.id,params:{accentScale:1.25}}]);
 assert.throws(()=>selectiveEffectRestore(later,doc,changed),e=>e.code==='RESTORE_CONFLICT');
});

