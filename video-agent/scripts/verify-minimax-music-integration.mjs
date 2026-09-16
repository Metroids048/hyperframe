// Continues the same real HTTP project; local authored music is explicitly not
// presented as a successful MiniMax music-generation response.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {action,project,document,report,save,base,projectId} from './verify-minimax-edit-integration.mjs';
let p=await project();const before=await document(p);
let asset=p.assets.find(a=>a.name==='original-pulse-40s-master.wav');
if(!asset){const response=await fetch(base+'/api/commerce/'+projectId+'/assets',{method:'POST',headers:{'x-file-name':'original-pulse-40s-master.wav'},body:await fs.readFile('assets/commerce-rebuild-v2/original-pulse-40s-master.wav')});const result=await response.json();assert(result.asset,result.error);asset=result.asset;}
await action('local-music',{action:'audio-apply',assetId:asset.id,role:'music',captions:false,startFrame:0});
p=await project();let d=await document(p),music=d.audioGraph.find(t=>t.role==='music'&&t.assetId===asset.id);assert(music);assert(music.ducking.length);
await action('music-quieter-fade',{action:'patch',message:'只将背景音乐音量调到0.12，片尾1秒自然淡出，保留旁白与字幕。',operations:[{type:'update_audio',nodeId:music.id,params:{volume:.12,fadeOutFrames:30}}]});
p=await project();d=await document(p);assert.deepEqual(d.captions,before.captions);assert.deepEqual(d.audioGraph.filter(t=>t.role!=='music'),before.audioGraph.filter(t=>t.role!=='music'));
for(const field of ['nodes','scenes','transitions','output'])assert.deepEqual(d[field],before[field]);
await action('mixed-export',{action:'export'});p=await project();const r=p.revisions.find(r=>r.id===p.currentRevisionId);
report.mixedOutput={revision:r.id,videoUrl:base+r.videoUrl,packageUrl:base+r.packageUrl,musicSource:'existing locally authored original-pulse-40s-master.wav',miniMaxMusicStatus:'unavailable HTTP 410'};await save();console.log(JSON.stringify(report.mixedOutput));
