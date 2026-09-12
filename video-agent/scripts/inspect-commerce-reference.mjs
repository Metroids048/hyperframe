import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ffmpeg,run} from '../lib/edit/media.mjs';
const dir=path.resolve('outputs/commerce-next/reference');await fs.mkdir(dir,{recursive:true});
const ranges=[[56,63],[96,111],[113,128],[132,148],[149,168],[172,190],[261,274],[285,294]];
for(const [i,[start,end]] of ranges.entries()){const cells=[];for(let j=0;j<8;j++){const t=start+(end-start)*j/7,file=path.join(dir,`source-${i}-${j}.jpg`);await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i','assets/commerce-showcase/moka-brewing.webm','-frames:v','1','-vf','scale=400:225',file]);const label=Buffer.from(`<svg width="400" height="30"><rect width="400" height="30" fill="#111"/><text x="10" y="22" fill="white" font-size="20">source ${t.toFixed(2)} s</text></svg>`);cells.push({input:await sharp(file).extend({bottom:30,background:'#111'}).composite([{input:label,left:0,top:225}]).toBuffer(),left:j%4*400,top:Math.floor(j/4)*255});}await sharp({create:{width:1600,height:510,channels:3,background:'#111'}}).composite(cells).jpeg().toFile(path.join(dir,`contact-${i}.jpg`));}
console.log(dir);
