import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {planShots,validateShots} from '../lib/multishot.mjs';
import {validateBrief} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3020',results=[],pass=(n,f)=>{f();results.push(n);console.log('PASS '+n);};
const catalog=await fetch(base+'/api/cases').then(r=>r.json()),b=validateBrief(catalog[0].brief);
for(const duration of [15,30,60,90,120]){const scenes=planShots(b,{duration},3),checked=validateShots(scenes,3);pass(duration+' 秒自动规划并保持精确总时长',()=>{assert.equal(checked.at(-1).end,duration);assert(checked.length>=4);assert(checked.every((s,i)=>!i||s.start===checked[i-1].end));});}
const one=planShots(b,{duration:60},3),edited=structuredClone(one);edited.splice(1,1);edited.reverse();edited.push({...edited[0],id:'shot-extra',duration:4,headline:'新的结尾'});edited[0].duration=8;const normalized=validateShots(edited,3);
pass('镜头增删重排与时长修改',()=>{assert.equal(normalized[0].id,one.at(-1).id);assert.equal(normalized[0].duration,8);assert.equal(normalized.at(-1).end,60);});
pass('重复 ID、非法素材、过长时长与注入布局拒绝',()=>{assert.throws(()=>validateShots([...one,one[0]],3));for(const field of [{duration:99},{image:3},{layout:'<script>'}])assert.throws(()=>validateShots(one.map((s,i)=>i?s:{...s,...field}),3));});
const source=await fs.readFile('assets/cases/qing.png');const f=new FormData();f.set('brief',JSON.stringify(catalog[0].brief));f.set('settings',JSON.stringify({duration:30}));for(let i=0;i<12;i++)f.append('images',new Blob([source],{type:'image/png'}),`image${i}.png`);
const upload=await fetch(base+'/api/projects',{method:'POST',body:f}),p=await upload.json();pass('十二张素材可导入',()=>{assert.equal(upload.status,201);assert.equal(p.imageUrls.length,12);});
const last=await fetch(base+p.imageUrls[11]);pass('第十二张图片路由可读取',()=>assert.equal(last.status,200));await last.arrayBuffer();
p.storyboard[0].image=11;p.storyboard[0].duration=7;p.storyboard[0].headline='<b>文字测试</b>';
const rr=await fetch(base+'/api/projects/'+p.id+'/storyboard',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyboard:p.storyboard})});const revision=await rr.json();pass('编辑保存为独立新版并更新真实时长',()=>{assert.equal(rr.status,201);assert.equal(revision.parentId,p.id);assert.equal(revision.actualSettings.duration,31);assert.equal(revision.storyboard[0].image,11);});
const legacy=await fetch(base+'/api/projects/1e19ed73-0023-4fc2-b19e-b6dbbf603a30').then(r=>r.json());pass('旧版三幕成片仍可访问',()=>{assert.equal(legacy.status,'complete');assert.equal(legacy.actualSettings.duration,15);});
const c=catalog.find(c=>c.id==='morning'),f2=new FormData();f2.set('brief',JSON.stringify({...c.brief,theme:c.theme}));f2.set('useExample','true');f2.set('caseId',c.id);f2.set('description',c.description);f2.set('settings',JSON.stringify({duration:120,aspect:'16:9',quality:'720p'}));const long=await fetch(base+'/api/projects',{method:'POST',body:f2}).then(r=>r.json());await fetch(base+'/api/projects/'+long.id+'/render',{method:'POST'});
await fs.writeFile('outputs/v6-tests-pending.json',JSON.stringify({results,uploadId:p.id,revisionId:revision.id,longId:long.id},null,2));console.log('LONG_RENDER '+long.id);

