import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const media=/\.(mp4|mov|webm|png|jpe?g|webp)$/i;
/** Directory discovery is server-owned; clients get opaque IDs, not arbitrary file access. */
export async function discoverMaterialRoots(root){
 let settings={};try{settings=JSON.parse(await fs.readFile(path.join(root,'config/commerce.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const bases=[path.join(root,'assets'),...(settings.commerce?.materialRoots||[]).map(p=>path.resolve(root,p))],found=[];
 async function walk(dir,depth=0){if(depth>4)return;const entries=await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});const files=entries.filter(e=>e.isFile()&&media.test(e.name)&&!/(?:contact|review-|candidate|poster|crop)/i.test(e.name)).map(e=>path.join(dir,e.name));if(files.length){const real=await fs.realpath(dir),id=createHash('sha256').update(real).digest('hex').slice(0,24);if(!found.some(r=>r.id===id))found.push({id,label:path.relative(root,dir).replaceAll(String.fromCharCode(92),'/'),directory:real,files,videos:files.filter(f=>/\.(mp4|mov|webm)$/i.test(f)).length,images:files.filter(f=>/\.(png|jpe?g|webp)$/i.test(f)).length});}for(const e of entries.filter(e=>e.isDirectory()&&!e.name.startsWith('.')))await walk(path.join(dir,e.name),depth+1);}
 for(const base of bases)await walk(base);return found;
}
export async function resolveMaterialRoot(root,id){const match=(await discoverMaterialRoots(root)).find(r=>r.id===id);if(!match)throw Error('素材目录不存在或已变化');return match;}
