import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {reconcileProjectAssets} from '../lib/creative/asset-reconcile.mjs';

test('repairs stale references only from the owning project and records a hash',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'asset-reconcile-'));
 try{
  const projectDir=path.join(root,'projects','project-a'),uploadDir=path.join(projectDir,'uploads');
  await fs.mkdir(uploadDir,{recursive:true});
  await fs.writeFile(path.join(uploadDir,'asset-video.mp4'),'real video bytes');
  const assets=[{id:'asset-video',kind:'video',path:'uploads/asset-video.mp4',originalRef:path.join(root,'old','asset-video.mp4'),bytes:16}];
  await reconcileProjectAssets(projectDir,assets,{root});
  assert.equal(assets[0].originalRef,path.join(uploadDir,'asset-video.mp4'));
  assert.match(assets[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(assets[0].path,'uploads/asset-video.mp4');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('missing project upload is an orphan rather than a guessed same-name file',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'asset-reconcile-'));
 try{
  const projectDir=path.join(root,'projects','project-a');
  await fs.mkdir(path.join(projectDir,'uploads'),{recursive:true});
  await fs.mkdir(path.join(root,'projects','project-b','uploads'),{recursive:true});
  await fs.writeFile(path.join(root,'projects','project-b','uploads','asset-video.mp4'),'unrelated video');
  const assets=[{id:'asset-video',kind:'video',path:'uploads/asset-video.mp4'}];
  await assert.rejects(()=>reconcileProjectAssets(projectDir,assets,{root}),{code:'ASSET_ORPHANED'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('cross-project symlink is rejected even when the filename and hash match',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'asset-reconcile-'));
 try{
  const owner=path.join(root,'projects','project-a','uploads');
  const other=path.join(root,'projects','project-b','uploads');
  await fs.mkdir(owner,{recursive:true});await fs.mkdir(other,{recursive:true});
  const target=path.join(other,'asset-video.mp4');
  await fs.writeFile(target,'real video bytes');
  await fs.symlink(target,path.join(owner,'asset-video.mp4'));
  await assert.rejects(()=>reconcileProjectAssets(path.dirname(owner),[{id:'asset-video',kind:'video',path:'uploads/asset-video.mp4'}],{root}),{code:'ASSET_ORPHANED'});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('same-project asset alias may share an existing upload without a second copy',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'asset-reconcile-'));
 try{
  const projectDir=path.join(root,'projects','project-a'),uploads=path.join(projectDir,'uploads');
  await fs.mkdir(uploads,{recursive:true});
  const source=path.join(uploads,'web-image.jpg');await fs.writeFile(source,'image bytes');
  const assets=[{id:'demo-web-image',kind:'image',path:path.relative(root,source)}];
  await reconcileProjectAssets(projectDir,assets,{root});
  assert.match(assets[0].sha256,/^[a-f0-9]{64}$/);
  assert.equal(assets[0].path,path.relative(root,source));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
