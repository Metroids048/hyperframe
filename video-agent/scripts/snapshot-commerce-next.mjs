import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const dir=path.join(root,'outputs/commerce-next');
await fs.mkdir(dir,{recursive:true});
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>f&&/\.(mjs|js|json|html|css|md)$/.test(f)&&!f.startsWith('outputs/'));
const entries=[];for(const f of files){const b=await fs.readFile(path.join(root,f));entries.push({file:f,sha256:sha(b)});}
const fingerprint={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:entries,sha256:sha(JSON.stringify(entries)),capturedAt:new Date().toISOString()};
await fs.writeFile(path.join(dir,'baseline/fingerprint.json'),JSON.stringify(fingerprint,null,2),{flag:'wx'});
const file='assets/commerce-showcase/moka-brewing.webm';
const source=JSON.parse(await fs.readFile(path.join(root,'assets/commerce-showcase/sources.json'),'utf8')).find(x=>x.file==='moka-brewing.webm');
const task={id:'Q02-moka60',file,sha256:sha(await fs.readFile(path.join(root,file))),source,sourceDurationSeconds:301.472,message:JSON.parse(await fs.readFile(path.join(dir,'baseline/browser-input.json'),'utf8')).message,output:{width:1920,height:1080,fps:30,durationFrames:1800},groups:['reference-author','baseline-product','current-product'],notes:['完整已有剪辑源片，不是原始B-roll','不提供旧片分镜、预剪答案或参考源码','用户已选择此素材；授权状态沿用来源记录，发布仍待审核']};
await fs.writeFile(path.join(dir,'frozen-task.json'),JSON.stringify(task,null,2),{flag:'wx'});
const holdout=[
 ['H01','无场景词','把提供材料讲清楚，60秒，只用已有信息。'],
 ['H02','同目标多图','用照片和已确认说明做45秒介绍，不编造实拍。'],
 ['H03','同目标实拍','用操作片做45秒介绍，保留动作和原声。'],
 ['H04','长中文','保留全部活动条件，中文较长时重新排版，15秒。'],
 ['H05','不同款混入','只介绍指定型号，排除其他型号，不能仅凭相似外观确认。'],
 ['H06','单图资料充分','只有一张照片和足量批准说明，做90秒解释型视频。'],
 ['H07','多动作单源','从一段长视频里找完整操作，剪成一分钟。'],
 ['H08','中英品牌','保留提供的中英品牌原文，统一字号与字体。'],
 ['H09','明确静音','把这些资料做成60秒静音视频，不加音乐和配音。'],
 ['H10','单对象修改','只改指定标题，素材、声音、其他文字和时长保持。']
].map(([id,dimension,message])=>({id,dimension,message,status:'frozen-requires-case-inputs'}));
await fs.writeFile(path.join(dir,'holdout.json'),JSON.stringify({frozenAt:new Date().toISOString(),cases:holdout},null,2),{flag:'wx'});
console.log(JSON.stringify({fingerprint:fingerprint.sha256,task:task.id,sourceHash:task.sha256}));
