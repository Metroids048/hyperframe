import {insist} from './contracts.mjs';

export const preserveFullOriginalTrack = message => /(?:完整[^。！？\n]{0,20}(?:原声|原音轨)|(?:原声|原音轨|原声音轨)[^。！？\n]{0,20}完整)/.test(String(message||''));

export function fullOriginalAudioGraph(message,assets,targetFrames){
  if(!preserveFullOriginalTrack(message))return null;
  const sources=assets.filter(a=>a.kind==='video'&&a.mediaMetadata?.hasAudio);
  insist(sources.length===1,'完整独立原声需要明确唯一的有声视频来源','ORIGINAL_AUDIO_SOURCE');
  const source=sources[0],frames=Math.ceil(source.mediaMetadata.duration*30);
  insist(targetFrames>=frames,'成片时长不足以完整保留原声音轨','ORIGINAL_AUDIO_DURATION');
  return [{id:'audio-full-original',assetId:source.id,startFrame:0,sourceStartSeconds:0,
    playbackRate:1,durationFrames:frames,volume:1,role:'original'}];
}

// Empty ASR is not evidence of silence. Original audio can still be kept
// verbatim; speech-dependent output must not invent a transcript.
export function observationAudioStatus(brief, transcripts) {
  if (transcripts.some(item => item.transcript.words?.length))
    return {status:'speech_recognized',reviewRequired:true};
  insist(transcripts.length>0 && brief.keepOriginalAudio && !brief.needsCaptions,
    '未识别到任务需要的讲话内容','NO_SPEECH');
  return {status:'no_recognized_speech',reviewRequired:true,
    limitation:'转写未识别到讲话，不代表原片无声或已完成试听。完整保留原音轨，不据此删音或编写口播字幕；语义与音画对应待审。'};
}
