import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';
const document={nodes:[],captions:[{id:'a',trackId:'voice',assetId:'sound',sourceStartSeconds:0,sourceEndSeconds:1},{id:'b',trackId:'voice',assetId:'sound',sourceStartSeconds:1,sourceEndSeconds:2}],audioGraph:[{id:'voice',assetId:'sound',role:'narration',startFrame:0,durationFrames:60},{id:'music',role:'music',volume:.2}]};
test('numeric caption properties resolve last/ordinal/all against the actual timeline',()=>{
 for(const [target,ids] of [['最后一句字幕',['b']],['第1条字幕',['a']],['全部字幕',['a','b']]]){
  const result=scopedCommerceEdit(document,`只把${target}的字号设为31，位置、文字、时间、其他字幕和全部声音画面保持不变。`);
  assert.deepEqual(result.operations.map(o=>o.nodeId),ids);assert(result.operations.every(o=>o.params.fontSize===31));
 }
 assert.deepEqual(scopedCommerceEdit(document,'只把音乐音量调到12%，旁白不动。').operations,[{type:'update_audio',nodeId:'music',params:{volume:.12}}]);
});
test('numeric parser does not consume negations, additional actions, contradictions or ambiguity',()=>{
 for(const message of ['不要把字幕字号设为31','字幕字号设为31，删除第一幕','字幕字号设为31，字号保持不变','只把音乐音量调到12%，音乐保持不变','最后一句字幕字号设为31，颜色更柔和'])assert.equal(scopedCommerceEdit(document,message),null,message);
 const overlapping={...document,captions:[...document.captions,{...document.captions[1],id:'c'}]};
 assert.throws(()=>scopedCommerceEdit(overlapping,'最后一句字幕字号设为31'),{code:'AMBIGUOUS_TARGET'});
});
