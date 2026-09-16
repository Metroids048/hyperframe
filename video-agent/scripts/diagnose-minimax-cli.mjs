import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {minimaxConfig} from '../lib/edit/adapters/minimax-client.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'outputs/minimax-cli-diagnostic');
const configDir=path.join(dir,'private-config'),configFile=path.join(configDir,'config.json');
const reportFile=path.join(dir,'speech-diagnostic.json');
await fs.mkdir(configDir,{recursive:true});
// Refuse a second paid diagnostic, including after an interrupted first run.
const record={startedAt:new Date().toISOString(),status:'submitting',cliVersion:'1.0.25',model:'speech-2.8-hd',voice:'Chinese (Mandarin)_Reliable_Executive',subtitles:false};
await fs.writeFile(reportFile,JSON.stringify(record,null,2),{flag:'wx'});
const {key}=minimaxConfig('speech');
try {
 await fs.writeFile(configFile,JSON.stringify({api_key:key,region:'cn'}),{mode:0o600});
 const args=[path.join(dir,'node_modules/mmx-cli/dist/mmx.mjs'),'speech','synthesize','--text','看清接口与背板细节，再做选择。','--voice',record.voice,'--model',record.model,'--out',path.join(dir,'speech.mp3'),'--region','cn','--non-interactive','--quiet','--output','json'];
 const child=spawn(process.execPath,args,{cwd:dir,windowsHide:true,env:{...process.env,MMX_CONFIG_DIR:configDir,MINIMAX_VERBOSE:'0',NO_PROXY:'*'}});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{output+=b.toString();});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
 record.exitCode=code;record.output=output.split(key).join('[REDACTED]');record.status=code===0?'generated_unverified':'failed';
} finally {
 await fs.unlink(configFile).catch(()=>{});
 record.completedAt=new Date().toISOString();await fs.writeFile(reportFile,JSON.stringify(record,null,2));
}
console.log(JSON.stringify(record,null,2));
