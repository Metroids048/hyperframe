import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';import {planCommerceDocument} from '../lib/creative/director.mjs';import {applyDocumentPatch} from '../lib/creative/patch.mjs';import {compileDocument} from '../lib/creative/compiler.mjs';
import {mergeRecognizedCaptions} from '../lib/creative/captions.mjs';
function fixture(message){const assets=[{id:'photo',path:'assets/photo.png',kind:'image',compiledRef:'assets/photo.png',mediaMetadata:{width:1920,height:1080}},{id:'music',path:'assets/music.wav',kind:'audio',compiledRef:'assets/music.wav',mediaMetadata:{hasAudio:true,duration:40}}];const request=normalizeCommerceRequest({projectId:'sound-contract',message,product:{name:'照片',facts:[]},assets,output:{width:1920,height:1080,durationSeconds:35}});return {assets,document:planCommerceDocument(request,assets)};}
test('explicit uploaded music survives parameterized planning and native compilation',()=>{const {document,assets}=fixture('使用上传的原创配乐');assert.equal(document.audioRequirements.music,true);assert.equal(document.audioGraph[0].assetId,'music');assert.equal(document.audioGraph[0].durationFrames,1050);assert.match(compileDocument(document,assets).html,/<audio/);});
test('silent requests do not gain unsolicited music',()=>{const {document}=fixture('不要音乐，保持静音');assert.equal(document.audioGraph.length,0);});
test('source sound rejects unrelated video binding',()=>{const {document,assets}=fixture('保持静音');assert.throws(()=>applyDocumentPatch(document,[{type:'add_audio',assetId:'music',params:{sourceNodeId:'not-a-video',durationFrames:1050,role:'original'}}],Object.fromEntries(assets.map(a=>[a.id,a]))),{code:'INVALID_AUDIO_ASSET'});});
test('a full-length music bed does not move scenes or extend a visual edit',()=>{const {document,assets}=fixture('使用上传的原创配乐');const before=structuredClone(document.scenes);const next=applyDocumentPatch(document,[{type:'update_audio',nodeId:document.audioGraph[0].id,params:{volume:.8}}],Object.fromEntries(assets.map(a=>[a.id,a])));assert.equal(next.durationFrames,1050);assert.deepEqual(next.scenes,before);});
test('regenerating one voice retains another track and muted captions',()=>{
 const document={audioGraph:[{id:'new-voice',assetId:'voice',volume:1,role:'narration'},{id:'original',assetId:'source',volume:1,role:'original'},{id:'muted',assetId:'silent',volume:0,role:'original'}],captions:[{id:'replace',assetId:'voice',trackId:'new-voice'},{id:'keep',assetId:'source',trackId:'original',text:'已校对'},{id:'muted-keep',assetId:'silent',trackId:'muted'}]};
 const next=mergeRecognizedCaptions(document,[{id:'new',assetId:'voice',trackId:'new-voice'}],{assetId:'voice'});
 assert.deepEqual(next.map(c=>c.id),['keep','muted-keep','new']);assert.equal(next[0].text,'已校对');assert.equal(document.captions[0].id,'replace');
});
test('split tracks share a caption root without deleting an unrelated asset root',()=>{
 const document={audioGraph:[{id:'split',captionSourceId:'root',assetId:'voice',volume:1,role:'narration'}],captions:[{id:'old',assetId:'voice',trackId:'root'},{id:'other',assetId:'other',trackId:'root'}]};
 assert.deepEqual(mergeRecognizedCaptions(document,[{id:'new'}],{trackId:'split'}).map(c=>c.id),['other','new']);
});
