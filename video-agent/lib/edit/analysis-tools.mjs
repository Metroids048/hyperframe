import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {run,ffmpeg,hashFile} from './media.mjs';
import {speechWorker} from './speech-worker.mjs';
import {EditError,insist} from './timeline.mjs';
import {recordToolCall} from './skills.mjs';

let versionPromise;
function mediaVersion(){return versionPromise??=run(ffmpeg,['-version'],{timeout:10000}).then(x=>x.split(/\r?\n/)[0]).catch(()=>{versionPromise=null;throw new EditError('无法读取媒体工具版本',503);});}
function sourceFile(dir,asset){const root=path.resolve(dir),file=path.resolve(root,asset.work||asset.original||'');insist(file.startsWith(root+path.sep),'素材文件必须位于项目目录内');return file;}
export function parseSilence(log,total){
  const ranges=[];let start=null;
  for(const match of log.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)){const time=Math.max(0,Math.min(total,Number(match[2])));if(match[1]==='start')start=time;else{if(start===null)start=0;if(time>start)ranges.push({start,end:time});start=null;}}
  if(start!==null&&total>start)ranges.push({start,end:total});return ranges;
}
/** Inputs are asset ids plus bounded parameters, never commands or caller-provided paths. */
export async function executeAnalysisTool(request,asset,dir,signal) {
  const startedAt=Date.now();insist(request&&['detect_silence','detect_scenes'].includes(request.tool),'不支持的分析工具');
  insist(asset?.id===request.assetId&&asset.status==='ready','分析素材尚未准备完成');if(signal?.aborted)throw new EditError('任务已取消',409);
  const threshold=request.threshold??-38,minDuration=request.minDuration??0.5;
  insist(Number.isFinite(threshold)&&threshold>=-80&&threshold<=-10,'静音阈值必须在 -80～-10 dB');
  insist(Number.isFinite(minDuration)&&minDuration>=0.1&&minDuration<=10,'最短静音时长必须在 0.1～10 秒');
  if(request.tool==='detect_silence')insist(asset.hasAudio,'该素材没有音轨，不能检测静音');
  if(request.tool==='detect_scenes')insist(asset.kind==='video','镜头检测需要视频素材');
  const file=sourceFile(dir,asset),hash=asset.sha256||await hashFile(file),toolVersion=await mediaVersion();
  const engine=request.tool==='detect_scenes'&&process.env.VIDEO_AGENT_SCENE_ENGINE==='pyscenedetect'?'pyscenedetect':'ffmpeg';
  const key=createHash('sha256').update(JSON.stringify({version:2,hash,toolVersion,tool:request.tool,engine,threshold,minDuration})).digest('hex');
  const cache=path.join(dir,'analysis','tool-'+key+'.json');
  const complete=(data,cacheHit)=>({status:'completed',data,toolCall:recordToolCall(request.tool,{assetId:asset.id,hash,threshold,minDuration},{...data,cacheHit},{startedAt}),metrics:{durationMs:Date.now()-startedAt,cacheHit,engine,toolVersion}});
  try{const data=JSON.parse(await fs.readFile(cache,'utf8'));if(data.cacheKey===key)return complete(data.result,true);}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
  let data;
  if(request.tool==='detect_silence') {
    let log='';await run(ffmpeg,['-hide_banner','-i',file,'-af',`silencedetect=noise=${threshold}dB:d=${minDuration}`,'-vn','-f','null','-'],{signal,timeout:Math.max(120000,asset.duration*1000),onOutput:chunk=>{if(log.length<8*1024*1024)log+=chunk;}});
    data={ranges:parseSilence(log,asset.duration),unit:'seconds',threshold,minDuration,sourceHash:hash,engine};
  }else if(engine==='pyscenedetect') {
    const result=await speechWorker('scene').request('detect_scenes',{source:file},{signal,timeout:Math.max(120000,asset.duration*1000)});
    if(result.status!=='completed')return {status:'not_configured',error:'PySceneDetect 尚未安装；可将 VIDEO_AGENT_SCENE_ENGINE 设为 ffmpeg 使用内置镜头检测。',data:result,toolCall:recordToolCall(request.tool,{assetId:asset.id},result,{startedAt,status:'not_configured'}),metrics:{durationMs:Date.now()-startedAt,cacheHit:false,engine}};
    data={scenes:result.scenes,unit:'seconds',engine,sourceHash:hash};
  }else {
    let log='';await run(ffmpeg,['-hide_banner','-i',file,'-vf',"select='gt(scene,0.3)',showinfo",'-an','-f','null','-'],{signal,timeout:Math.max(120000,asset.duration*1000),onOutput:chunk=>{if(log.length<8*1024*1024)log+=chunk;}});
    const boundaries=[0,...new Set([...log.matchAll(/pts_time:([\d.]+)/g)].map(m=>Number(m[1])).filter(t=>t>0&&t<asset.duration)),asset.duration].sort((a,b)=>a-b);
    data={scenes:boundaries.slice(0,-1).map((start,i)=>({start,end:boundaries[i+1]})),unit:'seconds',engine,threshold:0.3,sourceHash:hash};
  }
  if(signal?.aborted)throw new EditError('任务已取消',409);await fs.mkdir(path.dirname(cache),{recursive:true});const pending=cache+'.'+randomUUID()+'.tmp';
  await fs.writeFile(pending,JSON.stringify({cacheKey:key,result:data}));await fs.rename(pending,cache);return complete(data,false);
}
