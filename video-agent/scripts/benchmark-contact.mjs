import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ffmpeg,run} from '../lib/edit/media.mjs';
const [video,output]=process.argv.slice(2);if(!video||!output)throw Error('video and output directory required');await fs.mkdir(output,{recursive:true});const times=[2,12,22,32,42,52,58],cells=[];
for(const[i,time]of times.entries()){const file=path.join(output,`at-${time}s.jpg`);await run(ffmpeg,['-y','-v','error','-ss',String(time),'-i',video,'-frames:v','1','-vf','scale=640:360',file]);const label=Buffer.from(`<svg width="640" height="30"><rect width="640" height="30" fill="#111"/><text x="10" y="22" fill="white" font-size="20">${time}s</text></svg>`);cells.push({input:await sharp(file).extend({bottom:30,background:'#111'}).composite([{input:label,left:0,top:360}]).toBuffer(),left:i%2*640,top:Math.floor(i/2)*390});}
await sharp({create:{width:1280,height:1560,channels:3,background:'#111'}}).composite(cells).jpeg().toFile(path.join(output,'contact.jpg'));console.log(path.resolve(output,'contact.jpg'));
