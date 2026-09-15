import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {insist,safeRelativePath} from './contracts.mjs';

// Explicitly registered local exports only. This does not scan arbitrary user files
// or turn reference-author videos into editable Agent-generated projects.
export async function readFinishedWorks(root){
  let definitions;
  try{definitions=JSON.parse(await fs.readFile(path.join(root,'examples/commerce/finished-works.json'),'utf8'));}
  catch(error){if(error.code==='ENOENT')return [];throw error;}
  insist(Array.isArray(definitions),'成品清单无效','FINISHED_WORKS_INVALID');
  const realRoot=await fs.realpath(root),ready=[],ids=new Set();
  for(const entry of definitions){
    insist(/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id||'')&&!ids.has(entry.id),'成品标识无效或重复','FINISHED_WORKS_INVALID');ids.add(entry.id);
    try{
      const checked=async(name,extension)=>{insist(path.extname(name||'').toLowerCase()===extension,'成品文件类型无效','FINISHED_WORKS_INVALID');const real=await fs.realpath(safeRelativePath(root,name)),relative=path.relative(realRoot,real);insist(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative),'成品文件超出工作区','FINISHED_WORKS_INVALID');insist((await fs.stat(real)).isFile(),'成品文件不存在','FINISHED_WORKS_INVALID');return real;};
      const video=await checked(entry.video,'.mp4'),hash=createHash('sha256');for await(const bytes of createReadStream(video))hash.update(bytes);
      const sha256=hash.digest('hex');insist(sha256===entry.sha256,'成品视频内容已变化，需重新登记','FINISHED_WORK_CHANGED');
      const packageFile=entry.package?await checked(entry.package,'.zip'):null;
      ready.push({...entry,video,packageFile,sha256});
    }catch(error){if(error.code!=='ENOENT')throw error;/* An absent local artifact is not a playable work. */}
  }
  return ready;
}
export const publicFinishedWork=entry=>({id:entry.id,title:entry.title,durationSeconds:entry.durationSeconds,provenance:entry.provenance,note:entry.note,sha256:entry.sha256,videoUrl:'/api/commerce-finished/'+entry.id+'/video',packageUrl:entry.packageFile?'/api/commerce-finished/'+entry.id+'/package':null});
