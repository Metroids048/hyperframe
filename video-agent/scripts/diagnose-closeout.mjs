import fs from 'node:fs/promises';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {nativeScenePlan} from '../lib/creative/story-validation.mjs';
import {prepareCreativeAsset} from '../lib/creative/image-asset.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
const root=process.cwd(),dir=root+'/data/result-completion-projects/8005d346-869a-4123-9809-e0911c336907/versions/job-c2c88cb0-d8ad-4da3-a3a8-3f09a4baf525';
const read=name=>fs.readFile(dir+'/'+name,'utf8').then(JSON.parse);
const {request}=await read('run-input.json'),story=await read('story-plan.json'),obs=await read('observations.json'),brief=await read('brief-plan.json');
const assets=[];for(const a of request.assets){const item=await prepareCreativeAsset(root,a,dir+'/assets',{});item.compiledRef='assets/'+item.normalizedRef.split('/').at(-1);assets.push(item);}
const catalog=await CapabilityCatalog.open(root);
for(let i=0;i<3;i++){try{const {answer}=await read('failed-keyframe-0-'+i+'.json'),{source}=await catalog.adapt(answer.source,{resourceId:story.scenes[0].resourceId,sceneId:'scene-01',objectIds:[],design:story.design});const doc=documentFromModelPlan(request,assets,{summary:story.summary,transition:story.transition,inferredRequest:brief.request,observations:obs.observations,design:story.design,scenes:story.scenes.map((s,j)=>nativeScenePlan(s,j===0?source:undefined)),audio:story.audio,omitted:story.omitted});console.log(i,'current compile passes',doc.revisionId);}catch(e){console.log(i,e.code,e.stack);}}
