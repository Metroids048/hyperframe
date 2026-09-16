import fs from 'node:fs/promises';
import path from 'node:path';
import {resourceHash} from './capabilities.mjs';

export async function captureRuntimeBuild(root){
  const files={};
  async function read(directory){await Promise.all((await fs.readdir(path.join(root,directory),{withFileTypes:true})).map(async item=>{const file=directory+'/'+item.name;if(item.isDirectory())await read(file);else if(item.isFile()&&/\.(?:mjs|js)$/.test(item.name))files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));}
  await read('lib');
  await Promise.all(['server.mjs','package-lock.json','scripts/native-scene-worker.mjs','scripts/native-scene-job.ps1','scripts/local-speak.py','scripts/local-transcribe.py','scripts/speech-worker.py','web/commerce.html','web/commerce.js'].map(async file=>{files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));
  return {mode:'server-module-load',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))};
}

export function invalidatedProductionCheckpoints(before,after,checkpoints,{policyChanged=false}={}){
 const changed=[...new Set([...Object.keys(before?.files||{}),...Object.keys(after?.files||{})])].filter(file=>before?.files?.[file]!==after?.files?.[file]);
 const order=['brief','observe','material','creative','resources','narration','story','timing','shots','assemble','quality'];
 let first=policyChanged?0:9;
 const rules=[
  [/\/(?:contracts|commerce-focus|workflow-intent|intake|business-constraints|model-director|production|scene-package)\.mjs$/,0],
  [/\/(?:source-inspection|observation-request|evidence-index|commerce-directors)\.mjs$/,1],
  [/\/(?:capabilities|resource-catalog|resource-discovery|native-recipes)\.mjs$/,4],
  [/\/(?:voice|captions|audio-assets|minimax-client|minimax|codex-provider)\.mjs$/,5],
  [/\/local-speak\.py$/,5],
  [/\/(?:local-transcribe|speech-worker)\.py$/,1],
  [/\/(?:story-validation)\.mjs$/,6],
  [/\/(?:audio|source-audio|observation-audio)\.mjs$/,7],
 ];
 for(const file of changed)for(const [pattern,index]of rules)if(pattern.test(file))first=Math.min(first,index);
 return {changedFiles:changed,from:order[first],keys:Object.keys(checkpoints).filter(key=>key==='direction-preview'||(key.startsWith('shot-')?8:order.indexOf(key))>=first)};
}
