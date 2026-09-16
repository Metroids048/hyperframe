import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {MiniMaxClient} from '../lib/edit/adapters/minimax-client.mjs';

const output=path.join(ROOT,'outputs/minimax-live');
await fs.mkdir(output,{recursive:true});
const client=new MiniMaxClient({root:ROOT});
const mode=process.argv[2]||'speech';
const report={mode,startedAt:new Date().toISOString(),status:'running'};
try {
  const catalog=await client.execute('voices');
  report.voiceCount=catalog.voices.length;
  const voice=catalog.voices.find(v=>v.name==='沉稳高管');
  if(!voice)throw Error('账户未返回所选音色');
  const input=mode==='music'?{prompt:'克制温暖的产品展示背景纯音乐，轻柔电子氛围与简洁节奏，无人声，无歌词，不要突然的强鼓点。'}:{text:'看清接口与背板细节，再做选择。',voice:voice.id,subtitleType:'sentence'};
  report.input=input;
  const result=await client.execute(mode,input,{retryKnownFailure:process.argv.includes('--retry-known')});
  report.result=result;report.status='passed';
  console.log(JSON.stringify({status:report.status,mode,operationId:result.operationId,file:result.file,durationSeconds:result.durationSeconds,words:result.words,cacheHit:result.cacheHit,provenance:result.provenance},null,2));
} catch(error) {report.status='failed';report.error={code:error.code,message:error.message};console.log(JSON.stringify(report.error));process.exitCode=1;}
report.completedAt=new Date().toISOString();
await fs.writeFile(path.join(output,mode+'.json'),JSON.stringify(report,null,2));
