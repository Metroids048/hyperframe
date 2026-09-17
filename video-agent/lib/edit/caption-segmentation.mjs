// Shared ASR grouping. Every boundary is measured; no invented timestamps.
export function groupCaptionWords(words,{language='source',maxGap=.6,maxSeconds=3.6,maxCharacters=24}={}){
  const chinese=language==='zh',join=group=>group.map(w=>w.text).join(chinese?'':' ');
  const groups=[];let phrase=[];
  function flush(){
    if(!phrase.length)return;
    const text=join(phrase),boundaries=new Set();
    if(chinese)for(const part of new Intl.Segmenter('zh',{granularity:'word'}).segment(text))boundaries.add(part.index+part.segment.length);
    const offsets=[0];for(const word of phrase)offsets.push(offsets.at(-1)+word.text.length);
    const best=Array(phrase.length+1).fill(null);best[phrase.length]={cost:0};
    for(let i=phrase.length-1;i>=0;i--){
      for(let end=i+1;end<=phrase.length;end++){
        const slice=phrase.slice(i,end),duration=slice.at(-1).end-slice[0].start,characters=[...join(slice)].length;
        if(end>i+1&&(duration>maxSeconds||characters>maxCharacters))break;
        if(!best[end])continue;
        const short=(duration<.65?2:0)+(chinese&&characters<3?3:0);
        const insideWord=chinese&&end<phrase.length&&!boundaries.has(offsets[end])?50:0;
        const cost=1+short+insideWord+Math.max(0,duration-3)**2*.5+Math.max(0,characters-20)*.1+best[end].cost;
        if(!best[i]||cost<best[i].cost)best[i]={cost,end};
      }
    }
    for(let i=0;i<phrase.length;){const end=best[i].end;groups.push(phrase.slice(i,end));i=end;}
    phrase=[];
  }
  for(const word of words){
    if(phrase.length&&word.start-phrase.at(-1).end>maxGap)flush();
    phrase.push(word);if(word.sentenceEnd||/[。！？.!?]$/.test(word.text))flush();
  }
  flush();return groups;
}
