import fs from 'node:fs/promises';
import path from 'node:path';
import {runHF,ROOT} from '../lib/workflow.mjs';
for(const count of [0,1,3]){const dir=path.join(ROOT,'outputs/v5-compose-'+count);for(let n=1;n<=3;n++)await fs.copyFile(path.join(ROOT,'assets/cases/qing.png'),path.join(dir,'assets/product'+n+'.png'));await runHF(dir,['check'],{logFile:path.join(dir,'check.log')});console.log('CHECK PASSED '+count+' benefits');}
