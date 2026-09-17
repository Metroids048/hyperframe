// [NEW / G1,G2,G3] Read-only evidence gate plus existing regression runners.
// Never edits projects, imports packages, generates media, or signs human review.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {conversationJobs,nativeChangeReceipt} from '../lib/orchestration/conversation-edit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),value=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const runDir=path.resolve(root,value('--run-dir','outputs/global-media/final-delivery/'+new Date().toISOString().replaceAll(':','-')));
await fs.mkdir(runDir,{recursive:true});
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const digest=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const issues=[],checks=[];
const check=async(name,fn)=>{try{const evidence=await fn();checks.push({name,passed:true,evidence});return evidence;}catch(e){issues.push({name,error:e.message});checks.push({name,passed:false,error:e.message});return null;}};
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const verifiers=['verify-global-media-acceptance.mjs','verify-global-media-output.mjs','verify-global-history-reopen.mjs','verify-global-effect-failure.mjs','verify-global-remainder.mjs','verify-editor.mjs'];
const verifierSources=Object.fromEntries(await Promise.all(verifiers.map(async name=>[name,await digest(path.join(root,'scripts',name))])));
// Explicit opt-in runs the existing non-provider regressions; no replacement tests.
for(const group of (value('--run-checks','')).split(',').filter(Boolean)){
 requireValue(['core','browser'].includes(group),'Supported --run-checks: core,browser');
 const log=path.join(runDir,group+'.log'),result=spawnSync(process.execPath,['scripts/verify-editor.mjs',group],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
 await fs.writeFile(log,(result.stdout||'')+(result.stderr||''));
 checks.push({name:'executed-'+group,passed:result.status===0,exitCode:result.status,log});
 if(result.status!==0)issues.push({name:group,error:'Existing regression runner failed'});
}
let input={};
await check('evidence-index',async()=>{input=await read(path.join(runDir,'evidence-index.json'));requireValue(input.schemaVersion===1,'Unsupported evidence index');return 'evidence-index.json';});
const bound=await check('source-binding',async()=>{
 requireValue(input.source?.files&&Object.keys(input.source.files).length>0,'Missing source/config/dependency hashes');
 for(const [file,sha] of Object.entries(input.source.files))requireValue(await digest(path.resolve(root,file))===sha,'Source changed: '+file);
 requireValue(input.source.files['package-lock.json']&&input.source.files['config/skills/registry.json'],'Missing dependency/skill binding');
 requireValue((await read(path.join(root,'package.json'))).devDependencies.hyperframes==='0.8.33','Unexpected HyperFrames version');return input.source;
});
const evidence=async(name)=>{
 const ref=input.evidence?.[name];requireValue(ref?.file&&ref.sha256,'Missing original evidence: '+name);
 const file=path.resolve(root,ref.file);requireValue(await digest(file)===ref.sha256,'Evidence changed: '+name);return read(file);
};
const regression=await check('regressions',async()=>{
 const report=await evidence('regressions');requireValue(bound&&report.sourceFingerprint===input.source.fingerprint,'Regressions belong to another source');
 requireValue(['core','browser','workspace-delivery','workspace-content','application','commerce-native'].every(k=>report.commands?.some(c=>c.name===k&&c.exitCode===0)),'Applicable regressions incomplete');
 for(const c of report.commands){requireValue(c.log&&c.sha256,'Missing raw command log');requireValue(await digest(path.resolve(root,c.log))===c.sha256,'Command log changed');}return report.commands;
});
const platform=await check('windows-candidate',async()=>{
 const r=await evidence('windows');requireValue(r.head_sha===input.source?.commit,'Windows ran another candidate');
 const j=r.jobs?.find(j=>j.name.includes('windows'));requireValue(j?.conclusion==='success','Windows not successful');
 for(const name of ['Core regressions (no paid providers)','Delivered workspace integrity and preservation','Legacy creation and server regressions','Real browser, FFmpeg and HyperFrames acceptance','Windows workbench startup smoke test'])requireValue(j.steps?.some(s=>s.name===name&&s.conclusion==='success'),'Windows step not passed: '+name);return {head:r.head_sha,job:j.id};
});
let project,projectDir,current;
await check('native-project',async()=>{
 requireValue(input.projectDir,'Missing retained native project directory');projectDir=path.resolve(root,input.projectDir);project=await read(path.join(projectDir,'native-project.json'));
 requireValue(project.id===input.projectId&&project.currentRevisionId===input.revisionId,'Final project/revision changed');
 current=project.revisions.find(r=>r.id===project.currentRevisionId);requireValue(current,'Current revision missing');return {id:project.id,revision:current.id};
});
const doc=async id=>{const r=project.revisions.find(r=>r.id===id);requireValue(r,'Missing historical revision '+id);return read(path.join(projectDir,r.directory,'document.json'));};
const business=d=>JSON.stringify(Object.fromEntries(['nodes','scenes','captions','audioGraph','transitions','output','durationFrames','sourceBundles'].map(k=>[k,d[k]])));
const turns=await check('eight-edits-three-semantic',async()=>{
 requireValue(current,'Missing project');const ancestry=new Set();let r=current;
 while(r){requireValue(!ancestry.has(r.id),'History cycle');ancestry.add(r.id);r=project.revisions.find(v=>v.id===r.parentId);}
 const ui=await fs.readFile(path.resolve(root,input.uiEvents),'utf8');const events=ui.trim().split('\n').filter(Boolean).map(JSON.parse);
 const edits=[];let semantic=0;
 for(const j of conversationJobs(project)){
  if(j.status!=='complete'||!j.changeReceipt||!ancestry.has(j.revisionId)||j.baseRevisionId===j.revisionId)continue;
  const before=await doc(j.baseRevisionId),after=await doc(j.revisionId);if(business(before)===business(after))continue;
  requireValue(events.some(e=>e.projectId===project.id&&e.job?.id===j.id&&e.before===j.baseRevisionId&&e.after===j.revisionId),'Missing original WebUI receipt for '+j.id);
  nativeChangeReceipt(before,after,j.input.message,j.changeReceipt.changeSet,j.requestedScope);
  const r=project.revisions.find(r=>r.id===j.revisionId),edit=await read(path.join(projectDir,r.directory,'edit.json'));
  if(edit.mode==='model'){
   const dir=path.join(projectDir,r.directory,'model-calls/edit-engine');const calls=await fs.readdir(dir);let real=false;
   for(const id of calls){try{const req=await read(path.join(dir,id,'request.json')),res=await read(path.join(dir,id,'result.json'));if(req.promptSha256&&req.schemaSha256&&req.completedAt&&res.operations?.length)real=true;}catch{}}
   requireValue(real,'No retained model request/response for '+j.id);semantic++;
  }
  edits.push({job:j.id,base:j.baseRevisionId,revision:j.revisionId,mode:edit.mode});
 }
 requireValue(edits.length>=8,'Only '+edits.length+' actual successful WebUI edits');requireValue(semantic>=3,'Only '+semantic+' retained semantic edits');return {edits,semantic};
});
const media=await check('rendered-output',async()=>{
 const r=await evidence('media');requireValue(r.projectId===project?.id&&r.revisionId===current?.id,'Output report belongs to another revision');
 requireValue(r.fullMp4Decode&&r.fullPreviewPlayback&&r.differences?.length&&r.differences.every(d=>d.meanDifference<22),'Incomplete preview/render evidence');
 requireValue(await digest(path.join(projectDir,current.directory,'commerce-final.mp4'))===r.sha256,'Video changed');return r;
});
const reopened=await check('history-reopen',async()=>{
 const r=await evidence('reopen');requireValue(r.job?.kind==='import'&&r.job.status==='complete'&&r.sourceUnchanged===true,'Missing actual import result');
 requireValue(r.projectId===project?.id&&project.jobs.some(j=>j.id===r.job.id&&j.status==='complete'),'Import is not this project');
 requireValue(turns?.edits.some(t=>project.revisions.some(v=>v.id===t.revision&&v.createdAt>r.job.completedAt)),'No edit after reopening');return r;
});
// These receipts retain original artifacts, not a blanket string "passed".
for(const name of ['routing-failures','voice','main-workbench'])await check(name,async()=>{
 const r=await evidence(name);requireValue(r.sourceFingerprint===input.source?.fingerprint,'Receipt belongs to another implementation');
 requireValue(r.projectId===project?.id,'Receipt belongs to another project');
 const required={'routing-failures':['routing-unavailable','speech-unavailable','effect-runtime-failure','revision-conflict'],voice:['provider-identity','measured-timing','caption-independence','no-truncation','mix-preservation'],'main-workbench':['edit','preview','undo','redo','refresh','mp4-download','history-download']}[name];
 for(const key of required){const c=r.checks?.find(c=>c.name===key);requireValue(c?.verified&&c.artifact&&c.sha256,'Missing raw '+name+'/'+key);requireValue(await digest(path.resolve(root,c.artifact))===c.sha256,'Raw evidence changed: '+key);}return r;
});
const artifacts=await check('delivery-files',async()=>{
 requireValue(input.deliveryDir&&input.artifacts,'Missing delivery directory/index');const dir=path.resolve(root,input.deliveryDir);
 for(const name of ['README.md','commerce-final.mp4','history.zip','CHANGELOG.md','SHA256SUMS']){requireValue(input.artifacts[name],'Missing artifact binding: '+name);requireValue(await digest(path.join(dir,name))===input.artifacts[name],'Delivery artifact changed: '+name);}
 requireValue(media&&input.artifacts['commerce-final.mp4']===media.sha256,'Delivery video differs from review');return input.artifacts;
});
const implementation_complete=Boolean(bound&&regression),technical_ready=checks.every(c=>c.passed);
// Human review is always pending here. Only the existing human review system
// may produce acceptance; this CLI cannot promote a machine receipt to human.
const report={schemaVersion:1,generatedAt:new Date().toISOString(),implementation_complete,technical_ready,human_review:'pending',final_status:technical_ready?'ready_for_review':'blocked',projectId:project?.id||null,revisionId:current?.id||null,verifierSources,checks,issues};
await fs.writeFile(path.join(runDir,'acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({report:path.join(runDir,'acceptance.json'),implementation_complete,technical_ready,final_status:report.final_status,issues},null,2));
if(!technical_ready)process.exitCode=1;
