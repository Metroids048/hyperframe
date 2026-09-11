import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';
const directory=path.join(ROOT,'assets/creative-observation'),titles=['Aeropress coffee maker inverted.jpg','Aeropress coffee maker parts.jpg','Red AeroPress with Accessories.jpg','2015 AeroPress and 2020 AeroPress Go.jpg'];
await fs.mkdir(directory,{recursive:true});
const headers={'User-Agent':'VideoAgent-LocalValidation/1.0 (development media attribution audit)'},records=JSON.parse(await fs.readFile(path.join(directory,'sources.json'),'utf8').catch(()=>'[]'));
for(const [i,title] of titles.entries()){
 const existing=records.find(r=>r.title===title);if(existing){const bytes=await fs.readFile(path.join(directory,existing.file)).catch(()=>null);if(bytes&&createHash('sha256').update(bytes).digest('hex')===existing.sha256)continue;}
 const url=new URL('https://commons.wikimedia.org/w/api.php');url.search=new URLSearchParams({action:'query',format:'json',prop:'imageinfo',iiprop:'url|extmetadata',titles:'File:'+title});
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Source metadata HTTP '+response.status);
 const info=Object.values((await response.json()).query.pages)[0].imageinfo[0],metadata=info.extmetadata,license=metadata.LicenseShortName?.value;
 if(!/^CC BY(?:-SA)? (2\.0|4\.0)$/.test(license||''))throw Error('Source license needs review: '+title+' '+license);
 let media=await fetch(info.url,{headers,signal:AbortSignal.timeout(60000)});if(media.status===429){const delay=Math.max(20000,Number(media.headers.get('retry-after'))*1000||20000);console.log('Rate limited; retry after '+delay+' ms');await new Promise(resolve=>setTimeout(resolve,delay));media=await fetch(info.url,{headers,signal:AbortSignal.timeout(60000)});}if(!media.ok)throw Error('Media HTTP '+media.status);const bytes=Buffer.from(await media.arrayBuffer());if(bytes.length>20*1024*1024)throw Error('Unexpected source size');
 const name=String(i+1).padStart(2,'0')+'.jpg',sha256=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(path.join(directory,name),bytes);
 records.push({file:name,title,url:info.url,sourcePage:info.descriptionurl,sha256,bytes:bytes.length,rights:{status:'licensed',license,url:metadata.LicenseUrl?.value,author:metadata.Artist?.value,credit:metadata.Credit?.value,usageTerms:metadata.UsageTerms?.value},scope:'engineering observation and same/different product test; not final demo input',downloadedAt:new Date().toISOString()});
 await fs.writeFile(path.join(directory,'sources.json'),JSON.stringify(records,null,2));console.log(name+' '+license+' '+sha256);
}
await fs.writeFile(path.join(directory,'ATTRIBUTION.md'),'# Engineering photo sources\n\n'+records.map(r=>`- ${r.file}: [${r.title}](${r.sourcePage}), ${r.rights.author}. [${r.rights.license}](${r.rights.url}). Original files unchanged. Display normalization/cropping/motion are changes in derived outputs.\n`).join('')+'\nBean Poet: https://www.beanpoet.com/ . Derived publicly shared media must include these credits and the applicable share-alike license. No sponsorship is implied.\n');
