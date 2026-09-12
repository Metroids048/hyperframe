import fs from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import path from 'node:path';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createHash} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {uid,EditError,insist,initialTimeline,applyOperations,validateTimeline,duration,frame,positioned,migrateTimeline,sourceStart,sourceLength} from './timeline.mjs';
import {prepareAsset,prepareSpeech,prepareAnalysis,composeRevision,checkRevision,renderRevision,run,closePreviewChecks} from './media.mjs';
import {CloudProvider} from './provider.mjs';
import {CodexProvider} from './codex-provider.mjs';
import {syncCaptionVoices} from './caption-voices.mjs';
import {ProjectStore} from './project-store.mjs';
import {measure,jobEvent} from './job-metrics.mjs';
import {skillCapabilities} from './skills.mjs';
import {executeAnalysisTool} from './analysis-tools.mjs';
import {fastIntent} from './fast-intents.mjs';
import {localEditIntent} from './local-edit-intents.mjs';
import {exportProjectZip} from './zip-export.mjs';
import {shutdownSpeechWorkers} from './speech-worker.mjs';
import {importGeneratedMedia} from './generation-import.mjs';
import {parseRevisionNumber,undoNavigation,redoNavigation} from './revision-history.mjs';

const activeStates=['queued','running'];
const clone=x=>structuredClone(x);
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function createEditService({dataDir=process.env.VIDEO_AGENT_EDIT_DATA_DIR||path.join(ROOT,'data/edit-projects'),provider=process.env.VIDEO_AGENT_EDIT_PROVIDER==='openai'?new CloudProvider():new CodexProvider(),configFile=process.env.VIDEO_AGENT_EDIT_CONFIG_FILE||path.join(ROOT,'config/edit.local.json'),mediaEngine={prepareAsset,prepareSpeech,prepareAnalysis,composeRevision,checkRevision,renderRevision,run}}={}) {
  const {prepareAsset,prepareAnalysis,composeRevision,checkRevision,renderRevision,run}=mediaEngine;
  const prepareAudio=mediaEngine.prepareSpeech||prepareAnalysis;
  if(provider instanceof CloudProvider&&!(provider instanceof CodexProvider))try{provider.settings=JSON.parse(await fs.readFile(configFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new EditError('本机模型配置无法读取');}
  const projects=new Map(),controllers=new Map(),reserved=new Set(),activeProjects=new Set(),activeImportProjects=new Set(),runningTasks=new Set();
  const store=new ProjectStore(dataDir);let pumping=false,running=0,importing=0,rendering=0,closed=false;
  const maxJobs=Math.max(1,Math.min(4,Number(process.env.VIDEO_AGENT_JOB_CONCURRENCY)||2));
  await fs.mkdir(dataDir,{recursive:true});
  const projectDir=id=>path.join(dataDir,id);
  const assetDir=(pid,id)=>path.join(projectDir(pid),'assets',id);
  const revisionDir=(pid,id)=>path.join(projectDir(pid),'revisions',id);
  async function save(p,event){return store.save(p,event);}
  for(const p of await store.load()){
    let changed=false;
    for(const j of p.jobs)if(activeStates.includes(j.status)){
      if(j.committedAt&&p.revisions.some(r=>r.id===j.revisionId)){j.status='complete';j.stage='已恢复已提交的修改';j.progress=100;}
      else{j.status='interrupted';j.error='服务重启中断任务，可以从保留的输入重试';}
      j.completedAt=new Date().toISOString();changed=true;
    }
    projects.set(p.id,p);if(changed)await save(p,{type:'recovered',revisionId:p.currentRevisionId});
  }
  function get(id) {const p=projects.get(id);if(!p)throw new EditError('编辑项目不存在',404);return p;}
  const editingJob=j=>!['render','asset'].includes(j.kind);
  const initialImportBusy=p=>!p.currentRevisionId&&(reserved.has(p.id)||p.jobs.some(j=>j.kind==='asset'&&activeStates.includes(j.status)));
  function busy(p) {return connecting||initialImportBusy(p)||p.jobs.some(j=>editingJob(j)&&activeStates.includes(j.status));}
  function checkBase(p,base) {if(p.currentRevisionId!==base)throw new EditError('视频版本已变化，请刷新后重试；查看历史版本时请先恢复该版本',409);}
  function view(p) {
    const safe=clone(p);for(const j of safe.jobs)delete j.payload;
    for(const a of Object.values(safe.assets)) {a.mediaUrl=`/api/edit-projects/${p.id}/assets/${a.id}/media`;a.thumbnailUrl=a.thumbnails?.length?`/api/edit-projects/${p.id}/assets/${a.id}/thumb/0`:null;}
    for(const r of safe.revisions){const base=`/api/edit-projects/${p.id}/revisions/${r.id}`;r.previewUrl=base+'/preview.html';r.videoUrl=r.render?.status==='complete'?base+'/video':null;r.subtitlesUrl=base+'/subtitles';r.packageUrl=r.render?.status==='complete'?base+'/package':null;}
    return safe;
  }
  function capabilities(){return {...provider.status(),verifiedAt:provider.verifiedAt||[...projects.values()].flatMap(p=>p.jobs).filter(j=>j.cloudVerifiedAt).map(j=>j.cloudVerifiedAt).sort().at(-1)||null,maxFileBytes:1024**3,maxDuration:600,fps:30,engine:'HyperFrames 0.8.33',timelineSchemaVersions:[1,2],defaultAutoExport:false,localTools:['trim','reorder','speed','crop','overlay','transition','caption','audio','versions','export'],...skillCapabilities()};}
  let connectedAt=provider.settings?.verifiedAt||null,connecting=false;
  async function connect(input) {
    if(provider instanceof CodexProvider){await provider.refreshLogin?.();await provider.structured('只输出 ok=true',[{role:'user',content:'验证视频剪辑订阅连接'}],{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});connectedAt=provider.verifiedAt;return {...capabilities(),verifiedAt:connectedAt};}
    insist(provider instanceof CloudProvider,'当前运行模式不能修改模型连接');
    insist(!connecting,'正在验证连接，请稍候');
    insist(typeof input.apiKey==='string'&&input.apiKey.length>=16&&input.apiKey.length<=512&&!/\s/.test(input.apiKey),'请填写有效的 API Key');
    const model=input.model||provider.status().model;insist(typeof model==='string'&&/^[a-zA-Z0-9._:-]{1,100}$/.test(model),'模型名称无效');
    insist(![...projects.values()].some(busy),'请等待当前剪辑任务结束，再更换模型');
    connecting=true;
    try {
      const settings={apiKey:input.apiKey,model},candidate=new CloudProvider(settings);
      await candidate.structured('Return ok=true.',[{role:'user',content:'Test connection.'}],{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});
      settings.verifiedAt=new Date().toISOString();await fs.mkdir(path.dirname(configFile),{recursive:true});await fs.writeFile(configFile+'.tmp',JSON.stringify(settings),{mode:0o600});await fs.rename(configFile+'.tmp',configFile);
      provider.settings=settings;connectedAt=settings.verifiedAt;return {...capabilities(),verifiedAt:connectedAt};
    }finally{connecting=false;}
  }
  async function create(name='未命名视频',initialText='') {
    insist(typeof name==='string'&&name.length<=160,'项目名称过长');const id=uid();
    insist(typeof initialText==='string'&&initialText.length<=6000,'修改想法最多 6000 个字符');
    const p={id,type:'video-edit',schemaVersion:2,name:name.trim()||'未命名视频',initialText:initialText.trim(),assets:{},revisions:[],currentRevisionId:null,messages:[],jobs:[],createdAt:new Date().toISOString()};projects.set(id,p);await save(p,{type:'created'});return view(p);
  }
  async function enqueue(p,kind,payload,key) {
    insist(typeof key==='string'&&key.length>=8&&key.length<=160,'请提供有效的幂等键');
    const hash=fingerprint({kind,payload}),found=p.jobs.find(j=>j.key===key);
    if(found){if(found.hash!==hash)throw new EditError('重复请求键对应不同内容',409);return clone(found);}
    if(kind==='render'){
      insist(p.revisions.some(r=>r.id===payload.revisionId),'导出版本不存在');
      const shared=p.jobs.find(j=>j.kind==='render'&&j.payload.revisionId===payload.revisionId&&activeStates.includes(j.status));
      if(shared)return clone(shared);
    }
    const deferred=kind==='edit'&&payload.afterCurrent===true;
    if(!['render','asset'].includes(kind)&&busy(p)&&!deferred)throw new EditError('这个项目有任务正在处理，请完成或取消后再修改',409);
    if(deferred){insist(!payload.selection,'排队指令请用文字描述；选中范围需要等当前修改完成后重新选择');insist(p.jobs.filter(j=>activeStates.includes(j.status)).length<8,'最多排队 8 个任务，请稍候');}
    if(['edit','operations','restore'].includes(kind)&&!deferred)checkBase(p,payload.baseRevisionId);
    const j={id:uid(),key,hash,kind,payload:clone(payload),...(kind==='render'?{revisionId:payload.revisionId}:{}),afterJobId:deferred?p.jobs.filter(j=>(editingJob(j)||(!p.currentRevisionId&&j.kind==='asset'))&&activeStates.includes(j.status)).at(-1)?.id:null,status:'queued',stage:'等待处理',progress:0,createdAt:new Date().toISOString(),metrics:{stages:[],modelCalls:0,cacheHits:0}};p.jobs.push(j);
    if(kind==='edit')p.messages.push({id:uid(),role:'user',text:payload.text,revisionId:payload.baseRevisionId,jobId:j.id});
    await save(p,jobEvent(j));void pump();return clone(j);
  }
  async function upload(p,req,name,key) {
    insist(typeof key==='string'&&key.length>=8&&key.length<=160,'请提供有效的幂等键');
    const existing=p.jobs.find(j=>j.key===key);if(existing){insist(existing.kind==='asset'&&p.assets[existing.payload.assetId]?.name===name,'重复请求键对应不同素材');req.resume();return clone(existing);}
    if(reserved.has(p.id))throw new EditError('另一个文件正在上传，请稍候',409);
    const ext=path.extname(name).toLowerCase();insist(['.mp4','.mov','.webm','.mp3','.wav','.m4a'].includes(ext),'请选择 MP4、MOV、WebM、MP3、WAV 或 M4A');
    insist(Object.keys(p.assets).length<30,'一个项目最多 30 个素材');
    const id=uid(),dir=assetDir(p.id,id);reserved.add(p.id);await fs.mkdir(dir,{recursive:true});
    const original='original'+ext,temporary=path.join(dir,'upload.part');let size=0;
    try {
      const limit=new Transform({transform(chunk,encoding,cb){size+=chunk.length;cb(size>1024**3?new EditError('单个文件不能超过 1 GB',413):null,chunk);}});
      await pipeline(req,limit,createWriteStream(temporary,{flags:'wx'}));insist(size>0,'上传文件为空');await fs.rename(temporary,path.join(dir,original));
      p.assets[id]={id,name:name.slice(0,160),original,status:'pending',size,createdAt:new Date().toISOString()};await save(p);
    }catch(e){await fs.rm(temporary,{force:true}).catch(()=>{});throw e;}finally{reserved.delete(p.id);}
    return enqueue(p,'asset',{assetId:id},key);
  }
  async function importFile(source,name,{initialText='',originProjectId=null,sampleId=null,sampleContext=null}={}) {
    let sourceHash=null;
    if(originProjectId){
      const hash=createHash('sha256');for await(const chunk of createReadStream(source))hash.update(chunk);sourceHash=hash.digest('hex');
      const found=[...projects.values()].find(p=>p.originProjectId===originProjectId&&(p.originSourceHash===sourceHash||Object.values(p.assets).some(a=>a.kind==='video'&&a.sha256===sourceHash)));if(found)return view(found);
      // Reconnect only the same bytes; a newly generated source gets its own editable history.
      const same=[...projects.values()].filter(p=>!p.originProjectId&&!p.sampleId&&Object.values(p.assets).some(a=>a.kind==='video'&&a.sha256===sourceHash)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
      if(same){same.originProjectId=originProjectId;same.originSourceHash=sourceHash;await save(same);return view(same);}
    }
    const created=await create(name.replace(/\.[^.]+$/,''),initialText),p=get(created.id);p.originProjectId=originProjectId;p.originSourceHash=sourceHash;p.sampleId=sampleId;p.sampleContext=sampleContext;await save(p);
    await upload(p,createReadStream(source),name,'import-'+p.id);return view(p);
  }
  async function update(j,p,stage,progress){j.stage=stage;j.progress=progress;await save(p,jobEvent(j));}
  async function copyTree(src,dst){
    await fs.mkdir(dst,{recursive:true});
    for(const e of await fs.readdir(src,{withFileTypes:true})){
      if(e.name.endsWith('.tmp')||['video.mp4','project.zip','revision.json','checks.json'].includes(e.name))continue;
      const from=path.join(src,e.name),to=path.join(dst,e.name);
      if(e.isDirectory())await copyTree(from,to);
      else if(e.isFile()){if(/\.(mp4|m4a|wav|mp3|jpg|png|woff2)$/.test(e.name)){try{await fs.link(from,to);continue;}catch{}}await fs.copyFile(from,to);}
    }
  }
  async function newRevision(p,t,parent,description,ops,j,signal,{reuse=null,verify=null,navigation=null}={}){
    t=migrateTimeline(t);validateTimeline(t,p.assets);
    const id=uid(),dir=path.join(projectDir(p.id),'staging',id),destination=revisionDir(p.id,id);
    await fs.mkdir(dir,{recursive:true});let media,quality={level:'preview',status:'passed'};
    if(reuse&&reuse.timeline.schemaVersion===2){
      await update(j,p,'恢复已缓存的版本',65);await measure(j,'restore_cache',()=>copyTree(revisionDir(p.id,reuse.id),dir));
      media=clone(reuse.media);j.metrics.cacheHits++;quality={...(reuse.quality||quality),reusedFrom:reuse.id};
    }else{
      await update(j,p,'更新画面与声音',65);media=await measure(j,'compose',()=>composeRevision(dir,t,p.assets,asset=>assetDir(p.id,asset),signal));
      await update(j,p,'检查修改位置',82);await measure(j,'preview_check',()=>checkRevision(dir,signal,{mode:'preview',timeline:t,operations:ops}));
    }
    const r={id,number:p.revisions.length+1,parentId:parent,timeline:t,description,operations:clone(ops),media,quality,...(navigation?{navigation:clone(navigation)}:{}),createdAt:new Date().toISOString(),render:{status:'pending'}};
    if(verify){const result=await measure(j,'quality_review',()=>verify(r,dir));r.quality.review=result;insist(result.passed,result.repairInstructions||result.issues?.map(x=>x.message).join('；')||'修改结果未通过内容检查');}
    if(signal.aborted)throw new EditError('任务已取消',409);
    checkBase(p,parent);
    await fs.writeFile(path.join(dir,'revision.json'),JSON.stringify(r,null,2));
    await fs.writeFile(path.join(dir,'checks.json'),JSON.stringify({timeline:'passed',preview:'ready',fullCheck:'pending',render:'pending',quality:r.quality,checkedAt:new Date().toISOString()},null,2));
    await fs.mkdir(path.dirname(destination),{recursive:true});
    // On Windows Chromium can briefly retain a directory handle after check.
    // Publishing immutable files into an unreferenced destination avoids making
    // a successful edit depend on renaming that open directory. The metadata
    // pointer below remains the only commit point.
    if(process.platform==='win32'){
      await copyTree(dir,destination);
      for(const name of ['revision.json','checks.json'])await fs.copyFile(path.join(dir,name),path.join(destination,name));
    }else await fs.rename(dir,destination);
    // Metadata pointer is the commit point. A crash before this save leaves an
    // unreferenced directory; a crash after it recovers this job as complete.
    const old=p.currentRevisionId;
    p.revisions.push(r);p.currentRevisionId=id;j.revisionId=id;j.committedAt=new Date().toISOString();
    try{await save(p,{type:'revision',jobId:j.id,revisionId:id,status:'preview_ready'});}
    catch(error){p.revisions.pop();p.currentRevisionId=old;delete j.revisionId;delete j.committedAt;throw error;}
    if(process.platform==='win32')await fs.rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}).catch(()=>{});
    return r;
  }
  async function voiceOperations(p,base,ops,j,signal) {
    insist(Array.isArray(ops)&&ops.length>0&&ops.length<=2000,'一次支持 1～2000 项编辑指令');
    const result=[];
    const layoutOps=ops.filter(o=>['delete_range','keep_ranges','split','move','insert','clip_speed','transition'].includes(o.type));
    const finalLength=layoutOps.length?duration(applyOperations(base.timeline,layoutOps,p.assets)):duration(base.timeline);
    for(const op of [...ops.filter(o=>o.type!=='caption_transcript'),...ops.filter(o=>o.type==='caption_transcript')]) {
      if(op.type==='caption_transcript') {
        const captionStart=result.length;
        await update(j,p,'正在转写讲话并对齐字幕',45);
        // Newly generated/replaced voices must be available to captions in this same request.
        const audioOps=result.filter(o=>['audio_add','audio_update','audio_remove'].includes(o.type));
        const resolvedOps=result.filter(o=>o.type!=='caption_transcript'),audioState=resolvedOps.length?applyOperations(base.timeline,resolvedOps,p.assets):base.timeline;
        const newVoiceIds=new Set(audioOps.filter(o=>o.assetId&&(o.role==='voice'||base.timeline.audio.some(c=>(c.id===o.id||c.groupId===o.id)&&c.role==='voice'))).map(o=>o.assetId));
        if(op.assetId==='new_voice')insist(newVoiceIds.size,'本轮没有新生成的旁白可添加字幕');
        let requestedAsset=op.assetId;for(const edit of audioOps.filter(o=>o.type==='audio_update'&&o.assetId)){const old=base.timeline.audio.find(c=>c.id===edit.id||c.groupId===edit.id);if(old?.assetId===requestedAsset)requestedAsset=edit.assetId;}
        const spoken=[...positioned(audioState.clips),...audioState.audio.filter(c=>c.role==='voice').map(c=>({...c,out:Math.ceil(sourceStart(c)+(c.sourceDuration??((c.end-c.start)*(c.rate||1))))}))];
        for(const c of spoken.filter(c=>c.gain>0&&(!requestedAsset||c.assetId===requestedAsset||(requestedAsset==='new_voice'&&newVoiceIds.has(c.assetId))))) {
          const a=p.assets[c.assetId];if(!a.hasAudio)continue;
          // The generated script is already known: avoid an unnecessary ASR round trip.
          if(a.generated&&a.text&&a.text.length<=240&&sourceStart(c)<1e-6&&sourceLength(c)>=a.frames-1){const groupId=uid();result.push({type:'caption_add',id:groupId,groupId,start:c.start,end:c.end,text:a.text,position:'bottom',sourceSpoken:true,audioId:c.id,sourceAssetId:a.id,voicePolicy:'linked',anchor:'source',coordinateSpace:'result'});continue;}
          if(!a.analysis?.transcript){await measure(j,'prepare_speech',()=>prepareAudio(assetDir(p.id,a.id),a,signal));const transcript=await measure(j,'transcribe',()=>provider.transcribe(path.join(assetDir(p.id,a.id),a.speech),signal));a.analysis={...(a.analysis||{}),transcript};j.cloudVerifiedAt=new Date().toISOString();await save(p);}
          const sourceIn=sourceStart(c),sourceOut=sourceIn+sourceLength(c),words=a.analysis.transcript.words.filter(w=>frame(w.end)>sourceIn&&frame(w.start)<sourceOut);let group=[];
          function flush(){if(!group.length)return;const rate=c.rate||1,start=c.start+Math.round((Math.max(sourceIn,frame(group[0].start))-sourceIn)/rate),end=Math.min(c.end,c.start+Math.round((Math.min(sourceOut,frame(group.at(-1).end))-sourceIn)/rate));if(end>start)result.push({type:'caption_add',start,end,text:group.map((w,i)=>(i&&/^[a-z0-9]/i.test(w.text)?' ':'')+w.text).join(''),position:'bottom',sourceSpoken:true,sourceAssetId:a.id,anchor:'source',coordinateSpace:'result',...(audioState.clips.some(x=>x.id===c.id)?{anchorClipId:c.id}:{})});group=[];}
          for(const w of words){if(group.length&&(group.reduce((s,x)=>s+x.text.length,0)+w.text.length>24||w.start-group.at(-1).end>0.4||w.end-group[0].start>3))flush();group.push(w);}flush();
        }
        insist(result.length>captionStart,'没有检测到可生成字幕的讲话。可以添加画面说明，或换用有讲话的素材。');
        const targetLanguage=String(op.language||'source').trim().toLowerCase();
        const captionRows=result.slice(captionStart).map(c=>({...c,id:c.id||uid()}));
        // Trust recorded ASR language or an unambiguous, entirely Chinese known
        // narration script. Mixed scripts still go through translation.
        const needsTranslation=captionRows.filter(c=>{const a=p.assets[c.sourceAssetId],sourceLanguage=a?.analysis?.transcript?.language||(a?.generated&&/[\p{Script=Han}]/u.test(a.text||'')&&!/[\p{Script=Latin}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(a.text||'')?'zh':null);return targetLanguage!=='source'&&sourceLanguage!==targetLanguage;});
        if(needsTranslation.length){
          insist(typeof provider.translateCaptions==='function','字幕翻译需要连接支持翻译的模型，请连接模型后重试');
          await update(j,p,'正在翻译字幕并保留原有时间',50);
          const captions=needsTranslation;
          const translated=await measure(j,'translate_captions',()=>provider.translateCaptions(captions,op.language,signal));
          insist(Array.isArray(translated.captions)&&translated.captions.length===captions.length&&translated.captions.every((c,i)=>c.id===captions[i].id&&typeof c.text==='string'&&c.text.trim()),'字幕翻译结果不完整，当前视频未修改');
          const texts=new Map(translated.captions.map(c=>[c.id,c.text]));
          result.splice(captionStart,captionRows.length,...captionRows.map(c=>({...c,text:texts.get(c.id)??c.text})));
          j.metrics.modelCalls+=translated.metrics?.modelCalls||0;j.translationUsage??=[];j.translationUsage.push({model:translated.model,usage:translated.usage,targetLanguage:translated.targetLanguage});
          if(translated.toolCalls?.length){j.toolCalls??=[];j.toolCalls.push(...translated.toolCalls);}j.cloudVerifiedAt=new Date().toISOString();
        }
        continue;
      }
      if(op.type!=='voiceover'){
        if(op.type==='audio_add'&&op.role==='music'&&op.duck){
          for(const c of [...base.timeline.clips,...(base.timeline.overlays||[])]){const a=p.assets[c.assetId];if(c.gain>0&&a.hasAudio&&!a.analysis?.transcript&&!a.analysis?.speechActivity){await update(j,p,'识别人声区间，自动压低配乐',45);await measure(j,'prepare_speech',()=>prepareAudio(assetDir(p.id,a.id),a,signal));const activity=typeof provider.detectSpeech==='function'?{speechActivity:await measure(j,'detect_speech',()=>provider.detectSpeech(path.join(assetDir(p.id,a.id),a.speech),signal))}:{transcript:await measure(j,'transcribe',()=>provider.transcribe(path.join(assetDir(p.id,a.id),a.speech),signal))};a.analysis={...(a.analysis||{}),...activity};await save(p);}}
        }
        result.push(op);continue;
      }
      const previous=op.id?base.timeline.audio.find(a=>a.id===op.id||a.groupId===op.id):null;
      if(op.id)insist(previous,'要替换的旁白已不存在');
      const start=op.start??previous?.start??0,signature=fingerprint({text:op.text,voice:op.voice||'marin',instructions:op.instructions||'',rate:op.rate||1});
      let a=Object.values(p.assets).find(a=>a.voiceSignature===signature&&a.status==='ready');
      if(!a) {
        await update(j,p,'正在生成旁白',40);const wav=await measure(j,'synthesize_speech',()=>provider.speak(op.text,op.voice,op.instructions,signal,{rate:op.rate||1}));j.cloudVerifiedAt=new Date().toISOString();
        const id=uid(),dir=assetDir(p.id,id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'original.wav'),wav);
        a={id,name:'旁白 · '+op.text.slice(0,24),original:'original.wav',status:'pending',voiceSignature:signature,generated:true,voice:provider.lastSpeechMetrics?.voice||op.voice||'default',voiceModel:provider.status().voiceModel,rate:op.rate??1,instructions:op.instructions||'',text:op.text};
        await measure(j,'prepare_voice',()=>prepareAsset(dir,a,signal));p.assets[id]=a;await save(p);
      }
      const end=start+a.frames;
      if((op.end!==undefined&&end>op.end)||end>(op.anchor==='timeline'?finalLength:duration(base.timeline)))throw new EditError(`这段旁白实际长 ${(a.frames/30).toFixed(2)} 秒，当前时间范围放不下。请缩短台词或给它更长的时间。`,409);
      if(previous)result.push({type:'audio_update',id:op.id,assetId:a.id,in:0,start,end,text:op.text,role:'voice',anchor:op.anchor||previous.anchor||'source'});
      else {const id=uid();result.push({type:'audio_add',id,groupId:id,assetId:a.id,in:0,start,end,text:op.text,role:'voice',gain:1,duck:false,fadeIn:0,fadeOut:3,anchor:op.anchor||'source'});}
    }
    return result;
  }
  async function prepareRequestedMusic(p,j,signal) {
    if(!/(?:背景音乐|配乐|背景乐|\bbgm\b|\bmusic\b|\bsoundtrack\b)/i.test(j.payload.text)||Object.values(p.assets).some(a=>a.builtin==='music'))return;
    const source=path.join(ROOT,'assets/music.wav');
    try{await fs.access(source);}catch(error){if(error.code==='ENOENT')return;throw error;}
    const id=uid(),dir=assetDir(p.id,id);await fs.mkdir(dir,{recursive:true});await fs.copyFile(source,path.join(dir,'original.wav'));
    const music={id,name:'轻快背景音乐（内置）',original:'original.wav',builtin:'music',status:'pending'};
    await update(j,p,'准备可选配乐素材',20);await measure(j,'prepare_music',()=>prepareAsset(dir,music,signal));
    music.analysis={summary:'内置合成纯音乐；只有明确选择后才会加入时间轴',scenes:[],transcript:{text:'',words:[],segments:[],status:'no_speech'}};
    p.assets[id]=music;await save(p);
  }
  async function execute(p,j,signal) {
    const payload=j.payload;
    if(j.kind==='asset') {
      const a=p.assets[payload.assetId];await update(j,p,'正在读取视频与音频',8);
      if(a.status!=='ready')await measure(j,'prepare_asset',()=>prepareAsset(assetDir(p.id,a.id),a,signal));await save(p);
      if(!p.currentRevisionId&&a.kind==='video')await newRevision(p,initialTimeline(a),null,'导入原视频',[],j,signal);
      // Import publishes a playable original first. Content analysis is requested by the planner only when needed.
      return;
    }
    if(j.kind==='analyze') {
      const targets=Object.values(p.assets).filter(a=>a.status==='ready'&&(!payload.assetId||a.id===payload.assetId));insist(targets.length,'没有可分析的素材');
      for(const a of targets){await update(j,p,`正在分析 ${a.name}`,25);await measure(j,'prepare_analysis',()=>prepareAnalysis(assetDir(p.id,a.id),a,signal));a.analysis=await measure(j,'analyze',()=>provider.analyze(a,assetDir(p.id,a.id),signal));delete a.analysisError;j.cloudVerifiedAt=new Date().toISOString();await save(p);}return;
    }
    if(j.kind==='render') {
      const r=p.revisions.find(r=>r.id===payload.revisionId);insist(r,'导出版本不存在');const dir=revisionDir(p.id,r.id);
      if(r.render.status==='complete'){j.revisionId=r.id;return;}
      r.render={status:'running'};await update(j,p,'正在导出 MP4',10);
      try{
        let lastProgress=0,renderPercent=0;
        await update(j,p,'完整检查当前导出版本',5);
        await measure(j,'full_check',()=>checkRevision(dir,signal,{mode:'full',timeline:r.timeline,operations:r.operations}));
        const media=await measure(j,'render',()=>renderRevision(dir,r.timeline,signal,text=>{const matches=[...text.matchAll(/(\d+)%/g)];if(matches.length&&Date.now()-lastProgress>1200){lastProgress=Date.now();const percent=Math.max(renderPercent,Math.min(100,Number(matches.at(-1)[1])));renderPercent=percent;j.progress=10+Math.floor(percent*.8);j.stage=`正在导出 MP4 · ${percent}%`;void save(p,jobEvent(j));}}));await update(j,p,'核对成片与打包工程',92);
        insist(media.hasAudio===r.media.hasAudio,'成片音轨与时间轴不一致');
        await fs.writeFile(path.join(dir,'checks.json'),JSON.stringify({hyperframes:'passed',timeline:'passed',render:'passed',media,checkedAt:new Date().toISOString()},null,2));
        const complete={status:'complete',media,completedAt:new Date().toISOString()},quality={...(r.quality||{}),level:'full',status:'passed'};
        await fs.writeFile(path.join(dir,'revision.json'),JSON.stringify({...r,render:complete,quality},null,2));
        // Include the verified metadata in the downloadable project. A package
        // failure leaves this export retryable and never changes the preview.
        const packageFiles=['index.html','preview.template','assets','timeline.json','subtitles.srt','manifest.json','revision.json','checks.json','check.log','DESIGN.md','hyperframes.json'];
        const present=[];for(const name of packageFiles)if(await fs.access(path.join(dir,name)).then(()=>true).catch(()=>false))present.push(name);
        await measure(j,'package',()=>exportProjectZip(dir,present,{signal}));
        r.render=complete;r.quality=quality;j.revisionId=r.id;
        p.messages.push({id:uid(),role:'assistant',text:`第 ${r.number} 版已导出，可以下载 MP4。`,revisionId:r.id,jobId:j.id});
      }catch(e){r.render={status:signal.aborted?'cancelled':'failed',error:e.message};throw e;}return;
    }
    if(j.kind==='edit'&&payload.afterCurrent){
      const previous=p.jobs.find(x=>x.id===j.afterJobId);
      if(previous&&previous.status!=='complete'){j.status='needs_input';j.question='前一项任务没有完成，这条排队指令已保留。请确认当前视频后重新发送。';p.messages.push({id:uid(),role:'assistant',text:j.question,jobId:j.id,revisionId:p.currentRevisionId});return;}
      payload.baseRevisionId=p.currentRevisionId;const message=p.messages.find(m=>m.jobId===j.id&&m.role==='user');if(message)message.revisionId=p.currentRevisionId;
    }
    checkBase(p,payload.baseRevisionId);const base=p.revisions.find(r=>r.id===payload.baseRevisionId);insist(base,'请先导入视频');
    if(j.kind==='restore') {
      const target=p.revisions.find(r=>r.id===payload.revisionId);insist(target,'历史版本不存在');
      // Reuse immutable media; restore remains a new, reversible revision.
      await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target,navigation:{restoredFromId:target.id,redoStack:[]}});return;
    }
    let ops=payload.operations,summary=payload.description||'精确编辑',answer=null,planningProject=null;
    if(j.kind==='edit') {
      const clean=payload.text.trim(),undo=/^(撤销(上一步|刚才的修改)?|回到上一版)[。！!\s]*$/.test(clean),redo=/^(重做|恢复撤销|撤销的撤销)[。！!\s]*$/.test(clean);
      const match=/^回到第([\d零〇一二两三四五六七八九十百千]+)版[。！!\s]*$/.exec(clean);
      if(undo||redo||match) {
        let resolved;
        if(undo)resolved=undoNavigation(p.revisions,base);
        else if(redo)resolved=redoNavigation(p.revisions,base);
        else {const n=parseRevisionNumber(match[1]);insist(n,'版本号无法识别，请使用 1～9999 的阿拉伯数字或中文整数');const target=p.revisions.find(r=>r.number===n);resolved=target?{target,navigation:{restoredFromId:target.id,redoStack:[]}}:null;}
        insist(resolved?.target,redo?'没有可以重做的版本':undo?'已经是最早可撤销的内容':'找不到要恢复的版本');
        const {target,navigation}=resolved;await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target,navigation});p.messages.push({id:uid(),role:'assistant',text:`已恢复到第 ${target.number} 版的内容。`,revisionId:j.revisionId,jobId:j.id});return;
      }
      await prepareRequestedMusic(p,j,signal);
      const messageIndex=p.messages.findIndex(m=>m.jobId===j.id&&m.role==='user');planningProject={...p,messages:messageIndex>=0?p.messages.slice(0,messageIndex+1):p.messages};
      await update(j,p,'正在理解修改要求',25);answer=await planRequest();
      for(let pass=0;pass<2&&(answer.result.analysisRequired||answer.result.toolRequests?.length);pass++){
        for(const request of answer.result.toolRequests||[]){
          if(request.tool==='generate_media'){
            const signature=fingerprint(request);j.generatedAssets??={};const existing=p.assets[j.generatedAssets[signature]];
            if(existing?.status==='ready'){j.metrics.cacheHits++;continue;}
            insist(Object.keys(p.assets).length<30,'一个项目最多 30 个素材');await update(j,p,'正在生成并导入新素材',35);
            const result=await measure(j,'generate_media',()=>importGeneratedMedia(request,{assetRoot:path.join(projectDir(p.id),'assets'),prepare:prepareAsset,signal}));
            p.assets[result.asset.id]=result.asset;j.generatedAssets[signature]=result.asset.id;j.toolCalls??=[];j.toolCalls.push(result.toolCall);await save(p);continue;
          }
          const a=p.assets[request.assetId];insist(a?.status==='ready','请求分析的素材不存在或尚未就绪');
          await update(j,p,request.tool==='detect_silence'?'查找可剪的停顿':'查找镜头边界',35);
          const result=await measure(j,request.tool,()=>executeAnalysisTool(request,a,assetDir(p.id,a.id),signal));
          insist(result.status==='completed',result.error||'这项分析工具尚未配置');
          a.analysis={...(a.analysis||{}),...(request.tool==='detect_silence'?{silence:result.data}:{scenesIndex:result.data})};
          j.toolCalls??=[];j.toolCalls.push(result.toolCall||{tool:request.tool,assetId:a.id,status:result.status});await save(p);
        }
        if(answer.result.analysisRequired)for(const a of Object.values(p.assets).filter(a=>a.status==='ready'&&a.kind==='video'&&!a.analysis?.scenes)){
          await update(j,p,`正在理解 ${a.name} 的画面和声音`,35);await measure(j,'prepare_analysis',()=>prepareAnalysis(assetDir(p.id,a.id),a,signal));
          a.analysis={...(a.analysis||{}),...await measure(j,'analyze',()=>provider.analyze(a,assetDir(p.id,a.id),signal))};await save(p);
        }
        await update(j,p,'正在安排剪辑',50);answer=await planRequest();
      }
      insist(!answer.result.analysisRequired&&!answer.result.toolRequests?.length,'内容索引仍不足以完成这次修改，请指定片段或时间范围');
      if(answer.model)j.cloudVerifiedAt=new Date().toISOString();j.usage=answer.usage;j.model=answer.model;j.executionMode=answer.executionMode||'model';
      if(answer.result.clarification){j.status='needs_input';j.question=answer.result.clarification;p.messages.push({id:uid(),role:'assistant',text:j.question,jobId:j.id,revisionId:base.id});return;}
      if(answer.result.action==='export'){
        j.revisionId=base.id;j.exportRequested=true;
        p.messages.push({id:uid(),role:'assistant',text:`开始导出第 ${base.number} 版，你可以继续修改视频。`,jobId:j.id,revisionId:base.id});return;
      }
      ops=answer.result.operations;summary=answer.result.summary;
    }
    const requestedOps=clone(ops);
    for(let attempt=0;attempt<3;attempt++){
      try{
        ops=await voiceOperations(p,base,ops,j,signal);let t=applyOperations(base.timeline,ops,p.assets);
        t=await syncCaptionVoices(t,base.timeline,ops,async(text,voiceOptions={})=>{
          const generated=await voiceOperations(p,{...base,timeline:t},[{type:'voiceover',text,start:0,voice:voiceOptions.voice,rate:voiceOptions.rate||1,instructions:voiceOptions.instructions||''}],j,signal);
          return p.assets[generated[0].assetId];
        },{assets:p.assets});
        checkBase(p,payload.baseRevisionId);
        const contentReview=answer?.result.contentBased&&typeof provider.verifyEdit==='function';
        await newRevision(p,t,base.id,summary,ops,j,signal,{verify:contentReview?(draft,dir)=>provider.verifyEdit(p,draft,payload.text,{signal,beforeRevision:base,planResult:answer.result,revisionDir:dir}):null});
        break;
      }catch(error){
        if(signal.aborted||j.committedAt||!answer||attempt===2||error.status===503||answer.executionMode==='exact-local-intent')throw error;
        await update(j,p,`正在修正剪辑方案（${attempt+1}/2）`,55);j.repairCount=attempt+1;
        answer=await planRequest({repairContext:{error:error.message,previousOperations:ops,originalOperations:requestedOps}});
        if(answer.result.clarification){j.status='needs_input';j.question=answer.result.clarification;p.messages.push({id:uid(),role:'assistant',text:j.question,jobId:j.id,revisionId:base.id});return;}
        insist(!answer.result.analysisRequired&&!answer.result.toolRequests?.length,'修改需要补充素材分析，请明确片段后重试');
        ops=answer.result.operations;summary=answer.result.summary;
      }
    }
    p.messages.push({id:uid(),role:'assistant',text:summary,revisionId:j.revisionId,jobId:j.id});
    async function planRequest(options){
      if(!options?.repairContext){const local=fastIntent(base,payload.text,payload.selection)||localEditIntent(base,payload.text,payload.selection);if(local){j.selectedSkills=local.selectedSkills;j.planningMetrics=local.metrics;j.toolCalls??=[];j.toolCalls.push(...local.toolCalls);await update(j,p,'正在执行精确修改',50);return local;}}
      await provider.refreshLogin?.();
      if(!provider.status().configured)throw new EditError('模型连接尚未就绪。点击“连接模型”完成连接后，点“重试”继续这次修改；视频和指令已保存。',503);
      const result=await measure(j,'plan',()=>provider.plan(planningProject,base,payload.text,payload.selection,id=>assetDir(p.id,id),signal,options));
      j.metrics.modelCalls+=result.metrics?.modelCalls||1;j.planningMetrics=result.metrics||null;j.selectedSkills=result.selectedSkills||[];
      if(result.toolCalls?.length){j.toolCalls??=[];j.toolCalls.push(...result.toolCalls);}
      return result;
    }
  }
  async function pump() {
    if(pumping||closed)return;pumping=true;
    try{
      for(const p of projects.values()){
        if(running<maxJobs&&!activeProjects.has(p.id)&&!initialImportBusy(p)){
          const j=p.jobs.find(j=>j.status==='queued'&&editingJob(j));
          if(j){running++;activeProjects.add(p.id);j.status='running';launch(p,j);}
        }
      }
      for(const p of projects.values())if(importing<maxJobs&&!activeImportProjects.has(p.id)&&!reserved.has(p.id)){
        const j=p.jobs.find(j=>j.status==='queued'&&j.kind==='asset');
        if(j){importing++;activeImportProjects.add(p.id);j.status='running';launch(p,j);}
      }
      if(rendering<1)for(const p of projects.values()){
        const j=p.jobs.find(j=>j.status==='queued'&&j.kind==='render');
        if(j){rendering++;j.status='running';launch(p,j);break;}
      }
    }finally{pumping=false;}
  }
  function launch(p,j){const task=runJob(p,j);runningTasks.add(task);task.finally(()=>runningTasks.delete(task)).catch(error=>console.error('Job shutdown failure',error.message));}
  async function runJob(p,j){
    const c=new AbortController();controllers.set(j.id,c);j.startedAt=new Date().toISOString();delete j.completedAt;delete j.error;j.metrics??={stages:[],modelCalls:0,cacheHits:0};
    try{
      await save(p,jobEvent(j));await execute(p,j,c.signal);
      if(j.status==='running'){j.status='complete';j.stage=j.kind==='render'?'导出完成':'已完成';j.progress=100;}
    }catch(error){
      if(j.committedAt){j.status='complete';j.stage='修改已保存';j.progress=100;j.warning='修改已提交；后续处理未完成，可继续预览。';}
      else{j.status=c.signal.aborted?'cancelled':'failed';j.error=error.message;j.stage=c.signal.aborted?'已取消':'未完成';if(j.kind==='edit')p.messages.push({id:uid(),role:'assistant',text:error.message,jobId:j.id,revisionId:p.currentRevisionId,error:true});}
    }finally{
      j.completedAt=new Date().toISOString();j.metrics.elapsedMs=Date.parse(j.completedAt)-Date.parse(j.startedAt);controllers.delete(j.id);
      try{await save(p,jobEvent(j));}catch(error){console.error('Unable to persist job result',j.id,error.message);}
      if(j.kind==='render')rendering--;else if(j.kind==='asset'){importing--;activeImportProjects.delete(p.id);}else{running--;activeProjects.delete(p.id);}
      try{
        if(!closed&&j.kind==='asset'&&j.status==='complete')await firstEdit(p);
        if(!closed&&j.kind==='edit'&&j.status==='complete'&&j.revisionId&&(j.exportRequested||(j.payload.autoExport&&!p.jobs.some(x=>x.status==='queued'&&editingJob(x)))))await enqueue(p,'render',{revisionId:j.revisionId},'auto-export-'+j.id);
      }catch(error){console.error('Unable to enqueue follow-up',j.id,error.message);}
      void pump();
    }
  }
  async function cancel(p,id){
    const j=p.jobs.find(j=>j.id===id);insist(j,'任务不存在');
    if(j.committedAt||!activeStates.includes(j.status))return j;
    if(j.status==='queued'){j.status='cancelled';j.stage='已取消';j.completedAt=new Date().toISOString();}
    controllers.get(id)?.abort();await save(p,jobEvent(j));void pump();return j;
  }
  async function retry(p,id){
    const j=p.jobs.find(j=>j.id===id);insist(j,'任务不存在');insist(['failed','interrupted','cancelled'].includes(j.status),'这个任务不需要重试');
    if(j.kind!=='render'&&busy(p))throw new EditError('项目正在处理',409);
    if(['edit','operations','restore'].includes(j.kind))checkBase(p,j.payload.baseRevisionId);
    j.status='queued';j.error=null;j.stage='等待重试';delete j.committedAt;delete j.completedAt;j.metrics={stages:[],modelCalls:0,cacheHits:0};
    await save(p,jobEvent(j));void pump();return j;
  }
  async function firstEdit(p) {
    if(!p.initialText||!p.currentRevisionId||busy(p))return;
    const existing=p.jobs.find(j=>j.key==='initial-edit-'+p.id);
    if(!existing)await enqueue(p,'edit',{baseRevisionId:p.currentRevisionId,text:p.initialText},'initial-edit-'+p.id);
    p.initialText='';await save(p);
  }
  for(const p of projects.values())if(p.jobs.some(j=>j.kind==='asset'&&j.status==='complete'))await firstEdit(p);
  const list=({summary=false}={})=>[...projects.values()].filter(p=>!p.demoValidation).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(p=>summary?{id:p.id,name:p.name,currentRevisionId:p.currentRevisionId,updatedAt:p.updatedAt,revisionCount:p.revisions.length,activeJobs:p.jobs.filter(j=>activeStates.includes(j.status)).map(jobEvent)}:view(p));
  const close=async()=>{closed=true;for(const c of controllers.values())c.abort();await provider.close?.();shutdownSpeechWorkers();await Promise.allSettled([...runningTasks]);await closePreviewChecks();await Promise.allSettled([...store.pending.values()]);};
  return {get,view,create,upload,importFile,enqueue,cancel,retry,connect,capabilities:()=>({...capabilities(),...(connectedAt?{verifiedAt:connectedAt}:{})}),list,assetDir,revisionDir,save,subscribe:(id,after,send)=>store.subscribe(id,after,send),close};
}

export async function editRoutes(service,req,res,url,{json,jsonBody,file}) {
  const route=url.pathname;
  if(route==='/api/edit-samples'&&req.method==='GET'){
    const samples=JSON.parse(await fs.readFile(path.join(ROOT,'assets/edit-samples/catalog.json'),'utf8').catch(()=>'[]'));json(res,samples);return true;
  }
  const sm=/^\/api\/edit-samples\/([a-z-]+)\/(start|image|video)$/.exec(route);
  if(sm){
    const samples=JSON.parse(await fs.readFile(path.join(ROOT,'assets/edit-samples/catalog.json'),'utf8'));const sample=samples.find(s=>s.id===sm[1]);insist(sample,'样例不存在');
    if(req.method==='POST'&&sm[2]==='start'){const b=await jsonBody(req,26000,'样例指令');json(res,await service.importFile(path.join(ROOT,'assets/edit-samples',sample.id+'.mp4'),sample.title+'.mp4',{initialText:b.text||'',sampleId:sample.id,sampleContext:{nature:sample.nature,language:sample.language,burnedInSubtitles:sample.burnedInSubtitles||false,subtitleGuidance:sample.subtitleGuidance||null,attribution:sample.attribution,license:sample.license,sourceUrl:sample.sourceUrl}}),201);return true;}
    if(['GET','HEAD'].includes(req.method)&&sm[2]!=='start'){await file(req,res,path.join(ROOT,'assets/edit-samples',sample.id+(sm[2]==='image'?'.jpg':'.mp4')),sm[2]==='image'?'image/jpeg':'video/mp4');return true;}
  }
  if(req.method==='GET'&&route==='/api/edit-capabilities'){json(res,service.capabilities());return true;}
  if(req.method==='POST'&&route==='/api/edit-connection'){json(res,await service.connect(await jsonBody(req,3000,'模型连接')));return true;}
  if(route==='/api/edit-projects') {
    if(req.method==='GET'){json(res,service.list({summary:url.searchParams.get('summary')==='1'}));return true;}
    if(req.method==='POST'){const b=await jsonBody(req,26000,'项目');json(res,await service.create(b.name,b.initialText),201);return true;}
  }
  const match=/^\/api\/edit-projects\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(route);if(!match)return false;
  const p=service.get(match[1]),action=match[2]||'';
  if(req.method==='GET'&&action==='events'){
    const after=Math.max(0,Number(req.headers['last-event-id'])||0,Number(url.searchParams.get('after'))||0);
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 1500\n\n');
    let cursor=after;const send=event=>{if(res.destroyed||event.sequence<=cursor)return;cursor=event.sequence;res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);};
    const off=service.subscribe(p.id,after,send);
    if((p.eventSequence||0)>cursor)send({type:'snapshot',projectId:p.id,sequence:p.eventSequence,revisionId:p.currentRevisionId});
    const keepAlive=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},15000);keepAlive.unref();
    res.on('close',()=>{clearInterval(keepAlive);off();});return true;
  }
  if(req.method==='GET'&&!action){json(res,service.view(p));return true;}
  if(req.method==='POST'&&action==='assets') {let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw new EditError('文件名无效');}const job=await service.upload(p,req,name,req.headers['idempotency-key']);json(res,{jobId:job.id},202);return true;}
  if(req.method==='POST'&&['messages','operations','restore','analyze','render'].includes(action)) {
    const b=await jsonBody(req,256000,'剪辑请求');
    if(action==='messages')insist(typeof b.text==='string'&&b.text.trim().length>0&&b.text.length<=6000,'请输入 1～6000 个字符');
    if(b.selection){insist(typeof b.selection==='object'&&JSON.stringify(b.selection).length<=6000,'选中范围无效');if(b.selection.revisionId!==b.baseRevisionId)throw new EditError('选中引用属于旧版本，请重新选择',409);}
    const job=await service.enqueue(p,action==='messages'?'edit':action,b,req.headers['idempotency-key']);json(res,{jobId:job.id},202);return true;
  }
  const jm=/^jobs\/([a-f0-9-]{36})(?:\/(cancel|retry))?$/.exec(action);
  if(jm){if(req.method==='GET'&&!jm[2]){const j=service.view(p).jobs.find(j=>j.id===jm[1]);if(!j)throw new EditError('任务不存在',404);json(res,j);return true;}if(req.method==='POST'&&jm[2]){const j=await service[jm[2]](p,jm[1]);json(res,{jobId:j.id});return true;}}
  const am=/^assets\/([a-f0-9-]{36})\/(media|thumb\/(\d+))$/.exec(action);
  if(am&&['GET','HEAD'].includes(req.method)){const a=p.assets[am[1]];insist(a?.status==='ready','素材未就绪');const target=am[2]==='media'?a.proxy||a.work:a.thumbnails?.[Number(am[3])]?.file;insist(target,'图片不存在');await file(req,res,path.join(service.assetDir(p.id,a.id),target),am[2]==='media'?(a.kind==='video'?'video/mp4':'audio/mp4'):'image/jpeg');return true;}
  const rm=/^revisions\/([a-f0-9-]{36})\/(.+)$/.exec(action);
  if(rm&&['GET','HEAD'].includes(req.method)) {
    const r=p.revisions.find(r=>r.id===rm[1]);if(!r)throw new EditError('版本不存在',404);
    const names={'video':['video.mp4','video/mp4'],'subtitles':['subtitles.srt','text/plain; charset=utf-8'],'package':['project.zip','application/zip'],'preview.html':['preview.template','text/html; charset=utf-8'],'index.html':['index.html','text/html; charset=utf-8']};let info=names[rm[2]];
    if(['video','package'].includes(rm[2])&&r.render.status!=='complete')throw new EditError('此版本尚未导出',409);
    if(!info&&/^assets\/[a-zA-Z0-9.-]+$/.test(rm[2])){const ext=path.extname(rm[2]);info=[rm[2],{'.mp4':'video/mp4','.m4a':'audio/mp4','.js':'text/javascript; charset=utf-8','.woff2':'font/woff2'}[ext]||'application/octet-stream'];}
    if(!info)throw new EditError('文件不存在',404);
    await file(req,res,path.join(service.revisionDir(p.id,r.id),info[0]),info[1],['subtitles','package'].includes(rm[2])||url.searchParams.has('download')?`video-v${r.number}${path.extname(info[0])}`:null);return true;
  }
  throw new EditError('找不到剪辑接口',404);
}
