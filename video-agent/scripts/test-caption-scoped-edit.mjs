import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {applyDocumentPatch,computeInvalidation} from '../lib/creative/patch.mjs';
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
