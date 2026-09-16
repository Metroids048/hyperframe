import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createCreativeService,creativeRoutes} from '../lib/creative/service.mjs';

test('S04/S15/S24/S26 real HTTP routes preserve candidate access and reject formal bypass',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'focus-api-'));
  const service=await createCreativeService({dataDir});
  const p=await service.create({businessGoal:['promotion'],message:'historical test fixture'});
  const r={id:'R1',directory:'versions/R1',rendered:true,output:{width:1080,height:1920},durationFrames:30};p.revisions=[r];p.currentRevisionId=r.id;
  const dir=service.versionDirectory(p,r);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'commerce-final.mp4'),'isolated routing fixture, not video evidence');
  const server=http.createServer(async(req,res)=>{
    try{const handled=await creativeRoutes(service,req,res,new URL(req.url,'http://'+req.headers.host),{
      json:(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));},
      jsonBody:async req=>{let text='';for await(const chunk of req)text+=chunk;return JSON.parse(text);},
      file:async(req,res,file,type,name)=>{res.writeHead(200,{'Content-Type':type,...(name?{'Content-Disposition':'attachment; filename='+name}:{})});res.end(await fs.readFile(file));},
    });if(!handled){res.writeHead(404);res.end();}}
    catch(error){res.writeHead(error.status||400,{'Content-Type':'application/json'});res.end(JSON.stringify({code:error.code,error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{
    const candidate=await fetch(`${base}/api/commerce/${p.id}/revisions/R1/commerce-final.mp4?download=1`);assert.equal(candidate.status,200);assert.equal(candidate.headers.get('X-Delivery-Status'),'candidate');assert.match(candidate.headers.get('Content-Disposition'),/candidate/);
    const formal=await fetch(`${base}/api/commerce/${p.id}/revisions/R1/commerce-final.mp4?delivery=formal`);assert.equal(formal.status,409);assert.equal((await formal.json()).code,'DELIVERY_NOT_ACCEPTED');
    const human=await fetch(`${base}/api/commerce/${p.id}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewerType:'human',status:'accepted'})});assert.equal(human.status,403);
    const old=await(await fetch(`${base}/api/commerce/${p.id}`)).json();assert.equal(old.project.deliveryStatus,'legacy_unverified');assert.equal(old.project.revisions.length,1);
    const unsupported=await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'draft',request:{businessGoal:['promotion']}})});assert.equal(unsupported.status,400);assert.equal((await unsupported.json()).code,'SCENARIO_UNSUPPORTED');
    const draft=await(await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'draft',request:{businessGoal:['demo'],message:'保留原声，展示真实操作'}})})).json();assert.equal(draft.project.request.businessContract.scenarioId,'product_howto');assert.equal(draft.project.request.businessContract.audio,'original');
  }finally{await new Promise(resolve=>server.close(resolve));await fs.rm(dataDir,{recursive:true,force:true});}
});
