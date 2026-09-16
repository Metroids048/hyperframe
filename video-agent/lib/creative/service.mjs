import {planWorkbenchWorkflow,workflowStages} from './workflow-design.mjs';
import {workflowContract,workflowEntries} from './workflow-intent.mjs';
import {routeWorkbenchMessage} from './message-routing.mjs';
import {discoverMaterialRoots,resolveMaterialRoot} from './material-roots.mjs';
import {productionPolicy,assertMediaGenerationAllowed} from './production-policy.mjs';
import {minimaxCapabilityStatus} from '../edit/adapters/minimax.mjs';
import {MiniMaxClient} from '../edit/adapters/minimax-client.mjs';
import {failureReceipt,commerceSkills} from './commerce-skills.mjs';
import {generateAudioAsset,audioApplication,speechReplacementRequest,preserveCaptionStyles} from './audio-assets.mjs';
import {humanReviewRoute} from './human-review.mjs';
import {deliveryDecision,formalVideoSnapshot} from './delivery-gate.mjs';
import {businessContract,FOCUS_PROFILE} from './commerce-focus.mjs';
import {AgentRunStore} from '../edit/agent-kernel.mjs';
import {budgetExhausted,canResumeJob} from './recovery.mjs';
import {bindResourceChecks} from './resource-receipts.mjs';
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {acquireRender} from '../render-queue.mjs';
import {linkOrCopy} from '../edit/media.mjs';
import {CreativeError, insist, assetKindFromName, MAX_FILE_BYTES, MAX_ASSETS, stableId,safeRelativePath} from './contracts.mjs';
import {buildCommerceProject,patchCommerceProject,readNativeProject,writeCompiledProject,runHyperFrames,renderCommerceProject} from './runner.mjs';
import {applyDocumentPatch,computeInvalidation} from './patch.mjs';
import {requireCommerceMessagePlan,sceneNumber} from './intent.mjs';
import {planCreativeEdit} from './model-edit.mjs';
import {reviewEditedProject} from './edit-review.mjs';
import {selectiveEffectRestore,allocatePublicationRevision} from './history.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {inspectBrandFont,MAX_FONT_BYTES,brandFontResources} from './brand-fonts.mjs';
import {collectCreativeEvidence} from './model-director.mjs';
import {readCreativePresets, publicPreset} from './presets.mjs';
import {readFinishedWorks,publicFinishedWork} from './finished-works.mjs';
import {replaceFileAtomically} from '../edit/project-store.mjs';
import {creativeVoiceInteraction} from './voice.mjs';
import {recognizeNativeCaptions,mergeRecognizedCaptions} from './captions.mjs';
import {assertOpeningOnly} from './branches.mjs';
import {scopedCommerceEdit} from './r3-intents.mjs';
import {commerceIntake} from './intake.mjs';
import {generateCommerceAsset} from './runninghub.mjs';
import {ensureGenerationPlan,fillGenerationGaps} from './generation-plan.mjs';
import {executionStatus} from './execution-status.mjs';
import {exportCreativeHistory,unpackCreativeHistory,restoreCreativeHistory,MAX_PACKAGE_BYTES} from './portable.mjs';

const active=j=>['queued','running'].includes(j.status);
const now=()=>new Date().toISOString();
const mime={'.woff2':'font/woff2','.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.m4a':'audio/mp4','.mp3':'audio/mpeg','.zip':'application/zip'};
export async function createCreativeService({root=ROOT,dataDir=process.env.VIDEO_AGENT_CREATIVE_DATA_DIR||path.join(root,'data/commerce-runs'),planner='model',audioTransport,audioEnv,routingProvider,planningProvider}={}){
  try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(dataDir,{recursive:true});
  // Verify demo media when the gallery is requested, not before health/startup.
  let presets=[],presetStamp='',presetRefresh=null;
  async function refreshPresets(){
    const st=await fs.stat(path.join(root,'examples/commerce/presets.json')),stamp=st.mtimeMs+':'+st.size;
    if(stamp===presetStamp)return presets;
    if(!presetRefresh)presetRefresh=readCreativePresets(root).then(next=>{presets=next;presetStamp=stamp;return presets;}).finally(()=>{presetRefresh=null;});
    return presetRefresh;
  }
  const projects=new Map(),writes=new Map(),uploads=new Set(),controllers=new Map();
  const directory=p=>path.join(dataDir,p.id);
  const versionDirectory=(p,r)=>path.join(directory(p),r.directory);
  async function save(p){
    const signature=JSON.stringify(p.jobs.map(j=>[j.id,j.status,j.stage,j.runStage,j.checkpoints,j.code,j.error,j.revisionId,j.renderProgress?.completed,j.generationPlan?.shots.map(s=>[s.id,s.status,s.assetId]) ]));if(p.progressSignature!==signature){p.progressSignature=signature;p.recentProgressAt=now();}p.updatedAt=now();const bytes=JSON.stringify(p,null,2),target=path.join(directory(p),'native-project.json');
    const task=(writes.get(p.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.writeFile(target+'.tmp',bytes);await replaceFileAtomically(target+'.tmp',target);});writes.set(p.id,task);await task;
  }
  function runStore(p,job){return new AgentRunStore(path.join(directory(p),'versions',job.id,'runs'));}
  function syncRun(job,run){job.runId=run.id;job.checkpoints=Object.entries(run.checkpoints||{}).filter(([,v])=>v.status==='completed').map(([k])=>k);job.modelCalls=run.modelCalls;job.maxModelCalls=run.maxModelCalls??(run.code==='MODEL_BUDGET'?run.modelCalls:null);job.completionReserve=run.completionReserve||0;job.budgetSource=run.budgetSource||'legacy-application-estimate';job.runStage=run.stage;job.completedShots=job.checkpoints.filter(k=>/^shot-\d+$/.test(k)).length;job.gaps=run.gaps||[];job.quality=run.verification;job.directionPreview=run.artifacts?.directionPreview;}
  for(const id of await fs.readdir(dataDir)){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))continue;
    try{const p=JSON.parse(await fs.readFile(path.join(dataDir,id,'native-project.json'),'utf8'));for(const j of p.jobs.filter(active)){j.status=j.cancelRequestedAt?'cancelled':(j.runId||['create','audio'].includes(j.kind))?'recoverable':'failed';j.error=j.runId?'服务重启，已完成的制作检查点可恢复':'服务重启中断了任务，输入和上一有效版本已保留';j.code='INTERRUPTED';}
      // Older preview copies are derived artifacts, never a second composition entry.
      for(const r of p.revisions){const dir=versionDirectory(p,r),preview=path.join(dir,'preview.html');const copy=await fs.readFile(preview,'utf8').catch(()=>null);if(copy!==null){const source=await fs.readFile(path.join(dir,'index.html'),'utf8');insist(copy===source.replace('</body>','<script src="assets/runtime.js"></script></body>'),'预览副本存在未知修改，已保留文件','PREVIEW_MIGRATION_CONFLICT');await fs.rename(preview,path.join(dir,'preview.html.evidence'));}}
      for(const job of p.jobs)if(job.runId){const run=await runStore(p,job).get(job.runId);if(run)syncRun(job,run);}
      projects.set(id,p);await save(p);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const get=id=>{const p=projects.get(id);if(!p)throw new CreativeError('原生项目不存在','PROJECT_NOT_FOUND',404);return p;};
  const revision=(p,id=p.currentRevisionId)=>{const r=p.revisions.find(r=>r.id===id);if(!r)throw new CreativeError('版本不存在','REVISION_NOT_FOUND',404);return r;};
  const view=p=>({...structuredClone(p),deliveryStatus:p.request?.commerceProfile==='commerce-focus-v1'?'awaiting_review':'legacy_unverified',jobs:p.jobs.map(({snapshot,...job})=>({...job,...(job.directionPreview?{directionPreview:{...job.directionPreview,previewUrl:`/api/commerce/${p.id}/jobs/${job.id}/direction/watch.html`}}:{}),resumeAllowed:canResumeJob(job),budgetExhausted:budgetExhausted(job)})),auditions:(p.auditions||[]).map(a=>({...a,url:`/api/commerce/${p.id}/auditions/${a.id}.wav`})),revisions:p.revisions.map(r=>({...r,previewUrl:`/api/commerce/${p.id}/revisions/${r.id}/preview.html`,videoUrl:r.rendered?`/api/commerce/${p.id}/revisions/${r.id}/commerce-final.mp4`:null,documentUrl:`/api/commerce/${p.id}/revisions/${r.id}/document.json`,packageUrl:r.historyPackaged?`/api/commerce/${p.id}/revisions/${r.id}/history.zip`:r.packaged?`/api/commerce/${p.id}/revisions/${r.id}/project.zip`:null}))});
  async function create(input={}){
    const p={schemaVersion:1,id:randomUUID(),title:String(input.product?.name||'新创作'),createdAt:now(),updatedAt:now(),request:input,assets:[],revisions:[],currentRevisionId:null,jobs:[],messages:[],redo:[]};
    await fs.mkdir(path.join(directory(p),'uploads'),{recursive:true});projects.set(p.id,p);try{await save(p);}catch(error){projects.delete(p.id);throw error;}return p;
  }
  const messageFlights=new Map();
  async function dispatchMessage(p,input){
    insist(typeof input.idempotencyKey==='string'&&input.idempotencyKey.length>=16,'消息需要稳定编号','MESSAGE_ID_REQUIRED');
    const key=p.id+':'+input.idempotencyKey;
    if(messageFlights.has(key))return messageFlights.get(key);
    const task=(async()=>{
      const previous=p.messageDispatches?.find(r=>r.key===input.idempotencyKey);
      if(previous)return {project:view(get(previous.projectId)),route:previous.route};
      insist(!input.baseRevisionId||input.baseRevisionId===p.currentRevisionId,'页面版本已过期','REVISION_CONFLICT');
      const base=p.currentRevisionId;
      const document=base?(await readNativeProject(versionDirectory(p,revision(p)))).document:null;
      let route;
      try{route=await routeWorkbenchMessage(p,input.message,{provider:routingProvider,document});}
      catch(error){(p.routingFailures??=[]).push({time:now(),message:input.message,baseRevisionId:base,idempotencyKey:input.idempotencyKey,code:error.code||'MESSAGE_ROUTE_FAILED'});await save(p);throw error;}
      insist(p.currentRevisionId===base,'理解期间版本已变化，保留消息并请重试','REVISION_CONFLICT');
      (p.routingReceipts??=[]).push({time:now(),message:input.message,baseRevisionId:base,...route});
      let resultProject=p;
      if(route.mode==='clarify'){p.messages.push({role:'user',text:input.message,time:now()},{role:'assistant',text:route.question,time:now()});}
      else if(route.mode==='status')p.messages.push({role:'assistant',text:p.jobs.at(-1)?.error||p.jobs.at(-1)?.stage||'当前版本已保存。',time:now()});
      else if(['undo','redo','restore'].includes(route.mode))await navigate(p,{action:route.mode,revisionId:route.revisionId});
      else if(route.mode==='cancel'){const running=p.jobs.filter(active);insist(running.length===1,'请在任务记录中选择要取消的任务','CANCEL_TARGET_AMBIGUOUS');await cancel(p,running[0].id);}
      else if(route.mode==='create'&&base){
        const request={message:input.message,inferRequest:true,target:'marketing',taskMode:'create',taskModeExplicit:true,pipelineVersion:3,commerceProfile:FOCUS_PROFILE};
        request.businessContract=businessContract(request);resultProject=await create(request);
        for(const id of route.assetIds){const asset=p.assets.find(a=>a.id===id),source=safeRelativePath(root,asset.path),target=path.join(directory(resultProject),'uploads',asset.id+path.extname(source));await linkOrCopy(source,target);resultProject.assets.push({...structuredClone(asset),path:path.relative(root,target).replaceAll('\\','/')});}
        resultProject.creationSource={projectId:p.id,revisionId:base,assetIds:route.assetIds};await save(resultProject);
        if(resultProject.assets.length)await enqueue(resultProject,{action:'generate',message:input.message,idempotencyKey:input.idempotencyKey});
        else resultProject.messages.push({role:'assistant',text:'新制作已独立保存，请添加这条新视频要使用的素材。',time:now()});
        await save(resultProject);
      }else await enqueue(p,{...input,action:base?'patch':'generate',taskMode:route.mode,taskModeExplicit:true});
      (p.messageDispatches??=[]).push({key:input.idempotencyKey,projectId:resultProject.id,route});await save(p);
      return {project:view(resultProject),route};
    })();messageFlights.set(key,task);try{return await task;}finally{messageFlights.delete(key);}
  }
  async function loadPreset(id){
    await refreshPresets();
    const preset=presets.find(p=>p.id===id);insist(preset,'这个预设暂不可用','PRESET_MISSING');
    const p=await create({message:preset.input,inferRequest:true}),dir=path.join(directory(p),'versions','preset');
    await fs.mkdir(dir,{recursive:true});
    for(const name of ['index.html','document.json','object-map.json','manifest.json','DESIGN.md','hyperframes.json','commerce-final.mp4'])await fs.copyFile(path.join(preset.directory,name),path.join(dir,name));
    await copyAssets(preset.directory,dir);await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    const document=structuredClone(preset.document);document.projectId=p.id;document.revisionId=stableId('rev',p.id,preset.document.revisionId);
    await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(document,null,2));
    const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));manifest.revisionId=document.revisionId;await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
    p.title=preset.title;p.preset={id:preset.id,sha256:preset.sha256,sourceRevisionId:preset.document.revisionId,note:preset.note};
    if(preset.originalAssets){
      p.assets=[];
      for(const a of preset.originalAssets){const source=safeRelativePath(root,a.path),target=path.join(directory(p),'uploads',a.id+path.extname(source).toLowerCase());await linkOrCopy(source,target);p.assets.push({...a,path:path.relative(root,target).replaceAll('\\','/'),rights:preset.assets.find(n=>n.id===a.id)?.rights||a.rights});}
    }else p.assets=preset.assets.map(a=>({id:a.id,kind:a.kind,name:path.basename(a.compiledRef),path:path.relative(root,path.join(dir,a.compiledRef)).replaceAll('\\','/'),rights:a.rights}));
    p.revisions=[{id:document.revisionId,parentId:null,directory:'versions/preset',createdAt:now(),description:'预设演示 · '+preset.title,durationFrames:document.durationFrames,output:document.output,rendered:true,branch:false}];p.currentRevisionId=document.revisionId;
    p.messages=[{role:'user',text:preset.input,time:now()},{role:'assistant',text:preset.note,revisionId:document.revisionId,time:now()}];await save(p);return p;
  }
  async function upload(p,req,name){
    insist(!p.jobs.some(j=>active(j)&&j.kind!=='export'),'请等待当前编辑完成','PROJECT_BUSY');
    insist(p.assets.length+Array.from(uploads).filter(x=>x.startsWith(p.id+':')).length<MAX_ASSETS,'最多上传30个素材','TOO_MANY_ASSETS');
    const kind=assetKindFromName(name);insist(kind,'不支持的素材格式','UNSUPPORTED_ASSET');
    const id='asset-'+randomUUID(),rel=`uploads/${id}${path.extname(name).toLowerCase()}`,target=path.join(directory(p),rel),key=p.id+':'+id;uploads.add(key);
    let size=0;try{
      await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;if(size>(kind==='font'?MAX_FONT_BYTES:MAX_FILE_BYTES))return callback(new CreativeError(kind==='font'?'字体最大 10 MiB':'每个素材最多1 GiB','ASSET_TOO_LARGE',413));callback(null,chunk);}}),createWriteStream(target,{flags:'wx'}));
      insist(size>0,'素材不能为空','INVALID_ASSET');
      if(kind==='font'){insist(size<=MAX_FONT_BYTES,'字体最大 10 MiB','FONT_INVALID');await inspectBrandFont(target);}
      const asset={id,kind,name:path.basename(name),path:path.relative(root,target).replaceAll('\\','/'),bytes:size,rights:{status:'user-provided'}};p.assets.push(asset);await save(p);return asset;
    }catch(e){p.assets=p.assets.filter(a=>a.id!==id);await fs.unlink(target).catch(()=>{});throw e;}finally{uploads.delete(key);}
  }
  async function attachMaterialRoot(p,id){
    insist(!p.currentRevisionId&&!p.jobs.some(active),'制作中不能更换素材目录','PROJECT_BUSY');
    const selected=await resolveMaterialRoot(root,id);
    insist(p.assets.length+selected.files.length<=MAX_ASSETS,'素材超过工程上限，请选择更具体的目录','ASSET_LIMIT');
    for(const file of selected.files)await upload(p,createReadStream(file),path.basename(file));
    p.request={...p.request,pipelineVersion:3,materialRoot:{id:selected.id,label:selected.label}};await save(p);return p;
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
  async function planEdit(p,base,document,input,signal,evidence={}){
    if(input.operations)return {operations:input.operations,mode:'structured'};
    const scoped=scopedCommerceEdit(document,input.message);if(scoped)return scoped;
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
    return planCreativeEdit(document,input.message,{selectedNodeId:input.selectedNodeId,workflow:input.workflow,signal,...evidence});
  }
  async function publish(p,job,dir,document,description,{branch=false,defer=false}={}){
    const signal=controllers.get(job.id)?.signal,release=await acquireRender({kind:'preview',signal});
    try{
      const previousId=document.revisionId;allocatePublicationRevision(document,p.revisions,job.id);
      if(document.revisionId!==previousId){const {assets}=await readNativeProject(dir);await writeCompiledProject(dir,document,assets,{signal});}
      await fs.writeFile(path.join(dir,'check.log'),await runHyperFrames(dir,'check',[],{signal}));
      if(job.kind==='edit'&&document.production){
        job.stage='复核修改范围的实际画面';await save(p);
        const quality=await reviewEditedProject(root,dir,document,{runHyperFrames,signal,message:job.input?.message||'',round:job.repairCount||0,onInvocation:async invocation=>{job.modelCalls=(job.modelCalls||0)+1;(job.modelInvocations??=[]).push({...invocation,stage:'R6-edit'});await save(p);}}).catch(error=>{if(signal?.aborted||!['CODEX_TIMEOUT','CODEX_LIMIT','CODEX_MODEL_UNAVAILABLE','CODEX_REQUEST_FAILED'].includes(error.code))throw error;return {status:'pending-model-review',engineering:'checked',revisionId:document.revisionId,issues:[],unreviewed:['visual','continuity','audio-perception'],humanReview:'pending',blocker:{code:error.code,message:error.message},candidateOnly:true};});
        job.qualitySummary=quality;
        if(quality.status==='needs-repair')throw Object.assign(Error('局部画面检查发现需要修复的问题'),{code:'EDIT_VISUAL_REVIEW',issues:quality.issues});
        document.quality=quality;bindResourceChecks(document,{engineering:true,visual:quality.status});await fs.writeFile(path.join(dir,'resource-receipts.json'),JSON.stringify(document.resourceReceipts||[],null,2));await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(document,null,2));await fs.writeFile(path.join(dir,'quality-report.json'),JSON.stringify(quality,null,2));
      }
    }finally{release();}
    await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    insist(!signal?.aborted,'任务已取消','CANCELLED');
    insist(branch||p.currentRevisionId===job.baseRevisionId,'当前版本已变化，结果保留但不能覆盖新版本','REVISION_CONFLICT');
    insist(!p.revisions.some(r=>r.id===document.revisionId),'发布版本ID与现有历史重复，已保留新工程','REVISION_DUPLICATE');
    const r={id:document.revisionId,parentId:job.baseRevisionId,directory:path.relative(directory(p),dir).replaceAll('\\','/'),createdAt:now(),description,durationFrames:document.durationFrames,output:document.output,rendered:false,branch};
    if(defer)return r;
    const previous={current:p.currentRevisionId,redo:p.redo};p.revisions.push(r);if(!branch){p.currentRevisionId=r.id;p.redo=[];}job.revisionId=r.id;
    try{await save(p);}catch(error){p.revisions=p.revisions.filter(v=>v!==r);p.currentRevisionId=previous.current;p.redo=previous.redo;delete job.revisionId;throw error;}return r;
  }
  async function candidateExport(p,job,r,signal){
    const dir=versionDirectory(p,r);job.revisionId=r.id;job.stage='导出候选 MP4';await save(p);
    if(!r.rendered){const release=await acquireRender({signal});try{const result=await renderCommerceProject({outputDir:r.directory,signal,onProgress:async progress=>{job.renderProgress={...progress,revisionId:r.id};job.stage='渲染画面 '+progress.percent+'%';await save(p);},onStage:async stage=>{job.stage=stage;await save(p);}},{root,outputRoot:directory(p)});r.mediaReview=result.mediaReview;job.qualitySummary=result.mediaReview;r.rendered=true;job.revisionId=r.id;await save(p);}finally{release();}}
    job.stage='打包素材与完整历史';await save(p);
    job.packageEvidence=await exportCreativeHistory(root,directory(p),job.snapshot||structuredClone(p),r.id,path.join(dir,'history.zip'),{signal,assetRoot:directory(p)});r.historyPackaged=true;
  }
  async function execute(p,job){
    const controller=new AbortController();controllers.set(job.id,controller);const signal=controller.signal;
    job.status='running';job.startedAt=now();
    try{
      await save(p);
      if(job.kind==='plan'){
        job.stage='理解需求与检查工作流';await save(p);
        const document=job.baseRevisionId?(await readNativeProject(versionDirectory(p,revision(p,job.baseRevisionId)))).document:null;
        const plan=await planWorkbenchWorkflow({root,message:job.input.message,document,assets:structuredClone(p.assets),baseRevisionId:job.baseRevisionId,prior:p.workflowPlan?.workOrder?.baseRevisionId===job.baseRevisionId?p.workflowPlan.workOrder:null,provider:planningProvider,signal});
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
      }else if(job.kind==='create'){
        if(job.input.request)p.request={...p.request,...commerceIntake(job.input.request)};
        const target=p.request.target||'marketing';
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
        job.stage='观察素材与设计分镜';await save(p);
        const dir=path.join(directory(p),'versions',job.id);
        await buildCommerceProject({...p.request,projectId:p.id,assets:p.assets,outputDir:path.relative(root,dir).replaceAll('\\','/'),render:false,planning:planner,signal,resumeRunId:job.resumeRunId,onRun:async run=>{syncRun(job,run);await save(p);},onStage:async stage=>{job.stage=stage;await save(p);}},{root});
        const {document}=await readNativeProject(dir);p.title=document.brief.name;job.stage='检查原生预览';await save(p);const created=await publish(p,job,dir,document,'初始创作');await candidateExport(p,job,created,signal);job.summary='候选 MP4 与原生工程已导出，等待画面与人工审查。';
      }else if(job.kind==='edit'){
        const base=revision(p,job.baseRevisionId),from=versionDirectory(p,base),{document,assets}=await readNativeProject(from);
        // Earlier native manifests omitted synthesis metadata. Recover only
        // the saved request for the exact same locally recorded audio bytes.
        for(const asset of assets){
          const saved=p.assets.find(a=>a.id===asset.id&&a.sha256===asset.sha256&&a.generatedVoice);
          if(!asset.speechRequest&&saved?.speechRequest)asset.speechRequest=structuredClone(saved.speechRequest);
        }
        const dir=path.join(directory(p),'versions',job.id);await copyAssets(from,dir);
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
        const observed=[...added.filter(a=>a.kind!=='font'),...assets.filter(a=>a.kind==='audio'&&!a.generatedVoice&&!added.some(b=>b.id===a.id))].map(a=>({...a,normalizedRef:path.relative(root,path.join(dir,a.compiledRef)).replaceAll('\\','/')}));
        const evidence=observed.length?await collectCreativeEvidence(observed,dir,root,signal):{inputs:[],records:[]};
        document.audioEvidence=evidence.records.filter(r=>r.audioAnalysis).map(r=>({assetId:r.assetId,sha256:r.sha256,...r.audioAnalysis}));
        const countInvocation=async invocation=>{job.modelCalls=(job.modelCalls||0)+1;(job.modelInvocations??=[]).push({...invocation,stage:'R7-edit'});await save(p);};
        job.stage='理解局部修改';await save(p);
        const plan=await planEdit(p,base,document,job.input,signal,{evidenceInputs:evidence.inputs,assetMetadata:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata})),onInvocation:countInvocation,cacheRoot:path.join(dir,'model-calls')});job.summary=plan.summary;
        if(plan.alternatives?.length){
          const candidates=[];
          for(const [i,alternative] of plan.alternatives.entries()){
            job.stage=`检查开头方案 ${i+1}/${plan.alternatives.length}`;await save(p);
            const candidate=allocatePublicationRevision(applyDocumentPatch(document,alternative.operations,Object.fromEntries(assets.map(a=>[a.id,a]))),p.revisions,job.id);assertOpeningOnly(document,candidate);
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
        const requestedOperations=structuredClone(plan.operations),operations=[];
        const pendingOperations=[...plan.operations];
        for(let operationIndex=0;operationIndex<pendingOperations.length;operationIndex++){
          const op=pendingOperations[operationIndex];
          if(op.type==='regenerate_speech'){
            const current=operations.length?applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a]))):document;
            const request=speechReplacementRequest(current,assets,{replaceTrackId:op.nodeId,text:op.text,voice:op.params?.voice,rate:op.params?.rate});
            job.stage='生成指定旁白并重新安排字幕';await save(p);
            const asset=await generateAudioAsset(root,directory(p),request,{signal,transport:audioTransport,env:audioEnv});
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
            const scope={assetId:op.assetId,trackId:op.nodeId};
            const recognized=preserveCaptionStyles(await recognizeNativeCaptions(current,assets,dir,{...scope,signal}),op.previousCaptionStyles);
            operations.push({type:'set_captions',captions:mergeRecognizedCaptions(current,recognized,scope)});
          }else operations.push(op);
        }
        plan.requestedOperations=requestedOperations;plan.operations=operations;
        let next=applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a])));
        const allowed=computeInvalidation(document,next),allowedScenes=new Set(allowed.fullRecompile?document.scenes.map(s=>s.id):allowed.changedScenes);
        await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
        for(let attempt=0;attempt<3;attempt++){
          try{
            allocatePublicationRevision(next,p.revisions,job.id);
            job.stage=attempt?'检查局部修复后的画面':'检查修改后的原生预览';await save(p);
            await writeCompiledProject(dir,next,assets,{invalidation:computeInvalidation(document,next),signal});
            await fs.writeFile(path.join(dir,'edit.json'),JSON.stringify({message:job.input.message,baseRevisionId:base.id,...plan},null,2));
            const branch=job.input.branch===true||job.input.workflow?.taskMode==='variant';
            await publish(p,job,dir,next,job.input.message,{branch});
            job.planSummary=plan.summary;
            job.summary=branch?'派生版本已独立保存，母版保持；检查结果见版本区，候选 MP4 待导出。':'修改已应用并保存新版本；检查结果见预览区，候选 MP4 待导出。';break;
          }catch(error){
            await fs.writeFile(path.join(dir,`edit-failure-${attempt}.json`),JSON.stringify({revisionId:next.revisionId,error:error.message,code:error.code,issues:error.issues},null,2));
            if(!next.production||signal.aborted||attempt===2||error.code!=='EDIT_VISUAL_REVIEW')throw error;
            const repair=await planCreativeEdit(next,'只修复本次修改造成的这些画面问题：'+JSON.stringify(error.issues)+'。允许修改的镜头：'+JSON.stringify([...allowedScenes])+'。只能修改这些镜头的自定义布局/动效源码或已有效果参数，保持全文字、媒体区间、声音、时长和其他镜头。',{signal,root,onInvocation:countInvocation,cacheRoot:path.join(dir,'model-calls')});
            insist(repair.operations.length&&repair.operations.every(op=>['update_custom_source','update_effect_params'].includes(op.type)&&allowedScenes.has(op.sceneId)),'自动修复超出本次允许的布局范围','REPAIR_SCOPE');
            await fs.writeFile(path.join(dir,`edit-before-repair-${attempt}.json`),JSON.stringify(next,null,2));
            next=applyDocumentPatch(next,repair.operations,Object.fromEntries(assets.map(a=>[a.id,a])));(plan.repairs??=[]).push(repair);job.repairCount=attempt+1;
          }
        }
      }else if(job.kind==='export'){
        await candidateExport(p,job,revision(p,job.baseRevisionId),signal);
      }
      job.status='complete';delete job.code;delete job.error;job.completedAt=now();p.messages.push({role:'assistant',text:job.kind==='export'?'已导出指定版本。':job.summary||'预览检查通过，新版本已保存。',revisionId:job.revisionId,time:now()});
    }catch(e){job.failureReceipt=failureReceipt(e,{request:job.input.message||job.input.request?.message||p.request.message,revisionId:job.baseRevisionId,publishedRevisionId:job.revisionId,requirements:job.input.workflow?.requirements||[]});job.status=signal.aborted?'cancelled':e.code==='NEEDS_INPUT'?'needs_user':(job.runId||['create','audio'].includes(job.kind))?'recoverable':'failed';job.error=signal.aborted?'已取消，上一有效版本保留':e.message;job.code=e.code||'CREATIVE_JOB_FAILED';job.gaps=e.gaps||job.gaps;job.completedAt=now();p.messages.push({role:'assistant',text:job.error,time:now()});}
    finally{controllers.delete(job.id);delete job.snapshot;job.durationMs=Date.parse(job.completedAt)-Date.parse(job.startedAt);await save(p).catch(error=>{job.persistenceError=error.code||error.message;console.error('创作任务状态暂未写入，上一已提交版本保留：',p.id,job.id,error.code||error.message);});}
  }
  async function enqueue(p,input){
    const kind=input.action==='plan-workflow'?'plan':input.action==='audio-generate'?'audio':input.action==='generate'?'create':input.action==='render'||input.action==='export'?'export':'edit';
    if(input.idempotencyKey){const old=p.jobs.find(j=>j.idempotencyKey===input.idempotencyKey);if(old)return old;}
    if(kind==='create'&&['image','video'].includes(input.request?.target||p.request.target))await assertMediaGenerationAllowed(root);
    insist(!p.jobs.some(j=>active(j)&&j.kind!=='export')||kind==='export','当前创作仍在进行','PROJECT_BUSY');
    insist(!Array.from(uploads).some(k=>k.startsWith(p.id+':')),'请等待素材上传完成','UPLOAD_BUSY');
    if(input.baseRevisionId)insist(input.baseRevisionId===p.currentRevisionId,'页面版本已过期，请刷新后再修改','REVISION_CONFLICT');
    if(!['export','plan'].includes(kind)){const current=p.revisions.find(r=>r.id===p.currentRevisionId);input={...input,workflow:workflowContract({...p.request,...input.request,...input,message:input.message||input.request?.message||p.request.message,taskMode:input.taskMode||input.request?.taskMode||(kind==='edit'?'edit':p.request.taskMode),taskModeExplicit:input.taskModeExplicit??input.request?.taskModeExplicit??Boolean(input.taskMode||input.request?.taskMode),assets:p.assets},{scenarioId:p.request.businessContract?.scenarioId||p.request.scenarioId,baseProjectId:p.id,baseRevisionId:current?.id})};if(input.workflow.taskMode==='variant')insist(current,'变体需要先打开已有原生工程','VARIANT_BASE_REQUIRED');}
    if(kind==='create')insist(!p.currentRevisionId,'项目已有版本，请继续编辑或新建项目','PROJECT_EXISTS');else if(!['audio','plan'].includes(kind))revision(p,input.revisionId||p.currentRevisionId);
    if(kind==='audio'){insist(['speech','music'].includes(input.audio?.kind),'请选择旁白或纯音乐','AUDIO_KIND');insist(p.assets.length<MAX_ASSETS,'最多30个素材','ASSET_LIMIT');}
    if(kind==='export')insist(!p.jobs.some(j=>active(j)&&j.kind==='export'&&j.baseRevisionId===(input.revisionId||p.currentRevisionId)),'这个版本正在导出','EXPORT_BUSY');
    const job={id:'job-'+randomUUID(),kind,input:structuredClone(input),baseRevisionId:input.revisionId||p.currentRevisionId,status:'queued',createdAt:now(),idempotencyKey:input.idempotencyKey};if(kind==='export')job.snapshot={...structuredClone(p),jobs:p.jobs.map(({snapshot,...prior})=>structuredClone(prior))};p.jobs.push(job);
    if(input.message)p.messages.push({role:'user',text:input.message,baseRevisionId:job.baseRevisionId,time:now()});await save(p);void execute(p,job).catch(error=>{job.status='failed';job.error=error.message;job.code=error.code||'CREATIVE_JOB_FAILED';controllers.delete(job.id);console.error('创作任务失败：',p.id,job.id,error.code||error.message);});return job;
  }
  async function navigate(p,input){
    insist(!p.jobs.some(j=>active(j)&&j.kind!=='export'),'编辑完成后可恢复版本','PROJECT_BUSY');
    const current=revision(p),previous={current:p.currentRevisionId,redo:[...p.redo]};let target;
    if(input.action==='undo'){target=current.parentId;insist(target,'已经是初始版本','NO_UNDO');p.redo.push(current.id);}
    else if(input.action==='redo'){target=p.redo.pop();insist(target,'没有可重做版本','NO_REDO');}
    else {target=input.revisionId;p.redo=[];}
    try{revision(p,target);p.currentRevisionId=target;await save(p);}catch(error){p.currentRevisionId=previous.current;p.redo=previous.redo;throw error;}return view(p);
  }
  async function cancel(p,id){const job=p.jobs.find(j=>j.id===id);insist(job&&active(job),'任务不可取消','INVALID_CANCEL');job.cancelRequestedAt=now();job.stage='正在取消';await save(p);controllers.get(id)?.abort();return view(p);}
  async function authorizeBudget(p,input){
    const job=p.jobs.find(j=>j.id===input.jobId);insist(job?.runId&&!active(job),'只能为暂停的原任务批准预算','INVALID_BUDGET');
    insist(!p.jobs.some(j=>active(j)&&j.kind!=='export'),'项目已有任务在执行','PROJECT_BUSY');
    const run=await runStore(p,job).authorizeBudget(job.runId,{maxModelCalls:input.maxModelCalls,completionReserve:input.completionReserve??6,authorizationId:input.idempotencyKey,source:'explicit-webui-approval'});
    syncRun(job,run);await save(p);return view(p);
  }
  async function resume(p,id){const job=p.jobs.find(j=>j.id===id);insist(canResumeJob(job),budgetExhausted(job)?'本轮修复预算已耗尽，已保留检查点和缺陷；不能重复恢复同一轮':'任务没有可恢复检查点','INVALID_RESUME');insist(!p.jobs.some(j=>active(j)&&j.kind!=='export'),'项目已有任务在执行','PROJECT_BUSY');insist(p.currentRevisionId===(job.revisionId||job.baseRevisionId),'基准版本已变化，保留旧任务但不能覆盖新版本','REVISION_CONFLICT');delete job.cancelRequestedAt;if(job.kind==='audio')job.input.audio.retryKnownFailure=true;job.resumeRunId=job.runId;job.status='queued';delete job.error;delete job.code;delete job.completedAt;await save(p);void execute(p,job).catch(error=>{job.status='recoverable';job.error=error.message;});return view(p);}
  for(const p of projects.values())for(const job of p.jobs){
    if(job.status==='recoverable'&&job.code==='INTERRUPTED'&&!job.cancelRequestedAt&&(job.generationPlan||job.generationStarted))queueMicrotask(()=>resume(p,job.id).catch(async error=>{job.status='recoverable';job.code=error.code;job.error=error.message;await save(p);}));
  }
  return {dispatchMessage,audioVoices:()=>new MiniMaxClient({root,env:audioEnv,transport:audioTransport}).execute('voices'),applyAudio:async(p,input)=>{const {document}=await readNativeProject(versionDirectory(p,revision(p)));const operations=await audioApplication(root,document,p.assets.find(a=>a.id===input.assetId),input);return enqueue(p,{...input,action:'patch',operations,message:input.replaceTrackId?'替换已选音轨':'添加已选声音'});},productionPolicy:()=>productionPolicy(root),finishedWorks:()=>readFinishedWorks(root),materialRoots:async()=>(await discoverMaterialRoots(root)).map(({directory,files,...r})=>r),attachMaterialRoot,get,has:id=>projects.has(id),view,create,loadPreset,presets:async()=>(await refreshPresets()).map(publicPreset),unavailablePresets:async()=>(await refreshPresets()).unavailable||[],upload,importPackage,enqueue,navigate,cancel,resume,authorizeBudget,revision,versionDirectory,list:()=>[...projects.values()].map(view).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
}

export async function creativeRoutes(service,req,res,url,{json,jsonBody,file}){
  if(req.method==='GET'&&url.pathname==='/api/commerce-capabilities'){json(res,{ok:true,workflowEntries,workflowPlanning:{action:'plan-workflow',productionStarted:false,skills:commerceSkills,stages:workflowStages()},...await service.productionPolicy(),audioProviders:{local:{speech:'not_verified',transcription:'not_verified',music:'local-files'},minimax:minimaxCapabilityStatus()}});return true;}
  if(req.method==='GET'&&url.pathname==='/api/commerce-material-roots'){json(res,{ok:true,roots:await service.materialRoots()});return true;}
  if(await humanReviewRoute(ROOT,service,req,res,url,{json,jsonBody}))return true;
  const route=url.pathname;
  if(route==='/api/commerce-finished'&&req.method==='GET'){const works=await service.finishedWorks();json(res,{works:works.map(publicFinishedWork),unavailable:works.unavailable||[]});return true;}
  const finishedMatch=/^\/api\/commerce-finished\/([a-zA-Z0-9_-]+)\/(video|package)$/.exec(route);
  if(finishedMatch&&['GET','HEAD'].includes(req.method)){
    const work=(await service.finishedWorks()).find(w=>w.id===finishedMatch[1]);insist(work,'成品不存在或本机未安装','FINISHED_WORK_NOT_FOUND');
    const isVideo=finishedMatch[2]==='video',target=isVideo?work.video:work.packageFile;insist(target,'成品文件不存在','FINISHED_WORK_NOT_FOUND');
    res.setHeader('X-Delivery-Status','reference-author');await file(req,res,target,isVideo?'video/mp4':'application/zip',url.searchParams.has('download')?path.basename(target):undefined);return true;
  }
  if(route==='/api/commerce-import'&&req.method==='POST'){const p=await service.importPackage(req);json(res,{ok:true,project:service.view(p)},202);return true;}
  if(route==='/api/commerce-demos'&&req.method==='GET'){const all=await service.presets();const goals=['launch','detail','demo','style','promotion','faq'];const presets=goals.map(goal=>all.find(p=>(p.businessGoal||[]).includes(goal)&&/^demo-N/.test(p.id))||all.find(p=>(p.businessGoal||[]).includes(goal))).filter(Boolean);json(res,{presets,unavailable:await service.unavailablePresets()});return true;}
  if(route==='/api/commerce-execution-status'&&req.method==='GET'){json(res,executionStatus(service.list()));return true;}
  if(route==='/api/commerce-projects'&&req.method==='GET'){let historyProjectIds=[];try{historyProjectIds=JSON.parse(await fs.readFile(path.join(ROOT,'examples/commerce/history-projects.json'),'utf8')).projectIds||[];}catch(error){if(error.code!=='ENOENT')throw error;}json(res,{projects:service.list(),historyProjectIds});return true;}
  if(route==='/api/commerce-chat'&&req.method==='POST'&&(req.headers['content-type']||'').includes('application/json')){
    const input=await jsonBody(req,256000,'创作请求');
    if(input.action==='audio-voices'){json(res,{ok:true,...await service.audioVoices()});return true;}
    if(input.action==='preset'){const p=await service.loadPreset(input.presetId);json(res,{ok:true,project:service.view(p)},201);return true;}
    if(input.action==='material-root'){const p=service.get(input.projectId);await service.attachMaterialRoot(p,input.materialRootId);json(res,{ok:true,project:service.view(p)});return true;}
    if(input.action==='draft'){const request={...input.request,commerceProfile:FOCUS_PROFILE};request.businessContract=businessContract(request);const p=await service.create(request);json(res,{ok:true,project:service.view(p)},201);return true;}
    if(input.action==='plan-workflow')insist(service.has(input.projectId),'请先建立工作台草稿','PROJECT_NOT_FOUND');
    if(!service.has(input.projectId)){
      insist(/^[a-zA-Z0-9_-]{1,100}$/.test(input.projectId||''),'项目 ID 无效','INVALID_PROJECT');
      const outputDir=`data/commerce-runs/${input.projectId}`;
      const result=input.action==='render'?await renderCommerceProject({...input,outputDir}):await patchCommerceProject({...input,outputDir,render:input.render!==false});
      json(res,{ok:true,result});return true;
    }
    const p=service.get(input.projectId);
    if(input.action==='message'){json(res,{ok:true,...await service.dispatchMessage(p,input)},202);return true;}
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
    if(input.action==='retry'){const old=p.jobs.find(j=>j.id===input.jobId);insist(old?.status==='failed','该任务不可重试','INVALID_RETRY');if(old.kind==='import'){const opened=await service.importPackage(createReadStream(path.join(service.versionDirectory(p,{directory:'.'}),'import.zip')));json(res,{ok:true,project:service.view(opened)},202);return true;}input.action=old.kind==='create'?'generate':old.kind==='export'?'export':'patch';Object.assign(input,{...old.input,idempotencyKey:undefined});}
    const job=await service.enqueue(p,input);json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;
  }
  const match=/^\/api\/commerce\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/.exec(route);if(!match||!service.has(match[1]))return false;
  const p=service.get(match[1]),action=match[2]||'';
  if(action==='assets'&&req.method==='POST'){let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw new CreativeError('文件名无效');}json(res,{ok:true,asset:await service.upload(p,req,name)},201);return true;}
  if(['GET','HEAD'].includes(req.method)){
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
    const rm=/^revisions\/([a-zA-Z0-9_-]+)\/(preview.html|document.json|commerce-final.mp4|project.zip|history.zip|assets\/[a-zA-Z0-9_.-]+)$/.exec(action);
    if(rm){const r=service.revision(p,rm[1]),name=rm[2];
      if(name==='preview.html'){const source=await fs.readFile(path.join(service.versionDirectory(p,r),'index.html'),'utf8'),html=source.replace('</body>','<script src="assets/runtime.js"></script></body>');res.writeHead(200,{'Content-Type':mime['.html'],'Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);return true;}
      let servedPath=path.join(service.versionDirectory(p,r),name);if(name==='commerce-final.mp4'){insist(r.rendered,'该版本尚未导出','NOT_EXPORTED');if(url.searchParams.get('delivery')==='formal')servedPath=await formalVideoSnapshot(ROOT,service.versionDirectory(p,r),{currentRevisionId:p.currentRevisionId,getCurrentRevisionId:()=>p.currentRevisionId});else res.setHeader('X-Delivery-Status','candidate');}await file(req,res,servedPath,mime[path.extname(name)]||'application/octet-stream',url.searchParams.has('download')?(name==='commerce-final.mp4'?'candidate-'+r.id+'.mp4':path.basename(name)):undefined);return true;}
  }
  return false;
}
