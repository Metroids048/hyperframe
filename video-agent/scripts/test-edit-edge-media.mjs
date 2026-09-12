import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,prepareAsset,composeRevision,checkRevision,renderRevision,probe} from '../lib/edit/media.mjs';
import {initialTimeline,applyOperations,uid} from '../lib/edit/timeline.mjs';
const out=path.join(ROOT,'outputs/edit-edge-acceptance');await fs.mkdir(out,{recursive:true});let passed=[];
async function test(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function setup(name){const dir=path.join(out,name);await fs.mkdir(dir,{recursive:true});return dir;}
await test('无声竖屏视频实际检查与导出，不强制伪造音轨',async()=>{
 const dir=await setup('silent');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=360x640:rate=30:duration=3','-an','-c:v','libx264','-preset','ultrafast',path.join(dir,'original.mp4')]);
 const a={id:uid(),name:'无声竖屏',original:'original.mp4'};await prepareAsset(dir,a);assert.equal(a.hasAudio,false);assert.equal(a.width,360);assert.equal(a.height,640);
 const t=applyOperations(initialTimeline(a),[{type:'caption_add',start:0,end:60,text:'这是一段用于验证自动换行和安全边距的中文长字幕。画面应完整显示，文字不应被截断。'}],{[a.id]:a});const rev=await setup('silent-revision');await composeRevision(rev,t,{[a.id]:a},()=>dir);await checkRevision(rev);const m=await renderRevision(rev,t);assert.equal(m.hasAudio,false);assert.equal(m.height,640);
});
await test('手机旋转标记正确转换为竖屏工作副本',async()=>{
 const dir=await setup('rotated');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=2','-c:v','libx264','-preset','ultrafast',path.join(dir,'base.mp4')]);await run(ffmpeg,['-y','-v','error','-i',path.join(dir,'base.mp4'),'-c','copy','-metadata:s:v:0','rotate=90',path.join(dir,'original.mp4')]);
 const a={id:uid(),name:'旋转手机视频',original:'original.mp4'};await prepareAsset(dir,a);assert.equal(a.width,360);assert.equal(a.height,640);const m=await probe(path.join(dir,a.work));assert.equal(m.rotation,0);
});
await test('可变帧率转为 30 fps，媒体时长保持一致',async()=>{
 const dir=await setup('vfr');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=30:duration=4','-vf',"select='if(lt(t,2),not(mod(n,2)),1)'",'-vsync','vfr','-c:v','libx264','-preset','ultrafast',path.join(dir,'original.mp4')]);const a={id:uid(),name:'可变帧率',original:'original.mp4'};await prepareAsset(dir,a);const m=await probe(path.join(dir,a.work));assert.equal(m.sourceFps,'30/1');assert(Math.abs(m.duration-4)<0.1);
});
await test('损坏媒体拒绝，不进入渲染',async()=>{const dir=await setup('broken');await fs.writeFile(path.join(dir,'original.mp4'),'not a movie');await assert.rejects(()=>prepareAsset(dir,{id:uid(),original:'original.mp4'}),/无法读取/);});
await test('取消会终止处理进程并返回可解释错误',async()=>{const c=new AbortController();const job=run(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:c.signal});setTimeout(()=>c.abort(),100);await assert.rejects(()=>job,/取消/);});
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed},null,2));
