import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out='outputs/demo-repair-20260914',state=JSON.parse(await fs.readFile(out+'/state.json')),review=JSON.parse(await fs.readFile(out+'/delivery.json')),catalogFile='examples/commerce/presets.json',catalog=JSON.parse(await fs.readFile(catalogFile));
assert.equal(review.works.length,6);assert.equal(review.errors.length,0);
for(const w of state.works){
 const checked=review.works.find(c=>c.id===w.id);assert.equal(checked.revisionId,w.revisionId);const entry=catalog.find(p=>p.id==='demo-'+w.id),doc=JSON.parse(await fs.readFile(w.directory+'/document.json'));assert.equal(doc.revisionId,w.revisionId);
 entry.directory=w.directory;entry.sourceProject='data/result-completion-projects/'+w.projectId+'/native-project.json';entry.inputAssetIds=[...new Set([...doc.nodes.filter(n=>n.assetId).map(n=>n.assetId),...doc.audioGraph.map(a=>a.assetId)])];
 entry.reviewStatus='reviewed';entry.description=w.id==='N3'?'完整实拍画面 · 操作原声已增强 · 45秒连续教程':'大字图文编排 · 实物照片对照 · 配乐已加入并调高';
 entry.note='已载入本次更新的成片，原始素材、独立文字和音轨保留在原生工程，可继续修改。';entry.evidenceNote='本次以原生对象操作重排现有素材，经过画面核看、实际音频信号检查、完整1倍速浏览器播放和严格MP4导出。保留此前版本；审美效果待用户确认。';entry.capabilities=['已导出MP4','独立文字与音轨','可撤销与继续编辑'];
 entry.input=entry.input.replace('无上传配乐则静音，不虚构操作声。','使用现有原创配乐，不虚构操作声。');if(w.id==='N6'&&!entry.input.includes('使用已加入的原创配乐。'))entry.input+=' 使用已加入的原创配乐。';
 entry.process=[{title:'保留原始素材和历史',detail:'沿用同一商品工程与原始照片或实拍，旧版本仍可恢复。'},{title:'重排画面并修复音频',detail:entry.description},{title:'检查实际成片',detail:'逐幕抽帧核看；原生播放器检测到实际声音；MP4全片1倍速播放至结束，时长与音轨检查通过。'}];
 execFileSync(path.join(root,'node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg'),['-v','error','-y','-ss','2','-i',w.directory+'/commerce-final.mp4','-frames:v','1','-vf','scale=960:-2',entry.poster]);
}
await fs.writeFile(catalogFile,JSON.stringify(catalog,null,2)+'\n');state.publishedAt=new Date().toISOString();state.status='published-and-verified';await fs.writeFile(out+'/state.json',JSON.stringify(state,null,2));console.log('Published six reviewed media revisions and their actual posters');
