import {createHash, randomUUID} from 'node:crypto';
function safeUpstream(value){return String(value??'').replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/(?:sk|key|token)[-_]?[a-z0-9_-]{8,}/gi,'[redacted]').slice(0,500);}
function fail(message, code='OPENCLAW_STAGE_BLOCKED', status=503,details={}){const e=new Error(safeUpstream(message));e.code=code;e.status=status;Object.assign(e,details);return e;}
function sha(value){return createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');}
function invalid(path,message){throw fail(path+' '+message,'OPENCLAW_STAGE_SCHEMA_INVALID',502);}
function matches(value,schema){try{check(value,schema);return true;}catch(error){if(error.code==='OPENCLAW_STAGE_SCHEMA_INVALID')return false;throw error;}}
function check(value,schema,path='result'){
 if(!schema)return;
 if(schema.const!==undefined&&JSON.stringify(value)!==JSON.stringify(schema.const))invalid(path,'does not match const');
 if(schema.enum&&!schema.enum.some(item=>JSON.stringify(item)===JSON.stringify(value)))invalid(path,'is not an allowed value');
 if(schema.anyOf&&!schema.anyOf.some(candidate=>matches(value,candidate)))invalid(path,'does not match anyOf');
 if(schema.oneOf&&schema.oneOf.filter(candidate=>matches(value,candidate)).length!==1)invalid(path,'does not match exactly one oneOf schema');
 const types=Array.isArray(schema.type)?schema.type:[schema.type].filter(Boolean);
 if(types.length>1){if(!types.some(type=>matches(value,{...schema,type,anyOf:undefined,oneOf:undefined})))invalid(path,'has an invalid type');return;}
 if(schema.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))invalid(path,'must be object');
  for(const key of schema.required||[])if(!(key in value))invalid(path+'.'+key,'is missing');
  const properties=schema.properties||{};
  if(schema.additionalProperties===false)for(const key of Object.keys(value))if(!(key in properties))invalid(path+'.'+key,'is not allowed');
  for(const [key,sub] of Object.entries(properties))if(key in value)check(value[key],sub,path+'.'+key);
 }else if(schema.type==='array'){
  if(!Array.isArray(value))invalid(path,'must be array');
  if(schema.minItems!=null&&value.length<schema.minItems)invalid(path,'has too few items');
  if(schema.maxItems!=null&&value.length>schema.maxItems)invalid(path,'has too many items');
  if(schema.items)value.forEach((item,index)=>check(item,schema.items,path+'['+index+']'));
 }else if(schema.type==='string'){
  if(typeof value!=='string')invalid(path,'must be string');
  if(schema.minLength!=null&&value.length<schema.minLength)invalid(path,'is too short');
  if(schema.maxLength!=null&&value.length>schema.maxLength)invalid(path,'is too long');
  if(schema.pattern&&!(new RegExp(schema.pattern)).test(value))invalid(path,'does not match pattern');
 }else if(schema.type==='number'){
  if(typeof value!=='number'||!Number.isFinite(value))invalid(path,'must be finite number');
 }else if(schema.type==='integer'){
  if(!Number.isInteger(value))invalid(path,'must be integer');
 }else if(schema.type==='boolean'&&typeof value!=='boolean')invalid(path,'must be boolean');
 else if(schema.type==='null'&&value!==null)invalid(path,'must be null');
 if(typeof value==='number'){
  if(schema.minimum!=null&&value<schema.minimum)invalid(path,'is below minimum');
  if(schema.maximum!=null&&value>schema.maximum)invalid(path,'is above maximum');
 }
}
function inspectImages(input,maxImageBytes){
 if(!Array.isArray(input))throw fail('stage input must be an array','OPENCLAW_STAGE_INPUT_INVALID',400);
 const images=[];
 for(const [messageIndex,message] of input.entries()){
  const content=message?.content;
  if(!Array.isArray(content))continue;
  for(const [contentIndex,item] of content.entries()){
   if(item?.type!=='input_image')continue;
   const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]*={0,2})$/.exec(item.image_url||'');
   if(!match||match[2].length%4!==0)throw fail('stage image must be a local PNG/JPEG data URL','OPENCLAW_STAGE_IMAGE_INVALID',400);
   const bytes=Buffer.from(match[2],'base64');
   if(!bytes.length||bytes.length>maxImageBytes)throw fail('stage image exceeds the configured size limit','OPENCLAW_STAGE_IMAGE_TOO_LARGE',413);
   images.push({ordinal:images.length,messageIndex,contentIndex,mime:'image/'+match[1],bytes:bytes.length,sha256:sha(bytes)});
  }
 }
 return images;
}
// OpenClaw 2026.6.11 uses typed message items and image.source, not image_url.
function gatewayInput(input){
 return input.map(message=>({type:'message',role:message.role,content:typeof message.content==='string'?message.content:message.content.map(item=>{
  if(item.type!=='input_image')return {...item};
  const [,mime,data]=/^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(item.image_url);
  return {type:'input_image',source:{type:'base64',media_type:mime,data}};
 })}));
}
function stageResult(body){
 const calls=(body?.output||[]).filter(item=>item?.type==='function_call');
 if(calls.length!==1||calls[0].name!=='return_stage_result')throw fail('stage must return exactly one return_stage_result call','OPENCLAW_STAGE_SCHEMA_INVALID',502);
 try{return JSON.parse(calls[0].arguments);}catch{throw fail('stage returned invalid result arguments','OPENCLAW_STAGE_SCHEMA_INVALID',502);}
}
export class OpenClawStageProvider {
 constructor({baseUrl=process.env.OPENCLAW_STAGE_URL||'http://127.0.0.1:18789/v1/responses',token=process.env.OPENCLAW_STAGE_TOKEN,model=process.env.OPENCLAW_STAGE_MODEL||'openclaw/commerce-stage',timeoutMs=Number(process.env.OPENCLAW_STAGE_TIMEOUT_MS||120000),maxImageBytes=Number(process.env.OPENCLAW_STAGE_MAX_IMAGE_BYTES||8*1024*1024),fetchImpl=globalThis.fetch,runId=randomUUID(),onReceipt,onInvocation}={}){
  Object.assign(this,{baseUrl,token,model,timeoutMs,maxImageBytes,fetchImpl,runId,onReceipt,onInvocation});
  this.recordsInvocations=true;
  this.reasoningEffort='configured';this.invocationCount=0;
  if(typeof fetchImpl!=='function')throw fail('fetch unavailable','OPENCLAW_STAGE_RUNTIME_INVALID',500);
 }
 status(){return {configured:Boolean(this.token&&this.model),provider:'OpenClaw',model:this.model,voiceModel:null,auth:'server-configured Gateway',checkingLogin:false};}
 async structured(instructions,input,schema,signal){
  if(!this.token||!this.model)throw fail('OpenClaw stage token/model missing');
  if(this.model!=='openclaw/commerce-stage')throw fail('stage must target the isolated commerce-stage Agent','OPENCLAW_STAGE_TARGET_INVALID',400);
  if(signal?.aborted)throw fail('cancelled','OPENCLAW_STAGE_CANCELLED',409);
  const images=inspectImages(input,this.maxImageBytes),controller=new AbortController();
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  const invocation=++this.invocationCount;
  // A provider serves several production stages; none may inherit another stage's session.
  const user='commerce-stage:'+sha({runId:this.runId,invocation});
  const baseInstructions=String(instructions),tool=[{type:'function',name:'return_stage_result',description:'Return the structured stage result; no side effects.',parameters:schema,strict:true}];
  const request={model:this.model,instructions:baseInstructions,input:gatewayInput(input),tools:tool,tool_choice:{type:'function',name:'return_stage_result'},user,stream:false};
  const receipt={runId:this.runId,stage:'commerce-stage',invocation,attempt:1,model:this.model,requestHash:sha(request),sessionHash:sha(user),images,usage:'unknown'};
  try{
   await this.onInvocation?.(receipt);
   let body,response,attempt=0;
   while(true){
    attempt++;
    const current={...request,instructions:attempt===1?baseInstructions:baseInstructions+'\n\n契约重试：必须只调用一次 return_stage_result，并将完整结构化结果作为该调用参数返回；不要输出普通文本。'};
    response=await this.fetchImpl(this.baseUrl,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body:JSON.stringify(current),signal:controller.signal});
    try{body=await response.json();}catch{throw fail('stage returned invalid JSON','OPENCLAW_STAGE_RESPONSE_INVALID',502);}
    if(response.ok)break;
    const upstream=body?.error?.message||body?.error||body?.message||'';
    const retryable=attempt===1&&/tool_choice|required|return_stage_result|did not produce/i.test(String(upstream));
    if(retryable)continue;
    const code=response.status===401||response.status===403?'OPENCLAW_STAGE_AUTH':response.status===429?'OPENCLAW_STAGE_RATE_LIMIT':'OPENCLAW_STAGE_HTTP_ERROR';const requestId=response.headers.get('x-request-id')||response.headers.get('request-id')||null;const retryAfter=response.headers.get('retry-after')||null;throw fail(upstream||'stage HTTP '+response.status,code,response.status,{httpStatus:response.status,requestId:requestId?safeUpstream(requestId):null,retryAfter:retryAfter?safeUpstream(retryAfter):null,provider:this.model});
   }
   const result=stageResult(body);check(result,schema);
   receipt.usage=body.usage||'unknown';await this.onReceipt?.({...receipt,status:'pass'});
   return {result,usage:body.usage||null,model:this.model,invocation:receipt};
  }catch(error){
   if(signal?.aborted||error.name==='AbortError')error=fail(signal?.aborted?'cancelled':'timeout',signal?.aborted?'OPENCLAW_STAGE_CANCELLED':'OPENCLAW_STAGE_TIMEOUT',409);
   await this.onReceipt?.({...receipt,status:'blocked',errorCode:error.code||'OPENCLAW_STAGE_ERROR'});throw error;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 async close(){}
}
export {fail as openclawStageError};
