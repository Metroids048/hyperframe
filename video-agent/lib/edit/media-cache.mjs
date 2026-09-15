import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ROOT} from '../workflow.mjs';

export const MEDIA_CACHE_VERSION='edit-media-v2-20260910';
export const cacheKey=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const cacheRoot=()=>path.resolve(process.env.EDIT_MEDIA_CACHE_DIR||path.join(ROOT,'.cache/edit-media'));
const pending=new Map();
export async function cachedFile(namespace,key,extension,build) {
  const directory=path.join(cacheRoot(),MEDIA_CACHE_VERSION,namespace),file=path.join(directory,key+extension);
  try{if((await fs.stat(file)).size>0)return {file,hit:true};}catch{}
  if(pending.has(file)){await pending.get(file);return {file,hit:true};}
  const work=(async()=>{await fs.mkdir(directory,{recursive:true});const temp=path.join(directory,key+'.'+randomUUID()+'.partial'+extension);try{await build(temp);if(!(await fs.stat(temp)).size)throw Error('媒体缓存产物为空');await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true}).catch(()=>{});}})();
  pending.set(file,work);try{await work;return {file,hit:false};}finally{pending.delete(file);}
}
async function fileDigest(file) {
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(file))digest.update(chunk);
  return digest.digest('hex');
}
async function validBundle(dir, metadata, {verifyHashes=true}={}) {
  if(!metadata || !Array.isArray(metadata.files)||!metadata.files.length)return false;
  for(const name of metadata.files){
    if(typeof name!=='string'||!name||path.isAbsolute(name)||name.includes('\\'))return false;
    const relative=path.relative(dir,path.resolve(dir,name));
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return false;
    try{const stat=await fs.lstat(path.join(dir,name));if(!stat.isFile()||!stat.size)return false;if(verifyHashes&&(!metadata.fileHashes?.[name]||await fileDigest(path.join(dir,name))!==metadata.fileHashes[name]))return false;}catch{return false;}
  }
  return true;
}
export async function cachedBundle(namespace,key,build) {
  const dir=path.join(cacheRoot(),MEDIA_CACHE_VERSION,namespace,key),manifest=path.join(dir,'cache.json');
  try{const metadata=JSON.parse(await fs.readFile(manifest,'utf8'));if(await validBundle(dir,metadata))return {dir,metadata,hit:true};}catch{}
  if(pending.has(manifest)){await pending.get(manifest);const metadata=JSON.parse(await fs.readFile(manifest,'utf8'));if(!await validBundle(dir,metadata))throw Error('媒体缓存不完整；请重试导入');return {dir,metadata,hit:true};}
  const work=(async()=>{
    // Keep native-tool working paths short. The full content identity remains
    // the final directory; only the unpublished sibling uses a compact name.
    const staging=path.join(path.dirname(dir),'b-'+randomUUID().slice(0,12)),retired=path.join(path.dirname(dir),'r-'+randomUUID().slice(0,12));
    await fs.mkdir(staging,{recursive:true});
    let moved=false;
    try {
      const metadata=await build(staging);
      if(!await validBundle(staging,metadata,{verifyHashes:false}))throw Error('媒体缓存不完整；请重试导入');
      metadata.fileHashes=Object.fromEntries(await Promise.all(metadata.files.map(async name=>[name,await fileDigest(path.join(staging,name))])));
      await fs.writeFile(path.join(staging,'cache.json'),JSON.stringify(metadata));
      // Rebuild into fresh inodes: prior revisions may hard-link the old cache.
      try{await fs.rename(dir,retired);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
      try{await fs.rename(staging,dir);}catch(error){if(moved)await fs.rename(retired,dir);throw error;}
      return metadata;
    } finally {await fs.rm(staging,{recursive:true,force:true}).catch(()=>{});}
  })();
  pending.set(manifest,work);try{return {dir,metadata:await work,hit:false};}finally{pending.delete(manifest);}
}
