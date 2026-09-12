import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const command = process.argv[2] || 'build';
const briefPath = path.resolve(process.argv[3] || 'brief.example.json');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function readBrief() {
  const b=JSON.parse(await fs.readFile(briefPath,'utf8'));
  for(const [key,max] of Object.entries({brand:8,brandLatin:14,product:12,hook:18,cta:18})) {
    if(typeof b[key] !== 'string' || !b[key].trim() || [...b[key]].length>max) throw Error(`${key} 必须是 1–${max} 字的文本`);
  }
  if(b.duration!==15) throw Error('首版支持 15 秒；请设置 duration: 15');
  if(!Array.isArray(b.benefits)||b.benefits.length!==3||b.benefits.some(x=>typeof x!=='string'||!x.trim()||[...x].length>10)) throw Error('benefits 需要三个不超过 10 字的卖点');
  if(typeof b.image!=='string'||!/^assets\/[\w.-]+\.(png|jpg|jpeg|webp)$/i.test(b.image)) throw Error('image 必须是 assets/ 下的图片文件');
  await fs.access(path.join(root,b.image));
  return b;
}
async function runHF(args) {
  const local=path.join(root,'node_modules/hyperframes/bin/hyperframes.mjs');
  const cached=path.join(root,'../.npm-cache/_npx/702923228c2ce1e6/node_modules/hyperframes/bin/hyperframes.mjs');
  const cli=await fs.access(local).then(()=>local).catch(()=>cached);
  const env={...process.env,HYPERFRAMES_NO_TELEMETRY:'1',XDG_STATE_HOME:path.join(root,'.state'),npm_config_cache:path.join(root,'../.npm-cache'),HYPERFRAMES_FFMPEG_PATH:path.join(root,'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),HYPERFRAMES_FFPROBE_PATH:path.join(root,'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),HYPERFRAMES_BROWSER_PATH:'C:/Program Files/Google/Chrome/Application/chrome.exe'};
  await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[cli,...args],{cwd:root,env,stdio:'inherit',windowsHide:true});p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error(`HyperFrames ${args[0]} failed (${c})`)));});
}
async function build() {
  const b=await readBrief();
  const scenes=[{id:'hook',start:0,end:5,headline:b.hook,visual:'商品全貌 + 大字钩子',transition:'crossfade'},{id:'benefits',start:5,end:10,headline:b.product,claims:b.benefits,visual:'商品细节 + 三个卖点',transition:'crossfade'},{id:'close',start:10,end:15,headline:b.cta,visual:'品牌与商品并列',transition:'hold'}];
  await fs.mkdir('outputs',{recursive:true});
  await fs.writeFile('outputs/storyboard.json',JSON.stringify({mode:'deterministic-prototype',brief:b,scenes},null,2));
  const template=await fs.readFile('composition.template','utf8');
  const vars={...b,benefit1:b.benefits[0],benefit2:b.benefits[1],benefit3:b.benefits[2]};
  const html=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>key==='hook' ? b.hook.split(/(?<=[，,])/u).map(part=>`<span style="display:block">${escape(part.trim())}</span>`).join('') : escape(vars[key]));
  await fs.writeFile('index.html',html);
  await fs.writeFile('outputs/status.json',JSON.stringify({state:'composed',brief:path.basename(briefPath),composition:'index.html',duration:15},null,2));
  console.log('✓ Brief 已校验 → 三幕分镜已生成 → HyperFrames 工程已生成');
}
try {
  if(command==='build') await build();
  else if(command==='check') await runHF(['check']);
  else if(command==='render') {await build();await runHF(['render','--output','outputs/qing-demo.mp4','--fps','30','--quality','standard','--workers','1']);await fs.writeFile('outputs/status.json',JSON.stringify({state:'rendered',video:'outputs/qing-demo.mp4',duration:15},null,2));}
  else if(command==='preview') await runHF(['preview','--background','--port','3017']);
  else if(command==='status') await runHF(['preview','--status']);
  else throw Error('用法: node agent.mjs build|check|render|preview|status [brief.json]');
}catch(error){console.error(error.message);process.exitCode=1;}


