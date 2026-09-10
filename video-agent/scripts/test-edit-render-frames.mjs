import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {run,ffmpeg} from '../lib/edit/media.mjs';
const parent=path.join(ROOT,'outputs/edit-web-acceptance');
const runs=(await fs.readdir(parent)).sort().reverse();let dir,report;
for(const name of runs){try{const r=JSON.parse(await fs.readFile(path.join(parent,name,'report.json'),'utf8'));report=r;dir=path.join(parent,name);break;}catch{}}
assert(report,'请先完成 test-edit-web');
const project=JSON.parse(await fs.readFile(path.join(dir,'projects',report.projectId,'project.json'),'utf8'));
const revision=project.revisions.find(r=>r.id===report.captionRevision),asset=Object.values(project.assets)[0];
const video=path.join(dir,'projects',project.id,'revisions',revision.id,'video.mp4'),source=path.join(dir,'projects',project.id,'assets',asset.id,asset.work),out=path.join(dir,'render-frames');await fs.mkdir(out,{recursive:true});
const pairs=[[149,299,false],[150,600,true],[239,689,true],[240,690,false]];const results=[];
for(const [n,sourceN,caption] of pairs){
 const final=path.join(out,`output-${n}.png`),original=path.join(out,`source-${sourceN}.png`);
 for(const [input,index,dest] of [[video,n,final],[source,sourceN,original]])await run(ffmpeg,['-y','-v','error','-i',input,'-vf',`select='eq(n,${index})'`,'-vsync','0','-frames:v','1',dest]);
 // Above the subtitle: verify retained footage actually comes from the selected source frame.
 const roi={left:0,top:0,width:640,height:260};const a=await sharp(final).extract(roi).removeAlpha().raw().toBuffer(),b=await sharp(original).extract(roi).removeAlpha().raw().toBuffer();let difference=0;for(let i=0;i<a.length;i++)difference+=Math.abs(a[i]-b[i]);difference/=a.length;assert(difference<12,`source frame mismatch at output ${n}: ${difference}`);
 const subtitleRoi={left:250,top:285,width:140,height:45};const c=await sharp(final).extract(subtitleRoi).removeAlpha().raw().toBuffer(),d=await sharp(original).extract(subtitleRoi).removeAlpha().raw().toBuffer();let changed=0;for(let i=0;i<c.length;i++)changed+=Math.abs(c[i]-d[i]);changed/=c.length;assert(caption?changed>15:changed<12,`caption render boundary mismatch at frame ${n}: ${changed}`);
 results.push({outputFrame:n,sourceFrame:sourceN,caption,footageMeanDifference:difference,captionRegionDifference:changed});console.log('PASS rendered frame '+n+' -> source '+sourceN+', caption '+caption);
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(results,null,2));
