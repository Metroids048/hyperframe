import fs from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
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
const context=vm.createContext({document,window:{},fetch:(url,opts)=>fetch(new URL(url,'http://127.0.0.1:3020'),opts),AbortSignal,AbortController,FormData,URL,crypto:{randomUUID},console,setTimeout:()=>0,clearTimeout(){}});
const code=await fs.readFile('web/app.js','utf8')+'\n'+await fs.readFile('web/experience.js','utf8')+'\n'+await fs.readFile('web/shots.js','utf8');vm.runInContext(code,context);
await vm.runInContext('loadCatalog()',context);

await ids['edit-storyboard'].onclick();
const initial=vm.runInContext('current.storyboard.length',context);
pass('多镜头编辑入口与时长控件可用',()=>{assert.equal(initial,5);assert.equal(document.querySelectorAll('[data-shot-duration]').length,initial);});
const head=document.querySelectorAll('[data-scene-headline]')[0];head.value='清爽，按时登场';head.listeners.input();const duration=document.querySelectorAll('[data-shot-duration]')[0];duration.value='7';duration.listeners.input();
ids['add-shot'].onclick();pass('添加镜头保留已编辑文案和时长',()=>{assert.equal(document.querySelectorAll('[data-shot-duration]').length,6);assert.equal(document.querySelectorAll('[data-scene-headline]')[0].value,'清爽，按时登场');});
const row=document.querySelectorAll('.shot-actions')[0];row.children[1].onclick();
pass('前后移动保留稳定镜头标识',()=>assert.equal(vm.runInContext('draftShots[1].headline',context),'清爽，按时登场'));
await ids['save-plan'].onclick();
pass('多镜头实际保存处理器更新时长与版本',()=>{assert.equal(vm.runInContext('current.actualSettings.duration',context),35);assert.equal(vm.runInContext('current.storyboard.length',context),6);assert.equal(ids['result-error'].hidden,true);});
const remove=document.querySelectorAll('.shot-actions')[0].children[2];remove.onclick();await ids['save-plan'].onclick();
pass('删除镜头后保存重排时间轴',()=>{assert.equal(vm.runInContext('current.storyboard.length',context),5);assert.equal(vm.runInContext('current.storyboard[0].start',context),0);});
await fs.writeFile('outputs/v6-ui-tests.json',JSON.stringify({passed:results.length,results,projectId:vm.runInContext('current.id',context)},null,2));
console.log('PASS TOTAL '+results.length);
