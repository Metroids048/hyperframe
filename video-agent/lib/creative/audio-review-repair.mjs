import {insist} from './contracts.mjs';

export function isAudioReviewIssue(issue){
  return ['text-evidence','text-timing'].includes(issue.repairKind)&&
    !issue.nodeIds?.length&&/字幕|旁白|音轨|音字|声字/.test(issue.problem||'');
}

export function correctedAudioAssets(assets,corrections,{scripts={}}={}){
  const next=structuredClone(assets),seen=new Set();
  for(const correction of corrections){
    const asset=next.find(a=>a.id===correction.assetId),words=asset?.providerTranscript?.words;
    const key=correction.assetId+':'+correction.wordIndex;
    insist(asset?.generatedVoice&&words&&Number.isInteger(correction.wordIndex)&&
      correction.wordIndex>=0&&correction.wordIndex<words.length&&!seen.has(key),
      '字幕校正必须引用已有旁白的真实词时间','CAPTION_REPAIR_TARGET');
    insist(typeof correction.text==='string'&&correction.text.trim()&&[...correction.text].length<=40,
      '字幕校正文字无效','CAPTION_REPAIR_TEXT');
    const clean=s=>s.replace(/[\s\p{P}]/gu,'');
    if(scripts[asset.id])insist(clean(scripts[asset.id]).includes(clean(correction.text)),
      '校正文字必须来自已经合成的旁白稿','CAPTION_REPAIR_FACT');
    seen.add(key);words[correction.wordIndex]={...words[correction.wordIndex],text:correction.text,corrected:true};
  }
  for(const asset of next.filter(a=>corrections.some(c=>c.assetId===a.id))){
    const transcript=asset.providerTranscript,join=transcript.language==='zh'?'':' ';
    transcript.text=transcript.words.map(w=>w.text).join(join);
    if(transcript.segments)transcript.segments=transcript.segments.map(s=>({...s,text:transcript.words.filter(w=>w.start>=s.start&&w.start<s.end).map(w=>w.text).join(join)}));
    transcript.textCorrectionSource='reviewed-script';
  }
  return next;
}
