import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),put=(p,s)=>fs.writeFileSync(p,s);
let s=read('web/index.html');
const description=s.slice(s.indexOf('<label for="description">'),s.indexOf('<div class="generation-actions">'));
const uploadStart=s.indexOf('<fieldset><legend>添加商品图片'),uploadEnd=s.indexOf('</fieldset>',uploadStart)+11;
const upload=s.slice(uploadStart,uploadEnd);
const extraStart=s.indexOf('<details id="extracted">'),extraEnd=s.indexOf('</details>',extraStart)+10;
let extra=s.slice(extraStart,extraEnd).replaceAll(' <em>*</em>','').replaceAll(' required','').replace('补充或调整商品信息','补充信息').replace('核心卖点','卖点（按需填写）');
const copyStart=s.indexOf('<details><summary>更多文案'),copyEnd=s.indexOf('</details>',copyStart)+10;
extra=extra.replace('</div></details>',s.slice(copyStart,copyEnd).replace('<details><summary>更多文案选项 <span>可选</span></summary>','').replace('</details>','')+'</div></details>');
const settingStart=s.indexOf('<details open><summary>视频设置'),settingEnd=s.indexOf('</details>',settingStart)+10;
const settings=s.slice(settingStart,settingEnd).replace('<details open>','<details>').replace('方案预设','15 秒 · 横屏 · 720p');
const formStart=s.indexOf('<form id="brief-form"'),formEnd=s.indexOf('</form>',formStart)+7;
s=s.slice(0,formStart)+`<form id="brief-form" novalidate><section class="input-materials" aria-label="创作输入">${description}${upload}<div class="optimizer-row"><button type="button" id="optimize" class="text-button">优化描述 ✦</button><span id="optimizer-note" class="small muted">可选，直接生成也会自动整理</span></div></section>
${settings}<p id="settings-note" class="small muted">Demo 实际输出：15 秒 / 横屏 / 720p。其他规格暂存为需求。</p>
${extra}
<div id="form-error" class="error" role="alert" hidden></div><div class="generate-footer"><button id="plan-button" class="button primary full" type="submit">生成视频 →</button><p class="small muted">生成后可在右侧编辑分镜、下载成片</p></div>
</form>`+s.slice(formEnd);
s=s.replace('描述你的视频</h1>','创建视频</h1>').replace('写一段话，把商品与想法交给我们整理。','描述想法，添加商品素材。');
s=s.replace('>分镜方案</button>','>分镜文案</button>');
s=s.replace('三幕的标题','三幕的标题');
s=s.replace('<h3>编辑分镜文案</h3><p>点击标题或补充文案即可修改。修改后点击「保存并生成视频」；成片会保留为历史版本。</p>','<h3>分镜文案</h3><p id="plan-help">可以修改每幕的标题和文案，保存后重新生成。</p>');
s=s.replace('<div id="storyboard" class="storyboard"></div>','<div id="storyboard" class="storyboard"></div><div class="plan-actions"><button type="button" id="save-plan" class="button ghost" hidden>保存修改</button><button type="button" id="confirm" class="button primary" hidden>保存并生成视频</button><a id="download-plan" class="text-link" hidden>下载分镜</a></div>');
s=s.replace('<div class="actions"><button type="button" id="save-plan" class="button ghost" hidden>保存分镜修改</button><button type="button" id="confirm" class="button primary" hidden>确认并生成视频</button>', '<div class="actions"><button type="button" id="edit-storyboard" class="button ghost">编辑分镜</button>');
s=s.replace('<a id="download-plan" class="text-link" hidden>下载分镜</a></div>\r\n</div><section','</div>\r\n</div><section');
put('web/index.html',s);
s=read('web/app.js').replace("let catalog=[],selectedCaseId='qing',optimizedFor=null;","let catalog=[],selectedCaseId='qing',viewedCaseId='qing',optimizedFor=null;");
s=s.replace("function switchTab(name){tab=name;","function switchTab(name){tab=name;$('edit-storyboard').hidden=name==='plan';");
s=s.replace("$('save-plan').textContent='保存分镜修改';","$('save-plan').textContent='保存修改';");
s=s.replace("copy.title=i===1?'三个卖点，用 / 分隔，每项最多 10 字':'补充文案';","copy.placeholder=i===1?'可留空；最多三个卖点，用 / 分隔':'补充文案';copy.title=i===1?'最多三个卖点，每项最多 10 字':'补充文案';for(const el of [h,copy])el.addEventListener('input',()=>{$('save-plan').disabled=false;$('confirm').disabled=false;});");
s=s.replace("function display(p){current=p;","function display(p){current=p;$('edit-storyboard').disabled=!['awaiting_confirmation','failed','complete'].includes(p.status);$('save-plan').disabled=true;$('confirm').disabled=p.status==='complete';$('plan-help').textContent=['awaiting_confirmation','failed','complete'].includes(p.status)?'修改标题和文案后，点击「保存并生成视频」。原版本会保留。':'正在生成，完成后可修改文案并生成新版。';");
s=s.replace("$('confirm').textContent=done?'修改分镜并生成新版':'保存并生成视频';","$('confirm').textContent=done?'保存并生成新版':'保存并生成视频';");
s=s.replace("button.disabled=true;$('preview-plan').disabled=true;","button.disabled=true;").replace("button.disabled=false;$('preview-plan').disabled=false;","button.disabled=false;");
s=s.replace("if(!form.checkValidity()){revealExtraction();form.reportValidity();throw Error('还缺少部分商品信息，请在展开的选项中补充。');}","if(!readBrief().product.trim()){$('description').focus();throw Error('请在描述中告诉我们要展示什么商品，例如「商品是保温杯」。');}");
s=s.replace("$('preview-plan').onclick=()=>createFromInput(false);",'');
s=s.replace("$('open-studio').onclick=openStudio;$('view-plan').onclick=()=>switchTab('plan');","$('open-studio').onclick=openStudio;$('view-plan').onclick=beginEdit;$('edit-storyboard').onclick=beginEdit;");
s=s.replace("b.dataset.tab==='studio'?openStudio():switchTab(b.dataset.tab)","b.dataset.tab==='studio'?openStudio():b.dataset.tab==='plan'?beginEdit():switchTab(b.dataset.tab)");
// Remove duplicate input/sample handlers now owned by experience.js.
s=s.replace(/^\$\('sample'\)\.onclick=.*\r?\n/m,'').replace(/^\$\('edit'\)\.onclick=.*\r?\n/m,'');
const hook=s.indexOf('// Optional agent access');if(hook>=0)s=s.slice(0,hook); // No product-facing secondary input path.
put('web/app.js',s);
s=read('web/experience.js');const end=s.indexOf('function loadCase');
s=`// Input and case interactions, included in the same module as app.js.
const overrides=new Map();
$('description').addEventListener('input',()=>{optimizedFor=null;overrides.clear();error('form-error','');});
for(const el of form.querySelectorAll('input:not([type])'))el.addEventListener('input',()=>overrides.set(el.name,el.value));
async function optimizeInput(){
 const text=$('description').value;
 if(text.trim().length<8)throw Error('请描述你想制作的视频，或点击「填入示例」。');
 const result=await api('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,mode:'demo'}),signal:AbortSignal.timeout(15000)});
 if(text!==$('description').value)throw Error('描述已修改，请重新生成。');
 fillBrief(result);for(const [key,value] of overrides)form.elements[key].value=value;optimizedFor=text;
 $('optimizer-note').textContent=result.mode==='curated'?'已采用案例文案，可直接生成':'已整理描述（本地演示），可直接生成';
 return result;
}
$('optimize').onclick=async()=>{error('form-error','');$('optimize').disabled=true;$('optimize').textContent='正在整理…';try{await optimizeInput();}catch(e){error('form-error',e.message);}finally{$('optimize').disabled=false;$('optimize').textContent='优化描述 ✦';}};
async function beginEdit(){
 error('result-error','');$('edit-storyboard').disabled=true;
 try{
  if(!current){
   if(!catalog.length)await loadCatalog();const c=catalog.find(c=>c.id===viewedCaseId)||catalog[0];
   const data=new FormData();data.set('brief',JSON.stringify(c.brief));data.set('useExample','true');data.set('caseId',c.id);data.set('description',c.description);
   const p=await api('/api/projects',{method:'POST',body:data});display(p);await refreshHistory();
  }
  switchTab('plan');$('storyboard').querySelector('input')?.focus();
 }catch(e){error('result-error',e.message);}finally{$('edit-storyboard').disabled=current&&!['awaiting_confirmation','failed','complete'].includes(current.status);}
}
`+s.slice(end);
s=s.replace("selectedCaseId=c.id;","selectedCaseId=c.id;overrides.clear();").replace("$('optimization-result').hidden=true;",'');
s=s.replace("stopPoll();current=null;switchTab('video');","stopPoll();current=null;viewedCaseId=c.id;switchTab('video');$('edit-storyboard').disabled=false;$('plan-help').textContent='编辑此案例将创建独立副本。';");
s=s.replace("optimizedFor=$('description').value;revealExtraction();","optimizedFor=$('description').value;overrides.clear();$('extracted').open=false;");
put('web/experience.js',s);
fs.appendFileSync('web/style.css',`\n/* v0.5: adjacent primary inputs; actions belong to their working surface. */
.workspace{grid-template-columns:400px minmax(0,1fr)}.settings{padding:24px}.intro{margin-bottom:18px}.input-materials{border:1px solid var(--line);border-radius:12px;padding:16px;background:#14181b}.input-materials textarea{min-height:154px;line-height:1.7}.input-materials fieldset{margin-top:16px}.input-materials .drop-zone{min-height:100px;padding:12px}.input-materials .optimizer-row{margin-top:14px}.optimizer-row .text-button{font-size:14px}.generate-footer{position:sticky;bottom:0;background:#171a1d;padding:14px 0 2px;margin-top:12px;border-top:1px solid var(--line);z-index:2}.generate-footer .button{justify-content:center;margin:0;min-height:48px;font-size:16px}.generate-footer p{margin:8px 0;text-align:center}.plan-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;bottom:0;background:#101214;padding:18px 0;margin-top:10px;z-index:2}.scene-content input{cursor:text;min-height:44px}.scene-card{border-color:#44534e}.settings details{margin-top:16px}.small,.field-hint,.asset-note{font-size:13px}.settings-grid{gap:12px}@media(min-width:1000px){.settings{max-height:calc(100vh - 77px);overflow-y:auto;position:sticky;top:0;align-self:start}}@media(max-width:999px) and (min-width:761px){.workspace{grid-template-columns:350px minmax(0,1fr)}.settings{padding:20px}}@media(max-width:760px){.workspace{display:flex}.generate-footer{position:static}.plan-actions{bottom:0}.results{scroll-margin-top:16px}}\n`);
s=read('lib/workflow.mjs');s=s.replace("['brand','品牌名',8]","['brand','品牌名',8,'商品展示']");
s=s.replace("if(!Array.isArray(input.benefits)||input.benefits.length!==3||input.benefits.some(v=>typeof v!=='string'||!v.trim()||[...v.trim()].length>10))throw new InputError('请填写三个卖点，每项 1–10 个字');","if(input.benefits===undefined)input={...input,benefits:[]};if(!Array.isArray(input.benefits)||input.benefits.length>3||input.benefits.some(v=>typeof v!=='string'||[...v.trim()].length>10))throw new InputError('最多三个卖点，每项不超过 10 字');");
s=s.replace("b.benefits=input.benefits.map(v=>v.trim());","b.benefits=input.benefits.map(v=>v.trim()).filter(Boolean);");
s=s.replace("商品细节与三个卖点依次展示","商品细节与已提供的信息展示");
s=s.replace("if(!copy||[...copy].length>","if((!copy&&i!==1)||[...copy].length>");
s=s.replace("const benefits=copy.split('/').map(v=>v.trim());if(benefits.length!==3||benefits.some(v=>!v||[...v].length>10))throw new InputError('第二幕请填写三个卖点，用 / 分隔，每项最多 10 字');","const benefits=copy?copy.split('/').map(v=>v.trim()):[];if(benefits.length>3||benefits.some(v=>!v||[...v].length>10))throw new InputError('第二幕最多三个卖点，用 / 分隔，每项最多 10 字，也可留空');");
s=s.replace("const edited=validateStoryboard(scenes,b),benefits=edited[1].copy.split('/').map(v=>v.trim());","const edited=validateStoryboard(scenes,b),benefits=edited[1].copy.split('/').map(v=>v.trim()).filter(Boolean);\n template=template.replace(/<div class=\"benefit\"><span class=\"num\">0[123]<\\/span><span>\\{\\{benefit([123])\\}\\}<\\/span><\\/div>/g,(row,n)=>benefits[Number(n)-1]?row:'');\n if(!benefits.length)template=template.replace(/tl\\.from\\('#s2 \\.benefit'.*?;\\r?\\n/,'');");
put('lib/workflow.mjs',s);
s=read('lib/demo-planner.mjs');s=s.replace("if(!brand)missing.push('品牌名');",'').replace("if(benefits.some(s=>!s))missing.push('三个简短卖点');",'').replace('可手动修正，或切换到实时 Codex。','可按需补充信息。');put('lib/demo-planner.mjs',s);
for(const p of ['server.mjs','start-local.ps1'])put(p,read(p).replaceAll('0.4.0-demo','0.5.0-demo'));
