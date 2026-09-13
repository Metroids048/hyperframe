import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {workerReceipt,digest,measureMotion} from '../lib/creative/isolation-protocol.mjs';
const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
for(let i=0;i<150;i++){if(await fs.access(config.gate).then(()=>true).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
if(!await fs.access(config.gate).then(()=>true).catch(()=>false))throw Error('Isolation gate was not assigned');
// Internal resource probes are invoked only by the engineering test harness.
if(config.probe==='timeout'){while(true)Math.sqrt(Math.random());}
if(config.probe==='memory'){const chunks=[];while(true)chunks.push(Buffer.alloc(32*1024**2,255));}
const {default:puppeteer}=await import('puppeteer-core');
const html=await fs.readFile(path.join(config.directory,'index.html'),'utf8'),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'");
const allowed=new Set(config.files),requests=[],failures=[];
const server=http.createServer(async(req,res)=>{try{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
 if(req.method!=='GET'||!allowed.has(name)){res.writeHead(403);res.end();return;}
 const file=path.join(config.directory,name),stat=await fs.stat(file);
 const type={'.woff2':'font/woff2','.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4'}[path.extname(name)]||'application/octet-stream';
 const headers={'Content-Type':type,'Content-Security-Policy':`default-src 'none'; script-src 'self' ${scripts.join(' ')}; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
 let start=0,end=stat.size-1,status=200;
 if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
  start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;
  if(!Number.isSafeInteger(start)||start>end){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}
  headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;status=206;
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}catch{if(!res.headersSent)res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,ownedProfile;const result={protocolVersion:1,status:'running',platform:process.platform,assigned:process.platform==='win32',environmentKeys:Object.keys(process.env),network:requests,errors:failures,samples:[],motion:[]};
try{
 const browserProfile=config.browserProfile||(ownedProfile=await fs.mkdtemp(path.join(process.platform==='win32'?process.env.TEMP:'/tmp','hf-')));
 if(!path.isAbsolute(browserProfile||''))throw Error('Parent must assign a private browser profile');
 await fs.mkdir(browserProfile,{recursive:true,mode:0o700});result.browserProfile=browserProfile;
 browser=await puppeteer.launch({executablePath:config.browser,headless:true,userDataDir:browserProfile,defaultViewport:config.output,dumpio:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--enable-logging=stderr'],env:process.env});
 await fs.writeFile(path.join(config.directory,'browser-started.json'),JSON.stringify({pid:browser.process().pid,runId:config.identity.runId}));
 if(config.probe==='browser-timeout')await new Promise(()=>{});
 result.browserArgs=browser.process().spawnargs.filter(a=>!a.includes('user-data-dir')&&!a.includes('remote-debugging'));
 if(result.browserArgs.some(a=>a==='--no-sandbox'||a==='--disable-setuid-sandbox'))throw Error('Browser sandbox must remain enabled');
 const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',request=>{const url=new URL(request.url());const permitted=url.origin===origin&&allowed.has(decodeURIComponent(url.pathname).slice(1)||'index.html')&&(!request.isNavigationRequest()||request.url()===origin+'/index.html'&&request.frame()===page.mainFrame());requests.push({url:request.url().replace(origin,'<isolated-origin>'),allowed:permitted});if(permitted)request.continue();else request.abort('blockedbyclient');});
 page.on('pageerror',e=>failures.push(e.message));page.on('workercreated',()=>failures.push('Unexpected worker'));page.on('popup',p=>{failures.push('Unexpected popup');void p.close();});
 // Range-streamed videos can keep connections open after the composition is ready.
 await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded',timeout:15000});
 await page.waitForFunction(()=>Boolean(window.__timelines?.['commerce-root'])&&[...document.images].every(i=>i.complete&&i.naturalWidth>0),{timeout:15000});
 if(config.runtimeMedia)await page.waitForFunction(()=>window.__renderReady&&(window.__player?.renderSeek||window.__hf?.seek),{timeout:15000});
 result.fonts=await page.evaluate(async fonts=>{const records=[];for(const f of fonts){const faces=await document.fonts.load('32px "'+f.family+'"');if(!faces.length||faces.some(face=>face.status!=='loaded'))throw Error('本地字体未通过浏览器解码：'+f.family);records.push({family:f.family,sha256:f.sha256,status:'browser-decoded'});}return records;},config.fonts||[]);
 await page.evaluate(()=>document.fonts.ready);
 if(config.probe==='network'){
  result.boundaryProbe=await page.evaluate(async()=>{const failed={};for(const [key,url] of [['outside','https://example.com/'],['otherProject','http://127.0.0.1:3022/api/commerce-projects'],['file','file:///C:/Windows/win.ini'],['traversal','../secret.txt']]){try{const r=await fetch(url);failed[key]=!r.ok;}catch{failed[key]=true;}}failed.worker=await new Promise(resolve=>{let worker;const timer=setTimeout(()=>{worker?.terminate();resolve(false);},1000);try{worker=new Worker('data:text/javascript,postMessage(1)');worker.onerror=e=>{e.preventDefault();clearTimeout(timer);worker.terminate();resolve(true);};worker.onmessage=()=>{clearTimeout(timer);worker.terminate();resolve(false);};}catch{clearTimeout(timer);resolve(true);}});return failed;});
  if(!Object.values(result.boundaryProbe).every(Boolean))throw Error('Browser isolation boundary failed');
 }
 for(const scene of config.scenes){
  const times=[...new Set([...[.03,.18,.38,.58,.78,.97].map(f=>scene.startFrame/30+scene.durationFrames/30*f),...(scene.sampleTimes||[])])].sort((a,b)=>a-b);
  for(const time of times){
   const sample=await page.evaluate(async({time,targets,runtimeMedia})=>{
    if(runtimeMedia){const player=window.__player,hf=window.__hf;if(player?.renderSeek)player.renderSeek(time);else if(hf?.seek)hf.seek(time);else throw Error('媒体运行时未就绪');await window.__hfWaitForSeekCompletion?.();}
    else window.__timelines['commerce-root'].seek(time,false);
    const media=[];
    if(runtimeMedia)for(const video of document.querySelectorAll('video')){const start=Number(video.dataset.start||0),duration=Number(video.dataset.duration);if(time<start||time>=start+duration)continue;const expected=Number(video.dataset.mediaStart||0)+(time-start)*Number(video.dataset.playbackRate||1),deadline=performance.now()+3500;while(video.seeking||video.readyState<2||Math.abs(video.currentTime-expected)>1/30+.003){if(video.error)throw Error('媒体解码失败：'+video.id);if(performance.now()>deadline)throw Error('媒体未在目标帧就绪：'+video.id);await new Promise(r=>setTimeout(r,15));}media.push({id:video.id,currentTime:video.currentTime,expected});}
    return {time,media,objects:targets.map(id=>{const e=document.getElementById(id);if(!e)return {id,visible:false};const r=e.getBoundingClientRect(),s=getComputedStyle(e),stroke=e instanceof SVGGraphicsElement&&s.stroke!=='none'?parseFloat(s.strokeWidth)||0:0;const blockers=new Set();const exposed=[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]].some(([fx,fy])=>{const x=r.x+r.width*fx,y=r.y+r.height*fy;if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;for(const top of document.elementsFromPoint(x,y)){if(top===e||e.contains(top))return true;if(top.contains(e))continue;const style=getComputedStyle(top),color=style.backgroundColor,alpha=color.startsWith('rgba')?Number(color.match(/,\s*([\d.]+)\)$/)?.[1]||0):color==='transparent'?0:1;if(Number(style.opacity)>.95&&(alpha>.95||['IMG','VIDEO','CANVAS'].includes(top.tagName))){blockers.add(top.id||top.tagName);return false;}}return true;});return {id,exposed,blockedBy:[...blockers],x:r.x,y:r.y,width:r.width,height:r.height,opacity:Number(s.opacity),transform:s.transform,strokeDashoffset:s.strokeDashoffset,clipPath:s.clipPath,color:s.color,backgroundColor:s.backgroundColor,fill:s.fill,borderRadius:s.borderRadius,visible:exposed&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&(!(e instanceof HTMLImageElement)||e.complete&&e.naturalWidth>0)&&(!(e instanceof HTMLVideoElement)||e.readyState>=2)&&Math.max(r.width,stroke)>0&&Math.max(r.height,stroke)>0&&r.bottom+stroke/2>0&&r.right+stroke/2>0&&r.left-stroke/2<innerWidth&&r.top-stroke/2<innerHeight&&Number(s.opacity)>.01};})};},{time,targets:[...new Set([...(scene.visibleTargets||scene.targets),...scene.targets])],runtimeMedia:config.runtimeMedia});sample.sceneId=scene.id;result.samples.push(sample);
   await page.screenshot({path:path.join(config.directory,scene.id+'-'+Math.round(time*1000)+'.jpg'),type:'jpeg',quality:85});
  }
  for(const id of scene.visibleTargets||scene.targets)if(!result.samples.filter(s=>s.sceneId===scene.id).some(s=>s.objects.some(o=>o.id===id&&o.visible))){const blocked=[...new Set(result.samples.filter(s=>s.sceneId===scene.id).flatMap(s=>s.objects.filter(o=>o.id===id).flatMap(o=>o.blockedBy||[])))].map(value=>value.replace('custom-'+scene.id+'-',''));throw Error('必要对象不可见：'+id+(blocked.length?'；不透明遮挡对象：'+blocked.map(id=>'#'+id).join(',')+'。视频在独立底层，请将这些覆盖实拍的全画幅容器背景设为transparent，仅保留局部文字标签背景。':''));}
  const sceneSamples=result.samples.filter(s=>s.sceneId===scene.id);
  for(const id of scene.targets){const measured=measureMotion(sceneSamples,id);result.motion.push({sceneId:scene.id,...measured});if(!measured.moved)throw Error('目标没有可见运动：'+id);}
  for(const interval of scene.motionIntervals||[]){const measured=measureMotion(sceneSamples,interval.id,interval);(result.motionIntervals??=[]).push({sceneId:scene.id,...measured});if(!measured.moved)throw Error('目标没有可见运动：'+interval.id+' '+interval.start+'—'+interval.end);}

 }
 if(failures.length)throw Error(failures.join(';'));result.status='passed';
}catch(error){result.status='failed';result.error=error.message;result.errorCode=/媒体解码失败|媒体未在目标帧就绪|媒体运行时/.test(error.message)?'ISOLATION_MEDIA':/目标没有可见运动|必要对象不可见/.test(error.message)?'CUSTOM_RUNTIME_FAILED':'ISOLATION_BROWSER';process.exitCode=1;}
finally{
 try{await browser?.close();}catch(error){result.status='failed';result.error='Browser cleanup failed: '+error.message;process.exitCode=1;}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 if(result.browserProfile)await fs.rm(result.browserProfile,{recursive:true,force:true}).catch(error=>{result.cleanupWarning=error.message;});
 const bytes=JSON.stringify(result,null,2);await fs.writeFile(path.join(config.directory,'runtime-evidence.json'),bytes);
 const receipt=workerReceipt(config.identity,result,digest(bytes));
 await fs.writeFile(config.receiptPath+'.tmp',JSON.stringify(receipt));await fs.rename(config.receiptPath+'.tmp',config.receiptPath);
 console.log('HF_SCENE_WORKER '+JSON.stringify(receipt));
}
