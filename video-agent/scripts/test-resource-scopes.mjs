import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceRequests,resolveResourceTargets,applyRequestedTransitions,HyperFramesResourcePlanner,bindTransitionResourceScopes,planExactTransitionResourceEdit,validateResourceScopeOperations} from '../lib/creative/resource-catalog.mjs';
import {planCreativeEdit} from '../lib/creative/model-edit.mjs';
import {lockScope} from '../lib/creative/locks.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {createNativeDocument} from '../lib/creative/document.mjs';
const targets=text=>resolveResourceTargets(resourceRequests(text),4);
test('editing an existing transition retains its identity rather than replacing it with a derived ID',()=>{
 const scenes=['a','b'].map(id=>({id,effect:'title-reveal',purpose:'identity regression',startFrame:0,durationFrames:60}));
 const document=createNativeDocument({projectId:'scope-id-test',output:{width:640,height:360},brief:{name:'test',facts:[]},design:{background:'#101418',foreground:'#FFFFFF',accent:'#55EEAA',panel:'#151A20',accentContrast:'#101418',fontFamily:'Arial',transition:'dissolve-transition'},assets:[],scenes,nodes:scenes.map(s=>({id:'n-'+s.id,sceneId:s.id,kind:'text',semanticRole:'title',anchor:'scene-local',localStartFrame:0,localDurationFrames:60,durationFrames:60,params:{text:s.id}})),transitions:[{id:'existing-custom-cut-id',fromSceneId:'a',toSceneId:'b',effect:'dissolve-transition',durationFrames:9}]});
 const next=applyDocumentPatch(document,[{type:'set_transition',fromSceneId:'a',toSceneId:'b',effect:'chromatic-split',durationFrames:9}],{});
 assert.equal(next.transitions[0].id,document.transitions[0].id);assert.deepEqual(next.nodes,document.nodes);assert.equal(next.durationFrames,document.durationFrames);
});
for(const [text,include] of [['最后一处用色散',[3]],['倒数第二处用色散',[2]],['第二、第三处用色散',[1,2]],['第二、三处用色散',[1,2]],['第二，第三处用色散',[1,2]],['第2至第4处用色散',[1,2,3]],['第一处和倒数第二处用色散',[0,2]]])test(text,()=>assert.deepEqual(targets(text),{include,exclude:[]}));
test('unresolved local scope and out-of-range relative positions never widen',()=>{
 for(const text of ['第一二处用色散','第十二三至第十四处用色散','某一处用色散','中间一处用色散','只在指定位置用色散','最后第五处用色散','倒数第五处用色散','第4至第2处用色散','第二处和某一处用色散'])assert.throws(()=>targets(text),{code:'RESOURCE_SCOPE'});
 assert.deepEqual(resourceRequests('标题写“最后一处用色散”'),[]);
 assert.deepEqual(resourceRequests('“最后一处用色散”'),[]);
 assert.deepEqual(resourceRequests('把标题改成“结构”，色散转场不变'),[]);
 assert.deepEqual(targets('最后一处不要色散'),{include:[],exclude:[3]});
});
test('scope bindings use timeline order and stable IDs, including per-resource exclusions',async()=>{
 const doc={revisionId:'r',scenes:Array.from({length:5},(_,i)=>({id:'s'+i})),nodes:[],captions:[],transitions:Array.from({length:4},(_,i)=>({id:'t'+i,fromSceneId:'s'+i,toSceneId:'s'+(i+1),effect:'dissolve-transition',durationFrames:9}))};
 doc.transitions.reverse();const scopes=bindTransitionResourceScopes(doc,resourceRequests('最后一处用色散'));
 assert.equal(scopes[0].include[0].transitionId,'t3');assert.equal(scopes[0].preserve.length,3);
 const plan=await planCreativeEdit(doc,'最后一处用色散',{provider:{structured(){throw Error('exact scope must not call model');}}});assert.equal(plan.operations.length,1);assert.equal(plan.operations[0].fromSceneId,'s3');
 assert.throws(()=>validateResourceScopeOperations(doc,[{...plan.operations[0],fromSceneId:'s0',toSceneId:'s1'}],scopes),{code:'RESOURCE_SCOPE'});
 assert.throws(()=>validateResourceScopeOperations({...doc,revisionId:'new'},plan.operations,scopes),{code:'WORKFLOW_BASE_CONFLICT'});
 const others=bindTransitionResourceScopes(doc,resourceRequests('第一处用色散，第二处不用资源 alternate-transition',[{name:'alternate-transition'}]));assert.equal(others.length,2);assert.equal(others[1].exclude[0].transitionId,'t1');
 const prior=lockScope(doc,'s3','layout');const changed=structuredClone(doc);changed.transitions[0].effect='chromatic-split';assert.notEqual(lockScope(changed,'s3','layout'),prior);
 const locked=structuredClone(doc);locked.scenes[3].locks={layout:true};const untouched=structuredClone(locked);assert.throws(()=>applyDocumentPatch(locked,plan.operations,{}),{code:'LOCK_CONFLICT'});assert.deepEqual(locked,untouched);
 const local=planExactTransitionResourceEdit(doc,'第二、第三处用色散',bindTransitionResourceScopes(doc,resourceRequests('第二、第三处用色散')));assert.deepEqual(local.operations.map(o=>o.fromSceneId),['s1','s2']);
 assert.equal(planExactTransitionResourceEdit(doc,'最后一处用色散并把标题改成新品',scopes),null);
});
test('cross-turn exclusions change only previously enabled targets and preserve duration',()=>{
 const doc={revisionId:'second',transitions:Array.from({length:4},(_,i)=>({id:'t'+i,fromSceneId:'s'+i,toSceneId:'s'+(i+1),effect:i===0||i===2?'chromatic-split':'dissolve-transition',durationFrames:9}))};
 const scopes=bindTransitionResourceScopes(doc,resourceRequests('只在第二处用色散，其余不要'));const plan=planExactTransitionResourceEdit(doc,'只在第二处用色散，其余不要',scopes);
 assert.deepEqual(scopes[0].include.map(r=>r.transitionId),['t1']);assert.deepEqual(scopes[0].exclude.map(r=>r.transitionId),['t0','t2','t3']);
 assert.deepEqual(plan.operations.map(o=>[o.fromSceneId,o.effect,o.durationFrames]),[['s1','chromatic-split',9],['s0','dissolve-transition',9],['s2','dissolve-transition',9]]);
});

test('ordinary media words do not invent exact resource requests; explicit identity stays binding',()=>{
 const resources=[{id:'registry:video',name:'video'},{name:'audio'},{name:'image'},{name:'text'},{name:'mask-reveal'}];
 assert.deepEqual(resourceRequests('Fit full landscape video in portrait canvas with editable step text outside footage',resources),[]);
 for(const input of ['指定资源 video','使用「video」','use video component','use registry:video'])assert.equal(resourceRequests(input,resources)[0]?.canonicalId,'video');
 assert.equal(resourceRequests('不用资源 video',resources)[0].negated,true);
 assert.deepEqual(resourceRequests({message:'画面外放步骤文字 video mask-reveal',explicitText:'画面外放步骤文字'},resources),[]);
 assert.equal(resourceRequests({message:'请用mask-reveal translated text',explicitText:'请用mask-reveal'},resources)[0].canonicalId,'mask-reveal');
});

test('compatible executor below reference shortlist is considered before truncation',()=>{
 const resources=Array.from({length:25},(_,i)=>({id:'reference-'+i,name:'reference-'+i,canonicalId:i===24?'text-adapter':'reference-'+i,score:30-i}));
 const catalog={resources,data:{contentHash:'test'},search:(_,{limit})=>resources.slice(0,limit)};
 const adapter={id:'text-adapter',canonicalId:'text-adapter',eligible:true,compatible:true,runtime:'0.8.33',motionRisk:'low'};
 const result=new HyperFramesResourcePlanner(catalog,[adapter]).plan({message:'editable step labels',actionProtected:true});
 assert.equal(result.status,'resolved');assert.equal(result.selected[0].id,'text-adapter');assert(result.alternatives.some(r=>r.id==='reference-24'));assert(result.alternatives.length<=21);
 assert.equal(new HyperFramesResourcePlanner(catalog,[{...adapter,compatible:false}]).plan({message:'editable step labels'}).status,'unresolved');
});
test('S02 real request: generic HyperFrames use does not require a skill or frames executor',()=>{
 const catalog=[{name:'hyperframes',type:'skills'},{name:'frames',type:'docs'},{name:'mask-reveal',type:'registryBlocks'}];
 assert.deepEqual(resourceRequests('自主选材，应用合适的本地HyperFrames资源',catalog),[]);
 assert.deepEqual(resourceRequests('应用 mask reveal，保留商品主体',catalog).map(r=>r.canonicalId),['mask-reveal']);
 assert.deepEqual(resourceRequests('标题写 HyperFrames',catalog),[]);
});
for(const text of ['只在第二处用色散，其余不用','只在第二处用色散，其余不要色散'])test(text,()=>assert.deepEqual(targets(text),{include:[1],exclude:[0,2,3]}));
for(const text of ['第一处和第三处用色散','色散用在第三处和第一处','第一处用色散，第三处也用色散'])test(text,()=>assert.deepEqual(targets(text),{include:[0,2],exclude:[]}));
test('scoped cancellation preserves another use of the same resource',()=>assert.deepEqual(targets('第一处和第三处用色散，第三处取消，第一处保留'),{include:[0],exclude:[2]}));
test('duplicate clauses are idempotent',()=>assert.deepEqual(targets('第一处用色散，第一处用色散'),targets('第一处用色散')));
test('global withdrawal overrides earlier global request',()=>assert.deepEqual(targets('使用色散，不要色散'),{include:[],exclude:[0,1,2,3]}));
test('missing cut fails without mutating any transition',()=>{
 const doc={revisionId:'r',transitions:[{fromSceneId:'s1',toSceneId:'s2',effect:'dissolve-transition',durationFrames:9}]},before=structuredClone(doc);
 assert.throws(()=>applyRequestedTransitions(doc,'第一处和第三处用色散'),{code:'RESOURCE_SCOPE'});assert.deepEqual(doc,before);
});
test('actual binding uses current scene boundaries and keeps unrelated transitions',()=>{
 const doc={revisionId:'r',transitions:Array.from({length:4},(_,i)=>({fromSceneId:'s'+i,toSceneId:'s'+(i+1),effect:'dissolve-transition',durationFrames:9}))};
 applyRequestedTransitions(doc,'第一处和第三处用色散');assert.deepEqual(doc.transitions.map(t=>t.effect),['chromatic-split','dissolve-transition','chromatic-split','dissolve-transition']);assert.equal(doc.resourceBindings[1].fromSceneId,'s2');assert.equal(doc.resourceBindings[1].baseRevisionId,'r');
});
