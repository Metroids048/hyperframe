import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export function explicitResource(need){
 const text=typeof need==='string'?need:JSON.stringify(need);
 const named=/chromatic(?:[- ]radial)?[- ]split|色散/i.test(text);
 if(!named||/(?:不要|禁止|不用)[^。！,，]{0,8}(?:色散|chromatic)/i.test(text))return null;
 return 'chromatic-radial-split';
}
export class HyperFramesResourceCatalog {
 constructor(root,data){this.root=root;this.data=data;this.resources=Object.values(data.groups).flat();}
 static async open(root){const d=JSON.parse(await fs.readFile(path.join(root,'config/hyperframes/catalog.generated.json'),'utf8'));if(d.provenance.runtimeVersion!=='0.8.33'||hash({commit:d.provenance.commit,groups:d.groups,files:d.files})!==d.contentHash)throw Error('Catalog version/hash mismatch');return new this(root,d);}
 search(need,{limit=12}={}){const exact=explicitResource(need);const text=(JSON.stringify(need)+(exact?' '+exact:'')).toLowerCase();const terms=text.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t=>t.length>2);return this.resources.map(r=>({...r,score:[...new Set(terms)].reduce((sum,t)=>sum+((r.name+' '+r.tags.join(' ')+' '+r.description).toLowerCase().includes(t)?1:0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);}
 async context(resources,{maxCharacters=12000}={}){let text='',records=[];for(const r of resources){if(!this.resources.some(x=>x.id===r.id&&x.sha256===r.sha256))throw Error('Unknown resource');const file=path.resolve(this.root,'..',r.path);if(!file.startsWith(path.resolve(this.root,'../third_party')+path.sep))throw Error('Resource path escapes mirror');const content=await fs.readFile(file,'utf8');if(hash(content)!==r.sha256)throw Error('Upstream resource changed: '+r.id);if(text.length+content.length>maxCharacters)continue;text+='\n<reference path="'+r.path+'">'+content+'</reference>\n';records.push({file:r.path,sha256:r.sha256,id:r.id,execution:'reference_only'});}return {text,records,budget:{maxCharacters,usedCharacters:text.length}};}
}
export class HyperFramesResourcePlanner {
 constructor(catalog,adapters=[]){this.catalog=catalog;this.adapters=adapters;}
 plan(need){const exact=explicitResource(need);const found=this.catalog.search(need,{limit:20});const adapters=this.adapters.filter(a=>a.compatible&&a.eligible);const selected=adapters.filter(a=>!exact||[exact,'chromatic-split'].includes(a.id)).map(a=>{const sources=found.filter(r=>r.name===a.id||(a.id==='chromatic-split'&&r.name==='chromatic-radial-split'));return {...a,discoveryScore:sources.reduce((s,r)=>s+r.score,0),sourceFiles:sources.map(r=>({path:r.path,sha256:r.sha256,commit:r.sourceCommit}))};}).sort((a,b)=>b.discoveryScore-a.discoveryScore||b.score-a.score).slice(0,5);return {need,requestedCanonicalId:exact,status:exact&&!selected.length?'pending_adapter':'resolved',catalogHash:this.catalog.data.contentHash,selected,alternatives:found,whySelected:'Match business/visual purpose, then constrain execution to verified native adapters',whyRejected:found.filter(r=>!selected.some(a=>a.id===r.name)).map(r=>({id:r.id,reason:'Reference discovery only: no reviewed compatible execution adapter selected'})),compatibility:'0.8.33',adapterStatus:'local allowlist; each produced bundle still requires check and render'};}
}
