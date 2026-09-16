import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {insist} from './contracts.mjs';
const hash=content=>createHash('sha256').update(content).digest('hex');
const location=(root,sha256)=>path.join(root,'.cache/commerce-guidance',sha256+'.txt');

export async function preserveGuidance(root,content,expectedHash){
  const sha256=hash(content);
  insist(!expectedHash||expectedHash===sha256,'规则原文与记录哈希不符','RESOURCE_HASH');
  const file=location(root,sha256);await fs.mkdir(path.dirname(file),{recursive:true});
  try{await fs.writeFile(file,content,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  insist(hash(await fs.readFile(file))===sha256,'历史规则快照被修改','RESOURCE_HASH');
  return sha256;
}

export async function readPreservedGuidance(root,record){
  insist(/^[a-f0-9]{64}$/.test(record.sha256),'规则哈希无效','RESOURCE_HASH');
  let content;try{content=await fs.readFile(location(root,record.sha256));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  insist(hash(content)===record.sha256,'历史规则快照被修改','RESOURCE_HASH');
  return {content,commit:null,origin:'local-content-addressed-snapshot'};
}
