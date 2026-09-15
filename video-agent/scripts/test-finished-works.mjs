import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {readFinishedWorks,publicFinishedWork} from '../lib/creative/finished-works.mjs';
import {finishedWorkOptions} from '../web/finished-work-options.mjs';

test('exported work remains selectable after an unrendered edit; test projects and duplicate presets stay out',()=>{
 const projects=[{id:'p',title:'产品',currentRevisionId:'new',revisions:[{id:'old',rendered:true,videoUrl:'/old.mp4'},{id:'new',rendered:false}]},{id:'test',testOnly:true,revisions:[{rendered:true,videoUrl:'/test.mp4'}]},{id:'draft',revisions:[]}];
 const options=finishedWorkOptions(projects,[{id:'duplicate',sourceProjectId:'p',videoUrl:'/old.mp4'}],[{id:'mijia-v2',title:'米家'}]);
 assert.deepEqual(options.map(o=>o.value),['work:mijia-v2','p']);assert.match(options[1].label,/最近导出版/);
});
test('local finished catalog rejects changed bytes and escaping paths; missing artifacts are not advertised',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'finished-work-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'examples/commerce'),{recursive:true});await fs.writeFile(path.join(root,'clip.mp4'),'fixture bytes, not media acceptance');
 const entry={id:'reference',title:'参考',video:'clip.mp4',sha256:createHash('sha256').update('fixture bytes, not media acceptance').digest('hex'),provenance:'reference-author'};
 const save=entries=>fs.writeFile(path.join(root,'examples/commerce/finished-works.json'),JSON.stringify(entries));
 await save([entry]);const [work]=await readFinishedWorks(root),visible=publicFinishedWork(work);assert.equal(visible.provenance,'reference-author');assert.equal(visible.video,undefined);assert.equal(visible.videoUrl,'/api/commerce-finished/reference/video');
 await fs.writeFile(path.join(root,'clip.mp4'),'changed');await assert.rejects(readFinishedWorks(root),/内容已变化/);
 await save([{...entry,video:'../outside.mp4'}]);await assert.rejects(readFinishedWorks(root));
 await save([{...entry,video:'missing.mp4'}]);assert.deepEqual(await readFinishedWorks(root),[]);
 await save([entry,entry]);await assert.rejects(readFinishedWorks(root));
});
