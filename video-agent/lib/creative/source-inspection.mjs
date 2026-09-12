import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ffmpeg,run} from '../edit/media.mjs';
import {insist} from './contracts.mjs';
import {resourceHash} from './capabilities.mjs';

export function validateInspectionRanges(ranges,assets){
  insist(Array.isArray(ranges)&&ranges.length>0&&ranges.length<=3,'每次补充观察最多3段','OBSERVATION_BUDGET');
  for(const r of ranges){const a=assets.find(a=>a.id===r.assetId);insist(a?.kind==='video'&&Number.isFinite(r.startSeconds)&&Number.isFinite(r.endSeconds)&&r.startSeconds>=0&&r.endSeconds>r.startSeconds&&r.endSeconds-r.startSeconds<=30&&r.endSeconds<=a.mediaMetadata.duration,'补充观察必须使用已有视频的有效区间，每段最多30秒','INVALID_SOURCE_RANGE');}
  return ranges;
}

export function validateActionRanges(ranges,assets){
  validateInspectionRanges(ranges,assets);
  insist(ranges.every(r=>r.endSeconds-r.startSeconds<=12),'动作边界检查每段最多12秒','OBSERVATION_BUDGET');
  return ranges;
}

/** Finite, time-labelled 4 Hz observations and a playable proxy; no claim of model video playback. */
export async function inspectActionRanges(directory,assets,ranges,{signal}={}){
  validateActionRanges(ranges,assets);
  const key=resourceHash({ranges,version:1,sampleFps:4}).slice(0,16),records=[],clips=[];
  await fs.mkdir(path.join(directory,'evidence'),{recursive:true});
  for(const [i,r]of ranges.entries()){
    const asset=assets.find(a=>a.id===r.assetId),source=path.join(directory,asset.compiledRef),duration=r.endSeconds-r.startSeconds;
    const prefix=`action-${key}-${i}-`,pattern=path.join(directory,'evidence',prefix+'%03d.jpg');
    const log=await run(ffmpeg,['-y','-v','info','-ss',String(r.startSeconds),'-i',source,'-t',String(duration),'-vf',"select='isnan(prev_selected_t)+gte(t-prev_selected_t,0.25)',showinfo,scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2",'-vsync','vfr','-q:v','3',pattern],{signal,timeout:60000});
    const sampledTimes=[...log.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.]+)/g)].map(m=>r.startSeconds+Number(m[1])).filter(t=>t<r.endSeconds);
    const names=(await fs.readdir(path.join(directory,'evidence'))).filter(n=>n.startsWith(prefix)&&n.endsWith('.jpg')).sort();
    insist(names.length>0&&names.length<=48,'动作观察帧数量超出预算','OBSERVATION_BUDGET');
    for(let offset=0;offset<names.length;offset+=16){
      const selected=names.slice(offset,offset+16),cells=[],times=[];
      for(const [j,name]of selected.entries()){
        const time=sampledTimes[offset+j];insist(Number.isFinite(time),'缺少实际解码帧时间戳','OBSERVATION_TIMESTAMP');times.push(time);
        const label=Buffer.from(`<svg width="320" height="26"><rect width="320" height="26" fill="#111111"/><text x="8" y="19" fill="#ffffff" font-size="16">source ${time.toFixed(3)}s</text></svg>`);
        const input=await sharp(path.join(directory,'evidence',name)).extend({bottom:26,background:'#111'}).composite([{input:label,left:0,top:180}]).jpeg().toBuffer();
        cells.push({input,left:j%4*320,top:Math.floor(j/4)*206});
      }
      const bytes=await sharp({create:{width:1280,height:Math.ceil(selected.length/4)*206,channels:3,background:'#111'}}).composite(cells).jpeg({quality:90}).toBuffer(),file=`evidence/action-contact-${key}-${i}-${offset}.jpg`;
      await fs.writeFile(path.join(directory,file),bytes);records.push({...r,file,times,sha256:resourceHash(bytes),sourceSha256:asset.sha256});
    }
    const file=`evidence/action-clip-${key}-${i}.mp4`;
    await run(ffmpeg,['-y','-v','error','-ss',String(r.startSeconds),'-i',source,'-t',String(duration),'-an','-vf','scale=960:-2','-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p',path.join(directory,file)],{signal,timeout:60000});
    clips.push({...r,file,sha256:resourceHash(await fs.readFile(path.join(directory,file))),sourceSha256:asset.sha256,audio:false,purpose:'continuous visual playback reference'});
  }
  return {tool:'assets.inspect_actions',key,records,clips,sampling:'up to 4 Hz; labels use actual decoded showinfo timestamps plus the source in-point',motionPlayback:'playable source proxies created; model receives ordered stills, not continuous video',precisionLimitSeconds:0.25};
}

/** Bounded source observation. Each contact sheet has nine timestamped real frames. */
export async function inspectSourceRanges(directory,assets,ranges,{signal}={}){
  validateInspectionRanges(ranges,assets);const key=resourceHash(ranges).slice(0,16),records=[];
  await fs.mkdir(path.join(directory,'evidence'),{recursive:true});
  for(const [i,r] of ranges.entries()){
    const asset=assets.find(a=>a.id===r.assetId),count=Math.ceil(r.endSeconds-r.startSeconds),times=Array.from({length:count},(_,j)=>r.startSeconds+(j+.5)*(r.endSeconds-r.startSeconds)/count);
    for(let offset=0;offset<times.length;offset+=9){
      const sample=times.slice(offset,offset+9),cells=[];
      for(const [j,time] of sample.entries()){
        signal?.throwIfAborted();const file=`evidence/inspection-${key}-${i}-${offset+j}.jpg`;
        await run(ffmpeg,['-y','-v','error','-ss',String(time),'-i',path.join(directory,asset.compiledRef),'-frames:v','1','-vf','scale=400:225:force_original_aspect_ratio=decrease,format=rgb24,pad=400:225:(ow-iw)/2:(oh-ih)/2',path.join(directory,file)],{signal,timeout:30000});
        cells.push({input:await fs.readFile(path.join(directory,file)),left:j%3*400,top:Math.floor(j/3)*225});
      }
      const bytes=await sharp({create:{width:1200,height:Math.ceil(sample.length/3)*225,channels:3,background:'#111'}}).composite(cells).jpeg({quality:88}).toBuffer(),file=`evidence/inspection-contact-${key}-${i}-${offset}.jpg`;
      await fs.writeFile(path.join(directory,file),bytes);records.push({...r,file,times:sample,sha256:resourceHash(bytes),sourceSha256:asset.sha256});
    }
  }
  return {tool:'assets.inspect_ranges',key,records,sampling:'approximately 1 Hz; not frame-accurate action boundary validation',motionPlayback:'not performed'};
}
