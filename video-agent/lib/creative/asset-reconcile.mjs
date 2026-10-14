import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

function assetError(code,id){const error=new Error(`工程素材 ${id} ${code==='ASSET_ORPHANED'?'不存在或不属于当前工程':'内容与登记记录不一致'}`);error.code=code;return error;}
async function digest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function existingFile(file){try{const stat=await fs.stat(file);return stat.isFile()?stat:null;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function insideProject(file,projectDir,subdir=''){
 try{
  const [resolved,project]=await Promise.all([fs.realpath(file),fs.realpath(projectDir)]);
  const relative=path.relative(path.join(project,subdir),resolved);
  return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);
 }catch(error){if(error.code==='ENOENT')return false;throw error;}
}

export async function reconcileProjectAssets(projectDir,assets,{root=projectDir}={}){
 const uploads=path.join(projectDir,'uploads');
 for(const asset of assets||[]){
  if(!/^[A-Za-z0-9_-]+$/.test(String(asset.id||'')))throw assetError('ASSET_ORPHANED',asset.id||'unknown');
  const ext=path.extname(asset.path||asset.originalRef||'').toLowerCase();
  const canonical=path.join(uploads,asset.id+ext);
  const projectUpload=/^uploads\//.test(String(asset.path||''))||String(asset.originalRef||'').startsWith(uploads+path.sep)||String(asset.path||'').includes(`/projects/${path.basename(projectDir)}/uploads/`);
  let candidate=canonical,stat=await existingFile(canonical);
  if(stat&&!await insideProject(canonical,projectDir,'uploads'))throw assetError('ASSET_ORPHANED',asset.id);
  if(!stat){
   const legacy=[asset.originalRef,asset.path&&path.resolve(root,asset.path)].filter(Boolean);
   for(const file of legacy){
    if(path.resolve(file)===canonical)continue;
    const sourceStat=await existingFile(file);
    if(!sourceStat||!asset.sha256||path.basename(file)!==path.basename(canonical)||!await insideProject(file,projectDir))continue;
    if(await digest(file)!==asset.sha256)continue;
    await fs.mkdir(uploads,{recursive:true});await fs.copyFile(file,canonical,{flag:'wx'});
    stat=await existingFile(canonical);
    if(!stat||!await insideProject(canonical,projectDir,'uploads'))throw assetError('ASSET_ORPHANED',asset.id);
    break;
   }
  }
  if(!stat){
   const registered=[asset.originalRef,asset.path&&path.resolve(root,asset.path),asset.path&&path.resolve(projectDir,asset.path)].filter(Boolean);
   for(const file of registered){
    if(!await insideProject(file,projectDir,'uploads'))continue;
    stat=await existingFile(file);
    if(stat){candidate=file;break;}
   }
  }
  if(!stat&&!projectUpload){
   const source=asset.originalRef||path.resolve(root,asset.path||'');
   stat=await existingFile(source);candidate=source;
  }
  if(!stat||!ext)throw assetError('ASSET_ORPHANED',asset.id);
  const actualHash=await digest(candidate);
  if(asset.sha256&&asset.sha256!==actualHash||asset.bytes&&asset.bytes!==stat.size)throw assetError('ASSET_CHANGED',asset.id);
  asset.sha256=actualHash;asset.bytes=stat.size;
  if(candidate===canonical){asset.path=`uploads/${path.basename(canonical)}`;asset.originalRef=canonical;asset.normalizedRef=asset.path;}
 }
 return assets;
}
