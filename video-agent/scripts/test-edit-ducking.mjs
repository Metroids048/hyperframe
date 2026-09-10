import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,prepareAsset,composeRevision,checkRevision} from '../lib/edit/media.mjs';
import {initialTimeline,applyOperations,uid} from '../lib/edit/timeline.mjs';
const out=path.join(ROOT,'outputs/edit-ducking'),source=path.join(out,'source'),revision=path.join(out,'revision');await fs.mkdir(source,{recursive:true});
await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=green:size=320x240:rate=30:duration=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',path.join(source,'original.mp4')]);
const a={id:uid(),name:'有讲话时间戳的音频验收素材',original:'original.mp4'};await prepareAsset(source,a);
a.analysis={transcript:{words:[{text:'测试',start:1,end:2}]}};
const t=applyOperations(initialTimeline(a),[{type:'audio_add',assetId:a.id,in:0,start:0,end:90,gain:0.3,role:'music',duck:true,fadeIn:0,fadeOut:0}],{[a.id]:a});
await composeRevision(revision,t,{[a.id]:a},()=>source);await checkRevision(revision);
await run(ffmpeg,['-y','-v','error','-i',path.join(revision,'assets/stem-1.m4a'),'-f','f32le','-ac','1','-ar','48000',path.join(out,'music.f32')]);
const bytes=await fs.readFile(path.join(out,'music.f32'));function rms(s,e){let n=0,sum=0;for(let i=Math.round(s*48000);i<Math.round(e*48000);i++){const x=bytes.readFloatLE(i*4);sum+=x*x;n++;}return Math.sqrt(sum/n);}
const before=rms(.3,.7),during=rms(1.3,1.7),after=rms(2.5,2.8);assert(during/before<.3);assert(after/before>.9&&after/before<1.1);
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({before,during,after,result:'music ducks during speech, returns after speech'},null,2));console.log('PASS 配乐仅在转写人声区间压低，讲话结束后恢复（真实音频 RMS）');
