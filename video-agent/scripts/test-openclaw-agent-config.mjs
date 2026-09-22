import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const config=JSON.parse(await fs.readFile(path.join(root,'runtime/openclaw/openclaw.example.json'),'utf8'));
const control=config.agents.list.find(agent=>agent.id==='commerce-control');
const stage=config.agents.list.find(agent=>agent.id==='commerce-stage');
const writes=['video_task','video_cancel'];
const dangerous=['exec','shell','read','write','edit','apply_patch','browser','canvas'];

assert.equal(config.meta.lastTouchedVersion,'2026.6.11');
assert.equal(config.gateway.bind,'loopback');
assert.equal(config.gateway.auth.token,'${OPENCLAW_GATEWAY_TOKEN}');
assert.equal(config.gateway.http.endpoints.responses.enabled,true);
assert.equal(config.gateway.http.endpoints.responses.images.allowUrl,false);
assert.equal(config.gateway.http.endpoints.responses.files.allowUrl,false);
assert.equal(config.tools.media.video.enabled,true);
assert.equal(config.tools.media.video.maxBytes,64*1024*1024);
assert.equal(config.tools.media.video.attachments.mode,'first');
assert.equal(config.tools.media.video.attachments.maxAttachments,1);
assert.equal(control.default,true);assert.equal(control.skills.length,12);assert.deepEqual(control.tools.allow,['video_prepare','video_resource_search','video_web_research','video_project_list','video_project_open','video_task','video_job_status','video_result','video_cancel']);
assert.deepEqual(stage.skills,[]);assert.deepEqual(stage.tools.allow,['video_project_list','video_project_open','video_job_status','video_result']);
assert.ok(writes.every(tool=>!stage.tools.allow.includes(tool)));
assert.ok(dangerous.every(tool=>!control.tools.allow.includes(tool)&&!stage.tools.allow.includes(tool)));
assert.equal(control.tools.elevated.enabled,false);assert.equal(stage.tools.elevated.enabled,false);
assert.ok(config.plugins.allow.includes('commerce-engine'));assert.ok(config.plugins.deny.includes('browser'));assert.ok(config.plugins.deny.includes('canvas'));
const serialized=JSON.stringify(config);assert.ok(!/(sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9])/i.test(serialized));
console.log('14/14 OpenClaw control/stage agent configuration checks passed');
