import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');const put=(p,s)=>fs.writeFileSync(p,s);const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing '+a.slice(0,60));return s.replace(a,b);};
let s=read('web/index.html');
const start=s.indexOf('<div class="optimizer-row">'),end=s.indexOf('<div id="optimization-result"',start);
s=s.slice(0,start)+`<div class="generation-actions"><button id="plan-button" class="button primary full" type="submit">生成视频 →</button><button id="preview-plan" class="button ghost full" type="button">先编辑分镜</button></div>
<div class="optimizer-row"><button type="button" id="optimize" class="text-button">优化输入 ✦</button><span class="small muted">可选 · 直接生成也会自动整理</span></div>
<p id="optimizer-note" class="small muted">写下商品和卖点，添加图片，即可生成。也可以直接使用下方案例。</p>
`+s.slice(end);
s=s.replace('<details id="extracted" hidden><summary>提取结果 <span>可修改</span></summary>','<details id="extracted"><summary>补充或调整商品信息 <span>可选</span></summary>');
s=s.replace('<summary>文案设置 <span>可选</span></summary>','<summary>更多文案选项 <span>可选</span></summary>');
s=s.replace('<div id="form-error" class="error" role="alert" hidden></div><button id="plan-button" class="button primary full" type="submit" hidden>采用优化结果，生成分镜 →</button>',`<details><summary>高级选项 <span>可选</span></summary><div class="details-fields"><label>需求整理方式<select id="planner-mode"><option value="demo">本地演示（无需连接）</option><option value="live">实时 Codex（当前未启用）</option></select></label><p class="small muted">演示案例使用预置文案，自由输入采用规则提取，不是实时 AI。</p><button type="button" id="manual" class="text-button">使用我手动填写的信息</button></div></details><div id="form-error" class="error" role="alert" hidden></div>`);
s=s.replace('<h3>先看内容，再生成</h3><p>三幕共 15 秒，按你填写的卖点顺序展示。</p>','<h3>编辑分镜文案</h3><p>点击标题或补充文案即可修改。修改后点击「保存并生成视频」；成片会保留为历史版本。</p>');
s=s.replace('<div class="actions">','<div class="actions"><button type="button" id="save-plan" class="button ghost" hidden>保存分镜修改</button>');put('web/index.html',s);
s=read('web/app.js');s=s.replace("function revealExtraction(){ $('extracted').hidden=false;$('extracted').open=true;$('plan-button').hidden=false; }","function revealExtraction(){ $('extracted').hidden=false;$('extracted').open=true; }");
s=s.replace("const h=document.createElement('h4');h.textContent=s.headline;const copy=document.createElement('p');copy.textContent=s.copy;",`const editable=p?.id&&['awaiting_confirmation','failed','complete'].includes(p.status);const h=document.createElement(editable?'input':'h4'),copy=document.createElement(editable?'input':'p');if(editable){h.value=s.headline;h.maxLength=i===1?12:18;h.dataset.sceneHeadline=String(i);h.setAttribute('aria-label','第'+(i+1)+'幕标题');copy.value=s.copy;copy.maxLength=i===0?24:i===1?36:14;copy.dataset.sceneCopy=String(i);copy.setAttribute('aria-label','第'+(i+1)+'幕补充文案');copy.title=i===1?'三个卖点，用 / 分隔，每项最多 10 字':'补充文案';}else{h.textContent=s.headline;copy.textContent=s.copy;}`);
s=s.replace("$('confirm').hidden=!waiting;","$('confirm').hidden=running;$('confirm').textContent=done?'修改分镜并生成新版':'保存并生成视频';$('save-plan').hidden=running;");
const a=s.indexOf("form.addEventListener('submit'"),b=s.indexOf("$('confirm').onclick=confirm",a);
s=s.slice(0,a)+`async function createFromInput(renderImmediately){
 error('form-error','');const button=$('plan-button');button.disabled=true;$('preview-plan').disabled=true;button.textContent='正在准备…';
 try{
  if(optimizedFor!==$('description').value)await optimizeInput();
  if(!form.checkValidity()){revealExtraction();form.reportValidity();throw Error('还缺少部分商品信息，请在展开的选项中补充。');}
  if(!files.length&&!useExample&&!reuseFrom)throw Error('请添加商品图片，或点击「填入示例」使用案例素材。');
  const data=new FormData();data.set('brief',JSON.stringify(readBrief()));data.set('useExample',String(useExample));data.set('caseId',selectedCaseId);data.set('description',$('description').value);data.set('settings',JSON.stringify(readSettings()));if(reuseFrom)data.set('reuseFrom',reuseFrom);for(const f of files)data.append('images',f);
  const p=await api('/api/projects',{method:'POST',body:data});stopPoll();display(p);switchTab('plan');await refreshHistory();if(renderImmediately)await confirm();
 }catch(e){error('form-error',e.message);}finally{button.disabled=false;$('preview-plan').disabled=false;button.textContent='生成视频 →';}
}
form.addEventListener('submit',e=>{e.preventDefault();void createFromInput(true);});$('preview-plan').onclick=()=>createFromInput(false);
async function savePlan(){
 if(!current)return null;const p=current;const heads=[...document.querySelectorAll('[data-scene-headline]')],copies=[...document.querySelectorAll('[data-scene-copy]')];
 if(heads.length!==3)return p;
 const scenes=p.storyboard.map((s,i)=>({...s,headline:heads[i].value,copy:copies[i].value}));
 if(scenes.every((s,i)=>s.headline===p.storyboard[i].headline&&s.copy===p.storyboard[i].copy))return p;
 const revision=await api('/api/projects/'+p.id+'/storyboard',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyboard:scenes})});display(revision);await refreshHistory();return revision;
}
$('save-plan').onclick=async()=>{error('result-error','');$('save-plan').disabled=true;try{await savePlan();$('save-plan').textContent='分镜已保存';}catch(e){error('result-error',e.message);}finally{$('save-plan').disabled=false;}};
async function confirm(){
 if(!current)return;$('confirm').disabled=true;$('retry').disabled=true;error('result-error','');
 try{const draft=await savePlan();if(draft.status==='complete'){switchTab('plan');throw Error('请先修改分镜文案，再生成新版。');}const p=await api('/api/projects/'+draft.id+'/render',{method:'POST'});display(p);switchTab('video');poll(p.id);await refreshHistory();}catch(e){error('result-error',e.message);}finally{$('confirm').disabled=false;$('retry').disabled=false;}
}
`+s.slice(b);
s=s.replace("function renderPlan(p){","function renderPlan(p){$('save-plan').textContent='保存分镜修改';");put('web/app.js',s);
s=read('web/experience.js');const x=s.indexOf("$('description')"),y=s.indexOf('function loadCase',x);
s=s.slice(0,x)+`$('description').addEventListener('input',()=>{optimizedFor=null;error('form-error','');});
$('manual').onclick=()=>{revealExtraction();optimizedFor=$('description').value;error('form-error','');};
for(const el of [...form.querySelectorAll('input[type="text"],input:not([type])')])el.addEventListener('input',()=>{optimizedFor=$('description').value;});
async function optimizeInput(){
 const text=$('description').value,mode=$('planner-mode').value;
 if(text.trim().length<8)throw Error('请写一段商品描述，或从案例库选择一个需求。');
 const result=await api('/api/optimize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,mode}),signal:AbortSignal.timeout(15000)});
 if(text!==$('description').value)throw Error('描述已修改，请重新生成。');
 fillBrief(result);optimizedFor=text;$('optimization-result').hidden=false;$('optimization-provider').textContent=result.provider;$('optimized-prompt').textContent=result.optimizedPrompt;$('missing-info').textContent=result.missing.length?'请补充：'+result.missing.join('、'):'';
 $('extracted').open=!!result.missing.length;if(result.theme)$('setting-theme').value=result.theme;return result;
}
$('optimize').onclick=async()=>{error('form-error','');$('optimize').disabled=true;$('optimize').textContent='正在整理…';try{await optimizeInput();}catch(e){error('form-error',e.name==='TimeoutError'?'连接超时，输入已保留。可在高级选项切换本地演示。':e.message);}finally{$('optimize').disabled=false;$('optimize').textContent='优化输入 ✦';}};
`+s.slice(y);
s=s.replace("$('plan-button').hidden=true;$('extracted').hidden=true;","$('extracted').open=false;");s=s.replace("'status-panel','confirm'","'save-plan','status-panel','confirm'");put('web/experience.js',s);
fs.appendFileSync('web/style.css','\n.generation-actions{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin-top:14px}.generation-actions .button{margin:0}.scene-content input{display:block;width:100%;margin:9px 0;font:inherit;color:var(--text);background:#111417;border:1px solid var(--line);border-radius:6px;padding:10px;box-sizing:border-box}.scene-content input:focus{outline:2px solid var(--accent)}.scene-content input[data-scene-headline]{font-weight:600}.optimizer-row{flex-wrap:wrap}.generation-actions .button{padding:12px 8px}\n');
for(const file of ['server.mjs','start-local.ps1','scripts/test-v3.mjs'])put(file,read(file).replaceAll('0.3.0-demo','0.4.0-demo'));
