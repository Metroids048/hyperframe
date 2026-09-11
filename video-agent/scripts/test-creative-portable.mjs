import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {ROOT} from '../lib/workflow.mjs';
import {unpackCreativeHistory,relativeFile} from '../lib/creative/portable.mjs';
const dir=path.join(ROOT,'outputs/resume','portable-security-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(dir,{recursive:true});
async function archive(name,entries){const file=path.join(dir,name+'.zip'),zip=new yazl.ZipFile(),done=pipeline(zip.outputStream,createWriteStream(file));for(const [name,data] of entries)zip.addBuffer(Buffer.from(data),name,{compress:false,forceZip64Format:true});zip.end({forceZip64Format:true});await done;return file;}
test('ZIP64 hashes and non-ASCII native data survive extraction without trusting paths',async()=>{const bytes='真实声音与字幕',hash=createHash('sha256').update(bytes).digest('hex'),file=await archive('valid',[['package.json',JSON.stringify({format:'hyperframe-creative-history',schemaVersion:1})],['blobs/'+hash,bytes]]),result=await unpackCreativeHistory(file,path.join(dir,'valid'));assert.equal(await fs.readFile(result.blob(hash),'utf8'),bytes);assert.throws(()=>relativeFile(dir,'../outside'),{code:'PACKAGE_PATH'});assert.throws(()=>relativeFile(dir,'assets/x:stream'),{code:'PACKAGE_PATH'});});
test('corrupt blobs and undeclared archive paths fail before project publication',async()=>{const wrong='0'.repeat(64);for(const [name,entries,code] of [['corrupt',[['blobs/'+wrong,'wrong']], 'PACKAGE_CORRUPT'],['path',[['assets/evil.js','bad']], 'PACKAGE_PATH'],['prototype',[['package.json','{"__proto__":{"bad":true}}']], 'PACKAGE_INVALID']]){const file=await archive(name,entries);await assert.rejects(unpackCreativeHistory(file,path.join(dir,name)),{code});}});
test('duplicate archive records and compressed data are rejected',async()=>{const file=await archive('duplicate',[['package.json','{}'],['package.json','{}']]);await assert.rejects(unpackCreativeHistory(file,path.join(dir,'duplicate')),{code:'PACKAGE_LIMIT'});const zip=new yazl.ZipFile(),f=path.join(dir,'compressed.zip'),done=pipeline(zip.outputStream,createWriteStream(f));zip.addBuffer(Buffer.from('{}'),'package.json');zip.end();await done;await assert.rejects(unpackCreativeHistory(f,path.join(dir,'compressed')),{code:'PACKAGE_FORMAT'});});
