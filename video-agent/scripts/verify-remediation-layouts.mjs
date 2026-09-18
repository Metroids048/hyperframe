import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {instantiateNativeRecipe} from '../lib/creative/native-recipes.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {nativeScenePlan} from '../lib/creative/story-validation.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {runHyperFrames} from '../lib/creative/runner.mjs';
import {probe,hashFile} from '../lib/edit/media.mjs';
const root=path.resolve('.'),out=path.join(root,'outputs/product-remediation-20260918/layout-verification');
const only=process.argv[2],catalogue=await CapabilityCatalog.open(root),reports=only?JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8')):[];
const design={background:'#141C21',foreground:'#F4F1E8',panel:'#253038',accent:'#EEBA69',accentContrast:'#141C21',typeScale:{title:64,body:38},fontFamily:'Arial'};
const original=path.join(root,'assets/edit-samples/coffee.mp4'),asset={id:'source',kind:'video',compiledRef:'assets/video.mp4',sha256:await hashFile(original),mediaMetadata:await probe(original)};
for(const variant of ['step-strip','detail-focus','kinetic'])for(const output of [{width:1920,height:1080},{width:1080,height:1920}]){
 const id=variant+'-'+output.width;if(only&&only!==id)continue;const prior=reports.find(r=>r.id===id);if(prior)reports.splice(reports.indexOf(prior),1);const dir=path.join(out,id);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
 const media=variant==='kinetic'?[]:[{assetId:asset.id,sourceStartSeconds:1,playbackRate:1,fit:'contain'},...(variant==='detail-focus'?[{assetId:asset.id,sourceStartSeconds:5,playbackRate:1,fit:'contain'}]:[])];
 const texts=variant==='kinetic'?['今晚见','新品发布','20:00']:variant==='step-strip'?['01 · 准备','观察真实过程']:['整体与局部','看清细节'];
 const shot={purpose:'技术验证样片',effect:'custom-native',durationSeconds:5,weight:1,reason:'仅验证版式，不是产品Agent交付证据',media,text:texts.map((text,i)=>({role:i?'feature':'title',text,factRefs:[]})),resourceId:variant==='kinetic'?'kinetic-type-beats':variant==='step-strip'?'video-text-pivot':'comparison-split',productionMethod:'parameterized',layoutVariant:variant==='kinetic'?'auto':variant};
 const assets=media.length?[asset]:[],recipe=instantiateNativeRecipe(shot,design,output,assets);assert(recipe);
 const source=(await catalogue.adapt(recipe.source,{resourceId:shot.resourceId,sceneId:'s',objectIds:[],design,mediaKinds:media.map(()=> 'video')})).source;
 const request=normalizeCommerceRequest({projectId:id,message:'制作5秒技术验证',inferRequest:true,assets:[]});
 const doc=documentFromModelPlan(request,assets,{inferredRequest:{name:'',price:'',cta:'',facts:[],output:{...output,durationSeconds:5}},observations:assets.map(a=>({assetId:a.id,confidence:1,visibleContent:'测试媒体',uncertainty:'非内容验收',subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]})),design,transition:'cut',audio:[],omitted:[],scenes:[nativeScenePlan(shot,source)]});
 const compiled=compileDocument(doc,assets);
 await fs.writeFile(path.join(dir,'index.html'),compiled.html);await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(doc,null,2));await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
 await fs.copyFile(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));if(media.length)await fs.copyFile(original,path.join(dir,'assets/video.mp4'));
 try{
  const check=await runHyperFrames(dir,'check');await fs.writeFile(path.join(dir,'check.log'),check);
  const render=await runHyperFrames(dir,'render',['--output','layout.mp4']);await fs.writeFile(path.join(dir,'render.log'),render);
  reports.push({id,status:'passed',...(prior?{priorAttempts:[...(prior.priorAttempts||[]),{status:prior.status,error:prior.error}]}:{}),directory:dir,video:await probe(path.join(dir,'layout.mp4')),source:'code-authored technical fixture',automaticGenerationAcceptance:false});
 }catch(error){reports.push({id,status:'failed',code:error.code,error:error.message});}
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.at(-1)));
}
if(reports.some(r=>r.status!=='passed'))process.exitCode=1;
