import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {ROOT,runtimeEnv} from '../workflow.mjs';
import {EditError,insist,duration,FPS} from './timeline.mjs';

// Preview is a sampled runtime/media/layout check, not the complete HyperFrames
// lint, motion and contrast audit. Export always retains the official full check.
export const PREVIEW_CHECK_VERSION='runtime-preview-v2-hf-0.8.33';
const contentHashes=new Map(),assetRoutes=new Map(),documents=new Map(),pages=new Set();
let sessionPromise=null,idleTimer=null,activeChecks=0,auditScript,closingPromise=null;
const mime={'.mp4':'video/mp4','.webm':'video/webm','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const failCancelled=()=>new EditError('任务已取消',409);
const ensureActive=signal=>{if(signal?.aborted)throw failCancelled();};

export function previewSampleTimes(timeline,operations=[]) {
  if(!timeline)return [];
  const n=duration(timeline),points=new Set(),add=v=>{if(Number.isFinite(v)&&v>=0&&v<n)points.add(Math.floor(v));};
  const range=(start,end)=>{add(start-1);add(start);add(Math.floor((start+end-1)/2));add(end-1);add(end);};
  add(0);add(Math.floor((n-1)/2));add(n-1);
  const elements=[...timeline.clips,...timeline.captions,...timeline.audio,...(timeline.overlays||[])];
  const structural=operations.some(o=>['insert','delete_range','keep_ranges','move','split','clip_speed','transition'].includes(o.type));
  for(const op of operations){
    if(Number.isFinite(op.start)&&Number.isFinite(op.end))range(op.start,op.end);
    if(Number.isFinite(op.at)){add(op.at-1);add(op.at);add(op.at+1);}
    for(const c of elements.filter(c=>c.id===op.id||c.groupId===op.id||c.captionGroupId===op.id))range(c.start,c.end);
  }
  if(structural)for(const c of timeline.clips)range(c.start,c.end);
  for(const tr of timeline.transitions||[]){const c=timeline.clips.find(c=>c.id===tr.toId);if(c)range(c.start,c.start+tr.duration);}
  // Keep all affected boundary/midpoint samples. Silently truncating a sorted
  // list would omit changes near the tail of a longer or multi-clip project.
  return [...points].sort((a,b)=>a-b).map(frame=>frame/FPS);
}

async function contentKey(file) {
  const stat=await fs.stat(file),identity=[stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs].join(':');
  let hash=contentHashes.get(identity);
  if(!hash){const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);hash=h.digest('hex');contentHashes.set(identity,hash);if(contentHashes.size>512)contentHashes.delete(contentHashes.keys().next().value);}
  return {key:hash+path.extname(file).toLowerCase(),size:stat.size};
}

function serve(req,res) {
  let route;try{route=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const html=documents.get(route);
  if(html!==undefined){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-src 'none'"}).end(req.method==='HEAD'?undefined:html);return;}
  if(route==='/favicon.ico'){res.writeHead(204).end();return;}
  const asset=assetRoutes.get(route);if(!asset){res.writeHead(404).end();return;}
  const headers={'Content-Type':mime[path.extname(asset.file)]||'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable','Accept-Ranges':'bytes'};
  let start=0,end=asset.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||!match[1]&&!match[2]){res.writeHead(416,{'Content-Range':`bytes */${asset.size}`}).end();return;}start=match[1]?Number(match[1]):Math.max(0,asset.size-Number(match[2]));end=match[1]&&match[2]?Math.min(end,Number(match[2])):end;if(start>end||start>=asset.size){res.writeHead(416,{'Content-Range':`bytes */${asset.size}`}).end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${asset.size}`;}
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(asset.file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}

async function getSession() {
  clearTimeout(idleTimer);
  if(closingPromise)await closingPromise;
  if(!sessionPromise)sessionPromise=(async()=>{
    const server=http.createServer(serve);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();
    let browser;
    try{const {default:puppeteer}=await import('puppeteer-core');browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,timeout:20000,cwd:ROOT,args:['--force-color-profile=srgb','--autoplay-policy=no-user-gesture-required','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--disable-extensions','--disable-renderer-backgrounding','--disable-background-timer-throttling','--no-first-run']});browser.process()?.unref();return {browser,server,origin:`http://127.0.0.1:${server.address().port}`};}
    catch(e){await browser?.close().catch(()=>{});server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));sessionPromise=null;throw e;}
  })();
  return sessionPromise;
}

export async function closePreviewChecks() {
  clearTimeout(idleTimer);idleTimer=null;if(closingPromise)return closingPromise;const pending=sessionPromise;sessionPromise=null;if(!pending)return;
  closingPromise=(async()=>{
    let session;try{session=await pending;}catch{return;}
    await Promise.allSettled([...pages].map(page=>page.close()));pages.clear();
    await Promise.race([session.browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);
    session.server.closeAllConnections?.();
    await new Promise(resolve=>{let settled=false;const timer=setTimeout(done,1500);function done(){if(settled)return;settled=true;clearTimeout(timer);resolve();}try{if(!session.server.listening)return done();session.server.close(done);}catch{done();}});
    documents.clear();assetRoutes.clear();
  })().finally(()=>{closingPromise=null;});
  return closingPromise;
}

function scheduleIdleClose() {
  if(activeChecks)return;clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(!activeChecks)void closePreviewChecks();},Math.max(1000,Number(process.env.EDIT_PREVIEW_IDLE_MS)||30000));idleTimer.unref();
}

async function seekAndInspect(page,time,timeline) {
  return page.evaluate(async({time,expectedDuration})=>{
    const hf=window.__hf,player=window.__player;
    if(player?.renderSeek)player.renderSeek(time);else if(hf?.seek)hf.seek(time);else throw Error('HyperFrames seek 接口未就绪');
    window.gsap?.ticker?.tick();
    await window.__hfWaitForSeekCompletion?.();
    await document.fonts.ready;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const media=[...document.querySelectorAll('video,audio')],pending=media.filter(el=>{const start=Number(el.dataset.start||0),end=start+Number(el.dataset.duration||Infinity);return time>=start&&time<end;});
    await Promise.all(pending.map(el=>new Promise((resolve,reject)=>{
      const target=Number(el.dataset.mediaStart||0)+(time-Number(el.dataset.start||0))*Number(el.dataset.playbackRate||1),deadline=performance.now()+3500;
      const check=()=>{if(el.error)return reject(Error(`媒体解码失败：${el.id} (${el.error.code})`));if(el.readyState>=2&&!el.seeking&&Math.abs(el.currentTime-target)<=1/30+.003)return resolve();if(performance.now()>deadline)return reject(Error(`媒体未在目标帧就绪：${el.id}, expected=${target.toFixed(4)}, actual=${el.currentTime.toFixed(4)}, ready=${el.readyState}`));setTimeout(check,15);};check();
    })));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const runtimeDuration=Number(hf?.duration||player?.getDuration?.());
    if(!Number.isFinite(runtimeDuration)||Math.abs(runtimeDuration-expectedDuration)>1/30+.001)throw Error('运行时时长与时间轴不一致');
    const visible=el=>{for(let p=el;p&&p!==document.documentElement;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)<.01)return false;}return el.getBoundingClientRect().width>0;};
    const captions=[...document.querySelectorAll('.caption')].map(el=>{const start=Math.round(Number(el.dataset.start)*30),end=start+Math.round(Number(el.dataset.duration)*30),current=Math.round(time*30),expected=current>=start&&current<end,shown=visible(el.querySelector('.caption-content')||el);if(expected!==shown)throw Error(`字幕显示时间不一致：${el.id} at ${time}`);return {id:el.id,visible:shown,text:shown?el.textContent:''};});
    const issues=window.__hyperframesLayoutAudit({time,tolerance:2});
    return {time,runtimeDuration,media:pending.map(el=>({id:el.id,currentTime:el.currentTime,readyState:el.readyState})),captions,issues};
  },{time,expectedDuration:duration(timeline)/FPS});
}

export async function checkPreviewRuntime(dir,{html,timeline,sampleTimes=previewSampleTimes(timeline),signal,screenshot}={}) {
  ensureActive(signal);insist(timeline,'预览检查需要时间轴');const started=performance.now(),browserReused=!!sessionPromise;activeChecks++;clearTimeout(idleTimer);
  let page,documentRoute,abortListener,timer,responseCacheHits=0;const heldAssets=[],errors=[],controller=new AbortController();
  abortListener=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abortListener,{once:true});
  timer=setTimeout(()=>controller.abort(new Error('预览检查超时')),Math.max(20000,sampleTimes.length*4500));
  const closeOnAbort=()=>{void page?.close().catch(()=>{});};controller.signal.addEventListener('abort',closeOnAbort,{once:true});
  try{
    html??=await fs.readFile(path.join(dir,'index.html'),'utf8');
    const session=await getSession();ensureActive(controller.signal);page=await session.browser.newPage();pages.add(page);ensureActive(controller.signal);
    const assetMap=new Map();
    for(const match of html.matchAll(/\bsrc="([^"]+)"/g)){
      const src=match[1],file=path.resolve(dir,src);insist(file.startsWith(path.resolve(dir)+path.sep),'工程包含未授权的媒体路径');
      if(assetMap.has(src))continue;const {key,size}=await contentKey(file),route='/asset/'+key,existing=assetRoutes.get(route);if(existing)existing.refs++;else assetRoutes.set(route,{file,size,refs:1});heldAssets.push(route);assetMap.set(src,route);
    }
    html=html.replace(/\bsrc="([^"]+)"/g,(_,src)=>`src="${assetMap.get(src)}"`);documentRoute='/project/'+randomUUID();documents.set(documentRoute,html);
    page.on('pageerror',e=>errors.push({type:'pageerror',message:e.message}));
    page.on('console',message=>{if(message.type()==='error')errors.push({type:'console',message:message.text()});});
    page.on('response',response=>{if(response.fromCache())responseCacheHits++;if(response.status()>=400)errors.push({type:'http',message:`${response.status()} ${new URL(response.url()).pathname}`});});
    await page.setRequestInterception(true);page.on('request',request=>{const url=request.url();if(url.startsWith(session.origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))void request.continue().catch(()=>{});else{errors.push({type:'network',message:'工程引用了非本地资源'});void request.abort('blockedbyclient').catch(()=>{});}});
    await page.setViewport({width:timeline.output.width,height:timeline.output.height,deviceScaleFactor:1});await page.evaluateOnNewDocument(()=>{window.__name=fn=>fn;});
    const loadStart=performance.now();await page.goto(session.origin+documentRoute,{waitUntil:'domcontentloaded',timeout:12000});
    await page.waitForFunction(()=>window.__renderReady&&(typeof window.__player?.renderSeek==='function'||typeof window.__hf?.seek==='function')&&Number(window.__hf?.duration||window.__player?.getDuration?.())>0,{timeout:12000}).catch(async error=>{const state=await page.evaluate(()=>({ready:window.__renderReady,seek:typeof window.__hf?.seek,renderSeek:typeof window.__player?.renderSeek,duration:window.__hf?.duration||window.__player?.getDuration?.()})).catch(()=>({}));throw Error((errors.map(e=>e.message).join('; ')||error.message)+' '+JSON.stringify(state));});
    auditScript??=await fs.readFile(path.join(ROOT,'node_modules/hyperframes/dist/commands/layout-audit.browser.js'),'utf8');await page.addScriptTag({content:auditScript});
    const loadMs=Math.round(performance.now()-loadStart),samples=[];
    for(const time of sampleTimes){ensureActive(controller.signal);const sample=await seekAndInspect(page,time,timeline);samples.push(sample);const failures=sample.issues.filter(issue=>issue.severity!=='warning');if(failures.length)throw new EditError('预览布局检查未通过：'+failures.map(x=>x.message||x.code).slice(0,4).join('；'),422);if(screenshot)await screenshot(page,time,sample);}
    if(errors.length)throw new EditError('预览运行检查未通过：'+errors.map(e=>e.message).slice(0,4).join('；'),422);
    return {engine:PREVIEW_CHECK_VERSION,scope:'sampled-runtime-media-layout',fullCheck:false,success:true,browserReused,responseCacheHits,durationMs:Math.round(performance.now()-started),loadMs,sampleTimes,samples};
  }catch(e){if(signal?.aborted)throw failCancelled();if(controller.signal.aborted)throw new EditError('预览检查超时，输入已保留',422);if(e instanceof EditError)throw e;throw new EditError('预览检查未通过：'+e.message,422);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abortListener);controller.signal.removeEventListener('abort',closeOnAbort);if(page){pages.delete(page);await page.close().catch(()=>{});}if(documentRoute)documents.delete(documentRoute);for(const route of heldAssets){const asset=assetRoutes.get(route);if(asset&&--asset.refs<=0)assetRoutes.delete(route);}activeChecks--;scheduleIdleClose();}
}
