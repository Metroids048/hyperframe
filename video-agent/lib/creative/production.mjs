import {boundObservationRanges} from './observation-request.mjs';
import {directionPrefix,createDirectionPreview} from './direction-preview.mjs';
import {instantiateNativeRecipe,nativeRecipeContract} from './native-recipes.mjs';
import {buildEvidenceIndex,queryEvidence,readEvidenceImages,reusableInspection,selectEvidenceInputs} from './evidence-index.mjs';
import {repairRoute,requiredRepairs,keyframeFailure} from './repair-routing.mjs';
import {bindResourceChecks} from './resource-receipts.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {AgentKernel,AgentRunStore} from '../edit/agent-kernel.mjs';
import {acquireRender} from '../render-queue.mjs';
import {ToolRegistry} from '../edit/tool-registry.mjs';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {ffmpeg,run as mediaRun,probe,hashFile} from '../edit/media.mjs';
import {CapabilityCatalog,resourceHash} from './capabilities.mjs';
import {creationSchema,collectCreativeEvidence,documentFromModelPlan,validateInferredRequest,validateObservations} from './model-director.mjs';
import {CUSTOM_SOURCE_CONTRACT} from './custom-source.mjs';
import {compileDocument,designMarkdown} from './compiler.mjs';
import {prepareNativeAudio} from './audio.mjs';
import {verifyCustomProject} from './isolation.mjs';
import {recognizeNativeCaptions} from './captions.mjs';
import {inspectKeyframe,animateKeyframe} from './keyframe.mjs';
import {validateStory,replaceStoryShot,nativeScenePlan,validateShotRepair} from './story-validation.mjs';
import {inspectSourceRanges,validateInspectionRanges,inspectActionRanges,validateActionRanges} from './source-inspection.mjs';
import {captureRuntimeBuild} from './runtime-build.mjs';
import {brandFontResources} from './brand-fonts.mjs';
import {productionFingerprint,verifyFingerprintMigration} from './input-fingerprint.mjs';
import {insist,FPS,MAX_SCENES} from './contracts.mjs';

const obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)}),str={type:'string'},num={type:'number'},bool={type:'boolean'},list=items=>({type:'array',items});
const briefSchema=obj({request:creationSchema.properties.inferredRequest,needsTranscription:bool,needsNarration:bool,needsCaptions:bool,keepOriginalAudio:bool,capabilities:list(str),gaps:list(str),constraints:list(str)});
const range=obj({assetId:str,startSeconds:num,endSeconds:num,reason:str});
const observationSchema=obj({observations:creationSchema.properties.observations,candidates:list(range),inspectRanges:list(range),gaps:list(str)});
const resourceSchema=obj({selected:list(obj({id:str,reason:str})),originalNeeds:list(str),gaps:list(str),blockingGaps:list(str)});
const sceneProperties=creationSchema.properties.scenes.items.properties;
const storyScene=obj(Object.fromEntries(Object.entries({...sceneProperties,paragraphId:str,newInformation:str,resourceId:str,visualDirection:str,productionMethod:{type:'string',enum:nativeRecipeContract.methods}}).filter(([key])=>!['effectParamsJson','customSourceJson'].includes(key))));
const storySchema=obj({inspectActions:list(range),inspectRanges:list(range),blockingGaps:list(str),summary:str,transition:creationSchema.properties.transition,design:obj({...creationSchema.properties.design.properties,fontFamily:{type:'string',enum:['Microsoft YaHei','Arial']},typeScale:obj({title:num,body:num,label:num}),safeMarginPx:num,labelStyle:str}),scenes:list(storyScene),audio:creationSchema.properties.audio,omitted:creationSchema.properties.omitted,paragraphs:list(obj({id:str,purpose:str,information:str}))});
const shotSchema=obj({source:obj({html:str,css:str,timeline:str,parameters:list(obj({name:str,value:num,min:num,max:num})),objects:list(obj({elementId:str,ref:str})),motionTargets:list(str),textStyles:list(obj({elementId:str,match:str,fontSize:num,fontWeight:num,color:str}))}),notes:str});
const animationSchema=obj({animation:obj(Object.fromEntries(['timeline','parameters','motionTargets'].map(k=>[k,shotSchema.properties.source.properties[k]]))),notes:str});
const qualitySchema=obj({summary:str,issues:list(obj({severity:{type:'string',enum:['blocker','major','minor']},repairKind:{type:'string',enum:['layout','source-selection','text-timing','text-evidence']},sceneId:str,startSeconds:num,endSeconds:num,nodeIds:list(str),evidence:list(str),problem:str,repair:str})),unreviewed:list(str)});
function boundedQualitySchema(ids,nodes,frames){const s=structuredClone(qualitySchema),p=s.properties.issues.items.properties;p.sceneId={type:'string',enum:[...ids]};p.nodeIds={type:'array',items:{type:'string',enum:nodes.map(n=>n.id)}};p.evidence={type:'array',items:{type:'string',enum:frames.map(f=>f.file)}};return s;}
const labels={brief:'理解本次要求',observe:'观察真实素材',resources:'选择制作资源',narration:'制作并测量实际旁白',story:'安排整片内容与节奏',timing:'核对真实声音与动作时间',assemble:'合成原生母工程',quality:'观看实际预览并定位问题'};
const basenameOK=s=>/^[a-zA-Z0-9_.-]+$/.test(s);
const loadedImplementation=await captureRuntimeBuild(path.resolve(import.meta.dirname,'../..'));

/** One durable run, native document and provider. No hidden shell tools in the model. */
export async function produceDocument(request,assets,{root,outputDir,signal,provider,runHyperFrames,onStage,onRun,resumeRunId,io={}}={}){
  const catalog=io.catalog||await CapabilityCatalog.open(root),own=!provider;
  provider??=new CodexProvider({cacheRoot:path.join(outputDir,'model-calls')});
  const store=new AgentRunStore(path.join(outputDir,'runs'));
  const implementation=loadedImplementation;
  const implementationHash=resourceHash(implementation);await fs.mkdir(path.join(outputDir,'implementations'),{recursive:true});await fs.writeFile(path.join(outputDir,'implementations',implementationHash+'.json'),JSON.stringify(implementation,null,2));
  const fingerprintInput={request,assets:assets.map(a=>[a.id,a.sha256]),resources:catalog.snapshot?.commit,prompts:await fs.readFile(path.join(root,'prompts/commerce/manifest.json'),'utf8'),pipeline:1,model:provider.model||null,reasoningEffort:provider.reasoningEffort||'low'},fingerprint=productionFingerprint(fingerprintInput);
  if(!resumeRunId)await fs.writeFile(path.join(outputDir,'run-input.json'),JSON.stringify(fingerprintInput,null,2),{flag:'wx'});
  const byId=Object.fromEntries(assets.map(a=>[a.id,a]));let visualInputs=[];
  const fontContract={systemFamilies:['Microsoft YaHei','Arial'],brandFonts:brandFontResources(assets).map(f=>({...f,sourceName:byId[f.assetId].name||byId[f.assetId].path})),inheritProjectFont:true,unregisteredFamilies:'not available'};
  const allowedFontFamilies=[...fontContract.systemFamilies,...fontContract.brandFonts.map(f=>f.family)],runtimeStorySchema=structuredClone(storySchema);
  runtimeStorySchema.properties.design.properties.fontFamily.enum=allowedFontFamilies;
  const saveJSON=async(name,value)=>{if(/^(?:scene-\d+|failed-(?:keyframe|shot|story)-[\d-]+|keyframe-review-[\d-]+)\.json$/.test(name)){const prior=await fs.readFile(path.join(outputDir,name)).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});if(prior){await fs.mkdir(path.join(outputDir,'source-history'),{recursive:true});await fs.writeFile(path.join(outputDir,'source-history',name.replace('.json','-')+resourceHash(prior)+'.json'),prior);}}await fs.writeFile(path.join(outputDir,name),JSON.stringify(value,null,2));return value;};
  const readJSON=name=>fs.readFile(path.join(outputDir,name),'utf8').then(JSON.parse);
  const result=(run,key)=>run.checkpoints[key]?.result;
  async function ask(ctx,stage,data,schema,{images=[],resources=[],extra=''}={}){
    const guidance=await catalog.context(stage,resources);
    const cacheKey=resourceHash({stage,data,schema,context:guidance.records,extra,images:images.map(i=>resourceHash(i)),model:provider.model||null,reasoning:provider.reasoningEffort||'low'}),cacheFile=path.join(outputDir,'stage-cache',cacheKey+'.json');
    try{const cached=JSON.parse(await fs.readFile(cacheFile,'utf8'));insist(cached.outputHash===resourceHash(cached.result),'模型阶段缓存被修改','CHECKPOINT_HASH');(ctx.run.cacheHits??=[]).push({stage,key:cacheKey,time:new Date().toISOString()});await ctx.persist();return cached.result;}catch(error){if(error.code!=='ENOENT')throw error;}
    const previous=provider.onInvocation;
    let counted=false;provider.onInvocation=async invocation=>{counted=true;await ctx.recordModelCall({...invocation,stage});await previous?.(invocation);};
    const input=[{role:'user',content:[{type:'input_text',text:JSON.stringify(data)},...images]}];
    const callNo=ctx.run.modelCalls+1,receipt={inputTextBytes:Buffer.byteLength(JSON.stringify(data)),imageBytes:images.reduce((n,i)=>n+(i.image_url?.length||0),0),guidanceBytes:Buffer.byteLength(guidance.text+extra),stage,context:guidance.records,inputHash:resourceHash(data),imageEvidence:selectEvidenceInputs(images,Infinity).inputs.map(i=>i.type==='input_text'?{label:i.text}:{imageHash:resourceHash(i.image_url)}),imageHashes:images.filter(i=>i.type==='input_image').map(i=>resourceHash(i.image_url)),implementationHash,resources,startedAt:new Date().toISOString()};
    try{
      if(!(provider instanceof CodexProvider)){counted=true;await ctx.recordModelCall({stage,provider:'injected-test-provider'});}
      const answer=await provider.structured(guidance.text+'\n'+extra,input,schema,signal);
      await fs.mkdir(path.dirname(cacheFile),{recursive:true});await fs.writeFile(cacheFile,JSON.stringify({result:answer.result,outputHash:resourceHash(answer.result),context:guidance.records}));
      Object.assign(receipt,{status:'completed',model:answer.model,usage:answer.usage??null,reasoningEffort:answer.reasoningEffort||provider.reasoningEffort||null,outputHash:resourceHash(answer.result)});return answer.result;
    }catch(error){Object.assign(receipt,{status:'failed',error:error.message,code:error.code});throw error;}
    finally{provider.onInvocation=previous;await fs.mkdir(path.join(outputDir,'receipts'),{recursive:true});await fs.writeFile(path.join(outputDir,'receipts',String(callNo).padStart(3,'0')+'-'+stage+'.json'),JSON.stringify({...receipt,counted,elapsedMs:Date.now()-Date.parse(receipt.startedAt)},null,2));}
  }
  async function evidenceImages(){if(visualInputs.length)return visualInputs;const evidence=await readJSON('evidence.json');for(const a of evidence.assets){const samples=a.kind==='image'?a.samples:[];for(const s of samples){const bytes=await fs.readFile(path.join(outputDir,s.file));visualInputs.push({type:'input_text',text:'素材 '+a.assetId},{type:'input_image',image_url:'data:image/jpeg;base64,'+bytes.toString('base64')});}}
    const files=await fs.readdir(path.join(outputDir,'evidence'));for(const name of files.filter(n=>n.includes('-contact-')&&n.endsWith('.jpg')&&!/^(?:inspection|action)-/.test(n))){const bytes=await fs.readFile(path.join(outputDir,'evidence',name));visualInputs.push({type:'input_text',text:name},{type:'input_image',image_url:'data:image/jpeg;base64,'+bytes.toString('base64')});}return visualInputs;
  }
  async function sourceEvidence(run,query={}){
    const dense=await readJSON('dense-evidence.json').catch(e=>{if(e.code!=='ENOENT')throw e;return {records:[]};});
    const initial=await readJSON('evidence.json');
    const overviewRecords=initial.assets.flatMap(a=>(a.kind==='image'?a.samples.filter(s=>s.sha256).map(s=>({...s,times:[]})):a.contactSheets||[]).map(r=>({...r,assetId:a.assetId,sourceSha256:a.sha256,startSeconds:0,endSeconds:a.metadata?.duration||0})));
    const batches=[{key:'initial-overview',tool:'assets.observe',records:overviewRecords},{...dense,tool:'assets.observe',key:'initial-dense'},...(run.artifacts.storyInspections||[]),...(run.artifacts.actionInspections||[])];
    const index=buildEvidenceIndex(assets,batches,result(run,'observe')?.observations||[]);
    await saveJSON('source-evidence-index.json',index);
    const selected=queryEvidence(index,query),images=await readEvidenceImages(outputDir,selected.records);
    // Retain the overall asset view without flooding every request with all frames.
    const overview=overviewRecords.length?[]:await evidenceImages();
    return {selection:{...selected,events:run.artifacts.sourceEvidenceEvents||[]},images:[...selectEvidenceInputs(overview,2).inputs,...images]};
  }
  async function denseImages(ranges){const inputs=[],records=[];for(const [i,r] of ranges.entries()){
    const asset=byId[r.assetId];insist(asset?.kind==='video'&&r.startSeconds>=0&&r.endSeconds>r.startSeconds&&r.endSeconds<=asset.mediaMetadata.duration,'加密观察超出源片范围','INVALID_SOURCE_RANGE');
    const times=Array.from({length:9},(_,j)=>r.startSeconds+(r.endSeconds-r.startSeconds)*(j+.15)/9),cells=[];
    for(const [j,time] of times.entries()){const file=path.join(outputDir,'evidence',`detail-${i}-${j}.jpg`);await mediaRun(ffmpeg,['-y','-v','error','-ss',String(time),'-i',path.join(outputDir,asset.compiledRef),'-frames:v','1','-vf','scale=400:225:force_original_aspect_ratio=decrease,format=rgb24,pad=400:225:(ow-iw)/2:(oh-ih)/2',file],{signal,timeout:30000});cells.push({input:await fs.readFile(file),left:j%3*400,top:Math.floor(j/3)*225});}
    const bytes=await sharp({create:{width:1200,height:675,channels:3,background:'#111'}}).composite(cells).jpeg({quality:88}).toBuffer(),file=`evidence/detail-contact-${i}.jpg`;await fs.writeFile(path.join(outputDir,file),bytes);records.push({...r,times,file,sha256:resourceHash(bytes),sourceSha256:asset.sha256});inputs.push({type:'input_text',text:`${r.assetId} 加密画面，按从左至右逐行对应源秒数：${times.map(t=>t.toFixed(3)).join(',')}`},{type:'input_image',image_url:'data:image/jpeg;base64,'+bytes.toString('base64')});
  }await saveJSON('dense-evidence.json',{records});return inputs;}
  const registry=new ToolRegistry();
  registry.register('brief.parse',async(_,ctx)=>{
    let brief,lastError;for(let attempt=0;attempt<3;attempt++){
    brief=await ask(ctx,'R1',{message:request.message,existingRequest:request,attempt,validationError:lastError?.message,assets:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata})),availableCapabilities:['image-observation','video-source-selection','local-transcription','native-composition','managed-original','local-preview-review','native-editing']},briefSchema,{extra:'本步骤只理解需求，不写分镜或源码。未指定画幅默认1080×1920，时长按内容决定5—600秒。request.facts中的userQuote逐字来自用户消息；不要把画面推断写为商品事实。needsTranscription只在输入有真实讲话且需要语义精剪或逐字字幕时为true；原声操作片不转写无语言声音。用户要求新配音时needsNarration=true，后续本地合成后再转写，不因输入没有人声阻塞。用户明确不加配音时needsNarration=false。没有实际动作素材却要真实演示时输出gaps，禁止假装可制作。已有声音配置不得重问。'});
    try{validateInferredRequest(request,brief.request);break;}catch(error){lastError=error;await saveJSON('failed-brief-'+attempt+'.json',{brief,error:{code:error.code,message:error.message}});if(repairRoute(error)!=='scene'||attempt===2)throw error;}
    }
    ctx.run.constraints={...ctx.run.constraints,requirements:brief.constraints};return saveJSON('brief-plan.json',brief);
  });
  registry.register('assets.observe',async(_,ctx)=>{
    const brief=result(ctx.run,'brief');
    const evidence=io.collectEvidence?await io.collectEvidence(assets):await collectCreativeEvidence(assets,outputDir,root,signal);visualInputs=evidence.inputs;
    let observation=await ask(ctx,'R2',{message:request.message,brief,assets:evidence.records,sourceMetadata:assets.map(a=>({id:a.id,...a.mediaMetadata}))},observationSchema,{images:visualInputs,extra:'分别列出可观察的候选动作源区间。如果间隔抽帧无法确认关键动作起止，inspectRanges列出至多6段、每段不超过45秒的需要加密观察区间；应用将执行真实工具再给你结果。不可只写「需要检查」后继续把不确定片段当确认。不要先写视觉场景。'});
    for(let attempt=0;attempt<2;attempt++){
      const invalid=observation.inspectRanges.length>6||observation.inspectRanges.some(r=>!byId[r.assetId]||byId[r.assetId].kind!=='video'||r.startSeconds<0||r.endSeconds<=r.startSeconds||r.endSeconds>byId[r.assetId].mediaMetadata.duration);
      if(!invalid)break;
      await saveJSON('invalid-inspection-request-'+attempt+'.json',{observation,executed:false,limits:{maxRanges:6,maxSecondsPerRange:45}});
      insist(attempt===0,'加密观察请求仍不合法；没有执行超额抽帧','INVALID_OBSERVATION_REQUEST');
      observation=await ask(ctx,'R2',{brief,prior:observation,metadata:assets.map(a=>({id:a.id,...a.mediaMetadata})),validationError:'inspectRanges只能使用列出的精确assetId，最多6段，每段必须在源片内且不超过45秒。请缩小到需要确认的关键动作边界；未观察范围保留为未知。尚未执行加密抽帧。'},observationSchema,{images:visualInputs,extra:'仅修正观察申请与事实边界，不能伪造已观察。严格遵守6段和45秒上限。'});
    }
    if(observation.inspectRanges.length){const allocation=boundObservationRanges(observation.inspectRanges,assets);await saveJSON('inspection-allocation.json',allocation);observation={...observation,inspectRanges:allocation.selected,gaps:[...observation.gaps,...allocation.omitted.map(r=>'尚未加密观察 '+r.assetId+' '+r.startSeconds+'—'+r.endSeconds+'秒；不能当作动作边界已确认')]};const dense=io.denseImages?await io.denseImages(observation.inspectRanges):await denseImages(observation.inspectRanges);visualInputs=[...selectEvidenceInputs(visualInputs,2).inputs,...dense];observation=await ask(ctx,'R2',{brief,prior:observation,metadata:assets.map(a=>({id:a.id,...a.mediaMetadata}))},observationSchema,{images:dense,extra:'这是实际加密观察结果。修正动作与起止，保留未确认的局限。inspectRanges现在为空；仍不足以完成必需动作则写gaps，不虚构。'});}
    for(let attempt=0;attempt<3;attempt++){
      try{validateObservations(assets,observation.observations);break;}catch(error){
        await saveJSON('failed-observation-'+attempt+'.json',{observation,error:{code:error.code,message:error.message}});if(attempt===2)throw error;
        observation=await ask(ctx,'R2',{message:request.message,brief,prior:observation,validationError:error.message,attempt,metadata:assets.map(a=>({id:a.id,...a.mediaMetadata}))},observationSchema,{images:visualInputs,extra:'修正观察合同。框是归一化[x,y,width,height]，不是右下坐标；无法确认可留空。只需观察获准使用的素材，其余不能借相似外观建立同型号关系。inspectRanges为空，不重复已执行的抽帧。'});
      }
    }
    const transcripts=[];if(brief.needsTranscription){for(const a of assets.filter(a=>a.mediaMetadata.hasAudio)){const transcript=await provider.transcribe(path.join(outputDir,a.compiledRef),signal);transcripts.push({assetId:a.id,sourceSha256:a.sha256,transcript});}insist(transcripts.some(t=>t.transcript.words?.length),'未识别到任务需要的讲话内容','NO_SPEECH');}
    await saveJSON('transcripts.json',transcripts);return saveJSON('observations.json',observation);
  });
  registry.register('resources.plan',async(_,ctx)=>{
    const candidates=catalog.candidates({message:request.message+' '+result(ctx.run,'brief').capabilities.join(' '),assets});
    const usable=candidates.filter(c=>c.eligible&&c.compatible);
    const contracts=await catalog.context('R3',[]);
    const plan=await ask(ctx,'R3',{message:request.message,brief:result(ctx.run,'brief'),observations:result(ctx.run,'observe'),candidates:usable,verifiedSourceFiles:contracts.records,adapter:{contractVersion:2,runtime:'0.8.33',method:'adapt visual structure into AST/CSS-validated native bundle',executionCompatibility:'checked per generated bundle before publication',rights:'upstream reference license separate from user media',tools:['resources.adapt_native_bundle','native.compile','native.isolate','hyperframes.check']}},resourceSchema,{resources:[],extra:'selected只能选候选id。候选为元数据索引，具体蓝图将在镜头制作时读取并校验哈希；无需再要求用户提供这些合同。只按表达是否适合选择资源，适配时使用当前应用受管原生合同，不原样执行上游脚本。可组合制作方法，不要求选场景菜单。没有适合资源时originalNeeds说明原生原创需要；不声称完成资源执行。现在已完成实际素材观察。gaps保留限制和不确定项；blockingGaps只列用户要求必须具备、工具也无法取得、没有它就无法制作的资料。商品介绍允许采用观察到的中性操作说明，未要求的商品名称/价格/参数不构成阻塞。之前未观察素材属于已执行工具工作，不能再要求用户确认。只有blockingGaps才会暂停任务。'});
    insist(plan.selected.every(s=>usable.some(c=>c.id===s.id)),'资源选择包含不可运行项','RESOURCE_UNAVAILABLE');ctx.run.selectedSkills=plan.selected.map(s=>s.id);return saveJSON('resource-plan.json',{...plan,candidates});
  });
  async function restoreNarration(record){
    if(!record?.asset)return;
    const a=record.asset;insist(/^assets\/voice-[a-f0-9]{16}\.wav$/.test(a.compiledRef)&&await hashFile(path.join(outputDir,a.compiledRef))===a.sha256,'已生成旁白的内容或路径不匹配','CHECKPOINT_HASH');
    if(!byId[a.id]){assets.push(a);byId[a.id]=a;}
  }
  registry.register('narration.prepare',async(_,ctx)=>{
    const brief=result(ctx.run,'brief');if(!brief.needsNarration||assets.some(a=>a.generatedVoice))return {enabled:false,reason:'not requested or existing confirmed voice retained'};
    insist(process.env.VIDEO_AGENT_TTS_ENGINE!=='elevenlabs','本轮只允许本地配音，未调用收费语音提供方','LOCAL_VOICE_REQUIRED');
    const savedScript=ctx.run.artifacts.narrationScript;if(savedScript)insist(resourceHash(savedScript.value)===savedScript.hash,'旁白稿检查点已变更','CHECKPOINT_HASH');
    const script=savedScript?.value||await ask(ctx,'R4',{phase:'narration-script-before-measured-timing',message:request.message,brief,observations:result(ctx.run,'observe'),targetSeconds:brief.request.output.durationSeconds},obj({text:str,voice:{type:'string',enum:['zf_xiaobei','zm_yunxi']},basis:str}),{extra:'仅在用户要求旁白时撰写完整本地中文配音稿。用户给定逐字台词时必须保留，不添加未证实参数、价格、性能、配件或操作。其余依据素材证据写中性讲解；不把证据缺口念成制作日志。保守按每秒2.5—3个汉字安排，留出操作与阅读时间，不故意加停顿凑满时长。只输出稿件与默认女声/用户要求的男声；实际时长由下一步合成测量，再由导演编排画面。'});
    insist(script.text.trim()&&script.text.length<=4000,'旁白稿缺失或超出本地预算','VOICE_SCRIPT');
    ctx.run.artifacts.narrationScript={value:script,hash:resourceHash(script)};await ctx.persist();await saveJSON('narration-script.json',script);
    const id='voice-'+resourceHash({text:script.text,voice:script.voice,rate:1}).slice(0,16),compiledRef='assets/'+id+'.wav',file=path.join(outputDir,compiledRef);
    let bytes=await fs.readFile(file).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});if(!bytes){bytes=await provider.speak(script.text,script.voice,'',signal,{rate:1});await fs.writeFile(file,bytes,{flag:'wx'});}
    const mediaMetadata=await probe(file,signal);insist(mediaMetadata.duration<=brief.request.output.durationSeconds+1/FPS,'实际旁白超过目标时长；稿件与声音已保留，请调整稿件或时长，未压缩语速','VOICE_DURATION_CONFLICT');
    const asset={id,kind:'audio',generatedVoice:true,compiledRef,normalizedRef:compiledRef,sha256:await hashFile(file),mediaMetadata,status:'ready',volume:1,rights:{status:'locally-generated',engine:'kokoro',review:'separate-publisher-review'}};
    const transcript=await provider.transcribe(file,signal);insist(transcript.words?.length,'旁白已生成，但没有取得实际语音时间戳','NO_SPEECH');
    const record={enabled:true,asset,script,transcript,tool:'local.kokoro.tts-and-local.transcribe',voice:script.voice,rate:1,measuredSeconds:mediaMetadata.duration,metrics:provider.lastSpeechMetrics};await restoreNarration(record);
    const observation=result(ctx.run,'observe');if(!observation.observations.some(o=>o.assetId===id))observation.observations.push({assetId:id,visibleContent:'实际本地合成旁白：'+script.text,uncertainty:'声音感知质量仍待试听评审',role:'unknown',productGroup:'narration',subjectBox:[],safeCrop:[],confidence:1,quality:'local audio measured',visibleText:[],sameProductAs:[],differentProductFrom:[]});
    await saveJSON('observations.json',observation);await ctx.persist();
    const transcripts=await readJSON('transcripts.json');if(!transcripts.some(t=>t.assetId===id))transcripts.push({assetId:id,sourceSha256:asset.sha256,transcript});await saveJSON('transcripts.json',transcripts);
    return saveJSON('narration.json',record);
  });
  async function inspectWithBudget(ranges,ctx,action){
    const field=action?'actionInspections':'storyInspections',tool=action?'assets.inspect_actions':'assets.inspect_ranges';
    (action?validateActionRanges:validateInspectionRanges)(ranges,assets);
    const inspections=ctx.run.artifacts[field]||[];
    const reused=reusableInspection(inspections,ranges);if(reused){await readEvidenceImages(outputDir,buildEvidenceIndex(assets,[reused]).entries);return reused;}
    try{
      insist(inspections.length<2,'观察预算已用完；已有证据已保留，这不代表素材没有所需内容','OBSERVATION_BUDGET');
      const inspect=action?(io.inspectActionRanges||((r)=>inspectActionRanges(outputDir,assets,r,{signal}))):(io.inspectSourceRanges||((r)=>inspectSourceRanges(outputDir,assets,r,{signal})));
      const record=await inspect(ranges);
      ctx.run.artifacts[field]=[...inspections,record];ctx.run.artifacts.latestStoryEvidenceKey=record.key;visualInputs=[];
      await saveJSON(action?'action-inspections.json':'story-inspections.json',ctx.run.artifacts[field]);await ctx.persist();return record;
    }catch(error){
      (ctx.run.artifacts.sourceEvidenceEvents??=[]).push({tool,ranges,state:error.code==='OBSERVATION_BUDGET'?'budget_exhausted':'media_error',code:error.code,message:error.message});
      await saveJSON('source-evidence-events.json',ctx.run.artifacts.sourceEvidenceEvents);await ctx.persist();throw error;
    }
  }
  registry.register('assets.inspect_ranges',(input,ctx)=>inspectWithBudget(input.ranges,ctx,false));
  registry.register('assets.inspect_actions',(input,ctx)=>inspectWithBudget(input.ranges,ctx,true));
  registry.register('story.plan',async(_,ctx)=>{
    const brief=result(ctx.run,'brief'),resources=result(ctx.run,'resources');
    let story,lastError=ctx.run.artifacts.storyValidationError;for(let attempt=0;attempt<3;attempt++){
    const evidence=await sourceEvidence(ctx.run);
    const imageSelection=selectEvidenceInputs(evidence.images,4);
    story=await ask(ctx,'R4',{sourceEvidence:evidence.selection,message:request.message,brief,attempt,validationError:lastError?.message,priorStory:result(ctx.run,'story')||null,additionalSourceEvidence:[...(ctx.run.artifacts.storyInspections||[]),...(ctx.run.artifacts.actionInspections||[])],evidenceImageBudget:{sent:imageSelection.sent,available:imageSelection.available,omitted:imageSelection.omitted,reason:'model context budget; omitted images were not sent'},availableTools:[{name:'assets.inspect_actions',remaining:2-(ctx.run.artifacts.actionInspections?.length||0),maxRanges:3,maxRangeSeconds:12,sampleFps:4,playableProxy:true},{name:'assets.inspect_ranges',remaining:2-(ctx.run.artifacts.storyInspections?.length||0),maxRanges:3,maxRangeSeconds:30}],observations:result(ctx.run,'observe'),narration:result(ctx.run,'narration'),transcripts:await readJSON('transcripts.json'),assets:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata})),resources,nativeRecipeContract,fontContract},runtimeStorySchema,{images:imageSelection.inputs,resources:[],extra:'只输出整片故事和精确镜头时间，不写HTML。需要确认短动作起止时用inspectActions请求密集观察：每次至多3段，每段12秒，工具生成4Hz逐帧时间标记接触表和可播放源片段。4Hz证据只支持约0.25秒粒度的判断，不能宣称模型完整播放或帧级精确核验。观察宽区间用inspectRanges，两种工具分开记录预算。没有请求时inspectActions为空。若离散观察不足，先通过inspectRanges请求检查已有源片的具体区间（每次最多3段、每段30秒），本次scenes可留空，下一轮会得到真实工具图片及秒数。不要把未观察当成不可获得素材；也不把候选窗口当全部可用素材。已得到的补充观察不要重复请求。仅在确有不可取得的必需资料时填写blockingGaps，解释缺口；不能悄悄缩时长、补写事实或空转。有效完整分镜时两个数组均为空。按内容决定镜头数，不平均分配。每个镜头必须带新的信息或明确观看作用，paragraphId引用段落。不要把几个相似状态各自长时间停留当新信息；对连续超过8秒的镜头说明期间实际发生什么变化、为什么值得观看。durationSeconds明确到1/30秒；cut时总和严格等于目标秒数，其他转场每处重叠0.3秒。视频源区间必须足够且不重复凑时长，不改变播放速度除非用户明确要求。效应可为custom-native，后续镜头制作者处理。至少让有需要的关键镜头获得原创设计，但不要强制每幕动效或改掉自然实拍剪辑。按每镜头表达任务从resources.candidates中eligible且compatible的候选选择resourceId，selected仅为整片建议，不限制镜头；没有合适资源用native-original。productionMethod为footage-cut（单段实拍且无文字）、parameterized（符合nativeRecipeContract的常规布局）、composition-adapt（组合或局部适配）、original（必要原创）。常规镜头优先复用，关键创意不强制降级。visualDirection说明商品与文字主次、开场吸引点、此镜头新增理解及需要克制的地方。没有价格就没有价格段；用户要求开头价格则放开头。每镜头最多4媒体、32文字，整片最多300原生节点是执行预算。保持原声时audio列出有声视频assetId/volume:1/sourceStartSeconds:0；原声实际随每个源镜头裁切。如果narration.enabled，必须使用其真实asset.id音轨，保留完整已合成声音，并根据transcript的真实词时间安排镜头和文字。只使用brief.request的已确认事实，事实ID按fact-1顺序。设计颜色均#RRGGBB。typeScale给当前输出尺寸的像素字号，safeMarginPx给安全边距；labelStyle统一全片标签形状、边距、线条与层级，镜头制作必须继承，不各自发明字体和标签风格。'});
    if(story.inspectActions?.length){validateActionRanges(story.inspectActions,assets);return saveJSON('story-plan.json',story);}
    if(story.inspectRanges?.length){validateInspectionRanges(story.inspectRanges,assets);return saveJSON('story-plan.json',story);}
    if(story.blockingGaps?.length){
      const metadataOnly=story.blockingGaps.every(g=>/商品(名称|名|卖点|参数|价格|CTA)|未提供|没有提供/.test(g));
      if(metadataOnly){story.gaps=[...(story.gaps||[]),...story.blockingGaps];story.blockingGaps=[];}
      else return saveJSON('story-plan.json',story);
    }
    try{validateStory(story,brief,resources);documentFromModelPlan(request,assets,nativePlan(ctx.run,{},story));break;}catch(error){lastError=error;await saveJSON('failed-story-'+attempt+'.json',{story,error:{code:error.code,message:error.message}});if(repairRoute(error)!=='scene'||attempt===2)throw error;}
    }
    ctx.run.plan={paragraphs:story.paragraphs,sceneCount:story.scenes.length};return saveJSON('story-plan.json',story);
  });
  function nativePlan(run,override={},draftStory){const brief=result(run,'brief'),story=draftStory||result(run,'story');return {summary:story.summary,transition:story.transition,inferredRequest:brief.request,observations:result(run,'observe').observations,design:story.design,scenes:story.scenes.map((s,i)=>nativeScenePlan(s,override[i])),audio:story.audio,omitted:story.omitted};}
  registry.register('timing.verify',async(_,ctx)=>{
    const brief=result(ctx.run,'brief');
    try{validateInferredRequest(request,brief.request);}catch(error){
      if(error.code!=='UNKNOWN_FACT')throw error;
      const fixed=await ask(ctx,'R1',{message:request.message,request:brief.request,error:error.message},creationSchema.properties.inferredRequest,{extra:'修复旧任务的事实引用：每个事实text和userQuote必须逐字摘自用户原话。保持facts顺序和数量，保留已确认输出、名称、价格与CTA；只修正事实的摘录，不新增或删去资料，不改分镜。'});
      insist(fixed.facts.length===brief.request.facts.length&&JSON.stringify({...fixed,facts:[]})===JSON.stringify({...brief.request,facts:[]}),'事实修复超出原始需求范围','REPLAN_SCOPE');validateInferredRequest(request,fixed);
      await saveJSON('brief-before-validation-repair-'+Date.now()+'.json',brief);brief.request=fixed;await saveJSON('brief-plan.json',brief);await ctx.persist();
    }
    const document=documentFromModelPlan(request,assets,nativePlan(ctx.run));
    for(const a of assets.filter(a=>a.generatedVoice))insist(document.audioGraph.some(t=>t.assetId===a.id&&t.durationFrames+1>=Math.ceil(a.mediaMetadata.duration*FPS)),'已确认声音必须完整保留','VOICE_DURATION_CONFLICT');
    if(brief.keepOriginalAudio)insist(document.nodes.filter(n=>n.kind==='video'&&byId[n.assetId].mediaMetadata.hasAudio).every(n=>document.audioGraph.some(t=>t.sourceNodeId===n.id)),'要求保留的操作原声没有绑定到真实镜头','MISSING_SOURCE_AUDIO');
    return saveJSON('timing-plan.json',{durationFrames:document.durationFrames,scenes:document.scenes.map(s=>({id:s.id,startFrame:s.startFrame,durationFrames:s.durationFrames})),audioGraph:document.audioGraph,basis:result(ctx.run,'narration')?.enabled?'measured-narration-transcript':brief.needsTranscription?'measured-transcript':'observed-source-boundaries',readingAndActionsReviewed:false});
  });
  async function buildShot(ctx,index,feedback){
    const release=await acquireRender({kind:'author',signal});
    try{return await buildShotInSlot(ctx,index,feedback);}finally{release();}
  }
  async function buildShotInSlot(ctx,index,feedback){
    const story=result(ctx.run,'story'),shot=story.scenes[index],timing=result(ctx.run,'timing').scenes[index],sceneId=timing.id;
    const sourceFile=`scene-${String(index+1).padStart(3,'0')}.json`,sources={};
    // A clean, single real video segment needs no authored HTML. Keep it as a
    // native media-cut so it can run on every supported desktop without
    // entering the custom-source isolation worker.
    if(!feedback&&shot.productionMethod==='footage-cut'&&shot.media.length===1&&shot.text.length===0&&byId[shot.media[0].assetId]?.kind==='video'){
      const receipt={resourceId:'native-original',tool:'native.footage-cut',method:'footage-cut',sceneId,status:'compiled'};
      await saveJSON(sourceFile,{source:null,receipt,notes:'Direct source cut; no custom HTML authored.'});
      return {file:sourceFile,sourceHash:resourceHash(null),sceneId,receipt};
    }
    const reusable=!feedback&&instantiateNativeRecipe(shot,story.design,result(ctx.run,'brief').request.output,assets);
    if(reusable){
      const adapted=await catalog.adapt(reusable.source,{resourceId:shot.resourceId,sceneId,objectIds:[],design:story.design});
      const document=documentFromModelPlan(request,assets,nativePlan(ctx.run,{[index]:adapted.source}));
      compileDocument(document,assets);
      const still={...adapted.source,timeline:'',motionTargets:[]},staticDocument=documentFromModelPlan(request,assets,nativePlan(ctx.run,{[index]:still}));
      const inspected=await (io.inspectKeyframe||inspectKeyframe)(staticDocument,sceneId,assets,outputDir,runHyperFrames,{signal,atSeconds:Math.min(1,shot.durationSeconds*.45)});
      const receipt={...adapted.receipt,tool:'resources.instantiate_native',method:reusable.method,adapterId:reusable.adapterId,adapterVersion:reusable.adapterVersion,implementationHash:reusable.implementationHash,adapterSourceSha256:implementation.files['lib/creative/native-recipes.mjs'],parameterHash:reusable.parameterHash,objectIds:document.nodes.filter(n=>n.sceneId===sceneId).map(n=>n.id),status:'compiled-static-checked',checks:inspected};
      await saveJSON(sourceFile,{source:adapted.source,bundle:document.sourceBundles.find(b=>b.sceneId===sceneId),receipt,notes:'Parameterized native execution; complete film review still required.'});
      return {file:sourceFile,sourceHash:resourceHash(adapted.source),sceneId,receipt};
    }

    const keyframeChoices=[...new Set([.2,.45,.75].map(f=>Math.round(shot.durationSeconds*FPS*f)/FPS))];
    const staticShotSchema=obj({...shotSchema.properties,keyframeAtSeconds:{type:'number',enum:keyframeChoices}});
    const images=[],sourceBoundaryImages=[];
    for(const m of shot.media){
      const a=byId[m.assetId];
      if(a.kind==='video')for(const [candidate,localSeconds]of keyframeChoices.entries()){
        const time=m.sourceStartSeconds+localSeconds*(m.playbackRate||1),file=path.join(outputDir,'evidence','shot-'+index+'-'+a.id+'-'+candidate+'.jpg');
        await mediaRun(ffmpeg,['-y','-v','error','-ss',String(time),'-i',path.join(outputDir,a.compiledRef),'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',file],{signal,timeout:30000});
        images.push({type:'input_text',text:'关键画面候选：本镜头 '+localSeconds+' 秒，素材 '+a.id+' 源 '+time.toFixed(3)+' 秒'},{type:'input_image',image_url:'data:image/jpeg;base64,'+(await fs.readFile(file)).toString('base64')});
      }else if(a.kind==='image'){
        const bytes=await sharp(path.join(outputDir,a.compiledRef)).resize({width:960,height:960,fit:'inside'}).jpeg().toBuffer();images.push({type:'input_image',image_url:'data:image/jpeg;base64,'+bytes.toString('base64')});
      }
    }
    for(const m of shot.media.filter(m=>byId[m.assetId].kind==='video'))for(const [edge,localSeconds]of [['入点',0],['末帧',Math.max(0,shot.durationSeconds-1/FPS)]]){
      const a=byId[m.assetId],time=m.sourceStartSeconds+localSeconds*(m.playbackRate||1),file=path.join(outputDir,'evidence','shot-'+index+'-'+a.id+'-boundary-'+Math.round(localSeconds*FPS)+'.jpg');
      await mediaRun(ffmpeg,['-y','-v','error','-ss',String(time),'-i',path.join(outputDir,a.compiledRef),'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',file],{signal,timeout:30000});
      sourceBoundaryImages.push({type:'input_text',text:'未加包装的真实源边界 '+edge+'；本镜头 '+localSeconds.toFixed(3)+' 秒，源 '+time.toFixed(3)+' 秒；仅用于核对实际动作，不是已制作关键画面。'},{type:'input_image',image_url:'data:image/jpeg;base64,'+(await fs.readFile(file)).toString('base64')});
    }
    const previousSource=feedback?await readJSON(sourceFile).then(r=>r.source).catch(e=>{if(e.code!=='ENOENT')throw e;return null;}):null;
    const packet={message:request.message,sceneId,shot,output:result(ctx.run,'brief').request.output,design:story.design,fontContract,keyframeChoices,previous:story.scenes[index-1]||null,next:story.scenes[index+1]||null,observations:result(ctx.run,'observe').observations.filter(o=>shot.media.some(m=>m.assetId===o.assetId)),feedback:feedback||null,previousSource,repairInstruction:feedback?'在现有源码中做解决已报告问题所需的最小修改；保持所有已有原生对象映射，不重新设计本镜头。':null};
    let lastError,lastSource,keyframe=null,keyframeImage=[];const failedLayouts=new Set();
    if(!feedback){
      const saved=await readJSON('keyframe-'+index+'.json').catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
      if(saved?.source&&saved.evidence&&saved.review&&!keyframeFailure(saved.review.issues||[])){
        const native=documentFromModelPlan(request,assets,nativePlan(ctx.run,{[index]:saved.source}));
        if(native.revisionId===saved.evidence.sourceRevisionId){
          const inspected=await (io.inspectKeyframe||inspectKeyframe)(native,sceneId,assets,outputDir,runHyperFrames,{signal,atSeconds:saved.evidence.globalSeconds-native.scenes[index].startFrame/FPS});
          if(inspected.imageHash===saved.evidence.imageHash){
            keyframe=saved.source;keyframeImage=[{type:'input_text',text:'已重新验证的原关键画面 '+inspected.folder+'/'+inspected.image},{type:'input_image',image_url:'data:image/png;base64,'+(await fs.readFile(inspected.imagePath)).toString('base64')}];
            (ctx.run.artifacts.keyframeReuses??=[]).push({index,sourceHash:resourceHash(keyframe),priorEvidence:saved.evidence.inputHash,currentEvidence:inspected.inputHash,modelCalls:ctx.run.modelCalls});await ctx.persist();
          }
        }
      }
      for(let attempt=0;!keyframe&&attempt<3;attempt++){
        const answer=await ask(ctx,'R5',{...packet,phase:'static-keyframe',attempt,error:lastError?.message,previousSource:lastSource||packet.previousSource},staticShotSchema,{images,resources:shot.resourceId==='native-original'?[]:[shot.resourceId],extra:CUSTOM_SOURCE_CONTRACT.replaceAll('customSourceJson','source')+'\n这里只制作最清晰的静态关键画面，尚未制作动画。根据已提供的真实候选帧，从keyframeChoices选择主体与动作最清楚的本镜头秒数，返回keyframeAtSeconds；不要固定使用中点。静态图没有可见时序差异时也从此列表选择。timeline必须为空字符串，motionTargets必须为空数组，全部获准文字在CSS静态状态清晰可见，不能使用opacity:0隐藏。保留真实实拍主体与所有获准原生对象。不要为动效预置不可见状态。应用会先运行真实布局/对比度检查并截图评审，再单独请求动画。'});
        try{
          insist(!answer.source.timeline.trim()&&!answer.source.motionTargets.length,'静态阶段不能含动画','KEYFRAME_CONTRACT');
          const adapted=await catalog.adapt(answer.source,{resourceId:shot.resourceId,sceneId,objectIds:[],design:story.design});
          const native=documentFromModelPlan(request,assets,nativePlan(ctx.run,{[index]:adapted.source}));
          await onStage?.('检查镜头 '+(index+1)+' 的静态布局');
          const inspected=await (io.inspectKeyframe||inspectKeyframe)(native,sceneId,assets,outputDir,runHyperFrames,{signal,atSeconds:answer.keyframeAtSeconds});
          keyframeImage=[{type:'input_text',text:'已检查的静态关键画面 '+inspected.folder+'/'+inspected.image},{type:'input_image',image_url:'data:image/png;base64,'+(await fs.readFile(inspected.imagePath)).toString('base64')}];
          const matchingSourceImages=images.flatMap((image,i)=>image.type==='input_text'&&image.text.startsWith('关键画面候选：本镜头 '+answer.keyframeAtSeconds+' 秒，')?[{...image,text:'与合成关键帧同一时刻的未包装源画面；'+image.text},images[i+1]]:[]);
          const review=await ask(ctx,'R6',{phase:'static-keyframe',sceneId,shot,design:story.design,output:native.output,keyframeAtSeconds:answer.keyframeAtSeconds,addedTextObjects:native.nodes.filter(n=>n.sceneId===sceneId&&n.kind==='text').map(n=>({id:n.id,text:n.params.text})),evidence:inspected.folder+'/'+inspected.image},obj({issues:list(obj({severity:{type:'string',enum:['major','minor']},repairKind:{type:'string',enum:['layout','source-selection','text-evidence','text-timing','fact-binding']},problem:str,repair:str})),summary:str}),{images:[...sourceBoundaryImages,...matchingSourceImages,...keyframeImage],extra:'对照同一时刻未包装源画面和合成关键帧，以及addedTextObjects明确列出的应用文字，区分源实拍自带的文字/标识与应用新增叠层；只有未包装源画面中也存在的字样才能称为源片烧录文字。源片已有标识不是应用虚构文案，不能仅因模型自己写的visualDirection不强调品牌就要求移除、遮盖或裁掉它。原用户要求高于模型创意说明。确实遮挡必需动作时归source-selection，选择真实可用源区间，不让布局作者以色块覆盖商品或删除原片标识。另提供源选段首末帧，用来核对入点和末帧的可见动作与本镜头说明是否相符；不能仅凭离散帧宣称完整连续动作通过。源边界未加包装，不检查其文字布局。检查静态关键画面中商品、文字主次、主体裁切和中文可读性。只报告图片可确认的问题；尚未添加动画，不把静止当缺陷。major需具体局部修复。repairKind仅在源区间或动作确实错误时为source-selection；对比度、遮挡、排版为layout；事实冲突为fact-binding。'});
          await saveJSON('keyframe-review-'+index+'-'+attempt+'.json',{...inspected,imagePath:undefined,review,sourceHash:resourceHash(adapted.source)});
          const failure=keyframeFailure(review.issues);if(failure)throw failure;
          keyframe=adapted.source;await saveJSON('keyframe-'+index+'.json',{source:keyframe,evidence:inspected,review});break;
        }catch(error){lastError=error;lastSource=answer.source;await saveJSON('failed-keyframe-'+index+'-'+attempt+'.json',{answer,error:{code:error.code,message:error.message}});const failureHash=resourceHash({code:error.code,message:error.message,source:answer.source});const repeated=failedLayouts.has(failureHash);failedLayouts.add(failureHash);if(repeated||repairRoute(error)!=='scene'||attempt===2)throw error;}
      }
      lastError=null;
    }
    for(let attempt=0;attempt<3;attempt++){
      const answer=await ask(ctx,'R5',{...packet,phase:feedback?'local-repair':'animate-checked-keyframe',checkedKeyframe:keyframe,attempt,error:lastError?.message},keyframe?animationSchema:shotSchema,{images:[...images,...keyframeImage],resources:shot.resourceId==='native-original'?[]:[shot.resourceId],extra:CUSTOM_SOURCE_CONTRACT.replaceAll('customSourceJson','source')+'\n制作本镜头。若提供checkedKeyframe，只返回animation对象，包含timeline、parameters、motionTargets；应用会直接保留已检查的HTML/CSS/objects，不要求复制它们。只有local-repair阶段返回完整source。用from/fromTo设置入场初态。真实视频本身已提供运动，无需无意义动画；无获准文字时允许空时间线。文字必须全部留空绑定。返回本镜头source结构化对象，不使用嵌套JSON字符串，不双重转义引号。不要加大面积装饰遮挡实拍。每条文字可按语义先后出现。用已有的title/feature等ref或text-1序号映射，不把用户文案拆成未经声明的内联字串。选择了蓝图则说明适配其哪个结构，保持用户动作连续性优先于蓝图的清屏或切换。最终场景时长='+shot.durationSeconds+'秒，使用params.sceneSeconds。'});
      try{
        const source=keyframe?animateKeyframe(keyframe,answer.animation):answer.source,adapted=await catalog.adapt(source,{resourceId:shot.resourceId,sceneId,objectIds:[],design:story.design});
        sources[index]=adapted.source;const document=documentFromModelPlan(request,assets,nativePlan(ctx.run,sources));compileDocument(document,assets);
        const bundle=document.sourceBundles.find(b=>b.sceneId===sceneId);adapted.receipt.objectIds=document.nodes.filter(n=>n.sceneId===sceneId).map(n=>n.id);adapted.receipt.status='compiled';
        await saveJSON(sourceFile,{source:adapted.source,bundle,receipt:adapted.receipt,notes:answer.notes});return {file:sourceFile,sourceHash:resourceHash(adapted.source),sceneId,receipt:adapted.receipt};
      }catch(error){lastError=error;await saveJSON('failed-shot-'+index+'-'+attempt+'.json',{answer,error:{code:error.code,message:error.message}});if(repairRoute(error)!=='scene'||attempt===2)throw error;}
    }
  }
  async function replanSourceShot(ctx,index,feedback){
    const count=ctx.run.artifacts.storyRepairCount||0;
    const original=result(ctx.run,'story'),brief=result(ctx.run,'brief'),resources=result(ctx.run,'resources');
    const shot=original.scenes[index],evidence=await sourceEvidence(ctx.run,{assetIds:shot.media.map(m=>m.assetId),preferredRanges:shot.media.map(m=>({assetId:m.assetId,startSeconds:m.sourceStartSeconds,endSeconds:m.sourceStartSeconds+shot.durationSeconds*(m.playbackRate||1)}))});
    // A scene invented by the agent must not block the user's broader request when
    // its source-selection budget is exhausted. Re-plan it from a previously
    // observed, dense source range; explicit user requirements still remain hard.
    const userHardRequirement=/(称量|注液|电子秤)/.test(request.message);
    const observed=(evidence.selection?.records||[]).filter(r=>/电子秤|注入液体|称量/.test(JSON.stringify(r))).sort((a,b)=>{const ad=String(a.file||a.id||'').includes('detail-contact-3')?0:1,bd=String(b.file||b.id||'').includes('detail-contact-3')?0:1;return ad-bd||(Number(a.startSeconds)||0)-(Number(b.startSeconds)||0)})[0];
    if(count>=2&&!userHardRequirement&&observed){
      const start=Math.max(Number(observed.startSeconds)||0,(Number(observed.endSeconds)||0)-12);
      const repaired={...shot,media:shot.media.map(m=>({...m,sourceStartSeconds:start})),purpose:'继续可观察的冲煮操作',newInformation:'电子秤上注入液体的实拍动作',reason:'原请求只要求操作可理解；原 Agent 自拟的称量注液镜头经两次错误选段后，依据已保存的密集素材证据改用 '+start.toFixed(3)+' 秒附近的真实注液区间。',text:shot.text.map(t=>({...t,text:'注入液体'})),visualDirection:'保留电子秤、容器和液体流动的真实画面；文字只说明可见动作，不解释数字。'};
      validateShotRepair(shot,repaired,request.message);
      const story=replaceStoryShot(original,index,repaired,brief,resources),native=documentFromModelPlan(request,assets,nativePlan(ctx.run,{},story));
      await saveJSON('story-before-repair-'+count+'.json',original);await saveJSON('story-repair-evidence-fallback-'+count+'.json',{index,before:shot,after:repaired,reason:feedback,evidence:observed});
      ctx.run.artifacts.evidenceFallbacks=[...(ctx.run.artifacts.evidenceFallbacks||[]),{index,sourceStartSeconds:start,evidence:observed.file||observed.id}];ctx.run.checkpoints.story.result=story;await saveJSON('story-plan.json',story);
      const timing=result(ctx.run,'timing');if(timing){timing.audioGraph=native.audioGraph;await saveJSON('timing-plan.json',timing);}await ctx.persist();return;
    }
    insist(count<2,'镜头选段重规划预算已用完；保留有效镜头和缺陷','STORY_REPAIR_BUDGET');
    const repaired=await ask(ctx,'R4',{sourceEvidence:evidence.selection,phase:'repair-one-source-selection',index,story:original,brief,observations:result(ctx.run,'observe'),additionalSourceEvidence:[...(ctx.run.artifacts.storyInspections||[]),...(ctx.run.artifacts.actionInspections||[])],sourceMetadata:assets.map(a=>({id:a.id,...a.mediaMetadata})),feedback},storyScene,{images:evidence.images,extra:'画面检查指出源片选段或模型自拟观察说明与画面不符。仅修复这个镜头：若画面正确但模型自拟的中性说明不符，可根据真实证据纠正该说明，不必换掉正确实拍。用户消息中逐字提供的文字、有factRefs的文字、价格与CTA必须原样保留。文字数量、角色、事实引用、媒体数量、时长、段落和资源ID不变；更正说明不得新增数值、参数、价格或无法从实际画面确认的商品事实。不改其他镜头或声音策略。不要重复其他镜头补时长，不编造缺失动作或商品关联。片尾不能在新动作中间戛然而止；依据实际接触表选择能自然结束的真实区间，不能冻结、慢放或循环。返回完整单镜头；sourceStartSeconds实际影响原生视频及同步原声音轨。'});
    validateShotRepair(original.scenes[index],repaired,request.message);
    const story=replaceStoryShot(original,index,repaired,brief,resources),native=documentFromModelPlan(request,assets,nativePlan(ctx.run,{},story));
    await saveJSON('story-before-repair-'+count+'.json',original);await saveJSON('story-repair-'+count+'.json',{index,before:original.scenes[index],after:repaired,reason:feedback});
    ctx.run.artifacts.storyRepairCount=count+1;ctx.run.checkpoints.story.result=story;await saveJSON('story-plan.json',story);
    const timing=result(ctx.run,'timing');if(timing){timing.audioGraph=native.audioGraph;await saveJSON('timing-plan.json',timing);}await ctx.persist();
  }
  registry.register('scene.author',async({index},ctx)=>{
    if(io.buildShot)return io.buildShot(index,ctx);
    for(;;){try{return await buildShot(ctx,index);}catch(error){
      if(repairRoute(error)!=='source-selection'||signal?.aborted)throw error;
      await replanSourceShot(ctx,index,error.issues||[{problem:error.message,repairKind:'source-selection'}]);
    }}
  });
  async function assemble(ctx){const sources={};for(const [i] of result(ctx.run,'story').scenes.entries()){const record=await readJSON(result(ctx.run,'shot-'+i).file);insist(resourceHash(record.source)===result(ctx.run,'shot-'+i).sourceHash,'镜头检查点内容变更','SCENE_HASH');sources[i]=record.source;}
    const document=documentFromModelPlan(request,assets,nativePlan(ctx.run,sources));document.storyPlan={paragraphs:result(ctx.run,'story').paragraphs,scenes:result(ctx.run,'story').scenes.map((s,i)=>({sceneId:document.scenes[i].id,paragraphId:s.paragraphId,newInformation:s.newInformation,visualDirection:s.visualDirection}))};document.timingPlan=result(ctx.run,'timing');document.production={runId:ctx.run.id,inputFingerprint:fingerprint,workflowVersion:1};document.dependencyLock={...document.dependencyLock,resources:catalog.snapshot?.commit,prompts:resourceHash(await fs.readFile(path.join(root,'prompts/commerce/manifest.json'),'utf8'))};document.resourceReceipts=Object.keys(sources).map(i=>result(ctx.run,'shot-'+i).receipt);
    if(result(ctx.run,'brief').needsCaptions)document.captions=await recognizeNativeCaptions(document,assets,outputDir,{signal,provider});
    const audioRefs=await prepareNativeAudio(outputDir,document,assets,{signal});const compiled=compileDocument(document,assets,{audioRefs});await fs.writeFile(path.join(outputDir,'index.html'),compiled.html);await saveJSON('document.json',document);await saveJSON('object-map.json',compiled.objectMap);await saveJSON('manifest.json',compiled.manifest);await fs.writeFile(path.join(outputDir,'DESIGN.md'),designMarkdown(document));await fs.writeFile(path.join(outputDir,'STORYBOARD.md'),'# Storyboard\n\n'+result(ctx.run,'story').summary+'\n\n'+document.storyPlan.scenes.map(s=>s.sceneId+' · '+s.newInformation).join('\n'));
    await saveJSON('resource-receipts.json',document.resourceReceipts);
    await catalog.lockUsedResources?.(outputDir);await saveJSON('hyperframes.json',{version:1,entry:'index.html'});
    await (io.verifyCustomProject||verifyCustomProject)(outputDir,document,assets,{signal});
    await fs.writeFile(path.join(outputDir,'check.log'),await runHyperFrames(outputDir,'check',[],{signal}));return {revisionId:document.revisionId,durationFrames:document.durationFrames};
  }
  registry.register('project.direction_preview',async(_,ctx)=>{
    if(io.directionPreview)return io.directionPreview(ctx);
    const sources={},completed=[];
    for(const [i]of result(ctx.run,'story').scenes.entries()){
      const checkpoint=result(ctx.run,'shot-'+i);if(!checkpoint)break;
      const record=await readJSON(checkpoint.file);insist(resourceHash(record.source)===checkpoint.sourceHash,'方向预览的镜头检查点已变化','SCENE_HASH');sources[i]=record.source;completed.push(checkpoint.sceneId);
    }
    const document=documentFromModelPlan(request,assets,nativePlan(ctx.run,sources));
    const record=await createDirectionPreview(document,completed,assets,outputDir,root,runHyperFrames,{signal,binding:{runId:ctx.run.id,inputFingerprint:fingerprint,storyHash:resourceHash(result(ctx.run,'story')),timingHash:resourceHash(result(ctx.run,'timing')),implementationHash,sourceHashes:Object.fromEntries(Object.keys(sources).map(i=>[i,result(ctx.run,'shot-'+i).sourceHash]))}});
    ctx.run.artifacts.directionPreview=record;await ctx.persist();return saveJSON('direction-preview.json',record);
  });
  registry.register('project.assemble',async(_,ctx)=>{
    if(io.assemble)return io.assemble(ctx);
    for(;;){try{return await assemble(ctx);}catch(error){
      await saveJSON('assembly-failure-'+Date.now()+'.json',{message:error.message,code:error.code,sceneId:error.sceneId});
      const targets=[...new Set([error.sceneId,...[...String(error.message).matchAll(/custom-(scene-\d+)-/g)].map(m=>m[1])].filter(Boolean))];
      if(!targets.length||signal?.aborted||repairRoute(error)!=='scene')throw error;
      for(const sceneId of targets){const index=result(ctx.run,'timing').scenes.findIndex(s=>s.id===sceneId);if(index<0)throw error;const current=result(ctx.run,'shot-'+index),repairs=current.engineeringRepairCount||0;if(repairs>=2)throw error;await onStage?.('修复镜头 '+(index+1)+' 的工程检查问题');const rebuilt=await buildShot(ctx,index,[{kind:'engineering-check',problem:error.message,scope:'only this scene; preserve approved text, media, timing and stable object roles'}]);ctx.run.checkpoints['shot-'+index].result={...rebuilt,engineeringRepairCount:repairs+1};await ctx.persist();}
    }}
  });
  registry.register('preview.review',async(_,ctx)=>{
    if(io.review)return io.review(ctx);
    let report;
    for(let round=ctx.run.repairCount||0;round<3;round++){
      const document=await readJSON('document.json'),batches=[];
      for(let offset=0;offset<document.scenes.length;offset+=3){
        const scenes=document.scenes.slice(offset,offset+3),ids=new Set(scenes.map(s=>s.id));
        const times=[...new Set(scenes.flatMap(s=>[.3,Math.min(2,s.durationFrames/FPS*.4),s.durationFrames/FPS*.7,s.durationFrames/FPS-1/FPS].map(t=>Number((s.startFrame/FPS+Math.min(t,s.durationFrames/FPS-1/FPS)).toFixed(3)))))];
        const folder=`review-${round}/batch-${offset/3}`;await fs.mkdir(path.join(outputDir,folder),{recursive:true});
        await runHyperFrames(outputDir,'snapshot',['--at',times.join(','),'--output',folder,'--describe','false'],{signal});
        const names=(await fs.readdir(path.join(outputDir,folder))).filter(n=>basenameOK(n)&&/^frame-.*\.(png|jpe?g)$/.test(n)&&times.some(t=>Math.abs(t-Number(n.match(/-at-([\d.]+)s/)?.[1]))<.02)),images=[];
        const frameTimes=names.map(n=>({file:folder+'/'+n,seconds:Number(n.match(/-at-([\d.]+)s/)[1])}));
        for(const name of names){const bytes=await sharp(path.join(outputDir,folder,name)).resize({width:1280,height:960,fit:'inside'}).jpeg({quality:86}).toBuffer();images.push({type:'input_text',text:folder+'/'+name},{type:'input_image',image_url:'data:image/jpeg;base64,'+bytes.toString('base64')});}
        insist(images.length,'没有实际预览帧，不能评审通过','PREVIEW_EVIDENCE_MISSING');
        const {sourceBundles,...reviewDocument}=document;reviewDocument.scenes=scenes;reviewDocument.nodes=document.nodes.filter(n=>ids.has(n.sceneId));
        const reviewed=await ask(ctx,'R6',{message:request.message,document:reviewDocument,animationEvidence:sourceBundles.filter(b=>ids.has(b.sceneId)).map(b=>({sceneId:b.sceneId,timeline:b.timeline,objects:b.objects})),frameTimes,evidence:names.map(n=>folder+'/'+n),round,batch:offset/3,limits:{sceneRepairs:2,wholeFilmReviews:2}},boundedQualitySchema(ids,reviewDocument.nodes,frameTimes),{images,extra:'本批只检查给定镜头，其他镜头另批处理。只根据实际图片与时间/源区间检查结果评价；没有试听/全片运动证据则把该项列入unreviewed。问题必须有本批有效sceneId和实际证据文件名。major/blocker必须给具体可执行的局部修复。repairKind必须准确区分：源画面选错/动作不完整/片尾在新动作中截断用source-selection，由导演重选原生媒体区间；构图遮挡用layout；文字退出时点用text-timing；模型自拟说明本身与实拍证据不符用text-evidence，由导演纠正中性说明，不能改变用户原文或事实。不要要求镜头CSS编写器改变原生视频选段。不要把增加动画数量当质量。'});
        for(const issue of reviewed.issues){insist(ids.has(issue.sceneId)&&issue.nodeIds.every(id=>document.nodes.some(n=>n.id===id&&n.sceneId===issue.sceneId)),'评审对象不存在或不属于目标镜头','REVIEW_TARGET');insist(issue.startSeconds>=0&&issue.endSeconds>=issue.startSeconds&&issue.endSeconds<=document.durationFrames/FPS&&issue.evidence.length&&issue.evidence.every(f=>frameTimes.some(t=>t.file===f)),'评审必须定位实际时间与本轮预览文件','REVIEW_EVIDENCE');}
        await saveJSON(`quality-round-${round}-batch-${offset/3}.json`,{...reviewed,frameTimes});batches.push(reviewed);
      }
      report={summary:batches.map(b=>b.summary).join('\n'),issues:batches.flatMap(b=>b.issues),unreviewed:[...new Set(batches.flatMap(b=>b.unreviewed))]};
      await saveJSON('quality-round-'+round+'.json',report);
      const required=requiredRepairs(report.issues);
      if(!required.length)break;
      if(round===2)break;
      for(const sceneId of new Set(required.map(i=>i.sceneId))){const index=document.scenes.findIndex(s=>s.id===sceneId);insist(index>=0,'评审引用了不存在镜头','REVIEW_TARGET');const current=ctx.run.checkpoints['shot-'+index].result,repairCount=current.repairCount||0;if(repairCount>=2)continue;const feedback=required.filter(i=>i.sceneId===sceneId),sourceSelection=feedback.some(i=>['source-selection','text-evidence'].includes(i.repairKind));if(sourceSelection)await replanSourceShot(ctx,index,feedback);const rebuilt=await buildShot(ctx,index,sourceSelection?undefined:feedback);insist(sourceSelection||rebuilt.sourceHash!==current.sourceHash,'局部修复没有改变问题镜头，已保留原工程和缺陷','REPAIR_NO_PROGRESS');ctx.run.checkpoints['shot-'+index].result={...rebuilt,repairCount:repairCount+1};await ctx.persist();}
      ctx.run.repairCount++;await ctx.persist();await assemble(ctx);
    }
    const blockers=report.issues.filter(i=>['blocker','major'].includes(i.severity));const document=await readJSON('document.json');
    const quality={...report,status:blockers.length?'needs-repair':'preview-reviewed',engineering:'checked',fullPlayback:'pending',humanReview:'pending',rights:'requires-publisher-review',revisionId:document.revisionId};document.quality=quality;document.directionPreview=ctx.run.artifacts.directionPreview||null;bindResourceChecks(document,{engineering:true,visual:quality.status});await saveJSON('resource-receipts.json',document.resourceReceipts);document.previewRange={startFrame:document.scenes[Math.floor(document.scenes.length/3)].startFrame,endFrame:Math.min(document.durationFrames,document.scenes[Math.floor(document.scenes.length/3)].startFrame+15*FPS)};await saveJSON('document.json',document);await saveJSON('quality-report.json',quality);ctx.run.verification=quality;
    if(blockers.length)throw Object.assign(Error('预览仍有严重问题，保留草稿与修复记录'),{code:'VISUAL_REVIEW_FAILED'});return quality;
  });
  const phaseTools=[['brief','brief.parse'],['observe','assets.observe'],['resources','resources.plan'],['narration','narration.prepare'],['story','story.plan'],['timing','timing.verify']];
  const kernel=new AgentKernel({registry,store,maxSteps:1200,maxModelCalls:128,onProgress:async run=>{await saveJSON('production-run.json',run);await onRun?.(run);},planner:async({run})=>{
    if(result(run,'story')?.inspectActions?.length){
      const ranges=result(run,'story').inspectActions,key='action-inspection-'+resourceHash(ranges).slice(0,16);
      if(!result(run,key)){await onStage?.('密集检查实际动作与源切点');return {kind:'tool',tool:'assets.inspect_actions',checkpoint:key,input:{ranges}};}
      const last=run.toolCalls.at(-1),lastResult=run.toolResults.at(-1);if(last?.name==='story.plan'&&lastResult?.status==='completed'&&lastResult.idempotencyKey===run.checkpoints.story.idempotencyKey&&last.input?.evidenceHash===key)return {kind:'need_user',gaps:['已核对这段密集动作证据仍无法确认必需内容，保留不确定项。']};
      return {kind:'tool',tool:'story.plan',checkpoint:'story',input:{evidenceHash:key}};
    }
    if(result(run,'story')?.blockingGaps?.length)return {kind:'need_user',gaps:result(run,'story').blockingGaps};
    if(result(run,'story')?.inspectRanges?.length){
      const ranges=result(run,'story').inspectRanges,key='story-inspection-'+resourceHash(ranges).slice(0,16);
      if(!result(run,key)){await onStage?.('补充观察导演需要的真实素材');return {kind:'tool',tool:'assets.inspect_ranges',checkpoint:key,input:{ranges}};}
      const last=run.toolCalls.at(-1),lastResult=run.toolResults.at(-1);if(last?.name==='story.plan'&&lastResult?.status==='completed'&&lastResult.idempotencyKey===run.checkpoints.story.idempotencyKey&&last.input?.evidenceHash===key)return {kind:'need_user',gaps:['已检查同一区间，当前证据仍不确定；已保留观察结果，可补充观察或调整要求。这不代表源素材没有该内容。']};
      await onStage?.('根据新增素材证据更新分镜');return {kind:'tool',tool:'story.plan',checkpoint:'story',input:{evidenceHash:key}};
    }
    if(result(run,'resources')?.blockingGaps?.length)return {kind:'need_user',gaps:result(run,'resources').blockingGaps};
    for(const [key,tool] of phaseTools)if(!result(run,key)){await onStage?.(labels[key]);return {kind:'tool',tool,checkpoint:key,input:{}};}
    kernel.maxModelCalls=Math.min(128,12+7*result(run,'story').scenes.length);
    const timingScenes=result(run,'timing').scenes,completed=timingScenes.filter((s,i)=>result(run,'shot-'+i));
    if(!result(run,'direction-preview')&&completed.length>0&&completed.length<timingScenes.length&&completed.at(-1).startFrame+completed.at(-1).durationFrames>=10*FPS){
      await onStage?.('提前检查母工程的方向预览');return {kind:'tool',tool:'project.direction_preview',checkpoint:'direction-preview',input:{}};
    }
    for(const [index] of result(run,'story').scenes.entries())if(!result(run,'shot-'+index)){await onStage?.('制作镜头 '+(index+1)+'/'+result(run,'story').scenes.length);return {kind:'tool',tool:'scene.author',checkpoint:'shot-'+index,input:{index}};}
    if(!result(run,'assemble')){await onStage?.(labels.assemble);return {kind:'tool',tool:'project.assemble',checkpoint:'assemble'};}
    if(!result(run,'quality')){await onStage?.(labels.quality);return {kind:'tool',tool:'preview.review',checkpoint:'quality'};}
    return {kind:'complete',resultRevisionId:result(run,'quality').revisionId||result(run,'assemble').revisionId,verification:result(run,'quality')};
  }});
  try{
    if(resumeRunId){
      const prior=await store.get(resumeRunId);insist(prior,'恢复任务不存在','RUN_MISSING');
      if(prior.inputFingerprint!==fingerprint){
        const proof=await readJSON('run-input.json').catch(e=>{if(e.code!=='ENOENT')throw e;return fingerprintInput;});
        const migration=verifyFingerprintMigration(prior,proof,fingerprintInput);
        await store.update(prior.id,{inputFingerprint:fingerprint,inputMigrations:[...(prior.inputMigrations||[]),migration]});
      }
      await restoreNarration(result(prior,'narration'));
      const artifacts={brief:'brief-plan.json',observe:'observations.json',resources:'resource-plan.json',story:'story-plan.json',timing:'timing-plan.json',narration:'narration.json',quality:'quality-report.json'};
      for(const [key,file]of Object.entries(artifacts))if(result(prior,key)&&(key!=='narration'||result(prior,key).enabled))insist(resourceHash(await readJSON(file))===resourceHash(result(prior,key)),'检查点产物已变更：'+file,'CHECKPOINT_HASH');
      for(const inspection of [...(prior.artifacts.storyInspections||[]),...(prior.artifacts.actionInspections||[])])for(const record of [...(inspection.records||[]),...(inspection.clips||[])]){
        insist(/^evidence\/(?:(?:inspection|action)-contact-[a-f0-9]+-\d+-\d+\.jpg|action-clip-[a-f0-9]+-\d+\.mp4)$/.test(record.file),'观察证据路径无效','CHECKPOINT_HASH');
        insist(resourceHash(await fs.readFile(path.join(outputDir,record.file)))===record.sha256,'补充观察图片已变化','CHECKPOINT_HASH');
      }
      if(result(prior,'observe')&&!Object.keys(prior.checkpoints).some(k=>/^shot-/.test(k))){
        try{validateObservations(assets,result(prior,'observe').observations);}catch(error){
          await saveJSON('observation-invalidated-'+Date.now()+'.json',{observation:result(prior,'observe'),error:{code:error.code,message:error.message}});
          for(const key of ['observe','resources','story','timing'])delete prior.checkpoints[key];
          for(const entry of prior.toolResults)if(['assets.observe','resources.plan','story.plan','timing.verify'].includes(entry.tool)&&entry.status==='completed'){entry.status='invalidated';entry.invalidation={code:error.code,message:error.message,implementationHash};}
          await store.update(prior.id,{checkpoints:prior.checkpoints,toolResults:prior.toolResults});
        }
      }
      let priorStory=result(prior,'story');
      if(priorStory?.blockingGaps?.length&&prior.artifacts.storyInspections?.length&&!prior.artifacts.actionCapabilityVersion&&!Object.keys(prior.checkpoints).some(k=>/^shot-/.test(k))){
        await saveJSON('story-before-action-capability-'+Date.now()+'.json',priorStory);prior.artifacts.actionCapabilityVersion=1;prior.artifacts.storyValidationError={code:'ACTION_OBSERVATION_AVAILABLE',message:'新增受控动作密集观察工具可用于之前无法核对的切点；旧观察、声音、模型调用计数和预算全部保留。仍缺必需资料时如实保持缺口。'};
        delete prior.checkpoints.story;for(const entry of prior.toolResults)if(entry.tool==='story.plan'&&entry.status==='completed'){entry.status='invalidated';entry.invalidation={code:'ACTION_OBSERVATION_AVAILABLE',implementationHash};}
        await store.update(prior.id,{checkpoints:prior.checkpoints,toolResults:prior.toolResults,artifacts:prior.artifacts});
      }
      if(priorStory&&!priorStory.inspectActions?.length&&!priorStory.inspectRanges?.length&&!priorStory.blockingGaps?.length&&!Object.keys(prior.checkpoints).some(k=>/^shot-/.test(k))){
        try{documentFromModelPlan(request,assets,nativePlan(prior));}catch(error){
          if(!['UNKNOWN_FACT','INVALID_SCENE_TIME','INVALID_SOURCE_RANGE','MISSING_OBSERVATION'].includes(error.code))throw error;
          await saveJSON('story-invalidated-'+Date.now()+'.json',{story:priorStory,timing:result(prior,'timing'),error:{code:error.code,message:error.message}});
          prior.artifacts.storyValidationError={code:error.code,message:error.message};
          for(const key of ['story','timing'])delete prior.checkpoints[key];
          for(const entry of prior.toolResults)if(['story.plan','timing.verify'].includes(entry.tool)&&entry.status==='completed'){entry.status='invalidated';entry.invalidation={code:error.code,message:error.message,implementationHash};}
          await store.update(prior.id,{checkpoints:prior.checkpoints,toolResults:prior.toolResults,artifacts:prior.artifacts});
        }
      }
    }
    const run=resumeRunId?await kernel.resume(resumeRunId,{signal,inputFingerprint:fingerprint}):await kernel.start({userRequest:request.message,projectId:request.projectId,inputFingerprint:fingerprint},{signal});
    if(run.status!=='completed')throw Object.assign(Error(run.error||run.gaps?.join('；')||'任务待恢复'),{code:run.code||(run.status==='needs_user'?'NEEDS_INPUT':'PRODUCTION_INCOMPLETE'),runId:run.id,gaps:run.gaps});
    return await readJSON('document.json');
  }finally{if(own)await provider.close();}
}
