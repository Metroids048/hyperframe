import {routeDecision,fallbackPolicy,selectiveHistoryTarget} from '../orchestration/global-router.mjs';
import {acceptedChanges,resolveConversationMessage,conversationTargetScope,validateConversationTargetScope,nativeChangeReceipt,transitionRestorePlan,audioRestorePlan} from '../orchestration/conversation-edit.mjs';
import {planWorkbenchWorkflow,workflowStages,productionWorkflowFromPlan} from './workflow-design.mjs';
import {workflowContract,workflowEntries,inheritRevisionWorkflow,bindRevisionWorkflow} from './workflow-intent.mjs';
import {routeWorkbenchMessage} from './message-routing.mjs';
import {discoverMaterialRoots,resolveMaterialRoot,publicMaterialRoot,selectMaterialEntries} from './material-roots.mjs';
import {productionPolicy,assertMediaGenerationAllowed} from './production-policy.mjs';
import {minimaxCapabilityStatus} from '../edit/adapters/minimax.mjs';
import {applyDirectorRevisionIntent} from './director-revision.mjs';
import {MiniMaxClient} from '../edit/adapters/minimax-client.mjs';
import {withProjectLock} from './project-lock.mjs';
import {startPeriodicCleanup} from './resource-cleanup.mjs';
import {failureReceipt,commerceSkills} from './commerce-skills.mjs';
import {generateSpeechAsset,generateAudioAsset,audioApplication,speechReplacementRequest,preserveCaptionStyles} from './audio-assets.mjs';
import {humanReviewRoute} from './human-review.mjs';
import {deliveryDecision,formalVideoSnapshot} from './delivery-gate.mjs';
import {businessContract,FOCUS_PROFILE} from './commerce-focus.mjs';
import {AgentRunStore} from '../edit/agent-kernel.mjs';
import {budgetExhausted,canResumeJob,isRecoverableProviderFailure} from './recovery.mjs';
import {bindResourceChecks} from './resource-receipts.mjs';
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {acquireRender} from '../render-queue.mjs';
import {linkOrCopy,hashFile,probe} from '../edit/media.mjs';
import {CreativeError, insist, assetKindFromName, MAX_FILE_BYTES, MAX_ASSETS, stableId,safeRelativePath} from './contracts.mjs';
import {buildCommerceProject,buildUploadedVideoProject,uploadedVideoTitle,patchCommerceProject,readNativeProject,writeCompiledProject,runHyperFrames,renderCommerceProject} from './runner.mjs';
import {applyDocumentPatch,computeInvalidation} from './patch.mjs';
import {requireCommerceMessagePlan,sceneNumber} from './intent.mjs';
import {planCreativeEdit,completedEditSummary} from './model-edit.mjs';
import {reviewEditedProject} from './edit-review.mjs';
import {selectiveEffectRestore,allocatePublicationRevision} from './history.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {inspectBrandFont,MAX_FONT_BYTES,brandFontResources} from './brand-fonts.mjs';
import {collectCreativeEvidence} from './model-director.mjs';
import {readCreativePresets, publicPreset} from './presets.mjs';
import {readFinishedWorks,publicFinishedWork,artifactFile} from './finished-works.mjs';
import {replaceFileAtomically} from '../edit/project-store.mjs';
import {creativeVoiceInteraction} from './voice.mjs';
import {recognizeNativeCaptions,mergeRecognizedCaptions,projectNativeCaptions} from './captions.mjs';
import {assertOpeningOnly} from './branches.mjs';
import {scopedCommerceEdit} from './r3-intents.mjs';
import {commerceIntake} from './intake.mjs';
import {generateCommerceAsset} from './runninghub.mjs';
import {ensureGenerationPlan,fillGenerationGaps} from './generation-plan.mjs';
import {executionStatus} from './execution-status.mjs';
import {loadCloseoutQueue} from './full-closeout-state.mjs';
import {exportCreativeHistory,unpackCreativeHistory,restoreCreativeHistory,MAX_PACKAGE_BYTES} from './portable.mjs';
import {externalReplacementIntent,searchCommonsImage,downloadCommonsImage} from './external-assets.mjs';

const active=j=>['queued','running'].includes(j.status);
// A route acknowledgement is an active status record, but it must not block
// the child production job that the route is about to create.
const productionActive=j=>active(j)&&!j.routeJob;
const now=()=>new Date().toISOString();
const mime={'.woff2':'font/woff2','.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.m4a':'audio/mp4','.mp3':'audio/mpeg','.zip':'application/zip'};

// A whole-film object replacement is a valid edit even when the model cannot
// express it as a small local operation. Keep this fallback deliberately
// conservative: reuse the imported, rights-tracked image, preserve scene
// timing/output/audio, and remove only copy that would make false claims about
// the previous product or action. Custom-native video scenes are converted to
// the deterministic image-capable media-cut effect so the native compiler can
// validate and render the candidate.
function deterministicExternalReplacement(document, assetId){
  const operations=[];
  for(const node of document.nodes){
    if(['image','video'].includes(node.kind))operations.push({type:'replace_asset',nodeId:node.id,assetId});
  }
  return operations;
}

// A native upload is a complete source, not an extra cutaway. When the user
// attaches a video and asks to edit "this video", bind the existing editable
// scenes to that real asset in one deterministic transaction. This keeps the
// project/revision model intact while avoiding planner guesses about source
// ranges and, crucially, lets alignSourceAudio derive the new asset's real
// audio ranges from the video nodes.
// Only exact, fully covered text continuations are safe to execute locally.
// Source/media edits and compound requests remain in the regular edit planner.
function deterministicUploadedVideoEdit(document, message) {
  const text=String(message||'').trim();
  const nodes=document.nodes.filter(node=>node.kind==='text');
  if(!nodes.length)return null;
  const recent=document.scenePackage?.titleNodeId?nodes.find(n=>n.id===document.scenePackage.titleNodeId):nodes.at(-1);
  const replace=/(?:标题|文字)?\s*[“「『"]([^”」』"]+)[”」』"]\s*(?:改成|改为|换成)\s*[“「『"]([^”」』"]+)[”」』"]/u.exec(text);
  if(replace){
    const matches=nodes.filter(n=>n.params?.text===replace[1]);
    if(matches.length!==1)return null;
    return {operations:[{type:'update_text',nodeId:matches[0].id,text:replace[2]}],summary:'只替换指定标题文字，素材、源区间、声音、时长和动效保持。'};
  }
  if(/^(?:把)?(?:刚加的字|刚才的字|新增的字|这个标题)(?:再)?小一点[。！!\s]*$/u.test(text)){
    const size=recent?.params?.style?.fontSize;
    if(!Number.isFinite(size))return null;
    return {operations:[{type:'update_text_style',nodeId:recent.id,params:{fontSize:Math.max(12,Math.round(size*.85))}}],summary:'只缩小刚才新增的文字，素材、源区间、声音和时长保持。'};
  }
  if(/^(?:把)?(?:刚加的字|刚才的字|新增的字|文字|这个标题)(?:再)?(?:往)?上移一点[。！!\s]*$/u.test(text)){
    return {operations:[{type:'update_text_style',nodeId:recent.id,params:{offsetY:Math.max(-400,(recent.params?.style?.offsetY||0)-40)}}],summary:'只上移刚才新增的文字，素材、源区间、声音和时长保持。'};
  }
  return null;
}

function initialVideoMode(message){
  const text=String(message||'').trim();
  const marketing=/(?:制作|生成|做|剪成|重剪|策划).{0,16}(?:广告|营销片|种草|新品|宣传片|详情)|(?:广告|营销片|种草|宣传片).{0,16}(?:制作|生成|做|剪)/u.test(text);
  const localChange=/(?:只在|仅在|开头|前\s*(?:\d+|[一二三四五六七八九十]+)\s*秒).{0,20}(?:加|添加|改|放).{0,12}(?:字|文字|标题|字幕)|(?:加|添加|改).{0,16}(?:字|文字|标题|字幕)/u.test(text);
  const preservation=/(?:保留|保持).{0,16}(?:原片|原视频|原声|声音|时长|画幅).{0,8}(?:不变|不动|完整)?|(?:其他|其它|其余|别的).{0,8}(?:都)?(?:不变|不动|别改)/u.test(text);
  return !marketing&&localChange&&preservation?'source-edit':'produce';
}
function needsExternalReplacementIntent(message,routeDecision={}){
  const text=String(message||'').trim();
  if(routeDecision.targets?.some(t=>t.kind==='visual'&&t.action==='replace'))return true;
  return /(?:全片|整片|整个视频|所有画面|全部镜头).{0,20}(?:替换|换成|改成|改为).{0,40}(?:商品|产品|主体|素材|图片|照片)/u.test(text)
    ||/(?:把|将).{0,20}(?:商品|产品|主体).{0,12}(?:替换|换成|改成|改为).{0,20}(?:全片|整片|整个视频|所有画面)/u.test(text);
}
export async function createCreativeService({root=ROOT,dataDir=process.env.VIDEO_AGENT_CREATIVE_DATA_DIR||path.join(root,'data/commerce-runs'),planner='model',audioTransport,audioEnv,routingProvider,planningProvider}={}){
  try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(dataDir,{recursive:true});
  // OpenClaw is not necessarily served from the same origin as the native
  // workbench.  Relative artifact paths make a successful job look broken in
  // that case (the browser resolves them against the gateway).  Keep the
  // public origin explicit and overridable for a reverse proxy, while using
  // the local service port for the default desktop setup.
  const artifactBase=String(process.env.VIDEO_AGENT_PUBLIC_BASE_URL||process.env.COMMERCE_PUBLIC_BASE_URL||`http://127.0.0.1:${process.env.VIDEO_AGENT_PORT||process.env.PORT||3024}`).replace(/\/$/,'');
  const artifactUrl=p=>new URL(p,artifactBase).toString();
  // Verify demo media when the gallery is requested, not before health/startup.
  let presets=[],presetStamp='',presetRefresh=null;
  async function refreshPresets(){
    const st=await fs.stat(path.join(root,'examples/commerce/presets.json')),stamp=st.mtimeMs+':'+st.size;
    if(stamp===presetStamp)return presets;
    if(!presetRefresh)presetRefresh=readCreativePresets(root).then(next=>{presets=next;presetStamp=stamp;return presets;}).finally(()=>{presetRefresh=null;});
    return presetRefresh;
  }
  const projects=new Map(),writes=new Map(),uploads=new Set(),controllers=new Map();

  // 启动定期资源清理任务（每 5 分钟清理一次过期锁和临时文件）
  const stopCleanup = startPeriodicCleanup(dataDir, 300000);

  const directory=p=>path.join(dataDir,p.id);
  const versionDirectory=(p,r)=>path.join(directory(p),r.directory);
  async function artifacts(p,revisionId){
    const r=revision(p,revisionId),base=versionDirectory(p,r),files=[];
    for(const name of [...(r.rendered?['commerce-final.mp4']:[]),...(r.historyPackaged?['history.zip']:r.packaged?['project.zip']:[])]){
      try{files.push({name,...await artifactFile(path.join(base,name),artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/${name}?download=1`))});}
      catch(error){if(error.code!=='ENOENT')throw error;files.push({name,unavailable:'文件缺失，请核对该版本导出记录'});}
    }
    return {projectId:p.id,revisionId:r.id,files};
  }
  async function save(p){
    const signature=JSON.stringify(p.jobs.map(j=>[j.id,j.status,j.stage,j.runStage,j.checkpoints,j.code,j.error,j.revisionId,j.renderProgress?.completed,j.generationPlan?.shots.map(s=>[s.id,s.status,s.assetId]) ]));if(p.progressSignature!==signature){p.progressSignature=signature;p.recentProgressAt=now();}p.updatedAt=now();const bytes=JSON.stringify(p,null,2),target=path.join(directory(p),'native-project.json');
    const task=(writes.get(p.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.writeFile(target+'.tmp',bytes);await replaceFileAtomically(target+'.tmp',target);});writes.set(p.id,task);await task;
  }
  function runStore(p,job){return new AgentRunStore(path.join(directory(p),'versions',job.id,'runs'));}
  function syncRun(job,run){job.runId=run.id;job.checkpoints=Object.entries(run.checkpoints||{}).filter(([,v])=>v.status==='completed').map(([k])=>k);job.modelCalls=run.modelCalls;job.maxModelCalls=run.maxModelCalls??(run.code==='MODEL_BUDGET'?run.modelCalls:null);job.completionReserve=run.completionReserve||0;job.budgetSource=run.budgetSource||'legacy-application-estimate';job.runStage=run.stage;job.completedShots=job.checkpoints.filter(k=>/^shot-\d+$/.test(k)).length;job.gaps=run.gaps||[];job.quality=run.verification;job.directionPreview=run.artifacts?.directionPreview;}
  for(const id of await fs.readdir(dataDir)){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))continue;
    try{const p=JSON.parse(await fs.readFile(path.join(dataDir,id,'native-project.json'),'utf8'));for(const j of p.jobs.filter(active)){j.status=j.cancelRequestedAt?'cancelled':(j.routeJob?'recoverable':(j.runId||['create','audio'].includes(j.kind))?'recoverable':'failed');j.error=j.routeJob?'服务重启，路由任务可重试':(j.runId?'服务重启，已完成的制作检查点可恢复':'服务重启中断了任务，输入和上一有效版本已保留');j.code='INTERRUPTED';}
      // Older preview copies are derived artifacts, never a second composition entry.
      for(const r of p.revisions){const dir=versionDirectory(p,r),preview=path.join(dir,'preview.html');const copy=await fs.readFile(preview,'utf8').catch(()=>null);if(copy!==null){const source=await fs.readFile(path.join(dir,'index.html'),'utf8');insist(copy===source.replace('</body>','<script src="assets/runtime.js"></script></body>'),'预览副本存在未知修改，已保留文件','PREVIEW_MIGRATION_CONFLICT');await fs.rename(preview,path.join(dir,'preview.html.evidence'));}}
      for(const job of p.jobs)if(job.runId){const run=await runStore(p,job).get(job.runId);if(run)syncRun(job,run);}
      projects.set(id,p);await save(p);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const get=id=>{const p=projects.get(id);if(!p)throw new CreativeError('原生项目不存在','PROJECT_NOT_FOUND',404);return p;};
  const revision=(p,id=p.currentRevisionId)=>{const r=p.revisions.find(r=>r.id===id);if(!r)throw new CreativeError('版本不存在','REVISION_NOT_FOUND',404);return r;};
  const view=p=>({...structuredClone(p),artifactBaseUrl:artifactBase,deliveryStatus:p.request?.commerceProfile==='commerce-focus-v1'?'awaiting_review':'legacy_unverified',jobs:p.jobs.map(({snapshot,...job})=>({...job,...(job.directionPreview?{directionPreview:{...job.directionPreview,previewUrl:artifactUrl(`/api/commerce/${p.id}/jobs/${job.id}/direction/watch.html`)}}:{}),resumeAllowed:canResumeJob(job),budgetExhausted:budgetExhausted(job)})),auditions:(p.auditions||[]).map(a=>({...a,url:artifactUrl(`/api/commerce/${p.id}/auditions/${a.id}.wav`)})),revisions:p.revisions.map(r=>({...r,previewUrl:artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/preview.html`),videoUrl:r.rendered?artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/commerce-final.mp4`):null,documentUrl:artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/document.json`),packageUrl:r.historyPackaged?artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/history.zip`):r.packaged?artifactUrl(`/api/commerce/${p.id}/revisions/${r.id}/project.zip`):null}))});
  async function create(input={}){
    // Ensure request has default output configuration to prevent undefined access
    const request = {
      ...input,
      output: {
        width: 1280,
        height: 720,
        durationSeconds: 40,
        ...(input.output || {})
      }
    };
    const p={schemaVersion:1,id:randomUUID(),title:String(input.title||input.product?.name||'新创作'),createdAt:now(),updatedAt:now(),request,assets:[],revisions:[],currentRevisionId:null,jobs:[],messages:[],redo:[]};
    await fs.mkdir(path.join(directory(p),'uploads'),{recursive:true});projects.set(p.id,p);try{await save(p);}catch(error){projects.delete(p.id);throw error;}return p;
  }
  async function searchResources(query='', projectId=null){
    const text=String(query||'').trim().toLowerCase();
    const terms=text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const roots=await discoverMaterialRoots(root);
    const localMaterials=roots.flatMap(rootRecord=>rootRecord.entries.filter(entry=>entry.status==='indexed'&&entry.technicalStatus==='headers_passed').map(entry=>({
      ...entry, rootId:rootRecord.id, rootLabel:rootRecord.label,
      relevance:terms.length?terms.reduce((score,term)=>score+(entry.name.toLowerCase().includes(term)||entry.relativePath.toLowerCase().includes(term)?1:0),0):0,
      executionStatus:'discovered', bindingStatus:projectId?'unbound':'unbound'
    }))).filter(entry=>!terms.length||entry.relevance>0).sort((a,b)=>b.relevance-a.relevance||a.name.localeCompare(b.name)).slice(0,50);
    let productionResources=[];let unavailable=null;
    try{
      const {HyperFramesResourceCatalog}=await import('./resource-catalog.mjs');
      const catalog=await HyperFramesResourceCatalog.open(root);
      productionResources=catalog.search({text:query}, {limit:20}).map(resource=>({...resource,executionStatus:resource.executionStatus||'discovered',bindingStatus:'unbound'}));
    }catch(error){unavailable={kind:'production_resources',code:error.code||'RESOURCE_CATALOG_UNAVAILABLE',message:error.message};}
    return {localMaterials,productionResources,unavailable,query:text||null};
  }
  const messageFlights=new Map();
  async function dispatchMessage(p,input,routeJob=null){
    insist(typeof input.idempotencyKey==='string'&&input.idempotencyKey.length>=16,'消息需要稳定编号','MESSAGE_ID_REQUIRED');
    const key=p.id+':'+input.idempotencyKey;
    if(messageFlights.has(key))return messageFlights.get(key);
    const task=(async()=>{
      const previous=p.messageDispatches?.find(r=>r.key===input.idempotencyKey);
      if(previous){
        if(routeJob){const child=routeJob.childJobId&&p.jobs.find(j=>j.id===routeJob.childJobId);routeJob.status=child&&active(child)?'running':'complete';routeJob.stage=child?(active(child)?'已创建制作任务':'路由与子任务已完成'):'已保存需求';if(!active(child))routeJob.completedAt=routeJob.completedAt||now();await save(p);}
        return {project:view(get(previous.projectId)),route:previous.route,jobId:routeJob?.id||previous.jobId||null};
      }
      if(routeJob){routeJob.status='running';routeJob.stage='理解需求';routeJob.startedAt=now();await save(p);}
      insist(!input.baseRevisionId||input.baseRevisionId===p.currentRevisionId,'页面版本已过期','REVISION_CONFLICT');
      const base=p.currentRevisionId;
      const document=base?(await readNativeProject(versionDirectory(p,revision(p)))).document:null;
      let route;
      const pending=p.pendingClarification;
      const conversation=pending?.turns||p.messages.slice(-8).map(({role,text})=>({role,text}));
      const uploadedSource=p.currentRevisionId==null
        && (input.attachmentIds||[]).map(id=>p.assets.find(a=>a.id===id)).find(a=>a?.kind==='video'&&a.mediaMetadata?.duration);
      const sourceEditIntent=Boolean(uploadedSource&&(
        initialVideoMode(input.message)==='source-edit'
        || uploadedVideoTitle(input.message)
      ));
      try{
        // Routing a fresh uploaded source through the ordinary "edit existing
        // revision" clarifier loses the user's small change because no native
        // revision exists yet.  Select the deterministic source-first create
        // route before the model router in this one unambiguous case.
        route=sourceEditIntent
          ? {mode:'create',scenarioId:'general',scenario:'general',taskMode:'recut',taskModeExplicit:true,assetIds:[uploadedSource.id],reason:'fresh-upload-source-edit'}
          : await routeWorkbenchMessage(p,input.message,{provider:routingProvider,document,taskMode:input.taskMode||input.request?.taskMode,taskModeExplicit:input.taskModeExplicit??input.request?.taskModeExplicit,scenarioId:input.scenarioId||input.request?.scenarioId||p.request?.scenarioId,conversation});
      }
      catch(error){
        const receipt=failureReceipt(error,{request:input.message,revisionId:base,targets:[{kind:'routing',requirement:input.message}]});
        (p.routingFailures??=[]).push({time:now(),message:input.message,baseRevisionId:base,idempotencyKey:input.idempotencyKey,code:error.code||'MESSAGE_ROUTE_FAILED',failureReceipt:receipt});
        p.messages.push({role:'user',text:input.message,attachmentIds:[...(input.attachmentIds||[])],time:now()},{role:'assistant',text:error.message+'；当前版本保留。',time:now()});
        if(routeJob){
          const retryable=Boolean(error?.capacity||isRecoverableProviderFailure(error)||['CODEX_LIMIT','CODEX_TIMEOUT','CODEX_REQUEST_FAILED','OPENCLAW_CONTROL_RATE_LIMIT','OPENCLAW_CONTROL_TIMEOUT'].includes(error?.code));
          routeJob.status=retryable?'recoverable':'failed';routeJob.stage=retryable?'等待路由重试':'路由失败';routeJob.error=error.message;routeJob.code=error.code||'MESSAGE_ROUTE_FAILED';routeJob.retryable=retryable;routeJob.failureReceipt=receipt;routeJob.completedAt=retryable?null:now();await save(p);
        }throw error;
      }
      insist(p.currentRevisionId===base,'理解期间版本已变化，保留消息并请重试','REVISION_CONFLICT');
      (p.routingReceipts??=[]).push({time:now(),message:input.message,baseRevisionId:base,...route});
      let resultProject=p;
      const resolvedMessage=pending?[`原始需求：${pending.rootMessage}`,...pending.turns.slice(1).map(turn=>(turn.role==='assistant'?'澄清问题：':'用户补充：')+turn.text),`用户补充：${input.message}`].join('\n'):input.message;
      const explicitOutput=route.businessIntent?.outputConstraints;
      const outputOverride=explicitOutput?Object.fromEntries(Object.entries({
        durationSeconds:explicitOutput.durationSeconds,
        width:explicitOutput.width,
        height:explicitOutput.height,
      }).filter(([,value])=>value!=null)):null;
      if(outputOverride&&Object.keys(outputOverride).length){
        p.request={...p.request,output:{...(p.request?.output||{}),...outputOverride}};
      }
      const executionInput={...input,message:resolvedMessage,displayMessage:input.message,
        ...(outputOverride?{output:{...(input.output||p.request?.output||{}),...outputOverride}}:{}),
        ...(input.request&&outputOverride?{request:{...input.request,output:{...(input.request.output||{}),...outputOverride}}}:{}),
      };
      if(route.mode==='clarify'){
        const turns=[...(pending?.turns||[{role:'user',text:input.message}]),...(pending?[{role:'user',text:input.message}]:[]),{role:'assistant',text:route.question}];
        p.pendingClarification={rootMessage:pending?.rootMessage||input.message,turns,updatedAt:now()};
        // Keep uploaded media attached even when routing asks a follow-up
        // question. Otherwise the next planning turn can no longer resolve
        // the images/videos the user just sent.
        p.messages.push({role:'user',text:input.message,attachmentIds:[...(input.attachmentIds||[])],time:now()},{role:'assistant',text:route.question,time:now()});
      }
      else if(route.mode==='export')await enqueue(p,{...executionInput,action:'export',routeDecision:route});
      else if(route.mode==='plan')await enqueue(p,{...executionInput,action:'plan-workflow',routeDecision:route,autoExecute:route.autoExecute===true});
      else if(route.mode==='status')p.messages.push({role:'assistant',text:p.jobs.at(-1)?.error||p.jobs.at(-1)?.stage||'当前版本已保存。',time:now()});
      else if(['undo','redo','restore'].includes(route.mode))await navigate(p,{action:route.mode,revisionId:route.revisionId});
      else if(route.mode==='cancel'){const running=p.jobs.filter(active);if(!running.length)p.messages.push({role:'assistant',text:'当前没有正在运行的任务，工程和素材已保留。',time:now()});else {insist(running.length===1,'请在任务记录中选择要取消的任务','CANCEL_TARGET_AMBIGUOUS');await cancel(p,running[0].id);}}
      else if(route.mode==='create'&&base){
        const request={message:input.message,inferRequest:true,target:'marketing',taskMode:'create',taskModeExplicit:true,pipelineVersion:3,commerceProfile:FOCUS_PROFILE};
        request.businessContract=businessContract(request);resultProject=await create(request);
        for(const id of route.assetIds){const asset=p.assets.find(a=>a.id===id),source=safeRelativePath(root,asset.path),target=path.join(directory(resultProject),'uploads',asset.id+path.extname(source));await linkOrCopy(source,target);resultProject.assets.push({...structuredClone(asset),path:path.relative(root,target).replaceAll('\\','/')});}
        resultProject.creationSource={projectId:p.id,revisionId:base,assetIds:route.assetIds};await save(resultProject);
        if(resultProject.assets.length)await enqueue(resultProject,{action:'generate',message:input.message,attachmentIds:[...(input.attachmentIds||[])],idempotencyKey:input.idempotencyKey});
        else resultProject.messages.push({role:'assistant',text:'新制作已独立保存，请添加这条新视频要使用的素材。',time:now()});
        await save(resultProject);
      }else await enqueue(p,{...executionInput,action:base?'patch':'generate',routeDecision:route,taskMode:route.mode,taskModeExplicit:true,scenarioId:route.scenarioId||route.scenario||input.scenarioId||input.request?.scenarioId});
      if(route.mode!=='clarify'&&!['status','cancel'].includes(route.mode))delete p.pendingClarification;
      const childJob=resultProject.jobs.filter(j=>j!==routeJob&&j.createdAt).at(-1);
      if(routeJob){
        routeJob.childProjectId=resultProject.id;
        routeJob.childJobId=childJob?.id||null;
        routeJob.stage=childJob?(active(childJob)?'已创建制作任务':'路由与子任务已完成'):'已保存需求';
        routeJob.status=childJob&&active(childJob)?'running':'complete';
        if(!childJob||!active(childJob))routeJob.completedAt=now();
      }
      (p.messageDispatches??=[]).push({key:input.idempotencyKey,projectId:resultProject.id,route,jobId:routeJob?.id||null,childJobId:routeJob?.childJobId||null});await save(p);
      return {project:view(resultProject),route,jobId:routeJob?.id||null,childJobId:routeJob?.childJobId||null};
    })();messageFlights.set(key,task);try{return await task;}finally{messageFlights.delete(key);}
  }
  async function submitMessage(p,input){
    insist(typeof input.idempotencyKey==='string'&&input.idempotencyKey.length>=16,'消息需要稳定编号','MESSAGE_ID_REQUIRED');
    const prior=p.messageDispatches?.find(r=>r.key===input.idempotencyKey),existing=prior&&p.jobs.find(j=>j.id===prior.jobId);
    if(existing)return existing;
    const job={id:'job-'+randomUUID(),kind:'route',status:'queued',stage:'等待路由',progress:0,createdAt:now(),input:{message:input.message,baseRevisionId:input.baseRevisionId??null,attachmentIds:[...(input.attachmentIds||[])],idempotencyKey:input.idempotencyKey},routeJob:true,retryCount:0};
    p.jobs.push(job);await save(p);
    // The route job is the durable acknowledgement boundary.  If dispatch
    // fails before it can record a typed routing failure, persist that failure
    // on the same task instead of dropping the exception or leaving a false
    // queued state behind.
    void dispatchMessage(p,input,job).catch(async error=>{
      if(job.status==='queued'||job.status==='running'||job.status==='recoverable'){
        const retryable=Boolean(error?.capacity||isRecoverableProviderFailure(error)||['CODEX_LIMIT','CODEX_TIMEOUT','CODEX_REQUEST_FAILED','OPENCLAW_CONTROL_RATE_LIMIT','OPENCLAW_CONTROL_TIMEOUT'].includes(error?.code));
        job.status=retryable?'recoverable':'failed';
        job.stage=retryable?'等待自动重试':'路由失败';
        job.error=error?.message||'路由失败';
        job.code=error?.code||'MESSAGE_ROUTE_FAILED';
        job.retryable=retryable;
        job.completedAt=retryable?null:now();
        // 扩展重试策略：在 5 分钟内最多重试 10 次
        // 退避策略：1s, 2s, 4s, 8s, 15s, 30s, 60s, 60s, 60s, 60s
        const maxRetries=parseInt(process.env.VIDEO_AGENT_MAX_RETRY_COUNT)||10;
        const retryTimeoutMs=parseInt(process.env.VIDEO_AGENT_RETRY_TIMEOUT_MS)||300000;
        if(retryable&&job.retryCount<maxRetries&&!job.retryScheduled){
          const firstRetryAt=job.firstRetryAt||Date.now();
          const elapsedMs=Date.now()-new Date(firstRetryAt).getTime();
          // 如果超过重试窗口，不再自动重试
          if(elapsedMs>retryTimeoutMs){
            job.status='recoverable';
            job.stage='自动重试已超时，可手动恢复';
            job.retryable=true;
            job.manualRecoveryAvailable=true;
            await save(p);
            return;
          }
          job.retryCount+=1;
          job.retryScheduled=true;
          if(!job.firstRetryAt)job.firstRetryAt=new Date().toISOString();
          // 改进的指数退避：1s -> 2s -> 4s -> 8s -> 15s -> 30s -> 60s(上限)
          const baseDelay=Math.min(Math.pow(2,job.retryCount-1)*1000,60000);
          const jitter=Math.random()*500;
          const retryDelay=baseDelay+jitter;
          job.nextRetryAt=new Date(Date.now()+retryDelay).toISOString();
          job.stage=`等待自动重试 (${job.retryCount}/${maxRetries}，${Math.round(retryDelay/1000)}秒后)`;
          await save(p);
          setTimeout(async()=>{job.retryScheduled=false;job.status='queued';job.stage='路由重试中';job.error=null;try{await save(p);await dispatchMessage(p,{...job.input},job);}catch(retryError){job.status='recoverable';job.stage='等待路由恢复';job.error=retryError?.message||'路由重试失败';job.code=retryError?.code||'MESSAGE_ROUTE_RETRY_FAILED';job.retryable=true;job.completedAt=null;try{await save(p);}catch(persistError){job.persistenceError=persistError?.message||'路由重试状态保存失败';console.error('video route retry persistence error',persistError);}}},retryDelay);
          return;
        }
        // 重试次数用尽，但仍然可以手动恢复
        if(retryable){
          job.status='recoverable';
          job.stage='自动重试已用尽，可手动恢复';
          job.manualRecoveryAvailable=true;
        }
        try { await save(p); }
        catch (persistError) {
          // The task is already marked failed in memory. Keep a diagnostic for
          // the next status read instead of silently discarding a persistence
          // error from the acknowledgement path.
          job.persistenceError=persistError?.message||'任务失败状态保存失败';
          console.error('video route failure persistence error', persistError);
        }
      }
    });
    return job;
  }
  const presetFlights=new Map();
  async function presetFile(id){
    const preset=(await refreshPresets()).find(p=>p.id===id);
    insist(preset,'这个预设暂不可用','PRESET_MISSING');
    const target=await fs.realpath(path.join(preset.directory,'commerce-final.mp4'));
    const relative=path.relative(await fs.realpath(root),target);
    insist(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'预设文件超出工作区','PRESET_MISSING');
    return target;
  }
  async function loadPreset(id,{idempotencyKey,expectedSha256}={}){
    insist(typeof idempotencyKey==='string'&&idempotencyKey.length>=16&&idempotencyKey.length<=200,'创建副本需要稳定请求编号','PRESET_REQUEST_ID_REQUIRED');
    insist(/^[a-f0-9]{64}$/.test(expectedSha256||''),'创建副本需要确认预设版本','PRESET_VERSION_REQUIRED');
    const signature=id+':'+expectedSha256;
    const flight=presetFlights.get(idempotencyKey);
    if(flight){insist(flight.signature===signature,'请求编号已用于其他预设版本','IDEMPOTENCY_CONFLICT');return flight.promise;}
    const previous=[...projects.values()].find(p=>p.request?.presetCopy?.idempotencyKey===idempotencyKey);
    if(previous){
      insist(previous.request.presetCopy.signature===signature,'请求编号已用于其他预设版本','IDEMPOTENCY_CONFLICT');
      insist(previous.currentRevisionId,'上次副本尚未完整保存，已保留文件，请检查原副本','PRESET_COPY_INCOMPLETE');
      return previous;
    }
    const promise=copyPreset(id,{idempotencyKey,expectedSha256,signature});
    presetFlights.set(idempotencyKey,{signature,promise});
    try{return await promise;}finally{presetFlights.delete(idempotencyKey);}
  }
  async function copyPreset(id,{idempotencyKey,expectedSha256,signature}){
    // Revalidate bytes for an explicit copy even if the catalog file did not change.
    const preset=(await readCreativePresets(root)).find(p=>p.id===id);insist(preset,'这个预设暂不可用','PRESET_MISSING');
    insist(preset.sha256===expectedSha256,'预设版本已变化，请重新打开确认','PRESET_CHANGED');
    const p=await create({message:preset.input,inferRequest:true,presetCopy:{idempotencyKey,signature}}),dir=path.join(directory(p),'versions','preset');
    await fs.mkdir(dir,{recursive:true});
    for(const name of ['index.html','document.json','object-map.json','manifest.json','DESIGN.md','hyperframes.json','commerce-final.mp4'])await fs.copyFile(path.join(preset.directory,name),path.join(dir,name));
    await copyAssets(preset.directory,dir);await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    const document=structuredClone(preset.document);document.projectId=p.id;document.revisionId=stableId('rev',p.id,preset.document.revisionId);
    await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(document,null,2));
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));manifest.revisionId=document.revisionId;await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
    p.title=preset.title;p.preset={id:preset.id,sha256:preset.sha256,sourceProjectId:preset.document.projectId,sourceRevisionId:preset.document.revisionId,note:preset.note,creationKey:idempotencyKey};
    if(preset.originalAssets){
      p.assets=[];
      for(const a of preset.originalAssets){const source=safeRelativePath(root,a.path),target=path.join(directory(p),'uploads',a.id+path.extname(source).toLowerCase());await linkOrCopy(source,target);p.assets.push({...a,path:path.relative(root,target).replaceAll('\\','/'),rights:preset.assets.find(n=>n.id===a.id)?.rights||a.rights});}
    }else p.assets=preset.assets.map(a=>({id:a.id,kind:a.kind,name:path.basename(a.compiledRef),path:path.relative(root,path.join(dir,a.compiledRef)).replaceAll('\\','/'),rights:a.rights}));
    p.revisions=[{id:document.revisionId,parentId:null,directory:'versions/preset',createdAt:now(),description:'预设演示 · '+preset.title,durationFrames:document.durationFrames,output:document.output,rendered:true,branch:false}];p.currentRevisionId=document.revisionId;
    p.messages=[{role:'user',text:preset.input,time:now()},{role:'assistant',text:preset.note,revisionId:document.revisionId,time:now()}];await save(p);return p;
  }
  async function upload(p,req,name){
    insist(!p.jobs.some(j=>productionActive(j)&&j.kind!=='export'),'请等待当前编辑完成','PROJECT_BUSY');
    insist(p.assets.length+Array.from(uploads).filter(x=>x.startsWith(p.id+':')).length<MAX_ASSETS,'最多上传30个素材','TOO_MANY_ASSETS');
    const kind=assetKindFromName(name);insist(kind,'不支持的素材格式','UNSUPPORTED_ASSET');
    const id='asset-'+randomUUID(),rel=`uploads/${id}${path.extname(name).toLowerCase()}`,target=path.join(directory(p),rel),key=p.id+':'+id;uploads.add(key);
    let size=0;try{
      await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;if(size>(kind==='font'?MAX_FONT_BYTES:MAX_FILE_BYTES))return callback(new CreativeError(kind==='font'?'字体最大 10 MiB':'每个素材最多1 GiB','ASSET_TOO_LARGE',413));callback(null,chunk);}}),createWriteStream(target,{flags:'wx'}));
      insist(size>0,'素材不能为空','INVALID_ASSET');
      if(kind==='font'){insist(size<=MAX_FONT_BYTES,'字体最大 10 MiB','FONT_INVALID');await inspectBrandFont(target);}
      // OpenClaw 模式: 使用相对于项目目录的路径
      const isOpenclawMode = target.includes('.openclaw') || dataDir.includes('.openclaw');
      const assetPath = isOpenclawMode
        ? path.relative(directory(p), target).replaceAll('\\', '/')  // 相对于项目目录
        : path.relative(root, target).replaceAll('\\', '/');         // 相对于 root
      const asset = {
        id,
        kind,
        name: path.basename(name),
        path: assetPath,
        originalRef: target,
        normalizedRef: assetPath,
        bytes: size,
        rights: { status: 'user-provided' }
      };
      if(kind==='video'){
        try{asset.mediaMetadata=await probe(target);insist(asset.mediaMetadata?.duration>0,'视频无法解析或时长无效','INVALID_VIDEO_ASSET');}
        catch(error){throw new CreativeError('视频无法解析，请确认文件完整且为合法 MP4/MOV/WebM','INVALID_VIDEO_ASSET',415);}
      }
      p.assets.push(asset);await save(p);return asset;
    }catch(e){p.assets=p.assets.filter(a=>a.id!==id);await fs.unlink(target).catch(()=>{});throw e;}finally{uploads.delete(key);}
  }
  const materialFlights=new Map();
  async function attachMaterialRoot(p,id,assetIds){
    insist(Array.isArray(assetIds),'请先选择要加入工程的素材','MATERIAL_SELECTION_REQUIRED');
    const signature=JSON.stringify([id,[...new Set(assetIds||[])].sort()]),flight=materialFlights.get(p.id);
    if(flight){insist(flight.signature===signature,'素材选择正在处理，请等待完成','PROJECT_BUSY');return flight.promise;}
    const promise=attachSelectedMaterials(p,id,assetIds);materialFlights.set(p.id,{signature,promise});
    try{return await promise;}finally{materialFlights.delete(p.id);}
  }
  async function attachSelectedMaterials(p,id,assetIds){
    insist(!p.currentRevisionId&&!p.jobs.some(active),'制作中不能更换素材目录','PROJECT_BUSY');
    const selected=await resolveMaterialRoot(root,id);
    const entries=selectMaterialEntries(selected,assetIds),pending=entries.filter(e=>!p.assets.some(a=>a.materialSource?.id===e.id&&a.sha256===e.sha256));
    insist(p.assets.length+pending.length<=MAX_ASSETS,'所选素材超过工程上限，请减少选择','ASSET_LIMIT');
    const added=[];
    try{
      for(const entry of pending){
        const source=await fs.realpath(entry.realPath),relative=path.relative(selected.directory,source);
        insist(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&source===entry.realPath,'素材路径已变化，请刷新后重选','MATERIAL_CHANGED');
        const asset=await upload(p,createReadStream(source),entry.name);added.push(asset);
        insist(await hashFile(safeRelativePath(root,asset.path))===entry.sha256,'复制期间素材已变化，保留原件并撤回本次加入','MATERIAL_CHANGED');
        asset.sha256=entry.sha256;asset.materialSource={id:entry.id,rootId:selected.id,relativePath:entry.relativePath,realPath:source,sha256:entry.sha256,indexHash:selected.indexHash};
      }
      p.request={...p.request,pipelineVersion:3,materialRoot:{id:selected.id,label:selected.label,indexHash:selected.indexHash,assetIds:entries.map(e=>e.id)}};await save(p);return p;
    }catch(error){
      const ids=new Set(added.map(a=>a.id));p.assets=p.assets.filter(a=>!ids.has(a.id));
      for(const asset of added){
        const cleanupPath=asset.originalRef||asset.path;
        await fs.unlink(safeRelativePath(root,cleanupPath)).catch(()=>{});
      }
      await save(p);throw error;
    }
  }
  async function importPackage(req){
    const p=await create({}),target=path.join(directory(p),'import.zip');let bytes=0;
    try{await pipeline(req,new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>MAX_PACKAGE_BYTES?new CreativeError('原生包最多80 GiB','PACKAGE_LIMIT',413):null,chunk);}}),createWriteStream(target,{flags:'wx'}));insist(bytes>0,'原生包不能为空','PACKAGE_INVALID');}
    catch(error){await fs.unlink(target).catch(()=>{});throw error;}
    const job={id:'job-'+randomUUID(),kind:'import',input:{},baseRevisionId:null,status:'queued',createdAt:now()};p.title='正在打开工程';p.jobs.push(job);await save(p);void execute(p,job).catch(error=>{job.status='failed';job.error=error.message;});return p;
  }
  async function copyAssets(from,to){
    await fs.mkdir(path.join(to,'assets'),{recursive:true});for(const name of await fs.readdir(path.join(from,'assets')))await linkOrCopy(path.join(from,'assets',name),path.join(to,'assets',name));
    for(const name of ['resource-lock.json','business-contract.json','production-admission.json'])await fs.copyFile(path.join(from,name),path.join(to,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await fs.cp(path.join(from,'resources'),path.join(to,'resources'),{recursive:true,force:false,errorOnExist:true}).catch(e=>{if(e.code!=='ENOENT')throw e;});
  }
  async function retryImport(p,id){
    const job=p.jobs.find(j=>j.id===id);insist(job?.kind==='import','不是原生工程导入任务','INVALID_RETRY');
    if(active(job))return view(p);
    insist(job.status==='failed'&&!p.currentRevisionId,'该导入任务不可重试','INVALID_RETRY');
    insist(!p.jobs.some(active),'项目已有任务在执行','PROJECT_BUSY');
    (job.failedAttempts??=[]).push({completedAt:job.completedAt,error:job.error,code:job.code,failureReceipt:job.failureReceipt});
    job.status='queued';delete job.error;delete job.code;delete job.completedAt;delete job.failureReceipt;delete job.cancelRequestedAt;
    await save(p);void execute(p,job).catch(error=>{job.status='failed';job.error=error.message;});return view(p);
  }
  async function planEdit(p,base,document,input,signal,evidence={}){
    if(input.operations)return {operations:input.operations,mode:'structured'};
    const history=acceptedChanges({...p,currentRevisionId:base.id});
    const targetScope=conversationTargetScope(document,input.message,history,input.routeDecision?.targets||[]);
    const resolvedMessage=resolveConversationMessage(input.message,history);
    if(targetScope&&targetScope.basis!=='message-route'){
      const local=scopedCommerceEdit(document,resolvedMessage);
      insist(local?.operations?.every(op=>op.type==='update_caption_style'),'相对字幕移动无法安全执行','AMBIGUOUS_TARGET');
      const operations=local.operations.flatMap(op=>targetScope.targetIds.map(nodeId=>({...op,nodeId})));
      validateConversationTargetScope(document,operations,targetScope);
      return {...local,operations,targetScope};
    }
    if(selectiveHistoryTarget(input.message)==='audio'){
      insist(base.parentId,'没有上一版声音','RESTORE_NOT_FOUND');
      const previous=(await readNativeProject(versionDirectory(p,revision(p,base.parentId)))).document;
      return audioRestorePlan(document,previous);
    }
    if(selectiveHistoryTarget(input.message)==='transition'){
      insist(base.parentId,'没有上一版转场','RESTORE_NOT_FOUND');
      let prior=revision(p,base.parentId);
      while(prior){const previous=(await readNativeProject(versionDirectory(p,prior))).document;
        if(JSON.stringify(previous.transitions)!==JSON.stringify(document.transitions))return transitionRestorePlan(document,previous);
        prior=p.revisions.find(r=>r.id===prior.parentId);
      }
      throw new CreativeError('历史中没有不同的转场','RESTORE_NOT_FOUND');
    }
    const scoped=scopedCommerceEdit(document,resolvedMessage);if(scoped)return scoped;
    // The inverse shortcut is deliberately conservative: only an entire, positive
    // restore request may take it.  Negated, quoted, conditional, or compound
    // language must go through the full planner so no clause is dropped.
    const restoreText=String(input.message||'').trim();
    const restoreOnly=/^(?:请|帮我)?\s*(?:撤销|恢复)(?:上次|刚才的|最近的)?\s*(?:动效|动画|效果)(?:[。.!！?？\s]*)$/u;
    if(restoreOnly.test(restoreText)){
      const number=sceneNumber(input.message),sceneIds=number?[document.scenes[number-1]?.id]:undefined;
      if(number)insist(sceneIds[0],'找不到要恢复的镜头','RESTORE_NOT_FOUND');
      let r=base;
      while(r?.parentId){
        const edit=JSON.parse(await fs.readFile(path.join(versionDirectory(p,r),'edit.json'),'utf8').catch(()=>'{}'));
        if([...(edit.operations||[]),...(edit.repairs||[]).flatMap(r=>r.operations||[])].some(o=>['set_scene_effect','update_effect_params','update_custom_source'].includes(o.type)&&(!sceneIds||sceneIds.includes(o.sceneId)))){
          const before=await readNativeProject(versionDirectory(p,revision(p,r.parentId))),after=await readNativeProject(versionDirectory(p,r));
          return {operations:selectiveEffectRestore(document,before.document,after.document,{sceneIds}),mode:'selective-inverse',restoredRevisionId:r.id,summary:'恢复指定范围的上次动效属性，保留之后的文案、声音和锁定。'};
        }
        r=p.revisions.find(v=>v.id===r.parentId);
      }
      throw new CreativeError('没有可恢复的动效历史','RESTORE_NOT_FOUND');
    }
    const plan=await planCreativeEdit(document,resolvedMessage,{conversation:history.slice(-10),selectedNodeId:input.selectedNodeId,workflow:input.workflow,signal,...evidence});
    validateConversationTargetScope(document,plan.operations,targetScope);
    return {...plan,targetScope};
  }
  async function publish(p,job,dir,document,description,{branch=false,defer=false}={}){
    const signal=controllers.get(job.id)?.signal,release=await acquireRender({kind:'preview',signal});
    try{
      const previousId=document.revisionId;allocatePublicationRevision(document,p.revisions,job.id);
      if(document.revisionId!==previousId){const {assets}=await readNativeProject(dir);await writeCompiledProject(dir,document,assets,{signal});}
      await fs.writeFile(path.join(dir,'check.log'),await runHyperFrames(dir,'check',[],{signal}));
      if(job.kind==='edit'&&document.production){
        job.stage='复核修改范围的实际画面';await save(p);
      const quality=await reviewEditedProject(root,dir,document,{runHyperFrames,signal,message:job.input?.message||'',changeReceipt:job.changeReceipt,round:job.repairCount||0,onInvocation:async invocation=>{job.modelCalls=(job.modelCalls||0)+1;(job.modelInvocations??=[]).push({...invocation,stage:'R6-edit'});await save(p);}}).catch(error=>{if(signal?.aborted||!isRecoverableProviderFailure(error))throw error;return {status:'pending-model-review',engineering:'checked',revisionId:document.revisionId,issues:[],unreviewed:['visual','continuity','audio-perception'],humanReview:'pending',blocker:{code:error.code,message:error.message},candidateOnly:true};});
        job.qualitySummary=quality;
        if(quality.status==='needs-repair')throw Object.assign(Error('局部画面检查发现需要修复的问题'),{code:'EDIT_VISUAL_REVIEW',issues:quality.issues});
        document.quality=quality;bindResourceChecks(document,{engineering:true,visual:quality.status});await fs.writeFile(path.join(dir,'resource-receipts.json'),JSON.stringify(document.resourceReceipts||[],null,2));await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(document,null,2));await fs.writeFile(path.join(dir,'quality-report.json'),JSON.stringify(quality,null,2));
      }
    }finally{release();}
    await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    insist(!signal?.aborted,'任务已取消','CANCELLED');

    // 使用项目锁保护版本检查和更新，防止并发竞态
    const r = await withProjectLock(directory(p), async () => {
      insist(branch||p.currentRevisionId===job.baseRevisionId,'当前版本已变化，结果保留但不能覆盖新版本','REVISION_CONFLICT');
      insist(!p.revisions.some(r=>r.id===document.revisionId),'发布版本ID与现有历史重复，已保留新工程','REVISION_DUPLICATE');
      const r={id:document.revisionId,parentId:job.baseRevisionId,directory:path.relative(directory(p),dir).replaceAll('\\','/'),createdAt:now(),description,durationFrames:document.durationFrames,output:document.output,rendered:false,branch};
      if(defer)return r;
      const previous={current:p.currentRevisionId,redo:p.redo};p.revisions.push(r);if(!branch){p.currentRevisionId=r.id;p.redo=[];}job.revisionId=r.id;
      try{await save(p);}catch(error){p.revisions=p.revisions.filter(v=>v!==r);p.currentRevisionId=previous.current;p.redo=previous.redo;delete job.revisionId;throw error;}
      return r;
    });

    return r;
  }
  async function candidateExport(p,job,r,signal){
    const dir=versionDirectory(p,r);job.revisionId=r.id;job.stage='导出候选 MP4';await save(p);
    if(!r.rendered){const release=await acquireRender({signal});try{const result=await renderCommerceProject({outputDir:r.directory,signal,onProgress:async progress=>{job.renderProgress={...progress,revisionId:r.id};job.stage='渲染画面 '+progress.percent+'%';await save(p);},onStage:async stage=>{job.stage=stage;await save(p);}},{root,outputRoot:directory(p)});r.mediaReview=result.mediaReview;job.qualitySummary=result.mediaReview;r.rendered=true;job.revisionId=r.id;await save(p);}finally{release();}}
    r.playbackReviewReady=await fs.access(path.join(dir,'final-review/watch.html')).then(()=>true,()=>false);
    // Persist MP4 readiness separately from the optional history archive.
    r.deliveryStatus='video_ready';r.videoReadyAt=now();job.videoReadyAt=r.videoReadyAt;job.packageStatus='pending';await save(p);
    const commercialQuality=JSON.parse(await fs.readFile(path.join(dir,'quality_report.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return 'null';throw error;}));
    if(commercialQuality){r.commercialQuality=commercialQuality;job.commercialQuality=commercialQuality;if(job.kind==='create'&&!job.skipAutoQualityRevision&&commercialQuality.revision_required){job.autoQualityRevision={sourceRevisionId:r.id,score:commercialQuality.score,issues:commercialQuality.issues.filter(issue=>['blocker','major'].includes(issue.severity)).slice(0,8),suggestions:commercialQuality.suggestions.slice(0,8)};}}
    job.stage='打包素材与完整历史';job.packageStatus='running';await save(p);
    job.packageEvidence=await exportCreativeHistory(root,directory(p),job.snapshot||structuredClone(p),r.id,path.join(dir,'history.zip'),{signal,assetRoot:directory(p)});r.historyPackaged=true;r.deliveryStatus='video_and_history_ready';job.packageStatus='complete';await save(p);
  }
  async function execute(p,job){
    const controller=new AbortController();controllers.set(job.id,controller);const signal=controller.signal;
    job.status='running';job.startedAt=now();
    try{
      await save(p);
      if(job.kind==='plan'){
        job.stage='理解需求与检查工作流';await save(p);
        const document=job.baseRevisionId?(await readNativeProject(versionDirectory(p,revision(p,job.baseRevisionId)))).document:null;
        const prior=p.workflowPlan?.workOrder?.baseRevisionId===job.baseRevisionId?p.workflowPlan.workOrder:document?inheritRevisionWorkflow(document,{baseRevisionId:job.baseRevisionId}):null;
        const plan=await planWorkbenchWorkflow({root,message:job.input.message,document,assets:structuredClone(p.assets),baseRevisionId:job.baseRevisionId,prior,intake:{taskMode:job.input.taskMode,taskModeExplicit:job.input.taskModeExplicit,output:job.input.output},provider:planningProvider,signal});
        insist(!signal.aborted,'任务已取消','CANCELLED');
        insist(p.currentRevisionId===job.baseRevisionId,'规划期间基准版本已变化','REVISION_CONFLICT');
        job.workflowPlan=plan;p.workflowPlan=plan;job.summary=plan.status==='needs_input'?'制作单已保存：'+plan.nextAction:'制作单与资源候选已保存，尚未生成或修改视频。';
      }else if(job.kind==='audio'){
        job.stage=job.input.audio.kind==='speech'?'生成旁白与字幕时间':'生成纯音乐';await save(p);
        const asset=await generateAudioAsset(root,directory(p),job.input.audio,{signal,transport:audioTransport,env:audioEnv});
        if(!p.assets.some(a=>a.id===asset.id))p.assets.push(asset);
        job.resultAssetId=asset.id;job.audioGeneration=asset.audioGeneration;
        job.summary='声音已保存到工程，可试听并用于新版本；听感待审。';
      }else if(job.kind==='import'){
        job.stage='检查原生工程包';await save(p);
        const unpacked=await unpackCreativeHistory(path.join(directory(p),'import.zip'),path.join(directory(p),'import-blobs',randomUUID().replaceAll('-','').slice(0,12)),{signal});
        const release=await acquireRender({kind:'preview',signal});let restored;
        try{restored=await restoreCreativeHistory(root,directory(p),p.id,unpacked,{signal,onStage:async stage=>{job.stage=stage;await save(p);}});}finally{release();}
        insist(!signal.aborted,'任务已取消','CANCELLED');
        const previous=structuredClone(p);Object.assign(p,restored,{jobs:[job]});job.revisionId=p.currentRevisionId;
        try{await save(p);}catch(error){Object.assign(p,previous);throw error;}job.summary=`已打开完整工程，保留 ${p.revisions.length} 个版本，可以继续修改。`;
      }else if(job.kind==='asset'){
        const target=job.input.assetKind||job.input.target||'video';
        await assertMediaGenerationAllowed(root);
        const source=p.assets.find(a=>a.id===job.input.sourceAssetId)||p.assets.find(a=>a.kind==='image');
        insist(source?.kind==='image','素材生成需要一个已登记的商品图片作为输入','GENERATION_INPUT');
        job.generationStarted=true;job.stage='生成'+(target==='image'?'商品图':'原始镜头');await save(p);
        const asset=await generateCommerceAsset({root,project:p,job,kind:target,role:target==='image'?'商品整体':'原始展示',sourceAsset:source,prompt:job.input.message||p.request.message,duration:p.request.output?.durationSeconds,save:()=>save(p),signal});
        if(!p.assets.some(item=>item.id===asset.id))p.assets.push(asset);job.resultAssetId=asset.id;job.summary='生成素材已登记到当前工程；质量待审。';
      }else if(job.kind==='create'){
        if(job.input.request)p.request={...p.request,...commerceIntake(job.input.request)};
        if(job.input.workflow?.businessScenario||job.input.scenarioId){p.request={...p.request,scenarioId:job.input.workflow?.businessScenario||job.input.scenarioId,taskMode:job.input.workflow?.taskMode||job.input.taskMode||p.request.taskMode,workflow:job.input.workflow||p.request.workflow};p.request.businessContract=businessContract(p.request);}
        const target=p.request.target||'marketing';
        // A fresh uploaded video plus a concrete local edit is already a
        // complete source-first workflow. Build the native source project in
        // one transaction so the request does not get misrouted to a
        // clarification asking the user to open/bind an existing project.
        const uploadedSource=p.currentRevisionId==null
          && (job.input.attachmentIds||[]).map(id=>p.assets.find(a=>a.id===id)).find(a=>a?.kind==='video'&&a.mediaMetadata?.duration);
        const sourceEditRequested=Boolean(uploadedSource&&(
          initialVideoMode(job.input.message)==='source-edit'
          // An explicit title/文字 request is a safe source-first edit even
          // when the preservation clause lists several fields (画面、原声、
          // 时长、画幅) and therefore exceeds the shortcut regex window.
          || uploadedVideoTitle(job.input.message)
        ));
        if(sourceEditRequested){
          // A source-first edit is intentionally scoped to the user's
          // requested overlay/preservation changes. Do not turn a low
          // commercial score (for example, an input with no audio) into an
          // unrelated director rewrite that asks for new user input.
          job.skipAutoQualityRevision=true;
          job.stage='建立上传原片初始工程';await save(p);
          const dir=path.join(directory(p),'versions',job.id);
          await buildUploadedVideoProject({...p.request,projectId:p.id,assets:p.assets,outputDir:path.relative(root,dir).replaceAll('\\','/'),message:job.input.message,signal,onStage:async stage=>{job.stage=stage;await save(p);}},{root});
          const {document}=await readNativeProject(dir);p.title=document.brief.name;const created=await publish(p,job,dir,document,'上传原片初始版本');await candidateExport(p,job,created,signal);job.summary='已按上传原片的真实时长建立独立可编辑工程，并应用本轮局部修改，导出候选视频。';job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:job.summary,time:now()});return;
        }
        if(job.revisionId&&p.revisions.some(r=>r.id===job.revisionId)){
          await candidateExport(p,job,revision(p,job.revisionId),signal);
          job.status='complete';job.completedAt=now();return;
        }
        if(['image','video'].includes(target)){
          await assertMediaGenerationAllowed(root);
          const source=p.request.sourceAssetId?p.assets.find(a=>a.id===p.request.sourceAssetId):p.assets.find(a=>a.kind==='image');
          insist(source?.kind==='image','请选择要生成的商品原图','GENERATION_INPUT');
          job.generationStarted=true;job.stage='生成'+(target==='image'?'商品图':'原始镜头');await save(p);
          const a=await generateCommerceAsset({root,project:p,job,kind:target,role:target==='image'?'商品整体':'原始展示',sourceAsset:source,prompt:job.input.message||p.request.message,duration:p.request.output.durationSeconds,save:()=>save(p),signal});
          if(!p.assets.some(x=>x.id===a.id))p.assets.push(a);job.resultAssetId=a.id;job.status='complete';job.completedAt=now();job.summary='生成素材已下载，可选择用于视频或营销成片；质量待审。';p.messages.push({role:'assistant',text:job.summary,time:now()});return;
        }
        if(!(await productionPolicy(root)).mediaGenerationPaused){
        job.stage='规划镜头与素材缺口';await save(p);
        await ensureGenerationPlan({root,project:p,job,directory:path.join(directory(p),'versions',job.id),save:()=>save(p),signal});
        await fillGenerationGaps({root,project:p,job,save:()=>save(p),signal});
        p.request.generationPlan=structuredClone(job.generationPlan);
        }else{
          job.productionPolicy={mediaGenerationPaused:true,source:'config/commerce.json'};
          insist(p.assets.some(a=>['image','video'].includes(a.kind)),'请添加已有商品图片或视频素材；本轮不生成新镜头','MISSING_MEDIA');
        }
        job.stage='理解创作要求';await save(p);
        const voice=await creativeVoiceInteraction(p,job.input.message||p.request.message,directory(p),{signal});
        if(voice){
          job.summary=voice.summary;
          if(voice.mode==='audition'){p.auditions=voice.auditions;delete p.confirmedVoice;job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:voice.summary,time:now()});return;}
          p.confirmedVoice=voice.confirmedVoice;
          if(voice.mode==='confirm'){job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:voice.summary,time:now()});return;}
          const selected=voice.confirmedVoice;
          if(!p.assets.some(a=>a.id===selected.id))p.assets.push({id:selected.id,kind:'audio',name:'已确认配音.wav',path:path.relative(root,path.join(directory(p),selected.path)).replaceAll('\\','/'),rights:selected.rights||{status:'locally-generated',engine:selected.metrics?.engine||'kokoro'},providerTranscript:selected.providerTranscript||null,sha256:selected.sha256,generatedVoice:true});
          p.request={...p.request,message:job.input.message+'\n用户已确认的配音稿：'+selected.text+'\n使用已确认的音频素材 '+selected.id+'，不要重新配音。',inferRequest:true};
        }
        else if(job.input.message){p.request={...p.request,message:job.input.message};}
        // The draft is created before uploads finish. Persist the complete
        // asset manifest before handing the request to the production runner
        // so observation, planning and recovery all see the same inputs that
        // are currently attached to the project.
        p.request={...p.request,assets:structuredClone(p.assets)};
        if(p.workflowPlan){
          const workflow=productionWorkflowFromPlan(p.workflowPlan,{message:p.request.message,assets:p.assets,baseRevisionId:job.baseRevisionId});
          p.request={...p.request,workflow,taskMode:workflow.taskMode,scenarioId:workflow.businessScenario};
          job.planningConsumption=structuredClone(workflow.planningConsumption);
        }
        job.stage='观察素材与设计分镜';await save(p);
        const dir=path.join(directory(p),'versions',job.id);
        await buildCommerceProject({...p.request,projectId:p.id,assets:p.assets,outputDir:path.relative(root,dir).replaceAll('\\','/'),render:false,planning:'model',signal,resumeRunId:job.resumeRunId,onRun:async run=>{syncRun(job,run);await save(p);},onStage:async stage=>{job.stage=stage;await save(p);}},{root});
        const {document}=await readNativeProject(dir);p.title=document.brief.name;job.stage='检查原生预览';await save(p);const created=await publish(p,job,dir,document,'初始创作');await candidateExport(p,job,created,signal);job.summary='候选 MP4 与原生工程已导出，等待画面与人工审查。';
      }else if(job.kind==='edit'){
        const base=revision(p,job.baseRevisionId),from=versionDirectory(p,base),{document,assets}=await readNativeProject(from);
        job.input.workflow=inheritRevisionWorkflow(document,job.input.workflow);
        // Earlier native manifests omitted synthesis metadata. Recover only
        // the saved request for the exact same locally recorded audio bytes.
        for(const asset of assets){
          const saved=p.assets.find(a=>a.id===asset.id&&a.sha256===asset.sha256&&a.generatedVoice);
          if(!asset.speechRequest&&saved?.speechRequest)asset.speechRequest=structuredClone(saved.speechRequest);
        }
        // Migrate legacy, byte-bound synthesis records and explicitly reviewed
        // source-script cues. Ordinary caption edits are never speech scripts.
        let speechAncestor=base;
        while(speechAncestor&&assets.some(a=>a.generatedVoice&&!a.speechRequest?.segments)){
          const sourceDir=versionDirectory(p,speechAncestor);
          const narration=JSON.parse(await fs.readFile(path.join(sourceDir,'narration.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e;}));
          const oldDocument=JSON.parse(await fs.readFile(path.join(sourceDir,'document.json'),'utf8'));
          for(const asset of assets){
            if(narration?.asset?.id!==asset.id||narration.asset.sha256!==asset.sha256)continue;
            if(!asset.speechRequest&&narration.script?.text)asset.speechRequest={text:narration.script.text,voice:narration.voice||narration.script.voice,rate:narration.rate??1};
            const approved=(oldDocument.captions||[]).filter(c=>c.assetId===asset.id&&c.corrected&&c.source==='local-asr-corrected-against-retained-tts-script');
            if(asset.speechRequest&&!asset.speechRequest.segments&&approved.length)asset.speechRequest.segments=approved.map(c=>({start:c.sourceStartSeconds,end:c.sourceEndSeconds,text:c.text}));
          }
          speechAncestor=p.revisions.find(r=>r.id===speechAncestor.parentId);
        }
        const dir=path.join(directory(p),'versions',job.id);await copyAssets(from,dir);
        // Explicit whole-film replacement is deterministic and material-backed.
        // Do not spend a fragile planner/model call to rediscover an intent we
        // can prove from the request itself; malformed provider JSON must not
        // turn a supported edit into an unexplained JSON parse failure.
        // Replacement intent must come from the current request and approved assets.
        // 已禁用外部替换快捷判断 - 统一走完整编辑规划
        const externalIntent={needed:false,skipped:'unified-edit-path'};
        let downloadedExternalAsset=null;
        // A previous attempt may already have downloaded the traceable target
        // image. Reuse it for retries even if the intent model now reports
        // `needed:false`; the deterministic fallback must remain available
        // for an explicit whole-film replacement request.
        if(externalIntent.needed){
          job.stage='搜索可追溯的替换素材';await save(p);
          try{
            const candidate=await searchCommonsImage(externalIntent.query,{signal});
            const asset=await downloadCommonsImage(candidate,{root,projectDirectory:directory(p),signal});
            p.assets.push(asset);downloadedExternalAsset=asset;job.externalAsset={status:'downloaded',assetId:asset.id,query:externalIntent.query,sourceUrl:candidate.sourceUrl,license:candidate.license,artist:candidate.artist,reason:externalIntent.reason};
            p.messages.push({role:'assistant',text:`已自动找到并加入替换素材：${candidate.title.replace(/^File:/i,'')}。来源：Wikimedia Commons；许可：${candidate.license}。正在生成替换候选。`,attachmentIds:[asset.id],time:now()});await save(p);
          }catch(error){
            job.externalAsset={status:'search_failed',query:externalIntent.query,code:error.code||'EXTERNAL_ASSET_FAILED',error:error.message};
            p.messages.push({role:'assistant',text:'公共素材搜索未成功，正在使用现有素材与编辑能力继续尝试；当前版本不会被覆盖。',time:now()});await save(p);
          }
        }
        if(downloadedExternalAsset&&!job.externalAsset){
          job.externalAsset={status:'reused',assetId:downloadedExternalAsset.id,reason:'复用已下载的可追溯外部素材'};
        }
        if(job.input.audioReplacement){
          const request=speechReplacementRequest(document,assets,job.input.audioReplacement);
          job.stage='生成替换旁白，保留当前版本';await save(p);
          const asset=await generateAudioAsset(root,directory(p),request,{signal,transport:audioTransport,env:audioEnv});
          if(!p.assets.some(a=>a.id===asset.id))p.assets.push(asset);
          job.resultAssetId=asset.id;job.audioGeneration=asset.audioGeneration;await save(p);
          job.input.operations=await audioApplication(root,document,asset,{replaceTrackId:job.input.audioReplacement.replaceTrackId,captions:true});
        }
        const added=[];for(const asset of p.assets.filter(a=>!assets.some(b=>b.id===a.id))){const prepared=await prepareCreativeAsset(root,asset,path.join(dir,'assets'),{signal});prepared.compiledRef=`assets/${path.basename(prepared.normalizedRef)}`;assets.push(prepared);added.push(prepared);document.assetRefs.push(prepared.id);}
        if(assets.some(a=>a.kind==='font'))document.fontResources=brandFontResources(assets);
        const visualTargets=(job.input.routeDecision?.targets||[]).filter(t=>['visual','effect'].includes(t.kind));
        const targetIds=new Set(visualTargets.map(t=>t.id).filter(Boolean));
        const visualAssetIds=new Set(document.nodes.filter(n=>targetIds.has(n.id)||targetIds.has(n.sceneId)).map(n=>n.assetId).filter(Boolean));
        const retainedVisuals=visualTargets.length?assets.filter(a=>a.kind==='image'||visualAssetIds.has(a.id)).filter(a=>['image','video'].includes(a.kind)).slice(0,8):[];
        const observed=[...new Map([...added.filter(a=>a.kind!=='font'),...retainedVisuals,...assets.filter(a=>a.kind==='audio'&&!a.generatedVoice)].map(a=>[a.id,a])).values()].map(a=>({...a,normalizedRef:path.relative(root,path.join(dir,a.compiledRef)).replaceAll('\\','/')}));
        const evidence=observed.length?await collectCreativeEvidence(observed,dir,root,signal):{inputs:[],records:[]};
        document.audioEvidence=evidence.records.filter(r=>r.audioAnalysis).map(r=>({assetId:r.assetId,sha256:r.sha256,...r.audioAnalysis}));
        const countInvocation=async invocation=>{job.modelCalls=(job.modelCalls||0)+1;(job.modelInvocations??=[]).push({...invocation,stage:'R7-edit'});await save(p);};
        job.stage='理解局部修改';await save(p);
        let plan;
        const uploadedVideo = (job.input.attachmentIds||[])
          .map(id=>assets.find(asset=>asset.id===id))
          .find(asset=>asset?.kind==='video' && asset.mediaMetadata?.duration)
          || added.find(asset=>asset.kind==='video' && asset.mediaMetadata?.duration)
          || (/(?:刚加的字|刚才的字|新增的字|新增(?:独立)?文字对象|这段视频|本视频|该视频)/u.test(job.input.message||'') || uploadedVideoTitle(job.input.message)
            ? assets.find(asset=>asset.kind==='video'&&document.nodes.some(node=>node.kind==='video'&&node.assetId===asset.id))
            : null);
        const uploadedVideoPlan = uploadedVideo && (/(?:这段视频|刚上传|上传(?:的|视频)|本视频|该视频|刚加的字|刚才的字|新增的字)/u.test(job.input.message||'') || uploadedVideoTitle(job.input.message))
          ? deterministicUploadedVideoEdit(document, uploadedVideo, job.input.message)
          : null;
        if(uploadedVideoPlan){
          plan={mode:'deterministic-uploaded-video',model:'local',summary:uploadedVideoPlan.summary,operations:uploadedVideoPlan.operations,alternatives:[],workflow:null,resourceScopes:[]};
          job.stage='绑定上传视频并校验原声';await save(p);
        }else if(externalIntent.needed&&downloadedExternalAsset){
          // Whole-film object replacement is deliberately deterministic once
          // a rights-tracked target image exists. This prevents the planner
          // from emitting custom-native mappings that cannot be proven against
          // the compiled asset manifest, while retaining all downstream
          // native/compiler/HyperFrames quality gates.
          const operations=deterministicExternalReplacement(document,downloadedExternalAsset.id);
          insist(operations.length>0,'未找到可替换的画面对象','NEEDS_INPUT');
          plan={mode:'deterministic-external-replacement',model:'fallback',summary:'已使用可追溯公共素材，将全片画面替换为目标产品并移除旧产品动作/事实文案。',operations,alternatives:[],workflow:null,resourceScopes:[]};
          job.stage='使用确定性替换方案';await save(p);
        }else{
          try{
            plan=await planEdit(p,base,document,job.input,signal,{evidenceInputs:evidence.inputs,assetMetadata:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata})),onInvocation:countInvocation,cacheRoot:path.join(dir,'model-calls')});
          }catch(error){
            // Do not turn an explicit, material-backed whole-film replacement
            // into a user block merely because the local edit planner returned
            // no safe operation. The deterministic plan is still validated by
            // the same native patch/compiler/HyperFrames review gates below.
            if(error.code!=='NEEDS_INPUT'||!downloadedExternalAsset||!externalIntent.needed)throw error;
            const operations=deterministicExternalReplacement(document,downloadedExternalAsset.id);
            insist(operations.length>0,'未找到可替换的画面对象','NEEDS_INPUT');
            plan={mode:'deterministic-external-replacement',model:'fallback',summary:'已使用可追溯公共素材，将全片画面替换为目标产品并移除旧产品动作/事实文案。',operations,alternatives:[],workflow:null,resourceScopes:[]};
            job.stage='使用确定性替换方案';await save(p);
          }
        }
        job.summary=plan.summary;job.routeDecision=routeDecision(p,job.input.message,{...job.input.routeDecision,mode:job.input.taskMode||'edit',source:plan.mode,targets:undefined,requestedTargets:job.input.routeDecision?.targets||[],reason:plan.summary||job.input.routeDecision?.reason},{document,operations:plan.operations||[]});
        if(plan.alternatives?.length){
          const candidates=[];
          for(const [i,alternative] of plan.alternatives.entries()){
            job.stage=`检查开头方案 ${i+1}/${plan.alternatives.length}`;await save(p);
            const candidate=allocatePublicationRevision(applyDocumentPatch(document,alternative.operations,Object.fromEntries(assets.map(a=>[a.id,a]))),p.revisions,job.id);assertOpeningOnly(document,candidate);
            candidate.workflowContract=bindRevisionWorkflow(document,candidate,job.input.workflow,{message:job.input.message,operations:alternative.operations,interpreted:plan.workflow});
            const branchDir=path.join(directory(p),'versions',job.id+'-alternative-'+(i+1));await copyAssets(dir,branchDir);
            await fs.writeFile(path.join(branchDir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
            await writeCompiledProject(branchDir,candidate,assets,{invalidation:computeInvalidation(document,candidate),signal});
            await fs.writeFile(path.join(branchDir,'edit.json'),JSON.stringify({message:job.input.message,baseRevisionId:base.id,...alternative,model:plan.model},null,2));
            candidates.push(await publish(p,job,branchDir,candidate,'开头方案 · '+alternative.name,{branch:true,defer:true}));
          }
          insist(new Set(candidates.map(r=>r.id)).size===candidates.length,'开头方案重复，请重新提出不同方案','DUPLICATE_BRANCHES');
          const prior=[...p.revisions];p.revisions.push(...candidates);job.revisionIds=candidates.map(r=>r.id);
          try{await save(p);}catch(error){p.revisions=prior;delete job.revisionIds;throw error;}
          job.summary=`已保存 ${candidates.length} 个开头方案，可在作品版本中比较和选择，主版本保留。`;job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:job.summary,time:now()});return;
        }
        validateConversationTargetScope(document,plan.operations,plan.targetScope);
        job.requestedScope=plan.targetScope||null;
        const requestedOperations=structuredClone(plan.operations),operations=[];
        const pendingOperations=[...plan.operations];
        for(let operationIndex=0;operationIndex<pendingOperations.length;operationIndex++){
          const op=pendingOperations[operationIndex];
          if(op.type==='regenerate_speech'){
            const current=operations.length?applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a]))):document;
            const request=speechReplacementRequest(current,assets,{replaceTrackId:op.nodeId,text:op.text,voice:op.params?.voice,rate:op.params?.rate});
            job.stage='生成指定旁白并重新安排字幕';await save(p);
            const asset=await generateSpeechAsset(root,directory(p),request,{signal});
            if(!p.assets.some(a=>a.id===asset.id))p.assets.push(asset);
            job.resultAssetId=asset.id;job.audioGeneration=asset.audioGeneration;await save(p);
            if(!assets.some(a=>a.id===asset.id)){
              const prepared=await prepareCreativeAsset(root,asset,path.join(dir,'assets'),{signal});prepared.compiledRef=`assets/${path.basename(prepared.normalizedRef)}`;assets.push(prepared);document.assetRefs.push(prepared.id);
            }
            const generated=await audioApplication(root,current,asset,{replaceTrackId:op.nodeId,captions:true});
            pendingOperations.splice(operationIndex+1,0,...generated);
          }else if(op.type==='generate_captions'){
            job.stage='识别人声与字幕时间';await save(p);
            const current=operations.length?applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a]))):document;
            const scope={assetId:op.assetId,trackId:op.nodeId,language:op.params?.language};
            const recognized=preserveCaptionStyles(await recognizeNativeCaptions(current,assets,dir,{...scope,signal}),op.previousCaptionStyles);
            operations.push({type:'set_captions',captions:mergeRecognizedCaptions(current,recognized,scope)});
          }else operations.push(op);
        }
        plan.requestedOperations=requestedOperations;plan.operations=operations;
        let next=applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a])));
        const revisionIntent=applyDirectorRevisionIntent(document,next,job.input.message,operations);
        await fs.writeFile(path.join(dir,'revision-intent.json'),JSON.stringify(revisionIntent,null,2));
        job.changeReceipt=nativeChangeReceipt(document,next,job.input.message,operations,plan.targetScope);
        if(plan.resourceScopes?.length)next.resourceScopeBindings=structuredClone(plan.resourceScopes);
        next.workflowContract=bindRevisionWorkflow(document,next,job.input.workflow,{message:job.input.message,operations,interpreted:plan.workflow});
        const allowed=computeInvalidation(document,next),allowedScenes=new Set(allowed.fullRecompile?document.scenes.map(s=>s.id):allowed.changedScenes);
        await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
        const failures=new Map();
        for(let attempt=0;attempt<=fallbackPolicy.maxReplans;attempt++){
          try{
            allocatePublicationRevision(next,p.revisions,job.id);
            job.changeReceipt=nativeChangeReceipt(document,next,job.input.message,operations,plan.targetScope);
            job.stage=attempt?'检查局部修复后的画面':'检查修改后的原生预览';await save(p);
            await writeCompiledProject(dir,next,assets,{invalidation:computeInvalidation(document,next),signal});
            job.changeReceipt=nativeChangeReceipt(document,next,job.input.message,[...operations,...(plan.repairs||[]).flatMap(r=>r.operations)],plan.targetScope);
            await fs.writeFile(path.join(dir,'edit.json'),JSON.stringify({message:job.input.message,baseRevisionId:base.id,routeDecision:job.routeDecision,changeReceipt:job.changeReceipt,...plan},null,2));
            const branch=job.input.branch===true||job.input.workflow?.taskMode==='variant';
            const published=await publish(p,job,dir,next,job.input.message,{branch});
            if(!branch){
              await candidateExport(p,job,published,signal);
            }
            job.planSummary=plan.summary;
            const changed=(job.changeReceipt?.changedFields||[]).map(field=>({nodes:'画面对象',scenes:'镜头',audioGraph:'声音',captions:'字幕',transitions:'转场',output:'画幅',durationFrames:'时长'}[field]||field)).join('、');
            const explanation=completedEditSummary(plan.summary);
            job.summary=(branch?'派生版本已独立保存，母版保持。':'修改已应用并保存新版本。')+` 实际变化：${changed}。`+(explanation?` 方案依据：${explanation}`:'');break;
          }catch(error){
            await fs.writeFile(path.join(dir,`edit-failure-${attempt}.json`),JSON.stringify({revisionId:next.revisionId,error:error.message,code:error.code,issues:error.issues},null,2));
            const failureKey=JSON.stringify([error.code,error.issues||error.message]);failures.set(failureKey,(failures.get(failureKey)||0)+1);
            if(!next.production||signal.aborted||attempt>=fallbackPolicy.maxReplans||failures.get(failureKey)>=fallbackPolicy.identicalFailureLimit||error.code!=='EDIT_VISUAL_REVIEW')throw error;
            const repair=await planCreativeEdit(next,'只修复本次修改造成的这些画面问题：'+JSON.stringify(error.issues)+'。允许修改的镜头：'+JSON.stringify([...allowedScenes])+'。只能修改这些镜头的自定义布局/动效源码、已有效果参数或明确字幕ID的样式，保持字幕时间、全文字、媒体区间、声音、时长和其他镜头。',{signal,root,onInvocation:countInvocation,cacheRoot:path.join(dir,'model-calls'),evidenceInputs:evidence.inputs,assetMetadata:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata}))});
            const requestedCaptionIds=new Set((job.changeReceipt?.targetSet||[]).filter(t=>/caption/.test(t.type)).map(t=>t.id).filter(Boolean));
            const allowedCaptions=new Set(projectNativeCaptions(next).filter(c=>(!requestedCaptionIds.size||requestedCaptionIds.has(c.id))&&next.scenes.some(s=>allowedScenes.has(s.id)&&c.startFrame<s.startFrame+s.durationFrames&&c.startFrame+c.durationFrames>s.startFrame)).map(c=>c.id));
            insist(repair.operations.length&&repair.operations.every(op=>['update_custom_source','update_effect_params'].includes(op.type)&&allowedScenes.has(op.sceneId)||op.type==='update_caption_style'&&allowedCaptions.has(op.nodeId)),'自动修复超出本次允许的布局范围','REPAIR_SCOPE');
            await fs.writeFile(path.join(dir,`edit-before-repair-${attempt}.json`),JSON.stringify(next,null,2));
            next=applyDocumentPatch(next,repair.operations,Object.fromEntries(assets.map(a=>[a.id,a])));(plan.repairs??=[]).push(repair);job.repairCount=attempt+1;
          }
        }
      }else if(job.kind==='export'){
        await candidateExport(p,job,revision(p,job.baseRevisionId),signal);
      }
      job.status='complete';delete job.code;delete job.error;job.completedAt=now();p.messages.push({role:'assistant',text:job.kind==='export'?'已导出指定版本。':job.summary||'预览检查通过，新版本已保存。',revisionId:job.revisionId,time:now()});
    }catch(e){job.failureReceipt=failureReceipt(e,{request:job.input.message||job.input.request?.message||p.request.message,revisionId:job.baseRevisionId,publishedRevisionId:job.revisionId,requirements:job.input.workflow?.requirements||[],targets:job.routeDecision?.targets||[]});job.status=signal.aborted?'cancelled':e.code==='NEEDS_INPUT'?'needs_user':(job.runId||['create','audio'].includes(job.kind))?'recoverable':'failed';job.error=signal.aborted?'已取消，上一有效版本保留':e.message;job.code=e.code||'CREATIVE_JOB_FAILED';job.gaps=e.gaps||job.gaps;job.completedAt=now();p.messages.push({role:'assistant',text:job.error,time:now()});}
    finally{
      controllers.delete(job.id);delete job.snapshot;job.durationMs=Date.parse(job.completedAt)-Date.parse(job.startedAt);
      // Route jobs are the durable acknowledgement boundary for asynchronous
      // children. Close the parent when its child reaches a terminal state so
      // OpenClaw status never remains "running" after the requested work is
      // actually done.
      for(const routeJob of p.jobs.filter(item=>item.routeJob&&item.childJobId===job.id)){
        if(active(job)){
          routeJob.status='running';
          routeJob.stage='已创建制作任务';
        }else{
          routeJob.status=job.status;
          routeJob.stage=job.status==='complete'?'路由与子任务已完成':`子任务${job.stage||'已结束'}`;
          routeJob.error=job.error||null;
          routeJob.code=job.code||null;
          routeJob.completedAt=routeJob.completedAt||now();
        }
      }
      await save(p).catch(error=>{job.persistenceError=error.code||error.message;console.error('创作任务状态暂未写入，上一已提交版本保留：',p.id,job.id,error.code||error.message);});
      const order=p.workflowPlan?.workOrder;
      if(job.status==='complete'&&job.kind==='plan'&&job.input.autoExecute&&p.workflowPlan?.status!=='needs_input'&&order?.baseRevisionId===p.currentRevisionId){
        queueMicrotask(()=>enqueue(p,{action:p.currentRevisionId?'patch':'generate',message:job.input.message,displayMessage:null,suppressUserMessage:true,taskMode:order.mode,taskModeExplicit:true,scenarioId:order.scenario,planId:p.workflowPlan.id,fromPlanJobId:job.id,idempotencyKey:(job.idempotencyKey||job.id)+':execute'}).catch(async error=>{p.messages.push({role:'assistant',text:'方案已保存，但自动执行未能开始：'+error.message,time:now()});await save(p);}));
      }
      if(job.status==='complete'&&job.kind==='create'&&job.autoQualityRevision&&p.currentRevisionId===job.autoQualityRevision.sourceRevisionId){
        const qualityMessage='根据实际MP4质量报告执行一次局部导演修复。只处理这些问题：'+JSON.stringify(job.autoQualityRevision.issues)+'。参考建议：'+JSON.stringify(job.autoQualityRevision.suggestions)+'。保留未涉及镜头、素材源区间、商品事实、声音和历史；不要整片重做。';
        queueMicrotask(()=>enqueue(p,{action:'patch',message:qualityMessage,displayMessage:null,suppressUserMessage:true,qualityRevisionOf:job.id,idempotencyKey:(job.idempotencyKey||job.id)+':quality-revision'}).catch(async error=>{p.messages.push({role:'assistant',text:'候选片质量报告已保存，自动局部修复未能开始：'+error.message,time:now()});await save(p);}));
      }
      if(job.status==='complete'&&job.kind==='edit'&&job.input.qualityRevisionOf&&p.currentRevisionId===job.revisionId){
        queueMicrotask(()=>enqueue(p,{action:'export',revisionId:job.revisionId,suppressUserMessage:true,qualityRevisionOf:job.input.qualityRevisionOf,idempotencyKey:(job.idempotencyKey||job.id)+':quality-export'}).catch(async error=>{p.messages.push({role:'assistant',text:'质量修订已保存，但自动复验导出未能开始：'+error.message,time:now()});await save(p);}));
      }
    }
  }
  async function enqueue(p,input){
    const kind=input.action==='plan-workflow'?'plan':input.action==='audio-generate'?'audio':input.action==='generate-asset'?'asset':input.action==='generate'?'create':input.action==='render'||input.action==='export'?'export':'edit';
    if(input.idempotencyKey){const old=p.jobs.find(j=>j.idempotencyKey===input.idempotencyKey);if(old)return old;}
    if(kind==='create'&&['image','video'].includes(input.request?.target||p.request.target))await assertMediaGenerationAllowed(root);
    insist(!p.jobs.some(j=>productionActive(j)&&j.kind!=='export')||kind==='export','当前创作仍在进行','PROJECT_BUSY');
    insist(!Array.from(uploads).some(k=>k.startsWith(p.id+':')),'请等待素材上传完成','UPLOAD_BUSY');
    if(input.baseRevisionId)insist(input.baseRevisionId===p.currentRevisionId,'页面版本已过期，请刷新后再修改','REVISION_CONFLICT');
    if(kind==='plan')input={...input,taskMode:input.taskMode||(!p.currentRevisionId?p.request.taskMode:undefined),taskModeExplicit:input.taskModeExplicit??Boolean(!p.currentRevisionId&&p.request.taskModeExplicit),output:structuredClone(input.output||p.request.output)};
    if(!['export','plan'].includes(kind)){const current=p.revisions.find(r=>r.id===p.currentRevisionId),message=input.message||input.request?.message||p.request.message;const planned=input.planId&&p.workflowPlan?.id===input.planId?productionWorkflowFromPlan(p.workflowPlan,{message,assets:p.assets,baseRevisionId:current?.id||null}):null;input={...input,workflow:planned||workflowContract({...p.request,...input.request,...input,message,taskMode:input.taskMode||input.request?.taskMode||(kind==='edit'?'edit':p.request.taskMode),taskModeExplicit:input.taskModeExplicit??input.request?.taskModeExplicit??Boolean(input.taskMode||input.request?.taskMode),assets:p.assets},{scenarioId:p.request.businessContract?.scenarioId||p.request.scenarioId,baseProjectId:p.id,baseRevisionId:current?.id})};if(input.workflow.taskMode==='variant')insist(current,'变体需要先打开已有原生工程','VARIANT_BASE_REQUIRED');}
    if(kind==='create')insist(!p.currentRevisionId,'项目已有版本，请继续编辑或新建项目','PROJECT_EXISTS');else if(!['audio','plan','asset'].includes(kind))revision(p,input.revisionId||p.currentRevisionId);
    if(kind==='audio'){insist(['speech','music'].includes(input.audio?.kind),'请选择旁白或纯音乐','AUDIO_KIND');insist(p.assets.length<MAX_ASSETS,'最多30个素材','ASSET_LIMIT');}
    if(kind==='export')insist(!p.jobs.some(j=>active(j)&&j.kind==='export'&&j.baseRevisionId===(input.revisionId||p.currentRevisionId)),'这个版本正在导出','EXPORT_BUSY');
    const job={id:'job-'+randomUUID(),kind,input:structuredClone(input),routeDecision:input.routeDecision,baseRevisionId:input.revisionId||p.currentRevisionId,status:'queued',createdAt:now(),idempotencyKey:input.idempotencyKey};if(kind==='export')job.snapshot={...structuredClone(p),jobs:p.jobs.map(({snapshot,...prior})=>structuredClone(prior))};p.jobs.push(job);
    if(input.message&&!input.suppressUserMessage)p.messages.push({role:'user',text:input.displayMessage||input.message,attachmentIds:[...(input.attachmentIds||[])],baseRevisionId:job.baseRevisionId,time:now()});await save(p);void execute(p,job).catch(error=>{job.status='failed';job.error=error.message;job.code=error.code||'CREATIVE_JOB_FAILED';controllers.delete(job.id);console.error('创作任务失败：',p.id,job.id,error.code||error.message);});return job;
  }
  async function waitForJob(p, jobId, {timeoutMs=300000, intervalMs=250}={}) {
    const started=Date.now();
    while(Date.now()-started <= timeoutMs){
      const job=p.jobs.find(item=>item.id===jobId);
      if(!job) throw new CreativeError('任务不存在','JOB_NOT_FOUND');
      if(['complete','failed','recoverable','needs_user','cancelled'].includes(job.status)) return job;
      await new Promise(resolve=>setTimeout(resolve, intervalMs));
    }
    const job=p.jobs.find(item=>item.id===jobId);
    return job || {id:jobId,status:'queued',stage:'等待任务状态持久化'};
  }
  async function navigate(p,input){
    insist(!p.jobs.some(j=>productionActive(j)&&j.kind!=='export'),'编辑完成后可恢复版本','PROJECT_BUSY');
    const current=revision(p),previous={current:p.currentRevisionId,redo:[...p.redo]};let target;
    if(input.action==='undo'){target=current.parentId;insist(target,'已经是初始版本','NO_UNDO');p.redo.push(current.id);}
    else if(input.action==='redo'){target=p.redo.pop();insist(target,'没有可重做版本','NO_REDO');}
    else {target=input.revisionId;p.redo=[];}
    try{revision(p,target);p.currentRevisionId=target;await save(p);}catch(error){p.currentRevisionId=previous.current;p.redo=previous.redo;throw error;}return view(p);
  }
  async function cancel(p,id){const job=p.jobs.find(j=>j.id===id);insist(job&&active(job),'任务不可取消','INVALID_CANCEL');job.cancelRequestedAt=now();job.stage='正在取消';await save(p);controllers.get(id)?.abort();return view(p);}
  async function authorizeBudget(p,input){
    const job=p.jobs.find(j=>j.id===input.jobId);insist(job?.runId&&!active(job),'只能为暂停的原任务批准预算','INVALID_BUDGET');
    insist(!p.jobs.some(j=>productionActive(j)&&j.kind!=='export'),'项目已有任务在执行','PROJECT_BUSY');
    const run=await runStore(p,job).authorizeBudget(job.runId,{maxModelCalls:input.maxModelCalls,completionReserve:input.completionReserve??6,authorizationId:input.idempotencyKey,source:'explicit-webui-approval'});
    syncRun(job,run);await save(p);return view(p);
  }
  async function resume(p,id){const job=p.jobs.find(j=>j.id===id);insist(canResumeJob(job),budgetExhausted(job)?'本轮修复预算已耗尽，已保留检查点和缺陷；不能重复恢复同一轮':'任务没有可恢复检查点','INVALID_RESUME');insist(!p.jobs.some(j=>productionActive(j)&&j.kind!=='export'),'项目已有任务在执行','PROJECT_BUSY');if(job.routeJob){job.status='queued';job.stage='等待路由恢复';job.error=null;job.code=null;job.retryScheduled=false;job.input={...job.input,idempotencyKey:job.input?.idempotencyKey||job.id};await save(p);void dispatchMessage(p,{...job.input},job).catch(async error=>{job.status='recoverable';job.stage='等待路由恢复';job.error=error?.message||'路由恢复失败';job.code=error?.code||'MESSAGE_ROUTE_RESUME_FAILED';job.retryable=true;try{await save(p);}catch(persistError){job.persistenceError=persistError?.message||'路由恢复状态保存失败';console.error('video route resume persistence error',persistError);}});return view(p);}insist(p.currentRevisionId===(job.revisionId||job.baseRevisionId),'基准版本已变化，保留旧任务但不能覆盖新版本','REVISION_CONFLICT');delete job.cancelRequestedAt;if(job.kind==='audio')job.input.audio.retryKnownFailure=true;job.resumeRunId=job.runId;job.status='queued';delete job.error;delete job.code;delete job.completedAt;await save(p);void execute(p,job).catch(error=>{job.status='recoverable';job.error=error.message;});return view(p);}
  for(const p of projects.values())for(const job of p.jobs){
    if(job.status==='recoverable'&&job.code==='INTERRUPTED'&&!job.cancelRequestedAt&&(job.routeJob||(job.generationPlan||job.generationStarted)))queueMicrotask(()=>resume(p,job.id).catch(async error=>{job.status='recoverable';job.code=error.code;job.error=error.message;await save(p);}));
  }
  async function openclawProjectContext(p){
    const current=p.currentRevisionId?revision(p):null;
    const document=current?(await readNativeProject(versionDirectory(p,current))).document:null;
    return {id:p.id,title:p.title,currentRevisionId:p.currentRevisionId,request:p.request,assets:p.assets.map(({id,name,kind,mediaMetadata})=>({id,name,kind,mediaMetadata})),messages:p.messages.slice(-10),revisions:p.revisions.map(({id,parentId,summary})=>({id,parentId,summary})),document:document?{revisionId:document.revisionId,output:document.output,scenes:document.scenes,nodes:document.nodes,audioGraph:document.audioGraph,captions:document.captions,businessContract:document.businessContract}:null};
  }
  async function validateOpenclawOperations(p,operations){
    const current=revision(p);
    insist(current,'当前工程没有可编辑版本','REVISION_REQUIRED');
    const {document,assets}=await readNativeProject(versionDirectory(p,current));
    insist(Array.isArray(operations)&&operations.length>0,'至少需要一个受控操作','OPERATION_REQUIRED');
    const generation=[];const patch=[];
    for(const op of operations){
      insist(op&&typeof op.type==='string','操作缺少 type','OPERATION_SCHEMA');
      if(op.type==='generate_captions'){insist(!op.text&&!op.sceneId,'字幕生成不能携带文案或场景字段','OPERATION_SCHEMA');generation.push(op);continue;}
      if(op.type==='regenerate_speech'){insist(op.nodeId,'旁白重生成必须指定现有音轨','OPERATION_SCHEMA');insist(document.audioGraph?.some(t=>t.id===op.nodeId&&['narration','voiceover'].includes(t.role)),'旁白音轨不存在或不是可重生成音轨','PATCH_TARGET_MISSING');generation.push(op);continue;}
      patch.push(op);
    }
    // Generation operations are side-effectful and are only checked for their
    // stable targets here.  They are expanded into native patch operations by
    // the executor after the job is authorized; never run them in preflight.
    if(patch.length)applyDocumentPatch(structuredClone(document),patch,Object.fromEntries(assets.map(asset=>[asset.id,asset])));
    return {revisionId:current.id,operationCount:operations.length,generationOperations:generation.map(({type,nodeId,assetId,params})=>({type,nodeId:nodeId||null,assetId:assetId||null,params:params||{}})),sideEffects:false};
  }
  async function recordControlResult(p,input,result){
    const key=input.idempotencyKey;
    if(p.messages.some(m=>m.controlMessageId===key))return;
    if(!p.jobs.some(j=>result.operationId&&j.input?.operationId===result.operationId)&&!p.messages.some(m=>m.role==='user'&&m.text===input.message&&m.baseRevisionId===input.baseRevisionId))p.messages.push({role:'user',text:input.message,baseRevisionId:input.baseRevisionId,time:now()});
    p.messages.push({role:'assistant',text:result.summary,controlMessageId:key,controlStatus:result.status,time:now()});await save(p);
  }
  return {openclawProjectContext,validateOpenclawOperations,recordControlResult,artifacts,dispatchMessage,submitMessage,searchResources,audioVoices:()=>new MiniMaxClient({root,env:audioEnv,transport:audioTransport}).execute('voices'),applyAudio:async(p,input)=>{const {document}=await readNativeProject(versionDirectory(p,revision(p)));const operations=await audioApplication(root,document,p.assets.find(a=>a.id===input.assetId),input);return enqueue(p,{...input,action:'patch',operations,message:(input.replaceTrackId?'替换已选':'添加已选')+(input.role==='narration'?'旁白':input.role==='original'?'原声':'背景音乐')});},productionPolicy:()=>productionPolicy(root),finishedWorks:()=>readFinishedWorks(root),materialRoots:async()=>(await discoverMaterialRoots(root)).map(publicMaterialRoot),attachMaterialRoot,get,has:id=>projects.has(id),view,create,loadPreset,presetFile,presets:async()=>(await refreshPresets()).map(publicPreset),unavailablePresets:async()=>(await refreshPresets()).unavailable||[],upload,importPackage,retryImport,enqueue,waitForJob,navigate,cancel,resume,authorizeBudget,revision,versionDirectory,list:()=>[...projects.values()].map(view).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
}

export async function creativeRoutes(service,req,res,url,{json,jsonBody,file,dispatchMessage=service.dispatchMessage}){
  if(req.method==='GET'&&url.pathname==='/api/commerce-capabilities'){json(res,{ok:true,workflowEntries,workflowPlanning:{action:'plan-workflow',productionStarted:false,skills:commerceSkills,stages:workflowStages()},...await service.productionPolicy(),audioProviders:{local:{speech:'not_verified',transcription:'not_verified',music:'local-files'},minimax:minimaxCapabilityStatus()}});return true;}
  if(req.method==='GET'&&url.pathname==='/api/commerce-material-roots'){json(res,{ok:true,roots:await service.materialRoots()});return true;}
  if(await humanReviewRoute(ROOT,service,req,res,url,{json,jsonBody}))return true;
  const route=url.pathname;
  const presetMatch=/^\/api\/commerce-presets\/([a-zA-Z0-9_-]+)\/(video|artifacts)$/.exec(route);
  if(presetMatch&&['GET','HEAD'].includes(req.method)){
    const target=await service.presetFile(presetMatch[1]);
    if(presetMatch[2]==='artifacts'){json(res,{presetId:presetMatch[1],files:[{name:'MP4',...await artifactFile(target,`/api/commerce-presets/${presetMatch[1]}/video?download=1`)}]});return true;}
    res.setHeader('X-Delivery-Status','preset-reference');
    await file(req,res,target,'video/mp4',url.searchParams.has('download')?path.basename(target):undefined);return true;
  }
  if(route==='/api/commerce-finished'&&req.method==='GET'){const works=await service.finishedWorks();json(res,{works:works.map(publicFinishedWork),unavailable:works.unavailable||[]});return true;}
  const finishedMatch=/^\/api\/commerce-finished\/([a-zA-Z0-9_-]+)\/(video|package|artifacts)$/.exec(route);
  if(finishedMatch&&['GET','HEAD'].includes(req.method)){
    const work=(await service.finishedWorks()).find(w=>w.id===finishedMatch[1]);insist(work,'成品不存在或本机未安装','FINISHED_WORK_NOT_FOUND');
    if(finishedMatch[2]==='artifacts'){const files=[{name:'MP4',...await artifactFile(work.video,`/api/commerce-finished/${work.id}/video?download=1`)}];if(work.packageFile)files.push({name:'原生工程',...await artifactFile(work.packageFile,`/api/commerce-finished/${work.id}/package?download=1`)});json(res,{workId:work.id,files});return true;}
    const isVideo=finishedMatch[2]==='video',target=isVideo?work.video:work.packageFile;insist(target,'成品文件不存在','FINISHED_WORK_NOT_FOUND');
    res.setHeader('X-Delivery-Status',work.provenance?.startsWith('reference-')?'reference-author':'candidate');await file(req,res,target,isVideo?'video/mp4':'application/zip',url.searchParams.has('download')?path.basename(target):undefined);return true;
  }
  if(route==='/api/commerce-import'&&req.method==='POST'){const p=await service.importPackage(req);json(res,{ok:true,project:service.view(p)},202);return true;}
  if(route==='/api/commerce-demos'&&req.method==='GET'){const all=await service.presets();const goals=['launch','detail','demo','style','promotion','faq'];const presets=goals.map(goal=>all.find(p=>(p.businessGoal||[]).includes(goal)&&/^demo-N/.test(p.id))||all.find(p=>(p.businessGoal||[]).includes(goal))).filter(Boolean);json(res,{presets,unavailable:await service.unavailablePresets()});return true;}
  if(route==='/api/commerce-execution-status'&&req.method==='GET'){json(res,executionStatus(service.list(),await loadCloseoutQueue(ROOT)));return true;}
  if(route==='/api/commerce-projects'&&req.method==='GET'){let historyProjectIds=[];try{historyProjectIds=JSON.parse(await fs.readFile(path.join(ROOT,'examples/commerce/history-projects.json'),'utf8')).projectIds||[];}catch(error){if(error.code!=='ENOENT')throw error;}json(res,{projects:service.list(),historyProjectIds});return true;}
  // OpenClaw plugin routes
  const openclawProject=/^\/api\/openclaw\/commerce\/([a-zA-Z0-9_-]{1,100})$/.exec(route);
  if(openclawProject&&req.method==='GET'){
    const projectId=openclawProject[1];
    if(!service.has(projectId)){json(res,{ok:false,error:'项目不存在',code:'PROJECT_NOT_FOUND'},404);return true;}
    json(res,{ok:true,...service.view(service.get(projectId))});return true;
  }
  if(route==='/api/openclaw/commerce'&&req.method==='GET'){
    json(res,{ok:true,projects:service.list()});return true;
  }
  if(route==='/api/commerce-chat'&&req.method==='POST'&&(req.headers['content-type']||'').includes('application/json')){
    const input=await jsonBody(req,256000,'创作请求');
    if(input.action==='audio-voices'){json(res,{ok:true,...await service.audioVoices()});return true;}
    if(input.action==='preset'){const p=await service.loadPreset(input.presetId,{idempotencyKey:input.idempotencyKey,expectedSha256:input.expectedSha256});json(res,{ok:true,project:service.view(p)},201);return true;}
    if(input.action==='material-root'){const p=service.get(input.projectId);await service.attachMaterialRoot(p,input.materialRootId,input.assetIds);json(res,{ok:true,project:service.view(p)});return true;}
    if(input.action==='draft'){const request={...input.request,commerceProfile:FOCUS_PROFILE};request.businessContract=businessContract(request);const p=await service.create(request);json(res,{ok:true,project:service.view(p)},201);return true;}
    if(input.action==='plan-workflow')insist(service.has(input.projectId),'请先建立工作台草稿','PROJECT_NOT_FOUND');
    if(!service.has(input.projectId)){
      insist(/^[a-zA-Z0-9_-]{1,100}$/.test(input.projectId||''),'项目 ID 无效','INVALID_PROJECT');
      const outputDir=`data/commerce-runs/${input.projectId}`;
      const result=input.action==='render'?await renderCommerceProject({...input,outputDir}):await patchCommerceProject({...input,outputDir,render:input.render!==false});
      json(res,{ok:true,result});return true;
    }
    const p=service.get(input.projectId);
    if(input.action==='message'){
      // Do not hold the browser request open while routing/model work runs.
      // The UI already polls the project, so acknowledge immediately and
      // persist failures on the project/job for the normal status path.
      const accepted={project:service.view(p),accepted:true,messageId:input.idempotencyKey};
      void dispatchMessage(p,input).catch(error=>{
        console.error('消息后台处理失败：',p.id,error.code||error.message);
      });
      json(res,{ok:true,...accepted},202);return true;
    }
    if(input.action==='audio-new-submission'){
      const old=p.jobs.find(j=>j.id===input.jobId);
      insist(old?.kind==='audio'&&old.code==='MINIMAX_SUBMISSION_UNKNOWN'&&!active(old),'只能针对结果未知的声音任务授权新提交','INVALID_AUDIO_RECOVERY');
      insist(input.acceptPossibleDuplicateCharge===true&&typeof input.idempotencyKey==='string'&&/^[a-zA-Z0-9-]{16,100}$/.test(input.idempotencyKey),'须明确知晓可能重复计费并提供授权编号','MINIMAX_AUTHORIZATION');
      const job=await service.enqueue(p,{action:'audio-generate',audio:{...old.input.audio,retryKnownFailure:false,previousSubmissionAuthorization:old.input.audio.newSubmissionAuthorization||null,newSubmissionAuthorization:input.idempotencyKey},idempotencyKey:input.idempotencyKey,message:'已核对结果未知的音频请求，明确授权新提交；知晓可能重复计费。'});
      json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;
    }
    if(input.action==='audio-apply'){const job=await service.applyAudio(p,input);json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;}
    if(input.action==='audio-replace-speech'){
      const job=await service.enqueue(p,{...input,action:'patch',audioReplacement:{replaceTrackId:input.replaceTrackId,text:input.text,voice:input.voice,rate:input.rate},message:'修改指定旁白与对应字幕，保持其他音轨和镜头'});
      json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;
    }
    if(input.action==='cancel'){json(res,{ok:true,project:await service.cancel(p,input.jobId)});return true;}
    if(input.action==='authorize_budget'){json(res,{ok:true,project:await service.authorizeBudget(p,input)});return true;}
    if(input.action==='resume'){json(res,{ok:true,project:await service.resume(p,input.jobId)},202);return true;}
    if(['undo','redo','restore'].includes(input.action)){json(res,{ok:true,project:await service.navigate(p,input)});return true;}
    if(input.action==='retry'){const old=p.jobs.find(j=>j.id===input.jobId);if(old?.kind==='import'){json(res,{ok:true,project:await service.retryImport(p,old.id)},202);return true;}insist(old?.status==='failed','该任务不可重试','INVALID_RETRY');input.action=old.kind==='create'?'generate':old.kind==='export'?'export':'patch';Object.assign(input,{...old.input,idempotencyKey:undefined});}
    const job=await service.enqueue(p,input);json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;
  }
  const match=/^\/api\/commerce\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/.exec(route);if(!match||!service.has(match[1]))return false;
  const p=service.get(match[1]),action=match[2]||'';
  if(action==='assets'&&req.method==='POST'){let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw new CreativeError('文件名无效');}json(res,{ok:true,asset:await service.upload(p,req,name)},201);return true;}
  if(['GET','HEAD'].includes(req.method)){
    if(action==='artifacts'){const revisionId=url.searchParams.get('revision');insist(revisionId,'请指定产物版本','REVISION_REQUIRED');json(res,await service.artifacts(p,revisionId));return true;}
    if(action==='delivery-status'){const r=service.revision(p,url.searchParams.get('revision')||p.currentRevisionId);json(res,await deliveryDecision(ROOT,service.versionDirectory(p,r),{currentRevisionId:p.currentRevisionId}));return true;}
    if(action===''||action==='status'){const view=service.view(p);if(p.currentRevisionId&&p.request?.commerceProfile===FOCUS_PROFILE){view.deliveryDecision=await deliveryDecision(ROOT,service.versionDirectory(p,service.revision(p)),{currentRevisionId:p.currentRevisionId});view.deliveryStatus=view.deliveryDecision.status;}json(res,{ok:true,project:view});return true;}
    const audition=/^auditions\/(voice-[a-z0-9]+)\.wav$/.exec(action);
    if(audition){const a=p.auditions?.find(a=>a.id===audition[1]);insist(a,'试听版本不存在','VOICE_NOT_FOUND');await file(req,res,path.join(service.versionDirectory(p,{directory:'.'}),a.path),'audio/wav');return true;}
    const inputAsset=/^input-assets\/([a-zA-Z0-9_-]+)$/.exec(action);
    if(inputAsset){const asset=p.assets.find(a=>a.id===inputAsset[1]);insist(asset,'素材不存在','ASSET_NOT_FOUND');await file(req,res,path.join(ROOT,asset.path),mime[path.extname(asset.path)]||'application/octet-stream',url.searchParams.has('download')?asset.name:undefined);return true;}
    const direction=/^jobs\/([a-zA-Z0-9_-]+)\/direction\/(watch.html|preview.html|document.json|assets\/[a-zA-Z0-9_.-]+)$/.exec(action);
    if(direction){
      const job=p.jobs.find(j=>j.id===direction[1]),record=job?.directionPreview;
      insist(record?.status==='range-engineering-checked'&&/^direction-preview\/[a-f0-9]{16}$/.test(record.directory),'方向预览尚未通过范围检查','PREVIEW_NOT_READY');
      const dir=service.versionDirectory(p,{directory:'versions/'+job.id+'/'+record.directory}),name=direction[2];
      if(name==='watch.html'){
        const html='<!doctype html><meta charset="utf-8"><title>方向预览</title><style>body{margin:24px;background:#151515;color:#eee;font:16px sans-serif}hyperframes-player{display:block;max-width:960px;width:100%;aspect-ratio:'+record.output.width+'/'+record.output.height+'}</style><p>母工程方向预览 · 仅此范围已做工程检查，全片尚未完成，画面与声音待评审。</p><hyperframes-player id="direction" controls src="preview.html"></hyperframes-player><script src="/editor-player.js"></script><script>const p=document.getElementById("direction");p.addEventListener("timeupdate",()=>{if(p.currentTime>='+record.range.endFrame+'/30)p.pause();});p.addEventListener("ready",()=>p.seek(0));</script>';
        res.writeHead(200,{'Content-Type':mime['.html'],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);return true;
      }
      if(name==='preview.html'){const source=await fs.readFile(path.join(dir,'index.html'),'utf8'),html=source.replace('</body>','<script src="assets/runtime.js"></script></body>');res.writeHead(200,{'Content-Type':mime['.html'],'Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);return true;}
      await file(req,res,path.join(dir,name),mime[path.extname(name)]||'application/octet-stream');return true;
    }
    const rm=/^revisions\/([a-zA-Z0-9_-]+)\/(preview.html|document.json|commerce-final.mp4|project.zip|history.zip|final-review\/(?:watch.html|playback-manifest.json|cut-[0-9]{2}.mp4)|assets\/[a-zA-Z0-9_.-]+)$/.exec(action);
    if(rm){const r=service.revision(p,rm[1]),name=rm[2];
      if(name==='preview.html'){const source=await fs.readFile(path.join(service.versionDirectory(p,r),'index.html'),'utf8'),html=source.replace('</body>','<script src="assets/runtime.js"></script></body>');res.writeHead(200,{'Content-Type':mime['.html'],'Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);return true;}
      let servedPath=path.join(service.versionDirectory(p,r),name);if(name==='commerce-final.mp4'){insist(r.rendered,'该版本尚未导出','NOT_EXPORTED');if(url.searchParams.get('delivery')==='formal')servedPath=await formalVideoSnapshot(ROOT,service.versionDirectory(p,r),{currentRevisionId:p.currentRevisionId,getCurrentRevisionId:()=>p.currentRevisionId});else res.setHeader('X-Delivery-Status','candidate');}await file(req,res,servedPath,mime[path.extname(name)]||'application/octet-stream',url.searchParams.has('download')?(name==='commerce-final.mp4'?'candidate-'+r.id+'.mp4':path.basename(name)):undefined);return true;}
  }
  return false;
}
