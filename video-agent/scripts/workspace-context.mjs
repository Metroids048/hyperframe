import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT=path.join(ROOT,'outputs','workspace-context.json');
const REQUIRED_SKILLS=['timeline-edit','speech-captions','visual-composition','audio-mix','rough-cut','hyperframes','faceless-explainer','hyperframes-creative','media-use','hyperframes-animation'];
const fetchSoft=process.argv.includes('--fetch-soft');
const now=new Date().toISOString();

function runGit(args,{timeout=12000}={}){
  const r=spawnSync('git',args,{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout});
  if(r.error)return {ok:false,stdout:'',stderr:r.error.message,code:null};
  return {ok:r.status===0,stdout:String(r.stdout||'').trim(),stderr:String(r.stderr||'').trim(),code:r.status};
}
function sanitizeRemote(value=''){
  if(!value)return null;
  try{const u=new URL(value);u.username='';u.password='';return u.toString().replace(/\/$/,'');}catch{}
  return value.replace(/\/\/[^/@]+@/,'//').replace(/^[^@\s]+@([^:]+):/, 'ssh://$1/');
}
function statusPaths(text=''){
  return text.split(/\r?\n/).filter(Boolean).map(line=>line.slice(3).trim()).filter(Boolean).slice(0,400);
}
function artifactPath(value=''){
  const p=value.replace(/^\"|\"$/g,'').replaceAll('\\','/');
  return p.startsWith('outputs/')||p.startsWith('web-dist/')||p.startsWith('renders/')||p.startsWith('.state/')||p.startsWith('data/')||p.startsWith('studio-workspace/');
}
function recommendation({isGit,dirty,behind,ahead}){
  if(!isGit)return 'standalone-local: use current files; Git sync is unavailable and must not block the workbench';
  if(dirty&&behind>0)return 'preserve-local-then-integrate: local edits exist and origin/main is newer; do not reset or overwrite local files';
  if(dirty)return 'preserve-local: local edits are the execution source; review and commit/stash intentionally before integrating remote changes';
  if(behind>0)return 'integrate-origin-main: update the clean local branch from origin/main before agent code changes';
  if(ahead>0)return 'local-ahead: verify and push through the normal branch/PR flow; never force-push main';
  return 'in-sync: current local checkout matches origin/main';
}

const pkg=JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8'));
const registry=JSON.parse(await fs.readFile(path.join(ROOT,'config','skills','registry.json'),'utf8'));
const promptPath=path.join(ROOT,'prompts','workbench-agent.md');
await fs.access(promptPath);
const ids=registry.skills?.map(s=>s.id)||[];
const missing=REQUIRED_SKILLS.filter(id=>!ids.includes(id));
if(missing.length)throw new Error('Workspace skill registry is incomplete: '+missing.join(', '));
if(pkg.devDependencies?.hyperframes!=='0.8.33')throw new Error('HyperFrames must remain pinned to 0.8.33 for this workspace');

const inside=runGit(['rev-parse','--is-inside-work-tree']);
const isGit=inside.ok&&inside.stdout==='true';
let fetchWarning=null;
if(fetchSoft&&isGit){const fetched=runGit(['fetch','--prune','origin','main'],{timeout:7000});if(!fetched.ok)fetchWarning=(fetched.stderr||fetched.stdout||'git fetch failed').slice(-2000);}
const branch=isGit?runGit(['branch','--show-current']).stdout||null:null;
const head=isGit?runGit(['rev-parse','HEAD']).stdout||null:null;
const remoteRaw=isGit?runGit(['remote','get-url','origin']).stdout||null:null;
const originMain=isGit?runGit(['rev-parse','--verify','origin/main']).stdout||null:null;
const status=isGit?runGit(['status','--porcelain=v1','--untracked-files=all']).stdout:'';
const allDirtyPaths=statusPaths(status),dirtyPaths=allDirtyPaths.filter(p=>!artifactPath(p)),artifactDirtyPaths=allDirtyPaths.filter(artifactPath);
let ahead=0,behind=0;
if(isGit&&originMain&&head){const counts=runGit(['rev-list','--left-right','--count','HEAD...origin/main']);if(counts.ok){const [left,right]=counts.stdout.split(/\s+/).map(Number);ahead=Number.isFinite(left)?left:0;behind=Number.isFinite(right)?right:0;}}
const dirty=dirtyPaths.length>0;
const context={
  schemaVersion:1,
  generatedAt:now,
  workspaceRoot:ROOT,
  mode:isGit?'git-checkout':'standalone-local',
  git:{isGit,branch,head,originMain,ahead,behind,dirty,dirtyPaths,artifactDirtyPaths,remote:sanitizeRemote(remoteRaw),fetchAttempted:fetchSoft,fetchWarning},
  runtime:{node:process.version,platform:process.platform,arch:process.arch,hyperframes:pkg.devDependencies?.hyperframes||null},
  agent:{canonicalPrompt:'prompts/workbench-agent.md',instructionFiles:['AGENTS.md','CLAUDE.md','EDITING.md'],skills:ids,requiredSkills:REQUIRED_SKILLS},
  policy:{localFilesAreExecutionSource:true,neverDiscardDirtyFiles:true,originMainIsUpstreamReference:true,noForcePushMain:true,outputsAreNotSource:true},
  recommendedAction:recommendation({isGit,dirty,behind,ahead}),
  verification:['node scripts/verify-editor.mjs core','node scripts/verify-editor.mjs browser','npm test','node scripts/workspace-context.mjs']
};
await fs.mkdir(path.dirname(OUTPUT),{recursive:true});
await fs.writeFile(OUTPUT,JSON.stringify(context,null,2)+'\n');
console.log(JSON.stringify({ok:true,output:path.relative(ROOT,OUTPUT),mode:context.mode,branch,ahead,behind,dirty,fetchWarning,skillCount:ids.length,recommendedAction:context.recommendedAction},null,2));
