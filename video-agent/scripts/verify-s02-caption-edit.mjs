// Reuse the frozen S02 media; no speech generation or supplier calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
import {readNativeProject,writeCompiledProject,runHyperFrames} from '../lib/creative/runner.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';
import {hashFile,ffmpeg,run,probe} from '../lib/edit/media.mjs';

const source=path.join(ROOT,'deliverables/s02-gpu-closeout-20260916/versions/final');
const output=await fs.mkdtemp(path.join(ROOT,'outputs/s02-caption-edit-'));
const sourceHash=await hashFile(path.join(source,'commerce-final.mp4'));
await fs.cp(source,output,{recursive:true,filter:entry=>!entry.endsWith('.mp4')||entry.includes(path.sep+'assets'+path.sep)});
const {document:base,assets}=await readNativeProject(source),map=Object.fromEntries(assets.map(a=>[a.id,a]));
let next=base;
const revisions=[];
for(const message of ['字幕往上移一点','字幕再往上移一点']){
 next=applyDocumentPatch(next,scopedCommerceEdit(next,message).operations,map);revisions.push(structuredClone(next));
}
for(const field of ['audioGraph','nodes','scenes','transitions'])assert.deepEqual(next[field],base[field]);
assert(next.captions.every(c=>c.style.offsetY===-80));
await fs.writeFile(path.join(output,'edit-history.json'),JSON.stringify({baseRevision:base.revisionId,revisions},null,2));
await writeCompiledProject(output,next,assets);
const reopened=await readNativeProject(output);assert.deepEqual(reopened.document.captions,next.captions);
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true});
const measure=async dir=>{
 const page=await browser.newPage();try{
  await page.setViewport({width:1920,height:1080});
  await page.goto(pathToFileURL(path.join(dir,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>Boolean(window.__timelines?.['commerce-root']));
  return await page.evaluate(()=>{window.__timelines['commerce-root'].seek(1,false);const e=document.querySelector('.caption'),r=e.getBoundingClientRect();return {y:r.y,height:r.height,text:e.textContent,opacity:getComputedStyle(e).opacity};});
 }finally{await page.close();}
};
let before,after;try{before=await measure(source);after=await measure(output);}finally{await browser.close();}
assert(Math.abs(before.y-after.y-80)<.1,JSON.stringify({before,after}));assert.equal(before.text,after.text);
await runHyperFrames(output,'check');
await runHyperFrames(output,'render',['--output','commerce-final.mp4','--fps','30','--quality','standard','--workers','1','--strict']);
const rendered=path.join(output,'commerce-final.mp4');
await run(ffmpeg,['-v','error','-i',rendered,'-f','null','-'],{timeout:180000});
// Compare decoded PCM, not codec-container metadata: moving captions must not change sound.
const pcmHash=async(file,name)=>{const target=path.join(output,name);await run(ffmpeg,['-y','-v','error','-i',file,'-vn','-ar','48000','-ac','2','-f','s16le',target]);return hashFile(target);};
const oldAudio=await pcmHash(path.join(source,'commerce-final.mp4'),'baseline.pcm'),newAudio=await pcmHash(rendered,'edited.pcm');
assert.equal(newAudio,oldAudio,'caption-only export changed decoded audio');
assert.equal(await hashFile(path.join(source,'commerce-final.mp4')),sourceHash);
const report={status:'passed',output,sourceRevision:base.revisionId,revision:next.revisionId,before,after,sourceHash,renderedHash:await hashFile(rendered),audioPcmHash:newAudio,media:await probe(rendered),reopened:true,sourceUnchanged:true,limitations:['Existing S02 quality findings are not cleared by this position-edit verification.','No MiniMax or other speech generation was requested.']};
await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
