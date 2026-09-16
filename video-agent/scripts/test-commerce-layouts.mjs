import test from 'node:test';
import assert from 'node:assert/strict';
import {instantiateNativeRecipe} from '../lib/creative/native-recipes.mjs';
import {commerceLayoutSource,commerceLayoutResources} from '../lib/creative/commerce-layouts.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {nativeScenePlan} from '../lib/creative/story-validation.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
const root=process.cwd(),design={background:'#F5F1EB',foreground:'#282522',panel:'#E8E0D8',accent:'#875841',accentContrast:'#FFFFFF',typeScale:{title:64,body:36}};
test('commerce layouts preserve varying input counts, editable text, video source time and original audio',async()=>{
 const catalog=await CapabilityCatalog.open(root);
 for(const resourceId of commerceLayoutResources)for(const n of resourceId==='grid-card-assemble'?[2,4]:resourceId==='comparison-split'?[1,2]:[1])for(const portrait of [false,true]){
  const output={width:portrait?1080:1920,height:portrait?1920:1080,durationSeconds:6};
  const assets=Array.from({length:n},(_,i)=>({id:'asset-'+i,kind:resourceId==='video-text-pivot'?'video':'image',sha256:'hash-'+i,compiledRef:'assets/'+i+(resourceId==='video-text-pivot'?'.mp4':'.png'),mediaMetadata:{width:1920,height:1080,duration:20,hasAudio:resourceId==='video-text-pivot'}}));
  const request=normalizeCommerceRequest({projectId:'layout-test',message:'6秒说明，保留已有原声',inferRequest:true,assets:[]}),inferred={name:'',price:'',cta:'',facts:[],output};
  const shot={purpose:'detail',effect:'custom-native',durationSeconds:6,weight:1,reason:'清楚展示所提供内容',media:assets.map(a=>({assetId:a.id,sourceStartSeconds:a.kind==='video'?2:0,playbackRate:1,fit:'contain'})),text:[{role:'title',text:portrait?'侧面与细节':'观察已有画面',factRefs:[]},...Array.from({length:resourceId==='grid-card-assemble'?n:1},(_,i)=>({role:'feature',text:'细节 '+(i+1),factRefs:[]}))],paragraphId:'p',resourceId,newInformation:'所提供细节',visualDirection:'主体与说明分区',productionMethod:'parameterized'};
  const raw=commerceLayoutSource(shot,design,output,assets);assert(raw,resourceId);assert.equal(raw.objects.length,shot.media.length+shot.text.length);
  const adapted=await catalog.adapt(raw,{resourceId,sceneId:'s',objectIds:[],design});
  const doc=documentFromModelPlan(request,assets,{inferredRequest:inferred,observations:assets.map(a=>({assetId:a.id,confidence:1,visibleContent:'测试图片',uncertainty:'',subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]})),design,transition:'cut',audio:assets.filter(a=>a.mediaMetadata.hasAudio).map(a=>({assetId:a.id,volume:1,sourceStartSeconds:0})),omitted:[],scenes:[nativeScenePlan(shot,adapted.source)]});
  assert.doesNotThrow(()=>compileDocument(doc,assets));
  assert.equal(doc.nodes.filter(x=>x.kind==='text').length,shot.text.length);
  if(resourceId==='video-text-pivot'){assert.equal(doc.audioGraph.length,1);assert.equal(doc.nodes.find(x=>x.kind==='video').params.sourceStartSeconds,2);assert(!raw.timeline.includes('#media1'));}
 }
});

test('registered recipes bind image elements and fall back outside the finite layout contract',async()=>{
 const {instantiateNativeRecipe,nativeRecipeContract}=await import('../lib/creative/native-recipes.mjs');
 for(const id of commerceLayoutResources)assert(nativeRecipeContract.resources.includes(id));
 const photo={id:'p',kind:'image',compiledRef:'assets/p.png',mediaMetadata:{width:1920,height:1080}};
 const shot={resourceId:'titlecard-reveal',productionMethod:'parameterized',durationSeconds:5,media:[{assetId:'p'}],text:[{role:'title',text:'侧面轮廓'}]};
 assert(instantiateNativeRecipe(shot,design,{width:1080,height:1920},[photo]).source.html.includes('<img id="media">'));
 assert.equal(instantiateNativeRecipe({...shot,resourceId:'video-text-pivot'},design,{width:1080,height:1920},[photo]),null);
});


test('media adaptation corrects only empty image placeholders without weakening source validation',async()=>{
 const {normalizeMediaBindings}=await import('../lib/creative/capabilities.mjs');
 const source={html:'<div id="photo"></div><div id="video"></div><div id="title"></div>',objects:[{elementId:'photo',ref:'media-1'},{elementId:'video',ref:'media-2'},{elementId:'title',ref:'text-1'}]};
 const result=normalizeMediaBindings(source,['image','video']);
 assert.equal(result.source.html,'<img id="photo"><div id="video"></div><div id="title"></div>');
 assert.equal(result.changes.length,3);assert(source.html.startsWith('<div'));
 const reopened=normalizeMediaBindings(result.source,['image','video']);assert.deepEqual(reopened.source,result.source);assert.equal(reopened.changes.length,0);
 const nested={...source,html:'<div id="photo"><span>not a media placeholder</span></div>'};
 assert.equal(normalizeMediaBindings(nested,['image']).changes.length,0);
 const decorated={...source,html:'<div id=\"scene02-root\"><div id=\"scene02-bg\"></div><div id=\"scene02-media\"></div></div>',css:'#scene02-root{background-color:#F6F3EF}#scene02-bg{background:#F6F3EF}',objects:[{elementId:'scene02-media',ref:'media-1'}]};
 const transparent=normalizeMediaBindings(decorated,['image']).source.css;assert.match(transparent,/#scene02-root\{background:transparent/);assert.match(transparent,/#scene02-bg\{background:transparent/);
});


test('composition adaptation is never silently replaced by a basic parameterized recipe',()=>{
 const photo={id:'p',kind:'image',mediaMetadata:{width:1920,height:1080}};
 const shot={resourceId:'grid-card-assemble',productionMethod:'composition-adapt',durationSeconds:4,media:[{assetId:'p'}],text:[{role:'feature',text:'真实局部'},{role:'feature',text:'引导位置'}],visualDirection:'真实局部引导线与跨段联系'};
 assert.equal(instantiateNativeRecipe(shot,design,{width:1920,height:1080},[photo]),null);
 assert(instantiateNativeRecipe({...shot,productionMethod:'parameterized'},design,{width:1920,height:1080},[photo]));
});
