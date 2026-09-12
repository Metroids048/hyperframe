// Operates existing WebUI only; no request interception or direct production API calls.
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const projectId='8005d346-869a-4123-9809-e0911c336907',jobId='job-c2c88cb0-d8ad-4da3-a3a8-3f09a4baf525';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.goto('http://127.0.0.1:3024/?project='+projectId,{waitUntil:'networkidle0'});
 const row='[data-job-id="'+jobId+'"]';await page.waitForSelector(row);const before=await page.$eval(row,e=>e.innerText);const button=await page.$(row+' button');if(!button||await button.evaluate(e=>e.textContent)!=='从检查点恢复')throw Error('Expected recoverable checkpoint button: '+before);
 await page.screenshot({path:'outputs/result-completion/q02-resume-before.png'});await button.click();await page.waitForFunction(selector=>document.querySelector(selector)?.innerText.includes('取消'),{},row);
 const after=await page.$eval(row,e=>e.innerText);await page.screenshot({path:'outputs/result-completion/q02-resume-after.png'});
 const evidence={kind:'actual-webui-checkpoint-resume',browser:'local Chrome headless',at:new Date().toISOString(),projectId,jobId,before,after};await fs.writeFile('outputs/result-completion/q02-webui-resume-latest.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await browser.close()}
