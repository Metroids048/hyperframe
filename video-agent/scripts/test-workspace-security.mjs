import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';
import {assertSafeFiles,isPrivateConfigPath} from './workspace-security.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'workspace-security-'));
const out=path.resolve('outputs/full-closeout/P00-02');await fs.mkdir(out,{recursive:true});
const token=['sk','canary_workspace_boundary_1234567890'].join('-');
const cases=[];
async function write(relative,text){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);return {absolute:file,path:relative};}
async function rejected(name,file){let caught;try{await assertSafeFiles([file],{context:name});}catch(error){caught=error;}assert.equal(caught?.code,'WORKSPACE_SECRET_BOUNDARY');assert(!String(caught.message).includes(token));cases.push({name,status:'rejected',riskTypes:caught.findings.flatMap(f=>f.riskTypes)});}

assert.equal(isPrivateConfigPath('video-agent/config/minimax.local.env'),true);
assert.equal(isPrivateConfigPath('video-agent/config/minimax.example.env'),false);
await assertSafeFiles([await write('config/minimax.example.env','MINIMAX_API_KEY=\n')]);cases.push({name:'blank example',status:'accepted'});
await rejected('private config path',await write('config/minimax.local.env','MINIMAX_API_KEY=\n'));
await rejected('log canary',await write('outputs/provider.log','MINIMAX_API_KEY='+token+'\n'));
await rejected('frontend canary',await write('web-dist/app.js','const providerToken="'+token+'";\n'));
await rejected('exception directory canary',await write('exceptions/note.txt','SERVICE_TOKEN='+token+'\n'));
const archive=path.join(root,'package.zip'),zip=new yazl.ZipFile();zip.addBuffer(Buffer.from('MINIMAX_API_KEY='+token+'\n'),'config/provider.local.env');zip.end();await new Promise((resolve,reject)=>{zip.outputStream.pipe(createWriteStream(archive)).on('close',resolve).on('error',reject);});
await rejected('archive canary',{absolute:archive,path:'deliverables/package.zip'});
await fs.writeFile(path.join(out,'canary-results.json'),JSON.stringify({schemaVersion:1,status:'passed',realSecretsUsed:false,cases},null,2));
console.log(`${cases.length} workspace security canaries passed`);
