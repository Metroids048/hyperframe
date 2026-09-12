import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {validateBrief,storyboard,validateStoryboard,compose} from '../lib/workflow.mjs';
const results=[],pass=(name,fn)=>{fn();results.push(name);console.log('PASS '+name);};
const html=await fs.readFile('web/index.html','utf8');
const idList=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
pass('唯一入口与可选信息结构',()=>{assert.equal(new Set(idList).size,idList.length);assert(!html.includes('required'));assert(!html.includes('高级选项'));assert(!html.includes('preview-plan'));assert(html.indexOf('id="images"')<html.indexOf('id="plan-button"'));assert(html.indexOf('id="description"')<html.indexOf('id="images"'));});
// In-memory UI stand-in: run actual event handlers without a browser or visual inspection.
class Element{
 constructor(tag,attrs={}){this.tag=tag;this.attrs=attrs;this.children=[];this.listeners={};this.dataset={};this.hidden='hidden' in attrs;this.disabled='disabled' in attrs;this.value=attrs.value||'';this.name=attrs.name;this.className=attrs.class||'';this.classList={toggle(){},add(){},remove(){}};for(const [k,v] of Object.entries(attrs)){if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]=v;this[k]=v;} }
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this[k]??this.attrs[k];}addEventListener(n,f){this.listeners[n]=f;}focus(){}scrollIntoView(){}pause(){}load(){}play(){return Promise.resolve();}
 querySelectorAll(selector){const found=[];const match=e=>selector==='input:not([type])'?e.tag==='input'&&!e.attrs.type:selector.startsWith('.')?e.className.split(' ').includes(selector.slice(1)):selector.startsWith('[data-')?selector.slice(6,-1).replace(/-([a-z])/g,(_,x)=>x.toUpperCase()) in e.dataset:e.tag===selector;const visit=e=>{for(const c of e.children){if(!(c instanceof Element))continue;if(match(c))found.push(c);visit(c);}};visit(this);return found;}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
const root=new Element('root'),stack=[root],ids={};
for(const m of html.matchAll(/<\/?([\w-]+)\b([^>]*)>/g)){const [raw,tag,tail]=m;if(raw.startsWith('</')){if(stack.length>1)stack.pop();continue;}const attrs={};for(const a of tail.matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??true;const el=new Element(tag,attrs);stack.at(-1).append(el);if(attrs.id)ids[attrs.id]=el;if(!['meta','link','input','img','br','hr'].includes(tag))stack.push(el);}
const form=ids['brief-form'];form.elements=Object.fromEntries(root.querySelectorAll('input').filter(x=>x.name).map(x=>[x.name,x]));
for(const [id,value] of Object.entries({'setting-duration':'15','setting-aspect':'16:9','setting-quality':'720p','setting-theme':'fresh'}))ids[id].value=value;
const document={getElementById:id=>ids[id]||null,createElement:tag=>new Element(tag),querySelectorAll:s=>root.querySelectorAll(s),querySelector:s=>root.querySelector(s)};
const context=vm.createContext({document,window:{},fetch:(url,opts)=>fetch(new URL(url,'http://127.0.0.1:3020'),opts),AbortSignal,AbortController,FormData,URL,console,setTimeout:()=>0,clearTimeout(){}});
const code=await fs.readFile('web/app.js','utf8')+'\n'+await fs.readFile('web/experience.js','utf8');vm.runInContext(code,context);
await vm.runInContext('loadCatalog()',context);
await ids['edit-storyboard'].onclick();
pass('首页编辑入口创建可编辑副本',()=>{assert.equal(ids['panel-plan'].hidden,false);assert.equal(document.querySelectorAll('[data-scene-headline]').length,3);assert.equal(ids.confirm.hidden,false);});
const first=document.querySelectorAll('[data-scene-headline]')[0];first.value='让清爽，陪伴每一天';first.listeners.input();await ids['save-plan'].onclick();
pass('实际保存处理器持久化修改',()=>assert.equal(vm.runInContext('current.storyboard[0].headline',context),'让清爽，陪伴每一天'));
vm.runInContext('playCase(catalog[1])',context);await ids['tab-plan'].onclick();
pass('播放其他案例后分镜页可直接编辑',()=>{assert.equal(vm.runInContext('current.caseId',context),'morning');assert.equal(document.querySelectorAll('[data-scene-copy]').length,3);});
vm.runInContext('loadCase(catalog[0])',context);ids.description.value='给青柠气泡水制作一条简约的商品展示短片。';
await vm.runInContext('createFromInput(true)',context);
const p=vm.runInContext('current',context);
pass('描述与图片可直接生成，无需填品牌和三个卖点',()=>{assert(['queued','composing','checking','rendering','complete'].includes(p.status));assert.equal(p.brief.product,'青柠气泡水');assert.equal(p.brief.benefits.length,0);assert.equal(ids['form-error'].hidden,true);assert.equal(ids['plan-button'].disabled,false);});
pass('生成中的分镜只读且入口明确禁用',()=>{assert.equal(document.querySelectorAll('[data-scene-headline]').length,0);assert.equal(ids['edit-storyboard'].disabled,true);});
pass('缺失商品仅提示描述补充',()=>{assert.throws(()=>validateBrief({}),/商品名/);assert.equal(validateBrief({product:'保温杯'}).brand,'商品展示');});
for(const count of [0,1,3]){const b=validateBrief({product:'保温杯',benefits:['轻巧便携','简约外观','双层杯壁'].slice(0,count)});const dir='outputs/v5-compose-'+count;await fs.mkdir(dir+'/assets',{recursive:true});await compose(dir,b);const source=await fs.readFile(dir+'/index.html','utf8');pass(count+' 个卖点不会生成虚构填充行',()=>{assert.equal((source.match(/class="benefit"/g)||[]).length,count);assert(!source.includes('undefined'));});}
pass('分镜卖点长度约束继续生效',()=>assert.throws(()=>validateStoryboard(storyboard(validateBrief({product:'保温杯'})).map((s,i)=>({...s,copy:i===1?'一二三四五六七八九十一':s.copy})),validateBrief({product:'保温杯'}))));
await fs.writeFile('outputs/v5-tests-pending.json',JSON.stringify({projectId:p.id,results},null,2));console.log('RENDER '+p.id);

