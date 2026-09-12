import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {insist} from './contracts.mjs';
import {compileCustomSource} from './custom-source.mjs';
import {linkOrCopy} from '../edit/media.mjs';
import {brandFontResources} from './brand-fonts.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const verifiedProjects=new Map();
export async function runSceneIsolation(directory,config,{signal,probe}={}){
 signal?.throwIfAborted();
 insist(process.platform==='win32','当前自定义源码隔离仅在已验证的Windows环境可用','ISOLATION_UNAVAILABLE');
 await fs.mkdir(directory,{recursive:true});const gate=path.join(directory,'assigned.gate'),workerConfig=path.join(directory,'worker.json'),jobConfig=path.join(directory,'job.json');
 const profile=path.join(directory,'profile'),environment={SystemRoot:process.env.SystemRoot||'C:\\Windows',WINDIR:process.env.WINDIR||'C:\\Windows',PATH:path.dirname(process.execPath)+';'+path.join(process.env.SystemRoot||'C:\\Windows','System32'),TEMP:path.join(directory,'temp'),TMP:path.join(directory,'temp'),LOCALAPPDATA:path.join(profile,'AppData/Local'),APPDATA:path.join(profile,'AppData/Roaming'),USERPROFILE:profile,SystemDrive:path.parse(directory).root.replace(/[\\/]+$/,'')};
 for(const dir of [environment.TEMP,environment.LOCALAPPDATA,environment.APPDATA])await fs.mkdir(dir,{recursive:true});
 const limits={cpuSeconds:30,wallMs:45000,processMemoryBytes:1024**3,jobMemoryBytes:2*1024**3};if(probe==='timeout')limits.wallMs=1500;if(probe==='memory'){limits.processMemoryBytes=192*1024**2;limits.jobMemoryBytes=256*1024**2;}
 await fs.writeFile(workerConfig,JSON.stringify({...config,directory,gate,probe,browser:process.env.HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'}));
 await fs.writeFile(jobConfig,JSON.stringify({executable:process.execPath,arguments:['--max-old-space-size=192',path.join(root,'scripts/native-scene-worker.mjs'),workerConfig],directory,gate,environment,...limits}));
 let log='';const result=await new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const child=spawn(path.join(environment.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-File',path.join(root,'scripts/native-scene-job.ps1'),'-Config',jobConfig],{cwd:directory,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});
  const stop=()=>child.kill(),timer=setTimeout(stop,limits.wallMs+20000);signal?.addEventListener('abort',stop,{once:true});
  child.stdout.on('data',b=>log=(log+b).slice(-24000));child.stderr.on('data',b=>log=(log+b).slice(-24000));child.on('error',reject);child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);resolve({code,log});});
 });
 await fs.writeFile(path.join(directory,'windows-job.log'),log);let evidence;try{evidence=JSON.parse(log.trim());}catch{insist(false,'Windows隔离启动失败：'+log.slice(-1500),'ISOLATION_FAILED');}
 await fs.writeFile(path.join(directory,'windows-job.json'),JSON.stringify(evidence,null,2));signal?.throwIfAborted();
 if(probe==='timeout'||probe==='memory')return {...result,evidence};
 insist(result.code===0&&evidence.assigned&&!evidence.timedOut,'自定义场景隔离检查未通过：'+(evidence.stdout||evidence.stderr).slice(-1200),'CUSTOM_RUNTIME_FAILED');
 return {...result,evidence,runtime:JSON.parse(await fs.readFile(path.join(directory,'runtime-evidence.json'),'utf8'))};
}
export async function verifyCustomProject(outputDir,document,assets,{signal}={}){
 const scenes=document.scenes.filter(s=>s.effect==='custom-native');if(!scenes.length)return;
 const html=await fs.readFile(path.join(outputDir,'index.html')),inputHash=createHash('sha256').update(html).update(JSON.stringify({document,assets})).digest('hex'),cacheKey=path.resolve(outputDir)+':'+inputHash;
 signal?.throwIfAborted();if(verifiedProjects.has(cacheKey))return verifiedProjects.get(cacheKey);
 // PowerShell Add-Type and Chromium still encounter MAX_PATH in deeply nested jobs.
 const directory=path.join(root,'outputs','native-isolation',randomUUID()),files=['index.html','assets/gsap.min.js'];
 const byId=Object.fromEntries(assets.map(a=>[a.id,a]));
 const targets=scenes.map(scene=>{const compiled=compileCustomSource(document.sourceBundles.find(b=>b.sceneId===scene.id),{scene,nodes:document.nodes.filter(n=>n.sceneId===scene.id),assets:byId});return {id:scene.id,startFrame:scene.startFrame,durationFrames:scene.durationFrames,targets:compiled.motionTargets,sampleTimes:compiled.sampleTimes};});
 for(const asset of assets){const ref=asset.compiledRef||asset.ref;insist(/^assets\/[a-zA-Z0-9_.-]+$/.test(ref),'隔离素材路径无效','CUSTOM_RESOURCE');files.push(ref);}
 const results=[];for(const [i,target]of targets.entries()){signal?.throwIfAborted();const sceneDirectory=path.join(directory,String(i+1));for(const file of new Set(files))await linkOrCopy(path.join(outputDir,file),path.join(sceneDirectory,file));results.push(await runSceneIsolation(sceneDirectory,{files:[...new Set(files)],fonts:brandFontResources(assets),output:document.output,scenes:[target]},{signal}));}
 const result={evidence:results[0].evidence,runtime:{motion:results.flatMap(r=>r.runtime.motion)},scenes:results.map((r,i)=>({sceneId:targets[i].id,evidence:r.evidence,runtime:r.runtime}))};
 await fs.writeFile(path.join(outputDir,'custom-isolation.json'),JSON.stringify({status:'passed',inputHash,directory:path.relative(outputDir,directory).replaceAll('\\','/'),windows:result.evidence,motion:result.runtime.motion,scenes:result.scenes},null,2));verifiedProjects.set(cacheKey,result);if(verifiedProjects.size>32)verifiedProjects.delete(verifiedProjects.keys().next().value);return result;
}
