import fs from 'node:fs/promises';
import {chromium} from '/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {runtimeEnv} from '../lib/workflow.mjs';
const id='25158d9c-d70b-4177-a455-9771d121cd42';
const b=await chromium.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--disable-gpu']});
const c=await b.newContext();const p=await c.newPage();p.setDefaultTimeout(15000);
try{await p.goto('http://127.0.0.1:3024/?project='+id,{waitUntil:'domcontentloaded'});const buttons=await p.locator('#jobs button').allTextContents();console.log('buttons',buttons);const resume=p.getByRole('button',{name:/从检查点恢复/});if(await resume.count()){await resume.click();console.log('resumed');}await fs.writeFile('outputs/demo-closeout/P1-resume.json',JSON.stringify({id,buttons,time:new Date().toISOString()},null,2));}finally{await c.close();await b.close();}
