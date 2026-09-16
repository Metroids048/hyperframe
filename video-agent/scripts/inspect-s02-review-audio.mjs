import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
const directory=path.resolve('outputs/eight-scenarios-20260916/S02-review-candidate-1789538234161');
const provider=new CodexProvider();
try{
  const transcript=await provider.transcribe(path.join(directory,'S02-显卡详情-审阅版-未验收.mp4'));
  await fs.writeFile(path.join(directory,'exported-audio-transcript.json'),JSON.stringify({source:'actual-export-local-asr',humanListening:'pending',transcript},null,2));
  console.log(JSON.stringify({status:transcript.status,words:transcript.words?.length,segments:transcript.segments}));
}finally{await provider.close();}
