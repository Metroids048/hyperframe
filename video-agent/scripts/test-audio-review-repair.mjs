import test from 'node:test';
import assert from 'node:assert/strict';
import {isAudioReviewIssue,correctedAudioAssets} from '../lib/creative/audio-review-repair.mjs';
test('subtitle ownership does not send ASR corrections to video selection',()=>{
  assert(isAudioReviewIssue({repairKind:'text-evidence',nodeIds:[],problem:'字幕中的岩是识别错字'}));
  assert(isAudioReviewIssue({repairKind:'text-timing',nodeIds:[],problem:'旁白提前进入接口说明'}));
  assert(!isAudioReviewIssue({repairKind:'source-selection',nodeIds:[],problem:'字幕描述背板但源已换面'}));
  assert(!isAudioReviewIssue({repairKind:'text-evidence',nodeIds:['title'],problem:'标题文字不符'}));
});
test('script correction retains bytes binding and every measured word time',()=>{
  const assets=[{id:'v',generatedVoice:true,sha256:'bytes',providerTranscript:{sourceSha256:'bytes',language:'zh',words:[{text:'举行',start:2,end:2.6}]}}];
  const next=correctedAudioAssets(assets,[{assetId:'v',wordIndex:0,text:'矩形'}],{scripts:{v:'外壳边上可见矩形连接座。'}});
  assert.equal(assets[0].providerTranscript.words[0].text,'举行');
  assert.deepEqual(next[0].providerTranscript.words[0],{text:'矩形',start:2,end:2.6,corrected:true});
  assert.equal(next[0].providerTranscript.sourceSha256,'bytes');
  assert.throws(()=>correctedAudioAssets(assets,[{assetId:'v',wordIndex:3,text:'矩形'}]),{code:'CAPTION_REPAIR_TARGET'});
  assert.throws(()=>correctedAudioAssets(assets,[{assetId:'v',wordIndex:0,text:'更快性能'}],{scripts:{v:'矩形连接座'}}),{code:'CAPTION_REPAIR_FACT'});
});
