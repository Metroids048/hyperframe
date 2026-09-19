import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {OpenClawStageProvider} from '../lib/openclaw/openclaw-stage-provider.mjs';
import {createCommerceAgentBridge} from '../lib/openclaw/commerce-agent-bridge.mjs';

// Validate against the actual pinned package, not a hand-written protocol mock.
const packageRoot=path.resolve(process.argv[2]||process.env.OPENCLAW_PACKAGE_ROOT||'node_modules/openclaw');
const pkg=JSON.parse(await fs.readFile(path.join(packageRoot,'package.json'),'utf8'));
assert.equal(pkg.version,'2026.6.11');
const dist=path.join(packageRoot,'dist');
const candidates=(await fs.readdir(dist)).filter(name=>/^openresponses-http-.*\.js$/.test(name));
assert.equal(candidates.length,1,'locate the exact installed HTTP implementation');
const source=await fs.readFile(path.join(dist,candidates[0]),'utf8');
const start=source.indexOf('const InputTextContentPartSchema =');
const end=source.indexOf('const ResponseStatusSchema =');
assert.ok(start>0&&end>start);
const imports=source.split('\n').filter(line=>line.startsWith('import ')&&(/from "\.\/schemas-/.test(line)||/as ZodIssueCode/.test(line))).map(line=>line.replace(/"\.\/([^"]+)"/,(_,file)=>JSON.stringify(pathToFileURL(path.join(dist,file)).href))).join('\n');
assert.ok(imports.includes('ZodIssueCode'));
const moduleText=imports+'\n'+source.slice(start,end)+'\nexport {CreateResponseBodySchema};';
const {CreateResponseBodySchema}=await import('data:text/javascript;base64,'+Buffer.from(moduleText).toString('base64'));
const validate=body=>{const parsed=CreateResponseBodySchema.safeParse(body);assert.ok(parsed.success,JSON.stringify(parsed.error?.issues));};
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
let stageRequest,controlRequest;
const stage=new OpenClawStageProvider({token:'test-only',fetchImpl:async(_url,options)=>{
 stageRequest=JSON.parse(options.body);validate(stageRequest);
 return {ok:true,json:async()=>({output:[{type:'function_call',name:'return_stage_result',arguments:'{"ok":true}'}]})};
}});
await stage.structured('check image',[{role:'user',content:[{type:'input_text',text:'describe'},{type:'input_image',image_url:'data:image/png;base64,AA=='}]}],schema);
const bridge=createCommerceAgentBridge({workspaceId:'test',mode:'openclaw',token:'test-only',legacyDispatch:()=>assert.fail('no legacy dispatch'),projectView:p=>p,authorizationStore:{issue:async()=>({authorizationId:'test'}),get:async()=>null},operationJournal:async()=>({operations:{}}),fetchImpl:async(_url,options)=>{
 controlRequest=JSON.parse(options.body);validate(controlRequest);
 return {ok:true,json:async()=>({output:[{type:'function_call',name:'return_control_result',arguments:JSON.stringify({status:'read_only',tool:'commerce_project_get',operationId:null,summary:'checked'})}]})};
}});
await bridge.dispatchMessage({id:'wire-test',currentRevisionId:null},{idempotencyKey:'wire-message-0000001',message:'show current state',baseRevisionId:null});
// Demonstrate that the previous request shapes really fail this target version.
const oldStage={model:'openclaw/commerce-stage',input:[{role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,AA=='}]}],text:{format:{type:'json_schema',schema}}};
assert.equal(CreateResponseBodySchema.safeParse(oldStage).success,false);
const oldControl=structuredClone(controlRequest);delete oldControl.input[0].type;
assert.equal(CreateResponseBodySchema.safeParse(oldControl).success,false);
console.log(JSON.stringify({status:'pass',version:pkg.version,source:candidates[0],sourceSha256:createHash('sha256').update(source).digest('hex'),checks:['stage request accepted','control request accepted','old stage rejected','old control rejected'],scope:'real installed Gateway schema; model responses are fixtures, no model or media request'},null,2));
