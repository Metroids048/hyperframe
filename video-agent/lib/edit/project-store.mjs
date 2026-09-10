import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=/^[a-f0-9-]{36}$/;
async function atomic(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file);}

// Metadata is the commit point. Version timelines and analyses are separate files;
// existing v1 project.json files remain readable and are migrated on a real write.
export class ProjectStore {
  constructor(root){this.root=root;this.pending=new Map();this.written=new Map();this.listeners=new Map();this.events=new Map();}
  dir(id){if(!uuid.test(id))throw Error('Invalid project ID');return path.join(this.root,id);}
  async load(){
    await fs.mkdir(this.root,{recursive:true});const loaded=[];
    for(const id of await fs.readdir(this.root))if(uuid.test(id)){
      try{
        const dir=this.dir(id),p=JSON.parse(await fs.readFile(path.join(dir,'project.json'),'utf8'));
        if(p.storageVersion===2){
          p.revisions=await Promise.all((p.revisions||[]).map(async ref=>({...JSON.parse(await fs.readFile(path.join(dir,'revisions',ref.id,'revision.json'),'utf8')),...ref})));
          for(const a of Object.values(p.assets||{}))if(a.analysisFile){a.analysis=JSON.parse(await fs.readFile(path.join(dir,a.analysisFile),'utf8'));delete a.analysisFile;}
        }
        const events=(await fs.readFile(path.join(dir,'events.ndjson'),'utf8').catch(()=>'' )).split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
        this.events.set(id,events);p.eventSequence=Math.max(p.eventSequence||0,events.at(-1)?.sequence||0);
        const staged=(await fs.readdir(path.join(dir,'staging')).catch(()=>[])).filter(x=>uuid.test(x));
        const committed=new Set((p.revisions||[]).map(r=>r.id));
        const unreferenced=(await fs.readdir(path.join(dir,'revisions')).catch(()=>[])).filter(x=>uuid.test(x)&&!committed.has(x));
        if(staged.length||unreferenced.length)p.recovery={stagedRevisionIds:staged,uncommittedRevisionIds:unreferenced,policy:'Retained for diagnosis; never served as a committed preview.'};
        loaded.push(p);
      }catch(error){console.error('Project load failed:',id,error.code||error.message);}
    }
    return loaded;
  }
  save(project,event){
    project.updatedAt=new Date().toISOString();
    const outgoing=event?{...event,projectId:project.id,sequence:(project.eventSequence||0)+1,at:project.updatedAt}:null;
    if(outgoing)project.eventSequence=outgoing.sequence;
    const snapshot=structuredClone(project),id=project.id;
    const work=(this.pending.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const dir=this.dir(id),metadata={...snapshot,storageVersion:2};
      metadata.revisions=[];
      for(const r of snapshot.revisions||[]){
        const file=path.join(dir,'revisions',r.id,'revision.json'),digest=hash(r);
        if(this.written.get(file)!==digest){await atomic(file,r);this.written.set(file,digest);}
        const {timeline,operations,...summary}=r;metadata.revisions.push(summary);
      }
      for(const a of Object.values(metadata.assets||{}))if(a.analysis){
        const name='analysis/'+a.id+'-'+hash(a.analysis).slice(0,20)+'.json',file=path.join(dir,name);
        if(!this.written.has(file)){await atomic(file,a.analysis);this.written.set(file,true);}
        delete a.analysis;a.analysisFile=name;
      }
      await atomic(path.join(dir,'project.json'),metadata);
      if(outgoing){
        await fs.appendFile(path.join(dir,'events.ndjson'),JSON.stringify(outgoing)+'\n');
        const list=this.events.get(id)||[];list.push(outgoing);this.events.set(id,list);
        for(const send of this.listeners.get(id)||[])try{send(outgoing);}catch(error){console.error('Event subscriber disconnected:',error.code||error.message);}
      }
    });this.pending.set(id,work);return work;
  }
  subscribe(id,after,send){
    const listeners=this.listeners.get(id)||new Set();listeners.add(send);this.listeners.set(id,listeners);
    for(const event of this.events.get(id)||[])if(event.sequence>after)send(event);
    return ()=>{listeners.delete(send);if(!listeners.size)this.listeners.delete(id);};
  }
}
