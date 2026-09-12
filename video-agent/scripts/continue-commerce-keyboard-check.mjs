import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {readNativeProject,runHyperFrames} from '../lib/creative/runner.mjs';
import {verifyCustomProject} from '../lib/creative/isolation.mjs';
import {hashFile,probe} from '../lib/edit/media.mjs';
const directory=path.join(ROOT,'data/creative-validation/8976d1bd-3b29-4d8e-8467-a994f4ab4f50/versions/job-a24648f7-df47-47e6-8916-0c5d4e753378'),output=path.join(ROOT,'outputs/resume','keyboard-native-continuation-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});const {document,assets}=await readNativeProject(directory),sourceHashes={};for(const file of ['index.html','document.json','object-map.json','manifest.json'])sourceHashes[file]=await hashFile(path.join(directory,file));
const report={status:'running',scope:'Resume checks and export of the unchanged real-model document after fixing video navigation timeout. Original failed UI job remains failed.',directory,sourceHashes,steps:[]},save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await save();
try{
 await verifyCustomProject(directory,document,assets);report.steps.push('isolated-real-motion-passed');await save();console.log('ISOLATION PASSED');
 const check=await runHyperFrames(directory,'check');await fs.writeFile(path.join(output,'check.log'),check);report.steps.push('hyperframes-check-passed');await save();console.log('CHECK PASSED');
 const render=await runHyperFrames(directory,'render',['--output','commerce-final.mp4','--fps','30','--quality','standard','--workers','1','--strict']);await fs.writeFile(path.join(output,'render.log'),render);report.steps.push('strict-mp4-render-passed');
 for(const [file,sha] of Object.entries(sourceHashes))assert.equal(await hashFile(path.join(directory,file)),sha,'original model source must remain unchanged');
 report.video=path.join(directory,'commerce-final.mp4');report.sha256=await hashFile(report.video);report.metadata=await probe(report.video);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
await save();console.log(JSON.stringify({output,...report}));
