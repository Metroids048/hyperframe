import path from 'node:path';
import fs from 'node:fs/promises';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {insist,stableId} from './contracts.mjs';

export function projectNativeCaptions(document){
  const result=[];
  for(const cue of document.captions||[])for(const track of document.audioGraph||[]){
    if(track.assetId!==cue.assetId||(track.captionSourceId||track.id)!==cue.trackId)continue;
    const rate=track.playbackRate??1,source=track.sourceStartSeconds||0,start=Math.max(source,cue.sourceStartSeconds),end=Math.min(source+track.durationFrames/30*rate,cue.sourceEndSeconds);
    if(end<=start)continue;
    const first=track.startFrame+Math.round((start-source)/rate*30),last=Math.min(track.startFrame+track.durationFrames,track.startFrame+Math.round((end-source)/rate*30));
    if(last>first)result.push({...cue,projectionId:stableId('caption',cue.id,track.id),startFrame:first,durationFrames:last-first});
  }
  return result.sort((a,b)=>a.startFrame-b.startFrame);
}

export async function recognizeNativeCaptions(document,assets,directory,{assetId,trackId,signal,provider}={}){
  const own=!provider;provider??=new CodexProvider();const captions=[],records=[];
  try{
    const tracks=(document.audioGraph||[]).filter(a=>a.volume>0&&a.role!=='music'&&(!assetId||a.assetId===assetId)&&(!trackId||a.id===trackId));
    insist(tracks.length,'当前作品没有可识别的人声音轨','NO_CAPTION_AUDIO');
    const transcripts=new Map();
    for(const track of tracks){
      const asset=assets.find(a=>a.id===track.assetId);let transcript=transcripts.get(asset.id);
      if(!transcript){transcript=await provider.transcribe(path.join(directory,asset.compiledRef||asset.ref),signal);transcripts.set(asset.id,transcript);records.push({assetId:asset.id,sourceSha256:asset.sha256,transcript});}
      const words=transcript.words||[];insist(words.length,'没有识别到可用台词；原音频和上一有效版本保留','NO_SPEECH');
      const root=track.captionSourceId||track.id,source=track.sourceStartSeconds||0,end=source+track.durationFrames/30*(track.playbackRate??1),selected=words.filter(w=>w.end>source&&w.start<end);
      let group=[];
      const flush=()=>{if(!group.length)return;const text=group.map(w=>w.text).join(transcript.language==='zh'?'':' ').trim(),first=group[0].start,last=group.at(-1).end;captions.push({id:stableId('cue',asset.id,root,first,last),assetId:asset.id,trackId:root,anchor:'source-content',sourceStartSeconds:first,sourceEndSeconds:last,text,reviewRequired:true,source:'local-asr'});group=[];};
      for(const word of selected){if(group.length&&(word.start-group.at(-1).end>.6||word.end-group[0].start>3||[...group.map(w=>w.text).join('')+word.text].length>20))flush();group.push(word);if(/[。！？.!?]$/.test(word.text))flush();}flush();
    }
    insist(captions.length,'选用片段没有可识别的台词','NO_SPEECH');
    const unique=[...new Map(captions.map(c=>[c.id,c])).values()];
    await fs.writeFile(path.join(directory,'caption-recognition.json'),JSON.stringify({records,captionCount:unique.length,humanReview:'PENDING'},null,2));return unique;
  }finally{if(own)await provider.close();}
}
