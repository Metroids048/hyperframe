import {CodexProvider} from '../edit/codex-provider.mjs';
import {CloudProvider} from '../edit/provider.mjs';
import {OpenClawStageProvider} from './openclaw-stage-provider.mjs';
import {OpenClawMediaProvider} from './media-provider.mjs';
// OpenClaw is the ingress/session layer. It must not become a second planner
// inside Video Agent. The direct provider can still be selected explicitly for
// a migration canary, while the legacy OpenClaw stage remains opt-in only.
function directProvider(options={}){
  const kind=String(process.env.VIDEO_AGENT_PLANNER_PROVIDER||'codex').toLowerCase();
  if(kind==='openclaw')return new OpenClawStageProvider(options);
  if(kind==='openai'||kind==='cloud')return new CloudProvider(options);
  if(kind!=='codex')throw Object.assign(new Error('VIDEO_AGENT_PLANNER_PROVIDER must be codex, openai, or openclaw'),{code:'PLANNER_PROVIDER_INVALID'});
  return new CodexProvider({skipLoginCheck:true,...options});
}
export function createMediaProvider({legacyCloud=false,...options}={}){
  const runtime=runtimeSelection();
  // Explicit injected stage providers are retained for isolated compatibility
  // tests and migrations. The normal OpenClaw runtime path has no stage option
  // and therefore stays on the direct provider above.
  if(runtime==='openclaw'&&options.stageProvider)return new OpenClawMediaProvider(options);
  if(runtime==='openclaw')return directProvider(options);
  return legacyCloud&&process.env.VIDEO_AGENT_EDIT_PROVIDER==='openai'?new CloudProvider():new CodexProvider(options);
}
export function runtimeSelection(value=process.env.COMMERCE_AGENT_RUNTIME||'legacy'){if(!['legacy','shadow','openclaw'].includes(value)){const e=new Error('COMMERCE_AGENT_RUNTIME invalid');e.code='RUNTIME_MODE_INVALID';throw e;}return value;}
export function createStructuredProvider({provider,cacheRoot,onInvocation}={}){
  if(provider)return {provider,owned:false,runtime:'injected'};
  const runtime=runtimeSelection();
  return {provider:directProvider({cacheRoot,onInvocation}),owned:true,runtime};
}
