import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const names=[...new Set(execFileSync('git',['ls-files','-z','-c','-o','--exclude-standard'],{cwd:root,maxBuffer:30e6}).toString().split('\0').filter(Boolean))];
const secret=/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/;
const findings=[],large=[],missing=[],upstreamTestFixtures=[];let checked=0;
const fixturePaths=new Set(['hyperframes/packages/cli/src/capture/contentExtractor.test.ts','hyperframes/packages/cli/src/telemetry/agent_runtime.test.ts','hyperframes/packages/cli/src/telemetry/agent_runtime.ts']);
for(const name of names){
 const file=path.join(root,name),stat=await fs.stat(file).catch(()=>null);if(!stat){missing.push(name);continue;}if(!stat.isFile())continue;
 if(stat.size>100*1024*1024)large.push({path:name,bytes:stat.size});
 if(name.startsWith('workspace-content/objects/'))continue;
 if(/(?:^|\/)\.env(?:\.|$)|\.local\.(?:env|json)$/.test(name)){findings.push({path:name,reason:'private configuration'});continue;}
 if(stat.size<40e6&&/\.(?:json|md|txt|log|html|mjs|js|ts|tsx|py|ps1|sh|yml|yaml|env|toml)$/i.test(name)){checked++;if(secret.test(await fs.readFile(file,'utf8'))){
  let unchangedFixture=false;if(fixturePaths.has(name))try{execFileSync('git',['diff','--quiet','HEAD','--',name],{cwd:root});unchangedFixture=true;}catch{}
  if(unchangedFixture)upstreamTestFixtures.push({path:name,reason:'Reviewed unchanged upstream redaction-test dummy / explanatory example; no real credential'});
  else findings.push({path:name,reason:'credential-shaped content; value omitted'});
 }}
}
const report={checkedAt:new Date().toISOString(),candidateFiles:names.length,checkedTextFiles:checked,findings,large,missing,upstreamTestFixtures,policy:'Existing upstream files missing locally are retained in the index; no historical removal. Secret values never printed.'};
await fs.writeFile(path.join(root,'video-agent/outputs/eight-scenarios-20260916/publish-file-check.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({candidateFiles:names.length,checkedTextFiles:checked,findings,large,missingCount:missing.length}));
if(findings.length||large.length)process.exitCode=2;
