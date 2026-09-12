import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const commit='ea7e1dbd0bd2afb77370b946461c4ea16afdb387';
const root=path.resolve(import.meta.dirname,'../config/hyperframes');
const families=['hyperframes','hyperframes-core','hyperframes-creative','hyperframes-animation','media-use','product-launch-video','hyperframes-audio','embedded-captions'];
const resources=['lt-mask-reveal','mk-callout-highlight','comparison-split','caption-editorial-emphasis','caption-clip-wipe','marker-highlight'];
const get=async url=>{const r=await fetch(url,{headers:{'User-Agent':'hyperframe-local-resource-audit'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());};
const tree=JSON.parse(await get(`https://api.github.com/repos/heygen-com/hyperframes/git/trees/${commit}?recursive=1`));
if(tree.truncated)throw Error('Incomplete upstream tree');
const selected=tree.tree.filter(x=>x.type==='blob'&&(x.path==='LICENSE'||x.path==='registry/registry.json'||families.some(n=>x.path.startsWith(`skills/${n}/`))||resources.some(n=>x.path.startsWith(`registry/components/${n}/`)||x.path.startsWith(`registry/blocks/${n}/`))));
const index={schemaVersion:1,source:'https://github.com/heygen-com/hyperframes',commit,runtime:'0.8.33',retrievedAt:new Date().toISOString(),files:[],execution:'Guidance and reviewed adapters only. Vendored scripts are never automatically executed.',missing:[]};
await fs.mkdir(root,{recursive:true});
let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<selected.length){const item=selected[cursor++];if(item.size>4*1024**2){index.missing.push({path:item.path,reason:'requires separate large-asset review'});continue;}const target=path.join(root,commit,item.path);try{let bytes=await fs.readFile(target).catch(()=>null);if(!bytes){bytes=await get(`https://raw.githubusercontent.com/heygen-com/hyperframes/${commit}/${item.path}`);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});}const gitBlobSha1=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');if(gitBlobSha1!==item.sha)throw Error('File does not match pinned upstream Git blob: '+item.path);index.files.push({path:item.path,gitBlobSha1,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}catch(error){index.missing.push({path:item.path,reason:error.message});}}}));
index.files.sort((a,b)=>a.path.localeCompare(b.path));
if(index.missing.length){await fs.writeFile(path.join(root,'snapshot-failed-'+Date.now()+'.json'),JSON.stringify(index,null,2));throw Error('Incomplete snapshot; previous verified manifest preserved');}
await fs.writeFile(path.join(root,'snapshot.next.json'),JSON.stringify(index,null,2));await fs.rename(path.join(root,'snapshot.next.json'),path.join(root,'snapshot.json'));
console.log(JSON.stringify({commit,files:index.files.length,missingCount:index.missing.length,missing:index.missing.slice(0,8)}));
if(index.missing.length)process.exitCode=1;
