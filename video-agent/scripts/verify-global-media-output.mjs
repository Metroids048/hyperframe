// Verify the actual current S02 revision through the served native preview and
// its exported MP4. No replacement media, model stubs or alternate composition.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
import {run,ffmpeg,probe,hashFile} from '../lib/edit/media.mjs';
import {projectNativeCaptions} from '../lib/creative/captions.mjs';
const base=process.env.GLOBAL_TEST_URL||'http://127.0.0.1:3041',id=process.env.GLOBAL_TEST_PROJECT_ID||'ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b';
const {project}=await(await fetch(base+'/api/commerce/'+id)).json();
const revision=project.revisions.find(r=>r.id===project.currentRevisionId);
assert(revision.rendered,'Export the current revision through WebUI first');
const directory=path.join(ROOT,process.env.GLOBAL_PROJECT_DATA_DIR||'.cache/global-media-acceptance',id,revision.directory);
const document=JSON.parse(await fs.readFile(path.join(directory,'document.json'),'utf8'));
const video=path.join(directory,'commerce-final.mp4'),out=path.join(ROOT,process.env.GLOBAL_EVIDENCE_DIR||'outputs/global-media','final-'+revision.id);
await fs.mkdir(out,{recursive:true});
await run(ffmpeg,['-v','error','-i',video,'-f','null','-'],{timeout:180000});
const media=await probe(video);assert.equal(media.width,document.output.width);assert.equal(media.height,document.output.height);assert(Math.abs(media.duration-document.durationFrames/30)<.05);assert(media.hasAudio);
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--force-color-profile=srgb','--autoplay-policy=no-user-gesture-required']});
const differences=[],errors=[];
try{
 const page=await browser.newPage();await page.setViewport({width:document.output.width,height:document.output.height,deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+revision.previewUrl,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__player?.getDuration()>0);
 assert(Math.abs(await page.evaluate(()=>window.__player.getDuration())-document.durationFrames/30)<.001);
 const frames=[...new Set([30,90,210,480,660,945,1020,...projectNativeCaptions(document).map(c=>c.startFrame+Math.floor(c.durationFrames/2)),...document.transitions.map(t=>document.scenes.find(s=>s.id===t.toSceneId).startFrame+Math.floor(t.durationFrames/2))])].filter(f=>f<document.durationFrames);
 for(const frame of frames){
  await page.evaluate(async time=>{window.__player.pause();window.__player.seek(time);await window.__hfWaitForSeekCompletion?.();await document.fonts.ready;},frame/30);
  await page.waitForFunction(time=>[...document.querySelectorAll('video,audio')].filter(e=>time>=Number(e.dataset.start||0)&&time<Number(e.dataset.start||0)+Number(e.dataset.duration||Infinity)).every(e=>!e.error&&!e.seeking&&e.readyState>=2&&Math.abs(e.currentTime-(Number(e.dataset.mediaStart||0)+(time-Number(e.dataset.start||0))*Number(e.dataset.playbackRate||1)))<=1/30+.003),{timeout:20000},frame/30);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const screenshot=await page.screenshot({path:path.join(out,'preview-'+frame+'.png')});
  const rendered=await run(ffmpeg,['-v','error','-i',video,'-vf','select=eq(n\\,'+frame+')','-vsync','0','-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true});
  await fs.writeFile(path.join(out,'render-'+frame+'.png'),rendered);
  const a=await sharp(screenshot).removeAlpha().raw().toBuffer(),b=await sharp(rendered).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);
  let total=0;for(let i=0;i<a.length;i++)total+=Math.abs(a[i]-b[i]);const meanDifference=total/a.length;
  differences.push({frame,seconds:frame/30,meanDifference});assert(meanDifference<22,'preview/render mismatch at '+frame+': '+meanDifference);
 }
 await page.evaluate(()=>{window.__player.seek(0);window.__player.play();});
 await page.waitForFunction(seconds=>window.__player.getTime()>=seconds-1/30,{timeout:Math.ceil(document.durationFrames/30+20)*1000},document.durationFrames/30);
 assert.deepEqual(errors,[]);
 const report={status:'passed',projectId:id,revisionId:revision.id,video,sha256:await hashFile(video),media,differences,fullPreviewPlayback:true,fullMp4Decode:true,scope:'sampled exact-frame visual comparison plus continuous runtime playback; not human audio approval',errors};
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
