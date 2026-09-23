import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildUploadedVideoProject, uploadedVideoTitle, readNativeProject} from '../lib/creative/runner.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {probe} from '../lib/edit/media.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await fs.mkdtemp(path.join(root, '.tmp-uploaded-video-title-'));
try {
  assert.equal(uploadedVideoTitle('在刚上传的视频开头两秒加上新品体验几个字，原声保持不变'), '新品体验');
  assert.equal(uploadedVideoTitle('把这段视频保留原声'), null);
  assert.equal(uploadedVideoTitle('保留原片全部画面和原有文字，不添加任何新内容'), null);
  assert.equal(uploadedVideoTitle('原样导出，不要添加标题“新品上市”'), null);

  const outputDir = path.join(temp, 'project');
  await buildUploadedVideoProject({
    projectId: 'upload-title-test',
    message: '在刚上传的视频开头两秒加上新品体验几个字，时长、画幅和原声保持不变',
    assets: [{id: 'source-video', kind: 'video', name: 'product.mp4', path: 'assets/edit-samples/product.mp4', rights: {status: 'user-provided'}}],
    outputDir: path.relative(root, outputDir),
  }, {root});

  const {document} = await readNativeProject(outputDir);
  const video = document.nodes.find(node => node.kind === 'video');
  const title = document.nodes.find(node => node.kind === 'text');
  assert(title, 'initial uploaded project must contain an editable title node');
  assert.equal(title.params.text, '新品体验');
  assert.equal(title.startFrame, 0);
  assert.equal(title.durationFrames, 60);
  assert.equal(title.params.immediate, true);
  assert.equal(document.durationFrames, video.durationFrames);
  assert.equal(document.audioGraph.length, 1);
  assert.equal(document.audioGraph[0].durationFrames, document.durationFrames);
  const html = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(html, /新品体验/);
  assert.match(html, /tl\.set\("#scene-01-uploaded-source \.copy-panel \.enter"/);
  assert.match(html, /class="copy-panel clip" data-start="0" data-duration="2"/);
  console.log('PASS uploaded video title is native, starts at frame 0, and preserves source duration/audio');
  const dataDir=path.join(temp,'service');
  const service=await createCreativeService({root,dataDir});
  const project=await service.create({message:'source export routing test'});
  const initialDir=path.join(dataDir,project.id,'versions/initial');
  await fs.cp(outputDir,initialDir,{recursive:true});
  const sourcePath=path.join(root,'assets/edit-samples/product.mp4');
  project.assets=[{id:'source-video',kind:'video',name:'product.mp4',path:'assets/edit-samples/product.mp4',originalRef:sourcePath,mediaMetadata:await probe(sourcePath),rights:{status:'user-provided'}}];
  project.currentRevisionId=document.revisionId;
  project.revisions=[{id:document.revisionId,directory:'versions/initial',rendered:false}];
  const routed=await service.dispatchMessage(project,{message:'仅使用上传原片，原样导出。不添加任何新内容。',attachmentIds:['source-video'],baseRevisionId:document.revisionId,idempotencyKey:'source-export-existing-revision-test',taskMode:'recut'});
  assert.equal(routed.project.id,project.id,'explicit source export must stay in the original project');
  assert.equal(service.list().length,1,'source export must not create a parallel project');
  const job=project.jobs.at(-1);
  assert.equal(job.kind,'create','source export must build a new revision rather than patch the old title');
  await service.cancel(project,job.id);
  await service.waitForJob(project,job.id);
  assert.equal(job.status,'cancelled');
  assert.equal(project.currentRevisionId,document.revisionId);
  console.log('PASS existing source export routes a new revision into the same project and preserves its history');
} finally {
  await fs.rm(temp, {recursive: true, force: true});
}
