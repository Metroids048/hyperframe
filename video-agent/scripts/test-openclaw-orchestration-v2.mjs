import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {createCommerceEngineFacade} from '../lib/openclaw/commerce-engine-facade.mjs';
import {businessContract} from '../lib/creative/commerce-focus.mjs';
import {productionPolicy} from '../lib/creative/production-policy.mjs';
import {bindOpenClawJobProgress,createOpenClawProgressNotifier,progressEventText} from '../lib/openclaw/progress-notifier.mjs';

const context={trusted:true,workspaceId:'workspace-v2',sessionKey:'openclaw:session-v2'};

function fakeProject(){
  return {id:'project-v2',title:'Coffee launch',currentRevisionId:null,assets:[],revisions:[],jobs:[],request:{}};
}

test('controlled orchestration tools are model-visible and video_task preserves structured intent',async()=>{
  const project=fakeProject();
  let submitted=null;
  const service={
    get:id=>{assert.equal(id,project.id);return project;},
    view:value=>structuredClone(value),
    enqueue:async()=>{throw Error('submitMessage should be used');},
    submitMessage:async(_project,input)=>{submitted=structuredClone(input);return {id:'job-route-v2',status:'queued',stage:'理解需求'};},
    prepareTask:async(_project,input)=>({optimizedBrief:input.message,taskMode:input.taskMode,scenarioId:input.scenarioId,blockingGaps:[]}),
    searchResources:async query=>({query,localMaterials:[],productionResources:[{id:'product-reveal',runtime:'0.8.33'}]}),
    searchWeb:async query=>({query,sources:[{url:'https://example.com/product',title:'Product',usageType:'fact'}]}),
  };
  const facade=createCommerceEngineFacade(service,{mode:'openclaw',journalPath:path.join(await fs.mkdtemp(path.join(os.tmpdir(),'orchestration-v2-')),'operations.json'),authorizeWrite:async()=>({})});
  for(const name of ['video_prepare','video_resource_search','video_web_research'])assert(facade.tools.includes(name),name);
  assert.equal((await facade.invoke('video_prepare',{projectId:project.id,message:'帮我做一个适合小红书的咖啡机新品种草视频',taskMode:'create',scenarioId:'product_launch'},context)).preparation.scenarioId,'product_launch');
  assert.equal((await facade.invoke('video_resource_search',{projectId:project.id,query:'product reveal'},context)).productionResources[0].id,'product-reveal');
  assert.equal((await facade.invoke('video_web_research',{projectId:project.id,query:'coffee machine'},context)).sources[0].usageType,'fact');

  await facade.invoke('video_task',{
    projectId:project.id,baseRevisionId:null,operationId:'operation-v2',authorizationId:'authorization-v2',
    message:'帮我做一个适合小红书的咖啡机新品种草视频',attachmentIds:['asset-video'],attachmentPaths:[],
    taskMode:'create',scenarioId:'product_launch',workflowProfile:'create',selectedNodeId:'node-1',platform:'xiaohongshu',
    output:{width:1080,height:1920,durationSeconds:30},audio:{narration:'light',music:'background'},
  },context);
  assert.deepEqual({
    taskMode:submitted.taskMode,scenarioId:submitted.scenarioId,workflowProfile:submitted.workflowProfile,selectedNodeId:submitted.selectedNodeId,
    platform:submitted.platform,output:submitted.output,audio:submitted.audio,attachmentIds:submitted.attachmentIds,attachmentPaths:submitted.attachmentPaths,
  },{
    taskMode:'create',scenarioId:'product_launch',workflowProfile:'create',selectedNodeId:'node-1',platform:'xiaohongshu',
    output:{width:1080,height:1920,durationSeconds:30},audio:{narration:'light',music:'background'},attachmentIds:['asset-video'],attachmentPaths:[],
  });
  assert.equal(submitted.preparation.scenarioId,'product_launch');
});

test('server-owned media acquisition policy replaces generated-footage hardcoding',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'media-policy-v2-'));
  await fs.mkdir(path.join(root,'config'));
  await fs.writeFile(path.join(root,'config/commerce.json'),JSON.stringify({commerce:{mediaAcquisitionPolicy:{user_upload:'allowed',local_library:'allowed',web_research:'allowed',runninghub_generation:'allowed',external_media_download:'rights-gated'}}}));
  const policy=await productionPolicy(root);
  assert.equal(policy.mediaGenerationPaused,false);
  assert.equal(policy.mediaAcquisitionPolicy.runninghub_generation,'allowed');
  const contract=businessContract({message:'帮我做一个咖啡机新品种草视频',scenarioId:'product_launch',mediaAcquisitionPolicy:policy.mediaAcquisitionPolicy});
  assert.equal(contract.mediaAcquisitionPolicy.runninghub_generation,'allowed');
  assert.equal(Object.hasOwn(contract,'generatedFootageAllowed'),false);
});

test('video_task does not enqueue when synchronous preparation has a real blocking gap',async()=>{
  const project=fakeProject();let submitted=false;
  const service={
    get:()=>project,view:value=>structuredClone(value),enqueue:async()=>{submitted=true;},submitMessage:async()=>{submitted=true;},
    prepareTask:async()=>({status:'needs_input',optimizedBrief:'已理解请求',blockingGaps:[{field:'model',question:'请确认具体型号'}]}),
  };
  const facade=createCommerceEngineFacade(service,{mode:'openclaw',journalPath:path.join(await fs.mkdtemp(path.join(os.tmpdir(),'orchestration-block-')),'operations.json'),authorizeWrite:async()=>({})});
  const result=await facade.invoke('video_task',{projectId:project.id,baseRevisionId:null,operationId:'operation-block',authorizationId:'authorization-block',message:'修改昨天那条视频',attachmentIds:[]},context);
  assert.equal(result.status,'needs_input');
  assert.equal(result.productionStarted,false);
  assert.equal(result.question,'请确认具体型号');
  assert.equal(submitted,false);
});

test('progress events use OpenClaw system event, omit invented percentages, and unsubscribe at terminal state',async()=>{
  const calls=[];
  const notifier=createOpenClawProgressNotifier({cli:process.execPath,node:process.execPath,spawnImpl:(command,args,options)=>{calls.push({command,args,options});return {unref(){}};},env:{PATH:process.env.PATH}});
  let callback=null,unsubscribeCount=0;
  const service={subscribeJobProgress(projectId,jobId,handler){assert.equal(projectId,'project-v2');assert.equal(jobId,'job-v2');callback=handler;return ()=>{unsubscribeCount++;};}};
  const binding=bindOpenClawJobProgress({service,notifier,projectId:'project-v2',jobId:'job-v2',sessionKey:'agent:commerce-control:test'});
  assert.equal(binding.status,'subscribed');
  await callback({projectId:'project-v2',jobId:'job-v2',status:'running',stage:'生成镜头 2/3',businessProgress:{current:'shot_generation',label:'缺失镜头生成'}});
  assert.deepEqual(calls[0].args.slice(1,3),['system','event']);
  assert.ok(calls[0].args.includes('--session-key'));
  const runningText=calls[0].args[calls[0].args.indexOf('--text')+1];
  const runningEvent=JSON.parse(runningText.slice(runningText.indexOf('\n')+1));
  assert.equal(Object.hasOwn(runningEvent,'percent'),false);
  assert.doesNotMatch(progressEventText({status:'running',stage:'剪辑'}),/agent:commerce-control:test/);
  await callback({projectId:'project-v2',jobId:'job-v2',status:'complete',stage:'完成',revisionId:'rev-v2'});
  const completeText=calls[1].args[calls[1].args.indexOf('--text')+1];
  assert.match(completeText,/调用 video_result/);
  assert.equal(unsubscribeCount,1);
  binding.unsubscribe();
  assert.equal(unsubscribeCount,1);
});

test('video_result requires decoded media and a real HTTP range response before delivery is ready',async()=>{
  const project={...fakeProject(),currentRevisionId:'rev-v2',revisions:[{id:'rev-v2',previewUrl:'http://video.test/preview',videoUrl:'http://video.test/video',packageUrl:'http://video.test/project'}]};
  const service={get:()=>project,view:value=>structuredClone(value),enqueue:async()=>{},artifacts:async()=>({revisionId:'rev-v2',files:[],deliveryValidation:{exists:true,actualPlayable:true,durationSeconds:30,resolution:{width:1080,height:1920},sha256:'a'.repeat(64)},hyperframes:{runtime:'0.8.33',summary:[{resource:'product-reveal',count:1}]}})};
  const facade=createCommerceEngineFacade(service,{mode:'openclaw',fetchImpl:async()=>({status:206,headers:new Headers({'content-range':'bytes 0-0/100'}),body:{cancel:async()=>{}}})});
  const result=await facade.invoke('video_result',{projectId:project.id,revisionId:'rev-v2'},context);
  assert.equal(result.status,'ready');
  assert.equal(result.deliveryValid,true);
  assert.equal(result.httpRange.supported,true);
  assert.equal(result.nativeProjectUrl,'http://video.test/project');
  assert.deepEqual(result.hyperframes.summary,[{resource:'product-reveal',count:1}]);
});
