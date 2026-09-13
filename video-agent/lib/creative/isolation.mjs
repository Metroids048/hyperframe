import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {insist} from './contracts.mjs';
import {compileCustomSource} from './custom-source.mjs';
import {linkOrCopy} from '../edit/media.mjs';
import {brandFontResources} from './brand-fonts.mjs';
import {digest,validateReceipt,parseSupervisor,parseProtocolJson} from './isolation-protocol.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const verifiedProjects=new Map();
export async function runSceneIsolation(directory,config,{signal,probe}={}){
 signal?.throwIfAborted();

 await fs.mkdir(directory,{recursive:true});const gate=path.join(directory,'assigned.gate'),workerConfig=path.join(directory,'worker.json'),jobConfig=path.join(directory,'job.json');
 await fs.rm(gate,{force:true});
 const runId=randomUUID(),receiptPath=path.join(directory,'receipt-'+runId+'.json');
 const inputParts=await Promise.all(config.files.map(async file=>[file,digest(await fs.readFile(path.join(directory,file)))]));
 const identity={runId,inputHash:digest(JSON.stringify({config,inputParts})),sceneIds:config.scenes.map(s=>s.id),requirements:config.scenes.map(s=>({id:s.id,visibleTargets:s.visibleTargets||s.targets,motionTargets:s.targets,motionIntervals:s.motionIntervals||[],media:s.media||[]}))};
 const windows=process.platform==='win32';
 const tempBase=await fs.realpath(windows?os.tmpdir():'/tmp');
 const privateRoot=await fs.mkdtemp(path.join(tempBase,'hf-'));await fs.chmod(privateRoot,0o700);
 try{
 const profile=path.join(privateRoot,'p'),environment=windows?{SystemRoot:process.env.SystemRoot||'C:\\Windows',WINDIR:process.env.WINDIR||'C:\\Windows',PATH:path.dirname(process.execPath)+';'+path.join(process.env.SystemRoot||'C:\\Windows','System32'),TEMP:path.join(privateRoot,'t'),TMP:path.join(privateRoot,'t'),LOCALAPPDATA:path.join(profile,'AppData/Local'),APPDATA:path.join(profile,'AppData/Roaming'),USERPROFILE:profile,SystemDrive:path.parse(directory).root.replace(/[\\/]+$/,'')}:{PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:profile,TMPDIR:path.join(privateRoot,'t'),TEMP:path.join(privateRoot,'t'),TMP:path.join(privateRoot,'t')};
 for(const dir of [environment.TEMP,environment.TMPDIR,environment.LOCALAPPDATA,environment.APPDATA].filter(Boolean))await fs.mkdir(dir,{recursive:true});
 const limits={cpuSeconds:30,wallMs:45000,processMemoryBytes:1024**3,jobMemoryBytes:2*1024**3};if(['timeout','browser-timeout'].includes(probe))limits.wallMs=1500;if(probe==='memory'){limits.processMemoryBytes=192*1024**2;limits.jobMemoryBytes=256*1024**2;}
 const defaultBrowser=process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome';
 await fs.writeFile(workerConfig,JSON.stringify({...config,directory,gate,probe,identity,receiptPath,browserProfile:path.join(privateRoot,'b'),browser:process.env.HYPERFRAMES_BROWSER_PATH||defaultBrowser}));
 await fs.writeFile(jobConfig,JSON.stringify({executable:process.execPath,arguments:['--max-old-space-size=192',path.join(root,'scripts/native-scene-worker.mjs'),workerConfig],directory,gate,environment,...limits}));
 let stdout='',stderr='',timedOut=false,aborted=false;
 const command=windows?path.join(environment.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'):process.execPath;
 const args=windows?['-NoProfile','-NonInteractive','-File',path.join(root,'scripts/native-scene-job.ps1'),'-Config',jobConfig]:['--max-old-space-size=192',path.join(root,'scripts/native-scene-worker.mjs'),workerConfig];
 await fs.writeFile(path.join(directory,'invocation.json'),JSON.stringify({command,args,cwd:directory,identity,limits,platform:process.platform},null,2));
 let pid;
 const result=await new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const child=spawn(command,args,{cwd:directory,windowsHide:true,detached:!windows,env:environment,stdio:['ignore','pipe','pipe']});pid=child.pid;
  let escalation;
  const send=kind=>{try{if(windows)child.kill(kind);else process.kill(-pid,kind);}catch(error){if(error.code!=='ESRCH')throw error;}};
  const stop=()=>{send('SIGTERM');escalation=setTimeout(()=>send('SIGKILL'),1500);};
  const cancel=()=>{aborted=true;stop();};
  const timer=setTimeout(()=>{timedOut=true;stop();},limits.wallMs+(windows?20000:0));
  signal?.addEventListener('abort',cancel,{once:true});
  const gateTimer=!windows?setTimeout(()=>fs.writeFile(gate,'assigned').catch(()=>{}),25):null;
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const clear=()=>{clearTimeout(timer);clearTimeout(escalation);clearTimeout(gateTimer);signal?.removeEventListener('abort',cancel);};
  child.on('error',error=>{clear();reject(error);});
  child.on('close',(code,exitSignal)=>{clear();resolve({code,exitSignal});});
 });
 // A close event proves the direct child exited. Verify its isolated process group too.
 const alive=()=>{try{process.kill(windows?pid:-pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 if(!windows&&alive()){try{process.kill(-pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}
 for(let i=0;i<100&&alive();i++)await new Promise(r=>setTimeout(r,50));
 const cleanup={privateRoot,pid,childClosed:true,processGroupChecked:!windows,exited:!alive()};
 await fs.writeFile(path.join(directory,'cleanup.json'),JSON.stringify(cleanup,null,2));
 const log=stdout+'\n'+stderr;await fs.writeFile(path.join(directory,windows?'windows-job.log':'portable-job.log'),log);
 let supervisor=windows?parseSupervisor(stdout):{type:'portable-supervisor',protocolVersion:1,exitCode:result.code,timedOut,aborted,cleanup,resourceLimits:{wallMs:limits.wallMs,nodeHeapMb:192,osCpuMemoryLimits:'not-enforced'}};
 let evidence,receiptError;try{evidence=parseProtocolJson(await fs.readFile(receiptPath,'utf8'));}catch(error){receiptError=error;evidence=null;}
 await fs.writeFile(path.join(directory,windows?'windows-job.json':'portable-job.json'),JSON.stringify({supervisor,worker:evidence},null,2));
 signal?.throwIfAborted();
 insist(cleanup.exited,'隔离子进程没有完成退出','ISOLATION_CLEANUP');
 if(['timeout','browser-timeout','memory'].includes(probe))return {...result,log,evidence:{...supervisor,status:'failed'}};
 insist(!supervisor.timedOut,'自定义场景检查超时','ISOLATION_TIMEOUT');
 if(receiptError?.code==='ISOLATION_PROTOCOL')throw receiptError;
 insist(evidence,'隔离工作进程没有返回有效回执：'+stderr.slice(-1500),'ISOLATION_PROTOCOL');
 const runtime=validateReceipt(evidence,identity,await fs.readFile(path.join(directory,'runtime-evidence.json')));
 insist(result.code===0&&supervisor.exitCode===0&&evidence.status==='passed','自定义场景隔离检查未通过：'+String(evidence.error||'worker exited without success'),evidence.errorCode||'CUSTOM_RUNTIME_FAILED');
 return {...result,log,evidence:{...supervisor,...evidence},runtime};
 }finally{await fs.rm(privateRoot,{recursive:true,force:true});}
}
export async function verifyCustomProject(outputDir,document,assets,{signal}={}){
 const scenes=document.scenes.filter(s=>s.effect==='custom-native');if(!scenes.length)return;
 const html=await fs.readFile(path.join(outputDir,'index.html')),inputHash=createHash('sha256').update(html).update(JSON.stringify({document,assets})).digest('hex'),cacheKey=path.resolve(outputDir)+':'+inputHash;
 signal?.throwIfAborted();if(verifiedProjects.has(cacheKey))return verifiedProjects.get(cacheKey);
 // PowerShell Add-Type and Chromium still encounter MAX_PATH in deeply nested jobs.
 const directory=path.join(root,'outputs','native-isolation',randomUUID()),files=['index.html','assets/gsap.min.js'];
 const byId=Object.fromEntries(assets.map(a=>[a.id,a]));
 const targets=scenes.map(scene=>{const compiled=compileCustomSource(document.sourceBundles.find(b=>b.sceneId===scene.id),{scene,nodes:document.nodes.filter(n=>n.sceneId===scene.id),assets:byId});return {id:scene.id,startFrame:scene.startFrame,durationFrames:scene.durationFrames,targets:compiled.validationRequirements.motionTargets,visibleTargets:compiled.validationRequirements.visibleTargets,mode:compiled.validationRequirements.mode,motionIntervals:compiled.validationRequirements.motionIntervals,media:compiled.validationRequirements.media,sampleTimes:compiled.sampleTimes};});
 for(const asset of assets){const ref=asset.compiledRef||asset.ref;insist(/^assets\/[a-zA-Z0-9_.-]+$/.test(ref),'隔离素材路径无效','CUSTOM_RESOURCE');files.push(ref);}
 const hasVideo=assets.some(a=>a.kind==='video');if(hasVideo)files.push('assets/runtime.js');
 const results=[];for(const [i,target]of targets.entries()){signal?.throwIfAborted();const sceneDirectory=path.join(directory,String(i+1));for(const file of new Set(files)){if(file==='assets/runtime.js')await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(sceneDirectory,file));else if(file==='index.html'&&hasVideo){await fs.mkdir(sceneDirectory,{recursive:true});await fs.writeFile(path.join(sceneDirectory,file),html.toString().replace('</body>','<script src="assets/runtime.js"></script></body>'));}else await linkOrCopy(path.join(outputDir,file),path.join(sceneDirectory,file));}results.push(await runSceneIsolation(sceneDirectory,{files:[...new Set(files)],fonts:brandFontResources(assets),output:document.output,runtimeMedia:hasVideo,scenes:[target]},{signal}));}
 const result={evidence:results[0].evidence,runtime:{motion:results.flatMap(r=>r.runtime.motion)},scenes:results.map((r,i)=>({sceneId:targets[i].id,evidence:r.evidence,runtime:r.runtime}))};
 await fs.writeFile(path.join(outputDir,'custom-isolation.json'),JSON.stringify({status:'passed',inputHash,directory:path.relative(outputDir,directory).replaceAll('\\','/'),isolationPlatform:process.platform,windows:result.evidence,motion:result.runtime.motion,scenes:result.scenes},null,2));verifiedProjects.set(cacheKey,result);if(verifiedProjects.size>32)verifiedProjects.delete(verifiedProjects.keys().next().value);return result;
}
