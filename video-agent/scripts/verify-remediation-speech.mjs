import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
import {measuredNarrationTranscript} from '../lib/creative/narration-timing.mjs';
import {probe,hashFile} from '../lib/edit/media.mjs';
const directory=path.resolve('outputs/product-remediation-20260918/speech-check');await fs.mkdir(directory,{recursive:true});
const provider=new CodexProvider({skipLoginCheck:true,cacheRoot:directory}),text='先看完整外观，再看清局部。';
try{
 const bytes=await provider.speak(text,undefined,'普通话，清楚克制',undefined),file=path.join(directory,'speech.wav');await fs.writeFile(file,bytes);
 const alignment=await measuredNarrationTranscript(provider,file,provider.lastSpeechTranscript);
 const report={status:'measured_candidate',text,metadata:await probe(file),sha256:await hashFile(file),metrics:provider.lastSpeechMetrics,...alignment,audioPerceptionVerified:false,automaticGenerationAcceptance:false};
 await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({status:'failed',code:error.code,error:error.message},null,2));throw error;}
finally{await provider.close();}
