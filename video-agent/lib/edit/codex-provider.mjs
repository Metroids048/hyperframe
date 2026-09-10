import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {CloudProvider,normalizeTranscript} from './provider.mjs';
import {ROOT} from '../workflow.mjs';
import {EditError,insist,uid} from './timeline.mjs';
import {hashFile} from './media.mjs';
import {SpeechWorker,localPython} from './speech-worker.mjs';
import {codexRequest,codexFailure} from './codex-command.mjs';
import {speakElevenLabs} from './adapters/optional-providers.mjs';

export function subscriptionEnv() {
  const env={...process.env};
  // Reuse the user's enabled Windows proxy, just as desktop apps do. Never read auth.json.
  if(process.platform==='win32'&&!env.HTTPS_PROXY) {
    const r=spawnSync('reg',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],{encoding:'utf8',windowsHide:true});
    if(/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(r.stdout||'')) {
      const raw=/ProxyServer\s+REG_SZ\s+([^\r\n]+)/.exec(r.stdout||'')?.[1]?.trim();
      const proxy=raw?.includes('=')?(/(?:^|;)https=([^;]+)/.exec(raw)?.[1]||/(?:^|;)http=([^;]+)/.exec(raw)?.[1]):raw;
      if(proxy&&/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(proxy)){env.HTTPS_PROXY=proxy.includes('://')?proxy:'http://'+proxy;env.HTTP_PROXY=env.HTTPS_PROXY;}
    }
  }
  env.NODE_USE_ENV_PROXY='1';env.PYTHONUTF8='1';return env;
}
export function pythonPath(){return localPython();}
const localVoices=['zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang'];
export function localVoice(voice,instructions=''){
  if(voice==='HyperFrames Kokoro · 本地中文'||voice==='kokoro-v1.0')voice='default';
  if(localVoices.includes(voice))return voice;
  if(!voice||voice==='default')return /男|male|masculine/i.test(instructions)&&!/female/i.test(instructions)?'zm_yunxi':'zf_xiaobei';
  const legacy={marin:'zf_xiaobei',cedar:'zm_yunxi',alloy:'zf_xiaobei',ash:'zm_yunxi',ballad:'zm_yunxi',coral:'zf_xiaobei',echo:'zm_yunxi',fable:'zm_yunxi',nova:'zf_xiaobei',onyx:'zm_yunxi',sage:'zf_xiaobei',shimmer:'zf_xiaobei',verse:'zm_yunxi'};
  insist(legacy[voice],'本地配音不支持该音色，请使用列出的中文音色或配置云配音');return legacy[voice];
}
export class CodexProvider extends CloudProvider {
  constructor({workerFactory=options=>new SpeechWorker(options),skipLoginCheck=false,cacheRoot}={}){super();this.bin=process.env.VIDEO_AGENT_CODEX_BIN||'codex';this.environment=subscriptionEnv();this.model=process.env.VIDEO_AGENT_CODEX_MODEL||process.env.VIDEO_AGENT_EDIT_MODEL||null;this.verifiedAt=null;this.loginCheckedAt=0;this.loggedIn=false;this.cacheRoot=cacheRoot||process.env.VIDEO_AGENT_CACHE_ROOT||path.join(ROOT,'data');this.asr=workerFactory({python:localPython(),env:this.environment});this.tts=workerFactory({python:localPython(),env:this.environment});if(!skipLoginCheck)void this.refreshLogin();}
  status(){return {configured:this.loggedIn,checkingLogin:!!this.loginPending,provider:'Codex subscription',model:this.model||'Codex 默认模型',auth:'ChatGPT subscription',verifiedAt:this.verifiedAt,transcriptionModel:(process.env.VIDEO_AGENT_ASR_ENGINE==='whisperx'?'WhisperX':'Whisper')+' '+(process.env.VIDEO_AGENT_WHISPER_MODEL||'small')+' · 本地',voiceModel:process.env.VIDEO_AGENT_TTS_ENGINE==='elevenlabs'?'ElevenLabs':'HyperFrames Kokoro · 本地中文',voices:process.env.VIDEO_AGENT_TTS_ENGINE==='elevenlabs'?{engine:'elevenlabs',minRate:0.7,maxRate:1.2}:{engine:'kokoro',ids:localVoices,default:'zf_xiaobei',minRate:0.5,maxRate:2,language:'zh',instructionSupport:'音色与语速；不支持任意情绪或音色克隆'},connectionMode:'subscription'};}
  async refreshLogin(){
    if(this.loginPending)return this.loginPending;
    this.environment=subscriptionEnv();
    this.loginPending=new Promise(resolve=>{
      const child=spawn(this.bin,['login','status'],{env:this.environment,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',settled=false;
      const finish=code=>{if(settled)return;settled=true;clearTimeout(timer);this.loggedIn=code===0&&/ChatGPT/i.test(output);this.loginCheckedAt=Date.now();resolve(this.loggedIn);};
      const timer=setTimeout(()=>{if(child.pid&&process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');finish(-1);},10000);
      child.stdout.on('data',b=>output=(output+b).slice(-4000));child.stderr.on('data',b=>output=(output+b).slice(-4000));child.on('error',()=>finish(-1));child.on('close',finish);
    }).finally(()=>{this.loginPending=null;});return this.loginPending;
  }
  async structured(instructions,input,schema,signal,attempt=0) {
    const candidates=[...new Set([this.model,...(process.env.VIDEO_AGENT_CODEX_FALLBACK_MODELS||'').split(',').map(x=>x.trim()).filter(Boolean)])],model=candidates[attempt]||this.model;
    if(this.loginPending||!this.loggedIn||Date.now()-this.loginCheckedAt>30000)await this.refreshLogin();
    insist(this.loggedIn,'本机 Codex 尚未使用 ChatGPT 登录，请先完成 Codex 登录');
    const dir=path.join(this.cacheRoot,'edit-engine',uid());await fs.mkdir(dir,{recursive:true});const schemaFile=path.join(dir,'schema.json'),output=path.join(dir,'result.json');await fs.writeFile(schemaFile,JSON.stringify(schema));
    const images=[],messages=[];
    for(const item of input){const parts=[];for(const c of (Array.isArray(item.content)?item.content:[{type:'input_text',text:item.content}])) {
      if(c.type==='input_text')parts.push(c.text);
      else if(c.type==='input_image'){const match=/^data:image\/(jpeg|png);base64,(.+)$/s.exec(c.image_url);insist(match,'模型图片必须为本地抽帧');const f=path.join(dir,`frame-${images.length}.${match[1]}`);await fs.writeFile(f,Buffer.from(match[2],'base64'));images.push(f);parts.push(`【附图 ${images.length}】`);}
    }messages.push({role:item.role,content:parts.join('\n')});}
    const {args,prompt}=codexRequest({model,schemaFile,output,images,instructions,messages});
    try {
      await new Promise((resolve,reject)=>{
        if(signal?.aborted)return reject(new EditError('任务已取消'));
        const child=spawn(this.bin,args,{cwd:dir,env:this.environment,windowsHide:true,stdio:['pipe','pipe','pipe']});let tail='',timed=false;
        const kill=()=>{if(process.platform==='win32')spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');};
        const timer=setTimeout(()=>{timed=true;kill();},180000);signal?.addEventListener('abort',kill,{once:true});
        child.stdin.on('error',()=>{});child.stdin.end(prompt);child.stdout.on('data',b=>tail=(tail+b).slice(-16000));child.stderr.on('data',b=>tail=(tail+b).slice(-16000));
        child.on('error',()=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);reject(new EditError('Codex 无法启动，请检查本机安装',503));});
        child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',kill);if(signal?.aborted)return reject(new EditError('任务已取消',409));if(code!==0||timed){const diagnostic=tail.replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]').replace(/Bearer\s+\S+/gi,'Bearer [redacted]'),capacity=!timed&&/Selected model is at capacity|model.*temporarily unavailable/i.test(tail),failure=codexFailure(tail,{timed}),error=Object.assign(new EditError(failure.message,503),{capacity,code:failure.code});void fs.writeFile(path.join(dir,'failure.log'),diagnostic).catch(()=>{}).finally(()=>reject(error));return;}resolve();});
      });
      const result=JSON.parse(await fs.readFile(output,'utf8'));this.verifiedAt=new Date().toISOString();return {result,usage:null,model:model||'Codex 默认模型',...(attempt?{fallbackFrom:this.model}:{})};
    }catch(error){if(error.capacity&&attempt+1<candidates.length&&!signal?.aborted)return await this.structured(instructions,input,schema,signal,attempt+1);if(error.capacity)error.message='可用模型当前都很繁忙，输入已保存，请稍后重试';throw error;}
    finally {await fs.writeFile(path.join(dir,'request.json'),JSON.stringify({model,imageCount:images.length,completedAt:new Date().toISOString()})).catch(()=>{});}
  }
  async transcribe(file,signal) {
    if(signal?.aborted)throw new EditError('任务已取消',409);
    const engine=process.env.VIDEO_AGENT_ASR_ENGINE||'faster-whisper',model=process.env.VIDEO_AGENT_WHISPER_MODEL||'small';
    insist(['faster-whisper','whisperx'].includes(engine),'未支持的本地转写引擎');
    const sourceHash=await hashFile(file),runtime=await this.runtimeSignature('asr'),key=createHash('sha256').update(JSON.stringify({version:3,sourceHash,engine,model,runtime})).digest('hex');
    const dir=path.join(this.cacheRoot,'edit-transcripts'),target=path.join(dir,key+'.json');
    try{const cached=JSON.parse(await fs.readFile(target,'utf8'));if(cached.cacheKey===key)return {...normalizeTranscript(cached.result,{model}),metrics:{...cached.result.metrics,cacheHit:true}};}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}
    const raw=await this.asr.request('transcribe',{source:file,engine},{signal,timeout:900000});
    const result=normalizeTranscript(raw,{model});
    if(signal?.aborted)throw new EditError('任务已取消',409);await fs.mkdir(dir,{recursive:true});const pending=target+'.'+uid()+'.tmp';
    await fs.writeFile(pending,JSON.stringify({cacheKey:key,result}));await fs.rename(pending,target);
    return {...result,metrics:{...result.metrics,cacheHit:false}};
  }
  async detectSpeech(file,signal){
    if(signal?.aborted)throw new EditError('任务已取消',409);
    const key=createHash('sha256').update(JSON.stringify({source:await hashFile(file),runtime:await this.runtimeSignature('asr'),engine:'silero-vad',version:1})).digest('hex'),dir=path.join(this.cacheRoot,'edit-speech-activity'),target=path.join(dir,key+'.json');
    try{const cached=JSON.parse(await fs.readFile(target,'utf8'));return {...cached,metrics:{...cached.metrics,cacheHit:true}};}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
    const result=await this.asr.request('detect_speech',{source:file},{signal,timeout:120000});
    insist(Array.isArray(result.regions)&&result.regions.every(r=>Number.isFinite(r.start)&&r.start>=0&&Number.isFinite(r.end)&&r.end>r.start),'人声活动检测返回无效时间');
    if(signal?.aborted)throw new EditError('任务已取消',409);await fs.mkdir(dir,{recursive:true});const pending=target+'.'+uid()+'.tmp';await fs.writeFile(pending,JSON.stringify(result));await fs.rename(pending,target);return {...result,metrics:{...result.metrics,cacheHit:false}};
  }
  async speak(text,voice,instructions,signal,{rate=1}={}) {
    insist(typeof text==='string'&&text.trim()&&text.length<=4000,'旁白请填写 1～4000 个字符');
    if(signal?.aborted)throw new EditError('任务已取消',409);
    const engine=process.env.VIDEO_AGENT_TTS_ENGINE==='elevenlabs'?'elevenlabs':'kokoro';
    const selectedVoice=engine==='kokoro'?localVoice(voice,instructions):voice||process.env.ELEVENLABS_VOICE_ID||'default';
    insist(Number.isFinite(rate)&&rate>=(engine==='kokoro'?.5:.7)&&rate<=(engine==='kokoro'?2:1.2),'该配音引擎不支持所选语速');
    const runtime=engine==='kokoro'?await this.runtimeSignature('tts'):'elevenlabs-pcm-v1';
    const digest=createHash('sha256').update(JSON.stringify({version:3,engine,text,voice:selectedVoice,rate,runtime,model:engine==='elevenlabs'?process.env.ELEVENLABS_MODEL_ID||'eleven_multilingual_v2':'kokoro-v1.0-misaki',configuredVoice:engine==='elevenlabs'?process.env.ELEVENLABS_VOICE_ID:null})).digest('hex');
    const dir=path.join(this.cacheRoot,'edit-voices','cache-'+digest);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'speech.wav');
    try{const cached=await fs.readFile(file);if(cached.length>44&&cached.toString('ascii',0,4)==='RIFF'){this.lastSpeechMetrics={cacheHit:true,engine,voice:selectedVoice,rate};return cached;}}catch(e){if(e.code!=='ENOENT')throw e;}
    const pending=path.join(dir,'pending-'+uid()+'.wav');
    try{
      let metrics;
      if(engine==='elevenlabs'){await fs.writeFile(pending,await speakElevenLabs(text,selectedVoice,signal,{rate}));metrics={engine};}
      else {const result=await this.tts.request('speak',{text,output:pending,voice:selectedVoice,rate},{signal,timeout:360000});metrics=result.metrics||{};}
      if(signal?.aborted)throw new EditError('任务已取消',409);
      const bytes=await fs.readFile(pending);insist(bytes.length>44&&bytes.toString('ascii',0,4)==='RIFF','语音引擎没有生成有效的 WAV');
      await fs.rename(pending,file);this.lastSpeechMetrics={...metrics,cacheHit:false,engine,voice:selectedVoice,rate};return bytes;
    }finally{await fs.unlink(pending).catch(()=>{});}
  }
  async runtimeSignature(kind){
    this.signatures??=new Map();if(this.signatures.has(kind))return this.signatures.get(kind);
    const promise=(async()=>{const scripts=kind==='tts'?['local-speak.py','speech-worker.py']:['local-transcribe.py','speech-worker.py'];
      const source=await Promise.all(scripts.map(name=>fs.readFile(path.join(ROOT,'scripts',name))));
      const sitePackages=path.join(path.dirname(localPython()),'Lib/site-packages'),packages=(await fs.readdir(sitePackages).catch(()=>[])).filter(name=>/\.dist-info$/.test(name)&&/^(?:kokoro_onnx|misaki|onnxruntime|faster_whisper|ctranslate2|whisperx|torch|scenedetect)-/i.test(name)).sort();
      const models=kind==='tts'?[path.join(os.homedir(),'.cache/hyperframes/tts/models/kokoro-v1.0.onnx'),path.join(os.homedir(),'.cache/hyperframes/tts/voices/voices-v1.0.bin')]:[path.join(ROOT,'data/models/whisper-'+(process.env.VIDEO_AGENT_WHISPER_MODEL||'small')+'/model.bin')];
      const stamps=await Promise.all(models.map(async file=>{const stat=await fs.stat(file).catch(()=>null);return stat?{size:stat.size,mtime:stat.mtimeMs}:null;}));
      const hash=createHash('sha256');for(const bytes of source)hash.update(bytes);hash.update(JSON.stringify({python:localPython(),packages,stamps}));return hash.digest('hex');})();this.signatures.set(kind,promise);return promise;
  }
  async close(){for(const worker of [this.asr,this.tts]){for(const job of worker.queue?.splice(0)||[]){job.signal?.removeEventListener('abort',job.abort);job.reject(new EditError('本地语音进程已关闭',409));}worker.stop?.();}}
}
