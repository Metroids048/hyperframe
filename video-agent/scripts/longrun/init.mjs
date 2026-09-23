import {ensureState,appendLog,loadState} from './common.mjs';
const state=await ensureState();
await appendLog('init',{task:'init',state_before:state.status,decision:'initialized',action:'durable_state_ready',state_after:state.status});
console.log(JSON.stringify({statePath:'video-agent/.longrun/STATE.json',goal:state.goal,codexSessionId:state.codexSessionId},null,2));
