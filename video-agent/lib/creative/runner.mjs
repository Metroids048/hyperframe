import {explicitResource,applyRequestedTransitions} from './resource-catalog.mjs';
import {trustedAssetProvenance} from './asset-provenance.mjs';
import {commerceComponentReceipt} from './commerce-components.mjs';
import {businessContract,candidateAdmission,assertProductionAdmission,assertRequiredActions,FOCUS_PROFILE} from './commerce-focus.mjs';
import {prepareHyperFramesWorkspace,assertHyperFramesCapture} from './hf-workspace.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
import {normalizeCommerceRequest, safeRelativePath, stableId} from './contracts.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {planCommerceDocument} from './director.mjs';
import {compileDocument, designMarkdown} from './compiler.mjs';
import {createNativeDocument, documentSummary, validateDocument} from './document.mjs';
import {applyDocumentPatch, computeInvalidation} from './patch.mjs';
import {requireCommerceMessagePlan} from './intent.mjs';
import {planWithModel,repairPlannedDocument} from './model-director.mjs';
import {prepareNativeAudio} from './audio.mjs';
import {writeAttribution} from './rights.mjs';
import {verifyCustomProject} from './isolation.mjs';
import {produceDocument} from './production.mjs';
import {reviewExport} from './media-review.mjs';
import {renderFrameProgress} from './render-progress.mjs';
import {runtimeTools} from '../runtime-tools.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const VIDEO_AGENT_ROOT = path.resolve(moduleDir, '../..');

async function copyGsap(outputDir) {
  const candidates = [
    path.join(VIDEO_AGENT_ROOT, 'node_modules/gsap/dist/gsap.min.js'),
    path.join(VIDEO_AGENT_ROOT, 'assets/gsap.min.js'),
  ];
  const source = await Promise.any(candidates.map(async file => { await fs.access(file); return file; })).catch(() => null);
  if (!source) throw new Error('找不到 gsap.min.js，请先在 video-agent 执行 npm install');
  await fs.mkdir(path.join(outputDir, 'assets'), {recursive: true});
  await fs.copyFile(source, path.join(outputDir, 'assets/gsap.min.js'));
}

export async function runHyperFrames(outputDir, command, args = [], {signal,onProgress} = {}) {
  if(signal?.aborted)throw new Error('任务已取消');
  const cli = path.join(VIDEO_AGENT_ROOT, 'node_modules/hyperframes/bin/hyperframes.mjs');
  await fs.access(cli).catch(() => { throw new Error('找不到 HyperFrames 0.8.33，请先在 video-agent 执行 npm install'); });
  const env = {...process.env, ...runtimeTools(VIDEO_AGENT_ROOT), HYPERFRAMES_NO_TELEMETRY: '1'};
  const workspace=await prepareHyperFramesWorkspace(VIDEO_AGENT_ROOT,outputDir);
  const invocationFile=path.join(outputDir,`hyperframes-${command}-${Date.now()}-invocation.json`);
  const invocation={command:process.execPath,args:[cli,command,...args],cwd:workspace.directory,platform:process.platform,arch:process.arch,tools:runtimeTools(VIDEO_AGENT_ROOT),startedAt:new Date().toISOString()};
  await fs.writeFile(invocationFile,JSON.stringify(invocation,null,2));
  try{return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, command, ...args], {cwd: workspace.directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let timedOut=false;
    const stop=()=>{if(child.pid&&process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');};
    const timer=setTimeout(()=>{timedOut=true;stop();},command==='render'?60*60*1000:120000);signal?.addEventListener('abort',stop,{once:true});
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
    let output = '',progress=null,lastProgressTime=0,progressError=null,progressWrites=Promise.resolve();
    const receive=b=>{output=output+b;if(command!=='render')return;const next=renderFrameProgress(output,progress);if(!next)return;progress=next;if(Date.now()-lastProgressTime<1500&&next.completed!==next.total)return;lastProgressTime=Date.now();const record={...next,updatedAt:new Date().toISOString()};progressWrites=progressWrites.then(async()=>{await fs.writeFile(path.join(outputDir,'render-progress.json'),JSON.stringify(record));await onProgress?.(record);}).catch(error=>{progressError=error;});};
    child.stdout.on('data',receive);
    child.stderr.on('data',receive);
    child.on('error', error=>{cleanup();reject(error);});
    child.on('close', async code => {cleanup();await fs.writeFile(invocationFile,JSON.stringify({...invocation,exitCode:code,timedOut,cancelled:!!signal?.aborted,completedAt:new Date().toISOString()},null,2));await progressWrites;if(progressError)output+='\n进度记录写入失败：'+progressError.message;const logFile=`hyperframes-${command}-${Date.now()}.log`;await fs.writeFile(path.join(outputDir,logFile),output).catch(()=>{});if(signal?.aborted)return reject(new Error('任务已取消'));if(timedOut)return reject(new Error('处理超时，输入和上一有效版本已保留'));if(code===0&&['snapshot','check'].includes(command)){try{assertHyperFramesCapture(output);}catch(error){error.logFile=logFile;reject(error);return;}}code === 0 ? resolve(output) : reject(Object.assign(new Error(`HyperFrames ${command} 失败 (${code})\n${output}`),{code:'HYPERFRAMES_CHECK',logFile}));});
  });}finally{await workspace.finish();}
}

export async function buildCommerceProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const request = normalizeCommerceRequest(input);
  const outputDir = request.outputDir ? safeRelativePath(root, request.outputDir) : path.join(root, 'data/commerce-runs', request.projectId);
  await fs.mkdir(outputDir, {recursive: true});
  const assetDir = path.join(outputDir, 'assets');
  await fs.mkdir(assetDir, {recursive: true});
  const prepared = [];
  for (const asset of request.assets) {
    await input.onStage?.(`准备素材 ${prepared.length+1}/${request.assets.length}`);
    const item = await prepareCreativeAsset(root, asset, assetDir,{signal:input.signal});
    item.compiledRef = `assets/${path.basename(item.normalizedRef)}`;
    prepared.push(item);
  }
  request.commerceProfile=FOCUS_PROFILE;request.businessContract=businessContract(request);
  if(!input.resumeRunId)await fs.writeFile(path.join(outputDir,'business-contract.json'),JSON.stringify(request.businessContract,null,2));
  if(input.planning!=='model'||process.env.VIDEO_AGENT_CREATIVE_WORKFLOW==='legacy')await assertProductionAdmission(root,request.businessContract,prepared,outputDir);
  await copyGsap(outputDir);
  await writeAttribution(outputDir,prepared);
  const staged=input.planning==='model'&&process.env.VIDEO_AGENT_CREATIVE_WORKFLOW!=='legacy';
  let document = staged ? await produceDocument(request,prepared,{root,outputDir,signal:input.signal,provider:input.provider,onStage:input.onStage,onRun:input.onRun,resumeRunId:input.resumeRunId,runHyperFrames}) : input.planning === 'model' ? await planWithModel(request,prepared,{root,outputDir,signal:input.signal,provider:input.provider,onStage:input.onStage}) : planCommerceDocument(request, prepared);
  applyRequestedTransitions(document,request.message);
  if(request.businessContract){document.businessContract??=request.businessContract;document.commerceResourceReceipt=commerceComponentReceipt(document);await fs.writeFile(path.join(outputDir,'commerce-resource-receipt.json'),JSON.stringify(document.commerceResourceReceipt,null,2));}
  if(document.businessContract)assertRequiredActions(document,JSON.parse(await fs.readFile(path.join(outputDir,'production-admission.json'),'utf8')));
  const audioRefs=await prepareNativeAudio(outputDir,document,prepared,{signal:input.signal});
  for(;;){try{
  await input.onStage?.('编译原生场景与对象');
  const compiled = compileDocument(document, prepared,{audioRefs});
  await fs.writeFile(path.join(outputDir, 'index.html'), compiled.html);
  await fs.writeFile(path.join(outputDir, 'document.json'), JSON.stringify(document, null, 2));
  await fs.writeFile(path.join(outputDir, 'object-map.json'), JSON.stringify(compiled.objectMap, null, 2));
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(compiled.manifest, null, 2));
  await fs.writeFile(path.join(outputDir, 'DESIGN.md'), designMarkdown(document));
  await fs.writeFile(path.join(outputDir, 'hyperframes.json'), JSON.stringify({version: 1, entry: 'index.html'}, null, 2));
  if(document.scenes.some(s=>s.effect==='custom-native'))await input.onStage?.('隔离检查自定义场景运动');
  await verifyCustomProject(outputDir,document,prepared,{signal:input.signal});
  break;
  }catch(error){
    if(staged||input.planning!=='model'||!error.code?.startsWith('CUSTOM_')||input.signal?.aborted||(document.customRepairCount||0)>=2)throw error;
    const attempt=(document.customRepairCount||0)+1,failed=path.join(outputDir,'failed-source-attempt-'+attempt);await fs.mkdir(failed,{recursive:true});
    for(const name of ['index.html','document.json','object-map.json','manifest.json'])await fs.copyFile(path.join(outputDir,name),path.join(failed,name)).catch(()=>{});
    document=await repairPlannedDocument(request,prepared,{outputDir,error,signal:input.signal,attempt,onStage:input.onStage});
  }}
  const status = {state: 'composed', projectId: request.projectId, outputDir: path.relative(root, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: false};
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  if (request.render) {
    const checkLog = await runHyperFrames(outputDir, 'check');
    await fs.writeFile(path.join(outputDir, 'check.log'), checkLog);
    const video = 'commerce-final.mp4';
    const renderLog = await runHyperFrames(outputDir, 'render', ['--output', video, '--fps', '30', '--quality', 'standard', '--workers', '1', '--strict']);
    await fs.writeFile(path.join(outputDir, 'render.log'), renderLog);
    status.mediaReview=await reviewExport(root,outputDir,document,video,{signal:input.signal});
    status.state = 'rendered'; status.rendered = true; status.video = video;
    await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  }
  return status;
}

/**
 * Pull the user's requested opening copy from the upload message.  Uploads are
 * source-first projects, so this is deliberately limited to explicit quoted
 * copy or the common "加上...几个字" form; it must never invent product text.
 */
export function uploadedVideoTitle(message) {
  const text = String(message || '');
  const quoted = text.match(/[“「『"]([^”」』"]{1,80})[”」』"]/u)?.[1]?.trim();
  const natural = text.match(/(?:加上|加一个|添加|改成|改为)\s*(?:一个)?\s*([^，。！？,!?]{1,40}?)(?:几个字|标题|文字|，|。|！|！|$)/u)?.[1]?.trim();
  const title = quoted || natural;
  return title && /(?:标题|文字|字幕|几个字|开头|前\s*(?:\d+|[一二三四五六七八九十]+)\s*秒|新品体验|\b(?:title|text|caption)\b|\b(?:at\s+the\s+)?beginning\b|\bopening\b|\bfirst\s+(?:\d+(?:\.\d+)?|one|two|three|four|five)\s*seconds?\b)/iu.test(`${text} ${title}`) ? title : null;
}

/** Import one uploaded video as an independent, candidate-only native project. */
export async function buildUploadedVideoProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const request = normalizeCommerceRequest({...input, assets: input.assets, creativeMode: 'video'});
  const outputDir = request.outputDir ? safeRelativePath(root, request.outputDir) : path.join(root, 'data/commerce-runs', request.projectId);
  await fs.mkdir(path.join(outputDir, 'assets'), {recursive: true});
  const prepared=[];
  for(const asset of request.assets){
    await input.onStage?.(`准备原片 ${prepared.length+1}/${request.assets.length}`);
    const item=await prepareCreativeAsset(root,asset,path.join(outputDir,'assets'),{signal:input.signal});
    item.compiledRef=`assets/${path.basename(item.normalizedRef)}`;prepared.push(item);
  }
  const source=(request.sourceAssetId&&prepared.find(a=>a.id===request.sourceAssetId&&a.kind==='video'))||prepared.find(a=>a.kind==='video');
  if(!source) throw new Error('原片导入需要视频素材');
  const rebuildAll=Boolean(input.rebuildAllUploadedVideoSources);
  const sources=rebuildAll?prepared.filter(a=>a.kind==='video'):[source];
  if(rebuildAll&&sources.length<2)throw new Error('完整上传时间线至少需要两段视频素材');
  const requested=input.output||{};
  const width=Math.min(1920,Math.max(64,Number(requested.width??source.mediaMetadata.width??1080)))&~1;
  const height=Math.min(1920,Math.max(64,Number(requested.height??source.mediaMetadata.height??1920)))&~1;
  const durationFrames=Math.max(150,Math.min(18000,Math.round(source.mediaMetadata.duration*30)));
  const brief={id:stableId('brief',request.projectId,source.id),productId:null,name:source.name,facts:[],price:null,cta:'',audience:null,prohibited:[],assetIds:prepared.filter(a=>a.kind!=='audio').map(a=>a.id),assumptions:['原片编辑候选；商品身份与商业审核尚未确认。']};
  const design={id:'source-edit',background:'#111111',foreground:'#FFFFFF',panel:'#111111',accent:'#FFFFFF',accentContrast:'#111111',fontFamily:'"Microsoft YaHei", "PingFang SC", Arial, sans-serif',motionIntensity:0,transition:'dissolve-transition',safeAreas:{top:.06,right:.06,bottom:.07,left:.06},minReadFrames:48,easingFamily:'linear',output:{width,height}};
  const sceneDurations=sources.map(clip=>Math.max(1,Math.min(18000,Math.round(clip.mediaMetadata.duration*30))));
  const scenes=sources.map((clip,index)=>({id:rebuildAll?`scene-${String(index+1).padStart(2,'0')}-uploaded-source`:'scene-01-uploaded-source',purpose:'source',startFrame:0,durationFrames:sceneDurations[index],effect:'media-cut',effectParams:{}}));
  const nodes=sources.map((clip,index)=>({id:'video-'+clip.id,sceneId:scenes[index].id,semanticRole:'hero',kind:'video',assetId:clip.id,anchor:'scene-local',localStartFrame:0,startFrame:0,localDurationFrames:sceneDurations[index],durationFrames:sceneDurations[index],params:{sourceStartSeconds:0,playbackRate:1,fit:'cover'}}));
  const title = rebuildAll?null:uploadedVideoTitle(input.message);
  if(title){
    const scene=scenes[0],node=nodes[0],titleDuration=Math.min(60,scene.durationFrames);
    nodes.push({
      id:stableId('title',request.projectId,source.id,title),
      sceneId:scene.id,
      semanticRole:'title',
      kind:'text',
      anchor:'scene-local',
      localStartFrame:0,
      startFrame:0,
      localDurationFrames:titleDuration,
      durationFrames:titleDuration,
      params:{text:title,immediate:true,style:{color:'#FFFFFF',fontSize:60,fontWeight:800}},
    });
  }
  if(rebuildAll){
    const credit=input.message?.match(/([A-Za-z][A-Za-z0-9 .'-]{1,80}\s*·\s*CC\s*BY\s*\d+(?:\.\d+)?)/i)?.[1]?.trim();
    if(credit){
      const scene=scenes.at(-1),duration=scene.durationFrames,localStart=Math.max(0,duration-Math.min(90,duration));
      nodes.push({id:stableId('credit',request.projectId,credit),sceneId:scene.id,semanticRole:'caption',kind:'text',anchor:'scene-local',localStartFrame:localStart,startFrame:0,localDurationFrames:duration-localStart,durationFrames:duration-localStart,params:{text:credit,immediate:true,style:{color:'#FFFFFF',fontSize:28,fontWeight:600}}});
    }
  }
  const document=createNativeDocument({projectId:request.projectId,output:{width,height,durationSeconds:rebuildAll?sceneDurations.reduce((sum,frames)=>sum+frames,0)/30:durationFrames/30},brief,design,assets:prepared,scenes,nodes,transitions:[]});
  document.scenePackage=rebuildAll?{kind:'uploaded-source-timeline',sourceAssetIds:sources.map(item=>item.id),candidateOnly:true}:{kind:'uploaded-source',sourceAssetId:source.id,candidateOnly:true};
  if(title)document.scenePackage.titleNodeId=nodes.at(-1).id;
  document.businessContract={...businessContract({...request,scenarioId:'general',taskMode:'recut',message:request.message}),scenarioId:'general',taskMode:'recut',candidateOnly:true};
  document.audioRequirements={original:sources.some(item=>item.mediaMetadata.hasAudio)};
  document.audioGraph=sources.filter(item=>item.mediaMetadata.hasAudio).map((clip,index)=>({id:stableId('audio','video-'+clip.id),assetId:clip.id,role:'original',sourceNodeId:'video-'+clip.id,sceneId:scenes[index].id,startFrame:scenes[index].startFrame,durationFrames:sceneDurations[index],sourceStartSeconds:0,playbackRate:1,volume:1}));
  validateDocument(document,Object.fromEntries(prepared.map(item=>[item.id,item])));
  const admission={status:'candidate_only',candidateOnly:true,contractHash:crypto.createHash('sha256').update(JSON.stringify(document.businessContract)).digest('hex'),assets:prepared.filter(a=>['video','image'].includes(a.kind)).map(a=>({assetId:a.id,sha256:a.sha256,identityStatus:'unknown',fullObservation:false,evidence:[],coverage:[],rights:a.rights||{status:'user-provided'}}))};
  await fs.writeFile(path.join(outputDir,'business-contract.json'),JSON.stringify(document.businessContract,null,2));
  await fs.writeFile(path.join(outputDir,'production-admission.json'),JSON.stringify(admission,null,2));
  await fs.writeFile(path.join(outputDir,'resource-lock.json'),JSON.stringify({runtime:'0.8.33',commit:'local-upload-source',files:[],execution:'native uploaded-source compiler',license:'asset rights reviewed separately'},null,2));
  await copyGsap(outputDir);await writeAttribution(outputDir,prepared);
  const audioRefs=await prepareNativeAudio(outputDir,document,prepared,{signal:input.signal});
  const compiled=compileDocument(document,prepared,{audioRefs});
  await fs.writeFile(path.join(outputDir,'index.html'),compiled.html);await fs.writeFile(path.join(outputDir,'document.json'),JSON.stringify(document,null,2));await fs.writeFile(path.join(outputDir,'object-map.json'),JSON.stringify(compiled.objectMap,null,2));await fs.writeFile(path.join(outputDir,'manifest.json'),JSON.stringify(compiled.manifest,null,2));await fs.writeFile(path.join(outputDir,'DESIGN.md'),designMarkdown(document));await fs.writeFile(path.join(outputDir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'},null,2));
  await verifyCustomProject(outputDir,document,prepared,{signal:input.signal});
  const status={state:'composed',projectId:request.projectId,outputDir:path.relative(root,outputDir).split(path.sep).join('/'),document:documentSummary(document),rendered:false,candidateOnly:true};
  await fs.writeFile(path.join(outputDir,'status.json'),JSON.stringify(status,null,2));return status;
}

async function resolveOutputDir(root, requested) {
  if (!requested) throw new Error('patch/render 必须提供 outputDir');
  return safeRelativePath(root, requested);
}

export async function readNativeProject(outputDir) {
  const document = JSON.parse(await fs.readFile(path.join(outputDir, 'document.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  const assets = (manifest.assets || []).map(asset => ({
    ...asset,
    status: 'ready',
    compiledRef: asset.ref,
    normalizedRef: asset.ref,
    sourceStartSeconds: asset.sourceStartSeconds || 0,
    sourceDurationSeconds: asset.sourceDurationSeconds ?? null,
  }));
  for(const a of assets){delete a.generated;delete a.provider;delete a.providerTaskId;delete a.provenance;Object.assign(a,await trustedAssetProvenance(VIDEO_AGENT_ROOT,a.id,a.sha256));}
  validateDocument(document, Object.fromEntries(assets.map(a => [a.id, a])));
  return {document, assets};
}

export async function writeCompiledProject(outputDir, document, assets, {invalidation = null,signal} = {}) {
  if(document.businessContract){const admission=await candidateAdmission(VIDEO_AGENT_ROOT,document.businessContract,assets,outputDir,document);assertRequiredActions(document,admission);}
  validateDocument(document,Object.fromEntries(assets.map(a=>[a.id,a])));
  const audioRefs=await prepareNativeAudio(outputDir,document,assets,{signal});
  const compiled = compileDocument(document, assets,{audioRefs});
  await writeAttribution(outputDir,assets);
  await fs.writeFile(path.join(outputDir, 'index.html'), compiled.html);
  await fs.writeFile(path.join(outputDir, 'document.json'), JSON.stringify(document, null, 2));
  await fs.writeFile(path.join(outputDir, 'object-map.json'), JSON.stringify(compiled.objectMap, null, 2));
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(compiled.manifest, null, 2));
  await fs.writeFile(path.join(outputDir, 'DESIGN.md'), designMarkdown(document));
  await verifyCustomProject(outputDir,document,assets,{signal});
  const status = {state: 'composed', projectId: document.projectId, outputDir: path.relative(VIDEO_AGENT_ROOT, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: false, invalidation};
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  return status;
}

export async function patchCommerceProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const outputDir = await resolveOutputDir(root, input.outputDir);
  const {document, assets} = await readNativeProject(outputDir);
  const previousRevisionId = document.revisionId;
  const planned = Array.isArray(input.operations) && input.operations.length ? {operations: input.operations, summary: input.description} : requireCommerceMessagePlan(document, input.message);
  const next = applyDocumentPatch(document, planned.operations, Object.fromEntries(assets.map(a => [a.id, a])));
  const revisions = path.join(outputDir, 'revisions');
  await fs.mkdir(revisions, {recursive: true});
  await fs.writeFile(path.join(revisions, `${previousRevisionId}.json`), JSON.stringify(document, null, 2));
  const invalidation = computeInvalidation(document, next);
  const status = await writeCompiledProject(outputDir, next, assets, {invalidation});
  if (input.render === true) return await renderCommerceProject({outputDir: path.relative(root, outputDir).split(path.sep).join('/')}, {root});
  return {...status, previousRevisionId};
}

export async function renderCommerceProject(input, {root = VIDEO_AGENT_ROOT, outputRoot = root} = {}) {
  // The service supplies the owned project root; application resources still use root.
  const outputDir = await resolveOutputDir(outputRoot, input.outputDir);
  const {document,assets} = await readNativeProject(outputDir);
  if(document.businessContract){const admission=await candidateAdmission(root,document.businessContract,assets,outputDir,document);assertRequiredActions(document,admission);}
  const checkLog = await runHyperFrames(outputDir, 'check', [], {signal:input.signal});
  await fs.writeFile(path.join(outputDir, 'check.log'), checkLog);
  const video = input.video || 'commerce-final.mp4';
  const renderLog = await runHyperFrames(outputDir, 'render', ['--output', video, '--fps', '30', '--quality', input.quality || 'standard', '--workers', '1', '--strict'], {signal:input.signal,onProgress:input.onProgress});
  await fs.writeFile(path.join(outputDir, 'render.log'), renderLog);
  await input.onStage?.('检查实际导出文件');
  const mediaReview=await reviewExport(root,outputDir,document,video,{signal:input.signal});
  const status = {state: 'rendered', projectId: document.projectId, outputDir: path.relative(root, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: true, video};
  status.mediaReview=mediaReview;
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  return status;
}
