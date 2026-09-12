import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {CloudProvider,editSchema} from '../lib/edit/provider.mjs';
const fetchOriginal=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;
const provider=new CloudProvider();let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++;}
try{
delete process.env.OPENAI_API_KEY;
await test('无凭据时不发送任何网络请求',async()=>{let calls=0;globalThis.fetch=async()=>{calls++;throw Error();};await assert.rejects(()=>provider.speak('测试','marin',''),/尚未配置/);assert.equal(calls,0);});
process.env.OPENAI_API_KEY='test-fixture-not-a-real-key';
await test('结构化规划请求使用真实模型接口契约',async()=>{globalThis.fetch=async(url,options)=>{assert(url.endsWith('/responses'));const b=JSON.parse(options.body);assert.equal(b.text.format.strict,true);assert.deepEqual(b.text.format.schema,editSchema);assert.equal(b.store,false);return Response.json({model:'test-fixture',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'加入字幕',clarification:null,operations:[{type:'caption_add',start:150,end:240,text:'新品上市',position:'bottom'}]})}]}]});};const r=await provider.structured('测试',[],editSchema);assert.equal(r.result.operations[0].end,240);assert.equal(r.model,'test-fixture');});
await test('拒绝被截断的模型输出',async()=>{globalThis.fetch=async()=>Response.json({status:'incomplete',output:[]});await assert.rejects(()=>provider.structured('',[],editSchema),/完整/);});
await test('鉴权失败不会泄露服务错误中的敏感信息',async()=>{globalThis.fetch=async()=>Response.json({error:{code:'invalid_api_key',message:'test-fixture-not-a-real-key'}},{status:401});await assert.rejects(()=>provider.structured('',[],editSchema),e=>e.message.includes('invalid_api_key')&&!e.message.includes('test-fixture-not-a-real-key'));});
await test('网络失败有明确结束状态',async()=>{globalThis.fetch=async()=>{throw Error('Network timeout');};await assert.rejects(()=>provider.structured('',[],editSchema),/连接失败或超时/);});
await test('中文配音保留逐字台词和声音配置',async()=>{globalThis.fetch=async(url,options)=>{assert(url.endsWith('/audio/speech'));const b=JSON.parse(options.body);assert.equal(b.input,'欢迎体验我们的新品');assert.equal(b.voice,'marin');assert.equal(b.model,'gpt-4o-mini-tts');assert.equal(b.response_format,'wav');return new Response(new Uint8Array([82,73,70,70]));};assert.equal((await provider.speak('欢迎体验我们的新品','marin','自然普通话')).toString(),'RIFF');});
await test('Whisper 转写要求词级时间戳并保留中文',async()=>{const f=path.join(ROOT,'outputs/edit-provider-fixture.mp3');await fs.writeFile(f,'test media fixture');globalThis.fetch=async(url,o)=>{assert(url.endsWith('/audio/transcriptions'));assert(o.body instanceof FormData);assert.equal(o.body.get('model'),'whisper-1');assert.deepEqual(o.body.getAll('timestamp_granularities[]'),['word','segment']);return Response.json({text:'你好',words:[{word:'你好',start:0.2,end:0.8}],segments:[{text:'你好',start:0.2,end:0.8}],language:'chinese'});};const r=await provider.transcribe(f);assert.equal(r.words[0].text,'你好');assert.equal(r.words[0].start,0.2);});
console.log(`${count} provider contract tests passed (mock transport; not live model validation)`);
}finally{globalThis.fetch=fetchOriginal;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}
