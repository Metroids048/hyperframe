import {FPS,insist} from './contracts.mjs';

// A split narration is complete only when the actual source intervals form one
// ordered, audible pass. A promise in a storyboard summary is not a schedule.
export function assertCompleteNarration(document,assets){
  for(const asset of assets.filter(a=>a.generatedVoice)){
    const tracks=(document.audioGraph||[]).filter(t=>t.assetId===asset.id).sort((a,b)=>a.startFrame-b.startFrame);
    let sourceCursor=0,targetCursor=0;
    insist(tracks.length,'已生成声音没有绑定到实际音轨','VOICE_DURATION_CONFLICT');
    for(const track of tracks){
      const rate=track.playbackRate??1,start=track.sourceStartSeconds||0;
      insist(track.volume>0&&rate===1&&track.startFrame>=targetCursor&&
        Math.abs(start-sourceCursor)<=1/FPS&&track.durationFrames>0&&
        track.startFrame+track.durationFrames<=document.durationFrames,
      '旁白分段必须按源顺序完整保留，不静音、重复、交叠或越过成片','VOICE_DURATION_CONFLICT');
      sourceCursor=start+track.durationFrames/FPS;targetCursor=track.startFrame+track.durationFrames;
    }
    insist(Math.abs(sourceCursor-asset.mediaMetadata.duration)<=1/FPS,
      '旁白分段遗漏结尾或超出真实音频','VOICE_DURATION_CONFLICT');
  }
}

// Provider sentence chunks cannot serve as word-level evidence for per-object cuts.
export function needsNarrationAlignment(transcript){
 const words=transcript?.words||[];
 return !words.length||words.some(w=>['sentence','segment','coarse'].includes(w.granularity)||w.end-w.start>3||[...String(w.text||'')].filter(c=>/[\p{L}\p{N}]/u.test(c)).length>12);
}

export async function measuredNarrationTranscript(provider,file,initial,signal) {
 let transcript=initial,method='provider-subtitles',limitation=null;
 if(needsNarrationAlignment(transcript)){transcript=await provider.transcribe(file,signal);method='local-asr';}
 if(needsNarrationAlignment(transcript)&&typeof provider.alignSpeech==='function'){
   try{const aligned=await provider.alignSpeech(file,signal);if(!needsNarrationAlignment(aligned)){transcript=aligned;method='local-forced-alignment';}else limitation='语音对齐仍为粗粒度实测时间；不得按字数推算内部词时间。';}
   catch(error){if(signal?.aborted)throw error;limitation=error.code||'SPEECH_ALIGNMENT_UNAVAILABLE';}
 }
 insist(transcript?.words?.length,'旁白已生成，但没有取得实际语音时间戳','NO_SPEECH');
 return {transcript,method,granularity:needsNarrationAlignment(transcript)?'coarse':'word-or-short-phrase',limitation};
}
