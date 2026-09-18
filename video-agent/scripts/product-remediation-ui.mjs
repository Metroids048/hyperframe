import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {runtimeEnv} from '../lib/workflow.mjs';

const base=process.env.REMEDIATION_BASE_URL||'http://127.0.0.1:3056',folder=path.resolve('outputs/product-remediation-20260918');
const [action,scene,projectId]=process.argv.slice(2);
const cases={
 S01:{scenario:'product_launch',seconds:24,aspect:'9:16',files:['../素材/Steam_Deck_Unboxing.webm'],message:'用上传的 Steam Deck 开箱实拍制作24秒竖屏单品亮相片。前2秒必须看清主体，然后用取出包装、打开收纳包、主机整体与按键布局组成“亮相—识别—记忆点—回归整体”。真实画面占主体，标题与细节标注少而克制，竖屏重构要保护手部和主机，不做中心硬裁。不写性能、续航、价格或当前配置承诺；保留真实原声，不加配乐旁白。保留 Vic · CC BY 3.0 来源署名。直接制作并导出候选，保留原生可编辑工程。'},
 S02:{scenario:'product_detail',seconds:35,aspect:'16:9',files:['../素材/ASUS_PROART_RTX_4070_Ti_Unboxing_-_By_INVADERPC.webm'],message:'用上传的显卡原视频制作35秒横屏商品详情片。给关注外观与接口布局的人看，先认清整体，再看清正面风扇、侧面连接位置和端部接口，最后回到整体。要有整体与局部联动、清楚的构图和阅读节奏，避免每幕同一种侧栏模板。只讲真实可见内容，不写未经证实的参数和价格。不加旁白和音乐，保留所选镜头原声。标题简短，不遮挡商品。请直接制作并导出候选，保留可继续对话修改的工程。'},
 S03:{scenario:'product_demo',seconds:55,aspect:'16:9',files:['../素材/Nissin_Cup_Noodle_Gohan_curry_flavoured,_-2013_a.webm'],message:'用上传的即食饭原视频制作约55秒横屏使用过程讲解。以原片已有状态开始，保留加水、炉门和控制、料包、搅拌等真实动作顺序，压缩等待。原片没有展示的放入和取出过程明确用简短提示说明，不补造动作，也不宣称完整教程。步骤条避开手部与商品，关键动作稳定看清，说明少而准确；不猜功率、水量和加热时间。保留原声，不加旁白音乐。请直接制作并导出候选，保留可继续修改的工程。'},
 S04:{scenario:'product_collection',seconds:42,aspect:'9:16',files:['assets/scene-demo-inputs/raw/pexels-8447362.mp4','assets/scene-demo-inputs/raw/pexels-8447672.mp4','assets/scene-demo-inputs/raw/pexels-8453909.mp4','assets/commerce-rebuild-v2/original-pulse-40s-master.wav'],message:'用上传的三段香氛实拍和原创纯音乐做42秒竖屏系列风格片。叙事是“空间氛围—瓶身轮廓—手持关系—系列回顾”，单款与组合镜头交替，不要固定网格或八幕同模板。真实画面是主体，用极少的杂志感动态字和光影衔接，音乐只做低位情绪床，不盖过可用原声。不改商品颜色，不编造品牌、香调、材质、价格或功效。保留 MART PRODUCTION 和 Pexels 来源说明。直接制作并导出候选。'},
 S05:{scenario:'product_promotion',seconds:20,aspect:'9:16',files:['assets/scene-demo-inputs/raw/pexels-9430537.mp4','assets/scene-demo-inputs/raw/pexels-9430543.mp4','assets/scene-demo-inputs/raw/pexels-9430550.mp4','assets/commerce-rebuild-v2/original-pulse-40s-master.wav'],message:'用上传的三段首饰实拍和原创纯音乐做20秒竖屏活动预告。这是内部演示活动，不是真实报价；文案必须显示“演示活动 · 非真实报价”。结构是“活动识别—佩戴关系—条件说明—行动收尾”，用快慢相间的字号层级和一次克制节拍转场，条件字要大且留足阅读时间。不编价格、折扣、材质、品牌或代言，不暗示真实促销。保留 cottonbro studio 和 Pexels 来源说明。直接制作并导出候选。'},
 S06:{scenario:'product_faq',seconds:30,aspect:'16:9',files:['../素材/Steam_Deck_Unboxing.webm'],message:'用上传的 Steam Deck 开箱实拍做30秒横屏选购问答，只回答“这次开箱实际展示了哪些盒内物件？”先用1句直接答案，再用真实画面逐个对应，最后单独留出限制说明“实际配置以具体购买版本为准”。问句、答案、证据和限制要有不同画面结构，不做成上新广告或同样的侧栏轮播。只说看得见的物件，不猜规格、性能或是否为官方标配。保留原声，不加音乐旁白，保留 Vic · CC BY 3.0 署名。直接制作并导出候选。'},
 S07:{scenario:'auto',seconds:55,aspect:'16:9',files:['../素材/Video_of_a_complete_use_session_with_a_gyroscopic_exercise_tool.webm'],message:'把上传的完整使用过程精剪成约55秒横屏原意保持版。保留启动、持续运动状态变化、降速与结束的真实顺序，只删确认无新信息的重复与等待；相似动作不能仅因看起来相同就删除。保留对应原声和自然切点，不加音乐、旁白或康复疗效表述。只用少量章节标题，不用每段相同模板，保留高速使用边界提示与 Pittigrilli · CC BY-SA 4.0 署名。直接制作并导出候选，保留可继续对话精剪的工程。'},
 S08:{scenario:'auto',seconds:35,aspect:'16:9',files:['assets/commerce-motion/01-grind.mp4','assets/commerce-motion/02-fill.mp4','assets/commerce-motion/03-assemble.mp4','assets/commerce-motion/04-extract.mp4','assets/commerce-motion/05-pour.mp4','assets/commerce-motion/06-finish.mp4'],message:'用上传的六段咖啡实拍制作35秒1920×1080横屏日常展示母片，标题“一杯咖啡的时间”。暖白与咖啡棕配色，真实动态画面为主，短标题和克制动效形成层次，呈现磨豆器、摩卡壶、出液、倒杯和成品的日常仪式。最多六幕，仅描述可见内容，不写型号、价格、参数或性能承诺。保留原声，不加配乐，不加配音，不循环凑时长。画面说明避开商品与手部，保留 Shokuiku Cuisine · CC BY 3.0 来源署名。直接制作并导出可审阅候选，保留可编辑原生工程。'}
};
const get=async id=>{const response=await fetch(base+'/api/commerce/'+id);if(!response.ok)throw Error(await response.text());return (await response.json()).project;};
if(action==='status'){
 const project=await get(projectId);await fs.writeFile(path.join(folder,scene+'-current.json'),JSON.stringify(project,null,2));
 console.log(JSON.stringify({id:project.id,revision:project.currentRevisionId,jobs:project.jobs.slice(-2).map(j=>({id:j.id,kind:j.kind,status:j.status,stage:j.stage,error:j.error,runId:j.runId,modelCalls:j.modelCalls}))}));
}else{
 const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.goto(base+(projectId?'/?project='+projectId:'/'),{waitUntil:'networkidle2'});
  const before=projectId?await get(projectId):null;
  if(action==='create'){
   const spec=process.env.REMEDIATION_SPEC_FILE?JSON.parse(await fs.readFile(process.env.REMEDIATION_SPEC_FILE,'utf8')):cases[scene];if(!spec)throw Error('Unknown case');
   await page.select('#business-scene',spec.scenario||'auto');await page.select('#output-aspect',spec.aspect);
   await page.$eval('#output-duration',(el,n)=>{el.value=String(n);el.dispatchEvent(new Event('input',{bubbles:true}));},spec.seconds);
   if(spec.files?.length)await (await page.$('#images')).uploadFile(...spec.files.map(f=>path.resolve(f)));
   await page.waitForFunction(()=>!document.querySelector('#send').disabled);
   await page.type('#message',spec.message);await page.click('#send');
  }else if(action==='resume'){
   const target=before.jobs.findLast(j=>j.resumeAllowed||j.status==='recoverable');if(!target)throw Error('No recoverable WebUI job');
   await page.waitForFunction(id=>document.querySelector('[data-job-id="'+id+'"] button'),{},target.id);
   await page.$$eval('#jobs [data-job-id] button',(buttons,id)=>{const button=buttons.find(b=>b.closest('[data-job-id]').dataset.jobId===id&&b.textContent==='从检查点恢复');if(!button)throw Error('Resume button unavailable');button.click();},target.id);
  }else if(action==='edit'){
   const message=process.env.REMEDIATION_MESSAGE;if(!message)throw Error('Missing edit message');
   await page.waitForFunction(()=>!document.querySelector('#send').disabled);await page.type('#message',message);await page.click('#send');
  }else throw Error('Unsupported action');
  await page.waitForFunction(()=>new URL(location.href).searchParams.has('project'),{timeout:120000});
  const id=new URL(page.url()).searchParams.get('project');let project;
  for(let i=0;i<240;i++){
   project=await get(id);if(project.jobs.some(j=>!before?.jobs.some(old=>old.id===j.id)||action==='resume'&&before?.jobs.some(old=>old.id===j.id&&old.status!==j.status)))break;
   const error=await page.$eval('#error',el=>el.hidden?'':el.textContent);if(error)throw Error(error);
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  const receipt={action,scene,projectId:id,baseRevision:before?.currentRevisionId||null,submittedAt:new Date().toISOString(),jobs:project.jobs.filter(j=>!before?.jobs.some(old=>old.id===j.id)||action==='resume'&&before?.jobs.some(old=>old.id===j.id&&old.status!==j.status))};
  const stamp=Date.now();await fs.writeFile(path.join(folder,scene+'-'+action+'-'+stamp+'.json'),JSON.stringify(receipt,null,2));await page.screenshot({path:path.join(folder,scene+'-'+action+'-'+stamp+'.png'),fullPage:true});
  console.log(JSON.stringify({...receipt,jobs:receipt.jobs.map(j=>({id:j.id,status:j.status,kind:j.kind,runId:j.runId}))}));
 }finally{await browser.close();}
}
