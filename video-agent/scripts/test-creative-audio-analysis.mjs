import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePcm} from '../lib/creative/audio-analysis.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {hashFile} from '../lib/edit/media.mjs';
import {collectCreativeEvidence} from '../lib/creative/model-director.mjs';

test('measured onset candidates follow audible attacks rather than a fabricated beat grid',()=>{
 const rate=8000,pcm=new Float32Array(rate*8),attacks=Array.from({length:14},(_,i)=>.5+i*.5);
 for(const time of attacks)for(let i=0;i<rate*.16;i++)pcm[Math.round(time*rate)+i]=Math.sin(2*Math.PI*330*i/rate)*Math.exp(-i/(rate*.035))*.7;
 const result=analyzePcm(pcm,rate);
 assert.equal(result.duration,8);assert(result.peak>.5);assert(result.rms>0);
 for(const time of attacks)assert(result.onsets.some(o=>Math.abs(o.time-time)<.065),'missing real attack '+time);
 assert(result.tempo.bpm&&Math.abs(result.tempo.bpm-120)<4);
 assert(result.onsets.every(o=>attacks.some(time=>Math.abs(o.time-time)<.065)),'spurious grid point');
});

test('silence and steady tone do not claim a musical tempo',()=>{
 const quiet=analyzePcm(new Float32Array(32000));assert.equal(quiet.peak,0);assert.equal(quiet.rms,0);assert.deepEqual(quiet.onsets,[]);assert.equal(quiet.tempo.bpm,null);
 const tone=analyzePcm(Float32Array.from({length:32000},(_,i)=>Math.sin(2*Math.PI*440*i/8000)*.2));assert.equal(tone.tempo.bpm,null);assert(tone.onsets.length<=1);
});

test('real uploaded audio is decoded, measured, persisted and supplied to the director',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'creative-audio-evidence-')),rate=8000,pcm=Buffer.alloc(rate*4*2);
 for(let attack=.5;attack<3.5;attack+=.5)for(let i=0;i<rate*.1;i++)pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*330*i/rate)*Math.exp(-i/(rate*.025))*20000),(Math.round(attack*rate)+i)*2);
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
 const file=path.join(dir,'measured.wav');await fs.writeFile(file,Buffer.concat([header,pcm]));
 const asset={id:'real-audio',kind:'audio',normalizedRef:'measured.wav',sha256:await hashFile(file),mediaMetadata:{duration:4,hasAudio:true}};
 const first=await collectCreativeEvidence([asset],path.join(dir,'first'),dir),second=await collectCreativeEvidence([asset],path.join(dir,'second'),dir);
 assert(first.records[0].audioAnalysis.onsets.length>=6);assert.equal(second.records[0].audioAnalysis.cacheHit,true);assert.equal(first.records[0].audioAnalysis.sourceSha256,asset.sha256);
 assert(first.inputs.some(i=>i.type==='input_text'&&i.text.includes('实际波形分析')&&i.text.includes('onsets')));
 const saved=JSON.parse(await fs.readFile(path.join(dir,'first','evidence.json'),'utf8'));assert.equal(saved.assets[0].audioAnalysis.onsets.length,first.records[0].audioAnalysis.onsets.length);
 // Retain the small fixture and measured records as inspectable test evidence.
 console.log('Audio analysis evidence: '+dir);
});
