import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {insist,safeRelativePath} from './contracts.mjs';
import {readNativeProject} from './runner.mjs';

async function originalInputs(root,entry){
  if(!entry.sourceProject)return null;
  const realRoot=await fs.realpath(root);
  async function checkedFile(relativePath){const file=safeRelativePath(root,relativePath),real=await fs.realpath(file),relative=path.relative(realRoot,real),stat=await fs.stat(real);insist(relative&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)&&stat.isFile(),'预设原始素材必须是工作区内文件','PRESET_INPUT_MISSING');return {real,stat};}
  const {real:sourceFile}=await checkedFile(entry.sourceProject),source=JSON.parse(await fs.readFile(sourceFile,'utf8'));
  insist(Array.isArray(source.assets),'预设输入工程缺少素材清单','PRESET_INPUT_MISSING');
  const ids=entry.inputAssetIds;
  if(ids)insist(Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>source.assets.some(a=>a.id===id)),'预设输入素材选择无效','PRESET_INPUT_MISSING');
  const assets=ids?ids.map(id=>source.assets.find(a=>a.id===id)):source.assets;
  const records=[];
  for(const asset of assets){
    const {real,stat}=await checkedFile(asset.path);
    const hash=createHash('sha256');for await(const chunk of createReadStream(real))hash.update(chunk);const sha256=hash.digest('hex');
    if(asset.sha256)insist(asset.sha256===sha256,'预设原始素材哈希已改变','PRESET_INPUT_CHANGED');
    records.push({...asset,bytes:stat.size,sha256});
  }
  return records;
}
export async function readCreativePresets(root){
  const definitions=JSON.parse(await fs.readFile(path.join(root,'examples/commerce/presets.json'),'utf8'));
  const ready=[];
  for(const entry of definitions){
    const directory=safeRelativePath(root,entry.directory);
    try{
      const {document,assets}=await readNativeProject(directory),video=path.join(directory,'commerce-final.mp4');
      insist((await fs.stat(video)).size>1000,'预设样片不存在','PRESET_MISSING');
      for(const a of assets)await fs.access(safeRelativePath(directory,a.compiledRef));
      const hash=createHash('sha256');for await(const chunk of createReadStream(video))hash.update(chunk);
      let poster=null;
      if(entry.poster){const posterPath=safeRelativePath(root,entry.poster);poster='data:image/jpeg;base64,'+(await fs.readFile(posterPath)).toString('base64');}
      const originalAssets=await originalInputs(root,entry);
      ready.push({...entry,poster,directory,document,assets,originalAssets,sha256:hash.digest('hex')});
    }catch(error){console.warn(`演示预设 ${entry.id} 暂不可用：${error.message}`);}
  }
  return ready;
}
export const publicPreset=p=>({id:p.id,title:p.title,sourceProjectId:p.document.projectId,previewUrl:`/api/commerce/${p.document.projectId}/revisions/${p.document.revisionId}/preview.html`,videoUrl:`/api/commerce/${p.document.projectId}/revisions/${p.document.revisionId}/commerce-final.mp4`,input:p.input,note:p.note,sha256:p.sha256,durationSeconds:p.document.durationFrames/30,output:p.document.output,category:p.category||'基础示例',reviewStatus:p.reviewStatus||'ready',description:p.description||p.note,capabilities:p.capabilities||[],process:p.process||[],credits:p.credits||[],poster:p.poster||null,evidenceNote:p.evidenceNote||'',assetCount:(p.originalAssets||p.assets).length,inputs:(p.originalAssets||[]).map(a=>({id:a.id,name:a.name,kind:a.kind,sha256:a.sha256})),inputProvenance:p.originalAssets?'original-uploads':'historical-normalized',beats:p.document.scenes.map((scene,i)=>({startSeconds:scene.startFrame/30,endSeconds:(scene.startFrame+scene.durationFrames)/30,title:p.document.nodes.find(n=>n.sceneId===scene.id&&n.kind==='text'&&n.semanticRole==='title')?.params.text||'第 '+(i+1)+' 幕'}))});
