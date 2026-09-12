import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run} from '../lib/edit/media.mjs';

const projectId='7c2a6fd3-86d2-43ff-8fdc-dcd62e196443',projectDir=path.join(ROOT,'data/creative-validation',projectId),project=JSON.parse(await fs.readFile(path.join(projectDir,'native-project.json'),'utf8'));
const revision=project.revisions.find(r=>r.id==='rev-86a270ca9d3489c3');
if(!revision?.rendered)throw Error('The reviewed Moka revision has not completed export');
const directory=path.join(projectDir,revision.directory),poster='examples/commerce/covers/moka-story.jpg';
await run(ffmpeg,['-y','-v','error','-threads','2','-ss','14.5','-i',path.join(directory,'commerce-final.mp4'),'-frames:v','1','-vf','scale=960:-2',path.join(ROOT,poster)]);
const preset={
 id:'moka-story',title:'摩卡壶 · 一杯咖啡的日常',category:'实拍自动剪辑',reviewStatus:'ready',
 description:'从研磨、装粉、组装、萃取到倒杯，25秒连贯冲煮叙事。',
 capabilities:['真实动作选镜','原创文字动效','同步操作原声'],
 directory:path.relative(ROOT,directory).replaceAll('\\','/'),sourceProject:path.relative(ROOT,path.join(projectDir,'native-project.json')).replaceAll('\\','/'),poster,
 input:project.request.message,
 note:'已载入25秒实拍商品预设：6段候选动作、完整冲煮过程、原生文字动效与对应操作声。可以播放、下载或继续修改。',
 evidenceNote:'六段输入由Agent辅助从授权实拍中选出；应用随后观察真实画面，自行选镜、编排和生成。点击示例复用固定输出，重新生成会创建新的制作任务。',
 process:[
  {title:'准备有来源的实拍候选镜头',detail:'从授权冲煮视频辅助选出研磨、装粉、组合、萃取、倒杯、成品6段，每段8秒；保留源区间、版权和原文件哈希。'},
  {title:'观察36张真实视频画面',detail:'模型查看6段的实际抽帧，分别确认动作及不确定处，再决定各段内部入点；不是只按文件名编排。'},
  {title:'把48秒候选片段剪成25秒',detail:'按冲煮顺序安排6个镜头，以直切连接；每个镜头保持原速，结尾给成品杯面3.4秒。'},
  {title:'生成原生动效并同步原声',detail:'六幕均为独立视频底层与原创文字、细线叠层。操作声按每个镜头的源区间绑定；未添加配乐、配音或产品功效。'},
  {title:'检查并导出实际成片',detail:'隔离运动检查、完整预览检查、6/6文字对比度、MP4导出及全片播放通过；已核看导出视频的12张逐镜头画面。'}
 ],
 credits:[{label:'Shokuiku Cuisine · CC BY 3.0',url:'https://commons.wikimedia.org/wiki/File:Brewing_Coffee_with_Moka_Alessi_and_Peugeot_Bresil_Mill_-_ASMR_Coffee_Making.webm'}]
};
const file=path.join(ROOT,'examples/commerce/presets.json'),presets=JSON.parse(await fs.readFile(file,'utf8'));
await fs.writeFile(file,JSON.stringify([preset,...presets.filter(p=>p.id!==preset.id)],null,2)+'\n');
console.log(JSON.stringify({id:preset.id,projectId,revisionId:revision.id,poster,presets:presets.length+Number(!presets.some(p=>p.id===preset.id))}));
