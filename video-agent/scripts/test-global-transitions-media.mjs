import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {initialTimeline,applyOperations} from '../lib/edit/timeline.mjs';
import {composeRevision,checkRevision,renderRevision,run,ffmpeg,closePreviewChecks} from '../lib/edit/media.mjs';
import {checkPreviewRuntime} from '../lib/edit/preview-check.mjs';
const roots=(await fs.readdir(path.join(ROOT,'outputs/upgrade/engine-media'))).sort();
const existing=path.join(ROOT,'outputs/upgrade/engine-media',roots.at(-1),'crop-wipe');
const manifest=JSON.parse(await fs.readFile(path.join(existing,'manifest.json'),'utf8'));
const assets=Object.fromEntries(manifest.map(a=>[a.id,a]));
// Reuse the already prepared regression media, not another business Demo.
const out=await fs.mkdtemp(path.join(ROOT,'outputs/global-transitions-')),sources={};
for(const asset of manifest){const dir=path.join(out,'source-'+asset.id);await fs.mkdir(dir);const ext=path.extname(asset.work);await fs.copyFile(path.join(existing,'assets',asset.id+ext),path.join(dir,asset.work));sources[asset.id]=dir;}
const base=JSON.parse(await fs.readFile(path.join(existing,'timeline.json'),'utf8')),report=[];
try{for(const effect of ['chromatic-split','dissolve-transition','directional-transition','flash-transition']){
 const t=applyOperations(base,[{type:'transition',fromId:base.clips[0].id,toId:base.clips[1].id,style:effect,duration:15}],assets),dir=path.join(out,effect);
 await composeRevision(dir,t,assets,id=>sources[id]);await checkRevision(dir);await renderRevision(dir,t);
 const differences=[];await checkPreviewRuntime(dir,{timeline:t,sampleTimes:[33/30,36/30,42/30],screenshot:async(page,time)=>{
  const shot=await page.screenshot({path:path.join(dir,'preview-'+time+'.png')});
  const frame=await run(ffmpeg,['-v','error','-i',path.join(dir,'video.mp4'),'-vf','select=eq(n\\,'+Math.round(time*30)+')','-vsync','0','-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true});
  await fs.writeFile(path.join(dir,'render-'+time+'.png'),frame);
  const a=await sharp(shot).removeAlpha().raw().toBuffer(),b=await sharp(frame).removeAlpha().raw().toBuffer();assert.equal(a.length,b.length);let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);diff/=a.length;differences.push({time,meanDifference:diff});assert(diff<22,`${effect}: preview/render mismatch ${diff}`);
 }});report.push({effect,status:'passed',differences,dir});console.log('PASS',effect,JSON.stringify(differences));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}}finally{await closePreviewChecks();}
console.log(out);
