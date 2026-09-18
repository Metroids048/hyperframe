import library from './workspace-library.json' with {type:'json'};
export const sceneShowcaseDefinitions=library.sceneShowcases||[];
export function currentLibraryProjects(projects){return projects.filter(p=>!library.archivedProjectIds.includes(p.id)).map(p=>({...p,title:library.projectTitles[p.id]||p.title}));}
export function finishedWorkOptions(projects,presets,works){
  projects=currentLibraryProjects(projects);
  works=works.filter(w=>!library.archivedWorkIds.includes(w.id));
  if(library.hidePresets)presets=[];
  else presets=presets.filter(p=>!(library.archivedPresetIds||[]).includes(p.id));
  const visible=projects.filter(p=>p.visibility!=='test'&&p.testOnly!==true&&p.revisions?.some(r=>r.rendered&&r.videoUrl));
  const sources=new Set(visible.map(p=>p.id));
  // Group only known, unchanged imports. Never deduplicate by title or remove history.
  const lineageGroups=new Map();
  for(const p of visible){
    const source=p.preset;
    if(!source?.sourceProjectId||!source.sourceRevisionId||!source.sha256||p.revisions.length!==1||p.currentRevisionId!==p.revisions[0].id)continue;
    const key=JSON.stringify([source.sourceProjectId,source.sourceRevisionId,source.sha256]);
    if(!lineageGroups.has(key))lineageGroups.set(key,{label:'同源未修改副本 · '+(lineageGroups.size+1),ids:[]});
    lineageGroups.get(key).ids.push(p.id);
  }
  const copyGroups=new Map([...lineageGroups.values()].flatMap(g=>g.ids.map(id=>[id,g.label])));
  return [
    ...works.map(w=>({value:'work:'+w.id,group:'我的视频',label:w.title+(w.provenance?.startsWith('reference-')?' · 参考成品':' · 固定导出版')})),
    ...visible.map(p=>{const latest=[...p.revisions].reverse().find(r=>r.rendered&&r.videoUrl);return {value:p.id,group:copyGroups.get(p.id)||'我的视频',label:(p.title||'未命名作品')+' · '+p.id.slice(0,8)+(latest.id!==p.currentRevisionId?' · 最近导出版':'')};}),
    ...presets.filter(p=>p.videoUrl&&!sources.has(p.sourceProjectId)).map(p=>({value:'preset:'+p.id,group:'预设只读浏览',label:p.title}))
  ];
}

export function unfinishedProjectOptions(projects){
  return currentLibraryProjects(projects).filter(p=>p.visibility!=='test'&&p.testOnly!==true&&!p.revisions?.some(r=>r.rendered&&r.videoUrl))
    .map(p=>({value:p.id,label:((!p.title||['新创作','正在打开工程','未命名工程'].includes(p.title))&&p.request?.message?
      p.request.message.slice(0,24)+(p.request.message.length>24?'…':''):p.title||'未命名工程')+' · '+
      (p.jobs?.some(j=>['running','queued'].includes(j.status))?'制作中':p.jobs?.at(-1)?.status==='needs_user'?'需要处理':p.jobs?.at(-1)?.status==='failed'?'制作失败':p.revisions?.length?'待导出':'草稿／可恢复')}));
}
