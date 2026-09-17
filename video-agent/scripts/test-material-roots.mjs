import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {discoverMaterialRoots,publicMaterialRoot,resolveMaterialRoot,selectMaterialEntries} from '../lib/creative/material-roots.mjs';
import {hashFile} from '../lib/edit/media.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';

test('authorized material index preserves originals, distinguishes names and errors, and does not follow escaping or derived links',async()=>{
 const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'hf-material-index-'));
 try{
  const root=path.join(sandbox,'workspace'),source=path.join(root,'素材 空格');
  await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.mkdir(path.join(root,'assets'));
  await fs.writeFile(path.join(root,'config/commerce.json'),JSON.stringify({commerce:{materialRoots:['素材 空格','不存在']}}));
  const image=async(file,color)=>{await fs.mkdir(path.dirname(file),{recursive:true});await sharp({create:{width:12,height:8,channels:3,background:color}}).png().toFile(file);};
  const first=path.join(source,'甲','同名.png'),second=path.join(source,'乙','同名.png');await image(first,'red');await image(second,'blue');
  const before={[first]:await hashFile(first),[second]:await hashFile(second)};
  await image(path.join(source,'深','一','二','三','四','五','六','清晰.png'),'green');
  for(let n=0;n<31;n++)await image(path.join(source,'大目录',n+'.png'),'yellow');
  await image(path.join(source,'outputs','new-product.png'),'red');await image(path.join(source,'poster-01.png'),'red');
  const native=path.join(source,'改名工程');await image(path.join(native,'still.png'),'red');await fs.writeFile(path.join(native,'document.json'),'{}');await fs.writeFile(path.join(native,'hyperframes.json'),'{}');
  const outside=path.join(sandbox,'private');await image(path.join(outside,'secret.png'),'purple');
  await fs.symlink(outside,path.join(source,'外部链接'),process.platform==='win32'?'junction':'dir');
  await fs.symlink(path.join(source,'甲'),path.join(source,'内部链接'),process.platform==='win32'?'junction':'dir');
  await fs.symlink(path.join(source,'outputs'),path.join(source,'伪装链接'),process.platform==='win32'?'junction':'dir');
  await fs.writeFile(path.join(source,'损坏.mp4'),'not a video');
  await fs.mkdir(path.join(source,'受限'));
  const filesystem={...fs,readdir:async(file,options)=>{if(path.basename(file)==='受限')throw Object.assign(Error('denied'),{code:'EACCES'});return fs.readdir(file,options);}};
  const result=await discoverMaterialRoots(root,{filesystem}),index=result.find(r=>r.label==='素材 空格');
  assert.equal(result.find(r=>r.label==='不存在').status,'missing');assert.equal(index.status,'partial');
  assert.ok(index.diagnostics.some(d=>d.code==='EACCES'));assert.ok(index.excluded.some(e=>e.reason==='outside_authorized_root'));
  assert.equal(index.entries.length,35);assert.equal(index.files.length,34);
  const same=index.entries.filter(e=>e.name==='同名.png');assert.equal(same.length,2);assert.notEqual(same[0].id,same[1].id);assert.notEqual(same[0].sha256,same[1].sha256);
  assert.ok(index.entries.some(e=>e.relativePath.includes('六/清晰.png')));
  assert.ok(index.entries.every(e=>!e.relativePath.includes('secret')&&!e.relativePath.includes('outputs')&&!e.relativePath.includes('改名工程')));
  assert.equal(index.entries.find(e=>e.name==='损坏.mp4').technicalStatus,'probe_failed');
  assert.equal(selectMaterialEntries(index,same.map(e=>e.id)).length,2);
  assert.throws(()=>selectMaterialEntries(index,[]),{code:'MATERIAL_SELECTION_REQUIRED'});
  assert.throws(()=>selectMaterialEntries(index,['../private/secret.png']),{code:'MATERIAL_CHANGED'});
  assert.throws(()=>selectMaterialEntries(index,[index.entries.find(e=>e.name==='损坏.mp4').id]),{code:'MATERIAL_PROBE_FAILED'});
  assert.ok(!JSON.stringify(publicMaterialRoot(index)).includes(sandbox));
  for(const [file,hash]of Object.entries(before))assert.equal(await hashFile(file),hash);
  await image(first,'white');const changed=(await discoverMaterialRoots(root)).find(r=>r.id===index.id);
  const canonicalFirst=await fs.realpath(first);
  assert.throws(()=>selectMaterialEntries(changed,[same.find(e=>e.realPath===canonicalFirst).id]),{code:'MATERIAL_CHANGED'});
  await assert.rejects(resolveMaterialRoot(root,outside),{code:'MATERIAL_ROOT_UNKNOWN'});
 }finally{
  // Only this owned fixture is removed; unlink junctions before recursive cleanup.
  for(const name of ['外部链接','内部链接','伪装链接'])await fs.unlink(path.join(sandbox,'workspace','素材 空格',name)).catch(()=>{});
  assert.ok(path.resolve(sandbox).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(sandbox,{recursive:true,force:true});
 }
});

test('service imports only selected index entries, deduplicates concurrent/restarted selections and rejects stale IDs before copying',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hf-material-service-'));
 try{
  const source=path.join(root,'素材');await fs.mkdir(source);await fs.mkdir(path.join(root,'config'));await fs.mkdir(path.join(root,'assets'));
  await fs.writeFile(path.join(root,'config/commerce.json'),JSON.stringify({commerce:{materialRoots:['素材']}}));
  for(let i=0;i<32;i++)await sharp({create:{width:12,height:8,channels:3,background:i%2?'red':'blue'}}).png().toFile(path.join(source,i+'.png'));
  const dataDir=path.join(root,'data','isolated'),service=await createCreativeService({root,dataDir});
  const catalog=await service.materialRoots(),index=catalog.find(r=>r.label==='素材');assert.equal(index.entries.length,32);assert.equal(service.list().length,0);
  const p=await service.create({message:'只选择两张，暂不生成'}),ids=index.entries.slice(0,2).map(e=>e.id);
  await assert.rejects(service.attachMaterialRoot(p,index.id),{code:'MATERIAL_SELECTION_REQUIRED'});
  await assert.rejects(service.attachMaterialRoot(p,index.id,index.entries.map(e=>e.id)),{code:'ASSET_LIMIT'});assert.equal(p.assets.length,0);
  await Promise.all(Array.from({length:8},()=>service.attachMaterialRoot(p,index.id,ids)));
  assert.equal(p.assets.length,2);assert.equal(p.jobs.length,0);assert.equal(p.revisions.length,0);
  for(const asset of p.assets){assert.equal(await hashFile(path.join(root,asset.path)),asset.sha256);assert.equal(await hashFile(asset.materialSource.realPath),asset.sha256);}
  assert.equal((await fs.readdir(path.join(dataDir,p.id,'uploads'))).length,2);
  const restarted=await createCreativeService({root,dataDir}),restored=restarted.get(p.id);await restarted.attachMaterialRoot(restored,index.id,ids);assert.equal(restored.assets.length,2);
  const stale=index.entries[2];await sharp({create:{width:13,height:8,channels:3,background:'white'}}).png().toFile(path.join(source,stale.relativePath));
  await assert.rejects(restarted.attachMaterialRoot(restored,index.id,[stale.id]),{code:'MATERIAL_CHANGED'});assert.equal(restored.assets.length,2);
  await assert.rejects(restarted.attachMaterialRoot(restored,'../unauthorized',[ids[0]]),{code:'MATERIAL_ROOT_UNKNOWN'});
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});
