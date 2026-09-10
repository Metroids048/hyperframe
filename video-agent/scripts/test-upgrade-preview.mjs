import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {checkPreviewRuntime,closePreviewChecks,previewSampleTimes} from '../lib/edit/preview-check.mjs';
import {checkRevision,ffmpeg,run} from '../lib/edit/media.mjs';

const out=path.join(ROOT,'outputs/upgrade/preview-runtime',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});
// Existing strict MP4 is a real render reference, not an in-test preview mock.
const source=path.resolve(process.env.EDIT_PREVIEW_REFERENCE||path.join(ROOT,'outputs/upgrade/engine-media/2026-09-10T02-04-08.508Z/revision'));
const dir=path.join(out,'first');await fs.cp(source,dir,{recursive:true});
const timeline=JSON.parse(await fs.readFile(path.join(dir,'timeline.json'),'utf8')),html=await fs.readFile(path.join(dir,'index.html'),'utf8');
const results=[];let cold,warm;
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
try{
  await test('runtime seeks + screenshots agree with strict MP4',async()=>{
    const differences=[];cold=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0,.3,1,1.8,3,5.466666666666667],screenshot:async(page,time)=>{
      const screenshot=await page.screenshot({path:path.join(out,`preview-${time.toFixed(3)}.png`)});
      const frame=await run(ffmpeg,['-v','error','-ss',String(time),'-i',path.join(source,'video.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true});
      const preview=await sharp(screenshot).removeAlpha().raw().toBuffer(),render=await sharp(frame).removeAlpha().raw().toBuffer();assert.equal(preview.length,render.length);let diff=0;for(let i=0;i<preview.length;i++)diff+=Math.abs(preview[i]-render[i]);diff/=preview.length;differences.push({time,meanAbsoluteDifference:diff});assert.ok(diff<13,`preview/render frame mismatch at ${time}: ${diff}`);
    }});assert.equal(cold.fullCheck,false);cold.frameDifferences=differences;
  });
  await test('new revision reuses browser and content-addressed media cache',async()=>{
    const next=path.join(out,'another-revision-id');await fs.cp(dir,next,{recursive:true});warm=await checkPreviewRuntime(next,{timeline});assert.equal(warm.browserReused,true);assert.ok(warm.responseCacheHits>0);assert.ok(warm.durationMs<5000);const checked=await checkRevision(next,undefined,{mode:'preview',timeline}),cached=await checkRevision(next,undefined,{mode:'preview',timeline});assert.equal(checked.fullCheck,false);assert.equal(cached.cacheHit,true);
  });
  await test('samples retain affected beginning/middle/end and global tail',async()=>{
    const times=previewSampleTimes(timeline,[{type:'caption_update',id:'subtitle'}]);for(const frame of [0,82,164,90,119,149])assert.ok(times.includes(frame/30),'missing sample '+frame);
  });
  await test('runtime errors, external resources and overflowing captions fail preview',async()=>{
    await assert.rejects(checkPreviewRuntime(dir,{timeline,html:html.replace('</body>',`<script>throw Error('intentional-runtime-failure')</script></body>`),sampleTimes:[3]}),/intentional-runtime-failure/);
    await assert.rejects(checkPreviewRuntime(dir,{timeline,html:html.replace('</head>',`<script src="https://example.com/not-allowed.js"></script></head>`),sampleTimes:[0]}),/未授权|非本地|ENOENT/);
    await assert.rejects(checkPreviewRuntime(dir,{timeline,html:html.replace('</head>','<style>.caption span{font-size:300px!important}</style></head>'),sampleTimes:[3]}),/布局检查/);
  });
  await test('cancel during browser wait closes page and next request recovers',async()=>{
    const controller=new AbortController(),missingRuntime=html.replace('<script src="assets/runtime.js"></script>','');const promise=checkPreviewRuntime(dir,{timeline,html:missingRuntime,signal:controller.signal,sampleTimes:[0]});setTimeout(()=>controller.abort(),100);await assert.rejects(promise,/取消/);const recovered=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0,3]});assert.equal(recovered.success,true);
  });
  await test('idle timeout and explicit shutdown allow a fresh browser',async()=>{
    process.env.EDIT_PREVIEW_IDLE_MS='1000';await checkPreviewRuntime(dir,{timeline,sampleTimes:[0]});await new Promise(resolve=>setTimeout(resolve,1400));const fresh=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0]});assert.equal(fresh.browserReused,false);await closePreviewChecks();
  });
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'passed',tests:results,cold,warm,reference:source},null,2));console.log('Runtime preview acceptance:',out);
}finally{await closePreviewChecks();}
