import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ffmpeg,run,hashFile,probe} from '../edit/media.mjs';
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

async function inspectionSources(directory,assets,ranges,signal){
  const sources=[];
  for(const id of new Set(ranges.map(r=>r.assetId))){
    const asset=assets.find(a=>a.id===id),compiledSha256=await hashFile(path.join(directory,asset.compiledRef));
    const expected=asset.processing?.at(-1)?.outputSha256||asset.sha256;
    insist(expected===compiledSha256,'观察源文件与当前素材版本不一致','CHECKPOINT_HASH');
    let video;
    await probe(path.join(directory,asset.compiledRef),signal,{onResult:record=>{video=record.result.streams.find(s=>s.codec_type==='video');}});
    const videoEndSeconds=Number(video?.duration)>0?Number(video.start_time||0)+Number(video.duration):null;
    sources.push({assetId:id,sourceSha256:asset.sha256,compiledSha256,videoEndSeconds});
  }
  return sources;
}

/** Finite, time-labelled 4 Hz observations and a playable proxy; no claim of model video playback. */
export async function inspectActionRanges(directory,assets,ranges,{signal}={}){
  validateActionRanges(ranges,assets);
  const sources=await inspectionSources(directory,assets,ranges,signal);
  const key=resourceHash({ranges,sources,version:3,sampleFps:4,audio:'source'}).slice(0,16),records=[],clips=[];
  await fs.mkdir(path.join(directory,'evidence'),{recursive:true});
  for(const [i,r]of ranges.entries()){
    const asset=assets.find(a=>a.id===r.assetId),source=path.join(directory,asset.compiledRef),visualEnd=Math.min(r.endSeconds,sources.find(s=>s.assetId===r.assetId).videoEndSeconds??r.endSeconds),duration=visualEnd-r.startSeconds;
    insist(duration>0,'此区间只有音轨尾部，没有可观察的视频帧','OBSERVATION_TIMESTAMP');
    const prefix=`action-${key}-${i}-`,pattern=path.join(directory,'evidence',prefix+'%03d.jpg');
    // The process runner retains only a diagnostic tail; timestamps require the full bounded stream.
    let log="";
    await run(ffmpeg,['-y','-v','info','-ss',String(r.startSeconds),'-i',source,'-t',String(duration),'-vf',"select='isnan(prev_selected_t)+gte(t-prev_selected_t,0.25)',showinfo,scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2",'-vsync','0','-frames:v','48','-q:v','3',pattern],{signal,timeout:60000,onOutput:chunk=>{log+=chunk;}});
    const sampledTimes=[...log.matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.]+)/g)].map(m=>r.startSeconds+Number(m[1])).filter(t=>t<r.endSeconds);
    const names=(await fs.readdir(path.join(directory,'evidence'))).filter(n=>n.startsWith(prefix)&&n.endsWith('.jpg')).sort();
    insist(names.length>0,'动作观察没有实际解码帧','OBSERVATION_TIMESTAMP');
    insist(names.length<=48,'动作观察帧数量超出预算','OBSERVATION_BUDGET');
    for(let offset=0;offset<names.length;offset+=16){
      const selected=names.slice(offset,offset+16),cells=[],times=[];
      for(const [j,name]of selected.entries()){
        const time=sampledTimes[offset+j];insist(Number.isFinite(time),'缺少实际解码帧时间戳','OBSERVATION_TIMESTAMP');times.push(time);
        const label=Buffer.from(`<svg width="320" height="26"><rect width="320" height="26" fill="#111111"/><text x="8" y="19" fill="#ffffff" font-size="16">source ${time.toFixed(3)}s</text></svg>`);
        const input=await sharp(path.join(directory,'evidence',name)).extend({bottom:26,background:'#111'}).composite([{input:label,left:0,top:180}]).jpeg().toBuffer();
        cells.push({input,left:j%4*320,top:Math.floor(j/4)*206});
      }
      const bytes=await sharp({create:{width:1280,height:Math.ceil(selected.length/4)*206,channels:3,background:'#111'}}).composite(cells).jpeg({quality:90}).toBuffer(),file=`evidence/action-contact-${key}-${i}-${offset}.jpg`;
      await fs.writeFile(path.join(directory,file),bytes);records.push({...r,endSeconds:visualEnd,requestedEndSeconds:r.endSeconds,file,times,sha256:resourceHash(bytes),sourceSha256:asset.sha256});
    }
    const file=`evidence/action-clip-${key}-${i}.mp4`;
    await run(ffmpeg,['-y','-v','error','-ss',String(r.startSeconds),'-i',source,'-t',String(duration),'-map','0:v:0','-map','0:a:0?','-vf','scale=960:-2','-c:v','libx264','-preset','ultrafast','-crf','26','-c:a','aac','-pix_fmt','yuv420p',path.join(directory,file)],{signal,timeout:60000});
    const proxy=await probe(path.join(directory,file),signal);
    clips.push({...r,endSeconds:visualEnd,requestedEndSeconds:r.endSeconds,file,sha256:resourceHash(await fs.readFile(path.join(directory,file))),sourceSha256:asset.sha256,audio:proxy.hasAudio,perceptionVerified:false,purpose:'continuous source playback reference with available original audio'});
  }
  return {tool:'assets.inspect_actions',key,sources,records,clips,sampling:'up to 4 Hz; labels use actual decoded showinfo timestamps plus the source in-point',motionPlayback:'playable source proxies created; model receives ordered stills, not continuous video',precisionLimitSeconds:0.25};
}

/** Bounded source observation. Each contact sheet has nine timestamped real frames. */
export async function inspectSourceRanges(directory,assets,ranges,{signal}={}){
  validateInspectionRanges(ranges,assets);const sources=await inspectionSources(directory,assets,ranges,signal);
  const key=resourceHash({ranges,sources,version:4,boundaries:'actual-video-stream-end'}).slice(0,16),records=[];
  await fs.mkdir(path.join(directory,'evidence'),{recursive:true});
  for(const [i,r] of ranges.entries()){
    const asset=assets.find(a=>a.id===r.assetId),visualEnd=Math.min(r.endSeconds,sources.find(s=>s.assetId===r.assetId).videoEndSeconds??r.endSeconds);
    insist(visualEnd>r.startSeconds,'此区间只有音轨尾部，没有可观察的视频帧','OBSERVATION_TIMESTAMP');
    const duration=visualEnd-r.startSeconds,count=Math.max(2,Math.ceil(duration)+1),last=Math.max(r.startSeconds,visualEnd-1/30),times=Array.from({length:count},(_,j)=>r.startSeconds+j*(last-r.startSeconds)/(count-1));
    for(let offset=0;offset<times.length;offset+=9){
      const sample=times.slice(offset,offset+9),cells=[],decodedTimes=[];
      for(const [j,time] of sample.entries()){
        signal?.throwIfAborted();const file=`evidence/inspection-${key}-${i}-${offset+j}.jpg`;
        let log='';await run(ffmpeg,['-y','-v','info','-ss',String(time),'-i',path.join(directory,asset.compiledRef),'-frames:v','1','-vf','showinfo,scale=400:225:force_original_aspect_ratio=decrease,format=rgb24,pad=400:225:(ow-iw)/2:(oh-ih)/2',path.join(directory,file)],{signal,timeout:30000,onOutput:chunk=>{log+=chunk;}});
        const match=log.match(/\bn:\s*0\s+pts:\s*-?\d+\s+pts_time:([\d.]+)/);insist(match,'补充观察缺少实际解码时间','OBSERVATION_TIMESTAMP');
        const actual=time+Number(match[1]);insist(actual<visualEnd+1e-6,'观察帧超出候选区间','OBSERVATION_TIMESTAMP');decodedTimes.push(actual);
        const label=Buffer.from(`<svg width="400" height="26"><rect width="400" height="26" fill="#111111"/><text x="8" y="19" fill="#ffffff" font-size="16">source ${actual.toFixed(3)}s</text></svg>`);
        const input=await sharp(path.join(directory,file)).extend({bottom:26,background:'#111'}).composite([{input:label,left:0,top:225}]).jpeg().toBuffer();
        cells.push({input,left:j%3*400,top:Math.floor(j/3)*251});
      }
      const bytes=await sharp({create:{width:1200,height:Math.ceil(sample.length/3)*251,channels:3,background:'#111'}}).composite(cells).jpeg({quality:88}).toBuffer(),file=`evidence/inspection-contact-${key}-${i}-${offset}.jpg`;
      await fs.writeFile(path.join(directory,file),bytes);records.push({...r,endSeconds:visualEnd,requestedEndSeconds:r.endSeconds,file,times:decodedTimes,requestedTimes:sample,sha256:resourceHash(bytes),sourceSha256:asset.sha256});
    }
  }
  return {tool:'assets.inspect_ranges',key,sources,records,sampling:'approximately 1 Hz including first and last source frames; labels use decoded timestamps; not continuous action validation',motionPlayback:'not performed'};
}

/** Exact candidate cuts are deterministic validation, not another semantic search. */
export async function inspectSourceBoundaries(directory,assets,ranges,{signal}={}){
  insist(ranges.length<=48,'候选边界数量超限','OBSERVATION_BUDGET');
  for(const r of ranges){const asset=assets.find(a=>a.id===r.assetId);
    insist(asset?.kind==='video'&&Number.isFinite(r.startSeconds)&&Number.isFinite(r.endSeconds)&&r.startSeconds>=0&&r.endSeconds>r.startSeconds&&r.endSeconds<=asset.mediaMetadata.duration,'候选切点越界','INVALID_SOURCE_RANGE');
  }
  const windows=[],sourceBounds=await inspectionSources(directory,assets,ranges,signal);
  for(const r of ranges){
    const endSeconds=Math.min(r.endSeconds,sourceBounds.find(s=>s.assetId===r.assetId).videoEndSeconds??r.endSeconds);
    insist(endSeconds>r.startSeconds,'候选区间没有实际视频帧','OBSERVATION_TIMESTAMP');
    windows.push({...r,endSeconds:Math.min(endSeconds,r.startSeconds+.05),reason:'deterministic first-frame validation'},
      {...r,endSeconds,startSeconds:Math.max(r.startSeconds,endSeconds-.05),reason:'deterministic last-frame validation'});
  }
  const batches=[];for(let i=0;i<windows.length;i+=3)batches.push(await inspectSourceRanges(directory,assets,windows.slice(i,i+3),{signal}));
  return {tool:'assets.inspect_boundaries',key:resourceHash(batches.map(b=>b.key)),ranges,sources:[...new Map(batches.flatMap(b=>b.sources).map(s=>[s.assetId,s])).values()],records:batches.flatMap(b=>b.records),sampling:'first and last decoded frames only; interior and continuous motion remain unverified',motionPlayback:'not performed'};
}
