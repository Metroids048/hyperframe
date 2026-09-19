import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const lock=JSON.parse(await fs.readFile(path.join(root,'runtime/openclaw/skills-lock.json'),'utf8'));
const sections=['Trigger','Exclude','Inputs','Tool order','Output','Preserve','Failure','Acceptance'];
const expected=['commerce-orchestrator','commerce-edit-and-variant','commerce-recovery-delivery','commerce-product-launch','commerce-product-detail','commerce-product-demo','commerce-product-collection','commerce-product-promotion','commerce-product-faq','commerce-general','commerce-hyperframes','commerce-audio-captions'];

async function hashPath(relative){
 const target=path.join(root,relative),stat=await fs.stat(target);
 if(stat.isFile())return createHash('sha256').update(await fs.readFile(target)).digest('hex');
 const files=[];
 async function walk(directory){for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const item=path.join(directory,entry.name);if(entry.isDirectory())await walk(item);else if(entry.isFile())files.push(item);}}
 await walk(target);const hash=createHash('sha256');
 for(const file of files){hash.update(path.relative(target,file));hash.update('\0');hash.update(await fs.readFile(file));hash.update('\0');}
 return hash.digest('hex');
}

assert.deepEqual(lock.skills.map(item=>item.name),expected);
for(const skill of lock.skills){
 const source=await fs.readFile(path.join(root,skill.path),'utf8');
 assert.match(source,new RegExp('^---\\nname: '+skill.name+'\\nversion: '+skill.version+'\\n'));
 for(const section of sections)assert.ok(source.includes('## '+section),skill.name+' missing '+section);
 assert.equal(await hashPath(skill.path),skill.sha256,skill.name+' skill drift');
 assert.ok(skill.sources.length,skill.name+' has no source binding');
 for(const binding of skill.sources)assert.equal(await hashPath(binding.path),binding.sha256,skill.name+' source drift: '+binding.path);
}
const agents=await fs.readFile(path.join(root,'runtime/openclaw/AGENTS.md'),'utf8');
for(const id of ['product_launch','product_detail','product_demo','product_collection','product_promotion','product_faq','general','recut','variant'])assert.ok(agents.includes('`'+id+'`'),id+' missing from runtime AGENTS');
console.log(`${lock.skills.length}/${lock.skills.length} OpenClaw runtime skills and source hashes passed`);
