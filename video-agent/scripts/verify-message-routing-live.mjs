import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';
const project={currentRevisionId:'revision-current',revisions:[{id:'revision-current',description:'教程母版'}],assets:[{id:'source-install',name:'安装原片.mp4',kind:'video'}],jobs:[],request:{scenarioId:'product_demo'}};
const cases=[['另做一条新品片，素材我重新上传。','create'],['这条安装教程删掉等待，再出一版竖屏，原声保留。','variant'],['只在第二处用色散，其余不要；文字别挡商品。','edit'],['片尾文字改为“另做一条”，其他不变。','edit']];
const report={startedAt:new Date().toISOString(),cases:[]};
const file=path.join(ROOT,'outputs/message-routing-live.json');
for(const [message,expected] of cases){
 try{const route=await routeWorkbenchMessage(project,message);report.cases.push({message,expected,route,passed:route.mode===expected});}
 catch(error){report.cases.push({message,expected,passed:false,error:{code:error.code,message:error.message}});}
 await fs.writeFile(file,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report.cases.at(-1)));
}
report.completedAt=new Date().toISOString();report.passed=report.cases.every(c=>c.passed);await fs.writeFile(file,JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
