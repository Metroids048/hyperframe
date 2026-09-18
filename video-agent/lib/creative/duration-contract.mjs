import {FPS,insist} from './contracts.mjs';

// Approximate language permits a small explicit planning window, never a
// source-range extension. Exact requests and unspecified UI values stay exact.
export function durationContract(message,targetSeconds){
 const targetFrames=Math.round(targetSeconds*FPS),text=String(message||'');
 const approximate=[...text.matchAll(/(?:大约|约|大概|大致|about|approximately)\s*(\d+(?:\.\d+)?)\s*(?:秒|seconds?|s\b)/gi)]
  .some(m=>Math.round(Number(m[1])*FPS)===targetFrames);
 const exact=/(?:严格|精确|必须|恰好|正好|exactly)[^。！？\n]{0,12}(?:\d+(?:\.\d+)?)\s*(?:秒|seconds?)/i.test(text)||/(?:不要|不是|不能|并非)\s*(?:大约|约|大概|about)/i.test(text);
 const toleranceFrames=approximate&&!exact?Math.floor(targetFrames*.05):0;
 return {version:1,mode:toleranceFrames?'approximate':'exact',targetFrames,minFrames:targetFrames-toleranceFrames,maxFrames:targetFrames+toleranceFrames,toleranceRatio:toleranceFrames?.05:0};
}

export function plannedDurationFrames(message,targetSeconds,scenes,overlap=0){
 const contract=durationContract(message,targetSeconds);
 if(scenes.some(s=>s.durationSeconds==null))return contract.targetFrames;
 const frames=scenes.map(s=>Math.round(s.durationSeconds*FPS));
 insist(frames.every(n=>Number.isFinite(n)&&n>0),'镜头时长必须为正数','INVALID_SCENE_TIME');
 const actual=frames.reduce((a,b)=>a+b,0)-overlap*Math.max(0,scenes.length-1);
 insist(actual>=contract.minFrames&&actual<=contract.maxFrames,
  contract.mode==='exact'?'镜头时间必须精确匹配需求；不能延长停留补齐':`镜头时间超出约定近似范围：${contract.minFrames/FPS}～${contract.maxFrames/FPS}秒；不能改变必要动作来凑时长`,'INVALID_SCENE_TIME');
 return actual;
}
