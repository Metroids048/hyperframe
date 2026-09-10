import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,validateBrief,compose,runHF,verifyVideo,storyboard} from '../lib/workflow.mjs';
const cases=JSON.parse(await fs.readFile(path.join(ROOT,'cases.json'),'utf8'));
for(const item of cases){
 const dir=path.join(ROOT,'showcase',item.id);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
 for(let n=1;n<=3;n++)await fs.copyFile(path.join(ROOT,'assets/cases',item.id+'.png'),path.join(dir,'assets',`product${n}.png`));
 const b=validateBrief(item.brief);await compose(dir,b);await fs.writeFile(path.join(dir,'storyboard.json'),JSON.stringify(storyboard(b),null,2));
 await fs.writeFile(path.join(dir,'provenance.json'),JSON.stringify({brand:'fictional',copy:'Codex-authored demonstration',image:'built-in image_gen',sourcePrompt:item.description,video:'HyperFrames HTML/GSAP; not generative video'},null,2));
 if(item.id==='qing')await fs.copyFile(path.join(ROOT,'outputs/qing-demo.mp4'),path.join(dir,'video.mp4'));
 else {console.log('Checking '+item.id);await runHF(dir,['check'],{logFile:path.join(dir,'check.log')});console.log('Rendering '+item.id);await runHF(dir,['render','--output','video.mp4','--quality','standard','--fps','30','--workers','1','--strict'],{logFile:path.join(dir,'render.log')});}
 const media=await verifyVideo(path.join(dir,'video.mp4'));await fs.writeFile(path.join(dir,'media.json'),JSON.stringify(media));console.log('READY '+item.id+' '+media.duration+'s');
}
