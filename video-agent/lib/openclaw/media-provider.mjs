import {CodexProvider} from '../edit/codex-provider.mjs';
import {OpenClawStageProvider} from './openclaw-stage-provider.mjs';

// Reuse the existing speech workers and CloudProvider's analysis/edit methods.
// Those methods dispatch through structured(); no Codex process is started.
export class OpenClawMediaProvider extends CodexProvider {
 constructor({stageProvider,stageOptions,...audioOptions}={}){
  super({...audioOptions,skipLoginCheck:true});
  this.stage=stageProvider||new OpenClawStageProvider(stageOptions);
  this.model=this.stage.model;this.reasoningEffort=this.stage.reasoningEffort;
 }
 status(){return {...super.status(),configured:!!this.stage.token,checkingLogin:false,provider:'OpenClaw',model:this.stage.model,auth:'server-configured Gateway',verifiedAt:this.verifiedAt};}
 async refreshLogin(){return !!this.stage?.token;}
 async structured(...args){const result=await this.stage.structured(...args);this.verifiedAt=new Date().toISOString();return result;}
 async close(){await this.stage?.close?.();await super.close();}
}
