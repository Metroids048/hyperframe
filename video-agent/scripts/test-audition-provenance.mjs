import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {creativeVoiceInteraction} from '../lib/creative/voice.mjs';

function wav(){const b=Buffer.alloc(44+48000*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
test('audition binds real catalog identity and subtitles to landed bytes',async()=>{
  const directory=path.resolve('outputs/eight-scenarios-20260916/audition-provenance-'+Date.now());
  const provider={
    speechVoiceCatalog:async()=>({engine:'minimax',voices:[{id:'account-voice',description:'中文'}]}),
    structured:async(prompt,input,schema)=>{
      assert.deepEqual(schema.properties.voices.items.enum,['account-voice']);
      assert.match(input[0].content,/account-voice/);
      return {result:{mode:'audition',summary:'试听',script:'你好',voices:['account-voice'],rate:1,selectedIndex:0}};
    },
    speak:async()=>wav(),
    lastSpeechMetrics:{engine:'minimax',voice:'account-voice',provenance:'protocol-fixture'},
    lastSpeechTranscript:{words:[{word:'你好',start:0,end:1}]}
  };
  const result=await creativeVoiceInteraction({},'先试听“你好”',directory,{provider});
  const a=result.auditions[0];assert.equal(a.voice,'account-voice');
  assert.equal(a.rights.engine,'minimax');assert.equal(a.rights.provenance,'protocol-fixture');
  assert.equal(a.providerTranscript.sourceSha256,a.sha256);
  assert.equal((await fs.stat(path.join(directory,a.path))).size,wav().length);
});
test('a retained audition can be confirmed when provider access is unavailable',async()=>{
  const selected={id:'voice-old',voice:'account-voice',path:'auditions/old.wav',rights:{engine:'minimax'}};
  const provider={speechVoiceCatalog:async()=>{throw Error('key unavailable');},structured:async()=>({result:{mode:'confirm',selectedIndex:1,summary:'已选择'}})};
  const result=await creativeVoiceInteraction({auditions:[selected]},'确认第一个', '.',{provider});
  assert.equal(result.confirmedVoice.id,selected.id);assert.equal(result.confirmedVoice.rights.engine,'minimax');
  provider.structured=async()=>({result:{mode:'audition'}});
  await assert.rejects(creativeVoiceInteraction({auditions:[selected]},'重新试听','.',{provider}),/key unavailable/);
});
