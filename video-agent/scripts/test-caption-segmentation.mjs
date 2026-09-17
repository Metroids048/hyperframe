import test from 'node:test';
import assert from 'node:assert/strict';
import {groupCaptionWords} from '../lib/edit/caption-segmentation.mjs';
import {scriptAlignedWords,mergeRecognizedCaptions} from '../lib/creative/captions.mjs';
test('Chinese tail characters stay together without extending measured speech',()=>{
 const words=[{text:'回到整体再对照这些部位的',start:0,end:2.9},{text:'位',start:2.9,end:3.02},{text:'置',start:3.02,end:3.14}];
 const result=groupCaptionWords(words,{language:'zh'});assert.equal(result.length,1);assert.deepEqual(result.flat(),words);assert.equal(result[0].at(-1).end,3.14);
});
test('long utterance is balanced at Chinese word boundaries instead of leaving a short tail',()=>{
 const words=[...'这是一个测试我们看看最后的位置'].map((text,i)=>({text,start:i*.25,end:(i+1)*.25}));
 const groups=groupCaptionWords(words,{language:'zh'});assert(groups.length>1);assert(groups.every(g=>g.length>=3));assert(groups.at(-1).map(w=>w.text).join('').endsWith('位置'));assert.deepEqual(groups.flat(),words);
 for(const g of groups){assert(g.at(-1).end-g[0].start<=3.6);assert(g.length<=24);}
});
test('pauses and actual short utterances are not stretched or merged into another sentence',()=>{
 const words=[{text:'好。',start:0,end:.2},{text:'现在开始',start:1,end:2},{text:'继续',start:3,end:3.4}];
 assert.deepEqual(groupCaptionWords(words,{language:'zh'}),words.map(w=>[w]));
});
test('approved Chinese sentence endings survive orthographic correction and grouping',()=>{
 const words=[{text:'看',start:0,end:.1},{text:'举行',start:.1,end:.6},{text:'连接座',start:.6,end:1},{text:'再看',start:1,end:1.5},{text:'端部',start:1.5,end:2}];
 const corrected=scriptAlignedWords({language:'zh',words},'看矩形连接座。再看端部。');
 const groups=groupCaptionWords(corrected,{language:'zh'});assert.deepEqual(groups.map(g=>g.map(w=>w.text).join('')),['看矩形连接座','再看端部']);
 assert.deepEqual(corrected.map(({start,end})=>[start,end]),words.map(({start,end})=>[start,end]));
});
test('English grouping keeps the original tokens and meaningful sentence stops',()=>{
 const words=[{text:'Hello',start:0,end:.3},{text:'world.',start:.3,end:.8},{text:'Next',start:.8,end:1.3},{text:'sentence.',start:1.3,end:2}];
 assert.deepEqual(groupCaptionWords(words,{language:'en'}),[words.slice(0,2),words.slice(2)]);
});
test('new grouping cannot overwrite previously corrected caption text',()=>{
 const cue={id:'c',assetId:'a',trackId:'t',sourceStartSeconds:1,sourceEndSeconds:2,text:'已确认文字',corrected:true,style:{fontSize:30}};
 const doc={audioGraph:[{id:'t',assetId:'a',volume:1,role:'narration'}],captions:[cue]};
 assert.throws(()=>mergeRecognizedCaptions(doc,[{...cue,id:'new',sourceStartSeconds:0,text:'重新识别'}]),{code:'CAPTION_ALIGNMENT_REQUIRED'});
 const [restored]=mergeRecognizedCaptions(doc,[{...cue,id:'new',text:'重新识别',corrected:false}]);assert.equal(restored.text,cue.text);assert.equal(restored.id,cue.id);assert.deepEqual(restored.style,cue.style);
});
