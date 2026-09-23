import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOpenClawSessionBindings} from '../lib/openclaw/session-bindings.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-sessions-')),file=path.join(root,'sessions.json'),workspaceId='workspace-test';
try{
 const bindings=createOpenClawSessionBindings({file,workspaceId});
 const a={trusted:true,workspaceId,sessionKey:'agent:commerce:conversation-a',agentId:'commerce'};
 const first=await bindings.bind(a,'project-a'),again=await bindings.bind(a,'project-a');
 assert.equal(first.workspaceProjectId,'project-a');assert.equal(again.sessionKey,first.sessionKey);
 const switched=await bindings.bind(a,'project-b');assert.equal(switched.workspaceProjectId,'project-b');
 const replaced=await bindings.replace(a,'project-b');assert.equal(replaced.workspaceProjectId,'project-b');
 assert.equal((await bindings.bind(a,null)).workspaceProjectId,'project-b');
 const b=await bindings.bind({...a,sessionKey:'agent:commerce:conversation-b'},'project-b');assert.equal(b.workspaceProjectId,'project-b');
 const readOnly=await bindings.bind({...a,sessionKey:'agent:commerce:unbound'},null);assert.equal(readOnly.workspaceProjectId,null);
 await assert.rejects(()=>bindings.bind({...a,workspaceId:'other'},'project-a'),{code:'PROJECT_SCOPE_FORBIDDEN'});
 const raw=await fs.readFile(file,'utf8'),state=JSON.parse(raw);assert.equal(Object.keys(state.sessions).length,2);assert.ok(!raw.includes('conversation-a'));assert.ok(!raw.includes('conversation-b'));
 console.log('8/8 OpenClaw stable session binding tests passed');
}finally{await fs.rm(root,{recursive:true,force:true});}
