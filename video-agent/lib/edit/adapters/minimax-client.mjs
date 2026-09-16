import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {downloadTarget,nativeDownload} from '../generation-import.mjs';
import {probe,run,ffmpeg,hashFile} from '../media.mjs';
import {minimaxAdapters} from './minimax.mjs';

const digest=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const flights=new Map();
export class MiniMaxError extends Error {
  constructor(code,message){super(message);this.code=code;this.status=409;}
}
const requireValue=(ok,code,message)=>{if(!ok)throw new MiniMaxError(code,message);};
const readJSON=async file=>JSON.parse(await fs.readFile(file,'utf8'));
async function acquireLock(file){
 const take=async()=>{const handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify({pid:process.pid}));return handle;};
 try{return await take();}catch(error){if(error.code!=='EEXIST')throw error;}
 const guard=file+'.recovery';
 try{await fs.mkdir(guard);}catch(error){if(error.code==='EEXIST')throw new MiniMaxError('MINIMAX_OPERATION_BUSY','其他进程正在恢复音频操作');throw error;}
 try{
  const owner=await readJSON(file).catch(()=>null);let alive=true;
  if(Number.isSafeInteger(owner?.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')alive=false;}}
  requireValue(!alive,'MINIMAX_OPERATION_BUSY','音频操作由其他进程持有或旧锁归属未知，未重复提交');
  await fs.unlink(file);return await take();
 }finally{await fs.rmdir(guard);}
}
async function writeJSON(file,value){const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await fs.rename(temp,file);}
export function minimaxConfig(kind,env=process.env){
 const adapter=minimaxAdapters[kind];requireValue(adapter,'MINIMAX_CAPABILITY','未知音频能力');
 const prefix='MINIMAX_'+kind.toUpperCase(),region=env.MINIMAX_REGION||'cn';
 requireValue(['cn','global'].includes(region),'MINIMAX_REGION','区域必须为cn或global');
 const key=String(env[prefix+'_API_KEY']||env.MINIMAX_API_KEY||'').trim();
 const timeoutMs=env.MINIMAX_TIMEOUT_MS==null?120000:Number(env.MINIMAX_TIMEOUT_MS);
 requireValue(Number.isInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=900000,'MINIMAX_TIMEOUT_CONFIG','音频超时需为1000—900000毫秒');
 const cnHost=env.MINIMAX_CN_API_HOST||'api.minimax.cn';
 requireValue(['api.minimax.cn','api.minimaxi.com'].includes(cnHost),'MINIMAX_REGION','国内 API 主机必须为官方支持地址');
 const authStyle=env.MINIMAX_AUTH_STYLE||'bearer';
 requireValue(['bearer','x-api-key'].includes(authStyle),'MINIMAX_AUTH_CONFIG','鉴权方式必须为 bearer 或 x-api-key');
 return {kind,region,key,authStyle,enabled:env[prefix+'_ENABLED']!=='false',origin:region==='cn'?'https://'+cnHost:'https://api.minimax.io',endpoint:adapter.endpoint,
   model:env[prefix+'_MODEL']||(kind==='speech'?'speech-2.8-hd':kind==='music'?'music-2.6':null),voice:env.MINIMAX_VOICE_ID||null,
   timeoutMs,maxBytes:32*1024*1024,account:digest([region,key]),transport:'live'};
}
export function minimaxRequest(kind,input={},config=minimaxConfig(kind)){
 if(kind==='voices')return {voice_type:'all'};
 requireValue(typeof config.model==='string'&&config.model.length>0,'MINIMAX_MODEL','需要有效模型配置');
 const output_format=input.outputFormat||'hex';requireValue(['hex','url'].includes(output_format),'MINIMAX_INPUT','音频返回格式无效');
 if(kind==='speech'){
  requireValue(typeof input.text==='string'&&input.text.trim()&&input.text.length<=4000,'MINIMAX_INPUT','旁白需为1—4000字符');
  const voice=input.voice||config.voice,rate=input.rate??1;
  requireValue(typeof voice==='string'&&voice.trim(),'MINIMAX_VOICE_REQUIRED','请先查询并选择可用音色');
  requireValue(Number.isFinite(rate)&&rate>=.5&&rate<=2,'MINIMAX_INPUT','语速须为0.5—2');
  requireValue(['sentence','word'].includes(input.subtitleType||'sentence'),'MINIMAX_INPUT','字幕粒度无效');
  return {model:config.model,text:input.text,stream:false,output_format,language_boost:input.language||'Chinese',
   voice_setting:{voice_id:voice,speed:rate,vol:1,pitch:0},audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1},subtitle_enable:true,subtitle_type:input.subtitleType||'sentence'};
 }
 requireValue(typeof input.prompt==='string'&&input.prompt.trim()&&input.prompt.length<=2000,'MINIMAX_INPUT','音乐描述需为1—2000字符');
 return {model:config.model,prompt:input.prompt,stream:false,output_format,is_instrumental:true,lyrics_optimizer:false,audio_setting:{sample_rate:44100,bitrate:256000,format:'mp3'}};
}
export function minimaxSubtitles(value,duration,{offsetSeconds=0,granularity='sentence'}={}){
 const cues=Array.isArray(value)?value:value?.subtitles||value?.words;
 requireValue(Array.isArray(cues)&&cues.length>0&&Number.isFinite(duration)&&duration>0&&Number.isFinite(offsetSeconds)&&offsetSeconds>=0,'MINIMAX_SUBTITLES','供应商没有返回有效的字幕时间');
 let previousStart=-1,previousEnd=-1;
 return cues.map(c=>{
  const start=Number(c.time_begin??c.start)/1000,end=Number(c.time_end??c.end)/1000;
  requireValue(typeof c.text==='string'&&c.text.trim()&&Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=duration+.1,'MINIMAX_SUBTITLES','字幕内容或实际音频时间范围无效');
  requireValue(start>=previousStart&&end>=previousEnd,'MINIMAX_SUBTITLES','供应商字幕时间顺序无效，未静默重排');previousStart=start;previousEnd=end;
  return {text:c.text,start:start+offsetSeconds,end:end+offsetSeconds,source:'minimax-subtitle',granularity,timeUnit:'seconds',originalTimeUnit:'milliseconds'};
 });
}
function businessError(response){
 const code=response?.base_resp?.status_code;
 requireValue(Number.isInteger(code),'MINIMAX_PROTOCOL','供应商响应缺业务状态');
 if(code!==0){const names={1001:'MINIMAX_PROVIDER_TIMEOUT',1002:'MINIMAX_RATE_LIMIT',1004:'MINIMAX_AUTH',1008:'MINIMAX_BALANCE',2013:'MINIMAX_INPUT',20132:'MINIMAX_VOICE',2042:'MINIMAX_PERMISSION',2049:'MINIMAX_AUTH'};const error=new MiniMaxError(names[code]||'MINIMAX_BUSINESS','MiniMax业务失败（'+code+'），未产生已验证音频');error.providerStatusCode=code;throw error;}
}
async function limitedBytes(response,maxBytes){
 requireValue(response?.body,'MINIMAX_EMPTY','供应商响应为空');const chunks=[];let size=0;
 for await(const chunk of response.body){size+=chunk.length;requireValue(size<=maxBytes,'MINIMAX_SIZE','音频响应超过大小限制');chunks.push(Buffer.from(chunk));}
 requireValue(size>0,'MINIMAX_EMPTY','供应商响应为空');return Buffer.concat(chunks);
}

/** Only transport is injectable. Parsing, persistence, decoding and timing are production code. */
export class MiniMaxClient {
 constructor({root,env=process.env,transport}={}){this.root=root;this.env=env;this.transport=transport;}
 async download(url,config,signal,maxBytes=config.maxBytes){
  const target=await downloadTarget(url,new URL(config.origin),lookup);
  const response=await (this.transport?.download||nativeDownload)(target,signal);
  requireValue(response.ok,response.status===403||response.status===404?'MINIMAX_URL_EXPIRED':'MINIMAX_DOWNLOAD','供应商文件下载失败（'+response.status+'），可恢复下载，不重新合成');
  return limitedBytes(response,maxBytes);
 }
 async execute(kind,input={},options={}){
  const config=minimaxConfig(kind,this.env);requireValue(config.enabled,'MINIMAX_DISABLED','此音频能力已停用');
  requireValue(config.key,'MINIMAX_UNCONFIGURED','MiniMax未配置；本地音频仍可使用');
  const payload=minimaxRequest(kind,input,config),fingerprint=digest({v:1,kind,payload,account:config.account,transport:this.transport?'protocol-fixture':'live',catalogWindow:kind==='voices'?Math.floor(Date.now()/3600000):null});
  let directory=path.join(this.root,'.cache/minimax',fingerprint);
  if(options.newSubmissionAuthorization){
   const authorization=options.newSubmissionAuthorization;
   requireValue(typeof authorization==='string'&&/^[a-zA-Z0-9-]{16,100}$/.test(authorization),'MINIMAX_AUTHORIZATION','新提交需要明确且稳定的授权编号');
   const previousDirectory=options.previousSubmissionAuthorization?path.join(this.root,'.cache/minimax',digest({fingerprint,authorization:options.previousSubmissionAuthorization})):directory;
   const prior=await readJSON(path.join(previousDirectory,'operation.json')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   requireValue(prior?.status==='submission_unknown','MINIMAX_AUTHORIZATION','只有已记录的结果未知请求可授权新提交');
   options={...options,recovery:{priorOperationId:prior.operationId,authorizationId:authorization,reason:'explicit-new-submission-possible-duplicate-charge'}};
   directory=path.join(this.root,'.cache/minimax',digest({fingerprint,authorization}));
  }
  if(flights.has(directory))return flights.get(directory);
  const task=this.perform(directory,kind,payload,config,options);flights.set(directory,task);try{return await task;}finally{flights.delete(directory);}
 }
 async perform(directory,kind,payload,config,{signal,retryKnownFailure=false,recovery=null}={}){
  requireValue(!signal?.aborted,'CANCELLED','音频任务已取消，尚未提交');
  await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'operation.json');
  let record=await readJSON(file).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(record?.status==='complete'){
   if(kind==='voices'&&Date.now()-Date.parse(record.completedAt)<3600000)return {...record.result,cacheHit:true};
   if(kind!=='voices'&&await hashFile(record.result.file).catch(()=>null)===record.result.sha256)return {...record.result,cacheHit:true};
  }
  if(['submitting','submission_unknown'].includes(record?.status))throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','此前请求可能已计费；未自动重发。请核对供应商记录后明确授权新操作。');
  if(record?.status==='failed'&&!retryKnownFailure)throw new MiniMaxError(record.error.code,record.error.message);
  const operationId=record?.operationId||randomUUID(),lock=path.join(directory,'lock');
  const handle=await acquireLock(lock);
  const combined=AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(config.timeoutMs)]);
  try{
   // Another process may have completed between our first read and this lock.
   // Re-read under ownership before deciding whether a paid POST is necessary.
   record=await readJSON(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(record?.status==='complete'&&((kind==='voices'&&Date.now()-Date.parse(record.completedAt)<3600000)||(kind!=='voices'&&await hashFile(record.result.file).catch(()=>null)===record.result.sha256)))return {...record.result,cacheHit:true};
   if(['submitting','submission_unknown'].includes(record?.status))throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','此前提交结果不确定，未重复提交');
   if(record?.status==='failed'&&!retryKnownFailure)throw new MiniMaxError(record.error.code,record.error.message);
   let response;
   if(record?.responseSaved)response=await readJSON(path.join(directory,'response.private.json'));
   else{
    const priorAttempts=[...(record?.priorAttempts||[]),...(record?.status==='failed'?[{status:record.status,error:record.error,startedAt:record.startedAt,actualSubmissions:record.actualSubmissions}]:[])];
    record={operationId,kind,model:config.model,status:'submitting',startedAt:new Date().toISOString(),provenance:this.transport?'protocol-fixture':'minimax-live',requestHash:digest(payload),actualSubmissions:(record?.actualSubmissions||0)+1,priorAttempts,recovery};await writeJSON(file,record);
    record.apiHost=new URL(config.origin).host;record.endpoint=config.endpoint;record.authStyle=config.authStyle;await writeJSON(file,record);
    let http;try{http=await (this.transport?.fetch||fetch)(config.origin+config.endpoint,{method:'POST',headers:{...(config.authStyle==='x-api-key'?{'x-api-key':config.key}:{Authorization:'Bearer '+config.key}),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:combined,redirect:'error'});}catch{
     record.status='submission_unknown';await writeJSON(file,record);throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','请求结果未知，可能已提交；记录已保留，不会自动再次计费提交');
    }
    if(!http.ok){if(http.status===410)throw new MiniMaxError("MINIMAX_CAPABILITY_UNAVAILABLE","MiniMax当前不提供该接口服务（HTTP410）；保留已有声音，可使用已有音乐素材。");if(http.status>=500||http.status===408){record.status='submission_unknown';record.httpStatus=http.status;await writeJSON(file,record);throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','供应商或网关超时，处理结果未知；未自动重新提交');}const code=http.status===401?'MINIMAX_AUTH':http.status===403?'MINIMAX_PERMISSION':http.status===429?'MINIMAX_RATE_LIMIT':'MINIMAX_HTTP';throw new MiniMaxError(code,'MiniMax HTTP失败（'+http.status+'）');}
    try{response=JSON.parse((await limitedBytes(http,config.maxBytes*2+1024*1024)).toString());}catch(e){record.status='submission_unknown';await writeJSON(file,record);throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','响应无法完整确认，未自动重发');}
    try{businessError(response);}catch(error){if(['MINIMAX_PROTOCOL','MINIMAX_PROVIDER_TIMEOUT'].includes(error.code)){record.status='submission_unknown';await writeJSON(file,record);throw new MiniMaxError('MINIMAX_SUBMISSION_UNKNOWN','供应商未明确确认处理结果，未自动重新提交');}throw error;}await writeJSON(path.join(directory,'response.private.json'),response);record.responseSaved=true;record.status='response_received';record.traceId=response.trace_id||null;await writeJSON(file,record);
   }
   if(kind==='voices'){
    const voices=['system_voice','voice_cloning','voice_generation'].flatMap(category=>(response[category]||[]).map(v=>({id:v.voice_id,name:v.voice_name||v.voice_id,description:Array.isArray(v.description)?v.description.join(' '):v.description||'',category,language:v.language||null,gender:v.gender||null}))).filter(v=>typeof v.id==='string'&&v.id);
    requireValue(voices.length,'MINIMAX_VOICES_EMPTY','账户未返回可用音色');record.result={voices,operationId,provenance:record.provenance};
   }else{
    requireValue(response.data&&response.data.status===2&&typeof response.data.audio==='string','MINIMAX_EMPTY','供应商未返回完整音频');
    let bytes;if(payload.output_format==='url')bytes=await this.download(response.data.audio,config,combined);else{const hex=response.data.audio;requireValue(hex.length>0&&hex.length%2===0&&/^[0-9a-f]+$/i.test(hex)&&hex.length<=config.maxBytes*2,'MINIMAX_HEX','音频hex损坏或超出大小限制');bytes=Buffer.from(hex,'hex');}
    const original=path.join(directory,'original.mp3'),target=path.join(directory,'audio.wav'),temporary=path.join(directory,'decode.wav');await fs.writeFile(original,bytes);
    try{await run(ffmpeg,['-y','-v','error','-xerror','-i',original,'-vn','-ar','48000','-ac','2','-c:a','pcm_s16le',temporary],{signal:combined});}catch{throw new MiniMaxError('MINIMAX_AUDIO_CORRUPT','返回音频未通过完整解码；保留响应供恢复，不重新合成');}
    const metadata=await probe(temporary,combined);requireValue(metadata.hasAudio&&metadata.duration>0,'MINIMAX_AUDIO_CORRUPT','返回音频无有效声音');await fs.rename(temporary,target);
    let words=[];if(kind==='speech'){
     requireValue(response.data.subtitle_file,'MINIMAX_SUBTITLES','合成已完成但字幕地址缺失，音频保留；未伪造时间');
     let raw;try{raw=JSON.parse((await this.download(response.data.subtitle_file,config,combined,2*1024*1024)).toString());}catch(e){if(e instanceof MiniMaxError)throw e;throw new MiniMaxError('MINIMAX_SUBTITLES','字幕文件无法解析');}
     words=minimaxSubtitles(raw,metadata.duration,{granularity:payload.subtitle_type});
    }
    record.result={operationId,file:target,sha256:await hashFile(target),durationSeconds:metadata.duration,metadata,words,transcript:{language:'zh',words},provenance:record.provenance,model:config.model,voice:payload.voice_setting?.voice_id||null,usage:response.extra_info?.usage_characters??null,cost:null,costStatus:'unit_price_not_configured'};
   }
   record.status='complete';record.completedAt=new Date().toISOString();await writeJSON(file,record);return {...record.result,cacheHit:false};
  }catch(error){
   if(record&&error.code==='MINIMAX_SUBMISSION_UNKNOWN'){record.status='submission_unknown';await writeJSON(file,record);}
   else if(record&&record.status!=='submission_unknown'){record.status=record.responseSaved?'response_received':'failed';record.error={code:error.code||'MINIMAX_INTERNAL',message:error instanceof MiniMaxError?error.message:'本地音频处理失败；原响应已保留'};await writeJSON(file,record);}
   if(error instanceof MiniMaxError)throw error;throw new MiniMaxError('MINIMAX_INTERNAL','本地音频处理失败；未暴露原响应或凭据');
  }finally{await handle.close();await fs.unlink(lock);}
 }
}
