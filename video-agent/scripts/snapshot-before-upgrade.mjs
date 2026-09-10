import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(root,'..','.implementation-backups',new Date().toISOString().replace(/[:.]/g,'-'));
const skip=new Set(['node_modules','.git','.state','.waveform-cache','web-dist']);
const copied=new Map();let files=0,bytes=0,linked=0;
await fs.mkdir(target,{recursive:true});
async function walk(src,dst,rel=''){
  await fs.mkdir(dst,{recursive:true});
  for(const e of await fs.readdir(src,{withFileTypes:true})){
    const r=path.join(rel,e.name),s=path.join(src,e.name),d=path.join(dst,e.name);
    if(skip.has(e.name)||r==='data'+path.sep+'models'||r==='data'+path.sep+'edit-engine'||r==='outputs')continue;
    if(e.isSymbolicLink())continue;
    if(e.isDirectory()){await walk(s,d,r);continue;}
    const stat=await fs.stat(s),key=stat.dev+':'+stat.ino;
    if(stat.ino&&copied.has(key)){try{await fs.link(copied.get(key),d);linked++;files++;continue;}catch{}}
    await fs.copyFile(s,d);copied.set(key,d);files++;bytes+=stat.size;
  }
}
await walk(root,path.join(target,'video-agent'));
const record={createdAt:new Date().toISOString(),source:root,target,files,copiedBytes:bytes,deduplicatedLinks:linked,excluded:['dependencies and caches','data/models','data/edit-engine request logs','outputs historical test artifacts (left in place)'],note:'Source/config/assets/project metadata and media copied. Dedup links point only to other backup files, never to live source.'};
await fs.writeFile(path.join(target,'snapshot.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
