export function finishedWorkOptions(projects,presets,works){
  const visible=projects.filter(p=>p.visibility!=='test'&&p.testOnly!==true&&p.revisions?.some(r=>r.rendered&&r.videoUrl));
  const sources=new Set(visible.map(p=>p.id));
  return [
    ...works.map(w=>({value:'work:'+w.id,label:w.title+(w.provenance?.startsWith('reference-')?' · 参考成品':' · 导出作品')})),
    ...visible.map(p=>{const latest=[...p.revisions].reverse().find(r=>r.rendered&&r.videoUrl);return {value:p.id,label:(p.title||'未命名作品')+(latest.id!==p.currentRevisionId?' · 最近导出版':'')};}),
    ...presets.filter(p=>p.videoUrl&&!sources.has(p.sourceProjectId)).map(p=>({value:'preset:'+p.id,label:p.title}))
  ];
}

export function unfinishedProjectOptions(projects){
  return projects.filter(p=>p.visibility!=='test'&&p.testOnly!==true&&!p.revisions?.some(r=>r.rendered&&r.videoUrl))
    .map(p=>({value:p.id,label:((!p.title||['新创作','正在打开工程','未命名工程'].includes(p.title))&&p.request?.message?
      p.request.message.slice(0,24)+(p.request.message.length>24?'…':''):p.title||'未命名工程')+' · '+
      (p.jobs?.some(j=>['running','queued'].includes(j.status))?'制作中':p.revisions?.length?'待导出':'草稿／可恢复')}));
}
