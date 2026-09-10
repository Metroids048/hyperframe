import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3020',pending=JSON.parse(await fs.readFile('outputs/v6-tests-pending.json','utf8')),ui=JSON.parse(await fs.readFile('outputs/v6-ui-tests.json','utf8')),results=[...pending.results,...ui.results];
const demos=await fetch(base+'/api/demos').then(r=>r.json());assert.equal(demos.length,2);
for(const [i,d] of demos.entries()){
 assert.equal(d.status,'complete');assert.equal(d.media.duration,i===0?60:120);assert.equal(d.storyboard.length,i===0?10:20);assert.equal(d.media.width,1280);assert.equal(d.media.audioCodec,'aac');const source=await fs.readFile('data/projects/'+d.id+'/index.html','utf8');assert(source.includes('，<br>'));const log=await fs.readFile('data/projects/'+d.id+'/check.log','utf8');assert(log.includes('Check passed'));const response=await fetch(base+d.videoUrl,{headers:{Range:'bytes=0-99'}});assert.equal(response.status,206);await response.arrayBuffer();results.push(d.media.duration+' 秒真实成片、分镜时长、检查与播放');
}
assert.equal((await fetch(base)).status,200);const names=[...((await fs.readFile('web/index.html','utf8')).matchAll(/\bid="([^"]+)"/g))].map(x=>x[1]);assert.equal(new Set(names).size,names.length);results.push('页面可访问且元素标识唯一');
await fs.writeFile('outputs/v6-tests.json',JSON.stringify({passed:results.length,results,demos:demos.map(d=>({id:d.id,duration:d.media.duration,shots:d.storyboard.length,video:d.videoUrl})),time:new Date().toISOString()},null,2));console.log('PASS TOTAL '+results.length);
