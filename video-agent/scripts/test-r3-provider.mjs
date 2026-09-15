import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateCommerceAsset} from '../lib/creative/runninghub.mjs';
test('ambiguous paid submission is durably retained and never resubmitted',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r3-provider-isolated-')),prior=process.env.RUNNINGHUB_API_KEY;
 process.env.RUNNINGHUB_API_KEY='isolated-test-key';let submissions=0;
 try{
  await fs.mkdir(path.join(root,'config'));await fs.writeFile(path.join(root,'source.png'),'test-input-no-real-provider');
  await fs.writeFile(path.join(root,'config/runninghub.local.json'),JSON.stringify({image:{mode:'app',body:{webappId:'isolated-test',nodeInfoList:[]}},authorization:{id:'isolated-only',source:'test fixture, not user authorization',maxSubmissions:1}}));
  const options={root,project:{id:'test',request:{}},job:{},kind:'image',prompt:'fixture',sourceAsset:{id:'source',path:'source.png'},role:'test',save:async()=>{},signal:new AbortController().signal,io:{fetch:async(url)=>{
   if(url.pathname.endsWith('/upload'))return {ok:true,json:async()=>({code:0,data:{fileName:'fixture.png'}})};
   submissions++;throw Error('connection lost after submit');
  }}};
  await assert.rejects(generateCommerceAsset(options),/connection lost/);
  await assert.rejects(generateCommerceAsset(options),{code:'PROVIDER_RECONCILIATION'});assert.equal(submissions,1);
  const files=await fs.readdir(path.join(root,'data/runninghub-jobs'));const record=JSON.parse(await fs.readFile(path.join(root,'data/runninghub-jobs',files[0])));assert.equal(record.status,'submitting');assert.equal(record.cost.amount,null);assert.ok(!JSON.stringify(record).includes('isolated-test-key'));
 }finally{if(prior===undefined)delete process.env.RUNNINGHUB_API_KEY;else process.env.RUNNINGHUB_API_KEY=prior;await fs.rm(root,{recursive:true});}
});
