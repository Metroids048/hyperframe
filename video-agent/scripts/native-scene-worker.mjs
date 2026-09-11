import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
for(let i=0;i<150;i++){if(await fs.access(config.gate).then(()=>true).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
if(!await fs.access(config.gate).then(()=>true).catch(()=>false))throw Error('Windows isolation gate was not assigned');
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
 const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4'}[path.extname(name)]||'application/octet-stream';
 const headers={'Content-Type':type,'Content-Security-Policy':`default-src 'none'; script-src 'self' ${scripts.join(' ')}; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; font-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
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
let browser;const result={status:'running',environmentKeys:Object.keys(process.env),network:requests,errors:failures,samples:[],motion:[]};
try{
 const profileRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.cache/isolated-browser');await fs.mkdir(profileRoot,{recursive:true});
 const browserProfile=await fs.mkdtemp(path.join(profileRoot,'profile-'));result.browserProfile=browserProfile;
 browser=await puppeteer.launch({executablePath:config.browser,headless:true,userDataDir:browserProfile,defaultViewport:config.output,dumpio:true,args:['--disable-background-networking','--disable-component-update','--no-first-run','--enable-logging=stderr'],env:process.env});
 result.browserArgs=browser.process().spawnargs.filter(a=>!a.includes('user-data-dir')&&!a.includes('remote-debugging'));
 if(result.browserArgs.some(a=>a==='--no-sandbox'||a==='--disable-setuid-sandbox'))throw Error('Browser sandbox must remain enabled');
 const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',request=>{const url=new URL(request.url());const permitted=url.origin===origin&&allowed.has(decodeURIComponent(url.pathname).slice(1)||'index.html')&&(!request.isNavigationRequest()||request.url()===origin+'/index.html'&&request.frame()===page.mainFrame());requests.push({url:request.url().replace(origin,'<isolated-origin>'),allowed:permitted});if(permitted)request.continue();else request.abort('blockedbyclient');});
 page.on('pageerror',e=>failures.push(e.message));page.on('workercreated',()=>failures.push('Unexpected worker'));page.on('popup',p=>{failures.push('Unexpected popup');void p.close();});
 // Range-streamed videos can keep connections open after the composition is ready.
 await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded',timeout:15000});
 await page.waitForFunction(()=>Boolean(window.__timelines?.['commerce-root'])&&[...document.images].every(i=>i.complete&&i.naturalWidth>0),{timeout:15000});
 await page.evaluate(()=>document.fonts.ready);
 if(config.probe==='network'){
  result.boundaryProbe=await page.evaluate(async()=>{const failed={};for(const [key,url] of [['outside','https://example.com/'],['otherProject','http://127.0.0.1:3022/api/commerce-projects'],['file','file:///C:/Windows/win.ini'],['traversal','../secret.txt']]){try{const r=await fetch(url);failed[key]=!r.ok;}catch{failed[key]=true;}}failed.worker=await new Promise(resolve=>{let worker;const timer=setTimeout(()=>{worker?.terminate();resolve(false);},1000);try{worker=new Worker('data:text/javascript,postMessage(1)');worker.onerror=e=>{e.preventDefault();clearTimeout(timer);worker.terminate();resolve(true);};worker.onmessage=()=>{clearTimeout(timer);worker.terminate();resolve(false);};}catch{clearTimeout(timer);resolve(true);}});return failed;});
  if(!Object.values(result.boundaryProbe).every(Boolean))throw Error('Browser isolation boundary failed');
 }
 for(const scene of config.scenes){
  const times=[...new Set([...[.03,.18,.38,.58,.78,.97].map(f=>scene.startFrame/30+scene.durationFrames/30*f),...(scene.sampleTimes||[])])].sort((a,b)=>a-b);
  for(const time of times){
   const sample=await page.evaluate(({time,targets})=>{window.__timelines['commerce-root'].seek(time,false);return {time,objects:targets.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect(),s=getComputedStyle(e),stroke=e instanceof SVGGraphicsElement&&s.stroke!=='none'?parseFloat(s.strokeWidth)||0:0;return {id,x:r.x,y:r.y,width:r.width,height:r.height,opacity:Number(s.opacity),transform:s.transform,strokeDashoffset:s.strokeDashoffset,clipPath:s.clipPath,visible:Math.max(r.width,stroke)>0&&Math.max(r.height,stroke)>0&&r.bottom+stroke/2>0&&r.right+stroke/2>0&&r.left-stroke/2<innerWidth&&r.top-stroke/2<innerHeight&&Number(s.opacity)>.01};})};},{time,targets:scene.targets});result.samples.push(sample);
   await page.screenshot({path:path.join(config.directory,scene.id+'-'+Math.round(time*1000)+'.jpg'),type:'jpeg',quality:85});
  }
  for(const id of scene.targets){const samples=result.samples.flatMap(s=>s.objects.filter(o=>o.id===id)),visible=samples.filter(s=>s.visible),first=visible[0];const moved=visible.length>=2&&visible.some(s=>Math.abs(s.x-first.x)>2||Math.abs(s.y-first.y)>2||Math.abs(s.width-first.width)>2||Math.abs(s.height-first.height)>2||s.transform!==first.transform||s.strokeDashoffset!==first.strokeDashoffset||s.clipPath!==first.clipPath||Math.abs(s.opacity-first.opacity)>.02);result.motion.push({id,visibleSamples:visible.length,moved});if(!moved)throw Error('目标没有可见运动：'+id);}
 }
 if(failures.length)throw Error(failures.join(';'));result.status='passed';
}catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}
finally{await fs.writeFile(path.join(config.directory,'runtime-evidence.json'),JSON.stringify(result,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({status:result.status,error:result.error}));}
