import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireAsset,acquisitionSummary} from './fetch-commerce-focus-assets.mjs';
import {systemMediaTools} from './fetch-commerce-focus-assets-system.mjs';

export async function fetchTutorialCandidates(root,{fetchImpl=fetch,tools=systemMediaTools()}={}){
  const list=JSON.parse(await fs.readFile(path.join(root,'docs/commerce-focus-v1/tutorial-candidates.json'),'utf8'));
  const output=path.join(root,'assets/commerce-focus-v1/tutorial-download-results.json');
  const prior=JSON.parse(await fs.readFile(output,'utf8').catch(e=>{if(e.code!=='ENOENT')throw e;return '{"assets":[]}';}));
  const records=[];await fs.mkdir(path.dirname(output),{recursive:true});
  for(const source of list.assets){
    const record={...source,approvedForProduction:false,attemptedAt:new Date().toISOString()};
    try{record.download=await acquireAsset(root,source,source,tools,{fetchImpl,previous:prior.assets.find(a=>a.id===source.id)});}
    catch(error){record.download={status:'blocked',localPath:null,sha256:null,reason:error.message};}
    records.push(record);console.log(source.id,record.download.status,record.download.reason||record.download.localPath);
    await fs.writeFile(output,JSON.stringify({schemaVersion:1,summary:{...acquisitionSummary(records),pending:list.assets.length-records.length},assets:records},null,2));
  }
  return acquisitionSummary(records).failed?2:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  fetchTutorialCandidates(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')).then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=2;});
}
