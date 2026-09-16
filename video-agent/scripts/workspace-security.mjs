import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import yauzl from 'yauzl';

const TEXT_EXTENSIONS=new Set(['.cjs','.csv','.env','.html','.js','.json','.log','.md','.mjs','.ps1','.py','.toml','.ts','.tsx','.txt','.xml','.yaml','.yml']);
const SECRET_PATTERNS=[
  ['private_key',/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
  ['provider_token',/(?<![A-Za-z0-9])(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['assigned_secret',/^[ \t]*(?:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)[ \t]*=[ \t]*(?![ \t]*(?:$|example|placeholder|changeme|none|null))["']?[^\s#"']{8,}/im],
];

function posix(value){return String(value).replaceAll('\\','/').replace(/^\.\//,'');}
function exampleConfig(relative){const name=path.posix.basename(posix(relative));return name==='.env.example'||/\.example\.(?:env|json)$/i.test(name);}
export function isPrivateConfigPath(relative){
  const value=posix(relative),name=path.posix.basename(value);
  if(exampleConfig(value))return false;
  return name==='.env'||name.startsWith('.env.')||/\.local\.(?:env|json)$/i.test(name)||/(?:^|\/)minimax-oauth(?:\/|$)/i.test(value);
}
export function credentialRiskTypes(text){return SECRET_PATTERNS.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);}
async function credentialRiskTypesFromFile(absolute){const risks=new Set();let tail='';for await(const chunk of createReadStream(absolute,{encoding:'utf8'})){const text=tail+chunk;for(const risk of credentialRiskTypes(text))risks.add(risk);tail=text.slice(-4096);}return [...risks];}
function isTextPath(relative){const name=path.posix.basename(posix(relative));return name==='.env'||name.startsWith('.env.')||TEXT_EXTENSIONS.has(path.posix.extname(name).toLowerCase());}

async function readZipEntry(zip,entry){
  if(entry.uncompressedSize>8*1024*1024)throw Object.assign(new Error('oversized text entry'),{code:'OVERSIZED_TEXT_ENTRY'});
  const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error?reject(error):resolve(value)));
  const chunks=[];for await(const chunk of stream)chunks.push(chunk);return Buffer.concat(chunks).toString('utf8');
}
async function scanZip(absolute,relative){
  const zip=await new Promise((resolve,reject)=>yauzl.open(absolute,{lazyEntries:true,autoClose:false},(error,value)=>error?reject(error):resolve(value)));
  const findings=[];
  try{
    await new Promise((resolve,reject)=>{
      zip.on('error',reject);zip.on('end',resolve);zip.on('entry',entry=>{
        const entryPath=posix(entry.fileName);
        if(/\/$/.test(entryPath)){zip.readEntry();return;}
        if(isPrivateConfigPath(entryPath)){findings.push({path:relative,archiveEntry:entryPath,riskTypes:['private_config_path']});zip.readEntry();return;}
        if(!isTextPath(entryPath)){zip.readEntry();return;}
        readZipEntry(zip,entry).then(text=>{const risks=credentialRiskTypes(text);if(risks.length)findings.push({path:relative,archiveEntry:entryPath,riskTypes:risks});zip.readEntry();},error=>{findings.push({path:relative,archiveEntry:entryPath,riskTypes:[error.code==='OVERSIZED_TEXT_ENTRY'?'unscanned_oversized_text':'archive_read_error']});zip.readEntry();});
      });zip.readEntry();
    });
  }finally{zip.close();}
  return findings;
}

export async function scanFile(absolute,relative=absolute){
  const safePath=posix(relative);
  if(isPrivateConfigPath(safePath))return [{path:safePath,riskTypes:['private_config_path']}];
  if(path.extname(safePath).toLowerCase()==='.zip')return scanZip(absolute,safePath);
  if(!isTextPath(safePath))return [];
  const risks=await credentialRiskTypesFromFile(absolute);
  return risks.length?[{path:safePath,riskTypes:risks}]:[];
}
export async function assertSafeFiles(files,{context='workspace'}={}){
  const findings=[];
  for(const item of files){findings.push(...await scanFile(item.absolute,item.path));}
  if(findings.length){const error=new Error(`${context} rejected ${findings.length} credential boundary finding(s)`);error.code='WORKSPACE_SECRET_BOUNDARY';error.findings=findings;throw error;}
  return {status:'passed',filesScanned:files.length};
}

function git(root,args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:40e6});if(result.status!==0)throw new Error(result.stderr||result.stdout||'git failed');return result.stdout;}
function nul(text){return text.split('\0').filter(Boolean);}
export async function inspectWorkspace(root){
  const tracked=nul(git(root,['ls-files','-z']));
  const trackedPrivate=tracked.filter(isPrivateConfigPath);
  const changed=[...new Set([...nul(git(root,['ls-files','-m','-o','--exclude-standard','-z'])),...nul(git(root,['diff','--cached','--diff-filter=ACMR','--name-only','-z']))])];
  const findings=[];
  for(const relative of changed){const absolute=path.join(root,relative);try{findings.push(...await scanFile(absolute,relative));}catch(error){if(error.code!=='ENOENT')throw error;}}
  const manifestPath=path.join(root,'workspace-content/manifest.json');let manifestPrivate=[];
  try{const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));manifestPrivate=(manifest.files||[]).map(file=>file.path).filter(isPrivateConfigPath);}catch(error){if(error.code!=='ENOENT')throw error;}
  const localConfigs=[];
  for(const relative of ['video-agent/config/commerce.local.env','video-agent/config/edit.local.env','video-agent/config/minimax.local.env','video-agent/config/start.local.json']){
    const absolute=path.join(root,relative);try{const text=await fs.readFile(absolute,'utf8');localConfigs.push({path:relative,exists:true,credentialLike:credentialRiskTypes(text).length>0,riskTypes:credentialRiskTypes(text)});}catch(error){if(error.code==='ENOENT')localConfigs.push({path:relative,exists:false,credentialLike:false,riskTypes:[]});else throw error;}
  }
  const historyCommits=git(root,['log','--all','--format=%H%x00','--','video-agent/config/minimax.local.env']).split('\0').map(value=>value.trim()).filter(value=>/^[a-f0-9]{40}$/.test(value));
  return {schemaVersion:1,status:trackedPrivate.length||findings.length||manifestPrivate.length?'failed':'passed',trackedPrivate,changedFilesScanned:changed.length,findings,manifestPrivate,localConfigs,historyExposure:{path:'video-agent/config/minimax.local.env',confirmed:historyCommits.length>0,commitCount:historyCommits.length,firstObservedCommit:historyCommits.at(-1)||null,rotationRequired:historyCommits.length>0}};
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const root=path.resolve(process.argv[2]||path.join(import.meta.dirname,'../..'));
  const report=await inspectWorkspace(root);
  const reportArg=process.argv.indexOf('--report');if(reportArg>=0){const target=path.resolve(process.argv[reportArg+1]);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(report,null,2));}
  console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
}
