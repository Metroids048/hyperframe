import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {applyDocumentPatch,computeInvalidation} from '../lib/creative/patch.mjs';
import {projectNativeCaptions} from '../lib/creative/captions.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';

function fixture(){
 const assets=[{id:'photo',path:'assets/photo.png',kind:'image',compiledRef:'assets/photo.png',mediaMetadata:{width:1920,height:1080}},{id:'music',path:'assets/music.wav',kind:'audio',compiledRef:'assets/music.wav',mediaMetadata:{hasAudio:true,duration:40}}];
 const request=normalizeCommerceRequest({projectId:'caption-scope',message:'使用上传的原创配乐',product:{name:'照片',facts:[]},assets,output:{width:1920,height:1080,durationSeconds:35}});
 const doc=planCommerceDocument(request,assets);
 doc.captions=[{id:'cue-1',assetId:'music',trackId:doc.audioGraph[0].id,anchor:'source-content',sourceStartSeconds:1,sourceEndSeconds:2,text:'测试字幕'},{id:'cue-2',assetId:'music',trackId:doc.audioGraph[0].id,anchor:'source-content',sourceStartSeconds:20,sourceEndSeconds:21,text:'第二处字幕'}];
 return {doc,assets,map:Object.fromEntries(assets.map(a=>[a.id,a]))};
}
test('repeated caption moves accumulate without changing words, timings, media or sound',()=>{
 const {doc,map,assets}=fixture();const before=structuredClone(doc);
 const first=applyDocumentPatch(doc,scopedCommerceEdit(doc,'字幕往上移一点').operations,map);
 const second=applyDocumentPatch(first,scopedCommerceEdit(first,'字幕再往上移一点').operations,map);
 assert.equal(first.captions[0].style.offsetY,-40);assert.equal(second.captions[0].style.offsetY,-80);
 for(const field of ['nodes','scenes','audioGraph','transitions','output'])assert.deepEqual(second[field],doc[field],field);
 assert.deepEqual(second.captions.map(({style,...cue})=>cue),doc.captions);
 assert.match(compileDocument(second,assets).html,/bottom:calc\(7% - -80px\)/);
 assert.deepEqual(doc,before,'source revision remains immutable');
});
test('portable native manifest preserves synthesis request for voice-only edits',()=>{
 const {doc,assets}=fixture();assets[1].speechRequest={text:'批准文案',voice:'catalog-voice',rate:1};
 assert.deepEqual(compileDocument(doc,assets).manifest.assets.find(a=>a.id==='music').speechRequest,assets[1].speechRequest);
});
test('turning off narration retains caption bindings and measured display intervals',()=>{
 const {doc,map}=fixture();doc.audioGraph[0].role='narration';doc.audioRequirements={music:false,original:false};
 const before=projectNativeCaptions(doc),next=applyDocumentPatch(doc,scopedCommerceEdit(doc,'不要配音，只留字幕。').operations,map);
 assert.equal(next.audioGraph[0].volume,0);assert.deepEqual(projectNativeCaptions(next),before);assert.deepEqual(next.captions,doc.captions);
});
test('last caption means the latest displayed cue even if storage order differs',()=>{
 const {doc}=fixture();doc.captions.reverse();const plan=scopedCommerceEdit(doc,'最后一条字幕改成“现在开始”。');assert.equal(plan.operations[0].nodeId,'cue-2');
});
test('targeted captions invalidate only overlapping scenes, including text changes',()=>{
 const {doc,map}=fixture();const next=applyDocumentPatch(doc,[{type:'update_caption_style',nodeId:'cue-1',params:{offsetYDelta:-40}}],map);
 assert.equal(next.captions[1].style,undefined);
 const expected=doc.scenes.filter(s=>s.startFrame<60&&s.startFrame+s.durationFrames>30).map(s=>s.id);
 assert.deepEqual(computeInvalidation(doc,next).changedScenes,expected);
 const text=applyDocumentPatch(doc,[{type:'update_caption',nodeId:'cue-1',text:'校对文字'}],map);
 assert.deepEqual(computeInvalidation(doc,text).changedScenes,expected);
});
test('layout lock, excessive offsets and unknown targets reject atomically',()=>{
 const {doc,map}=fixture(),before=structuredClone(doc);
 const locked=applyDocumentPatch(doc,[{type:'lock_scene',sceneId:doc.scenes[0].id,params:{kinds:['layout']}}],map);
 assert.throws(()=>applyDocumentPatch(locked,[{type:'update_caption_style',params:{offsetYDelta:-40}}],map),{code:'LOCK_CONFLICT'});
 for(const params of [null,[],{},{offsetYDelta:-401},{offsetYDelta:1,offsetY:20},{color:'red'},{fontSize:0}])assert.throws(()=>applyDocumentPatch(doc,[{type:'update_caption_style',params}],map),{code:'INVALID_TEXT_STYLE'});
 assert.throws(()=>applyDocumentPatch(doc,[{type:'update_caption_style',nodeId:'',params:{offsetYDelta:-40}}],map),{code:'PATCH_TARGET_MISSING'});
 assert.throws(()=>applyDocumentPatch(doc,[{type:'update_caption_style',nodeId:'missing',params:{offsetYDelta:-40}}],map),{code:'PATCH_TARGET_MISSING'});
 assert.deepEqual(doc,before);
});
test('missing captions cannot silently target product descriptions',()=>{
 const {doc}=fixture();delete doc.captions;
 assert.throws(()=>scopedCommerceEdit(doc,'字幕往上移一点'),{code:'CAPTION_TARGET_MISSING'});
 assert.throws(()=>scopedCommerceEdit(doc,'字幕小一点，往上移，声音和其他画面不变'),{code:'CAPTION_TARGET_MISSING'});
});
test('music reduction and fade preserve narration, captions and visual content',()=>{
 const {doc,map}=fixture();doc.audioGraph.push({...doc.audioGraph[0],id:'voice',role:'narration',volume:1});
 const next=applyDocumentPatch(doc,scopedCommerceEdit(doc,'音乐再轻一点，片尾自然淡出').operations,map);
 assert.equal(next.audioGraph[0].volume,Math.round(doc.audioGraph[0].volume*.8*1000)/1000);
 assert.equal(next.audioGraph[0].fadeOutFrames,30);assert.deepEqual(next.audioGraph[1],doc.audioGraph[1]);
 for(const field of ['captions','nodes','scenes'])assert.deepEqual(next[field],doc[field]);
 assert.throws(()=>scopedCommerceEdit({...doc,audioGraph:[doc.audioGraph[1]]},'音乐再轻一点'),{code:'AUDIO_TARGET_MISSING'});
});
test('end fade does not rewrite an earlier music section fade',()=>{
 const {doc,map}=fixture();doc.audioGraph.push({...doc.audioGraph[0],id:'intro-music',durationFrames:60,fadeOutFrames:7});
 const next=applyDocumentPatch(doc,scopedCommerceEdit(doc,'音乐再轻一点，片尾自然淡出').operations,map);
 assert.equal(next.audioGraph[0].fadeOutFrames,30);assert.equal(next.audioGraph[1].fadeOutFrames,7);
});

// Same request/history scope used by the service, independent of proposed operations.
import {conversationTargetScope,validateConversationTargetScope,nativeChangeReceipt} from '../lib/orchestration/conversation-edit.mjs';
test('relative move after a single caption edit cannot widen to all captions',()=>{
 const {doc,map}=fixture();
 const history=[{newRevision:doc.revisionId,changeSet:[{type:'update_caption',nodeId:'cue-2',text:'第二处字幕'}]}];
 const scope=conversationTargetScope(doc,'再往上一点',history);
 assert.deepEqual(scope.targetIds,['cue-2']);
 for(const ops of [[{type:'update_caption_style',params:{offsetYDelta:-40}}],[{type:'update_caption_style',nodeId:'cue-1',params:{offsetYDelta:-40}}]])
  assert.throws(()=>validateConversationTargetScope(doc,ops,scope),{code:'PRESERVE_VIOLATION'});
 const ops=[{type:'update_caption_style',nodeId:'cue-2',params:{offsetYDelta:-40}}];
 const after=applyDocumentPatch(doc,ops,map);
 assert.deepEqual(after.captions[0],doc.captions[0]);
 assert.equal(after.captions[1].style.offsetY,-40);
 assert.deepEqual(nativeChangeReceipt(doc,after,'再往上一点',ops,scope).requestedScope,scope);
 const damaged=structuredClone(after);damaged.captions[0].text='不允许';
 assert.throws(()=>nativeChangeReceipt(doc,damaged,'再往上一点',ops,scope),{code:'PRESERVE_VIOLATION'});
 assert.throws(()=>conversationTargetScope({...doc,captions:[]},'再往上',history),{code:'AMBIGUOUS_TARGET'});
 assert.throws(()=>validateConversationTargetScope({...doc,revisionId:'stale'},ops,scope),{code:'REVISION_CONFLICT'});
});

import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';
test('real message routing retains the prior single caption ID before execution',async()=>{
 const {doc}=fixture();
 const project={currentRevisionId:doc.revisionId,revisions:[{id:doc.revisionId}],assets:[],jobs:[{id:'accepted',status:'complete',revisionId:doc.revisionId,changeReceipt:{changeSet:[{type:'update_caption',nodeId:'cue-2'}]}}]};
 const route=await routeWorkbenchMessage(project,'再往上一点',{document:doc,provider:{structured(){throw Error('exact relative target needs no model');}}});
 assert.deepEqual(route.targets.map(t=>t.id),['cue-2']);
 assert(route.selectedSkills.includes('speech-captions'));
});

test('semantic caption target is frozen before planning, so extra model targets fail',()=>{
 const {doc}=fixture(),scope=conversationTargetScope(doc,'只改最后一句，其他不动',[],[{kind:'caption',id:'cue-2'}]);
 assert.deepEqual(scope.targetIds,['cue-2']);
 assert.throws(()=>validateConversationTargetScope(doc,[{type:'update_caption',nodeId:'cue-1',text:'误改'}],scope),{code:'PRESERVE_VIOLATION'});
 assert.doesNotThrow(()=>validateConversationTargetScope(doc,[{type:'update_caption',nodeId:'cue-2',text:'正确'}],scope));
});
