import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';

const directory=path.join(ROOT,'assets/commerce-showcase'),title='Brewing Coffee with Moka Alessi and Peugeot Bresil Mill - ASMR Coffee Making.webm',file='moka-brewing.webm';
const target=path.join(directory,file),catalog=path.join(directory,'sources.json');
await fs.mkdir(directory,{recursive:true});
const records=JSON.parse(await fs.readFile(catalog,'utf8').catch(()=>'[]'));
const existing=await fs.readFile(target).catch(()=>null),known=records.find(r=>r.file===file);
if(existing){
 const sha256=createHash('sha256').update(existing).digest('hex');
 if(!known||known.sha256!==sha256)throw Error('Existing source has no matching hash record; preserve it for review.');
 console.log(JSON.stringify({file,sha256,cacheHit:true}));
}else{
 const api=new URL('https://commons.wikimedia.org/w/api.php');api.search=new URLSearchParams({action:'query',format:'json',titles:'File:'+title,prop:'imageinfo',iiprop:'url|extmetadata|size'});
 const headers={'User-Agent':'VideoAgent-CommerceShowcase/1.0 (local example with attribution)'};
 const response=await fetch(api,{headers,signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('Source metadata HTTP '+response.status);
 const info=Object.values((await response.json()).query.pages)[0].imageinfo[0],metadata=info.extmetadata;
 if(metadata.LicenseShortName?.value!=='CC BY 3.0'||info.size>100*1024**2)throw Error('Source metadata or license needs review.');
 const media=await fetch(info.url,{headers,signal:AbortSignal.timeout(60000)});if(!media.ok)throw Error('Source media HTTP '+media.status);
 const bytes=Buffer.from(await media.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');if(bytes.length!==info.size)throw Error('Source size does not match metadata.');
 await fs.writeFile(target,bytes,{flag:'wx'});
 records.push({file,title,url:info.url,sourcePage:info.descriptionurl,sha256,bytes:bytes.length,rights:{status:'licensed',license:'CC BY 3.0',url:metadata.LicenseUrl.value,author:'Shokuiku Cuisine',credit:'https://www.youtube.com/watch?v=cEo86BFOlIg',usageTerms:metadata.UsageTerms.value},scope:'WebUI commerce example; licensed source video is already edited footage, not raw B-roll; no endorsement'});
 await fs.writeFile(catalog,JSON.stringify(records,null,2));console.log(JSON.stringify({file,sha256,cacheHit:false}));
}
