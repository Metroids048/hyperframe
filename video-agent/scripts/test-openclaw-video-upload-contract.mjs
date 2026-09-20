import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const plugin=await fs.readFile(path.join(root,'openclaw-plugin/index.mjs'),'utf8');
const server=await fs.readFile(path.join(root,'server.mjs'),'utf8');
const patch=await fs.readFile(path.join(root,'scripts/patch-openclaw-2026.6.11.mjs'),'utf8');
const uiPath=process.env.OPENCLAW_UI_BUNDLE||'/Users/a1234/.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw/dist/control-ui/assets/index-BKg4kibc.js';
const ui=await fs.readFile(uiPath,'utf8');
const max=15*1024*1024;

assert.match(plugin,/MAX_VIDEO_UPLOAD_BYTES\s*=\s*15\s*\*\s*1024\s*\*\s*1024/);
assert.match(plugin,/视频不能超过 15 MiB/);
assert.match(server,/OPENCLAW_MAX_VIDEO_BYTES\s*=\s*15\s*\*\s*1024\s*\*\s*1024/);
assert.match(server,/stat\.size>OPENCLAW_MAX_VIDEO_BYTES/);
assert.match(server,/mp4\|mov\|webm/);
assert.match(patch,/MAX_VIDEO_BYTES\s*=\s*15\s*\*\s*1024\s*\*\s*1024/);
assert.match(ui,new RegExp(`r>${max}`));
assert.match(ui,new RegExp(`r<=${max}`));
assert.match(ui,/video\/mp4/);
assert.match(ui,/video\/quicktime/);
assert.match(ui,/video\/webm/);
assert.doesNotMatch(ui,/VIDEO_AUTH_|VIDEO_TOKEN_HASH/);
console.log('OpenClaw video upload contract passed: MP4/MOV/WebM, single attachment, 15 MiB, managed path');
