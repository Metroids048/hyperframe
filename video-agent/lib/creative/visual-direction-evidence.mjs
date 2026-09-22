import fs from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,run,probe,hashFile} from '../edit/media.mjs';

// A small, local, content-addressed reference shelf. References are design
// evidence only: they never enter the product facts or source bindings.
export const visualReferenceLibrary=[
 {id:'product-reveal',match:['launch','新品','种草','hero','brand'],source:'deliverables/mijia-v2/mijia-product-ad-v2.mp4',principles:['先让主体被认出，再让标题分层进入','整体到细节要有明确动机'],avoid:['复制品牌、商品、固定构图'],fits:['有清晰整体商品素材','需要前三秒建立识别']},
 {id:'detail-follow',match:['detail','卖点','keyboard','键盘','精度'],source:'assets/commerce-keyboard/01-keyboard-close.mp4',principles:['先定位整体，再以引导线指向真实局部','标注跟随证据而不是盖住证据'],avoid:['无依据的霓虹和参数标注'],fits:['局部细节清楚','主体有安全裁切余量']},
 {id:'action-proof',match:['demo','howto','教程','操作','使用','coffee','咖啡'],source:'assets/commerce-motion/04-extract.mp4',principles:['动作完成点决定文字强调时刻','实拍运动优先，步骤提示避开操作区'],avoid:['倒放、循环或靠转场伪造动作'],fits:['真实动作连续可见','需要证明使用过程']},
 {id:'material-close',match:['serum','化妆','材质','texture','premium'],source:'assets/commerce-serum/drop-8131887.mp4',principles:['保留留白和材质层次','包装与局部之间保持同一锚点'],avoid:['无依据的功效前后对比'],fits:['包装与材质近景都真实可用']}
];

const normalize=value=>String(value||'').toLowerCase();
function score(reference,query){const text=normalize(query),hits=reference.match.filter(token=>text.includes(normalize(token)));return hits.length;}
export function selectVisualReferences({message='',scenarioId='',category='',marketingObjective='',creativeDirection=''}={}){
 const query=[message,scenarioId,category,marketingObjective,creativeDirection].join(' ');
 return [...visualReferenceLibrary].map((ref,index)=>({...ref,score:score(ref,query),rank:index})).sort((a,b)=>b.score-a.score||a.rank-b.rank).slice(0,2);
}

// The old function signature remains valid. New callers provide intent so the
// shelf can choose by product/goal/material shape instead of a fixed film.
export async function visualDirectionReference(root,outputDir,{signal,message='',scenarioId='',category='',marketingObjective='',creativeDirection='',limit=2}={}){
 const selected=selectVisualReferences({message,scenarioId,category,marketingObjective,creativeDirection}).slice(0,limit);
 const folder=path.join(outputDir,'direction-reference');await fs.mkdir(folder,{recursive:true});
 const inputs=[],references=[];
 for(const reference of selected){
  const source=path.join(root,reference.source);
  try{await fs.access(source);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const metadata=await probe(source,signal),sourceSha256=await hashFile(source),duration=Number(metadata.duration||0);
  if(!(duration>0))continue;
  const id=reference.id,frames=[];
  for(const [i,fraction] of [.2,.5,.8].entries()){
   const seconds=Math.min(Math.max(0,duration-1/30),duration*fraction),name=`${id}-${i}.jpg`,file=path.join(folder,name);
   await run(ffmpeg,['-y','-v','error','-ss',String(seconds),'-i',source,'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',file],{signal,timeout:30000});
   frames.push({file:'direction-reference/'+name,seconds,sha256:await hashFile(file)});
   inputs.push({type:'input_text',text:`参考 ${id} 的关键画面（${seconds.toFixed(2)} 秒）。只借鉴信息层级与镜头关系。`},{type:'input_image',image_url:'data:image/jpeg;base64,'+(await fs.readFile(file)).toString('base64')});
  }
  const previewName=`${id}-motion.mp4`,previewFile=path.join(folder,previewName),previewSeconds=Math.min(4,Math.max(2,duration));
  await run(ffmpeg,['-y','-v','error','-ss','0','-i',source,'-t',String(previewSeconds),'-an','-vf','scale=640:640:force_original_aspect_ratio=decrease','-c:v','libx264','-preset','ultrafast','-crf','30','-pix_fmt','yuv420p',previewFile],{signal,timeout:60000});
  references.push({id,source:reference.source,sourceSha256,frames,motionPreview:`direction-reference/${previewName}`,motionPreviewSha256:await hashFile(previewFile),motionPreviewSeconds:previewSeconds,principles:reference.principles,avoid:reference.avoid,fits:reference.fits,productEvidence:false,qualityAccepted:false});
 }
 const receipt={version:2,status:references.length?'sampled':'unavailable',purpose:'quality-reference-only',selection:{message,scenarioId,category,marketingObjective,creativeDirection},references,productEvidence:false,qualityAccepted:false,notObserved:['完整视听相似度','参考片授权进入成片','参考片商品事实']};
 await fs.writeFile(path.join(folder,'receipt.json'),JSON.stringify(receipt,null,2));
 return {inputs,receipt};
}
