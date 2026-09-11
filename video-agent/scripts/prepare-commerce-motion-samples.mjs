import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,probe,hashFile} from '../lib/edit/media.mjs';
const parentFile=path.join(ROOT,'assets/commerce-showcase/moka-brewing.webm');
const parentHash=await hashFile(parentFile),sources=JSON.parse(await fs.readFile(path.join(ROOT,'assets/commerce-showcase/sources.json'),'utf8'));
const parent=(Array.isArray(sources)?sources:[sources]).find(s=>s.sha256===parentHash);
if(!parent?.rights||parentHash!=='c7416059f082eec0e406d5b4a4ed3c1d0d65af30a08e4dc874ffdc63a7d1062c')throw Error('Actual reviewed source changed');
const dir=path.join(ROOT,'assets/commerce-motion');await fs.mkdir(dir,{recursive:true});
const spans=[['01-grind',18,26],['02-fill',75,83],['03-assemble',149,157],['04-extract',181,189],['05-pour',264,272],['06-finish',286,294]],records=[];
for(const [name,start,end] of spans){const file=path.join(dir,name+'.mp4');
 if(!await fs.stat(file).then(s=>s.size>0).catch(()=>false))await run(ffmpeg,['-y','-v','error','-threads','2','-ss',String(start),'-i',parentFile,'-t',String(end-start),'-map','0:v:0','-map','0:a:0','-vf','fps=30,setsar=1','-c:v','libx264','-preset','ultrafast','-qp','0','-threads','2','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',file],{timeout:180000});
 const metadata=await probe(file),sha256=await hashFile(file);
 if(Math.abs(metadata.duration-(end-start))>.08||metadata.sourceFps!=='30/1')throw Error('Derived clip duration/fps mismatch');
 records.push({file:name+'.mp4',sha256,bytes:(await fs.stat(file)).size,rights:parent.rights,sourcePage:parent.sourcePage,url:parent.url,parent:{file:path.relative(ROOT,parentFile).replaceAll('\\','/'),sha256:parentHash,startSeconds:start,endSeconds:end},processing:'Agent-assisted shot preparation from reviewed real footage; lossless H.264 picture, CFR30 and AAC audio; source itself is already edited footage',observationEvidence:'outputs/resume/moka-ranges-contact.jpg',metadata});
 await fs.writeFile(path.join(dir,'sources.json'),JSON.stringify(records,null,2));console.log(JSON.stringify({file:name,seconds:metadata.duration,sha256,bytes:records.at(-1).bytes}));
}
await fs.writeFile(path.join(dir,'ATTRIBUTION.md'),`# Source and preparation\n\nShokuiku Cuisine — Brewing Coffee with Moka Alessi and Peugeot Bresil Mill. CC BY 3.0.\n${parent.sourcePage}\n${parent.rights.url}\n\nThese are real motion excerpts prepared by the production Agent after inspecting source frames, not AI-generated footage or unedited camera originals. Source intervals and hashes are in sources.json. No brand endorsement is implied.\n`);
