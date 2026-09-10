import {uid,insist} from './timeline.mjs';
const key=c=>c.groupId||c.id;
// Captions never create or delete speech. Only an explicit link to generated
// narration allows a text correction to replace that narration.
export async function syncCaptionVoices(t,base,ops,generate,{assets={}}={}) {
  const processed=new Set();
  for(const c of t.captions){
    const group=key(c),old=base.captions.find(x=>x.id===c.id)||base.captions.find(x=>key(x)===group);
    if(processed.has(group)||!old||old.text===c.text)continue;
    const paired=t.audio.filter(a=>assets[a.assetId]?.generated===true&&(a.captionGroupId===group||c.audioId===a.id||c.audioId===a.groupId));
    if(!paired.length)continue;
    processed.add(group);
    const siblings=t.captions.filter(x=>key(x)===group);
    insist(siblings.every(x=>x.text===c.text),'这段字幕关联同一条旁白，请统一修改整句文字或解除旁白关联');
    const voice=paired[0],source=assets[voice.assetId],start=Math.min(...siblings.map(x=>x.start)),end=Math.max(...siblings.map(x=>x.end));
    insist(paired.every(x=>Math.abs((x.rate||1)-(voice.rate||1))<1e-6),'关联旁白包含不同倍速，请选中具体片段修改');
    const a=await generate(c.text,{voice:source.voiceId||source.voice,rate:source.rate??1,instructions:source.instructions,sourceAssetId:source.id}),playbackRate=voice.rate||1,frames=Math.max(1,Math.round(a.frames/playbackRate));
    insist(start+frames<=end,`旁白“${c.text}”需要 ${(frames/30).toFixed(2)} 秒，当前字幕区间只有 ${((end-start)/30).toFixed(2)} 秒。请延长字幕或缩短文字。`);
    let continuousEnd=start;for(const item of [...siblings].sort((a,b)=>a.start-b.start)){if(item.start>continuousEnd)break;continuousEnd=Math.max(continuousEnd,item.end);}insist(start+frames<=continuousEnd,'关联字幕已被拆成不连续片段，完整旁白放不进连续区间。请调整字幕时间或缩短文字。');
    insist(!t.audio.some(x=>!paired.includes(x)&&x.role==='voice'&&x.gain>0&&x.start<start+frames&&x.end>start),'修改后的旁白与另一条旁白重叠，请调整时间');
    t.audio=t.audio.filter(x=>!paired.includes(x));
    const id=voice.id||uid();t.audio.push({...voice,id,groupId:voice.groupId||id,captionGroupId:group,assetId:a.id,text:c.text,in:0,sourceOffset:0,sourceDuration:a.frames,start,end:start+frames,rate:playbackRate,fadeIn:Math.min(voice.fadeIn||0,frames),fadeOut:Math.min(voice.fadeOut||0,frames)});
    for(const item of siblings){item.audioId=id;item.sourceAssetId=a.id;item.voicePolicy='linked';}
  }
  return t;
}
