export function repairRoute(error){
  const code=String(error?.code||''),message=String(error?.message||'');
  if(/^(?:HYPERFRAMES_(?:MEDIA_FRAME|PATH)|ISOLATION_[A-Z_]+|ENOENT|EACCES|EPERM|CHECKPOINT_HASH|SCENE_HASH|PREVIEW_EVIDENCE_MISSING)$/.test(code)||/无法启动媒体工具|媒体处理失败|无法读取媒体|video frame injection failed|could not be extracted/i.test(message))return 'environment';
  if(/TIMEOUT|CAPACITY|QUOTA|BUDGET/.test(code)||/超时|timed? out|quota/i.test(message))return 'resume';
  if(code==='KEYFRAME_MEDIA_BINDING')return 'media-binding';
  if(code==='KEYFRAME_SOURCE')return 'source-selection';
  if(code==='KEYFRAME_FACT')return 'fact-binding';
  return 'scene';
}

export function requiredRepairs(issues){return issues.filter(i=>
  ['blocker','major'].includes(i.severity)||
  (i.severity==='minor'&&['layout','text-timing','text-evidence','text-contract'].includes(i.repairKind)&&
    typeof i.problem==='string'&&i.problem.trim()&&typeof i.repair==='string'&&i.repair.trim()));}

export function changesTextContract(issue){
  return issue.repairKind==='text-contract'||/(?:删除|移除|隐藏)[^。；;]{0,32}(?:新增|文字对象|文字层|标题层)|(?:remove|delete|hide)[^.;]{0,40}(?:text|title|overlay)/i.test(issue.repair||'');
}

export function keyframeFailure(issues,{staticOnly=false}={}){
  const required=requiredRepairs(issues).filter(i=>!staticOnly||i.repairKind!=='text-timing');if(!required.length)return null;
  const code=required.some(i=>i.repairKind==='fact-binding')?'KEYFRAME_FACT':required.some(i=>changesTextContract(i)||['source-selection','text-evidence'].includes(i.repairKind))?'KEYFRAME_SOURCE':'KEYFRAME_LAYOUT';
  return Object.assign(Error(JSON.stringify(required)),{code,issues:required});
}
