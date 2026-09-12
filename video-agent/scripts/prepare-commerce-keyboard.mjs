import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {probe,hashFile,ffmpeg,run} from '../lib/edit/media.mjs';
const directory=path.join(ROOT,'assets/commerce-keyboard'),entries=[['01-keyboard-close.mp4','7534237'],['02-keyboard-angle.mp4','7534236']],records=[],cells=[];
for(const [index,[file,id]] of entries.entries()){
 const local=path.join(directory,file),metadata=await probe(local),sha256=await hashFile(local);
 records.push({file,sha256,bytes:(await fs.stat(local)).size,metadata,sourcePage:`https://www.pexels.com/video/a-person-typing-on-a-keyboard-${id}/`,url:`https://videos.pexels.com/video-files/${id}/${id}-hd_1920_1080_25fps.mp4`,rights:{status:'licensed',license:'Pexels License',url:'https://www.pexels.com/license/',usageTerms:'Free use and modification; no implied endorsement or stock-media redistribution.',author:'Mikhail Nilov'},scope:'Local product-video demonstration with original animation overlay; no brand endorsement or unsupported product claims.'});
 for(const [i,fraction] of [.12,.5,.85].entries()){
  const time=metadata.duration*fraction,frame=path.join(directory,`review-${index}-${i}.jpg`);
  await run(ffmpeg,['-y','-v','error','-threads','2','-ss',String(time),'-i',local,'-frames:v','1','-vf','scale=640:360',frame]);
  const label=Buffer.from(`<svg width="640" height="28"><rect width="640" height="28" fill="#111"/><text x="10" y="20" font-size="16" fill="white">Clip ${index+1} | ${time.toFixed(2)} sec</text></svg>`);
  cells.push({input:await sharp(frame).extend({bottom:28,background:'#111'}).composite([{input:label,left:0,top:360}]).toBuffer(),left:i*640,top:index*388});
 }
}
await sharp({create:{width:1920,height:776,channels:3,background:'#111'}}).composite(cells).jpeg({quality:90}).toFile(path.join(directory,'contact.jpg'));
await fs.writeFile(path.join(directory,'sources.json'),JSON.stringify(records,null,2));
await fs.writeFile(path.join(directory,'ATTRIBUTION.md'),'# Keyboard footage\n\nMikhail Nilov / Pexels. The two source clips are retained without modification. Pexels License permits modification and advertising use; this local demo adds native animation and editorial changes, and implies no endorsement.\n\nLicense: https://www.pexels.com/license/\n\n'+records.map(r=>`- ${r.file}: ${r.sourcePage}; SHA-256 ${r.sha256}`).join('\n')+'\n');
const catalog=path.join(ROOT,'assets/commerce-showcase/sources.json'),known=JSON.parse(await fs.readFile(catalog,'utf8'));
await fs.writeFile(catalog,JSON.stringify([...known.filter(r=>!records.some(next=>next.sha256===r.sha256)),...records.map(r=>({...r,file:'../commerce-keyboard/'+r.file}))],null,2)+'\n');
console.log(JSON.stringify(records));
