import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {deliveryRoutes} from '../lib/creative/delivery-entry.mjs';
test('delivery routes fail closed and derive current job and files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hf-delivery-'));
 try{
 await fs.mkdir(path.join(root,'docs/result-completion'),{recursive:true});
 await fs.writeFile(path.join(root,'docs/result-completion/delivery-contract.json'),JSON.stringify({cases:[{id:'Q02-A'}]}));
 await fs.writeFile(path.join(root,'docs/result-completion/results.json'),JSON.stringify([{id:'Q02-A',projectId:'p',status:'old',artifacts:[{kind:'final_video',path:'missing.mp4'}]}]));
 const project={request:{message:'原始需求'},updatedAt:'2026-09-12',currentRevisionId:'r',revisions:[{id:'r',rendered:true}],jobs:[{id:'j',runId:'run',status:'failed',error:'真实错误'}]};
 const creative={has:()=>true,get:()=>project,versionDirectory:(_p,r)=>path.join(root,r.directory||'')};
 const call=async url=>{let status,body;const res={writeHead:(n)=>status=n,end:b=>body=b};await deliveryRoutes(root,{method:'GET'},res,new URL(url,'http://localhost'),{creative,file:async(_req,_res,target)=>{status=200;body=await fs.readFile(target,'utf8');}});return {status,body};};
 for(const url of ['/delivery-assets/bad','/delivery-assets/%GG/video','/delivery-assets/Q02-A/final_video','/delivery-assets/Q02-A/unknown'])assert.equal((await call(url)).status,404);
 let page=await call('/results');assert.equal(page.status,200);assert(!page.body.includes('<video'));assert(page.body.includes('文件缺失'));assert(page.body.includes('真实错误'));assert(page.body.includes('原始需求'));assert(page.body.includes('run run'));
 project.jobs[0].modelCalls=54;project.jobs.push({...project.jobs[0],id:'resume-job',modelCalls:56});
 page=await call('/results');assert(page.body.includes('累计模型调用 56 次'));assert(!page.body.includes('累计模型调用 110 次'));
 project.jobs.push({id:'edit-job',kind:'edit',status:'complete',modelCalls:2});
 page=await call('/results');assert(page.body.includes('累计模型调用 58 次'));
 await fs.writeFile(path.join(root,'commerce-final.mp4'),'test file');
 page=await call('/results');assert(page.body.includes('<video'));assert.equal((await call('/delivery-assets/Q02-A/final_video')).status,200);
 assert(page.body.includes('?revision=r'));
 await fs.mkdir(path.join(root,'old'));await fs.writeFile(path.join(root,'old/commerce-final.mp4'),'old-version');project.revisions.push({id:'old',directory:'old',rendered:true});
 assert.equal((await call('/delivery-assets/Q02-A/final_video?revision=old')).body,'old-version');
 assert.equal((await call('/delivery-assets/Q02-A/final_video?revision=missing')).status,404);
 assert.equal((await call('/delivery-assets/Q02-A/final_video?revision=r')).body,'test file');
 await fs.unlink(path.join(root,'commerce-final.mp4'));await fs.symlink('/etc/hosts',path.join(root,'commerce-final.mp4'));
 assert.equal((await call('/delivery-assets/Q02-A/final_video')).status,404);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
