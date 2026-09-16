import fs from 'node:fs/promises';
import path from 'node:path';
import {createInitialCloseoutState,loadCloseoutQueue,readSourceRevision} from '../lib/creative/full-closeout-state.mjs';

const root=path.resolve(import.meta.dirname,'..'),command=process.argv[2]||'show',stateFile=path.join(root,'outputs/full-closeout/task-state.json');
if(command==='init'){
 const catalog=JSON.parse(await fs.readFile(path.join(root,'config/full-closeout-tasks.json'),'utf8'));
 const packageSha256=process.argv.find(arg=>arg.startsWith('--package-sha256='))?.split('=')[1]||null;
 await fs.mkdir(path.dirname(stateFile),{recursive:true});
 await fs.writeFile(stateFile,JSON.stringify(createInitialCloseoutState(catalog,{sourceRevision:await readSourceRevision(root),packageSha256}),null,2)+'\n',{flag:'wx'});
 console.log('Initialized existing closeout state binding:',stateFile);
}else if(command==='show'||command==='verify'){
 const queue=await loadCloseoutQueue(root);console.log(JSON.stringify(queue,null,2));if(command==='verify'&&!queue.validation.valid)process.exitCode=1;
}else throw Error('Usage: node scripts/full-closeout-status.mjs [show|verify|init]');
