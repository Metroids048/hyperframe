import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {acquireDirectoryLease,acquireDirectoryLeases} from '../lib/openclaw/directory-lease.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-lease-'));
try{
 const first=await acquireDirectoryLease(path.join(root,'one'));
 await assert.rejects(()=>acquireDirectoryLease(path.join(root,'one')),error=>error.code==='DATA_DIR_LOCKED');
 await first.release();
 const second=await acquireDirectoryLease(path.join(root,'one'));await second.release();

 const staleDir=path.join(root,'stale');await fs.mkdir(staleDir);
 await fs.writeFile(path.join(staleDir,'.video-agent-writer.lock'),JSON.stringify({pid:2147483647,host:os.hostname(),token:'stale'}));
 const recovered=await acquireDirectoryLease(staleDir);await recovered.release();

 const pair=await acquireDirectoryLeases([path.join(root,'a'),path.join(root,'b'),path.join(root,'a')]);
 assert.equal(pair.leases.length,2);await pair.release();
 for(const name of ['one','stale','a','b'])await assert.rejects(()=>fs.access(path.join(root,name,'.video-agent-writer.lock')),{code:'ENOENT'});
 console.log('4/4 OpenClaw directory lease tests passed');
}finally{await fs.rm(root,{recursive:true,force:true});}
