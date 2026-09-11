import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,probe,hashFile} from '../lib/edit/media.mjs';

const projectId=process.argv[2];
if(!/^[a-f0-9-]{36}$/.test(projectId||''))throw Error('A real project id is required');
const projectDir=path.join(ROOT,'data/creative-validation',projectId),project=JSON.parse(await fs.readFile(path.join(projectDir,'native-project.json'),'utf8'));
const revision=project.revisions.find(r=>r.id===(process.argv[3]||project.currentRevisionId));
if(!revision?.rendered)throw Error('The selected revision has no completed MP4 export');
const directory=path.join(projectDir,revision.directory),document=JSON.parse(await fs.readFile(path.join(directory,'document.json'),'utf8')),video=path.join(directory,'commerce-final.mp4');
const output=path.join(ROOT,'outputs/resume','commerce-motion-qa-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const report={projectId,revisionId:revision.id,video:path.relative(ROOT,video),sha256:await hashFile(video),metadata:await probe(video),inputAssets:project.assets.map(a=>({id:a.id,name:a.name,kind:a.kind})),scenes:document.scenes.map(s=>({...s,media:document.nodes.filter(n=>n.sceneId===s.id&&n.kind==='video'),text:document.nodes.filter(n=>n.sceneId===s.id&&n.kind==='text').map(n=>n.params.text)})),audioGraph:document.audioGraph,frames:[]};
const cells=[];
for(const [index,scene] of document.scenes.entries()){
 for(const fraction of [.25,.7]){
  const time=(scene.startFrame+scene.durationFrames*fraction)/document.fps,file=path.join(output,'frame-'+report.frames.length+'.jpg');
  await run(ffmpeg,['-y','-v','error','-threads','2','-ss',time.toFixed(4),'-i',video,'-frames:v','1','-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2',file],{timeout:45000});
  const label=Buffer.from(`<svg width="640" height="28"><rect width="640" height="28" fill="#111"/><text x="10" y="20" font-size="16" fill="white">Scene ${index+1} | ${time.toFixed(2)} sec</text></svg>`);
  cells.push({input:await sharp(file).extend({bottom:28,background:'#111'}).composite([{input:label,left:0,top:360}]).toBuffer(),left:(cells.length%2)*640,top:Math.floor(cells.length/2)*388});
  report.frames.push({sceneId:scene.id,time,file:path.relative(ROOT,file)});
 }
}
await sharp({create:{width:1280,height:Math.ceil(cells.length/2)*388,channels:3,background:'#111'}}).composite(cells).jpeg({quality:90}).toFile(path.join(output,'contact.jpg'));
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output,projectId,revisionId:revision.id,sha256:report.sha256,duration:report.metadata.duration,scenes:report.scenes.map(s=>({id:s.id,effect:s.effect,start:s.startFrame/30,end:(s.startFrame+s.durationFrames)/30,media:s.media.length,text:s.text})),audioNodes:Array.isArray(document.audioGraph)?document.audioGraph.length:document.audioGraph?.nodes?.length}));
