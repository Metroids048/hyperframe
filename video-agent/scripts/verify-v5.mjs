import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const pending=JSON.parse(await fs.readFile('outputs/v5-tests-pending.json','utf8'));
const p=await fetch('http://127.0.0.1:3020/api/projects/'+pending.projectId).then(r=>r.json());
assert.equal(p.status,'complete');assert.equal(p.media.duration,15);assert.equal(p.media.width,1280);assert.equal(p.media.audioCodec,'aac');
pending.results.push('简化输入实际渲染为 15 秒 720p 成片');
for(const count of [0,1,3]){assert((await fs.readFile('outputs/v5-compose-'+count+'/check.log','utf8')).includes('Check passed'));pending.results.push(count+' 卖点工程通过 HyperFrames 全部检查');}
const media=await fetch('http://127.0.0.1:3020'+p.videoUrl,{headers:{Range:'bytes=0-99'}});assert.equal(media.status,206);await media.arrayBuffer();pending.results.push('新成片可分段读取播放');
await fs.writeFile('outputs/v5-tests.json',JSON.stringify({...pending,passed:pending.results.length,time:new Date().toISOString()},null,2));console.log('PASS TOTAL '+pending.results.length);
