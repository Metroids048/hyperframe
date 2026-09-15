export function executionStatus(projects){
 const jobs=projects.flatMap(p=>p.jobs.map(j=>({...j,projectId:p.id}))),running=jobs.filter(j=>['queued','running'].includes(j.status));
 const unresolved=jobs.filter(j=>['failed','recoverable','needs_user'].includes(j.status)).sort((a,b)=>(b.completedAt||b.createdAt).localeCompare(a.completedAt||a.createdAt));
 const outputs=projects.flatMap(p=>p.revisions.filter(r=>r.rendered&&r.mediaReview?.status==='media-contract-passed').map(r=>({projectId:p.id,revisionId:r.id,createdAt:r.createdAt})));
 const status=running.length?'running':unresolved.length?(unresolved[0].status==='failed'?'failed':'blocked'):outputs.length?'review_ready':'idle';
 const latest=outputs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]||null;
 return {status,completed:outputs.length,total:jobs.length,activeTask:running[0]?{projectId:running[0].projectId,jobId:running[0].id,status:running[0].status,stage:running[0].stage||null}:null,recentProgressAt:projects.map(p=>p.recentProgressAt).filter(Boolean).sort().at(-1)||null,lastCheckedAt:new Date().toISOString(),lastOutput:latest,blocker:unresolved[0]?{projectId:unresolved[0].projectId,jobId:unresolved[0].id,code:unresolved[0].code,message:unresolved[0].error}:null,assetPool:{discovered:projects.reduce((n,p)=>n+p.assets.length,0)},realTasks:{completed:jobs.filter(j=>j.status==='complete').length,total:jobs.length},humanReview:{status:'pending'}};
}
