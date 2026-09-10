import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {ffmpeg,run,probe,hashFile} from '../lib/edit/media.mjs';
// Sources stay separate from prepared excerpts. No edited result is preloaded.
const downloads=path.join(ROOT,'assets/source-downloads'),dir=path.join(ROOT,'assets/edit-samples');
await fs.mkdir(dir,{recursive:true});
const specs=[
  {id:'tears-of-steel',file:'tears_of_steel_1080p.mov',start:185,end:275,title:'真人对白与科幻动作',description:'90 秒 · Tears of Steel · 真人实拍与 CGI 合成，多人对白与多个镜头',sourceUrl:'https://download.blender.org/demo/movies/ToS/tears_of_steel_1080p.mov.zip',pageUrl:'https://mango.blender.org/',license:'CC BY 3.0',licenseUrl:'https://mango.blender.org/sharing/',attribution:'(CC) Blender Foundation | mango.blender.org',language:'en',nature:'live-action with CGI',boundaryEvidence:'官方英文字幕第 15–32 条完整位于节选内；第一句 03:11 开始，最后一句 04:08 结束。抽帧核对 03:05–04:35，无片头片尾文字，包含多人讲话、室内控制室和街头运动。',prompts:[{label:'删开头，加片尾标题',text:'删除开头 3 秒，在成片最后 3 秒添加标题「行动开始」，保留原声，不加旁白。'},{label:'生成讲话字幕',text:'为原片中人物的英语讲话生成英文字幕，按实际说话时间显示，不加旁白。'},{label:'精简对白与行动',text:'精简成 45 秒以内，保留准备行动的对白和人物走向街道的画面，尽量保持整句，不加速。'}]},
  {id:'viewport-navigation',file:'viewport-navigation.mp4',start:0,end:null,title:'Blender 视图操作教程',description:'约 3 分 42 秒 · 真实软件录屏和英文讲解',sourceUrl:'https://studio.blender.org/download-source/files/06/0668bfc9e77564face0be66ab05e603a/0668bfc9e77564face0be66ab05e603a.1080p.mp4',pageUrl:'https://studio.blender.org/training/blender-2-8-fundamentals/viewport-navigation/',license:'CC BY 4.0',licenseUrl:'https://studio.blender.org/training/blender-2-8-fundamentals/viewport-navigation/',attribution:'Viewport Navigation — Mike Newbon / Blender Studio, CC BY 4.0',language:'en',nature:'screen recording with human narration',boundaryEvidence:'使用完整公开教程，保留全部讲解句子；没有人为拼接图片。',prompts:[{label:'裁切和标题',text:'只保留前 60 秒，前 3 秒显示标题「认识 Blender 视图」，保留原来的讲解声音。'},{label:'按主题提取',text:'只保留演示旋转视图的操作和对应完整讲解，删除其他操作的讲解。'},{label:'添加中文字幕',text:'为英语讲解添加准确的中文字幕，不改变原声。'}]},
];
const extra=JSON.parse(await fs.readFile(path.join(downloads,'additional-samples.json'),'utf8').catch(()=>'[]'));specs.push(...extra);
const catalog=[],manifest={schemaVersion:1,frozenAt:new Date().toISOString(),fps:30,sourcePolicy:'Independent raw sources; clips are imported without precomputed edits.',samples:[]};
for(const spec of specs){
  const source=path.join(downloads,spec.file),target=path.join(dir,spec.id+'.mp4');
  await fs.access(source);const sourceHash=await hashFile(source),receiptFile=path.join(dir,spec.id+'.source.json');
  const crf=spec.crf??(spec.id==='mandarin-interview'?25:19);
  const signature=JSON.stringify({sourceHash,start:spec.start,end:spec.end,fps:30,crf});
  const previous=JSON.parse(await fs.readFile(receiptFile,'utf8').catch(()=>'{}'));
  if(previous.signature!==signature||!(await fs.access(target).then(()=>true).catch(()=>false))){
    await run(ffmpeg,['-y','-v','error','-ss',String(spec.start||0),'-i',source,...(spec.end!=null?['-t',String(spec.end-(spec.start||0))]:[]),'-map','0:v:0','-map','0:a:0?','-vf','scale=1920:1080:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=30','-c:v','libx264','-preset','fast','-crf',String(crf),'-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','160k','-movflags','+faststart',target],{timeout:900000});
  }
  const info=await probe(target),sha256=await hashFile(target);
  await run(ffmpeg,['-y','-v','error','-ss','6','-i',target,'-frames:v','1','-vf','scale=480:-2',path.join(dir,spec.id+'.jpg')]);
  const {file,start,end,prompts,boundaryEvidence,...publicInfo}=spec;
  const receipt={...spec,signature,sourceSha256:sourceHash,sha256,sourceRangeSeconds:{start,end:end??info.duration},prepared:{file:spec.id+'.mp4',...info},review:{method:'Official subtitles and sampled source frames; no expert quality score',boundaryEvidence},preparedAt:new Date().toISOString()};
  await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2));manifest.samples.push(receipt);
  catalog.push({...publicInfo,prompts,duration:info.duration,sha256,imageUrl:`/api/edit-samples/${spec.id}/image`,videoUrl:`/api/edit-samples/${spec.id}/video`});console.log('Prepared '+spec.id+' '+info.duration+'s '+sha256);
}
await fs.writeFile(path.join(dir,'catalog.json'),JSON.stringify(catalog,null,2));await fs.writeFile(path.join(dir,'source-manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(dir,'SOURCES.md'),'# 真实剪辑样例\n\n'+manifest.samples.map(s=>`- **${s.title}**：${s.attribution}；[来源](${s.sourceUrl})；[许可 ${s.license}](${s.licenseUrl})。${s.nature}。原片节选 ${s.sourceRangeSeconds.start}–${s.sourceRangeSeconds.end} 秒。SHA-256：${s.sha256}。`).join('\n\n')+'\n\n完整来源、原文件哈希和节选依据见 source-manifest.json。首页只导入原片；发送剪辑要求后才调用真实模型。旧 product/coffee/narration 文件和 legacy-catalog.json 保留作历史演示。\n');
