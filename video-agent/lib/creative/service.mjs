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
import {requireCommerceMessagePlan} from './intent.mjs';
import {planCreativeEdit} from './model-edit.mjs';
import {selectiveEffectRestore} from './history.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {collectCreativeEvidence} from './model-director.mjs';
import {readCreativePresets, publicPreset} from './presets.mjs';
import {replaceFileAtomically} from '../edit/project-store.mjs';
import {creativeVoiceInteraction} from './voice.mjs';
import {recognizeNativeCaptions} from './captions.mjs';
import {assertOpeningOnly} from './branches.mjs';
import {exportCreativeHistory,unpackCreativeHistory,restoreCreativeHistory,MAX_PACKAGE_BYTES} from './portable.mjs';

const active=j=>['queued','running'].includes(j.status);
const now=()=>new Date().toISOString();
const mime={'.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.wav':'audio/wav','.m4a':'audio/mp4','.mp3':'audio/mpeg','.zip':'application/zip'};
export async function createCreativeService({root=ROOT,dataDir=process.env.VIDEO_AGENT_CREATIVE_DATA_DIR||path.join(root,'data/commerce-runs'),planner='model'}={}){
  await fs.mkdir(dataDir,{recursive:true});
  let presets=await readCreativePresets(root),presetStamp='',presetRefresh=null;
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
    p.updatedAt=now();const bytes=JSON.stringify(p,null,2),target=path.join(directory(p),'native-project.json');
    const task=(writes.get(p.id)||Promise.resolve()).catch(()=>{}).then(async()=>{await fs.writeFile(target+'.tmp',bytes);await replaceFileAtomically(target+'.tmp',target);});writes.set(p.id,task);await task;
  }
  for(const id of await fs.readdir(dataDir)){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))continue;
    try{const p=JSON.parse(await fs.readFile(path.join(dataDir,id,'native-project.json'),'utf8'));for(const j of p.jobs.filter(active)){j.status='failed';j.error='服务重启中断了任务，输入和上一有效版本已保留';j.code='INTERRUPTED';}
      // Older preview copies are derived artifacts, never a second composition entry.
      for(const r of p.revisions){const dir=versionDirectory(p,r),preview=path.join(dir,'preview.html');const copy=await fs.readFile(preview,'utf8').catch(()=>null);if(copy!==null){const source=await fs.readFile(path.join(dir,'index.html'),'utf8');insist(copy===source.replace('</body>','<script src="assets/runtime.js"></script></body>'),'预览副本存在未知修改，已保留文件','PREVIEW_MIGRATION_CONFLICT');await fs.rename(preview,path.join(dir,'preview.html.evidence'));}}
      projects.set(id,p);await save(p);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  const get=id=>{const p=projects.get(id);if(!p)throw new CreativeError('原生项目不存在','PROJECT_NOT_FOUND',404);return p;};
  const revision=(p,id=p.currentRevisionId)=>{const r=p.revisions.find(r=>r.id===id);if(!r)throw new CreativeError('版本不存在','REVISION_NOT_FOUND',404);return r;};
  const view=p=>({...structuredClone(p),jobs:p.jobs.map(({snapshot,...job})=>job),auditions:(p.auditions||[]).map(a=>({...a,url:`/api/commerce/${p.id}/auditions/${a.id}.wav`})),revisions:p.revisions.map(r=>({...r,previewUrl:`/api/commerce/${p.id}/revisions/${r.id}/preview.html`,videoUrl:r.rendered?`/api/commerce/${p.id}/revisions/${r.id}/commerce-final.mp4`:null,documentUrl:`/api/commerce/${p.id}/revisions/${r.id}/document.json`,packageUrl:r.historyPackaged?`/api/commerce/${p.id}/revisions/${r.id}/history.zip`:r.packaged?`/api/commerce/${p.id}/revisions/${r.id}/project.zip`:null}))});
  async function create(input={}){
    const p={schemaVersion:1,id:randomUUID(),title:String(input.product?.name||'新创作'),createdAt:now(),updatedAt:now(),request:input,assets:[],revisions:[],currentRevisionId:null,jobs:[],messages:[],redo:[]};
    await fs.mkdir(path.join(directory(p),'uploads'),{recursive:true});projects.set(p.id,p);try{await save(p);}catch(error){projects.delete(p.id);throw error;}return p;
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
      await pipeline(req,new Transform({transform(chunk,encoding,callback){size+=chunk.length;if(size>MAX_FILE_BYTES)return callback(new CreativeError('每个素材最多1 GiB','ASSET_TOO_LARGE',413));callback(null,chunk);}}),createWriteStream(target,{flags:'wx'}));
      insist(size>0,'素材不能为空','INVALID_ASSET');
      const asset={id,kind,name:path.basename(name),path:path.relative(root,target).replaceAll('\\','/'),bytes:size,rights:{status:'user-provided'}};p.assets.push(asset);await save(p);return asset;
    }catch(e){p.assets=p.assets.filter(a=>a.id!==id);await fs.unlink(target).catch(()=>{});throw e;}finally{uploads.delete(key);}
  }
  async function importPackage(req){
    const p=await create({}),target=path.join(directory(p),'import.zip');let bytes=0;
    try{await pipeline(req,new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>MAX_PACKAGE_BYTES?new CreativeError('原生包最多80 GiB','PACKAGE_LIMIT',413):null,chunk);}}),createWriteStream(target,{flags:'wx'}));insist(bytes>0,'原生包不能为空','PACKAGE_INVALID');}
    catch(error){await fs.unlink(target).catch(()=>{});throw error;}
    const job={id:'job-'+randomUUID(),kind:'import',input:{},baseRevisionId:null,status:'queued',createdAt:now()};p.title='正在打开工程';p.jobs.push(job);await save(p);void execute(p,job).catch(error=>{job.status='failed';job.error=error.message;});return p;
  }
  async function copyAssets(from,to){
    await fs.mkdir(path.join(to,'assets'),{recursive:true});for(const name of await fs.readdir(path.join(from,'assets')))await linkOrCopy(path.join(from,'assets',name),path.join(to,'assets',name));
  }
  async function planEdit(p,base,document,input,signal,evidence={}){
    if(input.operations)return {operations:input.operations,mode:'structured'};
    if(/(?:恢复|撤销).*(?:动效|动画|效果)/.test(input.message)){
      let r=base;
      while(r?.parentId){
        const edit=JSON.parse(await fs.readFile(path.join(versionDirectory(p,r),'edit.json'),'utf8').catch(()=>'{}'));
        if(edit.operations?.some(o=>['set_scene_effect','update_effect_params','update_custom_source'].includes(o.type))){
          const before=await readNativeProject(versionDirectory(p,revision(p,r.parentId))),after=await readNativeProject(versionDirectory(p,r));
          return {operations:selectiveEffectRestore(document,before.document,after.document),mode:'selective-inverse',restoredRevisionId:r.id,summary:'恢复上次动效属性，保留之后的价格、文案和锁定。'};
        }
        r=p.revisions.find(v=>v.id===r.parentId);
      }
      throw new CreativeError('没有可恢复的动效历史','RESTORE_NOT_FOUND');
    }
    return planCreativeEdit(document,input.message,{selectedNodeId:input.selectedNodeId,signal,...evidence});
  }
  async function publish(p,job,dir,document,description,{branch=false,defer=false}={}){
    const signal=controllers.get(job.id)?.signal,release=await acquireRender({kind:'preview',signal});
    try{await fs.writeFile(path.join(dir,'check.log'),await runHyperFrames(dir,'check',[],{signal}));}finally{release();}
    await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    insist(!signal?.aborted,'任务已取消','CANCELLED');
    insist(branch||p.currentRevisionId===job.baseRevisionId,'当前版本已变化，结果保留但不能覆盖新版本','REVISION_CONFLICT');
    const r={id:document.revisionId,parentId:job.baseRevisionId,directory:path.relative(directory(p),dir).replaceAll('\\','/'),createdAt:now(),description,durationFrames:document.durationFrames,output:document.output,rendered:false,branch};
    if(defer)return r;
    const previous={current:p.currentRevisionId,redo:p.redo};p.revisions.push(r);if(!branch){p.currentRevisionId=r.id;p.redo=[];}job.revisionId=r.id;
    try{await save(p);}catch(error){p.revisions=p.revisions.filter(v=>v!==r);p.currentRevisionId=previous.current;p.redo=previous.redo;delete job.revisionId;throw error;}return r;
  }
  async function execute(p,job){
    const controller=new AbortController();controllers.set(job.id,controller);const signal=controller.signal;
    job.status='running';job.startedAt=now();
    try{
      await save(p);
      if(job.kind==='import'){
        job.stage='检查原生工程包';await save(p);
        const unpacked=await unpackCreativeHistory(path.join(directory(p),'import.zip'),path.join(directory(p),'import-blobs'),{signal});
        const release=await acquireRender({kind:'preview',signal});let restored;
        try{restored=await restoreCreativeHistory(root,directory(p),p.id,unpacked,{signal,onStage:async stage=>{job.stage=stage;await save(p);}});}finally{release();}
        insist(!signal.aborted,'任务已取消','CANCELLED');
        const previous=structuredClone(p);Object.assign(p,restored,{jobs:[job]});job.revisionId=p.currentRevisionId;
        try{await save(p);}catch(error){Object.assign(p,previous);throw error;}job.summary=`已打开完整工程，保留 ${p.revisions.length} 个版本，可以继续修改。`;
      }else if(job.kind==='create'){
        job.stage='理解创作要求';await save(p);
        const voice=await creativeVoiceInteraction(p,job.input.message||p.request.message,directory(p),{signal});
        if(voice){
          job.summary=voice.summary;
          if(voice.mode==='audition'){p.auditions=voice.auditions;delete p.confirmedVoice;job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:voice.summary,time:now()});return;}
          p.confirmedVoice=voice.confirmedVoice;
          if(voice.mode==='confirm'){job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:voice.summary,time:now()});return;}
          const selected=voice.confirmedVoice;
          if(!p.assets.some(a=>a.id===selected.id))p.assets.push({id:selected.id,kind:'audio',name:'已确认配音.wav',path:path.relative(root,path.join(directory(p),selected.path)).replaceAll('\\','/'),rights:{status:'locally-generated',engine:'kokoro'},generatedVoice:true});
          p.request={message:job.input.message+'\n用户已确认的配音稿：'+selected.text+'\n使用已确认的音频素材 '+selected.id+'，不要重新配音。',inferRequest:true};
        }
        else if(job.input.message){p.request={...p.request,message:job.input.message};}
        job.stage='观察素材与设计分镜';await save(p);
        const dir=path.join(directory(p),'versions',job.id);
        await buildCommerceProject({...p.request,projectId:p.id,assets:p.assets,outputDir:path.relative(root,dir).replaceAll('\\','/'),render:false,planning:planner,signal,onStage:async stage=>{job.stage=stage;await save(p);}},{root});
        const {document}=await readNativeProject(dir);p.title=document.brief.name;job.stage='检查原生预览';await save(p);await publish(p,job,dir,document,'初始创作');
      }else if(job.kind==='edit'){
        const base=revision(p,job.baseRevisionId),from=versionDirectory(p,base),{document,assets}=await readNativeProject(from);
        const dir=path.join(directory(p),'versions',job.id);await copyAssets(from,dir);
        const added=[];for(const asset of p.assets.filter(a=>!assets.some(b=>b.id===a.id))){const prepared=await prepareCreativeAsset(root,asset,path.join(dir,'assets'),{signal});prepared.compiledRef=`assets/${path.basename(prepared.normalizedRef)}`;assets.push(prepared);added.push(prepared);document.assetRefs.push(prepared.id);}
        const observed=[...added,...assets.filter(a=>a.kind==='audio'&&!a.generatedVoice&&!added.some(b=>b.id===a.id))].map(a=>({...a,normalizedRef:path.relative(root,path.join(dir,a.compiledRef)).replaceAll('\\','/')}));
        const evidence=observed.length?await collectCreativeEvidence(observed,dir,root,signal):{inputs:[],records:[]};
        document.audioEvidence=evidence.records.filter(r=>r.audioAnalysis).map(r=>({assetId:r.assetId,sha256:r.sha256,...r.audioAnalysis}));
        const plan=await planEdit(p,base,document,job.input,signal,{evidenceInputs:evidence.inputs,assetMetadata:assets.map(a=>({id:a.id,kind:a.kind,metadata:a.mediaMetadata}))});job.summary=plan.summary;
        if(plan.alternatives?.length){
          const candidates=[];
          for(const [i,alternative] of plan.alternatives.entries()){
            job.stage=`检查开头方案 ${i+1}/${plan.alternatives.length}`;await save(p);
            const candidate=applyDocumentPatch(document,alternative.operations,Object.fromEntries(assets.map(a=>[a.id,a])));assertOpeningOnly(document,candidate);
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
        for(const op of plan.operations){
          if(op.type==='generate_captions'){
            job.stage='识别人声与字幕时间';await save(p);
            const current=operations.length?applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a]))):document;
            operations.push({type:'set_captions',captions:await recognizeNativeCaptions(current,assets,dir,{assetId:op.assetId,trackId:op.nodeId,signal})});
          }else operations.push(op);
        }
        plan.requestedOperations=requestedOperations;plan.operations=operations;
        const next=applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a])));
        await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
        await writeCompiledProject(dir,next,assets,{invalidation:computeInvalidation(document,next),signal});
        await fs.writeFile(path.join(dir,'edit.json'),JSON.stringify({message:job.input.message,baseRevisionId:base.id,...plan},null,2));
        await publish(p,job,dir,next,job.input.message,{branch:job.input.branch===true});
      }else if(job.kind==='export'){
        const r=revision(p,job.baseRevisionId),dir=versionDirectory(p,r);job.stage='导出所选版本';await save(p);
        const release=await acquireRender({signal});try{await renderCommerceProject({outputDir:path.relative(root,dir).replaceAll('\\','/'),signal},{root});}finally{release();}
        r.rendered=true;job.revisionId=r.id;
        job.stage='打包素材与完整历史';await save(p);
        job.packageEvidence=await exportCreativeHistory(root,directory(p),job.snapshot||structuredClone(p),r.id,path.join(dir,'history.zip'),{signal});r.historyPackaged=true;
      }
      job.status='complete';job.completedAt=now();p.messages.push({role:'assistant',text:job.kind==='export'?'已导出指定版本。':job.summary||'预览检查通过，新版本已保存。',revisionId:job.revisionId,time:now()});
    }catch(e){job.status=signal.aborted?'cancelled':'failed';job.error=signal.aborted?'已取消，上一有效版本保留':e.message;job.code=e.code||'CREATIVE_JOB_FAILED';job.completedAt=now();p.messages.push({role:'assistant',text:job.error,time:now()});}
    finally{controllers.delete(job.id);delete job.snapshot;job.durationMs=Date.parse(job.completedAt)-Date.parse(job.startedAt);await save(p).catch(error=>{job.persistenceError=error.code||error.message;console.error('创作任务状态暂未写入，上一已提交版本保留：',p.id,job.id,error.code||error.message);});}
  }
  async function enqueue(p,input){
    const kind=input.action==='generate'?'create':input.action==='render'||input.action==='export'?'export':'edit';
    if(input.idempotencyKey){const old=p.jobs.find(j=>j.idempotencyKey===input.idempotencyKey);if(old)return old;}
    insist(!p.jobs.some(j=>active(j)&&j.kind!=='export')||kind==='export','当前创作仍在进行','PROJECT_BUSY');
    insist(!Array.from(uploads).some(k=>k.startsWith(p.id+':')),'请等待素材上传完成','UPLOAD_BUSY');
    if(input.baseRevisionId)insist(input.baseRevisionId===p.currentRevisionId,'页面版本已过期，请刷新后再修改','REVISION_CONFLICT');
    if(kind==='create')insist(!p.currentRevisionId,'项目已有版本，请继续编辑或新建项目','PROJECT_EXISTS');else revision(p,input.revisionId||p.currentRevisionId);
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
  async function cancel(p,id){const job=p.jobs.find(j=>j.id===id);insist(job&&active(job),'任务不可取消','INVALID_CANCEL');controllers.get(id)?.abort();job.stage='正在取消';await save(p);return view(p);}
  return {get,has:id=>projects.has(id),view,create,loadPreset,presets:async()=>(await refreshPresets()).map(publicPreset),upload,importPackage,enqueue,navigate,cancel,revision,versionDirectory,list:()=>[...projects.values()].map(view).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};
}

export async function creativeRoutes(service,req,res,url,{json,jsonBody,file}){
  const route=url.pathname;
  if(route==='/api/commerce-import'&&req.method==='POST'){const p=await service.importPackage(req);json(res,{ok:true,project:service.view(p)},202);return true;}
  if(route==='/api/commerce-demos'&&req.method==='GET'){json(res,{presets:await service.presets()});return true;}
  if(route==='/api/commerce-projects'&&req.method==='GET'){json(res,{projects:service.list()});return true;}
  if(route==='/api/commerce-chat'&&req.method==='POST'&&(req.headers['content-type']||'').includes('application/json')){
    const input=await jsonBody(req,256000,'创作请求');
    if(input.action==='preset'){const p=await service.loadPreset(input.presetId);json(res,{ok:true,project:service.view(p)},201);return true;}
    if(input.action==='draft'){const p=await service.create(input.request||{});json(res,{ok:true,project:service.view(p)},201);return true;}
    if(!service.has(input.projectId)){
      insist(/^[a-zA-Z0-9_-]{1,100}$/.test(input.projectId||''),'项目 ID 无效','INVALID_PROJECT');
      const outputDir=`data/commerce-runs/${input.projectId}`;
      const result=input.action==='render'?await renderCommerceProject({...input,outputDir}):await patchCommerceProject({...input,outputDir,render:input.render!==false});
      json(res,{ok:true,result});return true;
    }
    const p=service.get(input.projectId);
    if(input.action==='cancel'){json(res,{ok:true,project:await service.cancel(p,input.jobId)});return true;}
    if(['undo','redo','restore'].includes(input.action)){json(res,{ok:true,project:await service.navigate(p,input)});return true;}
    if(input.action==='retry'){const old=p.jobs.find(j=>j.id===input.jobId);insist(old?.status==='failed','该任务不可重试','INVALID_RETRY');if(old.kind==='import'){const opened=await service.importPackage(createReadStream(path.join(service.versionDirectory(p,{directory:'.'}),'import.zip')));json(res,{ok:true,project:service.view(opened)},202);return true;}input.action=old.kind==='create'?'generate':old.kind==='export'?'export':'patch';Object.assign(input,{...old.input,idempotencyKey:undefined});}
    const job=await service.enqueue(p,input);json(res,{ok:true,jobId:job.id,project:service.view(p)},202);return true;
  }
  const match=/^\/api\/commerce\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/.exec(route);if(!match||!service.has(match[1]))return false;
  const p=service.get(match[1]),action=match[2]||'';
  if(action==='assets'&&req.method==='POST'){let name;try{name=decodeURIComponent(req.headers['x-file-name']||'');}catch{throw new CreativeError('文件名无效');}json(res,{ok:true,asset:await service.upload(p,req,name)},201);return true;}
  if(['GET','HEAD'].includes(req.method)){
    if(action===''||action==='status'){json(res,{ok:true,project:service.view(p)});return true;}
    const audition=/^auditions\/(voice-[a-z0-9]+)\.wav$/.exec(action);
    if(audition){const a=p.auditions?.find(a=>a.id===audition[1]);insist(a,'试听版本不存在','VOICE_NOT_FOUND');await file(req,res,path.join(service.versionDirectory(p,{directory:'.'}),a.path),'audio/wav');return true;}
    const inputAsset=/^input-assets\/([a-zA-Z0-9_-]+)$/.exec(action);
    if(inputAsset){const asset=p.assets.find(a=>a.id===inputAsset[1]);insist(asset,'素材不存在','ASSET_NOT_FOUND');await file(req,res,path.join(ROOT,asset.path),mime[path.extname(asset.path)]||'application/octet-stream',url.searchParams.has('download')?asset.name:undefined);return true;}
    const rm=/^revisions\/([a-zA-Z0-9_-]+)\/(preview.html|document.json|commerce-final.mp4|project.zip|history.zip|assets\/[a-zA-Z0-9_.-]+)$/.exec(action);
    if(rm){const r=service.revision(p,rm[1]),name=rm[2];
      if(name==='preview.html'){const source=await fs.readFile(path.join(service.versionDirectory(p,r),'index.html'),'utf8'),html=source.replace('</body>','<script src="assets/runtime.js"></script></body>');res.writeHead(200,{'Content-Type':mime['.html'],'Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:html);return true;}
      if(name==='commerce-final.mp4')insist(r.rendered,'该版本尚未导出','NOT_EXPORTED');await file(req,res,path.join(service.versionDirectory(p,r),name),mime[path.extname(name)]||'application/octet-stream',url.searchParams.has('download')?path.basename(name):undefined);return true;}
  }
  return false;
}
