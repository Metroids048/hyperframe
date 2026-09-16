/** Configuration is not proof of account permissions or live verification. */
export const minimaxAdapters={speech:{id:'minimax-speech-t2a',capability:'speech',endpoint:'/v1/t2a_v2',models:['speech-2.8-hd','speech-2.8-turbo','speech-2.6-hd','speech-02-hd','speech-02-turbo'],credentialEnv:'MINIMAX_API_KEY'},voices:{id:'minimax-system-voices',capability:'voice-list',endpoint:'/v1/get_voice',models:[],credentialEnv:'MINIMAX_API_KEY'},music:{id:'minimax-music-generation',capability:'music',endpoint:'/v1/music_generation',models:['music-3.0','music-2.6'],credentialEnv:'MINIMAX_API_KEY'}};
export function minimaxCapabilityStatus(env=process.env){
 return Object.fromEntries(Object.entries(minimaxAdapters).map(([key,a])=>{
  const prefix='MINIMAX_'+key.toUpperCase(), credentialEnv=env[prefix+'_API_KEY']?prefix+'_API_KEY':a.credentialEnv;
  const configured=Boolean(String(env[credentialEnv]||'').trim()),disabled=env[prefix+'_ENABLED']==='false';
  return [key,{id:a.id,capability:a.capability,configured,state:disabled?'disabled':configured?'unverified':'unconfigured',credentialEnv,endpoint:a.endpoint,models:a.models,selectedModel:env[prefix+'_MODEL']||null,liveVerification:'not_run'}];
 }));
}
