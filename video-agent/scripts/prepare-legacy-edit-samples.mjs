import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,probe} from '../lib/edit/media.mjs';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
const dir=path.join(ROOT,'assets/edit-samples');await fs.mkdir(dir,{recursive:true});
await fs.copyFile(path.join(ROOT,'outputs/qing-demo.mp4'),path.join(dir,'product.mp4'));
const coffee=path.join(ROOT,'data/edit-projects/58c0eaec-aaac-47b8-84cc-0eaa289043e7/assets/aaa15e05-59ff-4fcd-b0da-0b7b689ff06a/work.mp4');
await run(ffmpeg,['-y','-v','error','-i',coffee,'-t','40','-c:v','libx264','-preset','fast','-crf','20','-c:a','aac',path.join(dir,'coffee.mp4')]);
const provider=new CodexProvider();const text='这是我们带来的新品。今天，我们一起感受清爽的口感。拿起一瓶，开启轻松时刻。';
await fs.writeFile(path.join(dir,'narration.wav'),await provider.speak(text,'marin','自然普通话女声'));
await run(ffmpeg,['-y','-v','error','-stream_loop','1','-i',path.join(dir,'product.mp4'),'-i',path.join(dir,'narration.wav'),'-map','0:v','-map','1:a','-t','24','-af','apad','-c:v','libx264','-preset','fast','-crf','20','-c:a','aac',path.join(dir,'narration.mp4')]);
const samples=[
 {id:'product',title:'青柠产品短片',description:'15 秒商品视频 · 练习裁切、指定字幕和旁白',prompts:[{label:'剪成 10 秒，加一句字幕',text:'只保留原视频的前 10 秒，在第 2 到 5 秒添加字幕「清爽一刻，即刻出发」。'},{label:'配中文旁白并自动加字幕',text:'从第 1 秒开始添加中文旁白「欢迎体验我们的新品」，同时为这段旁白生成中文字幕，把原声音量降低到百分之十五，画面保持不变。'}]},
 {id:'coffee',title:'咖啡品牌故事',description:'40 秒多镜头短片 · 练习按画面内容编辑',prompts:[{label:'按画面自动添加说明字幕',text:'根据视频里的咖啡画面和已有商品信息，添加 4 条简短的中文字幕，每条 4 到 6 秒，放在画面底部，不要修改已烧录在画面里的文字。'},{label:'精简成 15 秒品牌短片',text:'把视频剪到 15 秒以内，保留开场和展示咖啡产品的内容，不要加速，再在最后 3 秒添加字幕「从一杯好咖啡开始」。'}]},
 {id:'narration',title:'带中文讲解的视频',description:'24 秒 AI 旁白样片 · 练习自动字幕和背景配乐',prompts:[{label:'给讲话自动加中文字幕',text:'为视频中的讲话生成中文字幕，按真实说话时间显示。'},{label:'加入轻快背景音乐',text:'加入内置的轻快背景音乐，从第 0 秒开始铺满前 15 秒，音量百分之二十，开头淡入，结尾淡出，人说话时小声一点。'}]}
];
for(const s of samples){await run(ffmpeg,['-y','-v','error','-ss','2','-i',path.join(dir,s.id+'.mp4'),'-frames:v','1','-vf','scale=480:-2',path.join(dir,s.id+'.jpg')]);s.duration=(await probe(path.join(dir,s.id+'.mp4'))).duration;s.imageUrl=`/api/edit-samples/${s.id}/image`;s.videoUrl=`/api/edit-samples/${s.id}/video`;console.log('Prepared '+s.title);}
const previous=JSON.parse(await fs.readFile(path.join(dir,'catalog.json'),'utf8').catch(()=>'[]'));for(const s of samples){const old=previous.find(p=>p.id===s.id);if(old?.verifiedProjectId){s.verifiedProjectId=old.verifiedProjectId;s.verifiedDuration=old.verifiedDuration;}}
await fs.writeFile(path.join(dir,'catalog.json'),JSON.stringify(samples,null,2));
await fs.writeFile(path.join(dir,'SOURCES.md'),'# Demo 素材\n产品视频来自本项目原有青序演示；咖啡片段来自本机用户上传的现有演示视频，仅本机使用；讲解样片基于产品视频，由 HyperFrames Kokoro 生成中文 AI 旁白。按钮预填的指令由实时 Codex 理解，未预置编辑结果。\n');
