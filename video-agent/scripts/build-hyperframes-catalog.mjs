import fs from 'node:fs/promises';
import {refreshLocalCatalog} from '../lib/creative/resource-discovery.mjs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'), upstream=path.join(root,'third_party/hyperframes');
const hash=x=>createHash('sha256').update(x).digest('hex');
const walk=async d=>(await Promise.all((await fs.readdir(d,{withFileTypes:true})).filter(e=>e.name!=='.git').map(async e=>e.isDirectory()?walk(path.join(d,e.name)):e.isFile()?[path.join(d,e.name)]:[]))).flat();
const commit=execFileSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tag=execFileSync('git',['-C',upstream,'describe','--tags','--exact-match'],{encoding:'utf8'}).trim();
if(tag!=='v0.8.33')throw Error('Expected exact pinned v0.8.33 mirror');
const provenance={repository:'https://github.com/heygen-com/hyperframes',tag,commit,runtimeVersion:'0.8.33',license:'Apache-2.0',licenseSha256:hash(await fs.readFile(path.join(upstream,'LICENSE'))),mode:'read-only-reference',fetchedAt:new Date().toISOString(),lastVerifiedAt:new Date().toISOString()};
await fs.writeFile(path.join(root,'third_party/hyperframes-upstream.json'),JSON.stringify(provenance,null,2));
const groups=['skills','workflowSkills','registryBlocks','registryComponents','animationBlueprints','animationRules','mediaCapabilities','renderCapabilities','cliCapabilities','launchReferences','examples'];
let catalog={schemaVersion:1,provenance,groups:Object.fromEntries(groups.map(k=>[k,[]])),files:[]};
for(const file of await walk(upstream)){
 const p=path.relative(upstream,file).replaceAll('\\','/');if(!/\.(md|json|mjs|ts|tsx|html|js)$/.test(p))continue;
 const content=await fs.readFile(file,'utf8');catalog.files.push({path:p,sha256:hash(content)});
 let type;
 if(/^skills\/[^/]+\/SKILL.md$/.test(p))type=/skills\/(?:hyperframes|media-use|figma)(?:-|\/)/.test(p)?'skills':'workflowSkills';
 else if(/^registry\/blocks\/.+\/registry-item.json$/.test(p))type='registryBlocks';
 else if(/^registry\/components\/.+\/registry-item.json$/.test(p))type='registryComponents';
 else if(/hyperframes-animation\/blueprints\/.*\.md$/.test(p))type='animationBlueprints';
 else if(/hyperframes-animation\/rules\/.*\.md$/.test(p))type='animationRules';
 else if(/^(examples|registry\/examples)\//.test(p)&&/index.html$|README.md$|registry-item.json$/.test(p))type='examples';
 else if(/^skills\/(media-use|hyperframes-audio)\/references\/.*\.md$/.test(p))type='mediaCapabilities';
 else if(/^(skills\/hyperframes-cli\/|packages\/cli\/src\/commands\/)/.test(p)&&/\.md$|\.ts$/.test(p))type='cliCapabilities';
 else if(/^packages\/(producer|player|studio|renderer|core)\//.test(p)&&/README.md$|package.json$/.test(p))type='renderCapabilities';
 if(!type)continue;
 let meta={};if(p.endsWith('registry-item.json'))meta=JSON.parse(content);
 const name=meta.name||path.basename(p)==='SKILL.md'? (meta.name||p.split('/')[1]):path.basename(p).replace(/\.[^.]+$/,'');
 const description=meta.description||content.match(/^description:\s*["']?(.+)$/m)?.[1]||content.split('\n').find(l=>l.trim()&&!/^---|^#|^>/.test(l))||name;
 const r={id:type+':'+name,type,path:'third_party/hyperframes/'+p,name,tags:meta.tags||name.split('-'),description:description.slice(0,1200),inputRequirements:meta.dimensions?{dimensions:meta.dimensions,duration:meta.duration||null}:{consult:p},outputBehavior:meta.type||type,runtimeCompatibility:{runtime:'0.8.33',status:'reference-compatible',execution:'requires-reviewed-local-adapter'},sourceCommit:commit,license:'Apache-2.0; media rights separate',executionStatus:'reference_only',sha256:hash(content)};catalog.groups[type].push(r);
}
const launches=path.join(root,'third_party/hyperframes-launches');
try{const launchCommit=execFileSync('git',['-C',launches,'rev-parse','HEAD'],{encoding:'utf8'}).trim();for(const file of await walk(launches)){const p=path.relative(launches,file);if(!/^[^/]+\/(index.html|STORYBOARD.md|meta.json)$/.test(p))continue;catalog.groups.launchReferences.push({id:'launchReferences:'+p,type:'launchReferences',name:p.split('/')[0],path:'third_party/hyperframes-launches/'+p,tags:['launch','reference'],description:'Official launch source; study composition, not brand assets',inputRequirements:{review:'read source and license'},outputBehavior:'reference composition',runtimeCompatibility:{status:'unverified',runtime:'0.8.33'},sourceCommit:launchCommit,license:'Apache-2.0 source only; bundled assets excluded',executionStatus:'reference_only',sha256:hash(await fs.readFile(file))});}await fs.writeFile(path.join(root,'third_party/hyperframes-launches-upstream.json'),JSON.stringify({repository:'https://github.com/heygen-com/hyperframes-launches',commit:launchCommit,mode:'read-only-reference',license:'Apache-2.0 source; see NOTICE for media',lfs:'text clone; binary availability must be checked',fetchedAt:new Date().toISOString()},null,2));}catch(e){catalog.launchWarning=e.message;}
catalog.contentHash=hash(JSON.stringify({commit,groups:catalog.groups,files:catalog.files}));
catalog=await refreshLocalCatalog(path.join(root,'video-agent'),catalog);
await fs.mkdir(path.join(root,'video-agent/config/hyperframes'),{recursive:true});await fs.writeFile(path.join(root,'video-agent/config/hyperframes/catalog.generated.json'),JSON.stringify(catalog,null,2));console.log(JSON.stringify({contentHash:catalog.contentHash,files:catalog.files.length,counts:Object.fromEntries(groups.map(k=>[k,catalog.groups[k].length]))},null,2));
