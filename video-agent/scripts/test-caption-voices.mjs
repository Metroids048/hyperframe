import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {syncCaptionVoices} from '../lib/edit/caption-voices.mjs';
import {createEditService} from '../lib/edit/service.mjs';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
import {run,ffmpeg} from '../lib/edit/media.mjs';
const out=path.resolve('outputs/caption-voices'),checks=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));await fs.mkdir(out,{recursive:true});
const base={captions:[],audio:[]},caption={id:'caption-a',text:'新品上市',start:0,end:90};
let calls=0;const fake=async()=>{calls++;return {id:'asset',frames:45}};
let t=await syncCaptionVoices({captions:[caption],audio:[]},base,[],fake);assert.equal(t.audio.length,0);assert.equal(calls,0);
let plain=structuredClone(t);plain.captions[0].text='欢迎光临';await syncCaptionVoices(plain,t,[],fake);assert.equal(calls,0);
const voice={id:'voice',assetId:'generated',role:'voice',captionGroupId:caption.id,text:caption.text,start:0,end:45,gain:1};
const linked={captions:[caption],audio:[voice]},assets={generated:{id:'generated',generated:true,voiceId:'zf_xiaobei'}};
let changed=structuredClone(linked);changed.captions[0].text='欢迎光临';changed=await syncCaptionVoices(changed,linked,[{type:'caption_update',id:caption.id,text:'欢迎光临'}],fake,{assets});assert.equal(changed.audio.length,1);assert.equal(changed.audio[0].text,'欢迎光临');assert.equal(calls,1);
const removed=await syncCaptionVoices({captions:[],audio:changed.audio},changed,[],fake,{assets});assert.equal(removed.audio.length,1);assert.equal(calls,1);
await assert.rejects(()=>syncCaptionVoices({captions:[{...caption,text:'新句子',end:20}],audio:[voice]},linked,[],fake,{assets}),/延长/);
const spoken=await syncCaptionVoices({captions:[{...caption,end:45,sourceSpoken:true}],audio:[{id:'voice',role:'voice',text:caption.text,start:0,end:45,gain:1}]},base,[],fake);assert.equal(spoken.audio.length,1);assert.equal(spoken.audio[0].captionGroupId,undefined);
checks.push('普通字幕不生成声音；显式关联旁白改词才更新；删字幕保留声音；超长旁白被拒绝');console.log('PASS '+checks.at(-1));
// Provider and real media integration are explicit, never a side effect of the offline test group.
if(!process.argv.includes('--live')){console.log('LIVE_NOT_RUN: use --live for actual local TTS, model and render verification');process.exit(0);}
const provider=new CodexProvider(),service=await createEditService({dataDir:path.join(out,'projects'),provider});
let before=Date.now();const wav=await provider.speak('新品上市');const firstMs=Date.now()-before;before=Date.now();assert.deepEqual(await provider.speak('新品上市'),wav);const cachedMs=Date.now()-before;assert(cachedMs<1000);checks.push('配音缓存复用通过');
let p=await service.importFile(path.resolve('assets/edit-samples/product.mp4'),'显式旁白关联验证.mp4');p=service.get(p.id);
async function settle(){for(let i=0;i<500;i++){const j=p.jobs.find(j=>['queued','running'].includes(j.status));if(!j){assert.equal(p.jobs.at(-1).status,'complete',JSON.stringify(p.jobs.at(-1)));return p.revisions.at(-1)}await sleep(500)}throw Error('timeout')}
await settle();
const prompt='只保留前 8 秒，在第 0 到 3 秒添加字幕「欢迎光临」，第 4 到 7 秒添加字幕「新品上市」，并明确为这两句分别生成旁白，关联对应字幕。';
before=Date.now();await service.enqueue(p,'edit',{baseRevisionId:p.currentRevisionId,text:prompt},'live-caption-default');let r=await settle();const previewMs=Date.now()-before;
assert.equal(r.timeline.captions.length,2);assert.equal(r.timeline.audio.filter(a=>a.captionGroupId).length,2);assert.equal(r.media.duration,8);
for(const c of r.timeline.captions){const a=r.timeline.audio.find(a=>a.captionGroupId===(c.groupId||c.id));assert.equal(a.text,c.text);assert(a.start>=c.start&&a.end<=c.end)}checks.push('真实 Codex 明确配音需求生成两条字幕及关联旁白');console.log('PASS '+checks.at(-1));
await service.enqueue(p,'render',{revisionId:r.id},'render-with-voices');r=await settle();
const pcm=await run(ffmpeg,['-v','error','-i',path.join(service.revisionDir(p.id,r.id),'video.mp4'),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'],{binary:true});
for(const a of r.timeline.audio.filter(a=>a.captionGroupId)){let sum=0,n=0;for(let i=Math.floor(a.start/30*16000);i<Math.floor(a.end/30*16000);i++){sum+=pcm.readFloatLE(i*4)**2;n++}assert(Math.sqrt(sum/n)>.02)}checks.push('HyperFrames 检查与 8 秒 MP4 导出通过，两段旁白区间均有实际声音');
let transcribes=0;const oldTranscribe=provider.transcribe.bind(provider);provider.transcribe=async(...args)=>{transcribes++;return oldTranscribe(...args)};
await service.enqueue(p,'operations',{baseRevisionId:r.id,operations:[{type:'voiceover',start:210,text:'你好'},{type:'caption_transcript',assetId:'new_voice'}]},'known-script-fast-caption');r=await settle();assert.equal(transcribes,0);assert.equal(r.timeline.audio.length,3);assert(r.timeline.captions.some(c=>c.text==='你好'));checks.push('已知台词直接配字幕，无多余转写或重复配音');
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,prompt,projectId:p.id,previewMs,ttsFirstMs:firstMs,ttsCachedMs:cachedMs,finishedAt:new Date().toISOString()},null,2));checks.forEach(x=>console.log('PASS '+x));
