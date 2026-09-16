import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const textFile=/\.(?:md|json|mjs|cjs|ts|tsx|html|js|css|glsl|frag|vert|wgsl|py|sh|txt)$/i;
const excluded=new Set(['.git','node_modules','.cache','outputs','data']);
export const catalogDigest=d=>hash({commit:d.provenance.commit,groups:d.groups,files:d.files,...(d.scan?{scan:d.scan}: {})});

export function functionalCategories(record){
 const text=[record.name,record.description,...(record.tags||[]),record.path].join(' ').toLowerCase();
 const categories=new Set(record.categories||[]);
 for(const [category,match] of [
  ['template',/template|blueprint|story.grammar/],['composition',/composition|registryblocks|index\.html/],
  ['component',/component/],['effect',/effect|overlay|mask|reveal|grain/],
  ['transition',/transition|chromatic.radial.split/],['skill',/skill|\.md$/],
  ['caption',/caption|subtitle/],['typography',/typograph|title|text|font|type.beat/],
  ['lower third',/lower.?third|lt-mask/],['shader',/shader|\.glsl|\.frag|\.wgsl/]
 ])if(match.test(text))categories.add(category);
 return [...categories].sort();
}

/** Read only the configured local resource boundaries. A fresh content scan
 * is intentional: mtime/size alone cannot detect same-size replacements.
 * Discovery never grants execution or imports scripts from these roots. */
export async function refreshLocalCatalog(root,base){
 const configFile=path.join(root,'config/hyperframes/discovery.json');
 let config;
 try{config=JSON.parse(await fs.readFile(configFile,'utf8'));}catch(error){if(error.code==='ENOENT')return base;throw error;}
 if(config.schemaVersion!==1||!Array.isArray(config.roots)||!config.roots.length)throw Error('Invalid discovery boundaries');
 const scan={schemaVersion:1,configurationHash:hash(config),boundaries:[],files:[],errors:[],exclusions:{directories:[...excluded],nonText:'media payloads are excluded; manifests and source dependencies are hashed',symlinks:'not followed'}};
 const groups=Object.fromEntries(Object.keys(base.groups).map(k=>[k,[]]));groups.localResources=[];
 const original=new Map(Object.values(base.groups).flat().map(r=>[r.path,r]));
 const files=[],paths=new Set();
 for(const boundary of config.roots){
  if(!boundary.id||!boundary.path||!['canonical','reference','local'].includes(boundary.kind))throw Error('Invalid discovery root');
  const directory=path.resolve(root,boundary.path),report={...boundary,path:directory,status:'scanned',readableFiles:0,excludedFiles:0};
  scan.boundaries.push(report);const found=[];
  async function walk(dir){
   let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(error){report.status='incomplete';scan.errors.push({root:boundary.id,path:path.relative(directory,dir),code:error.code||'READ_FAILED'});return;}
   for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(dir,entry.name);
    if(entry.isSymbolicLink()){report.excludedFiles++;continue;}
    if(entry.isDirectory()){if(excluded.has(entry.name)){report.excludedFiles++;continue;}await walk(file);}
    else if(entry.isFile()){
     if(!textFile.test(entry.name)){report.excludedFiles++;continue;}
     try{const content=await fs.readFile(file);found.push({file,content,sha256:hash(content)});report.readableFiles++;}
     catch(error){report.status='incomplete';scan.errors.push({root:boundary.id,path:path.relative(directory,file),code:error.code||'READ_FAILED'});}
    }
   }
  }
  await walk(directory);
  const localFiles=new Map(found.map(f=>[f.file,f]));
  for(const f of found){
   const relative=path.relative(directory,f.file).replaceAll('\\','/'),projectPath=path.relative(path.dirname(root),f.file).replaceAll('\\','/');
   scan.files.push({root:boundary.id,path:relative,sha256:f.sha256});
   if(boundary.kind==='canonical')files.push({path:relative,sha256:f.sha256});
   if(paths.has(f.file))continue;paths.add(f.file);
   const prior=original.get(projectPath);let meta={},sourceType=prior?.type||null,parseError=null;
   const isManifest=path.basename(f.file)==='registry-item.json'&&!/(?:^|\/)(?:schema|schemas)\//.test(relative);
   if(isManifest){try{meta=JSON.parse(f.content.toString('utf8'));if(!meta.name||!['hyperframes:block','hyperframes:component','hyperframes:example'].includes(meta.type)||!Array.isArray(meta.files)||!meta.files.length)throw Error('Invalid registry item');}catch(error){parseError='INVALID_MANIFEST';report.status='incomplete';scan.errors.push({root:boundary.id,path:relative,code:parseError});}}
   if(!sourceType){
    if(isManifest)sourceType=meta.type==='hyperframes:block'?'registryBlocks':meta.type==='hyperframes:component'?'registryComponents':meta.type==='hyperframes:example'?'examples':'unparsed';
    else if(/(?:^|\/)SKILL(?:\.source)?\.md$/.test(relative))sourceType='skills';
    else if(/(?:TEMPLATES|COMPONENTS)\.json$/.test(relative))sourceType='sceneDefinitions';
    else if(/\.html$/.test(relative)&&!localFiles.has(path.join(path.dirname(f.file),'registry-item.json')))sourceType='composition';
    else if(/\.(?:glsl|frag|vert|wgsl)$/.test(relative))sourceType='shader';
    else if(boundary.kind==='local'&&/\.md$/.test(relative))sourceType='skills';
   }
   if(!sourceType)continue;
   const content=f.content.toString('utf8'),name=meta.name||prior?.name||path.basename(path.dirname(f.file));
   const declaredFiles=Array.isArray(meta.files)?meta.files:[];
   const dependencies=declaredFiles.map(item=>{
    const name=typeof item==='string'?item:item.path||item.name||'';
    const target=path.resolve(path.dirname(f.file),name),inside=target.startsWith(directory+path.sep);
    const source=inside&&localFiles.get(target);
    return {path:name,status:source?'readable':inside?'missing-or-excluded':'outside-boundary',sha256:source?.sha256||null};
   });
   const record={...prior,id:prior?.id||`${boundary.id}:${sourceType}:${relative}`,canonicalId:meta.name||prior?.canonicalId||prior?.name||null,name,type:sourceType,sourceType:meta.type||sourceType,path:projectPath,rootId:boundary.id,
    description:meta.description||prior?.description||content.match(/^description:\s*["']?(.+)$/m)?.[1]||name,
    tags:Array.isArray(meta.tags)?meta.tags:prior?.tags||[],version:meta.version||prior?.version||null,sha256:f.sha256,
    sourceCommit:boundary.kind==='canonical'?base.provenance.commit:prior?.sourceCommit||null,
    runtimeCompatibility:{runtime:boundary.kind==='canonical'?'0.8.33':meta.runtimeVersion||null,minCliVersion:meta.minCliVersion||null,status:'requires-adapter-verification'},
    inputRequirements:meta.dimensions?{dimensions:meta.dimensions,duration:meta.duration||null}:prior?.inputRequirements||{},
    dependencies,registryDependencies:meta.registryDependencies||[],parseError,executionStatus:parseError?'unparsed':'discovered',adaptationStatus:'not_evaluated',bindingStatus:'not_bound',verificationStatus:'not_rendered',
    license:prior?.license||meta.license||'not declared; verify source and media separately'};
   record.categories=functionalCategories(record);
   (groups[prior?.type]||groups.localResources).push(record);
  }
 }
 scan.status=scan.errors.length?'incomplete':'complete_within_configured_boundaries';
 for(const records of Object.values(groups))records.sort((a,b)=>a.path.localeCompare(b.path));
 scan.files.sort((a,b)=>a.root.localeCompare(b.root)||a.path.localeCompare(b.path));files.sort((a,b)=>a.path.localeCompare(b.path));
 const data={...base,schemaVersion:2,groups,files,scan};data.contentHash=catalogDigest(data);return data;
}

export async function readDiscoveredResource(root,data,record){
 const target=path.resolve(root,'..',record.path),real=await fs.realpath(target);
 const roots=data.scan?.boundaries?.map(b=>b.path)||[path.resolve(root,'../third_party')];
 let allowed=false;for(const folder of roots){const realRoot=await fs.realpath(folder).catch(()=>null);if(realRoot&&real.startsWith(realRoot+path.sep))allowed=true;}
 if(!allowed)throw Error('Resource path escapes configured boundary');
 const bytes=await fs.readFile(real);if(hash(bytes)!==record.sha256)throw Error('Resource changed: '+record.id);
 return bytes.toString('utf8');
}
