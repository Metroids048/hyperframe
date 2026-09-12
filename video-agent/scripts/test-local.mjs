import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,defaults} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3020',results=[];
const check=(name,fn)=>{fn();results.push({name,passed:true});console.log('PASS '+name);};
async function create(brief,options={}){const f=new FormData();f.set('brief',JSON.stringify(brief));if(options.example)f.set('useExample','true');if(options.file)f.append('images',options.file,'product.png');if(options.reuseFrom)f.set('reuseFrom',options.reuseFrom);const r=await fetch(base+'/api/projects',{method:'POST',body:f});return {status:r.status,data:await r.json()};}
try{
 const health=await fetch(base+'/api/health').then(r=>r.json());check('本地服务在线',()=>assert.equal(health.ok,true));
 const empty=await create({...defaults,brand:''},{example:true});check('空必填拒绝',()=>assert.equal(empty.status,400));
 const long=await create({...defaults,hook:'长'.repeat(19)},{example:true});check('超长文本拒绝',()=>assert.equal(long.status,400));
 const noImage=await create(defaults);check('缺少图片拒绝',()=>assert.equal(noImage.status,400));
 const corrupt=await create(defaults,{file:new Blob(['not an image'],{type:'image/png'})});check('伪造或损坏图片拒绝',()=>assert.equal(corrupt.status,400));
 const svg=await create(defaults,{file:new Blob(['<svg/>'],{type:'image/svg+xml'})});check('SVG 上传拒绝',()=>assert.equal(svg.status,400));
 const large=await create(defaults,{file:new Blob([new Uint8Array(8*1024*1024+1)],{type:'image/png'})});check('超大图片拒绝',()=>assert.equal(large.status,413));
 const cross=await fetch(base+'/api/projects',{method:'POST',headers:{Origin:'https://unrelated.example'}});check('跨站写入拒绝',()=>assert.equal(cross.status,403));
 const missing=await fetch(base+'/api/projects/00000000-0000-0000-0000-000000000000');check('不存在项目返回 404',()=>assert.equal(missing.status,404));
 const sample=await create(defaults,{example:true});check('样例创建真实分镜',()=>{assert.equal(sample.status,201);assert.equal(sample.data.storyboard.length,3);assert.equal(sample.data.status,'awaiting_confirmation');});
 const early=await fetch(base+`/api/projects/${sample.data.id}/video`);check('未完成不能下载视频',()=>assert.equal(early.status,409));
 const upload=await create({...defaults,hook:'把清爽，带进日常。'},{file:new Blob([await fs.readFile(path.join(ROOT,'assets/product.png'))],{type:'image/png'})});check('真实 multipart 图片上传',()=>{assert.equal(upload.status,201);assert.equal(upload.data.source,'upload');});
 const id=upload.data.id;
 const confirmations=await Promise.all([fetch(base+`/api/projects/${id}/render`,{method:'POST'}),fetch(base+`/api/projects/${id}/render`,{method:'POST'})]);check('重复确认复用同一任务',()=>confirmations.forEach(r=>assert.equal(r.status,202)));
 await fetch(base+`/api/projects/${sample.data.id}/render`,{method:'POST'});
 const queued=await fetch(base+`/api/projects/${sample.data.id}`).then(r=>r.json());check('第二个任务进入单并发队列',()=>assert.equal(queued.status,'queued'));
 let complete;
 for(const target of [id,sample.data.id]){const started=Date.now();for(;;){const p=await fetch(base+`/api/projects/${target}`).then(r=>r.json());if(p.status==='failed')throw Error(p.error);if(p.status==='complete'){complete=p;break;}if(Date.now()-started>360000)throw Error('测试等待超时');await new Promise(r=>setTimeout(r,2000));}check(`视频完成 ${target.slice(0,8)}`,()=>{assert.equal(complete.media.duration,15);assert.equal(complete.media.width,1280);assert.equal(complete.media.audioCodec,'aac');});}
 const range=await fetch(base+`/api/projects/${id}/video`,{headers:{Range:'bytes=0-1023'}});check('视频 Range 播放',()=>{assert.equal(range.status,206);assert.equal(range.headers.get('content-length'),'1024');});await range.arrayBuffer();
 const badRange=await fetch(base+`/api/projects/${id}/video`,{headers:{Range:'bytes=999999999-'}});check('非法 Range 返回 416',()=>assert.equal(badRange.status,416));
 const plan=await fetch(base+`/api/projects/${id}/storyboard`).then(r=>r.json());check('分镜包含用户新文案',()=>assert.equal(plan[0].headline,'把清爽，带进日常。'));
 const html=await fs.readFile(path.join(ROOT,'data/projects',id,'index.html'),'utf8');check('上传素材进入实际工程',()=>{assert(html.includes('assets/product1.png'));assert(!html.includes('LIME SPARKLING'));assert(html.includes('把清爽，'));});
 const studioResponse=await fetch(base+`/api/projects/${id}/studio`,{method:'POST'});const studio=await studioResponse.json();check('实际 HyperFrames 工作台启动',()=>{assert.equal(studioResponse.status,200);assert(studio.url.includes(':3018'));});
 const studioPage=await fetch(studio.url.split('#')[0]);check('工作台页面可访问且允许嵌入',()=>{assert.equal(studioPage.status,200);assert(!['DENY','SAMEORIGIN'].includes(studioPage.headers.get('x-frame-options')?.toUpperCase()));});
 const studioSource=await fs.readFile(path.join(ROOT,'studio-workspace/index.html'),'utf8');check('工作台载入对应项目工程',()=>assert.equal(studioSource,html));
 const reuse=await create({...defaults,brand:'青序新稿',hook:'新的日常，新的喜欢。'},{reuseFrom:id});check('修改输入创建新项目并沿用图片',()=>{assert.equal(reuse.status,201);assert.equal(reuse.data.parentId,id);assert.notEqual(reuse.data.id,id);});
 const original=await fetch(base+`/api/projects/${id}`).then(r=>r.json());check('修改未覆盖旧成片',()=>{assert.equal(original.status,'complete');assert.equal(original.brief.hook,'把清爽，带进日常。');});
 const status=await fetch(base+'/api/health').then(r=>r.json());check('队列完成后空闲',()=>assert.equal(status.activeProjectId,null));
 await fs.writeFile(path.join(ROOT,'outputs/local-demo-tests.json'),JSON.stringify({time:new Date().toISOString(),passed:results.length,results,uploadProject:id,sampleProject:sample.data.id,revisionProject:reuse.data.id},null,2));console.log('ALL PASS '+results.length);
}catch(e){await fs.writeFile(path.join(ROOT,'outputs/local-demo-tests.json'),JSON.stringify({time:new Date().toISOString(),results,error:e.stack},null,2));console.error(e);process.exitCode=1;}
