// Packaging only: preserve workspace artifacts by content, no production claims.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'.'),destination=path.resolve(process.argv[3]||path.join(root,'workspace-content'));
const objects=path.join(destination,'objects');await fs.mkdir(objects,{recursive:true});
const excluded=[],files=[];const skip=new Set(['node_modules','.git','.cache','.hyperframes','__pycache__','.venv-speech']);
const secret=/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/;
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name),relative=path.relative(root,file).replaceAll('\\','/');
 if(skip.has(entry.name)||relative==='hyperframe_closeout_r1/evidence/baseline-repo'||/\.env(?:\.|$)|\.local\.(?:env|json)$|(?:server\.pid|\.lock|\.tmp|\.bundle-partial)$/.test(entry.name)){excluded.push({path:relative,reason:'dependency, reproducible cache, baseline duplicate or local runtime/private state'});continue;}
 if(entry.isDirectory()){await walk(file);continue;}if(!entry.isFile())continue;
 const bytes=await fs.readFile(file);
 if(/\.(?:json|md|txt|log|html|mjs|js|py|ps1|yml|yaml|env)$/i.test(file)&&secret.test(bytes.toString('utf8'))){excluded.push({path:relative,reason:'credential-like content; retained locally only'});continue;}
 const sha256=createHash('sha256').update(bytes).digest('hex'),chunks=[];
 for(let offset=0;offset<bytes.length;offset+=32*1024*1024){const chunk=bytes.subarray(offset,offset+32*1024*1024),id=createHash('sha256').update(chunk).digest('hex');chunks.push(id);await fs.writeFile(path.join(objects,id),chunk,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});}
 files.push({path:relative,bytes:bytes.length,sha256,chunks,runtime:relative.startsWith('third_party/')||relative.startsWith('video-agent/data/')||relative.startsWith('video-agent/outputs/mijia-brand-test/')||relative.startsWith('video-agent/outputs/r1-closeout-delivery/')});
 }}
// Keep the previous snapshot alongside the new one; no history/object pruning.
const oldManifest=await fs.readFile(path.join(destination,'manifest.json')).catch(()=>null);
if(oldManifest){await fs.mkdir(path.join(destination,'history'),{recursive:true});await fs.writeFile(path.join(destination,'history',createHash('sha256').update(oldManifest).digest('hex')+'.json'),oldManifest,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e;});}
for(const relative of ['video-agent/data','video-agent/outputs','hyperframe_closeout_r1','third_party','video-agent/.cache','video-agent/web-dist','video-agent/assets/source-downloads']){
 if(await fs.stat(path.join(root,relative)).then(s=>s.isDirectory(),()=>false))await walk(path.join(root,relative));
}
files.sort((a,b)=>a.path.localeCompare(b.path));
const ids=new Set(files.flatMap(f=>f.chunks));let storedBytes=0;for(const id of ids)storedBytes+=(await fs.stat(path.join(objects,id))).size;
const manifest={schemaVersion:1,createdAt:new Date().toISOString(),purpose:'Portable local project, media and evidence snapshot; does not grant human approval.',files,excluded,summary:{files:files.length,logicalBytes:files.reduce((s,f)=>s+f.bytes,0),objects:ids.size,storedBytes}};
await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({summary:manifest.summary,credentialExclusions:excluded.filter(x=>x.reason.startsWith('credential'))}));
