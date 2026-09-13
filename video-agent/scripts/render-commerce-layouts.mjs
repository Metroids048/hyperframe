// Focused adapter production render, not an S1–S4 acceptance creation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {commerceLayoutSource} from '../lib/creative/commerce-layouts.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {nativeScenePlan} from '../lib/creative/story-validation.mjs';
import {prepareCreativeAsset} from '../lib/creative/image-asset.mjs';
import {writeCompiledProject,renderCommerceProject} from '../lib/creative/runner.mjs';
const root=process.cwd(),outputDir=path.join(root,'outputs/commerce-next/mvp/layout-check');
await fs.mkdir(path.join(outputDir,'assets'),{recursive:true});
const inputs=['commerce-mvp/keyboard-1.jpg','commerce-mvp/keyboard-2.jpg','commerce-mvp/keyboard-3.jpg','commerce-mvp/bottle-1.jpg','commerce-mvp/bottle-2.jpg','commerce-keyboard/01-keyboard-close.mp4','commerce-serum/hero-8131892.mp4'];
const assets=[];for(const [i,file] of inputs.entries())assets.push(await prepareCreativeAsset(root,{id:'sample-'+i,kind:file.endsWith('.mp4')?'video':'image',path:'assets/'+file},path.join(outputDir,'assets')));
for(const asset of assets)asset.compiledRef=path.relative(outputDir,path.join(root,asset.normalizedRef)).replaceAll('\\','/');
await fs.copyFile(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(outputDir,'assets/gsap.min.js'));
await fs.writeFile(path.join(outputDir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
const output={width:1080,height:1920,durationSeconds:18},design={background:'#F5F1EB',foreground:'#282522',panel:'#E8E0D8',accent:'#875841',accentContrast:'#FFFFFF',typeScale:{title:68,body:38}};
const variants=[['comparison-split',[0,2],['键帽与侧面','排列细节','侧面轮廓']],['comparison-split',[3,4],['滴管瓶外观','瓶身','滴管']],['grid-card-assemble',[0,1,2],['观察键盘细节','整体','键帽排列','侧面']],['grid-card-assemble',[3,4],['观察瓶身与滴管','棕色瓶身','黑色胶头']],['video-text-pivot',[5],['手指与键帽','观看真实按键动作']],['video-text-pivot',[6],['手持滴管瓶','观看瓶身与滴管外观']]];
const catalog=await CapabilityCatalog.open(root),scenes=[];
for(const [resourceId,ids,words]of variants){const shot={purpose:'detail',effect:'custom-native',durationSeconds:3,weight:1,reason:'参数化适配定点检查',media:ids.map(i=>({assetId:assets[i].id,sourceStartSeconds:assets[i].kind==='video'?3:0,playbackRate:1,fit:'contain'})),text:words.map((text,i)=>({role:i?'feature':'title',text,factRefs:[]})),paragraphId:'p',resourceId,newInformation:words.join(' / '),visualDirection:'真实媒体与文字分区',productionMethod:'parameterized'};const source=commerceLayoutSource(shot,design,output,assets);if(!source)throw Error('Fixture outside contract');scenes.push(nativeScenePlan(shot,(await catalog.adapt(source,{resourceId,sceneId:'fixture',objectIds:[],design})).source));}
const request=normalizeCommerceRequest({projectId:'commerce-layout-check',message:'有限资源生产渲染检查，静音，不作为正式作品',inferRequest:true,assets:[]});
const document=documentFromModelPlan(request,assets,{inferredRequest:{name:'有限资源生产检查',price:'',cta:'',facts:[],output},observations:assets.map(a=>({assetId:a.id,confidence:1,visibleContent:'本地预检原始素材',uncertainty:'不声称型号、参数或功效',subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]})),design,transition:'cut',audio:[],omitted:[],scenes});
await writeCompiledProject(outputDir,document,assets);
console.log(await renderCommerceProject({outputDir:path.relative(root,outputDir)}));
