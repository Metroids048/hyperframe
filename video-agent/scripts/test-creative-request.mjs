import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan,solvePlannedDurations} from '../lib/creative/model-director.mjs';
function plan(){return {inferredRequest:{name:'短片',cta:'',price:'',facts:[],output:{width:1080,height:1080,durationSeconds:8}},design:{background:'#FAF8F3',foreground:'#12213A',panel:'#FFFFFF',accent:'#235AFF',accentContrast:'#FFFFFF'},scenes:[{purpose:'展示',effect:'title-reveal',weight:1,reason:'输入要求',media:[],text:[{role:'title',text:'一个想法',factRefs:[]}]}],audio:[],observations:[],omitted:[]};}
test('a text-only request needs no product, duration, aspect or style fields',()=>{
 const request=normalizeCommerceRequest({message:'8秒方形，只写“一个想法”。',inferRequest:true});
 assert.equal(request.creativeMode,'text');assert.equal(request.product.price,null);assert.equal(request.product.cta,'');
 const doc=documentFromModelPlan(request,[],plan());assert.equal(doc.durationFrames,240);assert.equal(doc.output.width,doc.output.height);assert.deepEqual(doc.audioGraph,[]);
});
test('inferred product claims require literal user evidence',()=>{
 const request=normalizeCommerceRequest({message:'展示这个瓶子。',inferRequest:true});
 const price=plan();price.inferredRequest.price='¥199';assert.throws(()=>documentFromModelPlan(request,[],price),e=>e.code==='UNKNOWN_FACT');
 const feature=plan();feature.inferredRequest.facts=[{text:'保温12小时',userQuote:'保温12小时'}];assert.throws(()=>documentFromModelPlan(request,[],feature),e=>e.code==='UNKNOWN_FACT');
});
test('natural-language user facts retain the exact provenance',()=>{
 const message='商品是玻璃瓶。卖点为可重复使用。演示价¥199，结尾“带走它”。',request=normalizeCommerceRequest({message,inferRequest:true}),p=plan();p.inferredRequest.facts=[{text:'可重复使用',userQuote:'卖点为可重复使用'}];p.inferredRequest.cta='带走它';
 const doc=documentFromModelPlan(request,[],p);assert.equal(doc.brief.facts[0].sourceRef,'卖点为可重复使用');assert.equal(doc.brief.cta,'带走它');
});

test('explicit source and music boundaries retain exact frames instead of weight redistribution',()=>{
 const scenes=[4,3,6,4,5,3].map(durationSeconds=>({durationSeconds,weight:durationSeconds}));
 assert.deepEqual(solvePlannedDurations(750,scenes),[120,90,180,120,150,90]);
 assert.deepEqual(solvePlannedDurations(300,[{durationSeconds:2,weight:1},{durationSeconds:null,weight:1},{durationSeconds:3,weight:1}]),[60,150,90]);
 assert.deepEqual(solvePlannedDurations(300,[{durationSeconds:4,weight:1},{durationSeconds:6.3,weight:1}],9),[120,189]);
 assert.throws(()=>solvePlannedDurations(300,[{durationSeconds:11,weight:1}]),e=>e.code==='INVALID_SCENE_TIME');
 assert.throws(()=>solvePlannedDurations(300,[{durationSeconds:-1,weight:1},{durationSeconds:null,weight:1}]),e=>e.code==='INVALID_SCENE_TIME');
});
