import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {readNativeProject} from '../lib/creative/runner.mjs';
import {productionWorkflowFromPlan} from '../lib/creative/workflow-design.mjs';
import {completedEditSummary} from '../lib/creative/model-edit.mjs';

const project={currentRevisionId:'r1',revisions:[{id:'r1'}],assets:[],jobs:[],request:{scenarioId:'product_demo'}};
test('fresh uploaded source edits enter backend workflow without a native-base clarification',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/source-workflow-routing-'));
 const service=await createCreativeService({dataDir,routingProvider:{structured:async()=>{throw Error('source workflow must not ask the router to clarify');}}});
 const p=await service.create({message:'',inferRequest:true});
 p.assets.push({id:'asset-source-video',kind:'video',name:'source.mp4',path:'missing-source.mp4',mediaMetadata:{duration:10,width:1280,height:720,hasAudio:true}});
 await service.dispatchMessage(p,{message:'把这条上传的视频里的咖啡袋替换成蛋白粉，保留声音和时间轴',attachmentIds:['asset-source-video'],idempotencyKey:'source-workflow-routing-123456'});
 const deadline=Date.now()+5000;
 while(p.jobs.some(job=>['queued','running'].includes(job.status))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 const receipt=p.routingReceipts.at(-1);
 assert.equal(receipt.mode,'create');
 assert.equal(receipt.reason,'fresh-upload-source-workflow');
 assert.equal(p.jobs[0].kind,'create');
 assert.notEqual(p.messages.at(-1)?.text,'请先打开要修改或派生的原生工程。');
});
test('local download wording survives global routing integration and honors explicit mode',async()=>{
 const provider={structured:()=>{throw Error('unnecessary model for download');}};
 for(const message of ['下载当前视频为MP4','请导出当前版本']){
  const result=await routeWorkbenchMessage(project,message,{provider});
  assert.equal(result.mode,'export');assert.equal(result.baseRevisionId,'r1');
  assert.equal((await routeWorkbenchMessage(project,message,{provider,taskMode:'edit',taskModeExplicit:true})).mode,'clarify');
 }
});
test('production approval receives saved plan and selected mode without weakening explicit conflicts',async()=>{
 const draft={...project,currentRevisionId:null,revisions:[],workflowPlan:{id:'plan-48',status:'ready',workOrder:{mode:'recut',scenario:'product_demo',objective:'保留原速动作的48秒教程'}}};
 const message='现在按已保存的48秒制作单开始生成视频并导出候选。';
 const provider={structured:async(_,messages)=>{const input=JSON.parse(messages[0].content);assert.equal(input.selectedTaskMode,'recut');assert.equal(input.savedPlan.id,'plan-48');assert.equal(input.savedPlan.mode,'recut');return {result:{mode:'recut',quote:message,revisionId:null,assetIds:[],question:'',scenarioId:null}};}};
 assert.equal((await routeWorkbenchMessage(draft,message,{provider,taskMode:'recut',taskModeExplicit:true,scenarioId:'product_demo'})).mode,'recut');
 const conflicting={structured:async()=>({result:{mode:'create',quote:'另做一条',revisionId:null,assetIds:[],question:'',scenarioId:null}})};
 assert.equal((await routeWorkbenchMessage(draft,'另做一条',{provider:conflicting,taskMode:'recut',taskModeExplicit:true,scenarioId:'product_demo'})).source,'explicit-mode-conflict');
});
test('clarification replies keep the original request for the next planning or production turn',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/clarification-chain-'));let routeCalls=0;
 const routingProvider={structured:async(_,messages)=>{
  const data=JSON.parse(messages[0].content);routeCalls++;
  if(routeCalls===1)return {result:{mode:'clarify',quote:data.message,revisionId:null,assetIds:[],question:'画面风格和剪辑节奏都需要调整吗？',scenarioId:null,targets:[],preserve:[],reason:'需要确认范围'}};
  assert(data.recentConversation.some(turn=>turn.text==='先根据素材给我做一条高质量商品视频'));
  assert(data.recentConversation.some(turn=>turn.text.includes('画面风格和剪辑节奏')));
  return {result:{mode:'plan',quote:data.message,revisionId:null,assetIds:[],question:'',scenarioId:null,targets:[],preserve:[],reason:'用户要求先给方案'}};
 }};
 const planningProvider={structured:async()=>({result:{mode:'create',scenario:'product_launch',objective:'形成可执行商品视频方案',auxiliaryModes:[],auxiliaryScenarios:[],requirements:[],resources:[],gaps:[],procedureSubtype:null,steps:[]}})};
 const service=await createCreativeService({dataDir,routingProvider,planningProvider});
 const p=await service.create({message:'',inferRequest:true});
 await service.dispatchMessage(p,{message:'先根据素材给我做一条高质量商品视频',idempotencyKey:'clarification-first-1234'});
 assert.equal(p.pendingClarification.rootMessage,'先根据素材给我做一条高质量商品视频');assert.equal(p.jobs.length,0);
 await service.dispatchMessage(p,{message:'都需要，先给我方案',idempotencyKey:'clarification-second-123'});
 const deadline=Date.now()+5000;while(p.jobs.some(j=>['queued','running'].includes(j.status))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
 assert.equal(p.jobs[0].kind,'plan');assert.match(p.jobs[0].input.message,/原始需求：先根据素材给我做一条高质量商品视频/);assert.match(p.jobs[0].input.message,/用户补充：都需要，先给我方案/);
 assert.equal(p.messages.filter(m=>m.role==='user').at(-1).text,'都需要，先给我方案');assert.equal(p.pendingClarification,undefined);
});
test('draft controls and explicit planning never become production; quoted and negated commands are not controls',async()=>{
 const draft={...project,currentRevisionId:null,revisions:[]};
 const noModel={structured:()=>{throw Error('unexpected model for explicit safe route');}};
 for(const p of [project,draft]){
  assert.equal((await routeWorkbenchMessage(p,'status',{provider:noModel})).mode,'status');
  assert.equal((await routeWorkbenchMessage(p,'只规划这条教程，不要生成视频',{provider:noModel})).mode,'plan');
 }
 const wrongControl={structured:async()=>({result:{mode:'cancel',quote:'取消',revisionId:null,assetIds:[],question:''}})};
 for(const message of ['不要取消','把字幕改成“取消”'])assert.equal((await routeWorkbenchMessage(project,message,{provider:wrongControl})).mode,'clarify');
 for(const message of ['不要取消','“撤销”'])assert.equal((await routeWorkbenchMessage(draft,message,{provider:noModel})).mode,'clarify');
 assert.equal((await routeWorkbenchMessage(draft,'精剪这段已有视频',{provider:noModel,taskMode:'recut',taskModeExplicit:true})).mode,'recut');
 assert.equal((await routeWorkbenchMessage(draft,'做两个版本',{provider:noModel,taskMode:'variant',taskModeExplicit:true})).mode,'clarify');
 const createProvider={structured:async()=>({result:{mode:'create',quote:'另做一条',revisionId:null,assetIds:[],question:''}})};
 assert.equal((await routeWorkbenchMessage(project,'另做一条',{provider:createProvider,taskMode:'recut',taskModeExplicit:true})).mode,'clarify');
 assert.equal((await routeWorkbenchMessage(project,'字幕再往上移一点',{provider:noModel,taskMode:'variant',taskModeExplicit:true})).mode,'clarify');
 const sceneProvider=scenarioId=>({structured:async(_,messages)=>{const input=JSON.parse(messages[0].content);assert.equal(input.selectedScenarioId,'product_demo');return {result:{mode:'create',quote:input.message,revisionId:null,assetIds:[],question:'',scenarioId}};}});
 assert.equal((await routeWorkbenchMessage(draft,'活动促销',{provider:sceneProvider('product_promotion'),scenarioId:'product_demo'})).source,'explicit-scenario-conflict');
 assert.equal((await routeWorkbenchMessage(draft,'制作视频',{provider:sceneProvider(null),scenarioId:'product_demo'})).mode,'create');
});

test('draft status and idle cancel have no production job or model call',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/draft-control-'));
 const service=await createCreativeService({dataDir,routingProvider:{structured:()=>{throw Error('unexpected provider');}}});
 const p=await service.create({message:'暂存素材需求',inferRequest:true});
 for(const [i,message] of ['status','取消'].entries())await service.dispatchMessage(p,{message,idempotencyKey:'draft-control-key-'+i});
 assert.equal(p.jobs.length,0);assert.equal(p.revisions.length,0);assert.deepEqual(p.routingReceipts.map(r=>r.mode),['status','cancel']);
});
test('routing provider failure persists the original request and global receipt, and controls remain available',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/routing-failure-'));let calls=0;
 const service=await createCreativeService({dataDir,routingProvider:{structured:async()=>{calls++;throw Object.assign(Error('Injected provider outage'),{code:'PROVIDER_UNAVAILABLE'});}}});
 const p=await service.create({message:'原需求',inferRequest:true});
 const input={message:'让表达更加紧凑',idempotencyKey:'provider-fault-key-123456'};
 await assert.rejects(()=>service.dispatchMessage(p,input),{code:'PROVIDER_UNAVAILABLE'});
 const receipt=p.routingFailures.at(-1).failureReceipt;assert.equal(receipt.category,'provider_unavailable');assert.equal(receipt.originalRequest,input.message);assert.equal(receipt.publishedRevisionId,null);assert.equal(receipt.goalReduced,false);assert.equal(receipt.failedTargets[0].requirement,input.message);
 assert(p.messages.some(m=>m.role==='user'&&m.text===input.message));assert.equal(p.jobs.length,0);assert.equal(p.revisions.length,0);
 await service.dispatchMessage(p,{message:'查看进度',idempotencyKey:'provider-offline-control'});assert.equal(calls,1);
 const reopened=await createCreativeService({dataDir});assert.deepEqual(reopened.get(p.id).routingFailures,p.routingFailures);
});

test('explicit planning through message dispatch creates only a plan and preserves source assets',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/message-plan-'));let calls=0;
 const planningProvider={structured:async()=>{calls++;return {model:'isolated-contract-test',result:{mode:'create',scenario:'product_demo',objective:'规划真实教程',auxiliaryModes:[],auxiliaryScenarios:[],requirements:[],resources:[],gaps:[],procedureSubtype:'usage',steps:[]}};}};
 const service=await createCreativeService({dataDir,planningProvider,routingProvider:{structured:()=>{throw Error('unnecessary route model');}}});
 const p=await service.create({message:'教程',inferRequest:true});const before=structuredClone(p.assets);
 await service.dispatchMessage(p,{message:'只规划这条教程，不要生成视频',idempotencyKey:'planning-message-12345678'});
 const deadline=Date.now()+15000;while(p.jobs.some(j=>['queued','running'].includes(j.status))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].kind,'plan');assert.equal(p.jobs[0].status,'complete');assert.equal(calls,1);assert.equal(p.revisions.length,0);assert.deepEqual(p.assets,before);assert.equal(p.workflowPlan.productionStarted,false);
});
test('whole-message controls and direct position edits bypass the model',async()=>{
 const provider={structured:()=>{throw Error('unnecessary model');}};
 assert.equal((await routeWorkbenchMessage(project,'撤销',{provider})).mode,'undo');
 assert.equal((await routeWorkbenchMessage(project,'字幕再往上移一点',{provider})).mode,'edit');
 assert.equal((await routeWorkbenchMessage(project,'音乐再轻一点，片尾自然淡出',{provider})).mode,'edit');
 assert.equal((await routeWorkbenchMessage(project,'字幕小一点，往上移，声音和其他画面不变',{provider})).mode,'edit');
});
test('plan then execute is a fast explicit route and its saved edit contract can drive execution',async()=>{
 const message='给予视频内容，给我设计一套优化视频内容的方案，然后执行修改视频';
 const provider={structured:()=>{throw Error('plan-and-execute routing must not wait for a model');}};
 const route=await routeWorkbenchMessage(project,message,{provider,document:null});
 assert.equal(route.mode,'plan');assert.equal(route.autoExecute,true);assert.equal(route.source,'explicit-plan-and-execute');
 const requirement={id:'req-1',kind:'goal',field:'goal',quote:message,targetIds:[],excludeIds:[]};
 const plan={id:'plan-edit',status:'planned_pending_observation',workOrder:{contractId:'contract-edit',baseRevisionId:'r1',mode:'edit',scenario:'product_demo',requirements:[requirement],sourceRequests:[message],assetScope:[],facts:[],gaps:[],steps:[],auxiliaryModes:[],auxiliaryScenarios:[]}};
 const workflow=productionWorkflowFromPlan(plan,{message,assets:[],baseRevisionId:'r1'});
 assert.equal(workflow.taskMode,'edit');assert.equal(workflow.parentContractId,'contract-edit');assert.equal(workflow.planningConsumption.planId,'plan-edit');
 assert.equal(completedEditSummary('已设计三项优化。以下操作待执行器提交与验证；当前尚未执行。'),'已设计三项优化。');
});
test('semantic routing preserves compound original message and validates references',async()=>{
 const message='不要重做教程，删等待后另出一版竖屏，原声保留。';
 let called=false;
 const provider={structured:async(_,messages)=>{called=true;const data=JSON.parse(messages[0].content);assert.equal(data.message,message);assert.equal(data.businessScenario,'product_demo');return {result:{mode:'variant',quote:'另出一版竖屏',revisionId:null,assetIds:[],question:''}};}};
 assert.equal((await routeWorkbenchMessage(project,message,{provider})).mode,'variant');assert(called);
 const normalized=await routeWorkbenchMessage(project,message,{provider:{structured:async()=>({result:{mode:'variant',quote:'不要重做教程 删等待后另出一版竖屏 原声保留',revisionId:null,assetIds:[],question:''}})}});
 assert.equal(normalized.quote,message);assert.equal(normalized.source,'semantic');
 await assert.rejects(()=>routeWorkbenchMessage(project,message,{provider:{structured:async()=>({result:{mode:'create',quote:'新建',assetIds:[]}})}}),{code:'MESSAGE_ROUTE_INVALID'});
});
test('new creation from open project is separate and double-submit reuses the same new draft',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/message-route-'));
 const route={mode:'create',quote:'另做一条',revisionId:null,assetIds:[],question:''};
 let calls=0;const service=await createCreativeService({dataDir,routingProvider:{structured:async()=>{calls++;return {result:route};}}});
 const p=await service.create({message:'原工程',inferRequest:true});
 const version=path.join(dataDir,p.id,'versions/base');await fs.mkdir(version,{recursive:true});
 const source=path.join(ROOT,'deliverables/s02-gpu-closeout-20260916/versions/final');
 for(const name of ['document.json','manifest.json'])await fs.copyFile(path.join(source,name),path.join(version,name));
 const document=JSON.parse(await fs.readFile(path.join(version,'document.json')));
 p.currentRevisionId=document.revisionId;p.revisions=[{id:document.revisionId,directory:'versions/base'}];
 const input={message:'另做一条，先留空等我上传新素材',baseRevisionId:p.currentRevisionId,idempotencyKey:'new-message-12345678'};
 const [a,b]=await Promise.all([service.dispatchMessage(p,input),service.dispatchMessage(p,input)]);
 assert.notEqual(a.project.id,p.id);assert.equal(a.project.id,b.project.id);assert.equal(calls,1);
 assert.equal(p.currentRevisionId,document.revisionId);assert.equal(p.revisions.length,1);assert.equal(a.project.currentRevisionId,null);
 const restarted=await createCreativeService({dataDir});const again=await restarted.dispatchMessage(restarted.get(p.id),input);
 assert.equal(again.project.id,a.project.id);
 await fs.writeFile(path.join(dataDir,'evidence.json'),JSON.stringify({base:p.id,newProject:a.project.id,baseRevision:p.currentRevisionId,calls,duplicateAndRestartPreserved:true},null,2));
});

test('caption history undo preserves prior edits and redo survives service reopening',async()=>{
 const dataDir=await fs.mkdtemp(path.join(ROOT,'outputs/caption-history-'));
 const service=await createCreativeService({dataDir});const p=await service.create({message:'S02字幕连续修改验证',inferRequest:true});
 const source=path.join(ROOT,'deliverables/s02-gpu-closeout-20260916/versions/final');
 const {document:base,assets}=await readNativeProject(source),map=Object.fromEntries(assets.map(a=>[a.id,a]));
 const first=applyDocumentPatch(base,[{type:'update_caption_style',params:{offsetYDelta:-40}}],map);
 const second=applyDocumentPatch(first,[{type:'update_caption_style',params:{offsetYDelta:-40}}],map);
 for(const [i,document] of [base,first,second].entries()){
  const dir=path.join(dataDir,p.id,'versions',String(i));await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(document));await fs.copyFile(path.join(source,'manifest.json'),path.join(dir,'manifest.json'));
  p.revisions.push({id:document.revisionId,parentId:i?[base,first][i-1].revisionId:null,directory:'versions/'+i});
 }
 p.currentRevisionId=second.revisionId;
 await service.dispatchMessage(p,{message:'撤销',baseRevisionId:second.revisionId,idempotencyKey:'caption-undo-12345678'});
 assert.equal(p.currentRevisionId,first.revisionId);
 const undone=(await readNativeProject(service.versionDirectory(p,service.revision(p)))).document;
 assert.equal(undone.captions[0].style.offsetY,-40);assert.deepEqual(undone.audioGraph,base.audioGraph);
 const reopened=await createCreativeService({dataDir}),restored=reopened.get(p.id);
 assert.equal(restored.currentRevisionId,first.revisionId);
 await reopened.dispatchMessage(restored,{message:'重做',baseRevisionId:first.revisionId,idempotencyKey:'caption-redo-12345678'});
 assert.equal(restored.currentRevisionId,second.revisionId);
 const redone=(await readNativeProject(reopened.versionDirectory(restored,reopened.revision(restored)))).document;
 assert.equal(redone.captions[0].style.offsetY,-80);assert.deepEqual(redone.audioGraph,base.audioGraph);
 await fs.writeFile(path.join(dataDir,'evidence.json'),JSON.stringify({base:base.revisionId,first:first.revisionId,second:second.revisionId,undoAndReopenAndRedo:true},null,2));
});
