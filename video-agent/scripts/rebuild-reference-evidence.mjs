import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ffmpeg,run} from '../lib/edit/media.mjs';
const root=path.resolve('outputs/commerce-rebuild-v2/references');
for(const [name,times] of [['launch',[.6,2,4,7,10,12]],['capstone',[3,6,9,12,16,20]],['variables',[1,3,6,10,14,18]]]){
 const file=path.join(root,name+'.mp4');await run(ffmpeg,['-v','error','-i',file,'-f','null','-']);
 const cells=[];for(const [i,t] of times.entries()){
 const img=path.join(root,`${name}-${t}.jpg`);await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=480:270',img]);
 const label=Buffer.from(`<svg width="480" height="30"><rect width="480" height="30" fill="#111"/><text x="12" y="22" fill="white" font-size="18">${name} / ${t}s</text></svg>`);
 cells.push({input:await sharp(img).extend({bottom:30,background:'#111'}).composite([{input:label,left:0,top:270}]).toBuffer(),left:i%3*480,top:Math.floor(i/3)*300});}
 await sharp({create:{width:1440,height:600,channels:3,background:'#111'}}).composite(cells).jpeg().toFile(path.join(root,name+'-contact.jpg'));console.log(name+' decoded / contact saved');
}
