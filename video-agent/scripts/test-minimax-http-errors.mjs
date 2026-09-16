import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=path.resolve(import.meta.dirname,'..');

test('real HTTP voice route explains missing credentials without creating projects or exposing credentials',async()=>{
  const directory=await fs.mkdtemp(path.join(root,'outputs/eight-scenarios-20260916/minimax-http-errors-'));
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const env={...process.env,VIDEO_AGENT_PORT:String(port),VIDEO_AGENT_LIVE_CODEX:'0',
    VIDEO_AGENT_DATA_DIR:path.join(directory,'projects'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(directory,'edit-projects'),
    VIDEO_AGENT_CREATIVE_DATA_DIR:path.join(directory,'creative-projects'),
    MINIMAX_API_KEY:'',MINIMAX_VOICES_API_KEY:'',MINIMAX_VOICES_ENABLED:'true',MINIMAX_REGION:'cn',MINIMAX_TIMEOUT_MS:'1000'};
  const server=spawn(process.execPath,['server.mjs'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
  try{
    let ready=false;
    for(let n=0;n<100;n++){
      assert.equal(server.exitCode,null,log);
      try{const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'isolated test server did not start');
    const before=await(await fetch(base+'/api/commerce-projects')).json();
    const response=await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'audio-voices'})});
    const result=await response.json();
    assert.equal(response.status,409);
    assert.equal(result.code,'MINIMAX_UNCONFIGURED');
    assert.equal(result.error,'MiniMax未配置；本地音频仍可使用');
    const after=await(await fetch(base+'/api/commerce-projects')).json();
    assert.deepEqual(after,before);
    await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({scope:'isolated-real-http-no-provider-submission',status:response.status,result,projectListUnchanged:true},null,2));
  }finally{
    if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}
    await fs.writeFile(path.join(directory,'server.log'),log);
  }
});
