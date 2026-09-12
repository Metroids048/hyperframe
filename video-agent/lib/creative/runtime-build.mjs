import fs from 'node:fs/promises';
import path from 'node:path';
import {resourceHash} from './capabilities.mjs';

export async function captureRuntimeBuild(root){
  const files={};
  async function read(directory){await Promise.all((await fs.readdir(path.join(root,directory),{withFileTypes:true})).map(async item=>{const file=directory+'/'+item.name;if(item.isDirectory())await read(file);else if(item.isFile()&&/\.(?:mjs|js)$/.test(item.name))files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));}
  await read('lib');
  await Promise.all(['server.mjs','package-lock.json','scripts/native-scene-worker.mjs','scripts/native-scene-job.ps1','scripts/local-speak.py','web/commerce.html','web/commerce.js'].map(async file=>{files[file]=resourceHash(await fs.readFile(path.join(root,file)));}));
  return {mode:'server-module-load',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))};
}
