import fs from 'node:fs/promises';
import path from 'node:path';
import {resourceHash} from './capabilities.mjs';
import {parse} from 'acorn';

// Packaging a consumed context does not change catalog discovery or planning.
// Hash the remaining syntax as well, so a simultaneous planning change still
// invalidates decisions. Legacy builds without this proof remain conservative.
export function capabilityDependencyScopes(source){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  ast.body=ast.body.filter(node=>!(node.type==='ImportDeclaration'&&node.source.value==='./commerce-skills.mjs'));
  for(const node of ast.body){const declaration=node.declaration||node;
    if(declaration.type==='ClassDeclaration'&&declaration.id.name==='CapabilityCatalog')declaration.body.body=declaration.body.body.filter(method=>method.key?.name!=='lockUsedResources');
  }
  return {planning:resourceHash(JSON.stringify(ast,(key,value)=>['start','end','raw'].includes(key)?undefined:value)),packaging:resourceHash(source)};
}

export function productionDependencyScopes(source){
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  function strip(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee?.object?.name==='registry'&&node.callee?.property?.name==='register'&&node.arguments[0]?.value==='preview.review'){
      node.arguments=node.arguments.slice(0,1);return;
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(strip);else if(value&&typeof value==='object')strip(value);
  }
  strip(ast);
  // Only discard this import if its bindings have no use outside preview.review.
  const declaration=ast.body.find(n=>n.type==='ImportDeclaration'&&n.source.value==='./quality-source-recovery.mjs');let qualityHelperIsolated=true;
  if(declaration){
    const names=new Set(declaration.specifiers.map(s=>s.local.name));let used=false;
    function find(node){if(!node||typeof node!=='object'||node===declaration)return;if(node.type==='Identifier'&&names.has(node.name))used=true;for(const v of Object.values(node))if(Array.isArray(v))v.forEach(find);else if(v&&typeof v==='object')find(v);}
    find(ast);qualityHelperIsolated=!used;if(!used)ast.body=ast.body.filter(n=>n!==declaration);
  }
  return {planningAndAssembly:resourceHash(JSON.stringify(ast,(key,value)=>['start','end','raw'].includes(key)?undefined:value)),qualityHelperIsolated,quality:resourceHash(source)};
}

export async function captureRuntimeBuild(root){
  const files={};
  async function read(directory){await Promise.all((await fs.readdir(path.join(root,directory),{withFileTypes:true})).map(async item=>{const file=directory+'/'+item.name;if(item.isDirectory())await read(file);else if(item.isFile()&&/\.(?:mjs|js)$/.test(item.name))files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));}
  await read('lib');
  await Promise.all(['server.mjs','package-lock.json','scripts/native-scene-worker.mjs','scripts/native-scene-job.ps1','scripts/local-speak.py','scripts/local-transcribe.py','scripts/speech-worker.py','web/commerce.html','web/commerce.js'].map(async file=>{files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));
  const capabilities=capabilityDependencyScopes(await fs.readFile(path.join(root,'lib/creative/capabilities.mjs'),'utf8'));
  const production=productionDependencyScopes(await fs.readFile(path.join(root,'lib/creative/production.mjs'),'utf8'));
  // Older builds recorded file hashes, but no per-stage syntax hashes. A retained
  // exact source can supply that proof without rewriting the historical build.
  const historicalProductionScopes={},proofDir=path.join(root,'.cache/runtime-scope-sources');
  for(const name of await fs.readdir(proofDir).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))if(/^[a-f0-9]{64}\.mjs$/.test(name)){
    const source=await fs.readFile(path.join(proofDir,name),'utf8'),hash=name.slice(0,-4);
    if(resourceHash(source)!==hash)throw Object.assign(Error('历史运行源码证明已变化'),{code:'CHECKPOINT_HASH'});
    historicalProductionScopes[hash]=productionDependencyScopes(source);
  }
  return {mode:'server-module-load',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),dependencyScopes:{capabilities,production},...(Object.keys(historicalProductionScopes).length?{historicalProductionScopes}:{})};
}

export function invalidatedProductionCheckpoints(before,after,checkpoints,{policyChanged=false}={}){
 const changed=[...new Set([...Object.keys(before?.files||{}),...Object.keys(after?.files||{})])].filter(file=>before?.files?.[file]!==after?.files?.[file]);
 const order=['brief','observe','material','creative','resources','narration','story','timing','shots','assemble','quality'];
 const priorProduction=before?.dependencyScopes?.production||after?.historicalProductionScopes?.[before?.files?.['lib/creative/production.mjs']];
 const sameProduction=priorProduction?.planningAndAssembly&&priorProduction.planningAndAssembly===after?.dependencyScopes?.production?.planningAndAssembly;
 const onlyQuality=sameProduction&&after?.dependencyScopes?.production?.qualityHelperIsolated===true&&changed.some(f=>/\/(?:production|quality-source-recovery)\.mjs$/.test(f))&&changed.every(f=>/\/(?:production|quality-source-recovery|runtime-build)\.mjs$/.test(f));
 let first=policyChanged?0:onlyQuality?10:9;
 const rules=[
  [/\/(?:contracts|commerce-focus|commerce-skills|workflow-intent|workflow-design|workflow-gates|intake|business-constraints|model-director|production|scene-package)\.mjs$/,0],
  [/\/(?:source-inspection|observation-request|evidence-index|commerce-directors)\.mjs$/,1],
  [/\/(?:capabilities|resource-catalog|resource-discovery|native-recipes)\.mjs$/,4],
  [/\/(?:voice|captions|audio-assets|minimax-client|minimax|codex-provider)\.mjs$/,5],
  [/\/local-speak\.py$/,5],
  [/\/(?:local-transcribe|speech-worker)\.py$/,1],
  [/\/(?:story-validation)\.mjs$/,6],
  [/\/(?:audio|source-audio|observation-audio)\.mjs$/,7],
 ];
 for(const file of changed){
  if(file==='lib/creative/quality-source-recovery.mjs'&&!after?.dependencyScopes?.production?.qualityHelperIsolated)first=0;
  if(file==='lib/creative/production.mjs'&&sameProduction)continue;
  if(file==='lib/creative/capabilities.mjs'&&before?.dependencyScopes?.capabilities?.planning&&before.dependencyScopes.capabilities.planning===after?.dependencyScopes?.capabilities?.planning)continue;
  for(const [pattern,index]of rules)if(pattern.test(file))first=Math.min(first,index);
 }
 return {changedFiles:changed,from:order[first],keys:Object.keys(checkpoints).filter(key=>key==='direction-preview'||(key.startsWith('shot-')?8:order.indexOf(key))>=first)};
}

// Called at process startup (or by the launcher's independent disk probe), never
// recomputed inside health: a running process cannot claim later disk changes.
export async function captureRuntimeIdentity(root, dataRoot){
 const hashTree=async(directory,filter=()=>true)=>{
  const entries=[];
  async function walk(dir){for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
   const name=dir+'/'+item.name;if(item.isDirectory())await walk(name);else if(item.isFile()&&filter(name))entries.push([name,resourceHash(await fs.readFile(path.join(root,name)))]);
  }}
  await walk(directory);return entries.sort(([a],[b])=>a<b?-1:a>b?1:0);
 };
 const build=await captureRuntimeBuild(root);
 const source=[...Object.entries(build.files),...await hashTree('prompts'),...await hashTree('config',name=>!name.endsWith('.local.json')&&!name.endsWith('.env'))];
 const webFiles=await hashTree('web-dist');
 return {sourceHash:resourceHash(JSON.stringify(source)),frontendHash:resourceHash(JSON.stringify(webFiles)),frontendSourceHash:resourceHash(JSON.stringify(await hashTree('web'))),dataRoot:await fs.realpath(path.resolve(dataRoot)),workspaceRoot:await fs.realpath(root)};
}
