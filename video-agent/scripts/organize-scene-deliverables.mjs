import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MATERIALS=path.resolve(ROOT,'../素材');
const stamp='20260918';
const sceneNames=['新品首发','商品详情','使用教程','搭配系列','促销预告','选购问答','已有视频精剪','一稿多版'];
const sha=async file=>{const hash=createHash('sha256');hash.update(await fs.readFile(file));return hash.digest('hex');};
const exists=file=>fs.stat(file).then(s=>s.isFile(),()=>false);
async function publish(source,destination){
  if(!await exists(source))return false;
  await fs.mkdir(path.dirname(destination),{recursive:true});
  if(await exists(destination)){
    if(await sha(source)!==await sha(destination))throw Error(`目标文件冲突，未覆盖：${destination}`);
    return true;
  }
  try{await fs.link(source,destination);}catch(error){if(!['EXDEV','EPERM','EACCES'].includes(error.code))throw error;await fs.copyFile(source,destination,fs.constants.COPYFILE_EXCL);}
  if(await sha(source)!==await sha(destination))throw Error(`文件校验失败：${destination}`);
  return true;
}
async function moveDirectory(source,destination){
  try{await fs.access(source);}catch{return;}
  try{await fs.access(destination);return;}catch{}
  await fs.rename(source,destination);
}

const current=path.join(MATERIALS,'场景成片');
const legacy=path.join(MATERIALS,`.场景成片-旧清单-${stamp}`);
const marker=path.join(current,'.curated-v2');
if(!await exists(marker))await moveDirectory(current,legacy);
await fs.mkdir(current,{recursive:true});
await fs.writeFile(marker,'当前目录只放与八场景制作卡一致的有效结果；旧清单保存在相邻隐藏目录。\n');

const currentSources={
  S02:['S02_商品详情_显卡外观与部位.mp4',path.join(legacy,'S02-显卡外观与部位.mp4')],
  S03:['S03_使用教程_即食饭流程.mp4',path.join(legacy,'S03-即食饭使用流程.mp4')],
  S04:['S04_搭配系列_首饰搭配.mp4',path.join(legacy,'S04-首饰搭配.mp4')],
  S05:['S05_促销预告_香氛直播预告.mp4',path.join(legacy,'香氛展示直播-预告.mp4')],
  S07:['S07_已有视频精剪_握力球V2.mp4',path.join(legacy,'S07-使用过程-V2.mp4')],
  S08M:['S08_一稿多版_咖啡母版.mp4',path.join(ROOT,'deliverables/s08-coffee-demo-20260918/master/demo.mp4')],
  S08A:['S08_一稿多版_咖啡A版.mp4',path.join(ROOT,'deliverables/s08-variants-demo-20260918/A/demo.mp4')],
};
for(const [name,source] of Object.values(currentSources))await publish(source,path.join(current,name));
await fs.writeFile(path.join(current,'S01_新品首发_尚未完成.md'),'# S01 新品首发\n\n当前没有符合制作卡的有效成片。已取消的草稿不会放入当前成片目录。\n');
await fs.writeFile(path.join(current,'S06_选购问答_尚未完成.md'),'# S06 选购问答\n\n当前没有符合制作卡、且问答与真实画面证据对应的有效成片。\n');

const report=[];
for(let index=0;index<sceneNames.length;index++){
  const id=`S${String(index+1).padStart(2,'0')}`,sceneRoot=path.join(MATERIALS,`${id}_${sceneNames[index]}`),internal=path.join(sceneRoot,'.内部记录');
  const raw=path.join(sceneRoot,'01_原始视频'),optimized=path.join(sceneRoot,'02_优化后视频'),history=path.join(sceneRoot,'03_历史与参考');
  await Promise.all([fs.mkdir(raw,{recursive:true}),fs.mkdir(optimized,{recursive:true}),fs.mkdir(history,{recursive:true}),fs.mkdir(internal,{recursive:true})]);
  for(const old of ['原始素材','Agent候选','参考作品','历史输出'])await moveDirectory(path.join(sceneRoot,old),path.join(internal,old));
  const rawSource=path.join(internal,'原始素材');
  for(const name of await fs.readdir(rawSource).catch(()=>[]))if(/\.(?:mp4|webm|mov)$/i.test(name))await publish(path.join(rawSource,name),path.join(raw,name));
  const agentSource=path.join(internal,'Agent候选');
  for(const name of await fs.readdir(agentSource).catch(()=>[]))if(/\.(?:mp4|webm|mov)$/i.test(name))await publish(path.join(agentSource,name),path.join(optimized,name));
  for(const category of ['参考作品','历史输出']){
    const source=path.join(internal,category);
    for(const name of await fs.readdir(source).catch(()=>[]))if(/\.(?:mp4|webm|mov)$/i.test(name))await publish(path.join(source,name),path.join(history,name));
  }
  for(const [key,[name,source]] of Object.entries(currentSources))if(key.startsWith(id))await publish(source,path.join(optimized,name));
  const legacyByScene={
    S02:['相机外观与细节.mp4','米家相机-广告精剪-V2.mp4'],
    S04:['S04-光影成组.mp4','系结教程-紫色领饰.mp4'],
  }[id]||[];
  for(const name of legacyByScene)await publish(path.join(legacy,name),path.join(history,name));
  const optimizedMedia=(await fs.readdir(optimized)).filter(name=>/\.(?:mp4|webm|mov)$/i.test(name));
  const historyMedia=(await fs.readdir(history)).filter(name=>/\.(?:mp4|webm|mov)$/i.test(name));
  if(!optimizedMedia.length)await fs.writeFile(path.join(optimized,'尚未完成.md'),`# ${id} ${sceneNames[index]}\n\n当前没有符合制作卡的有效优化成片，不能用参考片或废弃片占位。\n`);
  if(!historyMedia.length)await fs.writeFile(path.join(history,'暂无历史视频.md'),`# ${id} ${sceneNames[index]}\n\n当前没有需要保留的旧成片。\n`);
  const rawMedia=(await fs.readdir(raw)).filter(name=>/\.(?:mp4|webm|mov)$/i.test(name));
  await fs.writeFile(path.join(sceneRoot,'00_目录说明.md'),`# ${id} ${sceneNames[index]}\n\n- 原始视频：${rawMedia.length} 个\n- 当前优化后视频：${optimizedMedia.length} 个\n- 历史与参考视频：${historyMedia.length} 个\n\n当前成片和历史参考严格分开；隐藏目录 \`.内部记录\` 仅保留旧索引与技术状态。\n`);
  report.push({id,title:sceneNames[index],raw:rawMedia,optimized:optimizedMedia,history:historyMedia});
}
await fs.writeFile(path.join(MATERIALS,'场景文件现状.json'),JSON.stringify({schemaVersion:2,generatedAt:new Date().toISOString(),currentDirectory:'场景成片',legacyDirectory:path.basename(legacy),scenes:report},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
