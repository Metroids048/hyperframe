import {CodexProvider} from '../edit/codex-provider.mjs';
import {OpenClawStageProvider} from './openclaw-stage-provider.mjs';
import {OpenClawMediaProvider} from './media-provider.mjs';
import {CloudProvider} from '../edit/provider.mjs';
export function createMediaProvider({legacyCloud=false,...options}={}){const runtime=runtimeSelection();if(runtime==='openclaw')return new OpenClawMediaProvider(options);return legacyCloud&&process.env.VIDEO_AGENT_EDIT_PROVIDER==='openai'?new CloudProvider():new CodexProvider(options);}
export function runtimeSelection(value=process.env.COMMERCE_AGENT_RUNTIME||'legacy'){if(!['legacy','shadow','openclaw'].includes(value)){const e=new Error('COMMERCE_AGENT_RUNTIME invalid');e.code='RUNTIME_MODE_INVALID';throw e;}return value;}
export function createStructuredProvider({provider,cacheRoot,onInvocation}={}){if(provider)return {provider,owned:false,runtime:'injected'};const runtime=runtimeSelection();if(runtime==='openclaw')return {provider:new OpenClawStageProvider({onInvocation}),owned:true,runtime};return {provider:new CodexProvider({cacheRoot,onInvocation}),owned:true,runtime};}
