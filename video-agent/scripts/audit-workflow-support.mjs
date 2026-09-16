import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {commerceSkills} from '../lib/creative/commerce-skills.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=[];
async function walk(dir){for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const full=path.join(dir,e.name);if(e.isDirectory())await walk(full);else if(e.isFile()){const b=await fs.readFile(full),text=b.toString('utf8');files.push({path:path.relative(ROOT,full).replaceAll('\\','/'),sha256:hash(b),bytes:b.length,headings:/\.(md|txt)$/i.test(e.name)?text.split(/\r?\n/).filter(l=>/^#{1,4} /.test(l)):[],requirementLines:/\.(md|txt)$/i.test(e.name)?text.split(/\r?\n/).map((text,i)=>({line:i+1,text})).filter(r=>/必须|不得|不能|验收|失败|兜底|路由|Skill|资源|保持/.test(r.text)):[]});}}}
await walk(path.join(ROOT,'docs'));
const catalog=await CapabilityCatalog.open(ROOT),adapters=catalog.executionCandidates({assets:[{kind:'video'},{kind:'image'}]});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'non-generation; MiniMax paused',documentCount:files.length,documents:files,skills:commerceSkills,
 catalog:{hash:catalog.discovery.data.contentHash,scan:{status:catalog.discovery.data.scan?.status,boundaries:catalog.discovery.data.scan?.boundaries,errors:catalog.discovery.data.scan?.errors},resourceCount:catalog.discovery.resources.length},
 resources:catalog.discovery.resources.map(r=>({id:r.id,path:r.path,sha256:r.sha256,type:r.type||r.kind||null,status:adapters.some(a=>(a.canonicalId||a.id)===(r.canonicalId||r.name||r.id)&&a.compatible)?'adapter_available_unverified_for_project':'reference_only',binding:r.path?.includes('/blocks/')?'block_subcomposition':r.path?.includes('/components/')?'component_scoped_merge':'reference',qualityAccepted:false})),adapters};
const out=path.join(ROOT,'outputs/workflow-support-audit.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({output:out,documents:files.length,resources:report.catalog.resourceCount,adapters:adapters.length,compatibleAdapters:adapters.filter(a=>a.compatible).length,scan:report.catalog.scan?.status}));
