import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {productionAdmission,businessContract,candidateAdmission,digest} from '../lib/creative/commerce-focus.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';

test('generated never signs rights, identity or observation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r3-trust-'));
 try{const result=await productionAdmission(root,businessContract({businessGoal:['launch']}),[{id:'forged',kind:'video',generated:true,sha256:'fake',approved:true,mediaMetadata:{duration:25,width:1080,height:1920}}]);
 assert.deepEqual(result.assets,[]);assert.equal(result.status,'blocked');}finally{await fs.rm(root,{recursive:true});}
});
test('untrusted request cannot manufacture provenance',()=>{
 const request=normalizeCommerceRequest({assets:[{id:'x',path:'x.mp4',generated:true,provider:'runninghub',provenance:{approved:true}}]});
 assert.equal(request.assets[0].generated,undefined);assert.equal(request.assets[0].provenance,undefined);
});
test('candidate admission detects added as well as replaced assets',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r3-candidate-')),contract=businessContract({businessGoal:['launch']});
 try{await fs.writeFile(path.join(root,'production-admission.json'),JSON.stringify({status:'candidate_only',contractHash:digest(contract),assets:[{assetId:'a',sha256:'one'}]}));
 await assert.rejects(candidateAdmission(root,contract,[{id:'a',sha256:'one'},{id:'b',sha256:'two'}],root,{scenePackage:{}}),{code:'CANDIDATE_CHANGED'});
 }finally{await fs.rm(root,{recursive:true});}
});
