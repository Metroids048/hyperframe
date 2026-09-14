import fs from 'node:fs/promises';import path from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
const base='http://127.0.0.1:3024',file='outputs/demo-repair-20260914/state.json',catalogFile='examples/commerce/presets.json';
const ledger=JSON.parse(await fs.readFile(file).catch(()=>'{"works":[]}'));
const save=()=>fs.writeFile(file,JSON.stringify(ledger,null,2));
const api=async(url,body)=>{const r=await fetch(base+url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d;};
async function wait(pid,jid){for(;;){const p=(await api('/api/commerce/'+pid)).project,j=p.jobs.find(j=>j.id===jid);if(!['queued','running'].includes(j.status)){if(j.status!=='complete')throw Error(j.error);return p;}await delay(2000);}}
const copy={
 N1:[['听见，形状。','黑色耳机 · 外观赏析'],['一条弧线，连接两侧'],['从整体，到耳垫轮廓'],['弧形头梁 / 黑色外观'],['回到，完整形状。','实物照片 · 外观演示']],
 N2:[['从外面，看清结构','橄榄绿背包'],['正面织带与银色搭扣'],['外侧拉链 · 实拍细节'],['整体与细节，对照看'],['照片之外，不作推断','内部隔层与容量需更多资料']],
 N3:[['01  围领与交叉','跟随真实动作，保留操作原声'],['02  绕过并穿出'],['03  整理结形'],['04  收拢与调整'],['05  整理完成','Coes Fashion · CC BY 3.0 · 剪辑与中文标注']],
 N4:[['让颜色走在前面','灰蓝 / 酒红 / 亮黄'],['换个角度，看配色'],['整双与后跟，对照看'],['亮黄色，点亮轮廓'],['颜色，自成风格','实物照片 · 外观展示']],
 N5:[['周末试听计划','演示价 ¥399 · 非真实报价'],['演示时间：周六—周日'],['同款外观，两种角度'],['¥399 · 非真实报价'],['周末试听计划','查看商品详情 · 示例活动']],
 N6:[['照片能回答什么？','正面搭扣 / 外侧拉链'],['外侧拉链，实拍可见'],['整体与细节，放在一起看'],['能确认：可见的开合位置'],['还需要哪些资料？','内部隔层与容量，需更多资料']]
};
for(const id of (process.argv[2]?[process.argv[2]]:['N1','N2','N3','N4','N5','N6'])){
 let record=ledger.works.find(w=>w.id===id);if(record?.status==='exported')continue;
 const cat=JSON.parse(await fs.readFile(catalogFile)),entry=cat.find(p=>p.id==='demo-'+id),original=JSON.parse(await fs.readFile(entry.directory+'/document.json'));
 let p=(await api('/api/commerce/'+original.projectId)).project;
 if(!record){record={id,projectId:p.id,before:p.currentRevisionId,status:'inspecting',startedAt:new Date().toISOString()};ledger.works.push(record);await save();}
 try{
 if(record.patchJob){p=await wait(p.id,record.patchJob);}else{
 const rev=p.revisions.find(r=>r.id===p.currentRevisionId),doc=await api(rev.documentUrl),ops=[];
 if(['N2','N6'].includes(id)){
  const name='original-pulse-40s-master.wav';let a=p.assets.find(a=>a.name===name);
  if(!a){const r=await fetch(base+'/api/commerce/'+p.id+'/assets',{method:'POST',headers:{'x-file-name':name},body:await fs.readFile('assets/commerce-rebuild-v2/'+name)}),d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));a=d.asset;}
  if(!doc.audioGraph.some(t=>t.assetId===a.id))ops.push({type:'add_audio',assetId:a.id,params:{role:'music',volume:.8,startFrame:0,durationFrames:doc.durationFrames,sourceStartSeconds:0,fadeInFrames:15,fadeOutFrames:30}});
 }
 for(const t of doc.audioGraph)ops.push({type:'update_audio',nodeId:t.id,params:{volume:id==='N3'?2:.8}});
 for(const [i,s] of doc.scenes.entries()){
  ops.push({type:'set_scene_effect',sceneId:s.id,effect:id==='N3'?'media-cut':'editorial-display',params:id==='N3'?{}:{variant:[0,1,2,1,3][i],palette:['N2','N6'].includes(id)?1:id==='N4'?3:0}});
  const texts=doc.nodes.filter(n=>n.sceneId===s.id&&n.kind==='text');for(const [j,n] of texts.entries()){
   if(copy[id][i]?.[j])ops.push({type:'update_text',nodeId:n.id,text:copy[id][i][j]});
   if(id!=='N3')ops.push({type:'update_text_style',nodeId:n.id,params:{fontSize:j===0?(doc.output.height>doc.output.width?84:88):(doc.output.height>doc.output.width?44:36),fontWeight:j===0?750:550,color:'#172421'}});
  }
  if(id==='N3')for(const n of doc.nodes.filter(n=>n.sceneId===s.id&&n.kind==='video'))ops.push({type:'update_media',nodeId:n.id,params:{fit:'contain'}});
 }
 const result=await api('/api/commerce-chat',{action:'patch',projectId:p.id,baseRevisionId:p.currentRevisionId,idempotencyKey:'home-repair-20260914-v2-'+id,message:'重排主页演示：清晰的大字层级、完整商品画面和双图对照；去掉失准标注和占位文字；补齐配乐并恢复清晰音量。',operations:ops});record.patchJob=result.jobId;record.status='editing';record.lastProgressAt=new Date().toISOString();await save();p=await wait(p.id,result.jobId);
 }
 record.revisionId=p.currentRevisionId;record.status='checked';record.lastProgressAt=new Date().toISOString();await save();console.log(id,'checked',record.revisionId);
 if(!record.exportJob){const r=await api('/api/commerce-chat',{action:'export',projectId:p.id,baseRevisionId:p.currentRevisionId,revisionId:p.currentRevisionId,idempotencyKey:'home-export-'+p.currentRevisionId});record.exportJob=r.jobId;record.status='exporting';await save();}
 p=await wait(p.id,record.exportJob);const rev=p.revisions.find(r=>r.id===record.revisionId);record.directory='data/result-completion-projects/'+p.id+'/'+rev.directory;record.status='exported';record.mediaReview=rev.mediaReview;record.lastProgressAt=new Date().toISOString();await save();console.log(id,'exported',record.directory);
 }catch(e){record.status='failed';record.error=e.message;record.lastProgressAt=new Date().toISOString();await save();console.error(id,e.message);}
}
