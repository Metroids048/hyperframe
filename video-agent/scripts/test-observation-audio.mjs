import test from 'node:test';
import assert from 'node:assert/strict';
import {observationAudioStatus,fullOriginalAudioGraph} from '../lib/creative/observation-audio.mjs';

const empty=[{assetId:'uploaded-video',transcript:{words:[],text:''}}];
test('empty ASR permits original-track candidate without claiming silence or review',()=>{
  const before=structuredClone(empty);
  const result=observationAudioStatus({keepOriginalAudio:true,needsCaptions:false},empty);
  assert.equal(result.status,'no_recognized_speech');
  assert.equal(result.reviewRequired,true);
  assert.match(result.limitation,/不代表原片无声/);
  assert.deepEqual(empty,before);
});
test('speech-dependent captions remain blocked on empty recognition',()=>{
  assert.throws(()=>observationAudioStatus({keepOriginalAudio:true,needsCaptions:true},empty),{code:'NO_SPEECH'});
  assert.throws(()=>observationAudioStatus({keepOriginalAudio:false,needsCaptions:false},empty),{code:'NO_SPEECH'});
});
test('recognized words remain usable with audio review pending',()=>{
  assert.equal(observationAudioStatus({needsCaptions:true},[{transcript:{words:[{text:'Camera',start:1,end:2}]}}]).status,'speech_recognized');
});

test('explicit full source audio is detached from visual cuts and retains its tail',()=>{
  const assets=[{id:'v',kind:'video',mediaMetadata:{duration:71.989,hasAudio:true}}];
  const tracks=fullOriginalAudioGraph('原声音轨完整保持原速和原有时间顺序',assets,2160);
  assert.equal(tracks.length,1);assert.equal(tracks[0].durationFrames,2160);
  assert.equal(tracks[0].sourceNodeId,undefined);assert.equal(tracks[0].sourceStartSeconds,0);
  assert.equal(tracks[0].playbackRate,1);assert.equal(tracks[0].volume,1);
  assert.throws(()=>fullOriginalAudioGraph('完整保留原声',assets,900),{code:'ORIGINAL_AUDIO_DURATION'});
  assert.throws(()=>fullOriginalAudioGraph('完整保留原声',[...assets,{...assets[0],id:'v2'}],4320),{code:'ORIGINAL_AUDIO_SOURCE'});
  assert.equal(fullOriginalAudioGraph('操作演示保留原声，动作与声音同步慢放',assets,2160),null);
});
