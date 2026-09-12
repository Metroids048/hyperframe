import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run} from '../lib/edit/media.mjs';

const projectId=process.argv[2];if(!/^[a-f0-9-]{36}$/.test(projectId||''))throw Error('A reviewed project id is required');const projectDir=path.join(ROOT,'data/creative-validation',projectId),project=JSON.parse(await fs.readFile(path.join(projectDir,'native-project.json'),'utf8')),revision=project.revisions.find(r=>r.id===project.currentRevisionId);
if(!revision?.rendered)throw Error('The keyboard example requires a completed MP4 export');
const directory=path.join(projectDir,revision.directory),document=JSON.parse(await fs.readFile(path.join(directory,'document.json'),'utf8')),poster='examples/commerce/covers/keyboard-ad.jpg';
await run(ffmpeg,['-y','-v','error','-threads','2','-ss','2.8','-i',path.join(directory,'commerce-final.mp4'),'-frames:v','1','-vf','scale=960:-2',path.join(ROOT,poster)]);
const preset={
 id:'keyboard-promo',title:'键盘 · 敲出你的节奏',category:'数码商品',reviewStatus:'ready',
 description:'双角度真实打字，加上大标题、遮罩文字和键帽细节标注。',
 capabilities:['遮罩文字揭示','局部角框标注','错层广告编排'],
 directory:path.relative(ROOT,directory).replaceAll('\\','/'),sourceProject:path.relative(ROOT,path.join(projectDir,'native-project.json')).replaceAll('\\','/'),poster,input:project.request.message,
 note:'已载入15秒键盘商品广告预设：两个真实视频角度，独立文字、指示线和角框动画，可继续修改。源素材无音轨，本例保持无声。',
 evidenceNote:'使用Mikhail Nilov提供的两段Pexels实拍；布景灯光只作为画面设计，不作为键盘功能宣传。点击示例复用固定输出，重新生成会再次运行模型。',
 process:[
  {title:'上传两段真实商品视频',detail:'整体斜角与低机位近景来自同一摄影师；保留15.8秒和16.16秒的原始输入文件、来源与哈希。'},
  {title:'观察画面并约束商品信息',detail:'模型查看真实键盘、键帽和打字动作；不猜品牌、轴体或响应性能，不把布景灯带当成自带RGB。'},
  {title:'编排三幕广告节奏',detail:document.scenes.map((s,i)=>`第${i+1}幕${(s.durationFrames/30).toFixed(1)}秒`).join('，')+'。整体大标题、键帽近景、回到整体收尾，真实视频始终是主体。'},
  {title:'生成原创叠层并导出',detail:'主标题、错层文字、角框和指示线分别保留原生对象；完成运动与预览检查，再导出15秒MP4。原片无音轨，不添加未授权声音。'}
 ],
 credits:[{label:'Mikhail Nilov · Pexels',url:'https://www.pexels.com/video/a-person-typing-on-a-keyboard-7534237/'},{label:'第二角度',url:'https://www.pexels.com/video/a-person-typing-on-a-keyboard-7534236/'},{label:'Pexels License',url:'https://www.pexels.com/license/'}]
};
const file=path.join(ROOT,'examples/commerce/presets.json'),presets=JSON.parse(await fs.readFile(file,'utf8'));
await fs.writeFile(file,JSON.stringify([preset,...presets.filter(p=>p.id!==preset.id)],null,2)+'\n');
console.log(JSON.stringify({id:preset.id,projectId,revisionId:revision.id,poster}));
