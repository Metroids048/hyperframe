export function finishedWorkOptions(projects,presets,works){
  const visible=projects.filter(p=>p.visibility!=='test'&&p.testOnly!==true&&p.revisions?.some(r=>r.rendered&&r.videoUrl));
  const sources=new Set(visible.map(p=>p.id));
  return [
    ...works.map(w=>({value:'work:'+w.id,label:w.title+' · 参考成品'})),
    ...visible.map(p=>{const latest=[...p.revisions].reverse().find(r=>r.rendered&&r.videoUrl);return {value:p.id,label:(p.title||'未命名作品')+(latest.id!==p.currentRevisionId?' · 最近导出版':'')};}),
    ...presets.filter(p=>p.videoUrl&&!sources.has(p.sourceProjectId)).map(p=>({value:'preset:'+p.id,label:p.title}))
  ];
}
