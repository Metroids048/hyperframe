import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceFile=path.resolve('video-agent/scripts/apply-remediation-phase1.mjs');
let source=await fs.readFile(sourceFile,'utf8');
const token='${target.number}';
source=source.replaceAll('\\\\'+token,'\\'+token);
const temp=path.resolve('video-agent/scripts/.apply-remediation-phase1.runtime.mjs');
await fs.writeFile(temp,source);
try{
  await import(pathToFileURL(temp).href+'?v='+Date.now());
} finally {
  await fs.rm(temp,{force:true});
}
