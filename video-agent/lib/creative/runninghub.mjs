import fs from 'node:fs/promises';
import {assertMediaGenerationAllowed} from './production-policy.mjs';
import path from 'node:path';
import {lookup} from 'node:dns/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {downloadTarget,nativeDownload} from '../edit/generation-import.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {insist,safeRelativePath} from './contracts.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const write=async(file,value)=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file);};
let submissionLock=Promise.resolve();
const requestsInFlight=new Map();
export function outputAspect(output={width:1080,height:1920}){
 const ratio=output.width/output.height;
 const aspect=Math.abs(ratio-1)<.001?'1:1':Math.abs(ratio-9/16)<.001?'9:16':Math.abs(ratio-16/9)<.001?'16:9':null;
 insist(aspect,'生成画幅仅支持 1:1、9:16、16:9','GENERATION_ASPECT');return aspect;
}
// The on-disk lease also excludes a second service process. A dead owner can
// release a lease, but a submitting record is still reconciliation-only.
async function submissionLease(directory,name='.submission.lock'){
 await fs.mkdir(directory,{recursive:true});const file=path.join(directory,name);
 for(let attempt=0;attempt<2;attempt++){
  try{const handle=await fs.open(file,'wx');await handle.writeFile(String(process.pid));return async()=>{await handle.close();await fs.unlink(file);};}
  catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await fs.readFile(file,'utf8'));let alive=true;try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH')alive=false;}
   insist(!alive,'另一工作进程正在提交，稍后恢复同一任务','PROVIDER_BUSY');await fs.unlink(file);
  }
 }
 throw Error('无法取得生成提交锁');
}
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
export async function generateCommerceAsset(options){
 await assertMediaGenerationAllowed(options.root);
 const key=hash(JSON.stringify([options.root,options.project.id,options.kind,options.prompt,options.sourceAsset,options.duration,options.role,options.project.request.output]));
 if(requestsInFlight.has(key))return requestsInFlight.get(key);
 const pending=generateAsset(options).finally(()=>requestsInFlight.delete(key));requestsInFlight.set(key,pending);return pending;
}
async function generateAsset({root,project,job,kind,prompt,sourceAsset,duration=8,role,save,signal=new AbortController().signal,io={}}){
 // 演示模式：跳过实际生成，直接使用现有素材
 if(process.env.OPENCLAW_DEMO_MODE==='true'){
  const demoAsset={
   id:'demo-'+sourceAsset.id,
   kind:sourceAsset.kind,
   name:'[演示模式] '+sourceAsset.name,
   path:sourceAsset.path,
   role:role||sourceAsset.role,
   rights:{status:'demo'},
   demoMode:true,
   sourceAssetId:sourceAsset.id
  };
  (job.providerCalls??=[]).push({provider:'runninghub',type:'demo-skip',recordId:'demo',at:new Date().toISOString(),note:'演示模式已启用，跳过视频生成'});
  await save();
  return demoAsset;
 }
 insist(process.env.RUNNINGHUB_API_KEY,'缺少服务端 RUNNINGHUB_API_KEY；生成分支暂停，已有素材仍可剪辑','GENERATION_KEY');
 const config=JSON.parse(await fs.readFile(path.join(root,'config/runninghub.local.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));
 const profile=config[kind],aspect=outputAspect(project.request.output);submissionSpec(profile,{prompt,image:'pending-upload',duration,aspect});
 insist(!profile.supportedAspects||profile.supportedAspects.includes(aspect),'当前生成能力不支持 '+aspect,'GENERATION_ASPECT');
 const endpoint=new URL(process.env.RUNNINGHUB_BASE_URL||'https://www.runninghub.ai');
 insist(endpoint.protocol==='https:'&&['www.runninghub.ai','www.runninghub.cn'].includes(endpoint.hostname)&&!endpoint.username&&!endpoint.password,'RunningHub 服务地址必须为官方 HTTPS 域名','GENERATION_CONFIG');
 const source=safeRelativePath(root,sourceAsset.path),inputBytes=await fs.readFile(source),sourceSha256=hash(inputBytes);
 const request={projectId:project.id,kind,prompt,sourceAssetId:sourceAsset.id,sourceSha256,duration,aspect,output:project.request.output,role,profile,providerOrigin:endpoint.origin};
 const requestHash=hash(JSON.stringify(canonical(request))),recordId='rh-'+requestHash.slice(0,32),file=path.join(root,'data/runninghub-jobs',recordId+'.json');
 const releaseRecord=await submissionLease(path.dirname(file),'.'+recordId+'.lock');
 try{
 let record=JSON.parse(await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;}));
 const event=async(type,extra={})=>{(job.providerCalls??=[]).push({provider:'runninghub',type,recordId,...extra,at:new Date().toISOString()});await save();};
 const call=async(route,body)=>{
  const response=await (io.fetch||fetch)(new URL(route,endpoint),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.RUNNINGHUB_API_KEY},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
  insist(response.ok,'RunningHub HTTP '+response.status,'PROVIDER_HTTP');return response.json();
 };
 if(record?.status==='downloaded'){
  const recordPath=record.asset.originalRef||record.asset.path;
  insist(hash(await fs.readFile(safeRelativePath(root,recordPath)))===record.sha256,'已生成文件哈希改变','PROVENANCE_CHANGED');return record.asset;
 }
 if(!record?.providerTaskId){
  insist(!record||record.status==='prepared','提交结果不确定，必须按已有记录对账，禁止再次付费提交','PROVIDER_RECONCILIATION');
  const previous=submissionLock;let release;submissionLock=new Promise(resolve=>{release=resolve;});await previous;
  let releaseLease;
  try{
   releaseLease=await submissionLease(path.dirname(file));
   record=JSON.parse(await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;}));
   insist(!record||record.providerTaskId||record.status==='prepared','提交结果不确定，必须先对账','PROVIDER_RECONCILIATION');
   if(!record?.providerTaskId){
   const authorization=config.authorization;
   insist(authorization?.source&&authorization.id&&Number.isSafeInteger(authorization.maxSubmissions)&&authorization.maxSubmissions>0,'缺少既有付费授权及调用上限，未自动设定费用','GENERATION_AUTHORIZATION');
   const records=await fs.readdir(path.dirname(file)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});let consumed=0;
   for(const name of records.filter(n=>n.endsWith('.json'))){const old=JSON.parse(await fs.readFile(path.join(path.dirname(file),name)));if(old.authorizationId===authorization.id&&old.submittedAt&&old.status!=='prepared')consumed++;}
   insist(consumed<authorization.maxSubmissions,'已达到授权生成调用上限','GENERATION_BUDGET');
   const form=new FormData();form.set('apiKey',process.env.RUNNINGHUB_API_KEY);form.set('file',new Blob([inputBytes]),path.basename(source));form.set('fileType','image');
   await event('upload');const response=await (io.fetch||fetch)(new URL('/task/openapi/upload',endpoint),{method:'POST',body:form,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});const upload=await response.json();
   insist(response.ok&&upload.code===0&&upload.data?.fileName,'RunningHub 原图上传失败','PROVIDER_UPLOAD');
   signal.throwIfAborted();
   const spec=submissionSpec(profile,{prompt,image:profile.mode==='model'?(upload.data.fileUrl||upload.data.fileName):upload.data.fileName,duration,aspect});
   record={recordId,requestHash,request,authorizationId:authorization.id,authorizationSource:authorization.source,status:'submitting',provider:'runninghub',submittedAt:new Date().toISOString(),cost:{amount:null,source:'provider bill pending'}};
   await write(file,record);await event('submit',{requestHash});
   const result=await call(spec.endpoint,{...spec.body,...(profile.mode!=='model'?{apiKey:process.env.RUNNINGHUB_API_KEY}:{})});
   const taskId=result.taskId||result.data?.taskId;insist(taskId,'供应商没有返回 taskId；需对账后恢复','PROVIDER_RECONCILIATION');
   record.providerTaskId=String(taskId);record.status='submitted';await write(file,record);await event('submitted',{providerTaskId:record.providerTaskId});
   }
  }finally{try{await releaseLease?.();}finally{release();}}
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
 }finally{await releaseRecord();}
}
