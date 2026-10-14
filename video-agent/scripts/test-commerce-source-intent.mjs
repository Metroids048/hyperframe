import assert from 'node:assert/strict';
import test from 'node:test';
import {isUploadedSourceWorkflow,needsTrackedObjectReplacement} from '../lib/creative/service.mjs';
import {buildCommercePreparation} from '../lib/creative/commerce-preparation.mjs';

test('uploaded source object replacement stays on the source-first route',()=>{
 const message='把上传视频里的蛋白粉包装逐帧替换为咖啡袋，保留120秒原声，并自行联网寻找参考';
 assert.equal(isUploadedSourceWorkflow(message,{id:'asset-video',kind:'video'}),true);
 assert.equal(needsTrackedObjectReplacement(message),true);
 assert.equal(needsTrackedObjectReplacement('把标题颜色改成咖啡色'),false);
});

test('web research is only evidence, not usable media',()=>{
 const result=buildCommercePreparation({message:'制作一条咖啡袋视频',taskMode:'create'},
  {project:{assets:[],request:{}},mediaAcquisitionPolicy:{web_research:'allowed'}});
 assert.equal(result.mediaAcquisition.steps[0].status,'research-only');
 assert.equal(result.status,'needs_input');
});
