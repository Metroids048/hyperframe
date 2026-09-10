import {composeShots} from './multishot.mjs';
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const STUDIO=path.join(ROOT,'studio-workspace');
export const STUDIO_URL='http://127.0.0.1:3018/#project/studio-workspace';
export const defaults={brand:'青序',brandLatin:'QING',product:'青柠气泡水',benefits:['青柠香气','细密气泡','冰爽即刻'],hook:'给日常，来点清爽。',cta:'开启你的清爽时刻'};
export class InputError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export function validateBrief(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('请填写商品信息');
 const b={};
 for(const [key,label,max,fallback] of [['brand','品牌名',8,'商品展示'],['product','商品名',12],['brandLatin','英文品牌',14,'PRODUCT'],['hook','开场文案',18,'让日常，多一点喜欢。'],['cta','收尾文案',18,'发现你的下一份喜欢']]){
  const value=input[key];if(value!==undefined&&typeof value!=='string')throw new InputError(`${label}格式不正确`);
  const text=(value||'').trim()||fallback;
  if(!text||[...text].length>max)throw new InputError(`${label}请填写 1–${max} 个字`);b[key]=text;
 }
 if(input.benefits===undefined)input={...input,benefits:[]};if(!Array.isArray(input.benefits)||input.benefits.length>3||input.benefits.some(v=>typeof v!=='string'||[...v.trim()].length>10))throw new InputError('最多三个卖点，每项不超过 10 字');
 b.benefits=input.benefits.map(v=>v.trim()).filter(Boolean);b.duration=15;b.width=1280;b.height=720;b.theme=['fresh','coffee','tech','perfume'].includes(input.theme)?input.theme:'fresh';return b;
}
export function storyboard(b){return [
 {id:'s1',start:0,end:5,title:'开场吸引',headline:b.hook,copy:`${b.product} · 新品亮相`,visual:'商品主图缓慢推进，开场标题进入',image:0},
 {id:'s2',start:5,end:10,title:'展示卖点',headline:b.product,copy:b.benefits.join(' / '),visual:'商品细节与已提供的信息展示',image:1},
 {id:'s3',start:10,end:15,title:'品牌收尾',headline:b.cta,copy:b.brandLatin,visual:'品牌、商品与行动文案收尾',image:2}
 ];}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateStoryboard(input,b){
 if(!Array.isArray(input)||input.length!==3)throw new InputError('请保留三个分镜');
 return storyboard(b).map((scene,i)=>{
  const s=input[i];if(!s||typeof s.headline!=='string'||typeof s.copy!=='string')throw new InputError('分镜文案格式不正确');
  const headline=s.headline.trim(),copy=s.copy.trim();
  if(!headline||[...headline].length>(i===1?12:18))throw new InputError(`第 ${i+1} 幕标题最多 ${i===1?12:18} 字，不能为空`);
  if((!copy&&i!==1)||[...copy].length>(i===0?24:i===1?36:14))throw new InputError(`第 ${i+1} 幕补充文案过长或为空`);
  if(i===1){const benefits=copy?copy.split('/').map(v=>v.trim()):[];if(benefits.length>3||benefits.some(v=>!v||[...v].length>10))throw new InputError('第二幕最多三个卖点，用 / 分隔，每项最多 10 字，也可留空');}
  return {...scene,headline,copy};
 });
}
export async function compose(dir,b,scenes=storyboard(b)){
 if(scenes[0]?.layout)return composeShots(dir,b,scenes);
 let template=await fs.readFile(path.join(ROOT,'composition.template'),'utf8');
 template=template.replaceAll('LIME SPARKLING','PRODUCT STORY').replaceAll('一口，切换好心情','新品，值得被看见').replaceAll('清爽上线','新品亮相').replaceAll('FRESH MOMENTS, EVERY DAY.','A LITTLE MORE TO LOVE.').replaceAll('FEEL THE FRESH','MADE FOR YOUR EVERYDAY').replaceAll('让每一口，都有新鲜感。','从细节，发现更多喜欢。').replaceAll('MAKE ROOM FOR FRESH.','DISCOVER SOMETHING GOOD.').replaceAll('现在，来一罐 ↗','即刻了解 ↗').replaceAll('虚构品牌 · 创意演示','商品展示 · 创意预览').replaceAll('气泡水示例商品','商品主图');
 const edited=validateStoryboard(scenes,b),benefits=edited[1].copy.split('/').map(v=>v.trim()).filter(Boolean);
 template=template.replace(/<div class="benefit"><span class="num">0[123]<\/span><span>\{\{benefit([123])\}\}<\/span><\/div>/g,(row,n)=>benefits[Number(n)-1]?row:'');
 if(!benefits.length)template=template.replace(/tl\.from\('#s2 \.benefit'.*?;\r?\n/,'');
 template=template.replace('{{product}} · 新品亮相','{{scene1Copy}}').replace('<h2 class="headline">{{product}}</h2>','<h2 class="headline">{{scene2Title}}</h2>').replace('<div class="brand-hero">{{brandLatin}}</div>','<div class="brand-hero">{{scene3Copy}}</div>');
 const vars={...b,hook:edited[0].headline,cta:edited[2].headline,scene1Copy:edited[0].copy,scene2Title:edited[1].headline,scene3Copy:edited[2].copy,benefit1:benefits[0],benefit2:benefits[1],benefit3:benefits[2]};let img=0;
 template=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>key==='image'?`assets/product${++img}.png`:key==='hook'?vars.hook.split(/(?<=[，,])/u).map(s=>`<span style="display:block">${esc(s)}</span>`).join(''):esc(vars[key]));
 const themes={fresh:['#F4F3DF','#173B27','#C9E66F','#6B7858','#AFBA98','#426440'],coffee:['#F5EBDD','#492918','#E9B887','#806346','#C7AD90','#76513B'],tech:['#EDF2F7','#142C45','#95C9F0','#526982','#A8BACD','#43617D'],perfume:['#F8ECE8','#5D293A','#EAC0BC','#896275','#C7A7B5','#854E66']};
 const palette=themes[b.theme||'fresh'];let colorIndex=0;
 const sourceColors=themes.fresh;template=template.replace(/#F4F3DF|#173B27|#C9E66F|#6B7858|#AFBA98|#426440/g,c=>palette[sourceColors.indexOf(c)]);
 if(b.theme==='tech')template=template.replace('</style>','.photo,.s2 .photo,.s3 .photo{border-radius:24px}.s3 .brand-hero{font-family:Georgia,serif}</style>');
 if(b.theme==='coffee')template=template.replace('</style>','.s3 .brand-hero{font-size:92px;letter-spacing:-5px}.photo{border-radius:28px}</style>');
 await fs.writeFile(path.join(dir,'index.html'),template);
 await fs.writeFile(path.join(dir,'DESIGN.md'),(await fs.readFile(path.join(ROOT,'DESIGN.md'),'utf8'))+`\n## 当前案例覆盖\n主题：${b.theme||'fresh'}；品牌：${b.brand}；配色：${palette.join(', ')}。本例为商品展示演示，不新增未经提供的产品事实。\n`);
 await fs.copyFile(path.join(ROOT,'hyperframes.json'),path.join(dir,'hyperframes.json'));
 for(const file of ['gsap.min.js','music.wav'])await fs.copyFile(path.join(ROOT,'assets',file),path.join(dir,'assets',file));
 await fs.writeFile(path.join(dir,'meta.json'),JSON.stringify({id:path.basename(dir),name:`${b.brand} · ${b.product}`}));
}
export const runtimeEnv=()=>({...process.env,HYPERFRAMES_NO_TELEMETRY:'1',XDG_STATE_HOME:path.join(ROOT,'.state'),HYPERFRAMES_FFMPEG_PATH:path.join(ROOT,'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe'),HYPERFRAMES_FFPROBE_PATH:path.join(ROOT,'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),HYPERFRAMES_BROWSER_PATH:process.env.HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
export function runHF(dir,args,{logFile,onOutput,timeoutMs=300000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs'),...args],{cwd:dir,env:runtimeEnv(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  const log=logFile?createWriteStream(logFile,{flags:'a'}):null;let tail='',timedOut=false,failureTimer=null,reportedFailure=false;
  const receive=chunk=>{const s=chunk.toString();tail=(tail+s).slice(-5000);log?.write(s);onOutput?.(s);if(!reportedFailure&&/Render failed|Check failed:/.test(tail)){reportedFailure=true;failureTimer=setTimeout(()=>spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}),1000);}};child.stdout.on('data',receive);child.stderr.on('data',receive);
  const timer=setTimeout(()=>{timedOut=true;spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});},timeoutMs);
  child.on('error',e=>{clearTimeout(timer);clearTimeout(failureTimer);log?.end();reject(e);});
  child.on('close',code=>{clearTimeout(timer);clearTimeout(failureTimer);log?.end();code===0&&!timedOut&&!reportedFailure?resolve(tail):reject(new Error(timedOut?'任务超时，输入已保留，可以重试':`HyperFrames ${args[0]} 未完成，输入已保留，可以重试。详情已保存在项目日志。`));});
 });
}
export async function verifyVideo(file,expected={duration:15,width:1280,height:720}){
 const output=await new Promise((resolve,reject)=>{let data='';const p=spawn(runtimeEnv().HYPERFRAMES_FFPROBE_PATH,['-v','error','-show_streams','-show_format','-of','json',file],{windowsHide:true});p.stdout.on('data',s=>data+=s);p.on('error',reject);p.on('close',c=>c===0?resolve(data):reject(Error('成片无法读取')));});
 const meta=JSON.parse(output),v=meta.streams.find(s=>s.codec_type==='video'),a=meta.streams.find(s=>s.codec_type==='audio');
 if(!v||!a||v.width!==expected.width||v.height!==expected.height||Math.abs(Number(meta.format.duration)-expected.duration)>.1)throw Error('成片的画幅、时长或音轨不符合要求');
 return {duration:Number(meta.format.duration),width:v.width,height:v.height,size:Number(meta.format.size),videoCodec:v.codec_name,audioCodec:a.codec_name};
}
