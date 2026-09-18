import {preserveGuidance} from './guidance-history.mjs';
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
  async function read(directory){await Promise.all((await fs.readdir(path.join(root,directory),{withFileTypes:true})).map(async item=>{const file=directory+'/'+item.name;if(item.isDirectory())await read(file);else if(item.isFile()&&/\.(?:mjs|js)$/.test(item.name)){const bytes=await fs.readFile(path.join(root,file));files[file]=resourceHash(bytes);if(['lib/creative/native-recipes.mjs','lib/creative/commerce-layouts.mjs'].includes(file))await preserveGuidance(root,bytes,files[file]);}}));}
  await read('lib');
  await Promise.all(['server.mjs','package-lock.json','scripts/native-scene-worker.mjs','scripts/native-scene-job.ps1','scripts/local-speak.py','scripts/local-transcribe.py','scripts/speech-worker.py','web/commerce.html','web/commerce.js','config/voice_profiles.json','config/skills/product-understanding.md','config/skills/marketing-planner.md','config/skills/video-director.md'].map(async file=>{{const bytes=await fs.readFile(path.join(root,file));files[file]=resourceHash(bytes);if(['lib/creative/native-recipes.mjs','lib/creative/commerce-layouts.mjs'].includes(file))await preserveGuidance(root,bytes,files[file]);}}));
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
 const order=['brief','observe','material','product','marketing','creative','resources','narration','story','director','hyperframes','timing','shots','assemble','quality'];
 const priorProduction=before?.dependencyScopes?.production||after?.historicalProductionScopes?.[before?.files?.['lib/creative/production.mjs']];
 const sameProduction=priorProduction?.planningAndAssembly&&priorProduction.planningAndAssembly===after?.dependencyScopes?.production?.planningAndAssembly;
 const onlyQuality=sameProduction&&after?.dependencyScopes?.production?.qualityHelperIsolated===true&&changed.some(f=>/\/(?:production|quality-source-recovery)\.mjs$/.test(f))&&changed.every(f=>/\/(?:production|quality-source-recovery|runtime-build)\.mjs$/.test(f));
 let first=policyChanged?0:onlyQuality?14:13;
 const rules=[
  [/\/commerce-agent-v2\.mjs$/,3],
  [/config\/skills\/product-understanding\.md$/,3],
  [/config\/skills\/marketing-planner\.md$/,4],
  [/config\/skills\/video-director\.md$/,9],
  [/config\/voice_profiles\.json$/,7],
  [/\/(?:contracts|commerce-focus|commerce-skills|workflow-intent|workflow-design|workflow-gates|intake|business-constraints|model-director|production|scene-package|editorial-strategy|production-gaps)\.mjs$/,0],
  [/\/(?:source-inspection|observation-request|evidence-index|commerce-directors|inspection-budget)\.mjs$/,1],
  [/\/visual-direction-evidence\.mjs$/,5],
  [/\/(?:capabilities|resource-catalog|resource-discovery|native-recipes)\.mjs$/,6],
  [/\/(?:voice|voice-matching|captions|narration-timing|audio-assets|minimax-client|minimax|codex-provider)\.mjs$/,7],
  [/\/local-speak\.py$/,7],
  [/\/(?:local-transcribe|speech-worker)\.py$/,1],
  [/\/(?:story-validation|duration-contract)\.mjs$/,8],
  [/\/(?:audio|source-audio|observation-audio)\.mjs$/,11],
 ];
 for(const file of changed){
  if(file==='lib/creative/quality-source-recovery.mjs'&&!after?.dependencyScopes?.production?.qualityHelperIsolated)first=0;
  if(file==='lib/creative/production.mjs'&&sameProduction)continue;
  if(file==='lib/creative/capabilities.mjs'&&before?.dependencyScopes?.capabilities?.planning&&before.dependencyScopes.capabilities.planning===after?.dependencyScopes?.capabilities?.planning)continue;
  for(const [pattern,index]of rules)if(pattern.test(file))first=Math.min(first,index);
 }
 return {changedFiles:changed,from:order[first],keys:Object.keys(checkpoints).filter(key=>key==='direction-preview'||(key.startsWith('shot-')?12:order.indexOf(key))>=first)};
}
