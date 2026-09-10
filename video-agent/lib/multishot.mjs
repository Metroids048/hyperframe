import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT,InputError,runtimeEnv} from './workflow.mjs';
export const layouts=['hero','split','reverse','detail','statement','duo','closing'];
export function planShots(b,settings,imageCount){
 const duration=settings.duration,count=Math.min(24,Math.max(4,Math.ceil(duration/6)));
 const sequence=['hero','split','detail','reverse','statement','duo'];
 const frames=Math.round(duration*30),each=Math.floor(frames/count);let start=0;
 return Array.from({length:count},(_,i)=>{
  const last=i===count-1,first=i===0,layout=last?'closing':sequence[i%sequence.length];
  const benefit=b.benefits[(i-1+b.benefits.length)%Math.max(1,b.benefits.length)];
  const headline=first?b.hook:last?b.cta:layout==='detail'?(benefit||'从细节，发现喜欢'):layout==='statement'?(benefit||b.product):b.product;
  const copy=first?b.product:last?b.brandLatin:layout==='duo'?b.benefits.join(' · '):headline===benefit?b.product:benefit||b.brand;
  const end=i===count-1?frames/30:(each*(i+1))/30;
  const shot={id:'shot-'+(i+1),start,end,duration:end-start,title:first?'开场':last?'收尾':layout==='detail'?'细节特写':layout==='statement'?'重点文案':'商品展示',headline,copy,layout,image:i%imageCount,visual:layout,source:'uploaded-image'};start=end;return shot;
 });
}
export function validateShots(input,imageCount){
 if(!Array.isArray(input)||input.length<3||input.length>24)throw new InputError('请保留 3–24 个镜头');
 const ids=new Set();let frame=0;
 const shots=input.map((s,i)=>{
  if(!s||typeof s!=='object'||typeof s.id!=='string'||!/^shot-[a-z0-9-]+$/.test(s.id)||ids.has(s.id))throw new InputError('镜头标识不正确或重复');ids.add(s.id);
  const duration=Number(s.duration??(s.end-s.start)),frames=Math.round(duration*30);
  if(!Number.isFinite(duration)||duration<2||duration>12)throw new InputError('每个镜头请设为 2–12 秒');
  if(typeof s.headline!=='string'||!s.headline.trim()||[...s.headline.trim()].length>24)throw new InputError('镜头标题请填写 1–24 字');
  if(typeof s.copy!=='string'||[...s.copy.trim()].length>48)throw new InputError('镜头补充文案最多 48 字');
  if(!layouts.includes(s.layout))throw new InputError('不支持的镜头版式');
  if(!Number.isInteger(s.image)||s.image<0||s.image>=imageCount)throw new InputError('镜头引用的图片不存在');
  const start=frame/30;frame+=frames;
  return {id:s.id,start,end:frame/30,duration:frames/30,title:typeof s.title==='string'?s.title.slice(0,16):'商品镜头',headline:s.headline.trim(),copy:s.copy.trim(),layout:s.layout,image:s.image,visual:s.layout,source:'uploaded-image'};
 });
 if(frame<300||frame>5400)throw new InputError('总时长请保持在 10–180 秒');return shots;
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function composeShots(dir,b,input){
 const imageCount=Number(b.assetCount)||Math.max(...input.map(s=>s.image))+1,shots=validateShots(input,imageCount),duration=shots.at(-1).end;
 const palettes={fresh:['#F4F3DF','#173B27','#C9E66F'],coffee:['#F5EBDD','#492918','#E9B887'],tech:['#EDF2F7','#142C45','#95C9F0'],perfume:['#F8ECE8','#5D293A','#EAC0BC']};
 const [paper,ink,accent]=palettes[b.theme||'fresh'];
 const sections=shots.map((s,i)=>`<section id="${s.id}" class="scene clip ${s.layout}" data-start="${s.start}" data-duration="${s.duration}" data-track-index="1"><div class="scene-content"><header><span>${esc(b.brandLatin)} / ${esc(b.brand)}</span><span class="series">PRODUCT JOURNAL</span></header><div class="stage"><div class="photo" data-layout-allow-overflow><img src="assets/product${s.image+1}.png" alt="${esc(b.product)}"></div>${s.layout==='duo'?`<div class="photo second" data-layout-allow-overflow><img src="assets/product${(s.image+1)%imageCount+1}.png" alt="${esc(b.product)}细节"></div>`:''}<div class="words"><span class="kicker">${esc(s.title)} / ${String(i+1).padStart(2,'0')}</span><h1>${esc(s.headline).replace(/，/g,'，<br>')}</h1><div class="rule"></div><p>${esc(s.copy)}</p></div></div><footer><span>${esc(b.product)}</span><span>${String(i+1).padStart(2,'0')} / ${String(shots.length).padStart(2,'0')}</span></footer></div></section>`).join('\n');
 const timeline=shots.map((s,i)=>`tl.fromTo('#${s.id} .words',{y:24,opacity:0},{y:0,opacity:1,duration:.55,ease:'power3.out'},${s.start+.12});tl.fromTo('#${s.id} .photo img',{scale:${s.layout==='detail'?1.22:1.02},x:0},{scale:${s.layout==='detail'?1.32:1.08},x:${i%2?8:-8},duration:${s.duration},ease:'sine.inOut'},${s.start});tl.fromTo('#${s.id} .rule',{scaleX:0},{scaleX:1,duration:.6,ease:'power2.out'},${s.start+.32});`).join('\n');
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><script src="assets/gsap.min.js"></script><style>
@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei");font-weight:100 900}
@font-face{font-family:"Georgia";src:local("Georgia");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1280px;height:720px;overflow:hidden;background:${paper};color:${ink};font-family:'Microsoft YaHei',sans-serif}.scene{position:absolute;inset:0;width:1280px;height:720px;background:${paper};overflow:hidden}.scene-content{width:100%;height:100%;padding:36px 52px;display:flex;flex-direction:column;gap:24px}header,footer{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;font-size:18px;line-height:28px}header{font-size:24px;font-family:Georgia,'Microsoft YaHei',serif}.series{font:14px 'Microsoft YaHei',sans-serif;letter-spacing:3px}.stage{flex:1;min-height:0;display:flex;gap:42px;align-items:center}.photo{width:535px;height:510px;flex-shrink:0;border-radius:20px;overflow:hidden;background:${paper}}.photo img{width:100%;height:100%;object-fit:contain}.words{flex:1;min-width:0;display:flex;flex-direction:column;gap:22px}.kicker{font-size:19px;letter-spacing:2px}h1{font-size:64px;line-height:1.28;font-weight:800;overflow-wrap:anywhere;letter-spacing:-1px}p{font-size:27px;line-height:1.65;overflow-wrap:anywhere}.rule{height:5px;width:64px;background:currentColor;transform-origin:left}footer{font-size:15px;letter-spacing:2px}
.hero .stage,.closing .stage{flex-direction:row-reverse}.hero .photo{height:510px;border-radius:220px 220px 22px 22px}.hero h1{font-size:70px}.reverse .stage{flex-direction:row-reverse}.detail .photo{width:660px;border-radius:8px}.detail img{object-fit:cover}.detail h1{font-size:58px}.statement{background:${ink};color:${paper}}.statement .photo{width:380px;height:380px;border-radius:190px}.statement h1{font-size:78px}.statement .words{padding-left:30px}.statement .rule,.closing .rule{background:${accent}}.duo .stage{gap:22px;flex-wrap:wrap;align-content:center}.duo .photo{width:320px;height:300px;border-radius:14px}.duo .second img{object-fit:cover;object-position:50% 45%}.duo .words{padding-left:12px;min-width:350px}.duo h1{font-size:54px}.duo p{font-size:25px}.closing{background:${ink};color:${paper}}.closing .photo{width:485px;height:480px;border-radius:24px}.closing h1{font-size:68px}.closing p{color:${accent};font-family:Georgia,serif;font-size:40px}
</style></head><body><div id="root" data-composition-id="product-film" data-width="1280" data-height="720" data-start="0" data-duration="${duration}">${sections}<audio id="music" src="assets/music.wav" data-start="0" data-duration="${duration}" data-track-index="3" data-volume=".6"></audio></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});${timeline}window.__timelines['product-film']=tl;</script></body></html>`;
 await fs.writeFile(path.join(dir,'index.html'),html);await fs.writeFile(path.join(dir,'DESIGN.md'),(await fs.readFile(path.join(ROOT,'DESIGN.md'),'utf8'))+`\n## 多镜头覆盖\n${b.theme}；${shots.length} 镜头，${duration} 秒。配色 ${paper} / ${ink} / ${accent}；实物图片与准确文字并重；7 种排版；不用虚构功效填充时长。\n`);
 await fs.copyFile(path.join(ROOT,'hyperframes.json'),path.join(dir,'hyperframes.json'));await fs.copyFile(path.join(ROOT,'assets/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));
 const audio=spawnSync(runtimeEnv().HYPERFRAMES_FFMPEG_PATH,['-y','-v','error','-stream_loop','-1','-i',path.join(ROOT,'assets/music.wav'),'-t',String(duration),'-af',`afade=t=in:d=0.4,afade=t=out:st=${duration-1.2}:d=1.2`,'-c:a','pcm_s16le',path.join(dir,'assets/music.wav')],{windowsHide:true,timeout:30000});if(audio.status!==0)throw Error('配乐时长处理失败');
 await fs.writeFile(path.join(dir,'meta.json'),JSON.stringify({id:path.basename(dir),name:`${b.brand} · ${duration} 秒 / ${shots.length} 镜头`}));
}
