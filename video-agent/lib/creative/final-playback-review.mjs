import fs from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,run,probe,hashFile} from '../edit/media.mjs';
import {insist} from './contracts.mjs';

export function reviewWindows(document) {
  const fps=document.fps||30,duration=document.durationFrames/fps;
  insist(Number.isFinite(duration)&&duration>0,'最终审阅缺少有效时长','FINAL_REVIEW_DURATION');
  const boundaries=[0,...(document.scenes||[]).slice(1).map(s=>s.startFrame/fps),duration];
  insist(boundaries.length<=64,'最终审阅切点超过预算','FINAL_REVIEW_BUDGET');
  return [...new Set(boundaries)].map((at,index)=>({id:'cut-'+String(index).padStart(2,'0'),at,
    start:Math.max(0,at-1.5),end:Math.min(duration,at+1.5),kind:at===0?'opening':at===duration?'ending':'cut'})).filter(r=>r.end>r.start);
}

// Actual moving and audible evidence is made available for human review.
// Generating these files never sets a perception dimension to pass.
export async function prepareFinalPlaybackReview(directory,document,{signal}={}) {
  const source=path.join(directory,'commerce-final.mp4'),sha256=await hashFile(source),metadata=await probe(source,signal);
  const folder=path.join(directory,'final-review');await fs.mkdir(folder,{recursive:true});
  const windows=reviewWindows(document),clips=[];
  for(const window of windows){
    const file=window.id+'.mp4';
    await run(ffmpeg,['-y','-v','error','-ss',String(window.start),'-i',source,'-t',String(window.end-window.start),'-map','0:v:0','-map','0:a:0?','-vf','scale=960:960:force_original_aspect_ratio=decrease','-c:v','libx264','-preset','ultrafast','-crf','25','-c:a','aac','-pix_fmt','yuv420p',path.join(folder,file)],{signal,timeout:60000});
    clips.push({...window,file,sha256:await hashFile(path.join(folder,file)),metadata:await probe(path.join(folder,file),signal)});
  }
  const manifest={version:1,revisionId:document.revisionId,finalVideoSha256:sha256,fullVideo:'../commerce-final.mp4',metadata,clips,
    fullVideoObserved:false,audioPerceptionVerified:false,status:'awaiting_review',
    reviewTasks:['完整观看全片并试听','回看每个切点与字幕切换','核对商品、动作、声音与合同','记录缺陷时间和当前版本']};
  await fs.writeFile(path.join(folder,'playback-manifest.json'),JSON.stringify(manifest,null,2));
  // All interpolated values are generated numeric times or bounded filenames.
  const html='<!doctype html><meta charset="utf-8"><title>成片连续审阅</title><style>body{max-width:1000px;margin:24px auto;padding:0 20px;font:16px system-ui;background:#151515;color:#eee}video{width:100%;max-height:70vh}section{margin:32px 0}a{color:#9bd7ff}</style><h1>成片连续审阅 · 待确认</h1><p>请先完整观看并试听，再回看切点。生成审阅文件不代表画面、动作或声音已通过。</p><video controls preload="metadata" src="../commerce-final.mp4"></video>'+clips.map(c=>`<section><h2>${c.kind} · ${c.start.toFixed(2)}–${c.end.toFixed(2)} 秒</h2><video controls preload="none" src="${c.file}"></video></section>`).join('');
  await fs.writeFile(path.join(folder,'watch.html'),html);
  return manifest;
}
