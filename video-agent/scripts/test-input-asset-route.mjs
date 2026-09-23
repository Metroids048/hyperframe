import assert from 'node:assert/strict';
import path from 'node:path';
import {creativeRoutes} from '../lib/creative/service.mjs';
import {ROOT} from '../lib/workflow.mjs';

const asset={id:'uploaded',name:'source.mp4',path:'uploads/uploaded.mp4',originalRef:path.join(ROOT,'data/project/uploads/uploaded.mp4')};
const project={id:'project',assets:[asset]};
const service={has:id=>id===project.id,get:()=>project,versionDirectory:()=>path.join(ROOT,'data/project')};
let served;
await creativeRoutes(service,{method:'HEAD'},{},new URL('http://localhost/api/commerce/project/input-assets/uploaded'),{file:async(_req,_res,file)=>{served=file;}});
assert.equal(served,asset.originalRef);
delete asset.originalRef;
await creativeRoutes(service,{method:'GET'},{},new URL('http://localhost/api/commerce/project/input-assets/uploaded'),{file:async(_req,_res,file)=>{served=file;}});
assert.equal(served,path.join(ROOT,'data/project/uploads/uploaded.mp4'));
asset.path='examples/source.mp4';
await creativeRoutes(service,{method:'GET'},{},new URL('http://localhost/api/commerce/project/input-assets/uploaded'),{file:async(_req,_res,file)=>{served=file;}});
assert.equal(served,path.join(ROOT,asset.path));
console.log('input asset route: 3 checks passed');
