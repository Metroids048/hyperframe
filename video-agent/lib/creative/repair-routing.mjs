export function repairRoute(error){
  const code=String(error?.code||''),message=String(error?.message||'');
  if(/^(?:HYPERFRAMES_(?:MEDIA_FRAME|PATH)|ISOLATION_[A-Z_]+|ENOENT|EACCES|EPERM|CHECKPOINT_HASH|SCENE_HASH|PREVIEW_EVIDENCE_MISSING)$/.test(code)||/无法启动媒体工具|媒体处理失败|无法读取媒体|video frame injection failed|could not be extracted/i.test(message))return 'environment';
  if(/TIMEOUT|CAPACITY|QUOTA|BUDGET/.test(code)||/超时|timed? out|quota/i.test(message))return 'resume';
  if(code==='KEYFRAME_SOURCE')return 'source-selection';
  if(code==='KEYFRAME_FACT')return 'fact-binding';
  return 'scene';
}

export function requiredRepairs(issues){return issues.filter(i=>['blocker','major'].includes(i.severity));}

export function keyframeFailure(issues){
  const required=requiredRepairs(issues);if(!required.length)return null;
  const code=required.some(i=>i.repairKind==='fact-binding')?'KEYFRAME_FACT':required.some(i=>['source-selection','text-evidence'].includes(i.repairKind))?'KEYFRAME_SOURCE':'KEYFRAME_LAYOUT';
  return Object.assign(Error(JSON.stringify(required)),{code,issues:required});
}
