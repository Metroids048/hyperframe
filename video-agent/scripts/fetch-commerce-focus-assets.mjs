import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWriteStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Acquisition only. Downloading never approves identity, rights or visual quality.
export function mediaURL(value,id){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.hostname!=='videos.pexels.com'||u.username||u.password||u.port||!u.pathname.startsWith(`/video-files/${id}/`)||!u.pathname.endsWith('.mp4'))throw Error('Unverified media origin or asset identity');
  return u.href;
}
export function pageMediaURLs(html,id){
  const text=html.replaceAll('\\/','/').replaceAll('&amp;','&');
  const urls=[...text.matchAll(/file-url=([^&"<>\s]+)/g)].map(m=>decodeURIComponent(m[1]));
  urls.push(...[...text.matchAll(/https:\/\/videos\.pexels\.com\/[^\s"<>\\]+\.mp4(?:\?[^\s"<>\\]*)?/g)].map(m=>m[0]));
  return [...new Set(urls.flatMap(u=>{try{return [mediaURL(u,id)];}catch{return [];}}))];
}
export async function checkedFetch(url,id,fetchImpl=fetch){
  let current=mediaURL(url,id);
  for(let n=0;n<4;n++){
    const response=await fetchImpl(current,{redirect:'manual',signal:AbortSignal.timeout(180000)});
    if([301,302,303,307,308].includes(response.status)){
      const next=mediaURL(new URL(response.headers.get('location'),current).href,id);
      await response.body?.cancel();current=next;continue;
    }
    if(response.status!==200)throw Error('Media HTTP '+response.status);
    return {response,url:current};
  }
  throw Error('Media redirect limit exceeded');
}
export async function acquireAsset(root,source,resolved,tools,{fetchImpl=fetch,previous=null,maxBytes=512*1024*1024}={}){
  const base=path.resolve(root,'assets/commerce-focus-v1/candidates');
  const directory=path.resolve(root,source.targetDirectory);
  if(!directory.startsWith(base+path.sep)||!/^[A-Za-z0-9_-]+$/.test(source.id))throw Error('Invalid asset destination');
  await fs.mkdir(directory,{recursive:true});
  const realBase=await fs.realpath(base),realDirectory=await fs.realpath(directory);
  if(!realDirectory.startsWith(realBase+path.sep))throw Error('Symlink escaped candidate directory');
  const file=path.join(realDirectory,source.id+'.mp4');
  const verify=async target=>{
    const metadata=await tools.probe(target);
    if(!(metadata.duration>0&&metadata.width>0&&metadata.height>0))throw Error('Invalid video metadata');
    await tools.run(tools.ffmpeg,['-v','error','-xerror','-i',target,'-f','null','-'],{timeout:300000});
    return metadata;
  };
  const exists=await fs.lstat(file).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(exists){
    if(!exists.isFile()||!previous?.download?.sha256||await tools.hashFile(file)!==previous.download.sha256)throw Error('Existing asset has no matching receipt; retained, not overwritten');
    const metadata=await verify(file);
    return {...previous.download,status:'downloaded_not_approved',metadata,reused:true};
  }
  let urls=[];
  if(resolved){
    if(resolved.sourcePage!==source.sourcePage||String(resolved.providerAssetId)!==String(source.providerAssetId)||!resolved.discoveryEvidence)throw Error('Resolved URL provenance mismatch');
    urls=[mediaURL(resolved.downloadUrl,source.providerAssetId)];
  }else{
    const page=await fetchImpl(source.sourcePage,{signal:AbortSignal.timeout(20000)});
    if(!page.ok)throw Error('Source page HTTP '+page.status+'; use verified direct link or lawful local import');
    urls=pageMediaURLs(await page.text(),source.providerAssetId);
  }
  if(!urls.length)throw Error('No original video URL verified from source page');
  const {response,url}=await checkedFetch(urls[0],source.providerAssetId,fetchImpl);
  const mime=(response.headers.get('content-type')||'').split(';')[0];
  if(!['video/mp4','application/octet-stream'].includes(mime)||!response.body)throw Error('Download did not return video bytes');
  const length=Number(response.headers.get('content-length')||0);
  if(length>maxBytes){await response.body.cancel();throw Error('Video exceeds download size budget');}
  const temporary=file+'.partial-'+randomUUID();let count=0;const hash=createHash('sha256');
  try{
    await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,encoding,done){count+=chunk.length;if(count>maxBytes)return done(Error('Video exceeds download size budget'));hash.update(chunk);done(null,chunk);}}),createWriteStream(temporary,{flags:'wx'}));
    if(!count||length&&length!==count)throw Error('Truncated download');
    const metadata=await verify(temporary);
    await fs.link(temporary,file); // Atomic create; never overwrite another writer.
    return {status:'downloaded_not_approved',localPath:path.relative(root,file).replaceAll('\\','/'),sha256:hash.digest('hex'),bytes:count,metadata,downloadUrl:url,fullDecode:'pass',reused:false};
  }finally{await fs.unlink(temporary).catch(()=>{});}
}
export function acquisitionSummary(records){
  const downloaded=records.filter(r=>r.download?.status==='downloaded_not_approved').length;
  return {status:downloaded===records.length&&records.length?'downloads_complete_needs_review':'downloads_incomplete',attempted:records.length,downloaded,failed:records.length-downloaded,approvedForProduction:false,productionReady:false};
}
export async function main(root,{ids=null,fetchImpl=fetch,tools=null}={}){
  const sourceFile=path.join(root,'docs/commerce-focus-v1/assets.sources.json');
  const all=JSON.parse(await fs.readFile(sourceFile,'utf8')).assets;
  const sources=ids?all.filter(a=>ids.includes(a.id)):all;
  if(!sources.length||ids&&sources.length!==new Set(ids).size)throw Error('Unknown or empty asset selection');
  const resolutions=JSON.parse(await fs.readFile(path.join(root,'docs/commerce-focus-v1/assets.resolved-downloads.json'),'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '{"assets":[]}';})).assets;
  const reportFile=path.join(root,'assets/commerce-focus-v1/download-results.json');
  const previous=JSON.parse(await fs.readFile(reportFile,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '{"assets":[]}';}));
  await fs.mkdir(path.dirname(reportFile),{recursive:true});
  if(previous.assets.length)await fs.writeFile(reportFile+'.'+Date.now()+'.history',JSON.stringify(previous,null,2),{flag:'wx'});
  tools??=await import('../lib/edit/media.mjs');
  const results=new Map(previous.assets.map(a=>[a.id,a]));const attempted=[];
  for(const source of sources){
    const record={...source,attemptedAt:new Date().toISOString(),approvedForProduction:false};
    try{record.download=await acquireAsset(root,source,resolutions.find(a=>a.id===source.id),tools,{fetchImpl,previous:results.get(source.id)});}
    catch(error){record.download={status:'blocked',localPath:null,sha256:null,reason:error.message};}
    results.set(source.id,record);attempted.push(record);
    const report={schemaVersion:2,summary:acquisitionSummary(attempted),selectedIds:sources.map(a=>a.id),assets:all.map(a=>results.get(a.id)||a)};
    const temp=reportFile+'.'+randomUUID();await fs.writeFile(temp,JSON.stringify(report,null,2));await fs.rename(temp,reportFile);
    console.log(source.id,record.download.status,record.download.localPath||record.download.reason);
  }
  const summary=acquisitionSummary(attempted);console.log(JSON.stringify(summary));
  return summary.failed?2:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const arg=process.argv.find(a=>a.startsWith('--ids='));
  main(root,{ids:arg?arg.slice(6).split(','):null}).then(code=>{process.exitCode=code;}).catch(e=>{console.error(e.message);process.exitCode=2;});
}
