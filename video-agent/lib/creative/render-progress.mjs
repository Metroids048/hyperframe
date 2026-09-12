/** Parse actual HyperFrames capture counters, never an elapsed-time estimate. */
export function renderFrameProgress(chunk,previous=null){
  const matches=[...String(chunk).matchAll(/Streaming frame (\d+)\/(\d+)/g)];
  if(!matches.length)return null;
  const last=matches.at(-1),completed=Number(last[1]),total=Number(last[2]);
  if(!Number.isSafeInteger(completed)||!Number.isSafeInteger(total)||total<1||completed>total||completed<0||previous&&(total!==previous.total||completed<=previous.completed))return null;
  return {phase:'capturing',completed,total,percent:Math.floor(completed/total*100)};
}
