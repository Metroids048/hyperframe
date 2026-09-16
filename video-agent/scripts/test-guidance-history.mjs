import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {preserveGuidance,readPreservedGuidance} from '../lib/creative/guidance-history.mjs';
test('changed prompts retain both exact historical texts without claiming an upstream commit',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'hyperframe-guidance-'));
  const old=await preserveGuidance(root,'old prompt'),current=await preserveGuidance(root,'new prompt');
  await Promise.all([preserveGuidance(root,'old prompt',old),preserveGuidance(root,'old prompt',old)]);
  assert.notEqual(old,current);
  const prior=await readPreservedGuidance(root,{sha256:old});
  assert.equal(prior.content.toString(),'old prompt');assert.equal(prior.commit,null);
  assert.equal((await readPreservedGuidance(root,{sha256:current})).content.toString(),'new prompt');
  await assert.rejects(()=>preserveGuidance(root,'different',old),{code:'RESOURCE_HASH'});
  await fs.writeFile(path.join(root,'.cache/commerce-guidance',old+'.txt'),'tampered');
  await assert.rejects(()=>readPreservedGuidance(root,{sha256:old}),{code:'RESOURCE_HASH'});
  await assert.rejects(()=>readPreservedGuidance(root,{sha256:'../file'}),{code:'RESOURCE_HASH'});
});
