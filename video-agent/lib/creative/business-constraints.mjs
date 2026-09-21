import {insist} from './contracts.mjs';

// Explicit exclusions have a deterministic backstop; the model still receives
// the complete request for semantic understanding and minimum clarification.
export function explicitBusinessConstraints(message='',workflow=null) {
 const clauses=String(message).split(/[，,。！？\n;；]/);
 const denied=word=>clauses.some(c=>new RegExp('(?:不要|不加|不配|不用|不保留|禁止|无需|不需要|不写|不标|不展示|不显示|不添加)\\s*(?:(?:任何|背景|新的|额外的?|添加|再|旁白|配音|音乐|配乐|BGM|和|及|、|与)\\s*)*(?:'+word+')(?!太大|太响|过大|过响|盖过)','i').test(c));
 const requested=word=>new RegExp('(?:加入|添加|配上?|需要|用上?|生成|制作).{0,20}(?:'+word+')','i').test(message);
 const silent=/静音|无声|不要任何声音|不要声音/.test(message)&&!/(?:不要|不需|无需)静音/.test(message);

 // Detect positive audio requirements
 const needsNarration=requested('讲解|旁白|配音|口播|解说|人声|语音|narration|voiceover');
 const needsMusic=requested('音乐|配乐|BGM|背景音乐|伴奏|background.*music');
 const needsCaptions=requested('字幕|subtitle|caption');

 const policy={schemaVersion:1,originalRequest:String(message),
  narration:silent||denied('旁白|配音|口播')?'forbidden':(needsNarration||needsCaptions)?'required':'unspecified',
  music:silent||denied('音乐|配乐|BGM')?'forbidden':needsMusic?'required':'unspecified',
  original:silent||denied('原声')?'forbidden':/保留[^。！？\n]{0,8}原声/.test(message)?'required':'unspecified',
  price:denied('价格|价钱|报价|售价')?'forbidden':'unspecified',silent};
 // Validated workflow requirements carry semantic scope across compound clauses.
 // Keep explicit prohibitions authoritative and require original source evidence.
 if(policy.original==='unspecified'&&workflow?.requirements?.some(r=>
  r.field==='sound.original'&&r.kind==='preserve'&&typeof r.quote==='string'&&r.quote.trim()&&
  workflow.sourceRequests?.some(source=>typeof source==='string'&&source.includes(r.quote))))policy.original='required';
 return policy;
}

export function validateBusinessAudio(message,tracks,assets,workflow=null) {
 const policy=explicitBusinessConstraints(message,workflow);
 if(policy.original==='required'&&assets.some(a=>a.kind==='video'&&a.mediaMetadata?.hasAudio))
  insist((tracks||[]).some(t=>assets.some(a=>a.id===t.assetId&&a.kind==='video'&&a.mediaMetadata?.hasAudio)),'本次要求保留原声，不能丢弃实际存在的源音轨','AUDIO_CONSTRAINT');
 for(const track of tracks||[]){
  const asset=assets.find(a=>a.id===track.assetId);
  const role=asset?.kind==='video'?'original':asset?.generatedVoice?'narration':asset?.audioRole||'music';
  insist(!policy.silent&&policy[role]!=='forbidden','音轨违反本次明确声音要求：'+role,'AUDIO_CONSTRAINT');
  insist(!(role==='original'&&policy.original==='unspecified'&&policy.narration==='forbidden'&&policy.music==='forbidden'),'用户禁止旁白和音乐且未要求原声：不要自动保留未经听觉核验的源混合音轨，请省略该音轨','AUDIO_CONSTRAINT');
 }
 return policy;
}

export function validateBriefAudio(message,brief,workflow=null){
 const policy=explicitBusinessConstraints(message,workflow);
 insist(!(policy.original==='required'&&brief.keepOriginalAudio===false),'本次要求保留原声，keepOriginalAudio不能为false','AUDIO_CONSTRAINT');
 insist(!(brief.needsNarration&&policy.narration==='forbidden'),'本次明确禁止旁白，needsNarration必须为false','AUDIO_CONSTRAINT');
 insist(!(brief.keepOriginalAudio&&(policy.original==='forbidden'||(policy.original==='unspecified'&&policy.narration==='forbidden'&&policy.music==='forbidden'))),'未要求保留原声且明确禁止旁白与音乐时，不自动保留未经试听的源混合音轨','AUDIO_CONSTRAINT');
}
