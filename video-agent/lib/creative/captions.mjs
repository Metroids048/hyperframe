import path from 'node:path';
import fs from 'node:fs/promises';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {insist,stableId} from './contracts.mjs';
import {hashFile} from '../edit/media.mjs';
import {groupCaptionWords} from '../edit/caption-segmentation.mjs';

// A saved synthesis script is authoritative copy. In the unambiguous
// equal-length Chinese substitution case, keep measured ASR word boundaries
// and correct orthography; never distribute invented timestamps or silently
// force an insertion/deletion alignment.
export function scriptAlignedWords(transcript,script){
  const words=transcript.words||[];
  if(transcript.language!=='zh'||!script)return words;
  const units=[...script].filter(c=>/[\p{L}\p{N}]/u.test(c));
  const recognized=words.flatMap(w=>[...w.text].filter(c=>/[\p{L}\p{N}]/u.test(c)));
  if(!units.length||units.length!==recognized.length||units.filter((c,i)=>c===recognized[i]).length/units.length<.5)return words;
  const sentenceEnds=new Set();let position=0;
  for(const character of script){if(/[\p{L}\p{N}]/u.test(character))position++;else if(/[。！？.!?]/.test(character))sentenceEnds.add(position);}
  let index=0;
  return words.map(w=>{const count=[...w.text].filter(c=>/[\p{L}\p{N}]/u.test(c)).length;const text=units.slice(index,index+count).join('');index+=count;return {...w,text:text||w.text,scriptCorrected:true,...(sentenceEnds.has(index)?{sentenceEnd:true}:{})};});
}

// Display copy belongs to native text nodes. Only a speech workflow may run ASR.
export function needsSpeechCaptions(brief){
  return Boolean(brief.needsCaptions&&(brief.needsTranscription||brief.needsNarration));
}

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

export function mergeRecognizedCaptions(document,recognized,{assetId,trackId}={}){
  const targets=(document.audioGraph||[]).filter(track=>track.volume>0&&track.role!=='music'&&(!assetId||track.assetId===assetId)&&(!trackId||track.id===trackId));
  const keys=new Set(targets.map(track=>JSON.stringify([track.assetId,track.captionSourceId||track.id])));
  const preserved=(document.captions||[]).filter(cue=>!keys.has(JSON.stringify([cue.assetId,cue.trackId])));
  for(const prior of document.captions||[])if(prior.corrected&&keys.has(JSON.stringify([prior.assetId,prior.trackId]))){
    insist(recognized.some(c=>c.assetId===prior.assetId&&c.trackId===prior.trackId&&Math.abs(c.sourceStartSeconds-prior.sourceStartSeconds)<1/30&&Math.abs(c.sourceEndSeconds-prior.sourceEndSeconds)<1/30),'新的字幕分组与已校对文字时间不对应；保留当前版本，请明确是否重新生成该句字幕','CAPTION_ALIGNMENT_REQUIRED');
  }
  const reconciled=recognized.map(cue=>{
    const prior=(document.captions||[]).filter(c=>c.assetId===cue.assetId&&c.trackId===cue.trackId);
    const exact=prior.find(c=>Math.abs(c.sourceStartSeconds-cue.sourceStartSeconds)<1/30&&Math.abs(c.sourceEndSeconds-cue.sourceEndSeconds)<1/30);
    const styles=[...new Set(prior.map(c=>JSON.stringify(c.style||{})))];
    return {...cue,...(exact?{id:exact.id,style:exact.style||{},...(exact.corrected&&!cue.translated?{text:exact.text,corrected:true,reviewRequired:false}:{})}:styles.length===1?{style:JSON.parse(styles[0])}:{})};
  });
  return [...preserved,...reconciled];
}

export async function recognizeNativeCaptions(document,assets,directory,{assetId,trackId,signal,provider,language='source'}={}){
  const own=!provider;provider??=new CodexProvider();const captions=[],records=[];
  try{
    const tracks=(document.audioGraph||[]).filter(a=>a.volume>0&&a.role!=='music'&&(!assetId||a.assetId===assetId)&&(!trackId||a.id===trackId));
    insist(tracks.length,'当前作品没有可识别的人声音轨','NO_CAPTION_AUDIO');
    const transcripts=new Map();
    for(const track of tracks){
      const asset=assets.find(a=>a.id===track.assetId);let transcript=transcripts.get(asset.id);
      if(!transcript){const source=path.join(directory,asset.compiledRef||asset.ref),bound=asset.providerTranscript;
        if(bound){insist(bound.sourceSha256===await hashFile(source),'字幕对应的音频内容已变化，需要重新识别','CAPTION_SOURCE_CHANGED');transcript=bound;}
        else transcript=await provider.transcribe(source,signal);
        transcripts.set(asset.id,transcript);records.push({assetId:asset.id,sourceSha256:asset.sha256,transcript});}
      const words=scriptAlignedWords(transcript,asset.speechRequest?.text);insist(words.length,'没有识别到可用台词；原音频和上一有效版本保留','NO_SPEECH');
      const root=track.captionSourceId||track.id,source=track.sourceStartSeconds||0,end=source+track.durationFrames/30*(track.playbackRate??1),selected=words.filter(w=>(w.start+w.end)/2>=source&&(w.start+w.end)/2<end);
      for(const group of groupCaptionWords(selected,{language:transcript.language})){
        const text=group.map(w=>w.text).join(transcript.language==='zh'?'':' ').trim(),first=group[0].start,last=group.at(-1).end;
        captions.push({id:stableId('cue',asset.id,root,first,last),assetId:asset.id,trackId:root,anchor:'source-content',sourceStartSeconds:first,sourceEndSeconds:last,text,reviewRequired:true,source:transcript.source||'local-asr'});
      }
    }
    insist(captions.length,'选用片段没有可识别的台词','NO_SPEECH');
    const unique=[...new Map(captions.map(c=>[c.id,c])).values()];
    if(language!=='source'&&records.some(r=>r.transcript.language!==language)){
      const translated=await provider.translateCaptions(unique,language,signal);
      insist(translated.captions?.length===unique.length,'字幕翻译不完整','CAPTION_TRANSLATION_FAILED');
      for(const cue of unique){const value=translated.captions.find(c=>c.id===cue.id);insist(value?.text,'字幕翻译缺失目标','CAPTION_TRANSLATION_FAILED');cue.text=value.text;cue.translated=true;cue.language=language;}
    }
    await fs.writeFile(path.join(directory,'caption-recognition.json'),JSON.stringify({records,captionCount:unique.length,humanReview:'PENDING'},null,2));return unique;
  }finally{if(own)await provider.close();}
}
