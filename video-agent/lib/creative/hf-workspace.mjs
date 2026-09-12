import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {insist} from './contracts.mjs';

export function assertHyperFramesCapture(log){
  insist(!/active <video> frame\(s\) could not be extracted|video frame injection failed|snapshots may be inaccurate/i.test(log),'HyperFrames 未取得完整媒体帧，快照不能用于画面评审；保留诊断日志','HYPERFRAMES_MEDIA_FRAME');
}

/** Keep pinned FFmpeg away from MAX_PATH without changing the authoritative project. */
export async function prepareHyperFramesWorkspace(root,project,{force=false}={}){
  project=path.resolve(project);
  if(!force&&(process.platform!=='win32'||project.length<160))return {directory:project,finish:async()=>{}};
  const id=randomUUID().slice(0,12),directory=path.join(root,'.cache','hf-'+id),inputs=new Set();
  await fs.mkdir(directory,{recursive:true});
  async function copyInput(rel){
    const from=path.join(project,rel),to=path.join(directory,rel),stat=await fs.lstat(from);
    insist(!stat.isSymbolicLink(),'引擎工作目录不接受符号链接','HYPERFRAMES_PATH');
    if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});for(const name of await fs.readdir(from))await copyInput(path.join(rel,name));return;}
    await fs.mkdir(path.dirname(to),{recursive:true});
    // Media blobs are immutable; compilation files are independent copies.
    if(rel.startsWith('assets'+path.sep))await fs.link(from,to).catch(()=>fs.copyFile(from,to));else await fs.copyFile(from,to);
    inputs.add(rel);
  }
  for(const rel of ['index.html','hyperframes.json','document.json','manifest.json','object-map.json','assets'])if(await fs.access(path.join(project,rel)).then(()=>true,()=>false))await copyInput(rel);
  async function collect(rel=''){
    for(const name of await fs.readdir(path.join(directory,rel))){
      const file=path.join(rel,name);if(inputs.has(file)||file==='assets')continue;
      const from=path.join(directory,file),to=path.join(project,file),stat=await fs.lstat(from);
      insist(!stat.isSymbolicLink(),'引擎输出不能包含符号链接','HYPERFRAMES_PATH');
      if(stat.isDirectory()){await fs.mkdir(to,{recursive:true});await collect(file);}else{await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to);}
    }
  }
  await fs.writeFile(path.join(project,'hyperframes-workspace-'+id+'.json'),JSON.stringify({directory,inputFiles:[...inputs],source:project,reason:'Windows MAX_PATH compatibility; canonical source retained',createdAt:new Date().toISOString()},null,2));
  return {directory,finish:collect};
}
