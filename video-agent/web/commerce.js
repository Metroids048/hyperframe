const $=s=>document.querySelector(s),composer=$('#composer'),input=$('#message'),attachments=$('#images');
let files=[],project=null,poll=null,selected=null,posting=false,opening=false,nativeDocument=null,selectedNode=null,documentRevision=null;
const objectUrls=[];
let presetCatalog=[],chosenPreset=null,shownEvidence='',showAllProjects=false,openSequence=0,projectSummaries=[],shownVoices='';
const rememberedProjects=new Set(JSON.parse(localStorage.getItem('commerce-created-projects')||'[]'));
function rememberProject(id){rememberedProjects.add(id);localStorage.setItem('commerce-created-projects',JSON.stringify([...rememberedProjects]));}
const active=j=>['queued','running'].includes(j.status);
function drawProduction(){const last=project?.jobs.at(-1),quality=nativeDocument?.quality||last?.quality,range=nativeDocument?.previewRange,media=project?.revisions.find(r=>r.id===selected)?.mediaReview;$('#production-quality').hidden=!quality&&!range&&!media;$('#direction-preview').hidden=!range;$('#quality-summary').textContent=[quality?`工程检查：${quality.engineering==='checked'?'已通过':'待检查'}。画面检查：${quality.status==='preview-reviewed'?'关键帧已检查':quality.status==='unchanged-visual-content'?'本次未改画面':'待复核'}。人工验收：${quality.humanReview==='passed'?'已通过':'待审核'}。`:'',media?`导出媒体：${media.status==='media-contract-passed'?'时长、尺寸、帧率和音轨已检查':'未通过'}。`:'',...(quality?.issues||[]).map(i=>`${i.startSeconds??i.seconds??'?'}${i.endSeconds!=null?'–'+i.endSeconds:''} 秒：${i.problem}`)].join(' ');}
function drawJobs(jobs){const container=$('#jobs'),existing=new Map([...container.children].map(el=>[el.dataset.jobId,el]));const nodes=jobs.map(j=>{const signature=JSON.stringify([j.id,j.kind,j.status,j.stage,j.runId,j.gaps,j.error,j.modelCalls,j.maxModelCalls,j.completionReserve,j.budgetSource,j.completedShots,j.resumeAllowed,j.budgetExhausted,j.directionPreview?.key]),prior=existing.get(j.id);if(prior?.dataset.signature===signature)return prior;const row=drawJob(j);row.dataset.jobId=j.id;row.dataset.signature=signature;return row;});if(nodes.length!==container.children.length||nodes.some((n,i)=>container.children[i]!==n))container.replaceChildren(...nodes);}
function drawJob(j){const d=document.createElement('div'),label=j.kind==='export'?'导出':j.kind==='create'?'创作':'修改';d.textContent=label+' · '+(j.budgetExhausted?'本轮预算已用完，草稿与缺陷已保留':j.status==='complete'?'已完成':j.status==='needs_user'?'有待确认的问题，证据已保留':j.status==='recoverable'?'已暂停，可从检查点恢复':j.status==='failed'?shortError(j.error):j.status==='cancelled'?'已取消':j.stage||'排队中');if(j.runId){const info=document.createElement('p');info.textContent=`同一任务累计 ${j.modelCalls??0} 次 / ${j.maxModelCalls??'未登记'} 次，最终检查预留 ${j.completionReserve||0} 次；已完成 ${j.completedShots??0} 幕。预算来源：${j.budgetSource==='explicit-webui-approval'?'用户批准':'应用估算'}。`;d.append(info);}if(j.code==='MODEL_BUDGET'&&!active(j)){const budget=document.createElement('input');budget.type='number';budget.min=String((j.modelCalls||0)+7);budget.max='128';budget.value=String(Math.min(128,(j.modelCalls||0)+30));budget.setAttribute('aria-label','批准累计调用上限');const approve=document.createElement('button');approve.textContent='批准此上限（预留6次检查）';approve.onclick=()=>action({action:'authorize_budget',jobId:j.id,maxModelCalls:Number(budget.value),completionReserve:6,idempotencyKey:crypto.randomUUID()});d.append(budget,approve);}if(active(j)){const b=document.createElement('button');b.textContent='取消';b.onclick=()=>action({action:'cancel',jobId:j.id});d.append(b);}if(j.runId?(['recoverable','cancelled','failed','needs_user'].includes(j.status)&&j.resumeAllowed!==false):j.status==='failed'){const b=document.createElement('button');b.textContent=j.runId?'从检查点恢复':'重试';b.onclick=()=>action({action:j.runId?'resume':'retry',jobId:j.id});d.append(b);}if(j.directionPreview?.previewUrl){const link=document.createElement('a');link.textContent='查看提前方向预览（全片仍在制作）';link.href=j.directionPreview.previewUrl;link.target='_blank';link.rel='noopener';d.append(link);}if(j.gaps?.length){const p=document.createElement('p');p.textContent=j.gaps.join('；');d.append(p);}if(j.error){const detail=document.createElement('details'),summary=document.createElement('summary'),log=document.createElement('pre');summary.textContent='处理记录';log.textContent=j.error;detail.append(summary,log);d.append(detail);}return d;}
const busy=()=>posting||opening||project?.jobs.some(j=>active(j)&&j.kind!=='export');
const roles={hero:'主体画面',detail:'细节画面',title:'标题',feature:'说明',price:'价格',cta:'结尾提示',caption:'字幕',decoration:'图形'};
const shortError=text=>/^HyperFrames/.test(text||'')?'画面检查未通过，上一有效版本已保留。可以重试或调整要求。':String(text||'').split('\n')[0];
function showError(e){$('#error').textContent=shortError(e.message||e);$('#error').hidden=false;}
async function api(url,options={}){const r=await fetch(url,options),data=await r.json();if(!r.ok)throw Error(data.error||'请求失败');return data;}
const post=data=>api('/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
function thumbnails(){objectUrls.splice(0).forEach(URL.revokeObjectURL);$('#thumbs').replaceChildren(...files.map((f,i)=>{const chip=document.createElement('div');chip.className='file-chip';if(f.type.startsWith('image/')){const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt=f.name;objectUrls.push(img.src);chip.append(img);}const name=document.createElement('span'),remove=document.createElement('button');name.textContent=f.name;remove.textContent='×';remove.type='button';remove.setAttribute('aria-label','移除 '+f.name);remove.onclick=()=>{files.splice(i,1);thumbnails();};chip.append(name,remove);return chip;}));}
attachments.onchange=()=>{files.push(...attachments.files);attachments.value='';thumbnails();};
async function listProjects(){
 const data=await api('/api/commerce-projects'),historyIds=new Set(data.historyProjectIds||[]);projectSummaries=data.projects;const commerceIds=new Set(presetCatalog.map(p=>p.id)),sourceIds=new Set(presetCatalog.map(p=>p.sourceProjectId||data.projects.find(source=>!source.preset&&source.currentRevisionId&&source.request.message===p.input)?.id)),seenPresets=new Set();
 const visible=data.projects.filter(p=>p.currentRevisionId&&p.revisions.some(r=>r.id===p.currentRevisionId&&r.rendered)&&!historyIds.has(p.id)&&(!p.preset||sourceIds.has(p.id)||p.id===project?.id)&&(p.visibility!=='test'&&p.testOnly!==true));
 $('#projects').replaceChildren(new Option('已导出作品',''),...visible.map(p=>new Option(p.title||'未命名作品',p.id)));$('#projects').value=project?.id||'';
}
function clearPreview(){
 selected=null;selectedNode=null;nativeDocument=null;documentRevision=null;const old=$('#player');old.pause?.();if(old.getAttribute('src')){const player=document.createElement('hyperframes-player');player.id='player';player.setAttribute('controls','');player.hidden=true;old.replaceWith(player);}else old.hidden=true;
 $('#empty').hidden=false;for(const id of ['revision-tools','object-tools','creation-summary','download','package'])$('#'+id).hidden=true;for(const id of ['download','package'])$('#'+id).removeAttribute('href');$('#revisions').replaceChildren();$('#objects').replaceChildren(new Option('自动理解修改目标',''));$('#object-info').textContent='';
}
function preserveLastFrame(player){let ended=false;player.addEventListener('ended',()=>queueMicrotask(()=>{if(!player.isConnected||!(player.duration>0))return;ended=true;player.pause?.();player.seek?.(Math.max(0,player.duration-1/30));}));player.addEventListener('play',()=>{if(ended&&player.currentTime>=player.duration-.07)player.seek?.(0);ended=false;});player.addEventListener('timeupdate',()=>{if(player.currentTime<player.duration-.08)ended=false;});return player;}
function chooseObject(id,seek=false){selectedNode=id||null;$('#objects').value=id||'';const node=nativeDocument?.nodes.find(n=>n.id===id),scene=nativeDocument?.scenes.find(s=>s.id===node?.sceneId),locks=scene?{content:scene.locked,timing:scene.locked,...scene.locks}:{};$('#object-info').textContent=scene?`第 ${nativeDocument.scenes.indexOf(scene)+1} 幕 · ${Object.entries(locks).filter(([,on])=>on).map(([k])=>({content:'内容已锁',layout:'布局已锁',timing:'时长已锁',absolute:'绝对位置已锁'}[k])).join('，')||'可修改'}`:'';if(seek&&node){$('#player').pause?.();$('#player').seek?.((node.startFrame+Math.min(18,node.durationFrames-1))/30);}}
async function loadObjects(r){if(documentRevision===r.id)return;documentRevision=r.id;try{const doc=await api(r.documentUrl);if(documentRevision!==r.id)return;nativeDocument=doc;drawCreationSummary(doc);$('#objects').replaceChildren(new Option('自动理解修改目标',''),...doc.nodes.filter(n=>n.kind!=='audio').map(n=>new Option(`第 ${doc.scenes.findIndex(s=>s.id===n.sceneId)+1} 幕 · ${roles[n.semanticRole]||n.kind}${n.params?.text?' · '+n.params.text.slice(0,28):''}`,n.id)),...(doc.captions||[]).map((c,i)=>new Option('字幕 '+(i+1)+' · '+c.text.slice(0,28),c.id)));chooseObject(doc.nodes.some(n=>n.id===selectedNode)?selectedNode:null);$('#object-tools').hidden=false;drawProduction();}catch(e){documentRevision=null;showError(e);}}
function preview(r){if(!r)return;$('#case-view').hidden=true;$('#case-film').pause();selected=r.id;const old=$('#player');if(old.getAttribute('src')!==r.previewUrl){old.pause?.();const player=preserveLastFrame(document.createElement('hyperframes-player'));player.id='player';player.setAttribute('controls','');player.setAttribute('src',r.previewUrl);player.style.aspectRatio=r.output.width+'/'+r.output.height;player.addEventListener('ready',()=>{queueMicrotask(()=>player.seek?.(.6));player.iframe?.contentDocument?.addEventListener('click',e=>{const object=e.target.closest('[data-object-id],[id^="obj-"]');if(object)chooseObject(object.dataset.objectId||object.id.slice(4));});},{once:true});old.replaceWith(player);}void loadObjects(r);$('#player').hidden=false;$('#empty').hidden=true;$('#download').hidden=!r.videoUrl;if(r.videoUrl)$('#download').href=r.videoUrl+'?download=1';$('#package').hidden=!r.packageUrl;if(r.packageUrl)$('#package').href=r.packageUrl+'?download=1';}
function draw(){
 if(!project?.currentRevisionId)clearPreview();
 drawVoices();
 drawExampleEvidence();
 if(project){$('#projects').value=project.id;$('#revision-tools').hidden=!project.currentRevisionId;$('#preset-notice').hidden=!project.preset;$('#revisions').replaceChildren(...project.revisions.map((r,i)=>new Option((i+1)+'. '+r.description.slice(0,40)+(r.branch?'（分支）':''),r.id)));selected=selected&&project.revisions.some(r=>r.id===selected)?selected:project.currentRevisionId;$('#revisions').value=selected;preview(project.revisions.find(r=>r.id===selected));$('#messages').replaceChildren(...project.messages.map(m=>{const d=document.createElement('div');d.className='bubble '+m.role;d.textContent=m.role==='assistant'?shortError(m.text):m.text;return d;}));$('#messages').scrollTop=$('#messages').scrollHeight;
 drawJobs(project.jobs.slice(-3));drawProduction();$('#details').hidden=false;$('#status').textContent=JSON.stringify({projectId:project.id,currentRevisionId:project.currentRevisionId,previewRevisionId:selected,assets:project.assets.length,preset:project.preset?.id||null,run:project.jobs.at(-1)?.runId,stage:project.jobs.at(-1)?.stage,checkpoints:project.jobs.at(-1)?.checkpoints},null,2);}
 else{$('#messages').replaceChildren();$('#jobs').replaceChildren();$('#status').textContent='';$('#details').hidden=true;$('#preset-notice').hidden=true;}
 const historyView=project?.currentRevisionId&&selected!==project.currentRevisionId;$('#projects').disabled=posting;$('#send').disabled=Boolean(busy()||historyView);$('#send').textContent=posting?'正在提交…':project?.currentRevisionId?'发送修改':'生成视频';$('#composer-hint').textContent=historyView?'恢复此版后可继续修改':project?.currentRevisionId?'继续描述想改的地方':'素材可不填';input.placeholder=project?.currentRevisionId?'想调整什么？':'想做一条怎样的视频？';for(const id of ['restore','undo','redo'])$('#'+id).disabled=Boolean(busy());$('#export').disabled=!selected||project?.jobs.some(j=>j.kind==='export'&&active(j)&&j.baseRevisionId===selected);
}
async function refresh(){if(!project)return;const id=project.id,prior=project.currentRevisionId,data=await api('/api/commerce/'+id);if(project?.id!==id)return;project=data.project;if(prior!==project.currentRevisionId){selected=project.currentRevisionId;void listProjects().catch(showError);}draw();clearTimeout(poll);if(project.jobs.some(active))poll=setTimeout(()=>refresh().catch(showError),1200);}
async function openProject(id){const sequence=++openSequence;opening=true;clearTimeout(poll);project=null;input.value='';files=[];thumbnails();clearPreview();draw();try{const result=await api('/api/commerce/'+id);if(sequence!==openSequence)return;project=result.project;selected=project.currentRevisionId;history.replaceState(null,'','/?project='+id);draw();await listProjects();await refresh();}finally{if(sequence===openSequence){opening=false;draw();}}}
async function action(data){$('#error').hidden=true;try{const result=await post({...data,projectId:project.id,baseRevisionId:project.currentRevisionId,idempotencyKey:crypto.randomUUID()});if(result.project){if(project.currentRevisionId!==result.project.currentRevisionId)selected=result.project.currentRevisionId;project=result.project;}await refresh();return true;}catch(e){showError(e);return false;}}
async function uploadFiles(){if(files.length+project.assets.length>30)throw Error('每个工程最多30个素材');if(files.some(f=>f.size>1024**3))throw Error('每个素材最多1 GiB');for(const [i,f] of files.entries()){$('#send').textContent=`上传 ${i+1}/${files.length}`;await api('/api/commerce/'+project.id+'/assets',{method:'POST',headers:{'x-file-name':encodeURIComponent(f.name)},body:f});}}
composer.onsubmit=async e=>{e.preventDefault();if(busy())return;const message=input.value.trim();if(!message&&!files.length)return;$('#error').hidden=true;posting=true;draw();try{if(project?.currentRevisionId){await uploadFiles();if(await action({action:'patch',message,selectedNodeId:selectedNode})){input.value='';files=[];thumbnails();}}else{if(!project)project=(await post({action:'draft',request:{message,inferRequest:true,businessGoal:creationInputs[selectedBusinessGoal]?[selectedBusinessGoal]:[]}})).project;selected=null;rememberProject(project.id);history.replaceState(null,'','/?project='+project.id);draw();await uploadFiles();await post({action:'generate',projectId:project.id,message,idempotencyKey:crypto.randomUUID()});input.value='';files=[];thumbnails();await refresh();await listProjects();}}catch(err){showError(err);}finally{posting=false;draw();}};
async function loadPreset(preset){if(busy())return;++openSequence;posting=true;draw();try{project=(await post({action:'preset',presetId:preset.id})).project;selected=project.currentRevisionId;history.replaceState(null,'','/?project='+project.id);input.value=preset.input;files=[];thumbnails();draw();await listProjects();}catch(e){showError(e);}finally{posting=false;draw();}}
$('#regenerate').onclick=async()=>{if(busy()||!project?.preset)return;let prepared=false;posting=true;draw();try{const source=project;files=await Promise.all(source.assets.map(async a=>{const r=await fetch('/api/commerce/'+source.id+'/input-assets/'+a.id);if(!r.ok)throw Error('预设输入素材读取失败');return new File([await r.blob()],a.name,{type:r.headers.get('content-type')||'application/octet-stream'});}));input.value=source.request.message;clearTimeout(poll);project=null;selected=null;nativeDocument=null;documentRevision=null;$('#messages').replaceChildren();$('#preset-notice').hidden=true;$('#revision-tools').hidden=true;$('#object-tools').hidden=true;$('#details').hidden=true;$('#jobs').replaceChildren();$('#download').hidden=true;$('#package').hidden=true;$('#player').pause?.();$('#player').hidden=true;$('#empty').hidden=false;history.replaceState(null,'','/');thumbnails();input.focus();prepared=true;}catch(e){showError(e);}finally{posting=false;draw();}if(prepared)composer.requestSubmit();};
$('#new-project').onclick=()=>{location.href='/';};$('#projects').onchange=e=>{if(e.target.value==='__toggle_all__'){showAllProjects=!showAllProjects;void listProjects();}else if(e.target.value)openProject(e.target.value).catch(showError);};$('#objects').onchange=e=>chooseObject(e.target.value,true);$('#revisions').onchange=e=>{selected=e.target.value;draw();};$('#restore').onclick=()=>action({action:'restore',revisionId:selected});$('#undo').onclick=()=>action({action:'undo'});$('#redo').onclick=()=>action({action:'redo'});$('#export').onclick=()=>action({action:'export',revisionId:selected});
$('#open-package').onclick=()=>$('#package-file').click();
$('#direction-preview').onclick=()=>{const player=$('#player'),range=nativeDocument?.previewRange;if(!range)return;player.pause?.();player.seek?.(range.startFrame/30);const stop=()=>{if(player.currentTime>=range.endFrame/30){player.pause?.();player.removeEventListener('timeupdate',stop);}};player.addEventListener('timeupdate',stop);player.play?.();};
$('#package-file').onchange=async()=>{const file=$('#package-file').files[0];if(!file)return;$('#package-file').value='';$('#error').hidden=true;$('#open-package').disabled=true;try{const result=await api('/api/commerce-import',{method:'POST',headers:{'Content-Type':'application/zip'},body:file});await openProject(result.project.id);}catch(error){showError(error);}finally{$('#open-package').disabled=false;}};
function chooseExample(id,display=true){
 chosenPreset=presetCatalog.find(p=>p.id===id)||null;$('#example-card').hidden=!chosenPreset;if(!chosenPreset)return;
 const p=chosenPreset;$('#example-select').value=p.id;$('#example-category').textContent=p.category+' · '+p.durationSeconds+' 秒 · '+(p.reviewStatus==='draft'?'预览草稿':'预设样片');$('#example-title').textContent=p.title;$('#example-description').textContent=p.description;
 $('#example-tags').replaceChildren(...p.capabilities.map(text=>{const tag=document.createElement('span');tag.textContent=text;return tag;}));$('#example-poster').hidden=!p.poster;if(p.poster)$('#example-poster').src=p.poster;$('#example-load').dataset.presetId=p.id;$('#example-load').disabled=Boolean(busy());
 if(display)void showLandingExample(p);
}
async function showLandingExample(p){
 if(!project)history.replaceState(null,'','/?demo='+encodeURIComponent(p.id));
 $('#case-view').hidden=false;const film=$('#case-film');film.pause();film.src=p.videoUrl+'?v='+p.sha256;film.poster=p.poster||'';film.load();
 $('#case-label').textContent=p.title+' · '+p.durationSeconds+'秒 · '+p.description;
 $('#case-input').textContent=p.input+'\n'+p.note;$('#player').hidden=true;$('#empty').hidden=true;
 $('#case-download').href=p.videoUrl+'?download=1&v='+p.sha256;
 $('#case-fullscreen').onclick=()=>film.requestFullscreen().catch(showError);
}

function drawExampleEvidence(){
 $('#example-load').disabled=Boolean(busy());const p=presetCatalog.find(p=>p.id===project?.preset?.id||(p.sourceProjectId===project?.id&&project?.revisions.some(r=>r.id===selected&&r.previewUrl===p.previewUrl)));$('#example-evidence').hidden=!p;if(!p){shownEvidence='';return;}
 const key=project.id+':'+p.id;if(key===shownEvidence)return;shownEvidence=key;
 $('.example-fixed-note').textContent='这是已经生成的固定样片。重新生成会再次理解输入、选材和制作。'+(p.evidenceNote?' '+p.evidenceNote:'');
 $('#example-assets').replaceChildren(...project.assets.map((a,i)=>{const link=document.createElement('a');link.href='/api/commerce/'+project.id+'/input-assets/'+a.id;link.target='_blank';link.rel='noopener';link.title='查看输入素材：'+a.name;const media=document.createElement(a.kind==='image'?'img':'div');if(a.kind==='image'){media.src=link.href;media.alt='输入图片 '+(i+1);}else{media.className='source-video';media.textContent=a.kind==='video'?'▷':'♫';}const name=document.createElement('span');name.textContent=a.name||((a.kind==='image'?'图片 ':a.kind==='video'?'输入视频 ':'音频 ')+(i+1));link.append(media,name);return link;}));
 $('#example-process').replaceChildren(...p.process.map(item=>{const row=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p');title.textContent=item.title;detail.textContent=item.detail;row.append(title,detail);return row;}));
 $('#example-beats').replaceChildren(...(p.beats||[]).map(beat=>{const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=beat.startSeconds.toFixed(1)+'–'+beat.endSeconds.toFixed(1)+' 秒 · '+beat.title;button.onclick=()=>{selected=(project.revisions.find(r=>r.previewUrl===p.previewUrl)||project.revisions[0]).id;draw();const player=$('#player'),seek=()=>{player.pause?.();player.seek?.(Math.min(beat.endSeconds-.1,beat.startSeconds+.8));};if(player.duration>0)seek();else player.addEventListener('ready',()=>queueMicrotask(seek),{once:true});};return button;}));
 $('#example-result').textContent=`已生成 ${p.durationSeconds} 秒 · ${p.output.width}×${p.output.height} · 可编辑原生工程与 MP4`;
 $('#example-credits').replaceChildren(document.createTextNode('素材来源：'),...p.credits.map(c=>{const link=document.createElement('a');link.textContent=c.label;if(/^https:\/\//.test(c.url)){link.href=c.url;link.target='_blank';link.rel='noopener';}return link;}));
}
$('#example-select').onchange=e=>chooseExample(e.target.value);$('#example-load').onclick=()=>{if(chosenPreset)loadPreset(chosenPreset);};
async function refreshExamples(){
 try{const data=await api('/api/commerce-demos'),next=data.presets.filter(p=>p.category&&p.category!=='基础示例'),signature=JSON.stringify(next);drawBusinessCases(next);if(signature!==JSON.stringify(presetCatalog)){const previous=chosenPreset?.id||new URLSearchParams(location.search).get('demo');presetCatalog=next;$('#example-select').replaceChildren(new Option('选择一个商品场景',''),...presetCatalog.map(p=>new Option(p.title+' · '+p.category,p.id)));if(presetCatalog.length)chooseExample(presetCatalog.some(p=>p.id===previous)?previous:project?.preset?.id||presetCatalog[0].id,!project);shownEvidence='';drawExampleEvidence();void listProjects();}$('#examples-loading').hidden=Boolean(presetCatalog.length)&&!data.unavailable?.filter(p=>p.category!=='基础示例').length;$('#examples-loading').textContent=data.unavailable?.length?data.unavailable.filter(p=>p.category!=='基础示例').map(p=>p.title+'：'+p.reason).join('；'):'本轮示范尚未完成。可以先上传自己的素材开始创作。';}catch(error){if(!presetCatalog.length)$('#examples-loading').textContent='示例暂时无法读取，你仍可输入需求开始创作。';}
 if(presetCatalog.filter(p=>p.reviewStatus!=='draft').length<3)setTimeout(refreshExamples,10000);
}
void refreshExamples();
const initial=new URLSearchParams(location.search).get('project');if(initial)openProject(initial).catch(showError);else listProjects().catch(showError);

function drawVoices(){const voices=project?.auditions||[],key=voices.map(a=>a.id).join('|');if(key===shownVoices)return;shownVoices=key;$('#voice-results').hidden=!voices.length;$('#voice-results').replaceChildren(...voices.map((a,i)=>{const card=document.createElement('div'),label=document.createElement('p'),audio=document.createElement('audio'),button=document.createElement('button');label.textContent='试听 '+(i+1)+' · '+(a.voice.startsWith('zf_')?'女声':'男声');audio.controls=true;audio.preload='metadata';audio.src=a.url;button.type='button';button.className='quiet';button.textContent='选择这个声音';button.onclick=()=>{input.value='确认使用第'+(i+1)+'个声音。';input.focus();};card.append(label,audio,button);return card;}));}

const creationInputs={
 style:{hint:'提供同款或系列关系明确的素材，展示风格与搭配，不推断性能。',message:'用这些素材做一条风格展示，突出商品形状、材质与搭配关系。'},
 faq:{hint:'提供具体选购问题与能回答它的素材。',message:'用这些素材回答一个具体选购问题，结论必须有画面或资料依据。'},
 recut:{hint:'添加原视频并指出要删的等待或需要补充的说明。',message:'整理这段实拍的节奏，删掉等待、保留动作和原意，并添加必要说明。'},
 versions:{hint:'打开已有工程后描述新目的或画幅；原版本会保留。',message:'基于同一组素材调整传播目的和画幅，保留原作品并制作新版本。'},
 launch:{hint:'添加商品素材与已确认的重点，时长、画幅和声音可自由描述。',message:'做一条上新介绍，让观众先看清商品，再认识有素材依据的特点。'},
 detail:{hint:'添加能支持说明的整体与细节素材，不确定的参数可以不填。',message:'重点解释这些商品的卖点与结构细节，画面和说明要对应，不编造参数。'},
 demo:{hint:'添加连续实拍与操作顺序，说明原声要求；没有拍到的步骤不能虚构。',message:'做一条使用演示，保留完整操作，让第一次看的人理解步骤。'},
 promotion:{hint:'提供已确认的价格、条件和行动提示；缺少的活动信息会保留待确认。',message:'做一条活动推广视频，清楚展示商品、已确认的活动条件与行动提示。'}
};
let selectedBusinessGoal=new URLSearchParams(location.search).get('creation');
function useCreationEntry(kind){
 const entry=creationInputs[kind];if(!entry)return;
 selectedBusinessGoal=kind;
 if(!input.value.trim())input.value=entry.message;
 $('#input-guidance').textContent=entry.hint;input.focus();
 const example=presetCatalog.find(p=>(p.businessGoal||[]).includes(kind));if(example)chooseExample(example.id);
}
for(const button of document.querySelectorAll('[data-creation]'))button.onclick=()=>{
 const example=presetCatalog.find(p=>(p.businessGoal||[]).includes(button.dataset.creation)||button.dataset.creation==='recut'&&p.businessGoal.includes('demo')||button.dataset.creation==='versions'&&p.businessGoal.includes('promotion'));if(example){chooseExample(example.id);return;}
 if(busy())return;
 if(project){$('#input-guidance').textContent='当前作品可以直接描述修改需求；新制作请使用“新建”。';return;}
 useCreationEntry(button.dataset.creation);
};
const entry=creationInputs[new URLSearchParams(location.search).get('creation')];
if(entry&&!initial)useCreationEntry(selectedBusinessGoal);

function drawCreationSummary(doc){
 const names={'comparison-split':'双区细节说明','grid-card-assemble':'信息分组','video-text-pivot':'实拍配合说明','lt-mask-reveal':'实拍文字标注','titlecard-reveal':'分层标题','native-original':'定制布局'};
 const used=[...new Set((doc.resourceReceipts||[]).map(r=>names[r.resourceId]||'原生动效'))];
 const count=kind=>doc.nodes.filter(n=>n.kind===kind).length;
 $('#creation-summary').hidden=false;
 $('#creation-summary-text').textContent=`${doc.scenes.length} 段画面，${count('image')} 个图片对象、${count('video')} 个视频对象、${count('text')} 个文字对象。`+(used.length?'采用：'+used.join('、')+'。':'')+'可选择画面对象后继续描述修改要求。';
}

$('#example-own').onclick=()=>{
 if(busy())return;
 const mode=chosenPreset?.inputMode;
 $('#input-guidance').textContent=mode==='footage'?'添加自己的实拍，并说明时长、画幅与原声要求。':mode==='mixed'?'添加自己的图片和实拍，并说明输出要求。':mode==='images'?'添加自己的商品图，并说明输出要求。':'添加自己的素材，自由描述需求；素材类型由实际上传识别。';
 if(!project){const goal=chosenPreset?.businessGoal?.[0];if(goal)useCreationEntry(goal);attachments.click();}
 else $('#input-guidance').textContent+=' 当前正查看作品，点击“新建”后使用自己的素材。';
};

function drawBusinessCases(presets){
 const goals=[['launch','新品首发与品牌亮相','商品整体图与已确认重点'],['detail','商品详情与卖点图解','支持说明的整体与细节素材'],['demo','开箱／安装／使用教程','连续实拍与操作顺序'],['style','穿搭／组合／系列展示','同款或系列关系明确的照片'],['promotion','活动促销／直播预告','确认的价格、条件与行动提示'],['faq','选购说明／场景问答','具体问题与能够支持回答的资料'],['recut','已有视频精剪与包装','原始实拍与需要保留的动作'],['versions','一稿多版／开头／画幅调整','已有原生工程与新的传播目的']];
 $('#business-cases').replaceChildren(...goals.filter(([goal])=>presets.some(p=>(p.businessGoal||[]).includes(goal))).map(([goal,title,need])=>{
  const p=presets.find(p=>(p.businessGoal||[]).includes(goal)),card=document.createElement('article');card.className='business-case';
  const heading=document.createElement('h2');heading.textContent=title;card.append(heading);
  if(p?.poster){const img=document.createElement('img');img.src=p.poster;img.alt=p.title+'实际成片帧';card.append(img);}
  const value=document.createElement('p');value.textContent=p?p.description:'对应的新作品尚未通过验收；可以先使用自己的素材。';card.append(value);
  const meta=document.createElement('small');meta.textContent=p?'预生成样片 · '+p.durationSeconds+'秒 · '+({images:'图片',footage:'实拍',mixed:'混合'}[p.inputMode]||'待识别')+(p.reviewStatus==='verified'?' · 已完成内容复核':' · 未完成预览'):'示例待就绪';card.append(meta);
  const inputs=document.createElement('p');inputs.textContent='输入：'+need;card.append(inputs);
  const watch=document.createElement('button');watch.type='button';watch.textContent='看已生成示例';watch.disabled=!p;watch.onclick=()=>{chooseExample(p.id);};card.append(watch);
  const edit=document.createElement('button');edit.type='button';edit.className='quiet';edit.textContent='打开派生工程编辑';edit.disabled=!p;edit.onclick=()=>{if((input.value.trim()||files.length)&&!confirm('打开案例将替换当前输入。确认继续？'))return;loadPreset(p);};card.append(edit);
  const own=document.createElement('button');own.type='button';own.className='quiet';own.textContent='用我的素材';own.onclick=()=>{if(!project){useCreationEntry(goal);attachments.click();}else $('#input-guidance').textContent='当前工程可继续编辑；新制作请使用“新建”。';};card.append(own);return card;
 }));
}
