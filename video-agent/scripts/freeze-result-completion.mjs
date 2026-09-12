import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const base='docs/result-completion/',hash=s=>createHash('sha256').update(s).digest('hex');
const contract=JSON.parse(await fs.readFile(base+'delivery-contract.template.json'));
const qPath='docs/commerce-agent-next/04_BENCHMARK_AND_ACCEPTANCE.md',iPath='docs/03_RUNTIME_AND_ACCEPTANCE.md',hPath='scripts/freeze-commerce-holdouts.mjs',master=base+'02_ACCEPTANCE_CONTRACT.md';
const sources=Object.fromEntries(await Promise.all([qPath,iPath,hPath,master].map(async p=>[p,await fs.readFile(p,'utf8')])));
const hScript=sources[hPath],hCases=vm.runInNewContext(hScript.slice(hScript.indexOf("const moka="),hScript.indexOf('for(const c of cases)'))+';cases');
for(const c of contract.cases){
 let source=master,definition='';
 if(c.id.startsWith('Q')){source=qPath;const id=c.id.slice(0,3);definition=sources[source].split('### '+id+' · ')[1]?.split('\n### ')[0]?.split('\n## ')[0];}
 if(c.id.startsWith('I')){source=iPath;definition=sources[source].split('\n').find(line=>line.startsWith('| '+c.id+' |'));}
 if(c.id.startsWith('H')){source=hPath;definition=hCases.find(h=>h.id===c.id);c.original_input=definition;}
 c.definition_source={path:source,sha256:hash(sources[source])};c.original_definition=definition||sources[master];
 if(c.expected_outcome==='resolve_original')c.expected_outcome=c.id==='Q06'||/^H(01|02|03|04|05|07|08|09)$/.test(c.id)?'video':'behavior';
 if(c.expected_outcome==='video'){
  c.width=c.id==='N2-FIXTURE30'?1080:1920;c.height=c.id==='N2-FIXTURE30'?1920:1080;c.fps=30;
  c.duration_seconds??=c.id==='Q06'?15:({H01:60,H02:45,H03:45,H04:15,H05:15,H07:60,H08:15,H09:60}[c.id]);
  if(c.audio==='from_request'||c.audio==null)c.audio=/^(Q02-|Q05|H03|H07)/.test(c.id)?'required':/^H(02|04|05|08|09)$/.test(c.id)?'forbidden':'optional';
 }else{c.duration_seconds=null;c.fps=null;c.width=null;c.height=null;c.audio=null;}
 if(!c.original_definition)throw Error('Missing original definition '+c.id);
}
// Canonical JSON compatible with the supplied Python verifier.
function sorted(value){if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])]));return value;}
contract.frozen=true;contract.scope_sha256=hash(JSON.stringify(sorted(contract.cases)));contract.note='Original definitions frozen; no case has been declared executed. Behavior cases retain their full original media/edit obligations in original_definition and required_checks.';
const bytes=JSON.stringify(contract,null,2);await fs.writeFile(base+'delivery-contract.json',bytes,{flag:'wx'});await fs.writeFile(base+'contract-freeze.json',JSON.stringify({sha256:hash(bytes),scope_sha256:contract.scope_sha256,frozenAt:new Date().toISOString(),caseCount:contract.cases.length},null,2),{flag:'wx'});
console.log('Frozen '+contract.cases.length+' original requirements; execution remains pending.');
