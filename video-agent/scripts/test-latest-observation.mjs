import test from 'node:test';
import assert from 'node:assert/strict';
import {queryEvidence,selectEvidenceInputs} from '../lib/creative/evidence-index.mjs';
test('requested inspection reaches the actual four-image model context',()=>{
  const entries=Array.from({length:7},(_,i)=>({id:'old'+i,assetId:'v',batchKey:'overview',startSeconds:i*10,endSeconds:i*10+10,times:[i*10],file:'old'+i}));
  entries.push(...Array.from({length:3},(_,i)=>({id:'new'+i,assetId:'v',batchKey:'requested-action',startSeconds:22,endSeconds:34,times:[22+i],file:'new'+i})));
  const selected=queryEvidence({entries},{preferredBatchKeys:['requested-action']});
  const actual=selectEvidenceInputs(selected.records.flatMap(r=>[{type:'input_text',text:r.id},{type:'input_image',image_url:r.id}]),4);
  assert(actual.inputs.some(i=>i.text==='new0'));
  assert(actual.inputs.some(i=>i.text?.startsWith('old')));
  assert.equal(actual.sent,4);
  assert.equal(entries[0].id,'old0');
});
test('an explicit source range still excludes unrelated latest observations',()=>{
  const index={entries:[{id:'a',assetId:'v',batchKey:'old',times:[3]},{id:'b',assetId:'v',batchKey:'latest',times:[50]}]};
  assert.deepEqual(queryEvidence(index,{ranges:[{assetId:'v',startSeconds:0,endSeconds:5}],preferredBatchKeys:['latest']}).records.map(x=>x.id),['a']);
});
