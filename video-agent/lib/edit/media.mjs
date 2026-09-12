import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {ROOT,runtimeEnv} from '../workflow.mjs';
import {acquireRender} from '../render-queue.mjs';
import {EditError,insist,FPS,positioned,duration,seconds,srt,migrateTimeline,validateTimeline,sourceStart,sourceLength} from './timeline.mjs';
import {cacheKey,cachedFile,cachedBundle,MEDIA_CACHE_VERSION} from './media-cache.mjs';
import {checkPreviewRuntime,previewSampleTimes,PREVIEW_CHECK_VERSION} from './preview-check.mjs';
export {closePreviewChecks} from './preview-check.mjs';

export const ffmpeg=runtimeEnv().HYPERFRAMES_FFMPEG_PATH;
export const ffprobe=runtimeEnv().HYPERFRAMES_FFPROBE_PATH;
export function run(exe,args,{cwd=ROOT,signal,timeout=120000,log,onOutput,binary=false,env={}}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new EditError('任务已取消',409));
    const child=spawn(exe,args,{cwd,env:{...runtimeEnv(),...env},windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout=[],stderr='',size=0,reason=null;
    const kill=()=>{if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');};
    const abort=()=>{reason='任务已取消';kill();};
    const timer=setTimeout(()=>{reason='当前处理阶段超时，输入已保留';kill();},timeout);
    signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',b=>{size+=b.length;if(size<=24*1024*1024)stdout.push(b);onOutput?.(b.toString());});
    child.stderr.on('data',b=>{stderr=(stderr+b).slice(-18000);onOutput?.(b.toString());});
    const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.on('error',e=>{done();reject(new EditError(`无法启动媒体工具：${e.code||e.message}`,503));});
    child.on('close',async code=>{
      done();const out=Buffer.concat(stdout);
      if(log)await fs.writeFile(log,(binary?'':out.toString())+'\n'+stderr).catch(()=>{});
      if(code!==0||reason||!binary&&/Render failed|Check failed:/.test(out.toString()+stderr))return reject(new EditError(reason||`媒体处理失败：${((binary?'':out.toString())+'\n'+stderr).slice(-1800)}`,422));
      resolve(binary?out:out.toString()+stderr);
    });
  });
}
export async function probe(file,signal) {
  let m;try{const raw=await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{signal,timeout:30000}),start=raw.indexOf('{'),end=raw.lastIndexOf('}');m=JSON.parse(raw.slice(start,end+1));}catch(e){if(signal?.aborted)throw e;throw new EditError('无法读取媒体，请上传有效的 MP4、MOV、WebM 或音频文件',422);}
  const v=m.streams.find(x=>x.codec_type==='video'&&x.disposition?.attached_pic!==1),a=m.streams.find(x=>x.codec_type==='audio');
  const d=Number(m.format.duration);insist(Number.isFinite(d)&&d>0&&d<=600.1,'素材时长必须不超过 10 分钟');
  const rotation=Number(v?.tags?.rotate||v?.side_data_list?.find(x=>x.rotation!==undefined)?.rotation||0);
  const sideways=Math.abs(rotation)%180===90;
  return {kind:v?'video':'audio',duration:d,frames:Math.floor(d*FPS+0.00001),width:v?(sideways?v.height:v.width):0,height:v?(sideways?v.width:v.height):0,rotation,hasAudio:!!a,videoCodec:v?.codec_name||null,pixelFormat:v?.pix_fmt||null,audioCodec:a?.codec_name||null,sourceFps:v?.avg_frame_rate||null,nominalFps:v?.r_frame_rate||null,size:Number(m.format.size)};
}
export async function hashFile(file) {const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export async function linkOrCopy(src,dst) {await fs.mkdir(path.dirname(dst),{recursive:true});try{await fs.link(src,dst);}catch(e){if(e.code!=='EEXIST')await fs.copyFile(src,dst);}}
export async function prepareAsset(dir,asset,signal,progress=()=>{}) {
  const started=performance.now(),original=path.join(dir,asset.original),info=await probe(original,signal),sha256=await hashFile(original);
  progress('正在准备可播放素材');
  const bundle=await cachedBundle('prepared',sha256,async cached=>{
    const metadata={...info,sha256,normalizationVersion:MEDIA_CACHE_VERSION},timeout=Math.max(120000,info.duration*10000),files=[];
    if(info.kind==='video'){
      const factor=Math.min(1,1920/info.width,1920/info.height,1080/Math.min(info.width,info.height));
      metadata.width=Math.max(64,Math.floor(info.width*factor/2)*2);metadata.height=Math.max(64,Math.floor(info.height*factor/2)*2);
      metadata.work='work.mp4';metadata.proxy='work.mp4';
      const compatible=info.videoCodec==='h264'&&info.pixelFormat==='yuv420p'&&info.rotation===0&&info.width===metadata.width&&info.height===metadata.height&&info.sourceFps==='30/1'&&info.nominalFps==='30/1'&&(!info.hasAudio||info.audioCodec==='aac');
      const encoding=compatible?['-c','copy']:['-vf',`scale=${metadata.width}:${metadata.height},setsar=1,fps=30`,'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','192k'];
      await run(ffmpeg,['-y','-v','error','-threads','2','-i',original,'-map','0:v:0','-map','0:a:0?',...encoding,'-movflags','+faststart',path.join(cached,metadata.work)],{signal,timeout});
      const normalized=await probe(path.join(cached,metadata.work),signal);metadata.frames=normalized.frames;metadata.duration=normalized.duration;metadata.preparation=compatible?'remux':'transcode';files.push(metadata.work);
      await extractFrame(cached,metadata,0,'thumbs/poster.jpg',signal);metadata.thumbnails=[{file:'thumbs/poster.jpg',time:0}];files.push('thumbs/poster.jpg');
    }else{
      metadata.work='work.m4a';await run(ffmpeg,['-y','-v','error','-i',original,'-vn','-c:a','aac','-ar','48000','-b:a','192k',path.join(cached,metadata.work)],{signal,timeout});files.push(metadata.work);
    }
    return {...metadata,files};
  });
  for(const file of bundle.metadata.files)await linkOrCopy(path.join(bundle.dir,file),path.join(dir,file));
  const {files,...metadata}=bundle.metadata;Object.assign(asset,metadata,{status:'ready',analysisReady:false,preparationCacheHit:bundle.hit,preparationMs:Math.round(performance.now()-started)});return asset;
}
// Expensive analysis is explicitly requested by semantic editing, transcription
// or the asset inspector. Importing material does not wait for this stage.
export async function prepareSpeech(dir,asset,signal){
  insist(asset.hasAudio,'素材没有音轨');
  if(asset.speech){try{await fs.access(path.join(dir,asset.speech));return asset;}catch{}}
  const hash=asset.sha256||await hashFile(path.join(dir,asset.work));
  const bundle=await cachedBundle('speech-input',cacheKey([hash,asset.normalizationVersion||'legacy','mono-16k-mp3-v1']),async cached=>{
    await run(ffmpeg,['-y','-v','error','-i',path.join(dir,asset.work),'-vn','-ac','1','-ar','16000','-b:a','64k',path.join(cached,'speech.mp3')],{signal,timeout:Math.max(120000,asset.duration*1000)});return {files:['speech.mp3'],speech:'speech.mp3'};
  });
  await linkOrCopy(path.join(bundle.dir,'speech.mp3'),path.join(dir,'speech.mp3'));asset.speech='speech.mp3';asset.speechPreparationCacheHit=bundle.hit;return asset;
}
export async function prepareAnalysis(dir,asset,signal) {
  const started=performance.now(),key=asset.sha256||await hashFile(path.join(dir,asset.work));
  const bundle=await cachedBundle('analysis',cacheKey([key,asset.normalizationVersion||'legacy']),async cached=>{
    const metadata={files:[]},timeout=Math.max(120000,asset.duration*5000),input=path.join(dir,asset.work);
    if(asset.kind==='video'){
      const f=Math.min(1,1280/asset.width,1280/asset.height,720/Math.min(asset.width,asset.height));
      let visual=input;
      if(f<1){metadata.proxy='proxy.mp4';visual=path.join(cached,metadata.proxy);await run(ffmpeg,['-y','-v','error','-i',input,'-vf',`scale=${Math.floor(asset.width*f/2)*2}:${Math.floor(asset.height*f/2)*2}`,'-c:v','libx264','-preset','veryfast','-crf','27','-c:a','aac','-movflags','+faststart',visual],{signal,timeout});metadata.files.push(metadata.proxy);}
      await fs.mkdir(path.join(cached,'thumbs'),{recursive:true});
      await run(ffmpeg,['-y','-v','error','-i',visual,'-vf',"select='not(mod(n,150))',scale=480:-2",'-vsync','vfr','-frames:v','120',path.join(cached,'thumbs','%04d.jpg')],{signal,timeout});
      const names=(await fs.readdir(path.join(cached,'thumbs'))).filter(n=>/^\d+\.jpg$/.test(n)).sort();metadata.thumbnails=names.map((name,i)=>({file:`thumbs/${name}`,time:i*5}));metadata.files.push(...metadata.thumbnails.map(x=>x.file));
      const sceneTimes=new Set();let sceneTail='';
      await run(ffmpeg,['-hide_banner','-i',visual,'-vf',"select='gt(scene,0.3)',showinfo",'-an','-f','null','-'],{signal,timeout,onOutput:chunk=>{const log=sceneTail+chunk;for(const m of log.matchAll(/pts_time:([\d.]+)\s/g)){const time=Number(m[1]);if(time>0&&time<asset.duration&&sceneTimes.size<200)sceneTimes.add(time);}sceneTail=log.slice(-200);}});
      metadata.sceneBoundaries=[...sceneTimes].sort((a,b)=>a-b);
      metadata.sceneDetector='ffmpeg-scene-0.3';
    }
    if(asset.hasAudio){
      metadata.speech='speech.mp3';await run(ffmpeg,['-y','-v','error','-i',input,'-vn','-ac','1','-ar','16000','-b:a','64k',path.join(cached,metadata.speech)],{signal,timeout});metadata.files.push(metadata.speech);
      const pcm=await run(ffmpeg,['-v','error','-i',input,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{signal,timeout,binary:true});
      const samples=Math.floor(pcm.length/4),step=Math.max(1,Math.ceil(samples/400));metadata.waveform=[];
      for(let i=0;i<samples;i+=step){let peak=0;for(let j=i;j<Math.min(samples,i+step);j++)peak=Math.max(peak,Math.abs(pcm.readFloatLE(j*4)));metadata.waveform.push(Math.round(peak*1000)/1000);}
      let silence='';await run(ffmpeg,['-hide_banner','-i',input,'-vn','-af','silencedetect=noise=-35dB:d=0.4','-f','null','-'],{signal,timeout,onOutput:chunk=>{silence=(silence+chunk).slice(-2*1024*1024);}});
      const ranges=[];let start=null;for(const m of silence.matchAll(/silence_(start|end):\s*([\d.]+)/g)){if(m[1]==='start')start=Number(m[2]);else if(start!==null){ranges.push({start,end:Number(m[2])});start=null;}}if(start!==null)ranges.push({start,end:asset.duration});metadata.silenceRanges=ranges;
    }
    return metadata;
  });
  for(const file of bundle.metadata.files)await linkOrCopy(path.join(bundle.dir,file),path.join(dir,file));
  const {files,...metadata}=bundle.metadata;Object.assign(asset,metadata,{analysisReady:true,analysisCacheHit:bundle.hit,analysisMs:Math.round(performance.now()-started)});return asset;
}
export async function extractFrame(dir,asset,time,file,signal) {
  await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true});
  await run(ffmpeg,['-y','-v','error','-ss',String(Math.max(0,time)),'-i',path.join(dir,asset.proxy||asset.work),'-frames:v','1','-vf','scale=640:-2',path.join(dir,file)],{signal,timeout:30000});
  return {file,time};
}
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function composeRevision(dir,t,assets,assetDir,signal) {
  validateTimeline(t,assets);t=migrateTimeline(t);const started=performance.now(),cacheStats={stemsHit:0,stemsMiss:0,mixHit:0,mixMiss:0};
  await fs.mkdir(path.join(dir,'assets'),{recursive:true});
  const clips=positioned(t.clips),d=seconds(duration(t)),{width:w,height:h,fit}=t.output;
  const used=new Set([...t.clips,...t.audio,...t.overlays].map(c=>c.assetId));
  for(const id of used) {const a=assets[id];await linkOrCopy(path.join(assetDir(id),a.work),path.join(dir,'assets',id+path.extname(a.work)));if(a.proxy)await linkOrCopy(path.join(assetDir(id),a.proxy),path.join(dir,'assets',id+'-proxy.mp4'));}
  await linkOrCopy(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));
  await linkOrCopy(path.join(ROOT,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(dir,'assets/runtime.js'));
  const source=id=>'assets/'+id+path.extname(assets[id].work);
  // Build per-clip stems first: bounded command lines and identical preview/export audio.
  const stems=[],stemKeys=[];
  const audio=[...[...clips,...t.overlays].filter(c=>assets[c.assetId].hasAudio&&c.gain>0).map(c=>({...c,role:'voice',original:true,fadeIn:t.transitions.find(x=>x.toId===c.id)?.duration||0,fadeOut:t.transitions.find(x=>x.fromId===c.id)?.duration||0})),...t.audio];
  const speech=audio.filter(c=>c.role==='voice'&&c.gain>0).flatMap(c=>{
    const words=c.original?(assets[c.assetId].analysis?.transcript?.words??assets[c.assetId].analysis?.speechActivity?.regions):null;
    if(!words)return [[seconds(c.start),seconds(c.end)]];
    return words.map(w=>[Math.max(seconds(sourceStart(c)),w.start),Math.min(seconds(sourceStart(c)+sourceLength(c)),w.end)]).filter(([s,e])=>e>s).map(([s,e])=>[seconds(c.start)+(s-seconds(sourceStart(c)))/(c.rate||1),seconds(c.start)+(e-seconds(sourceStart(c)))/(c.rate||1)]);
  }).sort((a,b)=>a[0]-b[0]);
  const voices=[];for(const span of speech){const last=voices.at(-1);if(last&&span[0]<=last[1]+0.3)last[1]=Math.max(last[1],span[1]);else voices.push([...span]);}
  for(let i=0;i<audio.length;i++) {
    const c=audio[i],len=seconds(c.end-c.start),playbackRate=c.rate||1,filters=[`atrim=start=${seconds(sourceStart(c))}:duration=${c.sourceDuration==null?len*playbackRate:seconds(c.sourceDuration)}`,'asetpts=PTS-STARTPTS'];
    // FFmpeg 4.x atempo supports 0.5..2 per filter; chaining covers 0.1..5.
    let tempo=playbackRate;while(tempo>2){filters.push('atempo=2');tempo/=2;}while(tempo<0.5){filters.push('atempo=0.5');tempo/=0.5;}if(Math.abs(tempo-1)>1e-8)filters.push(`atempo=${tempo}`);
    filters.push('apad',`atrim=duration=${len}`,`volume=${c.gain}`);
    if(c.fadeIn)filters.push(`afade=t=in:d=${Math.min(len,seconds(c.fadeIn))}`);
    if(c.fadeOut)filters.push(`afade=t=out:st=${Math.max(0,len-seconds(c.fadeOut))}:d=${Math.min(len,seconds(c.fadeOut))}`);
    if(c.role==='music'&&c.duck&&voices.length) {
      const local=voices.map(([s,e])=>[Math.max(0,s-seconds(c.start)-0.1),Math.min(len,e-seconds(c.start)+0.2)]).filter(([s,e])=>e>s);
      if(local.length)filters.push(`volume='if(gt(${local.map(([s,e])=>`between(t,${s},${e})`).join('+')},0),0.22,1)':eval=frame`);
    }
    const delay=Math.round(seconds(c.start)*1000);
    filters.push('aformat=channel_layouts=stereo',`adelay=${delay}|${delay}`,'apad',`atrim=duration=${d}`);
    const asset=assets[c.assetId],hash=asset.sha256||await hashFile(path.join(dir,source(c.assetId))),key=cacheKey([hash,asset.normalizationVersion||'legacy',filters]),out=path.join(dir,'assets',`stem-${i}.m4a`);
    const cached=await cachedFile('stems',key,'.m4a',file=>run(ffmpeg,['-y','-v','error','-i',path.join(dir,source(c.assetId)),'-vn','-af',filters.join(','),'-ac','2','-ar','48000','-c:a','aac','-b:a','192k',file],{signal,timeout:Math.max(120000,d*1500)}));
    await linkOrCopy(cached.file,out);cacheStats[cached.hit?'stemsHit':'stemsMiss']++;stems.push(out);stemKeys.push(key);
  }
  if(stems.length) {
    // Hierarchical mixing keeps FFmpeg input count bounded for long edits.
    let level=stems.map((file,i)=>({file,key:stemKeys[i]}));
    while(level.length>1) {const next=[];for(let i=0;i<level.length;i+=16){const group=level.slice(i,i+16),key=cacheKey([d,...group.map(x=>x.key)]);const cached=await cachedFile('mix',key,'.m4a',out=>run(ffmpeg,['-y','-v','error',...group.flatMap(x=>['-i',x.file]),'-filter_complex',`amix=inputs=${group.length}:duration=longest:dropout_transition=0,volume=${group.length},alimiter=limit=0.95:level=false`,'-t',String(d),'-c:a','aac','-b:a','192k',out],{signal,timeout:Math.max(120000,d*1500)}));cacheStats[cached.hit?'mixHit':'mixMiss']++;next.push({file:cached.file,key});}level=next;}
    let final=level[0];
    if(t.output.loudness!=null){
      const key=cacheKey([final.key,'loudnorm',t.output.loudness,-1,11,d]);
      const normalized=await cachedFile('loudness',key,'.m4a',out=>run(ffmpeg,['-y','-v','error','-i',final.file,'-af',`loudnorm=I=${t.output.loudness}:TP=-1:LRA=11`,'-t',String(d),'-ar','48000','-ac','2','-c:a','aac','-b:a','192k',out],{signal,timeout:Math.max(120000,d*1500)}));
      cacheStats[normalized.hit?'mixHit':'mixMiss']++;final={file:normalized.file,key};
    }
    await linkOrCopy(final.file,path.join(dir,'assets/mix.m4a'));
  }
  const videos=[...clips,...t.overlays].map((c,i)=>{
    const rect=c.rect||{x:0,y:0,width:1,height:1},crop=c.crop||{x:0,y:0,width:1,height:1},a=assets[c.assetId],rw=w*rect.width,rh=h*rect.height,cw=a.width*crop.width,ch=a.height*crop.height,scale=(c.fit||fit)==='cover'?Math.max(rw/cw,rh/ch):Math.min(rw/cw,rh/ch),vw=a.width*scale,vh=a.height*scale,left=(rw-cw*scale)/2-crop.x*vw,top=(rh-ch*scale)/2-crop.y*vh;
    // Non-timed wrappers safely carry crop/transition transforms while the
    // framework retains sole ownership of video seek and visibility.
    return `<div id="frame-${c.id}" class="frame" data-layout-allow-overflow style="left:${w*rect.x}px;top:${h*rect.y}px;width:${rw}px;height:${rh}px;z-index:${c.track?500+c.track:i}"><video id="clip-${c.id}" class="clip footage" src="${source(c.assetId)}" data-start="${seconds(c.start)}" data-duration="${seconds(c.end-c.start)}" data-media-start="${seconds(sourceStart(c))}" data-playback-rate="${c.rate||1}" data-track-index="${c.track||0}" muted playsinline preload="auto" style="left:${left}px;top:${top}px;width:${vw}px;height:${vh}px;object-fit:fill"></video></div>`;
  }).join('\n');
  const captions=t.captions.map((c,i)=>`<div id="caption-${c.id}" class="clip caption ${c.position}" data-start="${seconds(c.start)}" data-duration="${seconds(c.end-c.start)}" data-track-index="${i+2}" style="color:${c.color};font-size:${Math.max(20,Math.round(Math.min(w,h)*c.size))}px"><span class="caption-content">${esc(c.text)}</span></div>`).join('\n');
  // Media is sought by the HyperFrames runtime. Without timed captions there is no GSAP layout motion; static footage is valid.
  const transitionAnimation=t.transitions.map(tr=>{const next=clips.find(c=>c.id===tr.toId),at=seconds(next.start),len=seconds(tr.duration),selector=JSON.stringify('#frame-'+tr.toId);return tr.style==='wipe'?`tl.fromTo(${selector},{clipPath:'inset(0% 100% 0% 0%)'},{clipPath:'inset(0% 0% 0% 0%)',duration:${len},ease:'none'},${at});`:`tl.fromTo(${selector},{opacity:0},{opacity:1,duration:${len},ease:'none'},${at});`;}).join('');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei");font-weight:100 900}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#101613}*{box-sizing:border-box}.clip{position:absolute;inset:0;width:100%;height:100%}.frame{position:absolute;overflow:hidden;pointer-events:none}.footage{z-index:0}.caption{z-index:1000;display:flex;justify-content:center;align-items:flex-end;padding:7% 8%;font-family:'Microsoft YaHei',sans-serif;font-weight:700;line-height:1.4;text-align:center;pointer-events:none}.caption span{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;background:#101613;padding:0.25em 0.55em;border-radius:0.18em}.caption.top{align-items:flex-start}.caption.center{align-items:center}</style></head><body><div id="edit-root" data-composition-id="edit-root"${!t.transitions.length&&t.captions.every(c=>c.start===0&&c.end===duration(t))?' data-no-timeline':''} data-start="0" data-duration="${d}" data-width="${w}" data-height="${h}">${videos}\n${captions}\n${stems.length?`<audio id="mix" src="assets/mix.m4a" data-start="0" data-duration="${d}" data-track-index="1" data-volume="1"></audio>`:''}</div><script src="assets/gsap.min.js"></script><script>window.__timelines=window.__timelines||{};var placed=[];document.querySelectorAll('.caption').forEach(function(el){var box=el.querySelector('span'),start=+el.dataset.start,end=start+(+el.dataset.duration),position=el.classList.contains('top')?'top':el.classList.contains('center')?'center':'bottom',height=box.getBoundingClientRect().height,gap=12,offset=0,conflicts=placed.filter(function(p){return p.position===position&&p.start<end&&start<p.end}).sort(function(a,b){return a.offset-b.offset});conflicts.forEach(function(p){if(offset<p.offset+p.height+gap&&offset+height+gap>p.offset)offset=p.offset+p.height+gap});if(position==='center'){box.style.transform='translateY('+(-offset)+'px)'}else{var side=position==='top'?'paddingTop':'paddingBottom';el.style[side]=(parseFloat(getComputedStyle(el)[side])+offset)+'px'}placed.push({position:position,start:start,end:end,height:height,offset:offset})});var tl=gsap.timeline({paused:true});${transitionAnimation}${t.captions.map(c=>`tl.set('#caption-${c.id} .caption-content',{opacity:1},${seconds(c.start)});tl.set('#caption-${c.id} .caption-content',{opacity:0},${seconds(c.end)});`).join('')}window.__timelines['edit-root']=tl;</script><script src="assets/runtime.js"></script></body></html>`;
  await fs.writeFile(path.join(dir,'index.html'),html);
  const preview=html.replace(/src="assets\/([\w-]+)\.mp4"/g,(m,id)=>assets[id]?.proxy?`src="assets/${id}-proxy.mp4"`:m);
  await fs.writeFile(path.join(dir,'preview.template'),preview);
  await fs.writeFile(path.join(dir,'timeline.json'),JSON.stringify(t,null,2));
  await fs.writeFile(path.join(dir,'subtitles.srt'),srt(t));
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify([...used].map(id=>assets[id]),null,2));
  await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({}));
  await fs.writeFile(path.join(dir,'DESIGN.md'),'# 对话剪辑\n保留用户画面。仅在指令指定范围加入字幕。\n## Colors\n#101613 字幕底色；#FFFFFF 字幕；#C9E66F 可选强调。\n## Typography\nMicrosoft YaHei 中文。\n## Motion\n原片硬切，不自动增加转场。字幕严格在指定边界显示和消失。\n');
  const metrics={duration:d,width:w,height:h,hasAudio:stems.length>0,compileMs:Math.round(performance.now()-started),cache:cacheStats};await fs.writeFile(path.join(dir,'compile-metrics.json'),JSON.stringify(metrics,null,2));return metrics;
}
export async function checkRevision(dir,signal,{mode='full',timeline,operations=[]}={}) {
  insist(['full','preview'].includes(mode),'检查类型无效');
  const html=await fs.readFile(path.join(dir,'index.html'),'utf8'),files=[];
  for(const match of html.matchAll(/\bsrc="([^"]+)"/g)){
    const src=match[1],file=path.resolve(dir,src);insist(file.startsWith(path.resolve(dir)+path.sep),'工程包含未授权的媒体路径');
    let stat;try{stat=await fs.stat(file);}catch{throw new EditError('工程缺少素材：'+src,422);}insist(stat.isFile()&&stat.size>0,'工程素材为空：'+src);files.push([src,stat.size,stat.mtimeMs]);
  }
  if(mode==='preview'&&!timeline)timeline=JSON.parse(await fs.readFile(path.join(dir,'timeline.json'),'utf8'));
  const at=mode==='preview'?previewSampleTimes(timeline,operations):[];
  const signature=cacheKey([MEDIA_CACHE_VERSION,mode==='preview'?PREVIEW_CHECK_VERSION:'hyperframes-0.8.33',mode,html,files,at]),record=path.join(dir,`check-${mode}.json`);
  try{const existing=JSON.parse(await fs.readFile(record,'utf8'));if(existing.signature===signature&&existing.success)return {...existing,cacheHit:true};}catch{}
  const started=performance.now(),release=await acquireRender({kind:mode==='preview'?'preview':'render',signal});
  try{
    let details={};
    if(mode==='preview'){
      details=await checkPreviewRuntime(dir,{html,timeline,sampleTimes:at,signal});
      await fs.writeFile(path.join(dir,'preview-check.log'),JSON.stringify(details,null,2));
    }else await run(process.execPath,[path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs'),'check','--at-transitions','--max-transition-samples','120'],{cwd:dir,signal,timeout:180000,log:path.join(dir,'check.log')});
    const result={...details,signature,mode,success:true,cacheHit:false,durationMs:Math.round(performance.now()-started),checkedAt:new Date().toISOString(),sampleTimes:at};await fs.writeFile(record,JSON.stringify(result,null,2));return result;
  }finally{release();}
}
export async function renderRevision(dir,t,signal,onOutput) {
  const d=seconds(duration(t));
  await checkRevision(dir,signal,{mode:'full',timeline:t});
  const release=await acquireRender({kind:'render',signal});try{await run(process.execPath,[path.join(ROOT,'node_modules/hyperframes/bin/hyperframes.mjs'),'render','--output','video.mp4','--fps','30','--quality','standard','--workers','1','--strict','--no-best-effort'],{cwd:dir,signal,timeout:Math.max(300000,d*45000),log:path.join(dir,'render.log'),onOutput});}finally{release();}
  const meta=await probe(path.join(dir,'video.mp4'),signal);insist(Math.abs(meta.duration-d)<=0.1&&meta.width===t.output.width&&meta.height===t.output.height,'实际输出规格与时间轴不一致');return meta;
}
