import fs from 'node:fs/promises';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {uid,EditError,insist} from './timeline.mjs';
import {prepareAsset} from './media.mjs';
import {generateMedia} from './adapters/optional-providers.mjs';
import {recordToolCall} from './skills.mjs';

const MIME_EXT={'video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm','audio/mpeg':'.mp3','audio/mp3':'.mp3','audio/mp4':'.m4a','audio/x-m4a':'.m4a','audio/wav':'.wav','audio/x-wav':'.wav','audio/wave':'.wav'};
const localHost=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host.toLowerCase());
export function generationCapabilities(){return {configured:!!process.env.VIDEO_AGENT_GENERATION_URL,kinds:['video','audio'],maxDurationSeconds:600};}
export function validateGenerationRequest(request){
  insist(request?.tool==='generate_media','不支持的素材生成工具');
  insist(Object.keys(request).every(key=>['tool','prompt','kind','durationSeconds'].includes(key)),'素材生成只接受描述、类型与时长，不接受文件路径或地址');
  insist(typeof request.prompt==='string'&&request.prompt.trim()&&request.prompt.length<=4000,'素材描述需为 1～4000 个字符');
  insist(['video','audio'].includes(request.kind),'目前只支持生成视频或音频，暂不支持图片');
  insist(Number.isFinite(request.durationSeconds)&&request.durationSeconds>0&&request.durationSeconds<=600,'生成时长必须在 0～600 秒');
}
function publicAddress(address){
  if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b)||a===198&&b===51&&c===100||a===203&&b===0&&c===113||a>=224);}
  if(isIP(address)===6){const value=address.toLowerCase();if(value.startsWith('::ffff:')){const mapped=value.slice(7);if(isIP(mapped)===4)return publicAddress(mapped);return false;}return /^[23]/.test(value)&&!/^2001:(0?db8|0?2|0?10):|^2002:/i.test(value);}
  return false;
}
async function downloadTarget(raw,endpoint,lookupImpl){
  let url;try{url=new URL(raw);}catch{throw new EditError('生成素材地址无效',422);}
  insist(!url.username&&!url.password&&!url.hash,'生成素材地址不能包含账号或片段标记');
  const sameLocal=localHost(endpoint.hostname)&&url.origin===endpoint.origin;
  insist(url.protocol==='https:'||sameLocal&&url.protocol==='http:','生成素材必须使用 HTTPS，或与已配置的本机生成接口同源');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookupImpl(hostname,{all:true});
  insist(addresses.length>0&&addresses.every(item=>sameLocal?isIP(item.address)!==0:publicAddress(item.address)),'生成素材不能指向本机、内网或保留地址');
  return {url,addresses};
}
// Pin the previously checked DNS answer to the TLS request. No redirects and no
// generation API credentials are forwarded to a returned media URL.
function nativeDownload({url,addresses},signal){return new Promise((resolve,reject)=>{
  const request=(url.protocol==='https:'?https:http).get(url,{signal,headers:{Accept:'video/*, audio/*, application/octet-stream'},lookup:(hostname,options,callback)=>{const selected=addresses.filter(item=>!options.family||item.family===options.family);const list=selected.length?selected:addresses;if(options.all)callback(null,list);else callback(null,list[0].address,list[0].family);}},response=>resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,headers:{get:name=>response.headers[name.toLowerCase()]||null},body:response}));request.on('error',reject);
});}
export async function importGeneratedMedia(request,{assetRoot,signal,prepare=prepareAsset,fetchImpl,lookupImpl=lookup,maxBytes=1024**3,downloadTimeoutMs=120000}={}){
  validateGenerationRequest(request);const endpointValue=process.env.VIDEO_AGENT_GENERATION_URL;
  if(!endpointValue)throw new EditError('素材生成提供方尚未配置，请上传素材或配置 VIDEO_AGENT_GENERATION_URL',503);
  let endpoint;try{endpoint=new URL(endpointValue);}catch{throw new EditError('素材生成接口配置无效',503);}
  insist(!endpoint.username&&!endpoint.password,'生成接口配置不能包含账号信息');
  if(signal?.aborted)throw new EditError('任务已取消',409);
  const startedAt=Date.now(),fetcher=fetchImpl||fetch;
  const fetchMetadata=async(url,options)=>{
    const response=await fetcher(url,{...options,redirect:'error'});
    return {ok:response.ok,status:response.status,json:async()=>{const chunks=[];let size=0;insist(response.body,'生成服务返回为空');for await(const chunk of response.body){const data=Buffer.from(chunk);size+=data.length;insist(size<=256*1024,'生成服务返回的描述过大');chunks.push(data);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new EditError('生成服务返回了无效的素材描述',422);}}};
  };
  let generated;try{generated=await generateMedia(request,{signal,fetchImpl:fetchMetadata});}catch(error){if(signal?.aborted)throw new EditError('任务已取消',409);throw error;}
  const mime=generated.mimeType.toLowerCase().split(';')[0].trim(),extension=MIME_EXT[mime];insist(extension&&mime.startsWith(request.kind+'/'),'生成服务返回了不支持的媒体格式');
  const target=await downloadTarget(generated.url,endpoint,lookupImpl),id=uid(),root=path.resolve(assetRoot),dir=path.resolve(root,id);insist(dir.startsWith(root+path.sep),'素材存储位置无效');
  const original='original'+extension,temporary=path.join(dir,'download.part'),downloadControl=new AbortController(),combined=AbortSignal.any([downloadControl.signal,signal||new AbortController().signal,AbortSignal.timeout(downloadTimeoutMs)]);let bytes=0;
  await fs.mkdir(root,{recursive:true});await fs.mkdir(dir);
  try{
    const response=fetchImpl?await fetchImpl(target.url,{signal:combined,redirect:'error',headers:{Accept:mime}}):await nativeDownload(target,combined);
    insist(response.ok,'生成素材下载失败（'+response.status+'）');const length=Number(response.headers.get('content-length')||0);insist(!length||length<=maxBytes,'生成素材超过大小限制');
    const actualMime=String(response.headers.get('content-type')||'').toLowerCase().split(';')[0].trim();insist(!actualMime||actualMime==='application/octet-stream'||actualMime===mime||MIME_EXT[actualMime]===extension,'生成素材的下载格式与声明不符');
    insist(response.body,'生成素材下载为空');const handle=await fs.open(temporary,'wx');try{for await(const chunk of response.body){if(combined.aborted)throw new EditError(signal?.aborted?'任务已取消':'生成素材下载超时',409);const data=Buffer.from(chunk);bytes+=data.length;insist(bytes<=maxBytes,'生成素材超过大小限制');await handle.write(data);}}finally{await handle.close();}
    insist(bytes>0,'生成素材为空');await fs.rename(temporary,path.join(dir,original));
    const asset={id,name:'生成'+(request.kind==='video'?'视频':'音频')+' · '+request.prompt.slice(0,60),original,status:'pending',size:bytes,createdAt:new Date().toISOString(),generation:{prompt:request.prompt,kind:request.kind,durationSeconds:request.durationSeconds,providerOrigin:endpoint.origin,attribution:generated.attribution||null}};
    await prepare(dir,asset,signal);insist(asset.kind===request.kind,'生成素材实际类型与请求不符');if(signal?.aborted)throw new EditError('任务已取消',409);
    return {asset,toolCall:recordToolCall('generate_media',{prompt:request.prompt,kind:request.kind,durationSeconds:request.durationSeconds},{assetId:asset.id,kind:asset.kind,frames:asset.frames,status:'ready'},{startedAt}),metrics:{durationMs:Date.now()-startedAt,downloadBytes:bytes}};
  }catch(error){await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});if(combined.aborted)throw new EditError(signal?.aborted?'任务已取消':'生成素材下载超时',signal?.aborted?409:504);throw error;}finally{downloadControl.abort();}
}
