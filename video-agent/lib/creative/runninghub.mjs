import fs from 'node:fs/promises';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {downloadTarget,nativeDownload} from '../edit/generation-import.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {insist,safeRelativePath} from './contracts.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file);};
let submissionLock=Promise.resolve();
export function submissionSpec(profile,values){
 insist(profile&&['model','app','workflow'].includes(profile.mode),'缺少已核对的 RunningHub 能力配置','GENERATION_CONFIG');
 const bind=value=>typeof value==='string'&&/^\$(prompt|image|duration|aspect)$/.test(value)?values[value.slice(1)]:Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bind(v)])):value;
 const body=bind(profile.body||{});
 const endpoint=profile.mode==='app'?'/task/openapi/ai-app/run':profile.mode==='workflow'?'/task/openapi/create':profile.endpoint;
 insist(typeof endpoint==='string'&&(/^\/openapi\/v2\/[a-zA-Z0-9_/-]+$/.test(endpoint)||['/task/openapi/ai-app/run','/task/openapi/create'].includes(endpoint)),'供应商接口路径无效','GENERATION_CONFIG');
 if(profile.mode==='app')insist(body.webappId,'AI App 缺少 webappId','GENERATION_CONFIG');
 if(profile.mode==='workflow')insist(body.workflowId,'Workflow 缺少 workflowId','GENERATION_CONFIG');
 return {endpoint,body};
}
export async function generateCommerceAsset({root,project,job,kind,prompt,sourceAsset,duration=8,role,save,signal,io={}}){
 insist(process.env.RUNNINGHUB_API_KEY,'缺少服务端 RUNNINGHUB_API_KEY；生成分支暂停，已有素材仍可剪辑','GENERATION_KEY');
 const config=JSON.parse(await fs.readFile(path.join(root,'config/runninghub.local.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));
 const profile=config[kind];submissionSpec(profile,{prompt,image:'pending-upload',duration,aspect:'9:16'});
 const endpoint=new URL(process.env.RUNNINGHUB_BASE_URL||'https://www.runninghub.ai');
 insist(endpoint.protocol==='https:'&&['www.runninghub.ai','www.runninghub.cn'].includes(endpoint.hostname)&&!endpoint.username&&!endpoint.password,'RunningHub 服务地址必须为官方 HTTPS 域名','GENERATION_CONFIG');
 const source=safeRelativePath(root,sourceAsset.path),inputBytes=await fs.readFile(source),sourceSha256=hash(inputBytes);
 const request={projectId:project.id,kind,prompt,sourceAssetId:sourceAsset.id,sourceSha256,duration,role,profile};
 const requestHash=hash(JSON.stringify(request)),recordId='rh-'+requestHash.slice(0,32),file=path.join(root,'data/runninghub-jobs',recordId+'.json');
 let record=JSON.parse(await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;}));
 const event=async(type,extra={})=>{(job.providerCalls??=[]).push({provider:'runninghub',type,recordId,...extra,at:new Date().toISOString()});await save();};
 const call=async(route,body)=>{
  const response=await (io.fetch||fetch)(new URL(route,endpoint),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.RUNNINGHUB_API_KEY},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
  insist(response.ok,'RunningHub HTTP '+response.status,'PROVIDER_HTTP');return response.json();
 };
 if(record?.status==='downloaded'){
  insist(hash(await fs.readFile(safeRelativePath(root,record.asset.path)))===record.sha256,'已生成文件哈希改变','PROVENANCE_CHANGED');return record.asset;
 }
 if(!record?.providerTaskId){
  insist(!record||record.status==='prepared','提交结果不确定，必须按已有记录对账，禁止再次付费提交','PROVIDER_RECONCILIATION');
  const previous=submissionLock;let release;submissionLock=new Promise(resolve=>{release=resolve;});await previous;
  try{
   const authorization=config.authorization;
   insist(authorization?.source&&authorization.id&&Number.isSafeInteger(authorization.maxSubmissions)&&authorization.maxSubmissions>0,'缺少既有付费授权及调用上限，未自动设定费用','GENERATION_AUTHORIZATION');
   const records=await fs.readdir(path.dirname(file)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});let consumed=0;
   for(const name of records.filter(n=>n.endsWith('.json'))){const old=JSON.parse(await fs.readFile(path.join(path.dirname(file),name)));if(old.authorizationId===authorization.id&&old.status!=='prepared')consumed++;}
   insist(consumed<authorization.maxSubmissions,'已达到授权生成调用上限','GENERATION_BUDGET');
   const form=new FormData();form.set('apiKey',process.env.RUNNINGHUB_API_KEY);form.set('file',new Blob([inputBytes]),path.basename(source));form.set('fileType','image');
   await event('upload');const response=await (io.fetch||fetch)(new URL('/task/openapi/upload',endpoint),{method:'POST',body:form,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});const upload=await response.json();
   insist(response.ok&&upload.code===0&&upload.data?.fileName,'RunningHub 原图上传失败','PROVIDER_UPLOAD');
   const spec=submissionSpec(profile,{prompt,image:profile.mode==='model'?(upload.data.fileUrl||upload.data.fileName):upload.data.fileName,duration,aspect:project.request.output?.width>project.request.output?.height?'16:9':'9:16'});
   record={recordId,requestHash,request,authorizationId:authorization.id,authorizationSource:authorization.source,status:'submitting',provider:'runninghub',submittedAt:new Date().toISOString(),cost:{amount:null,source:'provider bill pending'}};
   await write(file,record);await event('submit',{requestHash});
   const result=await call(spec.endpoint,{...spec.body,...(profile.mode!=='model'?{apiKey:process.env.RUNNINGHUB_API_KEY}:{})});
   const taskId=result.taskId||result.data?.taskId;insist(taskId,'供应商没有返回 taskId；需对账后恢复','PROVIDER_RECONCILIATION');
   record.providerTaskId=String(taskId);record.status='submitted';await write(file,record);await event('submitted',{providerTaskId:record.providerTaskId});
  }finally{release();}
 }
 let outputs=record.outputs;
 for(let attempt=0;!outputs&&attempt<180;attempt++){
  await event('query',{providerTaskId:record.providerTaskId});
  const result=await call(profile.mode==='model'?'/openapi/v2/query':'/task/openapi/outputs',{taskId:record.providerTaskId,...(profile.mode!=='model'?{apiKey:process.env.RUNNINGHUB_API_KEY}:{})});
  if(profile.mode==='model'){
   insist(!['FAILED','CANCELLED'].includes(result.status),'RunningHub 生成失败，保留任务记录','PROVIDER_FAILED');
   if(result.status==='SUCCESS')outputs=result.results;
  }else if(result.code===0&&Array.isArray(result.data))outputs=result.data;
  else insist([804,805].includes(result.code),'RunningHub 查询失败（code '+result.code+'），保留任务记录','PROVIDER_QUERY');
  if(!outputs)await (io.delay||delay)(5000,null,{signal});
 }
 insist(Array.isArray(outputs)&&outputs.length,'供应商仍在处理，可恢复查询；不会重新提交','PROVIDER_PENDING');
 record.outputs=outputs;record.status='downloading';await write(file,record);
 const result=outputs.find(r=>kind==='image'?/image|png|jpg|jpeg|webp/i.test(r.fileType||r.outputType||r.url||r.fileUrl||''):/video|mp4|webm|mov/i.test(r.fileType||r.outputType||r.url||r.fileUrl||''));
 insist(result,'供应商结果没有所需媒体类型','PROVIDER_OUTPUT');
 const target=await downloadTarget(result.fileUrl||result.url,endpoint,lookup),response=await (io.download||nativeDownload)(target,AbortSignal.any([signal,AbortSignal.timeout(120000)]));
 insist(response.ok&&response.body,'供应商媒体下载失败','PROVIDER_DOWNLOAD');
 const ext=kind==='image'?'.png':'.mp4',assetId=recordId,assetPath=path.join(path.dirname(path.dirname(file)), 'generated-assets',assetId+ext);
 await fs.mkdir(path.dirname(assetPath),{recursive:true});const handle=await fs.open(assetPath+'.part','w');let bytes=0;
 try{for await(const chunk of response.body){bytes+=chunk.length;insist(bytes<=1024**3,'生成结果超过1GiB','ASSET_TOO_LARGE');await handle.write(chunk);}}finally{await handle.close();}
 insist(bytes>0,'生成媒体为空','PROVIDER_DOWNLOAD');await fs.rename(assetPath+'.part',assetPath);
 const asset={id:assetId,kind,name:(kind==='image'?'生成商品图':'生成原始镜头')+' · '+role,path:path.relative(root,assetPath),role,rights:{status:'pending-provider-rights-review'}};
 const prepared=await prepareCreativeAsset(root,asset,path.join(path.dirname(assetPath),'prepared'),{signal});
 const provenance={recordId,assetId,provider:'runninghub',providerTaskId:record.providerTaskId,requestHash,sha256:prepared.sha256,status:'downloaded',mediaDecoded:true,cost:record.cost};
 await write(path.join(root,'data/generated-assets',recordId+'.json'),provenance);
 record={...record,...provenance,asset};await write(file,record);await event('downloaded',{assetId,sha256:prepared.sha256});return asset;
}
