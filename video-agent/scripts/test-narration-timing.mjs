import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCompleteNarration} from '../lib/creative/narration-timing.mjs';
const assets=[{id:'voice',generatedVoice:true,mediaMetadata:{duration:6}}];
const track=(source,start,duration)=>({assetId:'voice',sourceStartSeconds:source,startFrame:start,durationFrames:duration,volume:1});
test('source-complete narration may leave intentional silent reading intervals',()=>{
  assertCompleteNarration({durationFrames:360,audioGraph:[track(0,0,60),track(2,150,60),track(4,300,60)]},assets);
});
test('whole continuous historical narration remains valid',()=>{
  assertCompleteNarration({durationFrames:360,audioGraph:[track(0,0,180)]},assets);
});
test('missing words, repeated audio, overlap, reorder and muted voice cannot pass',()=>{
  const variants=[[],[track(0,0,60),track(3,180,90)],
    [track(0,0,90),track(2,180,120)],[track(0,0,90),track(3,60,90)],
    [track(3,0,90),track(0,180,90)],[{...track(0,0,180),volume:0}],
    [{...track(0,0,180),playbackRate:2}],[track(0,200,180)]];
  for(const audioGraph of variants)assert.throws(()=>assertCompleteNarration({durationFrames:360,audioGraph},assets),{code:'VOICE_DURATION_CONFLICT'});
});
