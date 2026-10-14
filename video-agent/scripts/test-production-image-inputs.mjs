import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parse} from 'acorn';
import sharp from 'sharp';
import {produceDocument} from '../lib/creative/production.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';

const root=path.resolve(import.meta.dirname,'..');

test('low-confidence observation retry delivers pixels and observation schema to the provider',async t=>{
  const outputDir=await fs.mkdtemp(path.join(os.tmpdir(),'production-images-'));
  t.after(()=>fs.rm(outputDir,{recursive:true,force:true}));
  // Transport fixture only: no claim of a real product observation or render.
  const bytes=await sharp({create:{width:2,height:2,channels:3,background:'#336699'}}).png().toBuffer();
  const image={type:'input_image',image_url:'data:image/png;base64,'+bytes.toString('base64')};
  const asset={id:'video-fixture',kind:'video',sha256:'transport-fixture',compiledRef:'assets/test.mp4',mediaMetadata:{duration:24,width:1920,height:1080,hasAudio:false}};
  const request=normalizeCommerceRequest({projectId:'transport-test',message:'做24秒商品说明，不加声音',inferRequest:true,assets:[]});
  const brief={request:{name:'',price:'',cta:'',facts:[],output:{width:1920,height:1080,durationSeconds:24}},needsTranscription:false,needsNarration:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],constraints:[],gaps:[]};
  const row={assetId:asset.id,confidence:0.1,visibleContent:'transport fixture',uncertainty:'fixture',subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
  let calls=0;
  const stop=Object.assign(Error('stop after observation transport'),{code:'TEST_TRANSPORT_STOP'});
  const unusedMedia=()=>{throw Error('image transport test must not call media services');};
  const provider={speak:unusedMedia,transcribe:unusedMedia,speechVoiceCatalog:unusedMedia,structured:async(_prompt,input,schema)=>{
    calls++;
    if(calls===1)return {result:brief};
    if(calls===2||calls===3){
      assert.equal(schema.type,'object','R2 must receive a JSON schema, not image options');
      assert(schema.properties.observations);
      assert.deepEqual(input[0].content.filter(item=>item.type==='input_image'),[image],'R2 retry must carry the actual image bytes');
      return {result:{observations:[{...row,confidence:calls===2?0.1:0.8}],candidates:[],inspectRanges:[],gaps:[]}};
    }
    throw stop;
  }};
  const io={catalog:{snapshot:{commit:'transport-test'},context:async()=>({text:'test',records:[]}),candidates:()=>[]},collectEvidence:async()=>({records:[{assetId:asset.id,samples:[{time:0,file:'fixture.png'}]}],inputs:[{type:'input_text',text:'video-fixture at 0 seconds'},image]})};
  await assert.rejects(produceDocument(request,[asset],{root,outputDir,provider,io}),{code:stop.code});
  assert.equal(calls,4);
  const receipts=await fs.readdir(path.join(outputDir,'receipts'));
  const observations=await Promise.all(receipts.filter(file=>file.endsWith('-R2.json')).map(file=>fs.readFile(path.join(outputDir,'receipts',file),'utf8').then(JSON.parse)));
  assert.equal(observations.length,2);
  assert(observations.every(receipt=>receipt.status==='completed'&&receipt.imageCount===1));
  assert.deepEqual(observations[0].imageHashes,observations[1].imageHashes);
});

test('opening comparison and all image-bearing ask calls keep media in the options argument',async()=>{
  const source=await fs.readFile(path.join(root,'lib/creative/production.mjs'),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),calls=[];
  function walk(node){
    if(!node||typeof node!=='object')return;
    if(node.type==='CallExpression'&&node.callee?.name==='ask')calls.push(node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
  }
  walk(ast);
  const properties=node=>node?.type==='ObjectExpression'?node.properties:[];
  for(const call of calls){
    assert(!properties(call.arguments[3]).some(p=>['images','extra','resources'].includes(p.key?.name)),`media/options passed as schema at offset ${call.start}`);
  }
  const comparison=calls.find(call=>properties(call.arguments[2]).some(p=>p.key?.name==='phase'&&p.value?.value==='opening-direction-comparison'));
  assert(comparison,'real opening comparison call must exist');
  assert.equal(comparison.arguments[3]?.name,'openingComparisonSchema');
  assert(properties(comparison.arguments[4]).some(p=>p.key?.name==='images'),'opening comparison must pass candidate pixels');
});
