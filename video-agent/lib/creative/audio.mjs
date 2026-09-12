import fs from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,run,linkOrCopy,hashFile} from '../edit/media.mjs';
import {cachedFile,cacheKey} from '../edit/media-cache.mjs';

// Keep source references in document.json; derived stems are compiler outputs.
// Both the preview and the exported composition use these same samples.
export async function prepareNativeAudio(directory,document,assets,{signal}={}){
  const refs={},evidence=[];
  for(const track of document.audioGraph||[]){
    const asset=assets.find(a=>a.id===track.assetId),source=path.join(directory,asset.compiledRef||asset.ref),rate=track.playbackRate??1,len=track.durationFrames/30;
    if(rate===1&&!track.fadeInFrames&&!track.fadeOutFrames&&!track.ducking?.length)continue;
    const filters=[`atrim=start=${track.sourceStartSeconds??0}:duration=${len*rate}`,'asetpts=PTS-STARTPTS'];
    let tempo=rate;while(tempo>2){filters.push('atempo=2');tempo/=2;}while(tempo<.5){filters.push('atempo=0.5');tempo/=.5;}if(tempo!==1)filters.push(`atempo=${tempo}`);
    filters.push('apad',`atrim=duration=${len}`);
    if(track.fadeInFrames)filters.push(`afade=t=in:d=${track.fadeInFrames/30}`);
    if(track.fadeOutFrames)filters.push(`afade=t=out:st=${len-track.fadeOutFrames/30}:d=${track.fadeOutFrames/30}`);
    // The persisted duck windows are explicit project frames, not guessed beats.
    for(const span of track.ducking||[]){const start=Math.max(0,(span.startFrame-track.startFrame)/30),end=Math.min(len,(span.endFrame-track.startFrame)/30);if(end>start)filters.push(`volume='if(between(t,${start},${end}),${span.gain},1)':eval=frame`);}
    const key=cacheKey(['native-audio-v1',asset.sha256||await hashFile(source),filters]),ref='assets/audio-'+key+'.wav';
    const cached=await cachedFile('native-audio',key,'.wav',file=>run(ffmpeg,['-y','-v','error','-i',source,'-vn','-af',filters.join(','),'-ar','48000','-ac','2','-c:a','pcm_s16le',file],{signal,timeout:Math.max(120000,len*1500)}));
    await linkOrCopy(cached.file,path.join(directory,ref));refs[track.id]=ref;evidence.push({trackId:track.id,sourceAssetId:asset.id,ref,cacheHit:cached.hit,filters,sha256:await hashFile(path.join(directory,ref))});
  }
  await fs.writeFile(path.join(directory,'audio-processing.json'),JSON.stringify(evidence,null,2));return refs;
}
