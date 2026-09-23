import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resolveCreativeDataDirectory} from '../lib/runtime-project-directory.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'video-project-directory-'));
const stateRoot=path.join(root,'openclaw-state');
try{
  await fs.mkdir(path.join(root,'config'));
  await fs.writeFile(path.join(root,'config/start.local.json'),JSON.stringify({creativeDataDir:path.join(root,'configured-projects')}));
  assert.equal(await resolveCreativeDataDirectory({root,stateRoot,env:{}}),path.join(root,'configured-projects'));
  assert.equal(await resolveCreativeDataDirectory({root,stateRoot,env:{VIDEO_AGENT_CREATIVE_DATA_DIR:path.join(root,'isolated')}}),path.join(root,'isolated'));
  assert.equal(await resolveCreativeDataDirectory({root,stateRoot,env:{VIDEO_AGENT_EDIT_DATA_DIR:path.join(root,'test/edit')}}),path.join(root,'test/creative-projects'));
  await fs.unlink(path.join(root,'config/start.local.json'));
  assert.equal(await resolveCreativeDataDirectory({root,stateRoot,env:{COMMERCE_AGENT_RUNTIME:'openclaw'}}),path.join(stateRoot,'projects'));
  assert.equal(await resolveCreativeDataDirectory({root,stateRoot,env:{}}),path.join(root,'data/creative-projects'));
  console.log('runtime project directory: 5 checks passed');
}finally{await fs.rm(root,{recursive:true,force:true});}
