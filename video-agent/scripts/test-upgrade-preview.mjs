import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {checkPreviewRuntime,closePreviewChecks,previewSampleTimes} from '../lib/edit/preview-check.mjs';
import {checkRevision,ffmpeg,run} from '../lib/edit/media.mjs';

const out=path.join(ROOT,'outputs/upgrade/preview-runtime',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});
// Existing strict MP4 is a real render reference, not an in-test preview mock.
let source=process.env.EDIT_PREVIEW_REFERENCE?path.resolve(process.env.EDIT_PREVIEW_REFERENCE):null;
if(!source){
  const root=path.join(ROOT,'outputs/upgrade/engine-media');
  const latest=async()=>{for(const name of (await fs.readdir(root).catch(()=>[])).sort().reverse()){const dir=path.join(root,name,'revision');if(await fs.access(path.join(dir,'video.mp4')).then(()=>true).catch(()=>false))return dir;}return null;};
  source=await latest();
  if(!source){await run(process.execPath,['scripts/test-upgrade-media.mjs'],{cwd:ROOT,timeout:900000});source=await latest();}
  assert(source,'A strict-rendered media fixture is required');
}
const dir=path.join(out,'first');await fs.cp(source,dir,{recursive:true});
const timeline=JSON.parse(await fs.readFile(path.join(dir,'timeline.json'),'utf8')),html=await fs.readFile(path.join(dir,'index.html'),'utf8');
const results=[];let cold,warm;
function edgeMismatch(a,b,width,height){
  const edges=data=>{const mask=new Uint8Array(width*height),luma=i=>data[i*3]*.299+data[i*3+1]*.587+data[i*3+2]*.114;for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;mask[i]=Math.abs(luma(i+1)-luma(i-1))+Math.abs(luma(i+width)-luma(i-width))>45?1:0;}return mask;};
  const ea=edges(a),eb=edges(b);let count=0,missing=0;
  for(const [from,to] of [[ea,eb],[eb,ea]])for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++)if(from[y*width+x]){count++;let found=false;for(let dy=-2;dy<=2&&!found;dy++)for(let dx=-2;dx<=2;dx++)if(to[(y+dy)*width+x+dx]){found=true;break;}if(!found)missing++;}
  return count?missing/count:0;
}
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
try{
  await test('runtime seeks + screenshots agree with strict MP4',async()=>{
    const differences=[];cold=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0,.3,1,1.8,3,5.466666666666667],screenshot:async(page,time)=>{
      const screenshot=await page.screenshot({path:path.join(out,`preview-${time.toFixed(3)}.png`)});
      const frame=await run(ffmpeg,['-v','error','-ss',String(time),'-i',path.join(source,'video.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true});
      // Untagged YUV source colors differ between browser decode and this
      // pinned renderer. Report that limitation; verify geometry independently
      // using spatial edges, together with exact source time and caption checks.
      const preview=await sharp(screenshot).removeAlpha().raw().toBuffer();let render=await sharp(frame).removeAlpha().raw().toBuffer();assert.equal(preview.length,render.length);let geometry=edgeMismatch(preview,render,timeline.output.width,timeline.output.height),frameOffset=0;
      // Fractional seeking in Chromium can display the adjacent decoded frame.
      // The acceptance bound is one output frame; do not relax it further.
      for(const offset of [-1,1])if(geometry>=.15&&time+offset/30>=0&&time+offset/30<5.5){const candidate=await run(ffmpeg,['-v','error','-ss',String(time+offset/30),'-i',path.join(source,'video.mp4'),'-frames:v','1','-f','image2pipe','-vcodec','png','-'],{binary:true}),pixels=await sharp(candidate).removeAlpha().raw().toBuffer(),candidateGeometry=edgeMismatch(preview,pixels,timeline.output.width,timeline.output.height);if(candidateGeometry<geometry){geometry=candidateGeometry;render=pixels;frameOffset=offset;}}
      let diff=0;for(let i=0;i<preview.length;i++)diff+=Math.abs(preview[i]-render[i]);diff/=preview.length;differences.push({time,meanAbsoluteDifference:diff,edgeMismatch:geometry,frameOffset,colorMatch:diff<13});assert.ok(geometry<.15,`preview/render geometry mismatch beyond one frame at ${time}: ${geometry}`);
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
  await test('fractional caption end uses integer frame bounds without floating-point false positives',async()=>{
    const changed=html.replace('</div><script src="assets/gsap.min.js">','<div id="caption-fractional" class="clip caption top" data-start="1" data-duration="1.4333333333333333"><span class="caption-content">边界</span></div></div><script src="assets/gsap.min.js">').replace("window.__timelines['edit-root']=tl;","tl.set('#caption-fractional .caption-content',{opacity:1},1);tl.set('#caption-fractional .caption-content',{opacity:0},73/30);window.__timelines['edit-root']=tl;");
    assert(changed.includes('id="caption-fractional"'));const checked=await checkPreviewRuntime(dir,{timeline,html:changed,sampleTimes:[29/30,30/30,72/30,73/30]});assert.deepEqual(checked.samples.map(s=>s.captions.find(c=>c.id==='caption-fractional').visible),[false,true,true,false]);
  });
  await test('cancel during browser wait closes page and next request recovers',async()=>{
    const controller=new AbortController(),missingRuntime=html.replace('<script src="assets/runtime.js"></script>','');const promise=checkPreviewRuntime(dir,{timeline,html:missingRuntime,signal:controller.signal,sampleTimes:[0]});setTimeout(()=>controller.abort(),100);await assert.rejects(promise,/取消/);const recovered=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0,3]});assert.equal(recovered.success,true);
  });
  await test('idle timeout and explicit shutdown allow a fresh browser',async()=>{
    process.env.EDIT_PREVIEW_IDLE_MS='1000';await checkPreviewRuntime(dir,{timeline,sampleTimes:[0]});await new Promise(resolve=>setTimeout(resolve,1400));const fresh=await checkPreviewRuntime(dir,{timeline,sampleTimes:[0]});assert.equal(fresh.browserReused,false);await closePreviewChecks();
  });
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({status:'passed',tests:results,cold,warm,reference:source},null,2));console.log('Runtime preview acceptance:',out);
}finally{await closePreviewChecks();}
