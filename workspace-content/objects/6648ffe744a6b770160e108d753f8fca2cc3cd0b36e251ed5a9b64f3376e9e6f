import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {HyperFramesResourceCatalog,HyperFramesResourcePlanner,explicitResource} from './resource-catalog.mjs';
import {generateCommerceAsset} from './runninghub.mjs';
const here=import.meta.dirname;
const findings=[];
const sha=x=>createHash('sha256').update(x).digest('hex');
const blob=x=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+x.length+'\0'),x])).digest('hex');
const sources={};
for(const [name,expected] of [['resource-catalog.mjs','a9b848b686ca96e088fdd910f9e930f2aa5567a1'],['runninghub.mjs','7a22c9718f468cff051fe40d5d8be8b37944e517']]){
 const data=await fs.readFile(path.join(here,name));const actual=blob(data);assert.equal(actual,expected);sources[name]={gitBlobSha:actual,bytes:data.length};
}
// Never allow a real paid request in this audit.
globalThis.fetch=async()=>{throw new Error('REAL_NETWORK_DISABLED');};
const resources=[{id:'block:cinematic-zoom',name:'cinematic-zoom',tags:['transition','zoom'],description:'Cinematic zoom transition',path:'fixture',sha256:'fixture',sourceCommit:'fixture'}];
const catalog=new HyperFramesResourceCatalog(here,{groups:{blocks:resources},contentHash:'isolated-fixture'});
assert.equal(explicitResource('Chromatic Radial Split'),'chromatic-radial-split');
assert.equal(explicitResource('不要色散'),null);
const planner=new HyperFramesResourcePlanner(catalog,[{id:'lt-mask-reveal',compatible:true,eligible:true,score:0}]);
const named=planner.plan('cinematic-zoom');
assert.equal(named.requestedCanonicalId,null);
assert.equal(named.status,'resolved');
assert.deepEqual(named.selected.map(x=>x.id),['lt-mask-reveal']);
findings.push({id:'R01',scope:'unchanged resource planner with controlled catalog',request:'cinematic-zoom',expected:'exact resource or explicit missing-adapter result',actual:{requestedCanonicalId:named.requestedCanonicalId,status:named.status,selected:named.selected.map(x=>x.id)},defectReproduced:true});
const empty=new HyperFramesResourcePlanner(catalog,[]).plan('completely-unknown-effect');
assert.equal(empty.status,'resolved');assert.equal(empty.selected.length,0);
findings.push({id:'R02',scope:'unchanged resource planner with controlled catalog',request:'completely-unknown-effect',expected:'unresolved / no compatible adapter',actual:{status:empty.status,selected:empty.selected},defectReproduced:true});
const neg=explicitResource('Do not use chromatic split');
assert.equal(neg,'chromatic-radial-split');
findings.push({id:'R03',scope:'unchanged explicitResource',request:'Do not use chromatic split',expected:null,actual:neg,defectReproduced:true});
// Exact gate copied from service.mjs. This tests the gate, not the full service.
const generationGate=(target,assets,message)=>['image','video'].includes(target)||(target==='marketing'&&!assets.some(a=>a.kind==='video')&&assets.some(a=>a.kind==='image')&&!/(?:不|无需|禁止)生成/.test(message)&&/生成.*(?:镜头|视频)|图生/.test(message));
const ordinary=generationGate('marketing',[{kind:'image'}],'基于这张商品图，做一条30秒新品广告');
const explicit=generationGate('marketing',[{kind:'image'}],'生成一条30秒新品视频');
const afterPartial=generationGate('marketing',[{kind:'image'},{kind:'video'}],'生成一条30秒新品视频');
assert.equal(ordinary,false);assert.equal(explicit,true);assert.equal(afterPartial,false);
findings.push({id:'G01',scope:'exact generation gate extracted from service.mjs',expected:'plan required assets by target and gaps; partial retry retains outstanding shots',actual:{ordinaryMarketingRequestEntersGeneration:ordinary,explicitKeywordRequestEntersGeneration:explicit,afterOneVideoDownloadedEntersGeneration:afterPartial},defectReproduced:true});
const previous={key:process.env.RUNNINGHUB_API_KEY,base:process.env.RUNNINGHUB_BASE_URL};
process.env.RUNNINGHUB_API_KEY='audit-only-not-a-real-credential';process.env.RUNNINGHUB_BASE_URL='https://www.runninghub.ai';
const root=await fs.mkdtemp(path.join(here,'fixture-'));
try{
 await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.mkdir(path.join(root,'assets'));
 const inputBytes=Buffer.from('AUDIT FIXTURE ONLY - not media');await fs.writeFile(path.join(root,'assets/input.png'),inputBytes);
 const config={video:{mode:'model',endpoint:'/openapi/v2/audit-probe',body:{prompt:'$prompt',image:'$image',aspect:'$aspect',duration:'$duration'}},authorization:{id:'audit-authorization',source:'mock-only-never-real-spend',maxSubmissions:5}};
 await fs.writeFile(path.join(root,'config/runninghub.local.json'),JSON.stringify(config));
 let submits=0;const submittedBodies=[];
 const io={fetch:async(url,opts)=>{
  const route=new URL(url).pathname;
  if(route==='/task/openapi/upload'){await delay(100);return {ok:true,json:async()=>({code:0,data:{fileName:'fixture.png'}})};}
  if(route==='/openapi/v2/audit-probe'){submits++;submittedBodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({taskId:'SIMULATED-'+submits})};}
  if(route==='/openapi/v2/query')throw Object.assign(Error('Stop mock after recording submission'),{code:'AUDIT_STOP'});
  throw Error('Unexpected mock route '+route);
 }};
 const project={id:'fixture-project',request:{output:{width:1080,height:1080}}};
 const args={root,project,kind:'video',prompt:'fixture product rotation',sourceAsset:{id:'asset-input',path:'assets/input.png'},duration:8,role:'hero',save:async()=>{},signal:new AbortController().signal,io};
 const results=await Promise.allSettled([generateCommerceAsset({...args,job:{}}),generateCommerceAsset({...args,job:{}})]);
 assert(results.every(x=>x.status==='rejected'&&x.reason.code==='AUDIT_STOP'));
 assert.equal(submits,2);
 const records=await fs.readdir(path.join(root,'data/runninghub-jobs'));
 assert.equal(records.length,1);
 findings.push({id:'P01',scope:'unchanged provider, concurrent calls, injected mock HTTP and isolated dependencies',expected:'one submission for identical request',actual:{simulatedSubmissions:submits,persistedRecords:records.length},defectReproduced:true,limitation:'Provider-level race; not evidence that the current single-process UI allows simultaneous same-project submissions.'});
 assert.equal(submittedBodies[0].aspect,'9:16');
 findings.push({id:'P02',scope:'unchanged provider with injected mock HTTP',expected:'requested 1:1 preserved or rejected explicitly',actual:{requested:{width:1080,height:1080},submittedAspect:submittedBodies[0].aspect},defectReproduced:true});
 const file=path.join(root,'data/runninghub-jobs',records[0]);
 const record=JSON.parse(await fs.readFile(file,'utf8'));
 const cachedAsset={id:record.recordId,kind:'video',path:'assets/input.png',auditOnly:true};
 await fs.writeFile(file,JSON.stringify({...record,status:'downloaded',asset:cachedAsset,sha256:sha(inputBytes)}));
 project.request.output={width:1920,height:1080};
 let requestedNetwork=0;
 const returned=await generateCommerceAsset({...args,job:{},io:{fetch:async()=>{requestedNetwork++;throw Error('Should have required a new aspect-aware request');}}});
 assert.equal(returned.id,cachedAsset.id);assert.equal(requestedNetwork,0);
 findings.push({id:'P03',scope:'unchanged provider; locally constructed downloaded record, no real video',expected:'different output aspect changes generation identity',actual:{newRequestedAspect:'16:9',returnedOldCachedAsset:true,newSubmissions:requestedNetwork},defectReproduced:true});
}finally{
 await fs.rm(root,{recursive:true,force:true});
 if(previous.key===undefined)delete process.env.RUNNINGHUB_API_KEY;else process.env.RUNNINGHUB_API_KEY=previous.key;
 if(previous.base===undefined)delete process.env.RUNNINGHUB_BASE_URL;else process.env.RUNNINGHUB_BASE_URL=previous.base;
}
const report={repo:'Metroids048/hyperframe',commit:'46c6ff6066fba063f18b0fd057180eece65994fc',executedAt:new Date().toISOString(),runtime:process.version,scope:'Source-level isolated reproductions. NOT full app tests, UI, paid provider, real media or visual acceptance.',originalSourceHashes:sources,findings,reproduced:findings.length};
await fs.writeFile(path.join(here,'probe-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
