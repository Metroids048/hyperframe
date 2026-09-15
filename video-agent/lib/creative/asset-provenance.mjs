import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {insist} from './contracts.mjs';

// This registry is written only after provider download and decoding. Requests
// and imported project manifests are never an authority for generation claims.
export async function trustedAssetProvenance(root,assetId,sha256){
 const directory=path.join(root,'data/generated-assets');
 const ids=await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 for(const name of ids.filter(n=>/^[a-zA-Z0-9_-]+\.json$/.test(n))){
  const bytes=await fs.readFile(path.join(directory,name));
  const record=JSON.parse(bytes);
  if(record.assetId!==assetId||record.sha256!==sha256)continue;
  insist(record.status==='downloaded'&&record.provider==='runninghub'&&record.providerTaskId&&record.requestHash&&record.mediaDecoded===true,'生成来源记录不完整','PROVENANCE_INVALID');
  return {generated:true,provider:record.provider,providerTaskId:record.providerTaskId,provenance:{recordId:name.slice(0,-5),recordSha256:createHash('sha256').update(bytes).digest('hex'),sourceSha256:sha256,requestHash:record.requestHash,reviewStatus:'pending'}};
 }
 return {};
}
