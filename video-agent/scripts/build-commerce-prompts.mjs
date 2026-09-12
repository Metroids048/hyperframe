import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),source=await fs.readFile(path.join(root,'docs/commerce-agent-next/03_RUNTIME_PROMPTS.md'),'utf8'),directory=path.join(root,'prompts/commerce');
await fs.mkdir(directory,{recursive:true});const files=[];
for(let i=0;i<=8;i++){const heading=new RegExp('^## R'+i+'\\.','m'),start=source.search(heading);if(start<0)throw Error('Missing R'+i);const rest=source.slice(start),end=rest.slice(1).search(/^## /m),text=(end<0?rest:rest.slice(0,end+1)).trim()+'\n';await fs.writeFile(path.join(directory,'R'+i+'.md'),text);files.push({id:'R'+i,sha256:createHash('sha256').update(text).digest('hex')});}
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({version:1,source:'03_RUNTIME_PROMPTS.md',sourceSha256:createHash('sha256').update(source).digest('hex'),files},null,2));console.log('R0–R8 runtime prompts built');
