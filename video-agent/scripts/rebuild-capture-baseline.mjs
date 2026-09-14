import fs from 'node:fs/promises';import path from 'node:path';
const id='d10732b4-bbdf-4dbb-b527-9a5451b4b31a',jobId='job-bb038a3c-e3da-4e56-9875-757179da6572',base='http://127.0.0.1:3024';
const out=path.resolve('outputs/commerce-rebuild-v2/B-before-fix');await fs.mkdir(out,{recursive:true});let last='';
for(let i=0;i<600;i++){
 const p=(await(await fetch(base+'/api/commerce/'+id)).json()).project,j=p.jobs.find(x=>x.id===jobId);
 const summary=[j.status,j.stage,j.modelCalls].join(' / ');if(summary!==last){console.log(summary);last=summary;}
 if(j.status==='running'&&j.runStage==='quality'){
  const r=await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',projectId:id,jobId})});if(!r.ok)throw Error(await r.text());
  await fs.writeFile(out+'/pause-reason.json',JSON.stringify({reason:'Capture actual old-assembly baseline before loading verified method/assembly fixes. Resume same run with preserved calls.',projectId:id,jobId,runId:j.runId,modelCalls:j.modelCalls,maxModelCalls:j.maxModelCalls,at:new Date().toISOString()},null,2));
  for(let n=0;n<60;n++){await new Promise(r=>setTimeout(r,500));const q=(await(await fetch(base+'/api/commerce/'+id)).json()).project;if(!['running','queued'].includes(q.jobs.find(x=>x.id===jobId).status))break;}
  const dir=path.resolve('data/result-completion-projects',id,'versions',jobId);
  for(const name of await fs.readdir(dir)){if(['assets','index.html','document.json','manifest.json','object-map.json','hyperframes.json','story-plan.json','timing-plan.json','resource-receipts.json','production-run.json'].includes(name)||/^scene-\d+\.json$/.test(name))await fs.cp(path.join(dir,name),path.join(out,name),{recursive:true});}
  console.log('Baseline captured; existing job cancelled at checkpoint, ready for same-run resume.');break;
 }
 if(!['running','queued'].includes(j.status)){console.log('Terminal before capture:',j.error||j.status);break;}
 await new Promise(r=>setTimeout(r,2000));
}
