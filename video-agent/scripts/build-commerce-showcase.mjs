// Reference-author showcase. This is NOT the product Agent's automatic planning path.
// Reproducible input photographs -> authored scene document -> native HyperFrames HTML.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';

const APP=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(APP,'outputs/commerce-showcase');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha=b=>createHash('sha256').update(b).digest('hex');
const cases=[
 {id:'01-fragrance',title:'香氛 · 编辑式产品广告',photo:7364096,author:'Kateryna Naidenko',source:'https://www.pexels.com/photo/close-up-of-a-simple-glass-perfume-bottle-7364096/',hash:'101e4ea16a0d067bd183b92caaacd1dfe92357154c4c06a036d35c47248a9c5e',duration:15,bg:'#F1EEE7',ink:'#282521',accent:'#766954',serif:true,
  prompt:'使用这张真实香水照片，做一条15秒、1080×1920的香氛展示片。奶油白和石墨灰，杂志式大字与精确留白。先展示完整瓶身，再以同一照片的局部裁切展示瓶盖、玻璃和反射，不伪造新角度。文字只用“气息，自成风格”“光影，有形”“把日常，留给喜欢”“探索香氛”。不要添加香调、容量、价格、促销、配音或音乐。保留瓶身原有标识，不暗示品牌官方合作。',
  crops:[[0,0,1,1],[.20,.10,.63,.53],[.16,.40,.69,.54]],
  scenes:[
   {start:0,end:3.30,layout:'cover',image:0,tag:'FRAGRANCE / EDITORIAL',lines:['气息','自成风格'],note:'香氛精选',size:150,photoPosition:'50% 52%'},
   {start:3.08,end:6.10,layout:'diptych',image:1,secondary:2,tag:'01 / LIGHT & FORM',lines:['光影，有形。'],note:'同一瓶身 · 细节近看',size:130},
   {start:5.88,end:9.00,layout:'bleed',image:2,tag:'02 / CLOSE UP',lines:['留一点','想象。'],note:'FRAGRANCE SELECTION',size:170,photoPosition:'50% 50%'},
   {start:8.78,end:12.10,layout:'editorial',image:0,tag:'03 / EVERYDAY RITUAL',lines:['把日常','留给喜欢'],note:'一种属于自己的表达',size:145,photoPosition:'50% 52%'},
   {start:11.88,end:15,layout:'end',image:0,tag:'THE FRAGRANCE EDIT',lines:['选择你的','气息。'],note:'探索香氛',size:145,photoPosition:'50% 50%'}]},
 {id:'02-headphones',title:'耳机 · 色彩与节奏',photo:7054538,author:'Kindel Media',source:'https://www.pexels.com/photo/over-ear-headphones-7054538/',hash:'64dc11f7bb775ad2e67828b409522b464a54a92aa96dd68aa481109b3962b496',duration:15,bg:'#F4AEB9',ink:'#202022',accent:'#D2FF5A',serif:false,
  prompt:'用这张白色有线耳机照片制作15秒竖屏新品风格展示。粉色、近黑和少量荧光黄绿；使用大标题、节奏型遮罩、照片窗口放大、耳罩局部细节、明确片尾。不把它说成无线耳机，不添加降噪、续航、音质参数或价格。文案：“调到喜欢的频率”“把音乐，放进今天”“近看每一个细节”“你的节奏，由你定义”。无旁白、无BGM。',
  crops:[[.23,.04,.53,.90],[.36,.38,.18,.32],[.52,.36,.19,.34]],
  scenes:[
   {start:0,end:2.85,layout:'cover',image:0,tag:'SOUND / IN YOUR OWN WAY',lines:['调到','喜欢的频率'],note:'把音乐，放进今天',size:140,photoPosition:'50% 50%'},
   {start:2.63,end:5.30,layout:'poster',image:0,tag:'PLAY / YOUR WAY',lines:['PLAY.'],note:'把音乐，放进今天',size:278,photoPosition:'50% 50%'},
   {start:5.08,end:8.20,layout:'diptych',image:1,secondary:2,tag:'01 / LOOK CLOSER',lines:['近看每个','细节'],note:'同一耳机 · 局部裁切',size:148},
   {start:7.98,end:11.35,layout:'editorial',image:0,tag:'02 / FIND YOUR RHYTHM',lines:['你的节奏','由你定义'],note:'YOUR DAY. YOUR PLAYLIST.',size:142,photoPosition:'50% 50%'},
   {start:11.13,end:15,layout:'end',image:0,tag:'A LITTLE MORE MUSIC',lines:['今天','听点喜欢的'],note:'探索耳机',size:140,photoPosition:'50% 50%'}]},
 {id:'03-sneakers',title:'红鞋 · 时尚上新',photo:14447345,author:'Dilma Obando',source:'https://www.pexels.com/photo/red-leather-sneaker-shoes-14447345/',hash:'74032fa103d2265ad47d41935e3e448739fcb5098bd4cbb92f1e654778b31617',duration:12,bg:'#921D37',ink:'#FFF5DE',accent:'#D8F252',serif:false,
  prompt:'使用这张红色休闲鞋实拍图片，做12秒竖屏时尚上新展示。深红、奶油白、少量黄绿。前两秒商品和大标题都要清楚；用方向擦除、同一照片的鞋面/鞋底裁切、错位双图和短片尾做节奏。不要使用其他品牌或型号来补角度，不添加运动性能、折扣或价格。文案：“敢红，不用低调”“换个步调”“走出自己的风格”“探索新风格”。不加声音。',
  crops:[[0,0,1,1],[.29,.50,.55,.32],[.17,.09,.48,.30]],
  scenes:[
   {start:0,end:2.50,layout:'poster',image:0,tag:'COLOR / MAKE YOUR MOVE',lines:['敢红。'],note:'不用低调',size:260,photoPosition:'50% 50%'},
   {start:2.30,end:4.75,layout:'diptych',image:1,secondary:2,tag:'01 / IN THE DETAILS',lines:['换个','步调'],note:'红色鞋面 · 白色线条',size:176},
   {start:4.55,end:7.15,layout:'bleed',image:1,tag:'02 / A DIFFERENT PACE',lines:['走出','自己的风格'],note:'MOVE IN YOUR OWN WAY',size:151,photoPosition:'50% 50%'},
   {start:6.95,end:9.60,layout:'editorial',image:0,tag:'03 / COLOR AS A STATEMENT',lines:['风格','不必解释'],note:'同一双鞋 · 不同构图',size:163,photoPosition:'50% 50%'},
   {start:9.40,end:12,layout:'end',image:0,tag:'THE COLOR EDIT',lines:['下一步','更出色'],note:'探索新风格',size:157,photoPosition:'50% 50%'}]}
];

function picture(scene,role,index,extra=''){
 const id=`${scene.id}-${role}`;
 return `<div class="photo ${extra}" data-layout-allow-overflow><div class="photo-inner"><img id="${id}" data-node-id="${id}" src="assets/shot-${index}.jpg" alt="同一商品照片的${index===0?'整体':'局部'}展示" style="object-position:${scene.photoPosition||'50% 50%'}"></div></div>`;
}
function headline(s){return `<div class="headline" style="font-size:${s.size}px" data-node-id="${s.id}-headline">${s.lines.map((l,i)=>`<div class="line-mask"><div id="${s.id}-line-${i}" class="line">${esc(l)}</div></div>`).join('')}</div>`;}
function sceneHtml(s,index,c){
 const photo=picture(s,'product',s.image), copy=headline(s);
 const head=`<div class="eyebrow enter">${esc(s.tag)}</div>`;
 const note=`<div class="note enter" data-node-id="${s.id}-note">${esc(s.note)}</div>`;
 let body;
 if(s.layout==='cover')body=`${head}<div class="copy">${copy}${note}</div><div class="cover-photo">${photo}</div>`;
 if(s.layout==='poster')body=`${head}<div class="poster-copy">${copy}${note}</div><div class="poster-photo">${photo}</div><div class="stamp enter" data-layout-ignore>THE<br>EDIT ↗</div>`;
 if(s.layout==='diptych')body=`${head}<div class="copy">${copy}</div><div class="diptych"><div class="panel first">${photo}<div class="tiny">01 / DETAIL</div></div><div class="panel second">${picture(s,'detail',s.secondary)}<div class="tiny">02 / DETAIL</div></div></div>${note}`;
 if(s.layout==='bleed')body=`${head}<div class="bleed-photo">${photo}</div><div class="bleed-copy">${copy}${note}</div>`;
 if(s.layout==='editorial')body=`${head}<div class="editorial-photo">${photo}</div><div class="editorial-copy">${copy}${note}</div><div class="index-mark" data-layout-ignore>0${index+1}</div>`;
 if(s.layout==='end')body=`${head}<div class="end-photo">${photo}</div><div class="end-copy">${copy}</div><div class="cta enter"><span>${esc(s.note)}</span><span class="arrow">↗</span></div>`;
 return `<section id="${s.id}" class="clip scene ${s.layout}" data-start="${s.start.toFixed(6)}" data-duration="${(s.end-s.start).toFixed(6)}" data-track-index="${index+1}" style="opacity:${index===0?1:0};z-index:${index+1}"><div class="scene-content">${body}<div class="foot"><span>视觉概念样片 · 非品牌官方广告</span><span>0${index+1} / 05</span></div></div></section>`;
}
function animate(s,i){
 const q=`#${s.id}`,t=s.start+.12,d=s.end-s.start;
 const lines=[];
 if(i>0){
  const mask=i%2?'inset(0 0 0 100%)':'inset(100% 0 0 0)';
  lines.push(`tl.fromTo('${q}',{clipPath:'${mask}',opacity:1},{clipPath:'inset(0 0 0 0)',opacity:1,duration:0.22,ease:'power2.inOut',immediateRender:false},${s.start});`);
 }
 lines.push(`tl.from('${q} .line',{yPercent:110,rotation:1.6,duration:.65,stagger:.10,ease:'expo.out'},${t});`);
 lines.push(`tl.from('${q} .enter',{y:20,opacity:0,duration:.4,stagger:.08,ease:'power2.out'},${t+.16});`);
 lines.push(`tl.fromTo('${q} .photo-inner',{scale:1.035,x:0},{scale:1.10,x:${i%2?12:-12},duration:${Math.max(.8,d-.20)},ease:'sine.inOut',immediateRender:false},${s.start});`);
 if(s.layout==='cover')lines.push(`tl.from('${q} .cover-photo',{clipPath:'inset(0 12% 0 12%)',y:26,duration:.8,ease:'power3.out'},${t});`);
 if(s.layout==='poster')lines.push(`tl.from('${q} .poster-photo',{scale:.89,rotation:-3,duration:.7,ease:'power3.out'},${t});`);
 if(s.layout==='diptych'){
  lines.push(`tl.from('${q} .first',{x:-50,rotation:-4,duration:.7,ease:'power3.out'},${t+.1});`);
  lines.push(`tl.from('${q} .second',{y:90,rotation:4,duration:.7,ease:'expo.out'},${t+.2});`);
 }
 if(s.layout==='bleed')lines.push(`tl.from('${q} .bleed-photo',{clipPath:'inset(0 18% 0 18%)',duration:.75,ease:'power3.out'},${t});`);
 if(s.layout==='editorial')lines.push(`tl.from('${q} .editorial-photo',{x:70,rotation:2,duration:.7,ease:'power3.out'},${t});`);
 if(s.layout==='end')lines.push(`tl.from('${q} .end-photo',{scale:.94,duration:.75,ease:'power3.out'},${t});tl.from('${q} .arrow',{rotation:-45,scale:.8,duration:.5,ease:'back.out(1.1)'},${t+.35});`);
 return lines.join('\n');
}
function compile(c){
 const scenes=c.scenes.map((s,i)=>({...s,id:`${c.id.slice(3)}-scene-${i+1}`}));
 const font=c.serif?'"Noto Serif CJK SC", "Noto Sans CJK SC", serif':'"Noto Sans CJK SC", Arial, sans-serif';
 return {scenes,html:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(c.title)}</title><style>
 @font-face{font-family:"Noto Sans CJK SC";src:local("Noto Sans CJK SC")}
 @font-face{font-family:"Noto Serif CJK SC";src:local("Noto Serif CJK SC")}
 *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:${c.bg}}
 body{color:${c.ink};font-family:"Noto Sans CJK SC",Arial,sans-serif}#composition{position:relative;width:1080px;height:1920px;overflow:hidden}
 .scene{position:absolute;inset:0;width:1080px;height:1920px;background:${c.bg};overflow:hidden}
 .scene-content{position:relative;display:flex;flex-direction:column;gap:32px;width:100%;height:100%;padding:84px 72px 90px}
 .eyebrow{font-size:25px;font-weight:700;letter-spacing:3px;line-height:1.4;flex-shrink:0}
 .headline{font-family:${font};font-weight:900;line-height:1.12;letter-spacing:-5px;position:relative;z-index:3}
 .line-mask{overflow:hidden;padding:0 0 10px}.line{white-space:nowrap}.note{font-size:34px;line-height:1.5;font-weight:500;letter-spacing:1px}
 .copy{display:flex;flex-direction:column;gap:24px;flex-shrink:0}.photo{width:100%;height:100%;overflow:hidden;background:${c.bg};position:relative}
 .photo-inner{width:100%;height:100%;transform-origin:50% 50%}.photo img{display:block;width:100%;height:100%;object-fit:cover}
 .cover-photo{height:1020px;flex-shrink:0;border-radius:340px 340px 0 0;overflow:hidden;margin-top:20px}
 .foot{font-size:21px;line-height:1.6;display:flex;justify-content:space-between;gap:12px;margin-top:auto;flex-shrink:0;letter-spacing:1px}
 .poster-copy{display:flex;flex-direction:column;gap:6px;margin-top:30px;flex-shrink:0}.poster-photo{height:990px;margin-top:25px;flex-shrink:0;position:relative}
 .stamp{position:absolute;right:48px;top:680px;border-radius:100%;width:168px;height:168px;background:${c.accent};color:#202022;display:flex;align-items:center;justify-content:center;font-size:29px;font-weight:900;transform:rotate(11deg);z-index:4;text-align:center;line-height:1.15}
 .diptych{display:grid;grid-template-columns:1fr 1fr;gap:28px;height:900px;flex-shrink:0;padding:30px 0 0}
 .diptych .panel{display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0}.diptych .photo{height:720px;flex-shrink:0}.diptych .second{padding-top:100px}.tiny{font-size:23px;letter-spacing:3px;font-weight:700}
 .bleed-photo{height:1040px;flex-shrink:0;margin-top:30px}.bleed-copy{display:flex;flex-direction:column;gap:14px;margin-top:-8px}
 .editorial-photo{height:940px;flex-shrink:0;width:78%;align-self:flex-end;margin-top:22px}.editorial-copy{display:flex;flex-direction:column;gap:25px}
 .index-mark{position:absolute;left:55px;top:430px;writing-mode:vertical-rl;font-size:116px;line-height:1;font-weight:900;opacity:.25;letter-spacing:-8px}
 .end-photo{height:810px;flex-shrink:0;margin-top:40px}.end-copy{margin-top:10px}.cta{display:flex;align-items:center;justify-content:space-between;font-size:40px;line-height:1.3;border-top:2px solid ${c.ink};padding-top:26px;flex-shrink:0}.arrow{display:flex;justify-content:center;align-items:center;width:88px;height:88px;border-radius:50%;background:${c.accent};color:#202022;font-size:60px}
 ${c.id==='03-sneakers'?'.cover-photo,.poster-photo{height:970px}.diptych .photo{height:570px}.diptych{height:760px}.bleed-photo{height:880px}.end-photo{height:810px}':''}
 </style></head><body><div id="composition" data-composition-id="showcase" data-start="0" data-duration="${c.duration}" data-width="1080" data-height="1920" data-track-index="0">${scenes.map((s,i)=>sceneHtml(s,i,c)).join('\n')}</div><script src="assets/gsap.min.js"></script><script>
 window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
 ${scenes.map(animate).join('\n')}
 window.__timelines['showcase']=tl;
 </script></body></html>`};
}

await fs.mkdir(OUT,{recursive:true});
for(const c of cases){
 const dir=path.join(OUT,c.id);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
 const url=`https://images.pexels.com/photos/${c.photo}/pexels-photo-${c.photo}.jpeg?auto=compress&cs=tinysrgb&w=1800`;
 let bytes;const cache=path.join(dir,'input.jpg');try{bytes=await fs.readFile(cache);}catch{const res=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!res.ok)throw Error(`Photo ${c.photo}: HTTP ${res.status}`);bytes=Buffer.from(await res.arrayBuffer());}
 if(sha(bytes)!==c.hash)throw Error(`Source hash changed for ${c.photo}; review the input before updating the pin.`);
 await fs.writeFile(cache,bytes);const meta=await sharp(bytes).metadata();
 for(let i=0;i<c.crops.length;i++){
  const [x,y,w,h]=c.crops[i];const crop={left:Math.floor(meta.width*x),top:Math.floor(meta.height*y),width:Math.floor(meta.width*w),height:Math.floor(meta.height*h)};
  await sharp(bytes).extract(crop).jpeg({quality:95}).toFile(path.join(dir,'assets',`shot-${i}.jpg`));
 }
 await fs.copyFile(path.join(APP,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));
 const built=compile(c);
 const request={authoringMode:'reference-author',notProductAgentEvidence:true,projectId:c.id,assets:[{path:'input.jpg',sha256:c.hash,source:c.source,author:c.author}],message:c.prompt,output:{width:1080,height:1920,fps:30,durationSeconds:c.duration},audio:'none',rights:{photoLicense:'Pexels License',brandRights:'not-cleared-for-advertising',purpose:'editorial demo; no endorsement implied'}};
 await fs.writeFile(path.join(dir,'request.json'),JSON.stringify(request,null,2));
 await fs.writeFile(path.join(dir,'document.json'),JSON.stringify({schema:'showcase-reference-v1',authoringMode:'reference-author',projectId:c.id,scenes:built.scenes,design:{background:c.bg,ink:c.ink,accent:c.accent},sourceCrops:c.crops},null,2));
 await fs.writeFile(path.join(dir,'index.html'),built.html);
 await fs.writeFile(path.join(dir,'PROMPT.md'),`# ${c.title}\n\n${c.prompt}\n\n执行说明：本目录为按上面要求人工设计的质量参考片。当前产品 Agent 尚未自动复现这套分镜，不得把预录样片包装成实时 Agent 结果。\n`);
 await fs.writeFile(path.join(dir,'DESIGN.md'),`# ${c.title}\n\n## Style Prompt\n${c.prompt}\n\n## Colors\nBackground ${c.bg}; text ${c.ink}; accent ${c.accent}.\n\n## Typography\nNoto Sans CJK SC${c.serif?' with Noto Serif CJK SC':''}; display 130–278px, notes 34px. System fonts are not distributed.\n\n## Motion\nFinite paused GSAP root; 0.20–0.22s directional reveals; independent type and photo motion; meaningful visible photo on first frame.\n\n## What NOT to Do\nNo dark slab covering the product, tiny captions as headlines, invented specs, new camera angles, unlicensed soundtrack, or product-agent claims.\n`);
 await fs.writeFile(path.join(dir,'SOURCES.md'),`# 素材与权利\n\n原照片：${c.source}\n摄影：${c.author}\n下载源：${url}\nSHA256：${c.hash}\n许可：https://www.pexels.com/license/\n说明：https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project\n\n所有近景由同一原图裁切；没有用其他型号假装同一商品。保留可见标识。本片仅用于剪辑效果展示，不暗示品牌合作；正式商品广告应替换为已获授权的商家素材并核实文案。没有复制竞品素材或音乐，没有分发字体。\n`);
}
await fs.writeFile(path.join(OUT,'cases.json'),JSON.stringify(cases.map(({id,title,duration})=>({id,title,duration,mode:'reference-author',input:`${id}/input.jpg`,prompt:`${id}/PROMPT.md`,video:`${id}/final.mp4`})),null,2));
await fs.writeFile(path.join(OUT,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商品视频 · 质量参考样片</title><style>body{font:17px/1.7 system-ui,sans-serif;margin:40px auto;max-width:1250px;padding:0 24px;background:#f4f1eb;color:#202020}h1{font-size:40px}section{margin:50px 0;border-top:1px solid #bbb;padding-top:28px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}img,video{max-width:100%;max-height:670px;object-fit:contain;background:#ddd}blockquote{margin:25px 0;padding:15px 22px;background:white}small{color:#555}@media(max-width:650px){.pair{grid-template-columns:1fr}}</style><h1>商品视频 · 输入 / 输出对照</h1><p>三条 <b>Reference-author 质量参考片</b>。不是现有产品 Agent 实时生成，不是竞品原片，不代表商用审核或85分验收。</p>${cases.map(c=>`<section><h2>${c.title} / ${c.duration}s</h2><div class="pair"><div><h3>输入：真实照片</h3><img src="${c.id}/input.jpg"><p><a href="${c.id}/request.json">输入合同</a> · <a href="${c.id}/SOURCES.md">来源与权利</a></p></div><div><h3>输出：原生剪辑与动效</h3><video controls playsinline preload="metadata" src="${c.id}/final.mp4" poster="${c.id}/poster.jpg"></video><p><a href="${c.id}/final.mp4">MP4</a> · <a href="${c.id}/PROMPT.md">演示指令</a> · <a href="${c.id}/document.json">可编辑分镜数据</a></p></div></div><blockquote>${esc(c.prompt)}</blockquote></section>`).join('')}<small>图片：Pexels；具体摄影作者与许可见每个目录。所有照片近景均为同一输入的裁切，未生成新产品或伪造角度。视频无音乐和旁白，便于独立评审画面。</small></html>`);
console.log(JSON.stringify({output:OUT,mode:'reference-author',cases:cases.map(c=>c.id)},null,2));
