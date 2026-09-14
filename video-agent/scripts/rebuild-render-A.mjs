import fs from 'node:fs/promises';import path from 'node:path';import {runHF} from '../lib/workflow.mjs';
const dir=path.resolve('examples/commerce/rebuild-g2-A');
for(const [command,args] of [['check',[]],['render',['--output','reference-A.mp4','--workers','1','--quality','standard','--strict']]]){await runHF(dir,[command,...args],{logFile:dir+'/'+command+'.log',onOutput:s=>process.stdout.write(s),timeoutMs:300000})}
