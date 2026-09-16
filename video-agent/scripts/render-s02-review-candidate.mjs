import fs from 'node:fs/promises';
import path from 'node:path';
import {runHyperFrames} from '../lib/creative/runner.mjs';
import {linkOrCopy} from '../lib/edit/media.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'data/commerce-runs/2c34075d-b02d-4c13-8ac9-f2da2df7ea8f/versions/job-a8dfd435-347c-420e-91bb-7cb710f314e8');
const target=path.join(root,'outputs/eight-scenarios-20260916/S02-review-candidate-'+Date.now());
await fs.mkdir(target,{recursive:true});
for(const name of ['index.html','hyperframes.json','document.json','manifest.json'])await fs.copyFile(path.join(source,name),path.join(target,name));
async function assets(dir){for(const item of await fs.readdir(path.join(source,dir),{withFileTypes:true})){const relative=dir+'/'+item.name;if(item.isDirectory())await assets(relative);else if(item.isFile())await linkOrCopy(path.join(source,relative),path.join(target,relative));}}
await assets('assets');
await fs.writeFile(path.join(target,'REVIEW_STATUS.json'),JSON.stringify({sourceProject:'2c34075d-b02d-4c13-8ac9-f2da2df7ea8f',sourceJob:'job-a8dfd435-347c-420e-91bb-7cb710f314e8',status:'review-candidate-known-defects',accepted:false,issues:['旁白分段未落地，局部说明提前于对应画面','字幕识别错字','部分中文说明拆词/孤字行','整体与局部关系表达仍需改进'],purpose:'用户查看当前完整画面；不计为已交付成品'},null,2));
console.log('REVIEW_DIRECTORY '+target);
await fs.writeFile(path.join(target,'check.log'),await runHyperFrames(target,'check'));
const video=path.join(target,'S02-显卡详情-审阅版-未验收.mp4');
await fs.writeFile(path.join(target,'render.log'),await runHyperFrames(target,'render',['--output',video,'--fps','30','--quality','standard','--workers','1','--strict']));
console.log('REVIEW_VIDEO '+video);
