import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';
import sharp from 'sharp';
import {insist,assetKindFromName,MAX_ASSETS,MAX_FILE_BYTES,MAX_SCENES} from './contracts.mjs';
import {readNativeProject,writeCompiledProject,runHyperFrames} from './runner.mjs';
import {linkOrCopy,probe} from '../edit/media.mjs';
import {inspectBrandFont} from './brand-fonts.mjs';

export const MAX_PACKAGE_BYTES=80*1024**3;
const MAX_ENTRIES=20000,MAX_JSON=16*1024**2;
const idOK=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
const hashOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const check=signal=>signal?.throwIfAborted();
export async function fileHash(file,signal){const hash=createHash('sha256');for await(const chunk of createReadStream(file,{signal}))hash.update(chunk);return hash.digest('hex');}
async function regular(file){const st=await fs.lstat(file);insist(st.isFile()&&!st.isSymbolicLink(),'工程包仅接受普通文件','PACKAGE_PATH');return st;}
export function relativeFile(root,name){
  insist(typeof name==='string'&&name.length<240&&!name.includes('\\')&&!name.includes(':')&&!name.split('/').some(x=>!x||x==='.'||x==='..')&&!/[^a-zA-Z0-9_./-]/.test(name),'工程包文件路径无效','PACKAGE_PATH');
  const file=path.resolve(root,name);insist(file.startsWith(path.resolve(root)+path.sep),'工程包路径越界','PACKAGE_PATH');return file;
}
function safeJSON(bytes){
  insist(Buffer.byteLength(bytes)<=MAX_JSON,'工程描述过大','PACKAGE_LIMIT');
  return JSON.parse(bytes,(key,value)=>{insist(!['__proto__','prototype','constructor'].includes(key),'工程描述含危险属性','PACKAGE_INVALID');return value;});
}
async function dependencies(root){return {hyperframes:'0.8.33',gsap:'3.14.2',gsapSha256:await fileHash(path.join(root,'node_modules/gsap/dist/gsap.min.js')),runtimeSha256:await fileHash(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js')),fonts:{distribution:'system-only',families:['Microsoft YaHei','PingFang SC','Arial'],note:'不分发字体；重开使用目标系统字体，缺字或替代字体需重新检查。'}};}
const recordNames=new Set(['document.json','manifest.json','object-map.json','DESIGN.md','STORYBOARD.md','ATTRIBUTION.md','index.html','edit.json','director-plan.json','model-plan.json','observations.json','evidence.json','caption-recognition.json','audio-processing.json','check.log','render.log','commerce-final.mp4']);
for(const name of ['run-input.json','story-inspections.json','narration.json','narration-script.json','brief-plan.json','resource-plan.json','story-plan.json','timing-plan.json','transcripts.json','dense-evidence.json','production-run.json','resource-lock.json','resource-receipts.json','quality-report.json','media-review.json','media-review.log','render-progress.json','custom-isolation.json'])recordNames.add(name);
const isProductionRecord=name=>/^(?:scene-\d+|quality-round-\d+(?:-batch-\d+)?|failed-shot-\d+-\d+|failed-brief-\d+|failed-observation-\d+|observation-invalidated-\d+|failed-story-\d+|brief-before-validation-repair-\d+|story-before-repair-\d+|story-repair-\d+|story-invalidated-\d+|keyframe-\d+|keyframe-review-\d+-\d+|failed-keyframe-\d+-\d+|assembly-failure-\d+|edit-quality-round-\d+|edit-failure-\d+|edit-before-repair-\d+)\.json$/.test(name)||/^(?:receipts|runs|source-history|stage-cache|implementations)\/[a-zA-Z0-9_.-]+\.json$/.test(name)||/^review-\d+\/(?:batch-\d+\/)?[a-zA-Z0-9_.-]+\.(?:png|jpe?g)$/.test(name)||/^keyframes\/[a-zA-Z0-9_-]+\/(?:verified\.json|document\.json|check\.log|frames\/[a-zA-Z0-9_.-]+\.png)$/.test(name)||/^edit-review-\d+\/batch-\d+\/(?:review\.json|[a-zA-Z0-9_.-]+\.png)$/.test(name)||/^resources\/(?:[a-zA-Z0-9_.-]+\/)*(?:LICENSE|[a-zA-Z0-9_.-]+\.(?:md|json|txt))$/.test(name);
async function productionFiles(dir,prefix=''){const found=[];for(const entry of await fs.readdir(path.join(dir,prefix),{withFileTypes:true})){const name=prefix+entry.name;if(entry.isFile()&&isProductionRecord(name))found.push(name);else if(entry.isDirectory()&&(prefix||/^(?:resources|receipts|runs|source-history|stage-cache|implementations|keyframes|edit-review-\d+|review-\d+)$/.test(entry.name)))found.push(...await productionFiles(dir,name+'/'));}return found;}

/** Immutable, content-addressed ZIP64 snapshot. Runtime scripts/fonts are dependencies, not imported code. */
export async function exportCreativeHistory(root,projectDir,snapshot,selectedRevisionId,output,{signal}={}){
  const blobs=new Map();let logicalBytes=0;
  async function add(file){check(signal);const st=await regular(file),hash=await fileHash(file,signal);logicalBytes+=st.size;if(!blobs.has(hash))blobs.set(hash,{file,size:st.size});return hash;}
  const revisions=[];
  for(const revision of snapshot.revisions){
    insist(idOK(revision.id),'版本ID无效','PACKAGE_INVALID');const dir=relativeFile(projectDir,revision.directory),files={};
    const {document}=await readNativeProject(dir);
    for(const name of await fs.readdir(dir))if(recordNames.has(name)&&!(name==='commerce-final.mp4'&&!revision.rendered&&revision.id!==selectedRevisionId))files[name]=await add(path.join(dir,name));
    for(const name of await fs.readdir(path.join(dir,'assets')))if(/^[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|mp4|mov|webm|wav|m4a|mp3|woff2)$/i.test(name))files['assets/'+name]=await add(path.join(dir,'assets',name));
    for(const name of await fs.readdir(path.join(dir,'evidence')).catch(()=>[]))if(/^[a-zA-Z0-9_.-]+\.jpg$/.test(name))files['evidence/'+name]=await add(path.join(dir,'evidence',name));
    for(const name of await productionFiles(dir))files[name]=await add(relativeFile(dir,name));
    revisions.push({...revision,directory:undefined,packaged:undefined,files,rendered:Boolean(files['commerce-final.mp4']),fontFamily:document.design.fontFamily,...(document.fontResources?.length?{fontResources:document.fontResources}:{})});
  }
  const assets=[];
  for(const asset of snapshot.assets){const file=relativeFile(root,asset.path),extension=path.extname(file).toLowerCase();insist(assetKindFromName(file)===asset.kind,'素材类型无效','PACKAGE_INVALID');assets.push({...asset,path:undefined,blob:await add(file),extension});}
  const auditions=[];
  for(const voice of snapshot.auditions||[])auditions.push({...voice,path:undefined,blob:await add(relativeFile(projectDir,voice.path))});
  const metadata={format:'hyperframe-creative-history',schemaVersion:1,capturedAt:new Date().toISOString(),selectedRevisionId,dependencies:await dependencies(root),project:{title:snapshot.title,createdAt:snapshot.createdAt,request:snapshot.request,messages:snapshot.messages,redo:snapshot.redo,jobs:snapshot.jobs.map(j=>({id:j.id,kind:j.kind,status:j.status,baseRevisionId:j.baseRevisionId,revisionId:j.revisionId,revisionIds:j.revisionIds,createdAt:j.createdAt,completedAt:j.completedAt,summary:j.summary,error:j.error,code:j.code,durationMs:j.durationMs,runId:j.runId,checkpoints:j.checkpoints,modelCalls:j.modelCalls,qualitySummary:j.qualitySummary})),sourceProjectId:snapshot.id,preset:snapshot.preset,confirmedVoice:snapshot.confirmedVoice?{...snapshot.confirmedVoice,path:undefined}:undefined},assets,auditions,revisions};
  const data=Buffer.from(JSON.stringify(metadata,null,2));insist(data.length<=MAX_JSON&&blobs.size<MAX_ENTRIES,'工程历史过大','PACKAGE_LIMIT');
  const uniqueBytes=[...blobs.values()].reduce((sum,b)=>sum+b.size,0);insist(uniqueBytes+data.length<MAX_PACKAGE_BYTES,'工程包超过80 GiB受控范围','PACKAGE_LIMIT');
  const temp=output+'.'+randomUUID()+'.partial',zip=new yazl.ZipFile();
  zip.on('error',error=>zip.outputStream.destroy(error));
  try{
    const written=pipeline(zip.outputStream,createWriteStream(temp,{flags:'wx'}),{signal});
    zip.addBuffer(data,'package.json',{compress:false});
    for(const [hash,blob] of blobs)zip.addReadStreamLazy('blobs/'+hash,{compress:false,size:blob.size},cb=>cb(null,createReadStream(blob.file,{signal})));
    zip.end({forceZip64Format:true});await written;check(signal);await fs.rename(temp,output);
    return {files:blobs.size+1,logicalBytes,uniqueBytes,bytes:(await fs.stat(output)).size,revisions:revisions.length,selectedRevisionId,sha256:await fileHash(output,signal)};
  }finally{zip.outputStream.destroy();await fs.unlink(temp).catch(()=>{});}
}

/** Entries never supply filesystem paths. Only SHA-addressed blobs are extracted. */
export async function unpackCreativeHistory(file,directory,{signal}={}){
  const zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true},(e,z)=>e?reject(e):resolve(z)));
  let total=0;const names=new Set();await fs.mkdir(directory,{recursive:true});
  try{
    await new Promise((resolve,reject)=>{
      zip.on('error',reject);zip.on('end',resolve);
      zip.on('entry',entry=>{(async()=>{
        check(signal);const name=entry.fileName;
        insist(name==='package.json'||/^blobs\/[a-f0-9]{64}$/.test(name),'工程包包含未声明路径','PACKAGE_PATH');
        insist(!names.has(name)&&names.size<MAX_ENTRIES,'重复文件或过多文件','PACKAGE_LIMIT');names.add(name);
        insist(!entry.isEncrypted()&&entry.compressionMethod===0&&entry.uncompressedSize===entry.compressedSize,'仅接受本产品的无压缩原生包','PACKAGE_FORMAT');
        const type=(entry.externalFileAttributes>>>16)&0xf000;insist(type===0||type===0x8000,'工程包不接受链接或特殊文件','PACKAGE_PATH');
        total+=entry.uncompressedSize;insist(total<=MAX_PACKAGE_BYTES&&(name!=='package.json'||entry.uncompressedSize<=MAX_JSON),'工程包解包大小越界','PACKAGE_LIMIT');
        const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(e,s)=>e?reject(e):resolve(s)));
        const target=path.join(directory,name==='package.json'?'package.json':name.slice(6)),hash=createHash('sha256');let size=0;
        await pipeline(stream,new Transform({transform(chunk,encoding,callback){size+=chunk.length;hash.update(chunk);callback(size>entry.uncompressedSize?Error('工程包长度不一致'):null,chunk);}}),createWriteStream(target,{flags:'wx'}),{signal});
        insist(size===entry.uncompressedSize,'工程包文件长度不一致','PACKAGE_CORRUPT');if(name!=='package.json')insist(hash.digest('hex')===name.slice(6),'工程包素材校验失败','PACKAGE_CORRUPT');zip.readEntry();
      })().catch(reject);});zip.readEntry();
    });
    insist(names.has('package.json'),'缺少工程描述','PACKAGE_INVALID');const metadata=safeJSON(await fs.readFile(path.join(directory,'package.json'),'utf8'));
    insist(metadata.format==='hyperframe-creative-history'&&metadata.schemaVersion===1,'原生包格式不支持','PACKAGE_FORMAT');
    return {metadata,blob:hash=>{insist(hashOK(hash)&&names.has('blobs/'+hash),'工程包缺少素材','PACKAGE_MISSING');return path.join(directory,hash);},files:names.size,bytes:total};
  }finally{zip.close();}
}

function validateImportedDocument(document,assets){
  const safeID=x=>insist(idOK(x),'工程对象ID无效','PACKAGE_INVALID');
  safeID(document.revisionId);document.scenes.forEach(safe=>safeID(safe.id));document.nodes.forEach(n=>safeID(n.id));document.transitions.forEach(t=>safeID(t.id));
  insist(!document.sourceBundles||Array.isArray(document.sourceBundles)&&document.sourceBundles.length<=MAX_SCENES,'自定义场景源码数量无效','PACKAGE_SOURCE_UNSUPPORTED');
  for(const key of ['background','foreground','panel','accent','accentContrast'])insist(/^#[a-fA-F0-9]{3,8}$/.test(document.design[key]),'工程颜色声明无效','PACKAGE_INVALID');
  insist(/^[\p{L}\p{N}\s,\-"']{1,180}$/u.test(document.design.fontFamily),'工程字体声明无效','PACKAGE_INVALID');
  for(const asset of assets)insist(/^assets\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|mp4|mov|webm|wav|m4a|mp3|woff2)$/i.test(asset.ref),'工程素材引用越界','PACKAGE_PATH');
}

async function verifyImportedMedia(file,kind,signal){
  if(kind==='font')return inspectBrandFont(file);
  if(kind==='image'){const decoder=sharp(file,{failOn:'error',limitInputPixels:48_000_000}),metadata=await decoder.metadata();insist(['jpeg','png','webp'].includes(metadata.format),'工程图片格式无效','PACKAGE_MEDIA');await decoder.stats();return {width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha};}
  insist(['audio','video'].includes(kind),'工程媒体类型无效','PACKAGE_MEDIA');const metadata=await probe(file,signal);insist(metadata.kind===kind,'工程媒体声明与真实文件不一致','PACKAGE_MEDIA');return metadata;
}

export async function restoreCreativeHistory(root,targetDir,id,unpacked,{signal,onStage=()=>{}}={}){
  const {metadata:m,blob}=unpacked;
  insist(JSON.stringify(m.dependencies)===JSON.stringify(await dependencies(root)),'工程运行时与本机固定依赖不一致','PACKAGE_DEPENDENCY');
  insist(Array.isArray(m.revisions)&&m.revisions.length>0&&m.revisions.length<=1000&&Array.isArray(m.assets)&&m.assets.length<=MAX_ASSETS,'工程历史或素材数量越界','PACKAGE_LIMIT');
  const ids=new Set(m.revisions.map(r=>r.id));insist(ids.size===m.revisions.length&&ids.has(m.selectedRevisionId),'工程版本图无效','PACKAGE_INVALID');
  for(const r of m.revisions){insist(idOK(r.id)&&(!r.parentId||ids.has(r.parentId)),'版本父节点无效','PACKAGE_INVALID');const visited=new Set([r.id]);let p=r;while(p.parentId){insist(!visited.has(p.parentId),'版本历史存在循环','PACKAGE_INVALID');visited.add(p.parentId);p=m.revisions.find(x=>x.id===p.parentId);}}
  const p={schemaVersion:1,id,title:String(m.project.title).slice(0,200),createdAt:m.project.createdAt,updatedAt:new Date().toISOString(),request:m.project.request,assets:[],revisions:[],currentRevisionId:m.selectedRevisionId,jobs:[],messages:m.project.messages||[],redo:(m.project.redo||[]).filter(r=>ids.has(r)),imported:{sourceProjectId:m.project.sourceProjectId,capturedAt:m.capturedAt,originalJobs:m.project.jobs}},verifiedMedia=new Map();
  async function verifyBlob(hash,kind){const key=hash+':'+kind;if(!verifiedMedia.has(key))verifiedMedia.set(key,await verifyImportedMedia(blob(hash),kind,signal));return verifiedMedia.get(key);}
  await fs.mkdir(path.join(targetDir,'uploads'),{recursive:true});
  for(const a of m.assets){insist(idOK(a.id)&&assetKindFromName("source"+a.extension)===a.kind,'输入素材无效','PACKAGE_INVALID');const source=blob(a.blob);insist((await fs.stat(source)).size<=MAX_FILE_BYTES,'原素材超过1 GiB','PACKAGE_LIMIT');await verifyBlob(a.blob,a.kind);const target=path.join(targetDir,'uploads',a.id+a.extension);await linkOrCopy(source,target);p.assets.push({...a,blob:undefined,extension:undefined,path:path.relative(root,target).replaceAll('\\','/')});}
  for(const [i,r] of m.revisions.entries()){
    check(signal);await onStage(`校验历史版本 ${i+1}/${m.revisions.length}`);
    const dir=path.join(targetDir,'versions',r.id);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
    insist(r.files&&hashOK(r.files['document.json'])&&hashOK(r.files['manifest.json']),'版本描述缺失','PACKAGE_MISSING');
    const document=safeJSON(await fs.readFile(blob(r.files['document.json']),'utf8')),manifest=safeJSON(await fs.readFile(blob(r.files['manifest.json']),'utf8'));
    if(r.files['index.html'])await fs.copyFile(blob(r.files['index.html']),path.join(dir,'original-index.html.evidence'));
    insist(document.revisionId===r.id&&manifest.revisionId===r.id,'版本描述不一致','PACKAGE_INVALID');validateImportedDocument(document,manifest.assets);document.projectId=id;
    for(const [name,hash] of Object.entries(r.files)){
      const isAsset=/^assets\/[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|mp4|mov|webm|wav|m4a|mp3|woff2)$/i.test(name);
      insist(isAsset||recordNames.has(name)||isProductionRecord(name)||/^evidence\/[a-zA-Z0-9_.-]+\.jpg$/.test(name),'版本含不支持的文件','PACKAGE_PATH');
      if(isAsset||!['index.html','document.json','manifest.json','object-map.json','DESIGN.md','ATTRIBUTION.md'].includes(name))await linkOrCopy(blob(hash),relativeFile(dir,name));
    }
    for(const asset of manifest.assets){insist(r.files[asset.ref],'缺少版本媒体文件','PACKAGE_MISSING');const actual=await verifyBlob(r.files[asset.ref],asset.kind);asset.mediaMetadata={...asset.mediaMetadata,...actual};}
    const assets=manifest.assets.map(a=>({...a,status:'ready',compiledRef:a.ref,normalizedRef:a.ref}));
    await linkOrCopy(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));
    await writeCompiledProject(dir,document,assets,{signal});await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
    // Every imported revision is compiled from validated native data and fully checked.
    await fs.writeFile(path.join(dir,'import-check.log'),await runHyperFrames(dir,'check',[],{signal}));
    await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
    p.revisions.push({id:r.id,parentId:r.parentId,directory:'versions/'+r.id,createdAt:r.createdAt,description:String(r.description).slice(0,1000),durationFrames:document.durationFrames,output:document.output,branch:r.branch===true,rendered:Boolean(r.files['commerce-final.mp4'])});
  }
  if(m.auditions?.length){insist(m.auditions.length<=3,'试听数量无效','PACKAGE_INVALID');await fs.mkdir(path.join(targetDir,'.auditions'),{recursive:true});p.auditions=[];for(const a of m.auditions){insist(idOK(a.id),'试听ID无效','PACKAGE_INVALID');const rel='.auditions/'+a.id+'.wav';await linkOrCopy(blob(a.blob),path.join(targetDir,rel));p.auditions.push({...a,blob:undefined,path:rel});}if(m.project.confirmedVoice){const voice=p.auditions.find(a=>a.id===m.project.confirmedVoice.id);insist(voice,'确认声音缺失','PACKAGE_MISSING');p.confirmedVoice={...m.project.confirmedVoice,path:voice.path};}}
  return p;
}
