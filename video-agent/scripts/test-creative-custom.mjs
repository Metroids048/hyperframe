import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {createNativeDocument} from '../lib/creative/document.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {compileCustomSource} from '../lib/creative/custom-source.mjs';
import {applyDocumentPatch,computeInvalidation} from '../lib/creative/patch.mjs';
import {selectiveEffectRestore} from '../lib/creative/history.mjs';
import {runSceneIsolation} from '../lib/creative/isolation.mjs';
import {parse as parseHtml} from 'parse5';
const scene={id:'scene-01',effect:'custom-native',effectParams:{distance:600},purpose:'engineering',startFrame:0,durationFrames:240},nodes=[{id:'node-title',sceneId:scene.id,kind:'text',semanticRole:'title',anchor:'scene-local',localStartFrame:0,localDurationFrames:240,durationFrames:240,params:{text:'原生场景'}} ,{id:'node-dot',sceneId:scene.id,kind:'shape',semanticRole:'decoration',anchor:'scene-local',localStartFrame:0,localDurationFrames:240,durationFrames:240,params:{}}];
const bundle={id:'source-01',sceneId:scene.id,html:'<h1 id="headline"></h1><svg id="drawing" viewBox="0 0 1000 400"><path id="route" d="M100 200 L900 200" stroke="#557766" stroke-width="8" fill="none"></path><circle id="dot" cx="100" cy="200" r="25" fill="#55eeaa"></circle></svg>',css:'#headline{position:absolute;left:100px;top:100px;color:#ffffff;font-size:80px;margin:0}#drawing{position:absolute;left:80px;top:300px;width:1000px;height:400px}',timeline:'tl.fromTo("#dot",{x:0},{x:params.distance,duration:6,ease:"none"},0.5);',parameters:[{name:'distance',min:100,max:800,value:600}],objects:[{elementId:'headline',nodeId:'node-title'},{elementId:'dot',nodeId:'node-dot'}],motionTargets:['dot']};
const document=createNativeDocument({projectId:'custom-fixture',output:{width:1920,height:1080},brief:{name:'原生场景',facts:[]},design:{background:'#101418',foreground:'#FFFFFF',panel:'#151A20',accent:'#55EEAA',accentContrast:'#101418',fontFamily:'"Microsoft YaHei",Arial,sans-serif',description:'原生源码隔离工程验证',motionIntensity:'medium',easingFamily:'none',transition:'cut'},assets:[],scenes:[scene],nodes,sourceBundles:[bundle]});
test('product colours are not parsed as oversized dimensions and duration failures identify the actual scene budget',()=>{
 const css=bundle.css+'#dot{fill:#241810;object-fit:contain}';
 assert.doesNotThrow(()=>compileCustomSource({...bundle,css},{scene,nodes,assets:{}}));
 assert.throws(()=>compileCustomSource({...bundle,css:css+'#dot{width:1e9px}'},{scene,nodes,assets:{}}),{code:'CUSTOM_RESOURCE'});
 assert.throws(()=>compileCustomSource({...bundle,timeline:'tl.to("#dot",{x:100,duration:6},3);'},{scene,nodes,assets:{}}),e=>e.code==='CUSTOM_DURATION'&&e.message.includes('scene-01')&&e.message.includes('8 秒')&&e.message.includes('9 秒'));
});
test('original video remains an independent timed layer behind custom motion graphics',()=>{
 const media={id:'source-video',kind:'video',compiledRef:'assets/source.mp4',mediaMetadata:{width:1920,height:1080,duration:12,hasAudio:true}},node={id:'native-video',sceneId:scene.id,kind:'video',semanticRole:'hero',assetId:media.id,anchor:'scene-local',localStartFrame:0,localDurationFrames:240,durationFrames:240,params:{sourceStartSeconds:2,playbackRate:1,fit:'contain'}};
 const source={...bundle,html:bundle.html+'<div id="footage"></div>',objects:[...bundle.objects,{elementId:'footage',nodeId:node.id}]};
 const doc=createNativeDocument({projectId:'video-overlay',output:document.output,brief:document.brief,design:document.design,assets:[media],scenes:[structuredClone(scene)],nodes:[...structuredClone(nodes),node],sourceBundles:[source]});
 const compiled=compileDocument(doc,[media]);let video;
 const walk=n=>{if(n.tagName==='video')video=n;for(const c of n.childNodes||[])walk(c);};walk(parseHtml(compiled.html));
 assert(video);assert(video.attrs.some(a=>a.name==='muted'));assert(video.attrs.some(a=>a.name==='data-media-start'&&a.value==='2'));
 for(let parent=video.parentNode;parent;parent=parent.parentNode)assert(!parent.attrs?.some(a=>a.name==='data-start')||parent.attrs.some(a=>a.name==='data-composition-id'));
 assert.equal(compiled.objectMap[node.id].domId,'obj-native-video');
 const withoutBinding=compileDocument({...doc,sourceBundles:[{...source,html:bundle.html,objects:bundle.objects}]},[media]);
 assert.equal(withoutBinding.objectMap[node.id].domId,'obj-native-video');
 assert.throws(()=>compileCustomSource({...source,timeline:source.timeline+'tl.to("#footage",{scale:1.2,duration:1},0);'},{scene,nodes:doc.nodes,assets:{[media.id]:media}}),{code:'CUSTOM_MOTION'});
});
test('custom motion uses the actual scene duration without permitting a caller to override it',()=>{
 const timed={...bundle,timeline:'tl.fromTo("#dot",{x:0},{x:600,duration:params.sceneSeconds*.7},params.sceneSeconds*.1);'};
 const result=compileCustomSource(timed,{scene:{...scene,durationFrames:120},nodes,assets:{}});
 assert.match(result.timeline,/"duration":2\.8/);assert.match(result.timeline,/,0\.4\)/);
 assert.throws(()=>compileCustomSource({...timed,parameters:[...bundle.parameters,{name:'sceneSeconds',value:100,min:1,max:100}]},{scene,nodes,assets:{}}),{code:'CUSTOM_PARAMETERS'});
});
test('original SVG/HTML source compiles into named objects and finite parameter edits',()=>{const a=compileCustomSource(bundle,{scene,nodes,assets:{}});assert(a.html.includes('data-object-id="node-dot"'));assert(a.timeline.includes('"x":600'));const patched=applyDocumentPatch(document,[{type:'update_effect_params',sceneId:scene.id,params:{distance:350}}],{});assert.deepEqual(patched.sourceBundles,document.sourceBundles);assert.deepEqual(patched.nodes,document.nodes);assert(compileDocument(patched,[]).html.includes('"x":350'));assert.throws(()=>applyDocumentPatch(document,[{type:'update_effect_params',sceneId:scene.id,params:{distance:900}}],{}),{code:'CUSTOM_PARAMETERS'});});

test('scoped original source edits preserve native content and support selective undo with later text retained',()=>{
 const {id,sceneId,...source}=bundle,params={...source,css:source.css.replace('font-size:80px','font-size:110px')};
 const edited=applyDocumentPatch(document,[{type:'update_custom_source',sceneId:scene.id,params}],{});
 assert.deepEqual(edited.nodes,document.nodes);assert.deepEqual(edited.audioGraph,document.audioGraph);assert.deepEqual(edited.scenes,document.scenes);assert.notEqual(edited.revisionId,document.revisionId);
 assert(compileDocument(edited,[]).html.includes('font-size:110px'));assert.deepEqual(computeInvalidation(document,edited).changedScenes,[scene.id]);
 const later=applyDocumentPatch(edited,[{type:'update_text',nodeId:'node-title',text:'保留新文案'}],{}),restored=applyDocumentPatch(later,selectiveEffectRestore(later,document,edited),{});
 assert.deepEqual(restored.sourceBundles,document.sourceBundles);assert.equal(restored.nodes.find(n=>n.id==='node-title').params.text,'保留新文案');
 const locked=applyDocumentPatch(document,[{type:'lock_scene',sceneId:scene.id,params:{kinds:['layout']}}],{});
 assert.throws(()=>applyDocumentPatch(locked,[{type:'update_custom_source',sceneId:scene.id,params}],{}),{code:'LOCK_CONFLICT'});
 for(const bad of [{...params,html:'<script>fetch("/secret")</script>'},{...params,objects:[]},{...params,timeline:'while(true){}'}])assert.throws(()=>applyDocumentPatch(document,[{type:'update_custom_source',sceneId:scene.id,params:bad}],{}));
 assert.equal(document.sourceBundles[0].css,source.css);
});
test('AST/HTML/CSS parsing rejects side effects, external resources, callbacks, loops and infinite repeats',()=>{for(const change of [{timeline:'while(true){}'},{timeline:'fetch("http://localhost:3022");'},{timeline:'tl.to("#dot",{x:1,onComplete:()=>fetch("/secret")},0);'},{timeline:'tl.to("#dot",{x:1,repeat:-1},0);'},{timeline:'tl.to("#dot",{x:params.constructor},0);'},{timeline:'tl.to("#dot",{x:100,duration:60},0);'},{html:'<iframe src="http://localhost:3022"></iframe>'},{html:'<img id="dot" onerror="alert(1)">'},{css:'#dot{background:url(file:///C:/Windows/win.ini)}'},{css:'body{opacity:0}'},{css:'@import "http://localhost";'}])assert.throws(()=>compileCustomSource({...bundle,...change},{scene,nodes,assets:{}}));});
test('a declared target that is static is not accepted by runtime motion measurement',async()=>{const dir=await fixture('static'),html=compileDocument({...document,sourceBundles:[{...bundle,timeline:'tl.fromTo("#dot",{x:0},{x:0,duration:6},0);'}]},[]).html;await fs.writeFile(path.join(dir,'index.html'),html);await assert.rejects(runSceneIsolation(dir,config()),{code:'CUSTOM_RUNTIME_FAILED'});const evidence=JSON.parse(await fs.readFile(path.join(dir,'runtime-evidence.json'),'utf8'));assert.match(evidence.error,/目标没有可见运动/);assert.equal(evidence.samples.length,6);});
const evidenceDir=path.join(ROOT,'outputs/resume','custom-isolation-'+new Date().toISOString().replaceAll(':','-'));
async function fixture(name){const dir=path.join(evidenceDir,name);await fs.mkdir(path.join(dir,'assets'),{recursive:true});await fs.copyFile(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));await fs.writeFile(path.join(dir,'index.html'),compileDocument(document,[]).html);return dir;}
const config=()=>({files:['index.html','assets/gsap.min.js'],output:document.output,scenes:[{...scene,targets:['custom-scene-01-dot']}]});
test('production worker renders motion while blocking network, project and file access',async()=>{const result=await runSceneIsolation(await fixture('valid'),config(),{probe:'network'});if(process.platform==='win32'){assert.equal(result.evidence.limitFlags,0x230c);assert.equal(result.evidence.cpuRate,5000);assert(result.evidence.peakJobMemoryBytes>0);}else{assert.equal(result.evidence.status,'passed');}assert(result.runtime.motion.every(m=>m.moved));assert(!result.runtime.environmentKeys.some(k=>/CODEX|AUTH|TOKEN|PROXY/i.test(k)));assert(Object.values(result.runtime.boundaryProbe).every(Boolean));});
test('Windows job terminates an unbounded worker and refuses excessive committed memory',{skip:process.platform!=='win32'},async()=>{const timeout=await runSceneIsolation(await fixture('timeout'),config(),{probe:'timeout'});assert.equal(timeout.evidence.timedOut,true);if(process.platform==='win32')assert.equal(timeout.code,124);const memory=await runSceneIsolation(await fixture('memory'),config(),{probe:'memory'});assert.notEqual(memory.code,0);assert.equal(memory.evidence.timedOut,false);if(process.platform==='win32')assert.equal(memory.evidence.processMemoryBytes,192*1024**2);});
process.on('exit',()=>console.log('ISOLATION_EVIDENCE '+evidenceDir));
test('portable timeout and cancellation verify the worker process group has exited',{skip:process.platform==='win32'},async()=>{
 const timedDir=await fixture('portable-timeout'),timed=await runSceneIsolation(timedDir,config(),{probe:'browser-timeout'});
 assert.equal(timed.evidence.timedOut,true);assert.equal(timed.evidence.cleanup.exited,true);
 const cancelDir=await fixture('portable-cancel'),controller=new AbortController();
 const running=runSceneIsolation(cancelDir,config(),{probe:'browser-timeout',signal:controller.signal});
 const timer=setInterval(async()=>{if(await fs.access(path.join(cancelDir,'browser-started.json')).then(()=>true,()=>false))controller.abort();},50);
 try{await assert.rejects(running,{name:'AbortError'});}finally{clearInterval(timer);}
 assert.equal(JSON.parse(await fs.readFile(path.join(cancelDir,'cleanup.json'),'utf8')).exited,true);
});
