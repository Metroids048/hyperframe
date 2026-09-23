import {formalVideoSnapshot} from './lib/creative/delivery-gate.mjs';
import {deliveryRoutes} from './lib/creative/delivery-entry.mjs';
import {planShots,validateShots} from './lib/multishot.mjs';
import {createEditService,editRoutes} from './lib/edit/service.mjs';
import {EditError} from './lib/edit/timeline.mjs';
import {acquireRender} from './lib/render-queue.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
// Conditional sharp import for macOS compatibility
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (error) {
  console.warn('⚠️  Sharp unavailable (macOS signing issue) - image processing disabled');
  sharp = null;
}
import {optimizePrompt} from './lib/planner.mjs';
import {cases,demoOptimize,validateSettings} from './lib/demo-planner.mjs';
import {ROOT,STUDIO,STUDIO_URL,defaults,InputError,validateBrief,validateStoryboard,storyboard,compose,runHF,verifyVideo} from './lib/workflow.mjs';
import {buildCommerceProject,patchCommerceProject,renderCommerceProject} from './lib/creative/runner.mjs';
import {createCreativeService,creativeRoutes} from './lib/creative/service.mjs';
import {CreativeError} from './lib/creative/contracts.mjs';
import {MiniMaxError} from './lib/edit/adapters/minimax-client.mjs';
import {createCommerceEngineFacade} from './lib/openclaw/commerce-engine-facade.mjs';
import {acquireDirectoryLeases} from './lib/openclaw/directory-lease.mjs';
import {createOpenClawSessionBindings} from './lib/openclaw/session-bindings.mjs';
import {createOpenClawExecutionAuthorizations} from './lib/openclaw/execution-authorizations.mjs';
import {createCommerceAgentBridge,stableControlOperationId} from './lib/openclaw/commerce-agent-bridge.mjs';
import {bindOpenClawJobProgress,createOpenClawProgressNotifier} from './lib/openclaw/progress-notifier.mjs';
import {resolveCreativeDataDirectory} from './lib/runtime-project-directory.mjs';

// The native OpenClaw gateway and the workbench are launched by separate
// processes.  The gateway's launch agent persists their shared, non-source
// configuration in environment.json; without loading it here the bridge
// rejects every tool call even though the UI upload itself succeeded.  Never
// overwrite an explicitly supplied process environment and never log values.
try {
 const environmentFile=process.env.OPENCLAW_ENVIRONMENT_FILE||path.join(os.homedir(),'.openclaw','hyperframe','environment.json');
 const configured=JSON.parse(await fs.readFile(environmentFile,'utf8'));
 for(const [key,value] of Object.entries(configured||{}))if(process.env[key]==null&&typeof value==='string'&&value)process.env[key]=value;
} catch(error) { if(!['ENOENT','ENOTDIR','EACCES'].includes(error.code)) throw error; }

const PORT=Number(process.env.VIDEO_AGENT_PORT||3020),DATA=path.resolve(process.env.VIDEO_AGENT_DATA_DIR||path.join(ROOT,'data/projects')),EDIT_DATA=path.resolve(process.env.VIDEO_AGENT_EDIT_DATA_DIR||path.join(ROOT,'data/edit-projects'));
// OpenClaw 模式下,统一使用 STATE_ROOT 下的 projects 目录,避免相对路径问题
const OPENCLAW_STATE_ROOT=path.resolve(process.env.OPENCLAW_STATE_DIR||path.join(process.env.HOME||'', '.openclaw','hyperframe','state'));
const CREATIVE_DATA=await resolveCreativeDataDirectory({root:ROOT,stateRoot:OPENCLAW_STATE_ROOT});
const OPENCLAW_INBOUND_ROOT=path.resolve(process.env.OPENCLAW_INBOUND_MEDIA_DIR||path.join(OPENCLAW_STATE_ROOT,'media','inbound'));
const DEFAULT_OPENCLAW_VIDEO_UPLOAD_BYTES=64*1024*1024;
const OPENCLAW_MAX_VIDEO_BYTES=Number.isFinite(Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES))&&Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES)>0?Math.floor(Number(process.env.OPENCLAW_VIDEO_UPLOAD_MAX_BYTES)):DEFAULT_OPENCLAW_VIDEO_UPLOAD_BYTES;
const OPENCLAW_MAX_VIDEO_MIB=Math.round(OPENCLAW_MAX_VIDEO_BYTES/1024/1024);
const inboundMediaRefs=value=>[...new Set(String(value||'').match(/media:\/\/inbound\/[A-Za-z0-9._-]+/g)||[])];
// Test and recovery workers often use isolated project directories. Keep the
// OpenClaw journal/session stores in that same data root unless callers give
// explicit paths; otherwise an unrelated running server can lock startup.
const ISOLATED_DATA_ROOT=process.env.VIDEO_AGENT_DATA_DIR||process.env.VIDEO_AGENT_EDIT_DATA_DIR||process.env.VIDEO_AGENT_CREATIVE_DATA_DIR;
const OPENCLAW_ROOT=path.resolve(process.env.OPENCLAW_DATA_DIR||(ISOLATED_DATA_ROOT?path.join(path.dirname(path.resolve(ISOLATED_DATA_ROOT)),'openclaw-bridge'):path.join(ROOT,'data','openclaw-bridge')));
const OPENCLAW_JOURNAL=path.resolve(process.env.OPENCLAW_JOURNAL_PATH||path.join(OPENCLAW_ROOT,'operations.json')),OPENCLAW_SESSIONS=path.resolve(process.env.OPENCLAW_SESSION_BINDINGS_PATH||path.join(OPENCLAW_ROOT,'sessions.json')),OPENCLAW_AUTHORIZATIONS=path.resolve(process.env.OPENCLAW_AUTHORIZATIONS_PATH||path.join(OPENCLAW_ROOT,'authorizations.json')),WEB=path.join(ROOT,'web-dist');
const workspaceId=createHash('sha256').update(process.platform==='win32'?ROOT.replaceAll('\\','/').toLowerCase():ROOT).digest('hex');
const writerLeases=await acquireDirectoryLeases([DATA,EDIT_DATA,CREATIVE_DATA,path.dirname(OPENCLAW_JOURNAL),path.dirname(OPENCLAW_SESSIONS),path.dirname(OPENCLAW_AUTHORIZATIONS)],{owner:'video-agent-server'});
const editor=await createEditService({dataDir:EDIT_DATA});
const creative=await createCreativeService({dataDir:CREATIVE_DATA});
const openclawAuthorizations=createOpenClawExecutionAuthorizations({file:OPENCLAW_AUTHORIZATIONS});
const openclawProgressNotifier=createOpenClawProgressNotifier();
const commerceEngine=createCommerceEngineFacade(creative,{journalPath:OPENCLAW_JOURNAL,authorizeWrite:request=>openclawAuthorizations.validateAndBind(request)});
const openclawSessions=createOpenClawSessionBindings({file:OPENCLAW_SESSIONS,workspaceId});
const commerceAgentBridge=createCommerceAgentBridge({workspaceId,legacyDispatch:creative.dispatchMessage,projectView:creative.view,authorizationStore:openclawAuthorizations,operationJournal:commerceEngine.getJournal,recordControlResult:creative.recordControlResult});
const projects=new Map(),writes=new Map();let active=null,studioProject=null,studioBusy=false,accepting=true;
await fs.mkdir(DATA,{recursive:true});
async function save(p){const snapshot=JSON.stringify(p,null,2),file=path.join(DATA,p.id,'project.json');const task=(writes.get(p.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.writeFile(file+'.tmp',snapshot);await fs.rename(file+'.tmp',file);});writes.set(p.id,task);await task;}
for(const id of await fs.readdir(DATA)){if(!/^[a-f0-9-]{36}$/.test(id))continue;try{const p=JSON.parse(await fs.readFile(path.join(DATA,id,'project.json'),'utf8'));if(['queued','composing','checking','rendering'].includes(p.status)){p.status='failed';p.error='服务重启，中断了上次任务。输入已保留，可以重试。';await save(p);}projects.set(id,p);}catch{}}
function get(id){const p=projects.get(id);if(!p)throw new InputError('项目不存在',404);return p;}
function view(p){const s=p.requestedSettings||{duration:15,aspect:'16:9',quality:'720p'},duration=p.engine==='multishot-v1'?p.storyboard.at(-1).end:15;return {...p,requestedSettings:s,actualSettings:{duration,aspect:'16:9',quality:'720p'},renderNotice:s.aspect!=='16:9'||s.quality!=='720p'?'时长与镜头设置实际生效；本轮输出横屏 720p，其他画幅与画质仅保存需求。':null,videoUrl:p.status==='complete'?`/api/projects/${p.id}/video`:null,storyboardUrl:`/api/projects/${p.id}/storyboard`,imageUrls:Array.from({length:p.assetCount||3},(_,n)=>`/api/projects/${p.id}/image/${n+1}`),studioUrl:studioProject===p.id?STUDIO_URL:null};}
async function stage(p,status,progress){p.status=status;p.progress=progress;p.updatedAt=new Date().toISOString();await save(p);}
async function pump(){
 if(active||!accepting)return;const p=[...projects.values()].find(p=>p.status==='queued');if(!p)return;active=p.id;const dir=path.join(DATA,p.id);const releaseRender=await acquireRender();
 try{
  await stage(p,'composing',12);await compose(dir,p.brief,p.storyboard);
  await stage(p,'checking',25);await runHF(dir,['check'],{timeoutMs:60000,logFile:path.join(dir,'check.log')});
  await stage(p,'rendering',45);let last=0;
  await runHF(dir,['render','--output','video.mp4','--fps','30','--quality','standard','--workers','1','--strict'],{logFile:path.join(dir,'render.log'),onOutput:s=>{const matches=[...s.matchAll(/(\d+)%/g)];if(matches.length&&Date.now()-last>1000){last=Date.now();p.progress=Math.min(97,45+Math.floor(Number(matches.at(-1)[1])*.52));save(p).catch(console.error);}}});
  p.media=await verifyVideo(path.join(dir,'video.mp4'),{duration:p.engine==='multishot-v1'?p.storyboard.at(-1).end:15,width:1280,height:720});p.error=null;await stage(p,'complete',100);
 }catch(e){p.error=e.message;await stage(p,'failed',p.progress||0);}finally{releaseRender();active=null;void pump();}
}
async function body(req,max=100*1024*1024){let count=0;const chunks=[];for await(const chunk of req){count+=chunk.length;if(count>max)throw new InputError(`请求内容超过大小限制（${Math.ceil(max/1024)} KB）`,413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function jsonBody(req,max,label){
 const bytes=await body(req,max);let input;
 try{input=JSON.parse(bytes.toString());}catch{throw new InputError(label+'格式不正确');}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError(label+'格式不正确');
 return input;
}
async function openclawToolRoute(req,res){
 const configured=process.env.OPENCLAW_BRIDGE_TOKEN;
 const authorization=String(req.headers.authorization||'');
 if(!configured||authorization!==('Bearer '+configured))throw new InputError('OpenClaw bridge authorization required',401);
 const input=await jsonBody(req,256000,'OpenClaw tool request');
 if(!input.trustedContext||input.trustedContext.trusted!==true)throw new InputError('Trusted tool context required',403);
 if(input.trustedContext.workspaceId!==workspaceId)throw new InputError('Workspace scope mismatch',403);
 const requestedProject=input.input?.projectId;
 const hasProject=id=>typeof id==='string'&&id.trim()&&typeof creative.has==='function'&&creative.has(id);
 if(requestedProject!=null && !['current','new'].includes(requestedProject) && !hasProject(requestedProject)){
  // A model can occasionally repeat a stale UUID.  Reads should report a
  // typed not-found result so the agent can recover; do not let a bad read
  // poison the trusted session or turn into a generic plugin error.
  if(input.tool==='video_project_open'){
   const projects=typeof creative.list==='function'?creative.list().slice(0,20).map(project=>({id:project.id,name:project.title||project.name||'未命名视频',currentRevisionId:project.currentRevisionId||null})):[];
   return json(res,{ok:true,result:{schemaVersion:'openclaw-commerce.v1',tool:'video_project_open',status:'not_found',projectId:String(requestedProject),operationId:null,projects,message:'工程不存在；可使用 video_project_list 查看真实工程'}});
  }
  throw new InputError('原生项目不存在，请使用真实工程 ID 或省略工程 ID创建新任务',404);
 }
 let trustedContext;
 // Any explicit, valid project is an intentional session transition.  The
 // low-level bind() primitive still rejects accidental cross-project access;
 // this route uses replace() only after the server has validated the project
 // and the tool's authorization has been checked.
 if(requestedProject && !['current','new'].includes(requestedProject)) trustedContext=await openclawSessions.replace(input.trustedContext,requestedProject);
 else trustedContext=await openclawSessions.bind(input.trustedContext,null);
 let normalizedInput=requestedProject==='current'&&trustedContext.workspaceProjectId?{...(input.input||{}),projectId:trustedContext.workspaceProjectId}:{...(input.input||{})};
 // Native Control UI puts media receipts into the model's message text when
 // an attachment and caption are submitted together. Canonicalize those
 // server-issued receipts before authorization/import so the same request
 // cannot become an empty project merely because the optional array fields
 // were omitted by the model.
 if(!((Array.isArray(normalizedInput.attachmentPaths)&&normalizedInput.attachmentPaths.length)||(Array.isArray(normalizedInput.attachmentIds)&&normalizedInput.attachmentIds.length))){
  const refs=inboundMediaRefs(normalizedInput.message);
  if(refs.length)normalizedInput={...normalizedInput,attachmentPaths:refs};
 }
 // Models may place the Control UI's opaque media receipt in either field:
 // `attachmentPaths` is the documented form, while some providers naturally
 // treat the receipt as an attachment id. Canonicalize both before import so
 // a valid upload can never become a phantom asset id and an empty project.
 const receiptIds=Array.isArray(normalizedInput.attachmentIds)
  ? normalizedInput.attachmentIds.filter(value=>typeof value==='string'&&value.startsWith('media://inbound/'))
  : [];
 if(receiptIds.length){
  normalizedInput={
   ...normalizedInput,
   attachmentPaths:[...(Array.isArray(normalizedInput.attachmentPaths)?normalizedInput.attachmentPaths:[]),...receiptIds],
   attachmentIds:normalizedInput.attachmentIds.filter(value=>!receiptIds.includes(value))
  };
 }
 // Control UI uploads are materialized by OpenClaw under its inbound media
 // directory. Import only those files, never arbitrary model-provided paths.
 // The operation remains behind the normal project/session authorization.
  const attachmentPaths=Array.isArray(normalizedInput.attachmentPaths)?normalizedInput.attachmentPaths:[];
 if(attachmentPaths.length){
  // Bind the server-issued authorization before touching any uploaded bytes.
  // This keeps malformed or unauthorized tool calls side-effect free.
  if(!normalizedInput.authorizationId||!normalizedInput.operationId)throw new InputError('OpenClaw 附件导入需要已签发的写授权',403);
  await openclawAuthorizations.validateAndBind({tool:input.tool,input:normalizedInput,context:trustedContext});
  // Idempotent retries must not materialize the same inbound file again. The
  // first attempt records the imported asset ids in the operation journal;
  // reuse that result (or fail closed while submission state is unknown)
  // before touching the inbound filesystem on a retry.
  const existing=(await commerceEngine.getJournal()).operations?.[normalizedInput.operationId];
  if(existing?.status==='completed')return json(res,{ok:true,result:existing.result});
  if(existing&&['started','submission_unknown'].includes(existing.status))throw new InputError('operationId 可能已提交但结果未知，禁止重复导入附件',409);
  const inboundRootBase=OPENCLAW_INBOUND_ROOT;
  const inboundRoot=await fs.realpath(inboundRootBase).catch(()=>inboundRootBase);
  let projectId=String(normalizedInput.projectId||'');
  let project=projectId&&hasProject(projectId)?creative.get(projectId):null;
  if(!project && input.tool==='video_task' && typeof creative.create==='function'){
   project=await creative.create({message:String(normalizedInput.message||''),inferRequest:true,taskMode:'create',taskModeExplicit:true,commerceProfile:'commerce-focus-v1',source:'openclaw-request'});
   projectId=project.id;normalizedInput.projectId=projectId;normalizedInput.baseRevisionId=null;
   trustedContext=await openclawSessions.replace(input.trustedContext,projectId);
  }
  if(!project)throw new InputError('视频附件导入需要有效工程',400);
  const importedAttachmentIds=[...(normalizedInput.attachmentIds||[])];
  for(const raw of attachmentPaths){
   // Some OpenClaw turns repeat a project-local asset reference after the
   // upload has already been materialized. It is safe to reuse it only when
   // the resolved project owns that exact normalized asset path; never treat a
   // free-form local path as an inbound upload.
   const projectAsset=project?.assets?.find(asset=>{
    const refs=[asset.path,asset.normalizedRef].filter(Boolean).map(String);
    return refs.includes(String(raw))&&/^uploads\//.test(String(raw));
   });
   if(projectAsset?.id){importedAttachmentIds.push(projectAsset.id);continue;}
   // Native Control UI video uploads return a server-issued media:// receipt.
   // Resolve only the opaque receipt issued by the upload endpoint. Never
   // accept model-supplied local paths, even when they happen to be inbound.
   const ref=String(raw);
   if(/^https?:\/\//i.test(ref))throw new InputError('视频附件不能使用远程 URL，请通过附件按钮上传 MP4、MOV 或 WebM 视频',400);
   if(!ref.startsWith('media://inbound/'))throw new InputError('视频附件路径无效，请通过附件按钮上传 MP4、MOV 或 WebM 视频',400);
   const candidate=ref.startsWith('media://inbound/')
    ? path.join(inboundRoot, path.basename(ref.slice('media://inbound/'.length)))
    : path.resolve(ref);
   const candidateReal=await fs.realpath(candidate).catch(()=>null);
   const relative=candidateReal?path.relative(inboundRoot,candidateReal):'..';
   if(!candidateReal||!relative||path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))throw new InputError('OpenClaw 附件路径不在受信入站目录内',403);
   const stat=await fs.stat(candidateReal).catch(()=>null);if(!stat?.isFile())throw new InputError('OpenClaw 附件不存在',400);
   if(stat.size>OPENCLAW_MAX_VIDEO_BYTES)throw new InputError(`OpenClaw 视频不能超过 ${OPENCLAW_MAX_VIDEO_MIB} MiB`,413);
   if(!/\.(?:mp4|mov|webm)$/i.test(path.basename(candidateReal)))throw new InputError('OpenClaw 仅支持 MP4、MOV、WebM 视频',415);
   const asset=await creative.upload(project,createReadStream(candidateReal),path.basename(candidateReal));
   if(asset?.id) importedAttachmentIds.push(asset.id);
  }
  normalizedInput.attachmentIds=[...new Set(importedAttachmentIds)];
  delete normalizedInput.attachmentPaths;
 }
 const result=await commerceEngine.invoke(input.tool,normalizedInput,trustedContext);
 if(input.tool==='video_task'&&result?.projectId&&result?.jobId&&typeof creative.subscribeJobProgress==='function'){
  const progress=bindOpenClawJobProgress({service:creative,notifier:openclawProgressNotifier,projectId:result.projectId,jobId:result.jobId,sessionKey:input.trustedContext.sessionKey});
  result.proactiveProgress={status:progress.status,sessionBound:true,percentPolicy:'real-render-progress-only'};
 }
 if(input.tool==='commerce_project_create'&&result?.created===true&&result?.projectId){
  // Creating a project is the one explicit operation allowed to advance a
  // native Control UI session to a new project. Other cross-project access
  // remains rejected by bind().
  await openclawSessions.replace(input.trustedContext,result.projectId);
 }
 return json(res,{ok:true,result});
}
async function openclawAuthorizationRoute(req,res){
 const configured=process.env.OPENCLAW_BRIDGE_TOKEN;
 if(!configured||String(req.headers.authorization||'')!==('Bearer '+configured))throw new InputError('OpenClaw bridge authorization required',401);
 const body=await jsonBody(req,256000,'OpenClaw authorization request');
 if(!body.trustedContext||body.trustedContext.trusted!==true)throw new InputError('Trusted tool context required',403);
 if(body.trustedContext.workspaceId!==workspaceId)throw new InputError('Workspace scope mismatch',403);
 const input=body.input||{},requestedProjectId=input.projectId==null||input.projectId===''?'':String(input.projectId);
 const hasProject=id=>typeof id==='string'&&id.trim()&&typeof creative.has==='function'&&creative.has(id);
 const attachmentCount=(Array.isArray(input.attachmentIds)?input.attachmentIds.length:0)+(Array.isArray(input.attachmentPaths)?input.attachmentPaths.length:0);
 const session=await openclawSessions.bind(body.trustedContext,null);
 const currentProjectId=hasProject(session.workspaceProjectId)?session.workspaceProjectId:null;
 const messageText=String(input.message||'');
 const explicitNewTask=/(?:新建|创建|制作|生成|做一条|做个|宣传片|营销片|新品|商品视频|产品视频)/u.test(messageText)
   && !/(?:把|将|修改|编辑|调整|替换|换成|改成|改为|第[一二三四五六七八九十0-9]+个镜头|这条视频|本视频|原片|原视频)/u.test(messageText);
 let projectId;
 if(body.tool==='video_task'||body.tool==='video_prepare'){
  // Project binding is a convenience for continuing a conversation, not a
  // prerequisite.  A new upload starts a new editable project; a text-only
  // follow-up reuses the current project when one exists; an invalid/stale
  // model UUID is never trusted and falls back to the same rules.
  if(requestedProjectId==='new') projectId=null;
  else if(requestedProjectId&&requestedProjectId!=='current'&&hasProject(requestedProjectId)) projectId=requestedProjectId;
  else if(requestedProjectId==='current') projectId=currentProjectId;
  else if(requestedProjectId&&!hasProject(requestedProjectId)) projectId=attachmentCount?null:currentProjectId;
  else projectId=(attachmentCount||explicitNewTask)?null:currentProjectId;
  if(!projectId){
   const created=await creative.create({message:String(input.message||''),inferRequest:true,taskMode:'create',taskModeExplicit:true,commerceProfile:'commerce-focus-v1',source:'openclaw-request'});
   projectId=created.id;await openclawSessions.replace(body.trustedContext,projectId);
  }
 } else {
  projectId=requestedProjectId||currentProjectId;
  if(!projectId||!hasProject(projectId))throw new InputError('该工具需要真实工程 ID，请先使用 video_project_list',404);
 }
 const project=creative.get(projectId);
 const context=await openclawSessions.replace(body.trustedContext,projectId);
 const messageId=String(body.trustedContext.messageId||'');
 if(!messageId)throw new InputError('OpenClaw inbound message identity required',403);
 const currentRevisionId=project.currentRevisionId||null;
 // Treat omitted, null, and the literal string "null" as "use the current
 // revision".  Preserve any other explicit value so a genuine stale edit
 // still fails closed with REVISION_CONFLICT.
 const suppliedBase=input.baseRevisionId;
 const baseRevisionId=typeof suppliedBase==='string'&&suppliedBase.trim()&&suppliedBase!=='null'?suppliedBase:currentRevisionId;
 const operationId=stableControlOperationId(projectId,messageId,{message:String(input.message||body.tool),baseRevisionId,attachmentIds:input.attachmentIds||[],attachmentPaths:input.attachmentPaths||[],taskMode:input.taskMode||null,scenarioId:input.scenarioId||null,workflowProfile:input.workflowProfile||null,selectedNodeId:input.selectedNodeId||null,platform:input.platform||null,output:input.output||null,audio:input.audio||null,resumeJobId:input.resumeJobId||null});
 const authorization=await openclawAuthorizations.issue({projectId,baseRevisionId,messageId,message:String(input.message||body.tool),sessionKey:context.sessionKey,allowedTools:[body.tool]});
 return json(res,{ok:true,authorizationId:authorization.authorizationId,operationId,projectId,baseRevisionId,expiresAt:authorization.expiresAt});
}
async function createProject(req){
 const type=req.headers['content-type']||'';if(!type.startsWith('multipart/form-data;'))throw new InputError('请使用表单上传');
 let form;try{const bytes=await body(req);form=await new Request(`http://127.0.0.1:${PORT}/`,{method:'POST',headers:{'content-type':type},body:bytes}).formData();}catch(e){if(e instanceof InputError)throw e;throw new InputError('上传表单无法解析');}
 let input;try{input=JSON.parse(form.get('brief'));}catch{throw new InputError('商品信息格式不正确');}
 const brief=validateBrief(input),files=form.getAll('images').filter(f=>typeof f==='object'&&f.size),useExample=form.get('useExample')==='true',parentId=form.get('reuseFrom')||null;
 let requestedSettings;try{requestedSettings=validateSettings(JSON.parse(form.get('settings')||'{}'));}catch(e){if(e instanceof InputError)throw e;throw new InputError('视频设置格式不正确');}
 const description=String(form.get('description')||'');if(description.length>3000)throw new InputError('需求描述最多 3000 字');
 const caseId=String(form.get('caseId')||'qing');if(useExample&&!cases.some(c=>c.id===caseId))throw new InputError('示例不存在');
 if(files.length>12)throw new InputError('最多上传十二张图片');
 if(!files.length&&!useExample&&!parentId)throw new InputError('请上传商品图，或选择示例素材');
 const images=[];let source='upload';
 if(files.length){for(const file of files){if(file.size>8*1024*1024)throw new InputError('每张图片不能超过 8 MB',413);if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new InputError('仅支持 PNG、JPEG、WebP 图片');try{const bytes=Buffer.from(await file.arrayBuffer()),meta=await sharp(bytes,{limitInputPixels:20000000}).metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1||meta.width<64||meta.height<64)throw Error();images.push(await sharp(bytes,{limitInputPixels:20000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).png().toBuffer());}catch{throw new InputError('图片损坏、尺寸过小，或超过 2000 万像素，请换一张图片');}}}
 else if(parentId){get(parentId);source='reused';for(let n=1;n<=(get(parentId).assetCount||3);n++)images.push(await fs.readFile(path.join(DATA,parentId,'assets',`product${n}.png`)));}
 else{source='example';images.push(await fs.readFile(path.join(ROOT,'assets/cases',caseId+'.png')));}
 const id=randomUUID(),dir=path.join(DATA,id);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
 const assetCount=images.length;brief.assetCount=assetCount;brief.duration=requestedSettings.duration;
 for(let n=1;n<=assetCount;n++)await fs.writeFile(path.join(dir,'assets',`product${n}.png`),images[Math.min(n-1,images.length-1)]);
 const p={id,version:'0.6.0-demo',parentId:parentId&&projects.has(parentId)?parentId:null,brief,description,requestedSettings,caseId:useExample?caseId:null,source,assetCount,engine:'multishot-v1',imageCount:images.length,status:'awaiting_confirmation',progress:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),storyboard:planShots(brief,requestedSettings,assetCount),error:null};
 await fs.writeFile(path.join(dir,'brief.json'),JSON.stringify(brief,null,2));await fs.writeFile(path.join(dir,'storyboard.json'),JSON.stringify(p.storyboard,null,2));projects.set(id,p);await save(p);return p;
}
async function loadStudio(p){
 if(p.status!=='complete')throw new InputError('视频完成后即可进入工作台',409);
 if(studioBusy)throw new InputError('工作台正在加载，请稍后重试',409);studioBusy=true;
 try{
  if(studioProject!==p.id){await fs.mkdir(path.join(STUDIO,'assets'),{recursive:true});const dir=path.join(DATA,p.id);for(const name of [...Array.from({length:p.assetCount||3},(_,n)=>'product'+(n+1)+'.png'),'music.wav','gsap.min.js'])await fs.copyFile(path.join(dir,'assets',name),path.join(STUDIO,'assets',name));for(const file of ['DESIGN.md','hyperframes.json','index.html'])await fs.copyFile(path.join(dir,file),path.join(STUDIO,file));await fs.writeFile(path.join(STUDIO,'meta.json'),JSON.stringify({id:'studio-workspace',name:`${p.brief.brand} · ${p.brief.product}`}));}
  await runHF(STUDIO,['preview','--background','--port','3018'],{timeoutMs:60000,logFile:path.join(STUDIO,'preview.log')});studioProject=p.id;return {url:STUDIO_URL,projectId:p.id};
 }finally{studioBusy=false;}
}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
const commerceId=/^[a-zA-Z0-9_-]{1,100}$/;
function commerceOutputDir(id){if(!commerceId.test(id))throw new InputError('商品工程 ID 无效');return path.join(ROOT,'data/commerce-runs',id);}
async function file(req,res,target,type,download){
 const requestedFormal=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).searchParams.get('delivery')==='formal';
 const approvedSnapshot=path.dirname(path.resolve(target))===path.join(ROOT,'.state/commerce-deliveries')&&/^[a-f0-9]{64}\.mp4$/.test(path.basename(target));
 if(requestedFormal&&!approvedSnapshot)throw new InputError('此文件尚未通过正式交付门禁',409);
 if(type==='video/mp4'){res.setHeader('X-Delivery-Status',requestedFormal?'accepted':'candidate');if(download)download=(requestedFormal?'accepted-':'candidate-')+path.basename(target);}

 const stat=await fs.stat(target).catch(e=>{if(e.code==='ENOENT')throw new InputError('文件不存在',404);throw e;});const headers={'Content-Type':type,'Content-Length':stat.size,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'};if(download)headers['Content-Disposition']=`attachment; filename="${download}"`;
 const range=req.headers.range;let start=0,end=stat.size-1,status=200;
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}if(m[1]){start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;}else start=Math.max(0,stat.size-Number(m[2]));if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;headers['Content-Length']=end-start+1;}
 res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}createReadStream(target,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
const server=http.createServer(async(req,res)=>{
 try{
  const allowed=[`127.0.0.1:${PORT}`,`localhost:${PORT}`];if(!allowed.includes(req.headers.host))throw new InputError('无效的本地访问地址',403);
  const origin=req.headers.origin;if(origin&&!allowed.some(h=>origin===`http://${h}`))throw new InputError('此操作只允许在本地制作页面发起',403);
  const url=new URL(req.url,`http://127.0.0.1:${PORT}`),route=url.pathname;
  if(req.method==='POST'&&route==='/api/openclaw/authorize')return await openclawAuthorizationRoute(req,res);
  if(req.method==='POST'&&route==='/api/openclaw/tools')return await openclawToolRoute(req,res);
  if(await deliveryRoutes(ROOT,req,res,url,{file,json,creative}))return;
  if(await editRoutes(editor,req,res,url,{json,jsonBody,file}))return;
  if(await creativeRoutes(creative,req,res,url,{json,jsonBody,file,dispatchMessage:commerceAgentBridge.dispatchMessage}))return;
  // Native commerce projects use the same editable document/runner as the
  // CLI, exposed here through a small allow-listed bridge for the chat UI and
  // agent tools. Paths and file names never come from an arbitrary URL.
  if(req.method==='POST'&&route==='/api/commerce'){
   const input=await jsonBody(req,256000,'商品视频请求'),action=input.action||'create';
   let result;
   if(action==='create')result=await buildCommerceProject(input.request||input);
   else if(action==='patch'){const outputDir=input.outputDir||`data/commerce-runs/${input.projectId||''}`;result=await patchCommerceProject({...input,outputDir});}
   else if(action==='render'){const outputDir=input.outputDir||`data/commerce-runs/${input.projectId||''}`;result=await renderCommerceProject({...input,outputDir});}
   else throw new InputError('不支持的商品视频操作');
   return json(res,{ok:true,action,result},action==='create'?201:200);
  }
  // Conversation-first commerce entry point. Accepts product images directly
  // from the browser, composes a native HyperFrames document, and renders a
  // continuous MP4 in the same request so the chat can immediately preview it.
  if(req.method==='POST'&&route==='/api/commerce-chat'){
   const type=req.headers['content-type']||'';
   if(type.startsWith('multipart/form-data;')){
    let form;try{const bytes=await body(req);form=await new Request(`http://127.0.0.1:${PORT}/`,{method:'POST',headers:{'content-type':type},body:bytes}).formData();}catch{throw new InputError('上传表单无法解析');}
    const files=form.getAll('images').filter(f=>typeof f==='object'&&f.size);if(!files.length)throw new InputError('请上传至少一张商品图片');if(files.length>12)throw new InputError('最多上传十二张图片');
    const id=randomUUID(), outputDir=path.join(ROOT,'data/commerce-runs',id), uploadDir=path.join(outputDir,'uploads');await fs.mkdir(uploadDir,{recursive:true});
    const assets=[];for(let i=0;i<files.length;i++){const file=files[i];if(file.size>64*1024*1024)throw new InputError('每个图片或视频不能超过 64 MB',413);const bytes=Buffer.from(await file.arrayBuffer());const isVideo=['video/mp4','video/quicktime','video/webm'].includes(file.type);if(!isVideo&&!['image/png','image/jpeg','image/webp'].includes(file.type))throw new InputError('仅支持 PNG、JPEG、WebP、MP4、MOV、WebM');const ext=isVideo?(file.type==='video/webm'?'.webm':file.type==='video/quicktime'?'.mov':'.mp4'):'.png';const name=`product-${i+1}${ext}`;if(isVideo)await fs.writeFile(path.join(uploadDir,name),bytes);else await sharp(bytes,{limitInputPixels:20000000}).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).png().toFile(path.join(uploadDir,name));assets.push({id:`asset-${i+1}`,path:`data/commerce-runs/${id}/uploads/${name}`,kind:isVideo?'video':'image',role:i===0?'hero':'detail',rights:{status:'user-provided'}});}
    const parseJson=(key,fallback)=>{try{return JSON.parse(String(form.get(key)||''))||fallback;}catch{return fallback;}};
    const product=parseJson('product',{name:String(form.get('productName')||'商品展示'),facts:String(form.get('facts')||'').split(/[、,，\n]/).map(x=>x.trim()).filter(Boolean),price:String(form.get('price')||'').trim()||null,cta:String(form.get('cta')||'了解更多').trim()||'了解更多'});
    const output=parseJson('output',{width:1080,height:1920,durationSeconds:Number(form.get('duration')||15)});
    const result=await buildCommerceProject({projectId:id,style:String(form.get('style')||'premium'),creativeMode:String(form.get('creativeMode')||'mixed'),message:String(form.get('message')||''),product,assets,output,render:true,outputDir:`data/commerce-runs/${id}`});
    return json(res,{ok:true,action:'create',result,message:'已生成可连续播放的商品宣传视频'},201);
   }
   const input=await jsonBody(req,256000,'商品对话请求'),action=input.action||'patch';if(!['patch','render'].includes(action))throw new InputError('不支持的商品对话操作');const projectId=String(input.projectId||'');const outputDir=input.outputDir||`data/commerce-runs/${projectId}`;const result=action==='patch'?await patchCommerceProject({...input,outputDir,render:input.render!==false}):await renderCommerceProject({...input,outputDir});return json(res,{ok:true,action,result});
  }
  const commerceFile=/^\/api\/commerce\/([a-zA-Z0-9_-]{1,100})\/(status|document|preview|video)$/.exec(route);
  if(commerceFile&&['GET','HEAD'].includes(req.method)){
   const dir=commerceOutputDir(commerceFile[1]),kind=commerceFile[2];
   const targets={status:['status.json','application/json; charset=utf-8'],document:['document.json','application/json; charset=utf-8'],preview:['index.html','text/html; charset=utf-8'],video:['commerce-final.mp4','video/mp4']};
   const [name,type]=targets[kind];if(kind==='video'&&!(await fs.access(path.join(dir,name)).then(()=>true).catch(()=>false)))throw new InputError('商品视频尚未导出',409);
   let servedPath=path.join(dir,name);if(kind==='video'){if(url.searchParams.get('delivery')==='formal')servedPath=await formalVideoSnapshot(ROOT,dir);else res.setHeader('X-Delivery-Status','candidate');}
   return await file(req,res,servedPath,type,kind==='video'?`candidate-${commerceFile[1]}.mp4`:null);
  }
  if(['GET','HEAD'].includes(req.method)&&route==='/editor-player.js')return await file(req,res,path.join(ROOT,'node_modules/hyperframes/dist/hyperframes-player.global.js'),'text/javascript; charset=utf-8');
  if(req.method==='GET'&&(route==='/api/health'||route==='/health'))return json(res,{ok:true,version:'0.7.0-conversation',workspaceId,workbench:'commerce',agentRuntime:commerceAgentBridge.mode,activeProjectId:active,studioProjectId:studioProject,openclawMedia:{stateRoot:OPENCLAW_STATE_ROOT,inboundRoot:OPENCLAW_INBOUND_ROOT}});
  if(req.method==='POST'&&route==='/api/optimize'){const input=await jsonBody(req,16000,'需求描述');if(input.mode==='live'&&process.env.VIDEO_AGENT_LIVE_CODEX!=='1')throw new InputError('实时 Codex 当前未启用：上次模型连接超时。请使用演示整理，或手动补充；输入已保留。',503);return json(res,input.mode==='live'?await optimizePrompt(input.text):demoOptimize(input.text));}
  if(req.method==='GET'&&route==='/api/cases')return json(res,await Promise.all(cases.map(async c=>({...c,ready:await fs.access(path.join(ROOT,'showcase',c.id,'media.json')).then(()=>true).catch(()=>false),imageUrl:`/cases/${c.id}/image`,videoUrl:`/cases/${c.id}/video`}))));
  const ce=/^\/api\/cases\/([a-z]+)\/edit$/.exec(route);
  if(req.method==='POST'&&ce){const c=cases.find(c=>c.id===ce[1]);if(!c)throw new InputError('案例不存在',404);const e=await editor.importFile(path.join(ROOT,'showcase',c.id,'video.mp4'),c.title+'.mp4',{originProjectId:'case-'+c.id});return json(res,{projectId:e.id,url:`/edit?project=${e.id}`});}
  const cm=/^\/cases\/([a-z]+)\/(image|video)$/.exec(route);if(req.method==='GET'&&cm){if(!cases.some(c=>c.id===cm[1]))throw new InputError('案例不存在',404);return await file(req,res,cm[2]==='image'?path.join(ROOT,'assets/cases',cm[1]+'.png'):path.join(ROOT,'showcase',cm[1],'video.mp4'),cm[2]==='image'?'image/png':'video/mp4');}
  if(req.method==='GET'&&route==='/api/demos'){let list=[];try{list=JSON.parse(await fs.readFile(path.join(ROOT,'demos.json'),'utf8'));}catch{}return json(res,list.filter(x=>projects.has(x.projectId)&&get(x.projectId).status==='complete').map(x=>({...view(get(x.projectId)),demoTitle:x.title})));}
  if(req.method==='GET'&&route==='/api/sample')return json(res,{brief:defaults,videoUrl:'/sample/video',imageUrl:'/sample/image'});
  if(req.method==='GET'&&route==='/api/projects')return json(res,[...projects.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(view));
  if(req.method==='POST'&&route==='/api/projects')return json(res,view(await createProject(req)),201);
  const m=/^\/api\/projects\/([a-f0-9-]{36})(?:\/(render|studio|edit|video|storyboard|image\/(?:[1-9]|1[0-2])))?$/.exec(route);
  if(m){const p=get(m[1]),action=m[2],dir=path.join(DATA,p.id);
   if(req.method==='GET'&&!action)return json(res,view(p));
   if(req.method==='PATCH'&&action==='storyboard'){
    const input=await jsonBody(req,24000,'分镜');
    if(!['awaiting_confirmation','failed','complete'].includes(p.status))throw new InputError('正在生成，请完成后再修改分镜',409);
    const edited=p.engine==='multishot-v1'?validateShots(input.storyboard,p.assetCount):validateStoryboard(input.storyboard,p.brief);
    // Every edit gets an isolated draft, so renders and existing outputs never change underneath one another.
    const id=randomUUID(),revisionDir=path.join(DATA,id),now=new Date().toISOString();
    const revision={...p,id,parentId:p.id,brief:{...p.brief,duration:p.engine==='multishot-v1'?edited.at(-1).end:15},version:'0.6.0-demo',status:'awaiting_confirmation',progress:0,error:null,media:null,storyboard:edited,requestedSettings:{...p.requestedSettings,duration:p.engine==='multishot-v1'?edited.at(-1).end:15},createdAt:now,updatedAt:now};
    await fs.mkdir(path.join(revisionDir,'assets'),{recursive:true});
    for(let n=1;n<=(p.assetCount||3);n++)await fs.copyFile(path.join(dir,'assets',`product${n}.png`),path.join(revisionDir,'assets',`product${n}.png`));
    await fs.writeFile(path.join(revisionDir,'brief.json'),JSON.stringify(revision.brief,null,2));await fs.writeFile(path.join(revisionDir,'storyboard.json'),JSON.stringify(edited,null,2));await save(revision);projects.set(id,revision);return json(res,view(revision),201);
   }
   if(req.method==='POST'&&action==='render'){if(['awaiting_confirmation','failed'].includes(p.status)){p.error=null;await stage(p,'queued',2);void pump();}return json(res,view(p),202);}
   if(req.method==='POST'&&action==='studio')return json(res,await loadStudio(p));
   if(req.method==='POST'&&action==='edit'){
     if(p.status!=='complete')throw new InputError('视频完成后即可对话剪辑',409);
     const e=await editor.importFile(path.join(dir,'video.mp4'),`${p.brief.brand} · ${p.brief.product}.mp4`,{originProjectId:p.id});return json(res,{projectId:e.id,url:`/edit?project=${e.id}`});
   }
   if(['GET','HEAD'].includes(req.method)&&action==='video'){if(p.status!=='complete')throw new InputError('视频尚未完成',409);return await file(req,res,path.join(dir,'video.mp4'),'video/mp4',url.searchParams.has('download')?`product-video-${p.id.slice(0,8)}.mp4`:null);}
   if(req.method==='GET'&&action==='storyboard')return await file(req,res,path.join(dir,'storyboard.json'),'application/json; charset=utf-8','storyboard.json');
   if(req.method==='GET'&&action?.startsWith('image/')&&Number(action.split('/')[1])<=(p.assetCount||3))return await file(req,res,path.join(dir,'assets',`product${Number(action.split('/')[1])}.png`),'image/png');
  }
  if(['GET','HEAD'].includes(req.method)&&route==='/sample/video'){const generated=path.join(ROOT,'outputs/qing-demo.mp4'),target=await fs.access(generated).then(()=>generated).catch(()=>path.join(ROOT,'showcase/qing/video.mp4'));return await file(req,res,target,'video/mp4');}
  if(req.method==='GET'&&route==='/sample/image')return await file(req,res,path.join(ROOT,'assets/product.png'),'image/png');
  const assets={'/creative-studio':['creative-studio.html','text/html; charset=utf-8'],'/creative-v2':['creative-v2.html','text/html; charset=utf-8'],'/creative-v2/text-demo/final.mp4':['../examples/creative-v2/text-demo/output/final.mp4','video/mp4'],'/creative-v2/image-demo/final.mp4':['../examples/creative-v2/image-demo/output/final.mp4','video/mp4'],'/creative-v2/video-demo/final.mp4':['../examples/creative-v2/video-demo/output/final.mp4','video/mp4'],'/creative-v2/mixed-demo/final.mp4':['../examples/creative-v2/mixed-demo/output/final.mp4','video/mp4'],'/':['commerce.html','text/html; charset=utf-8'],'/edit':['editor.html','text/html; charset=utf-8'],'/create':['index.html','text/html; charset=utf-8'],'/commerce':['commerce.html','text/html; charset=utf-8'],'/editor.js':['editor.js','text/javascript; charset=utf-8'],'/editor.css':['editor.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/commerce.js':['commerce.js','text/javascript; charset=utf-8'],'/commerce.css':['commerce.css','text/css; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  if(['GET','HEAD'].includes(req.method)&&assets[route])return await file(req,res,path.join(WEB,assets[route][0]),assets[route][1]);
  throw new InputError('找不到这个页面',404);
 }catch(e){if(res.headersSent){res.destroy();return;}const expected=e instanceof InputError||e instanceof EditError||e instanceof CreativeError||e instanceof MiniMaxError||typeof e?.code==='string'&&(e.code.startsWith('OPENCLAW_')||['UNTRUSTED_TOOL_CONTEXT','PROJECT_SCOPE_FORBIDDEN','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','OPERATION_UNKNOWN','OPERATION_PREVIOUSLY_FAILED','SHADOW_WRITE_BLOCKED','TOOL_NOT_REGISTERED','SCHEMA_INVALID','SERVICE_REQUIRED','RUNTIME_MODE_INVALID','BASE_REVISION_ID_REQUIRED','BASE_REVISION_ID_INVALID','PLAN_EMPTY','PLAN_INVALID','UNSUPPORTED_PATCH','PATCH_TARGET_MISSING','INVALID_TEXT','INVALID_PATCH','INVALID_TEXT_STYLE','INVALID_SCENE_TIME','INVALID_SCENE_ORDER','INVALID_OUTPUT','MISSING_ASSET','INVALID_EFFECT_PARAM'].includes(e.code));if(!expected)console.error(e);json(res,{ok:false,error:expected?e.message:'操作暂时无法完成，请重试；详情已记录在本地日志。',code:e.code,stage:e.stage||null,field:e.field||null,retryable:e.retryable??false,requestId:e.requestId||req.headers['x-request-id']||null},e.status||500);}
});
server.listen(PORT,'127.0.0.1',()=>console.log(`对话视频剪辑 http://127.0.0.1:${PORT}；OpenClaw inbound=${OPENCLAW_INBOUND_ROOT}`));
server.on('error',e=>{console.error(e.message);void writerLeases.release().finally(()=>process.exit(1));});
let closing=false;
async function shutdown(){if(closing)return;closing=true;accepting=false;server.close();server.closeAllConnections?.();await editor.close();await creative.close?.();await Promise.allSettled([...writes.values()]);await writerLeases.release();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
