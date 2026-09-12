import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await import('./prepare-commerce-fixtures.mjs');
const tool=path.join(root,'scripts/commerce-agent-tool.mjs');
const run=input=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[tool],{cwd:root,stdio:['pipe','pipe','pipe']});let out='',err='';
  child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
  child.on('error',reject);child.on('close',code=>{if(code!==0)return reject(new Error(err||out));try{resolve(JSON.parse(out));}catch(error){reject(error);}});
  child.stdin.end(JSON.stringify(input));
});

const sample=JSON.parse(await fs.readFile(path.join(root,'examples/commerce/request.sample.json'),'utf8'));
sample.projectId='commerce-tool-ci';sample.outputDir='data/commerce-runs/tool-ci';sample.render=false;
await fs.rm(path.join(root,sample.outputDir),{recursive:true,force:true});
const created=await run({action:'create',request:sample});
assert.equal(created.ok,true);assert.equal(created.result.document.durationSeconds,30);
const documentFile=path.join(root,sample.outputDir,'document.json');
const before=JSON.parse(await fs.readFile(documentFile,'utf8'));
const target=before.nodes.find(n=>n.semanticRole==='title');
const untouched=before.nodes.find(n=>n.id!==target.id);
assert(target&&untouched);
const patched=await run({action:'patch',outputDir:sample.outputDir,operations:[{type:'update_text',nodeId:target.id,text:'对话续改后的商品标题'}]});
assert.equal(patched.ok,true);assert.equal(patched.result.previousRevisionId,before.revisionId);
const after=JSON.parse(await fs.readFile(documentFile,'utf8'));
assert.notEqual(after.revisionId,before.revisionId);
assert.equal(after.nodes.find(n=>n.id===target.id).params.text,'对话续改后的商品标题');
assert.deepEqual(after.nodes.find(n=>n.id===untouched.id),untouched);
await fs.access(path.join(root,sample.outputDir,'revisions',`${before.revisionId}.json`));
assert.deepEqual(patched.result.invalidation.changedScenes,[target.sceneId]);
console.log('PASS host-agent create -> object patch -> preserved previous revision');
