import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {probe,hashFile,ffmpeg,run} from '../lib/edit/media.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=JSON.parse(await fs.readFile(path.join(root,'docs/commerce-focus-v1/assets.sources.json'),'utf8'));
const records=[];
for(const source of sources.assets){
  const record={...source,attemptedAt:new Date().toISOString(),approvedForProduction:false};
  try{
    const response=await fetch(source.sourcePage,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Source page HTTP '+response.status);
    const html=(await response.text()).replaceAll('\\/','/').replaceAll('&amp;','&');
    // Only a video URL actually present in the source page; never synthesize CDN paths.
    const matches=[...html.matchAll(/https:\/\/[^\s"<>\\]+\.mp4(?:\?[^\s"<>\\]*)?/g)].map(m=>m[0]);
    const candidates=[...new Set(matches)].filter(u=>{const parsed=new URL(u);return ['videos.pexels.com','player.vimeo.com'].includes(parsed.hostname)&&u.includes(source.providerAssetId);});
    if(!candidates.length)throw Error('No verifiable original download URL exposed; use source-page download UI');
    const directory=path.resolve(root,source.targetDirectory);if(!directory.startsWith(path.join(root,'assets/commerce-focus-v1/candidates')+path.sep))throw Error('Invalid output directory');
    await fs.mkdir(directory,{recursive:true});
    const file=path.join(directory,source.id+'.mp4'),media=await fetch(candidates[0],{signal:AbortSignal.timeout(60000)});
    if(!media.ok||!(media.headers.get('content-type')||'').includes('video'))throw Error('Download did not return a video');
    const bytes=Buffer.from(await media.arrayBuffer());await fs.writeFile(file+'.partial',bytes);
    const metadata=await probe(file+'.partial');
    if(!metadata.duration||!metadata.width)throw Error('Invalid media metadata');
    await run(ffmpeg,['-v','error','-xerror','-i',file+'.partial','-f','null','-'],{timeout:300000});
    await fs.rename(file+'.partial',file);
    record.download={status:'downloaded_not_approved',localPath:path.relative(root,file),sha256:await hashFile(file),bytes:bytes.length,metadata,downloadUrl:candidates[0],fullDecode:'pass'};
  }catch(error){record.download={status:'blocked',localPath:null,sha256:null,reason:error.message};}
  records.push(record);console.log(source.id,record.download.status,record.download.reason||record.download.localPath);
  await fs.mkdir(path.join(root,'assets/commerce-focus-v1'),{recursive:true});
  await fs.writeFile(path.join(root,'assets/commerce-focus-v1/download-results.json'),JSON.stringify({schemaVersion:1,assets:records},null,2));
}
