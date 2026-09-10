import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {run,ffmpeg,prepareAsset,prepareAnalysis,composeRevision,checkRevision,renderRevision,hashFile} from '../lib/edit/media.mjs';
import {initialTimeline,applyOperations,duration} from '../lib/edit/timeline.mjs';

const out=path.join(ROOT,'outputs/upgrade/engine-media',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});
process.env.EDIT_MEDIA_CACHE_DIR=path.join(ROOT,'outputs/upgrade/media-cache');
const assets={},dirs={};
async function fixture(id,video,audio){const dir=path.join(out,id);await fs.mkdir(dir,{recursive:true});await run(ffmpeg,['-y','-v','error','-f','lavfi','-i',video,...(audio?['-f','lavfi','-i',audio]:[]),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',...(audio?['-c:a','aac','-shortest']:[]),path.join(dir,'original.mp4')]);const asset={id,original:'original.mp4',name:id};await prepareAsset(dir,asset);assets[id]=asset;dirs[id]=dir;return asset;}
const source=await fixture('source','testsrc2=size=640x360:rate=30:duration=8','sine=frequency=440:sample_rate=48000:duration=8');
const blue=await fixture('blue','color=blue:size=640x360:rate=30:duration=4');
assert.equal(source.preparation,'remux');assert.equal(source.analysisReady,false);assert.equal(source.speech,undefined);assert.equal(source.thumbnails.length,1);
const repeatedDir=path.join(out,'repeat');await fs.mkdir(repeatedDir,{recursive:true});await fs.copyFile(path.join(dirs.source,'original.mp4'),path.join(repeatedDir,'original.mp4'));const repeated={id:'repeat',original:'original.mp4'};await prepareAsset(repeatedDir,repeated);assert.equal(repeated.preparationCacheHit,true);assert.equal(await hashFile(path.join(repeatedDir,repeated.work)),await hashFile(path.join(dirs.source,source.work)));
await prepareAnalysis(dirs.source,source);assert.equal(source.analysisReady,true);assert.ok(source.speech);assert.ok(source.waveform.length);await prepareAnalysis(repeatedDir,repeated);assert.equal(repeated.analysisCacheHit,true);console.log('PASS fast import, immutable source cache, deferred analysis cache');

let t=applyOperations(initialTimeline(source),[{type:'split',at:120}],assets);
t=applyOperations(t,[{type:'clip_speed',id:t.clips[0].id,rate:2}],assets);
t=applyOperations(t,[{type:'transition',fromId:t.clips[0].id,toId:t.clips[1].id,style:'crossfade',duration:15}],assets);
t=applyOperations(t,[{type:'overlay_add',id:'pip',assetId:'blue',in:0,out:60,start:15,end:45,rate:2,rect:{x:.65,y:.05,width:.3,height:.3},anchor:'timeline'},{type:'caption_add',id:'subtitle',start:90,end:150,text:'字幕不生成朗读',anchor:'timeline'}],assets);
const dir=path.join(out,'revision'),compiled=await composeRevision(dir,t,assets,id=>dirs[id]);assert.ok(compiled.cache.stemsMiss+compiled.cache.stemsHit>0);
const before=await checkRevision(dir,undefined,{mode:'preview',timeline:t,operations:[{type:'caption_update',id:'subtitle'}]});const again=await checkRevision(dir,undefined,{mode:'preview',timeline:t,operations:[{type:'caption_update',id:'subtitle'}]});assert.equal(again.cacheHit,true);console.log('PASS targeted HyperFrames preview and check cache');
const changed=applyOperations(t,[{type:'caption_update',id:'subtitle',text:'只改字幕，复用声音'}],assets),next=path.join(out,'caption-only');const metrics=await composeRevision(next,changed,assets,id=>dirs[id]);assert.equal(metrics.cache.stemsMiss,0);assert.equal(metrics.cache.mixMiss,0);assert.equal(await hashFile(path.join(dir,'assets/mix.m4a')),await hashFile(path.join(next,'assets/mix.m4a')));console.log('PASS caption-only audio reuse');
await checkRevision(dir);const meta=await renderRevision(dir,t);assert.equal(Math.round(meta.duration*30),duration(t));assert.equal(meta.hasAudio,true);console.log('PASS full HyperFrames check and strict MP4 render',meta.duration);
async function pixels(file,time){const bytes=await run(ffmpeg,['-v','error','-ss',String(time),'-i',file,'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true});return sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});}
const sourceFrame=await pixels(path.join(dirs.source,source.work),.6),renderFrame=await pixels(path.join(dir,'video.mp4'),.3);let diff=0;for(let i=0;i<sourceFrame.data.length;i++)diff+=Math.abs(sourceFrame.data[i]-renderFrame.data[i]);assert.ok(diff/sourceFrame.data.length<15,'2x source frame must match rendered frame');
const pipFrame=await pixels(path.join(dir,'video.mp4'),1),idx=(50*640+500)*3;assert.ok(pipFrame.data[idx+2]>180&&pipFrame.data[idx]<50&&pipFrame.data[idx+1]<50,'picture in picture must be blue at its requested rectangle');console.log('PASS rendered 2x frame correspondence and PiP pixels');
const blendFrame=await pixels(path.join(dir,'video.mp4'),1.8),outgoing=await pixels(path.join(dirs.source,source.work),3.6),incoming=await pixels(path.join(dirs.source,source.work),4.3);let blendDiff=0;for(let i=0;i<blendFrame.data.length;i++)blendDiff+=Math.abs(blendFrame.data[i]-(outgoing.data[i]*.4+incoming.data[i]*.6));assert.ok(blendDiff/blendFrame.data.length<20,'transition must blend both source frames');
let cropBase=initialTimeline(source);let cropped=applyOperations(cropBase,[{type:'keep_ranges',ranges:[{start:0,end:45}]},{type:'clip_crop',id:cropBase.clips[0].id,crop:{x:.25,y:.25,width:.5,height:.5}}],assets);
cropped=applyOperations(cropped,[{type:'insert',assetId:'blue',in:0,out:45,at:45}],assets);cropped=applyOperations(cropped,[{type:'transition',fromId:cropped.clips[0].id,toId:cropped.clips[1].id,style:'wipe',duration:15}],assets);
const cropDir=path.join(out,'crop-wipe');await composeRevision(cropDir,cropped,assets,id=>dirs[id]);await checkRevision(cropDir);await renderRevision(cropDir,cropped);
const cropFrame=await pixels(path.join(cropDir,'video.mp4'),.5),expectedCrop=await run(ffmpeg,['-v','error','-ss','0.5','-i',path.join(dirs.source,source.work),'-frames:v','1','-vf','crop=320:180:160:90,scale=640:360','-f','image2pipe','-vcodec','png','-'],{binary:true}),cropPixels=await sharp(expectedCrop).removeAlpha().raw().toBuffer();let cropDiff=0;for(let i=0;i<cropPixels.length;i++)cropDiff+=Math.abs(cropPixels[i]-cropFrame.data[i]);assert.ok(cropDiff/cropPixels.length<20,'crop must match requested normalized source region');
const wipeFrame=await pixels(path.join(cropDir,'video.mp4'),1.25),wi=(180*640+100)*3;assert.ok(wipeFrame.data[wi+2]>180&&wipeFrame.data[wi]<50&&wipeFrame.data[wi+1]<50,'wipe must reveal incoming blue clip on the left');console.log('PASS rendered crossfade blend, crop region and wipe pixels');
await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'passed',meta,preview:before,compile:compiled,captionOnly:metrics,output:dir,cropWipe:cropDir},null,2));
console.log('Engine media acceptance:',out);
