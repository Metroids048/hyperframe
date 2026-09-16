// Explicit manual verification: uses the configured semantic model only.
// No render, speech, music, image generation or native-project publication.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {readNativeProject} from '../lib/creative/runner.mjs';
import {planWorkbenchWorkflow} from '../lib/creative/workflow-design.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
const {document,assets}=await readNativeProject(path.join(ROOT,'deliverables/s02-gpu-closeout-20260916/versions/final'));
const catalog=await CapabilityCatalog.open(ROOT);
const out=path.join(ROOT,'outputs/workflow-live-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(out,{recursive:true});
const before=JSON.stringify(document),cases=[
 {name:'detail-variant',message:'基于这版再规划一版竖屏，母版保留，第三段内容、商品事实和声音不变。只做规划。',document,baseRevisionId:document.revisionId,scenario:'product_detail',mode:'variant'},
 {name:'general',message:'另做一个素材归档说明，列出这些素材还需要观察什么，不宣传商品，不归入上新。只生成制作单，不生成视频。',scenario:'general',mode:'create'},
];
const results=[];
for(const c of cases.filter(c=>!process.argv[2]||c.name===process.argv[2])){try{
 const plan=await planWorkbenchWorkflow({root:ROOT,message:c.message,document:c.document,baseRevisionId:c.baseRevisionId,assets,catalog});
 await fs.writeFile(path.join(out,c.name+'.json'),JSON.stringify(plan,null,2));
 assert.equal(plan.workOrder.scenario,c.scenario);assert.equal(plan.workOrder.mode,c.mode);assert.equal(plan.productionStarted,false);assert.equal(plan.qualityAccepted,false);
 if(c.name==='detail-variant')assert(plan.workOrder.requirements.some(r=>r.kind==='preserve'&&r.targetIds.includes(document.scenes[2].id)),'第三段保持要求必须绑定工程对象，不能要求用户重交已知分段');
 results.push({name:c.name,status:'passed',planId:plan.id,scenario:plan.workOrder.scenario,mode:plan.workOrder.mode});
}catch(e){results.push({name:c.name,status:'failed',code:e.code||null,error:e.message});}}
assert.equal(JSON.stringify(document),before);
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({results,productionStarted:false,qualityAccepted:false},null,2));
console.log(JSON.stringify({output:out,results}));if(results.some(r=>r.status==='failed'))process.exitCode=1;
