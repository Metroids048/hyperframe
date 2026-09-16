import {insist} from './contracts.mjs';
import {requiredRepairs} from './repair-routing.mjs';

// A late source defect is a different repair owner from an already fixed layout.
// One concrete window per recovery, within the existing two source repairs.
export function sourceWindowRecoveryTarget(run,document,report,assets){
 const issues=requiredRepairs(report.issues||[]);
 if(!issues.length||issues.some(i=>i.repairKind!=='source-selection')||new Set(issues.map(i=>i.sceneId)).size!==1)return null;
 const index=document.scenes.findIndex(s=>s.id===issues[0].sceneId),story=run.checkpoints.story?.result,shot=story?.scenes[index];
 if(!shot||shot.media.length!==1||(run.artifacts.sourceShotRepairCounts?.[index]||0)>=2)return null;
 const media=shot.media[0],asset=assets.find(a=>a.id===media.assetId),duration=shot.durationSeconds*(media.playbackRate??1);
 if(asset?.kind!=='video'||duration>8)return null;
 return {index,issues,assetId:asset.id,inspection:{assetId:asset.id,startSeconds:Math.max(0,(media.sourceStartSeconds||0)-2),endSeconds:Math.min(asset.mediaMetadata.duration,(media.sourceStartSeconds||0)+duration+2),reason:'Late source defect: inspect actual adjacent cut and lighting boundaries before changing only the source window'}};
}

export function replaceSourceWindow(story,index,answer,assets){
 const revised=structuredClone(story),shot=revised.scenes[index],media=shot.media[0],asset=assets.find(a=>a.id===media.assetId);
 const end=answer.sourceStartSeconds+shot.durationSeconds*(media.playbackRate??1);
 insist(Number.isFinite(answer.sourceStartSeconds)&&answer.sourceStartSeconds>=0&&end<=asset.mediaMetadata.duration,'修复选段超出源片','SOURCE_SELECTION');
 insist(Math.abs(answer.sourceStartSeconds-(media.sourceStartSeconds||0))>1e-6,'源区间未变化，不能重复评审同一问题','REPAIR_NO_PROGRESS');
 insist(typeof answer.reason==='string'&&answer.reason.trim(),'源选段修复缺少真实观察依据','SOURCE_SELECTION');
 media.sourceStartSeconds=answer.sourceStartSeconds;shot.reason=answer.reason;
 return revised;
}
