import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {readNativeProject} from '../lib/creative/runner.mjs';

const project={currentRevisionId:'r1',revisions:[{id:'r1'}],assets:[],jobs:[],request:{scenarioId:'product_demo'}};
test('whole-message controls and direct position edits bypass the model',async()=>{
 const provider={structured:()=>{throw Error('unnecessary model');}};
 assert.equal((await routeWorkbenchMessage(project,'撤销',{provider})).mode,'undo');
 assert.equal((await routeWorkbenchMessage(project,'字幕再往上移一点',{provider})).mode,'edit');
 assert.equal((await routeWorkbenchMessage(project,'音乐再轻一点，片尾自然淡出',{provider})).mode,'edit');
 assert.equal((await routeWorkbenchMessage(project,'字幕小一点，往上移，声音和其他画面不变',{provider})).mode,'edit');
});
test('semantic routing preserves compound original message and validates references',async()=>{
 const message='不要重做教程，删等待后另出一版竖屏，原声保留。';
 let called=false;
 const provider={structured:async(_,messages)=>{called=true;const data=JSON.parse(messages[0].content);assert.equal(data.message,message);assert.equal(data.businessScenario,'product_demo');return {result:{mode:'variant',quote:'另出一版竖屏',revisionId:null,assetIds:[],question:''}};}};
 assert.equal((await routeWorkbenchMessage(project,message,{provider})).mode,'variant');assert(called);
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
