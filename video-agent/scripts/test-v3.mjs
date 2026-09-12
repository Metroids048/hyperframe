import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:3020',results=[];
function ok(name,test){test();results.push(name);console.log('PASS '+name);}
const health=await fetch(base+'/api/health').then(r=>r.json());ok('v0.3 服务在线',()=>assert.equal(health.version,'0.4.0-demo'));
const cases=await fetch(base+'/api/cases').then(r=>r.json());ok('四个案例成片就绪',()=>{assert.equal(cases.length,4);assert(cases.every(c=>c.ready));});
for(const c of cases){const r=await fetch(base+c.videoUrl,{headers:{Range:'bytes=0-99'}});ok(c.id+' 成片可播放',()=>assert.equal(r.status,206));await r.arrayBuffer();}
const optimize=async(text,mode='demo')=>{const r=await fetch(base+'/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,mode})});return {status:r.status,data:await r.json()};};
const c=cases.find(c=>c.id==='morning'),planned=await optimize(c.description);
ok('案例段落整理',()=>{assert.equal(planned.status,200);assert.equal(planned.data.brand,'早屿');assert.equal(planned.data.mode,'curated');});
const custom=await optimize('品牌是知夏，商品是保温杯，卖点是轻巧便携、双层杯壁、简约外观。');ok('自由输入规则提取且标明来源',()=>{assert.equal(custom.data.brand,'知夏');assert.equal(custom.data.product,'保温杯');assert.equal(custom.data.mode,'rules');assert.equal(custom.data.benefits.length,3);});
const missing=await optimize('我想做一个好看又有趣的视频，具体信息还没想好。');ok('缺项不虚构',()=>{assert(missing.data.missing.includes('品牌名'));assert.equal(missing.data.brand,'');});
const start=Date.now(),live=await optimize(c.description,'live');ok('实时模式立即返回而不重连',()=>{assert.equal(live.status,503);assert(Date.now()-start<2000);});
const form=new FormData();form.set('brief',JSON.stringify(planned.data));form.set('description',c.description);form.set('useExample','true');form.set('caseId','morning');form.set('settings',JSON.stringify({duration:30,aspect:'9:16',quality:'1080p'}));
const r=await fetch(base+'/api/projects',{method:'POST',body:form}),p=await r.json();ok('设置保存并明确真实输出',()=>{assert.equal(r.status,201);assert.equal(p.requestedSettings.duration,30);assert.equal(p.actualSettings.duration,15);assert(p.renderNotice);assert.equal(p.caseId,'morning');});
ok('优化结果进入分镜',()=>assert.equal(p.storyboard[0].headline,planned.data.hook));
const saved=await fetch(base+'/api/projects/'+p.id).then(r=>r.json());ok('需求与设置可恢复',()=>{assert.equal(saved.description,c.description);assert.equal(saved.requestedSettings.aspect,'9:16');});
await fs.writeFile('outputs/v3-tests.json',JSON.stringify({passed:results.length,results,projectId:p.id,time:new Date().toISOString()},null,2));
console.log('PASS TOTAL '+results.length);
