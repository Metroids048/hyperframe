// Bound final render, interactive preview, and shot authoring independently.
const pools={preview:{active:false,waiters:[]},render:{active:false,waiters:[]},author:{active:false,waiters:[]}};
const cancelled=()=>Object.assign(new Error('任务已取消'),{status:409});
export function acquireRender({kind='render',signal}={}) {
  if(!pools[kind])throw new TypeError('Unknown render pool');
  if(signal?.aborted)return Promise.reject(cancelled());
  const pool=pools[kind];
  return new Promise((resolve,reject)=>{
    const entry={start(){signal?.removeEventListener('abort',abort);pool.active=true;let released=false;resolve(()=>{if(released)return;released=true;pool.active=false;pool.waiters.shift()?.start();});}};
    const abort=()=>{const i=pool.waiters.indexOf(entry);if(i>=0)pool.waiters.splice(i,1);reject(cancelled());};
    if(pool.active){pool.waiters.push(entry);signal?.addEventListener('abort',abort,{once:true});}
    else entry.start();
  });
}
