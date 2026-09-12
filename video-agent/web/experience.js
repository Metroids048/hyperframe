// Input and case interactions, included in the same module as app.js.
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
function loadCase(c){
 selectedCaseId=c.id;overrides.clear();$('description').value=c.description;optimizedFor=null;$('extracted').open=false;
 fillBrief({brand:'',product:'',benefits:['','','']});releaseUrls();files=[];reuseFrom=null;useExample=true;$('images').value='';
 $('setting-theme').value=c.theme;imagePreviews([c.imageUrl],'已选用案例商品图 · 可替换');error('form-error','');$('description').focus();
}
function playCase(c){
 stopPoll();selectionRequest++;current=null;viewedCaseId=c.id;switchTab('video');$('refresh-status').hidden=true;$('edit-storyboard').disabled=false;$('plan-help').textContent='编辑此案例将创建独立副本。';$('project-title').textContent=c.title;$('project-badge').textContent='案例成片 · 15 秒';$('video').hidden=false;$('video-empty').hidden=true;$('video').src=c.videoUrl;$('video').poster=c.imageUrl;$('video').load();
 $('video-caption').textContent=c.category+' · 虚构品牌演示 · 15 秒 / 720p';
 for(const id of ['save-plan','status-panel','confirm','retry','edit','open-studio','download-plan','render-notice'])$(id).hidden=true;
 $('tab-studio').disabled=false;$('open-studio').hidden=false;$('download').hidden=false;$('download').href=c.videoUrl+'?download=1';$('download').download=c.id+'.mp4';error('result-error','');
 renderPlan({imageUrls:[c.imageUrl,c.imageUrl,c.imageUrl],storyboard:[{start:0,end:5,title:'开场吸引',headline:c.brief.hook,copy:c.brief.product,visual:'商品主视觉与标题'},{start:5,end:10,title:'展示卖点',headline:c.brief.product,copy:c.brief.benefits.join(' / '),visual:'依次展开三个卖点'},{start:10,end:15,title:'品牌收尾',headline:c.brief.cta,copy:c.brief.brandLatin,visual:'品牌与商品收尾'}]});
 $('video').play().catch(()=>{});
}
async function loadCatalog(){
 catalog=await api('/api/cases');$('cases').replaceChildren(...catalog.map(c=>{
  const card=document.createElement('article');card.className='case-card';const img=document.createElement('img');img.src=c.imageUrl;img.alt=c.title;
  const box=document.createElement('div');box.className='case-copy';const title=document.createElement('strong');title.textContent=c.title;const meta=document.createElement('p');meta.textContent=c.category+' · 15 秒';
  const actions=document.createElement('div');actions.className='case-actions';const play=document.createElement('button');play.type='button';play.textContent=c.ready?'播放成片 ▷':'成片准备中';play.disabled=!c.ready;play.onclick=()=>playCase(c);
  const use=document.createElement('button');use.type='button';use.textContent='使用此需求 ↗';use.onclick=()=>loadCase(c);actions.append(play,use);box.append(title,meta,actions);card.append(img,box);return card;
 }));
}
$('sample').onclick=async()=>{try{if(!catalog.length)await loadCatalog();loadCase(catalog[0]);}catch(e){error('form-error',e.message);}};
$('edit').onclick=()=>{
 if(!current)return;fillBrief(current.brief);$('description').value=current.description||`品牌是${current.brief.brand}，商品是${current.brief.product}，卖点是${current.brief.benefits.join('、')}。`;
 optimizedFor=$('description').value;overrides.clear();$('extracted').open=false;$('setting-theme').value=current.brief.theme||'fresh';const s=current.requestedSettings||{duration:15,aspect:'16:9',quality:'720p'};if(![...$('setting-duration').options].some(o=>Number(o.value)===s.duration)){const option=document.createElement('option');option.value=s.duration;option.textContent=s.duration+' 秒（当前项目）';$('setting-duration').append(option);}$('setting-duration').value=s.duration;$('setting-aspect').value=s.aspect;$('setting-quality').value=s.quality;updateSettingsNote();
 releaseUrls();files=[];useExample=false;reuseFrom=current.id;$('images').value='';imagePreviews(current.imageUrls,'沿用此项目图片，可重新上传');document.querySelector('.settings').scrollIntoView({behavior:'smooth',block:'start'});
};
function updateSettingsNote(){const s=readSettings();$('settings-summary').textContent=`${s.duration} 秒 · ${s.aspect} · ${s.quality}`;$('settings-note').textContent=`${s.duration} 秒 · 自动安排 ${Math.min(24,Math.max(4,Math.ceil(s.duration/6)))} 个镜头。${s.aspect!=='16:9'||s.quality!=='720p'?'本轮仍输出横屏 720p；其余规格仅存为需求。':'实际输出横屏 720p。'}`;};
for(const id of ['setting-duration','setting-aspect','setting-quality'])$(id).onchange=updateSettingsNote;
loadCatalog().catch(e=>error('result-error','案例库暂时无法加载：'+e.message));
