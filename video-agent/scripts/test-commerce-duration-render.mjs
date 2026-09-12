import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {writeCompiledProject,renderCommerceProject} from '../lib/creative/runner.mjs';

const seconds=Number(process.argv[2]||600);
assert(Number.isInteger(seconds)&&seconds>=10&&seconds<=600&&seconds%10===0);
const outputDir=path.join(ROOT,'outputs/commerce-next/duration-stress',Date.now().toString());await fs.mkdir(path.join(outputDir,'assets'),{recursive:true});
const report={status:'running',kind:'structural-render-stress',seconds,excludedFromCreativeQuality:true,note:'Synthetic numbered sections intentionally exercise duration, scene boundaries and frame export. They are not an app-generated merchant video or evidence of content quality.',startedAt:new Date().toISOString()};
const save=()=>fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));await save();
try{
 await fs.copyFile(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(outputDir,'assets/gsap.min.js'));
 const request=normalizeCommerceRequest({projectId:'duration-stress',message:'工程边界压力测试',creativeMode:'text',output:{width:1920,height:1080,durationSeconds:seconds}});
 const document=documentFromModelPlan(request,[],{design:{background:'#171411',foreground:'#F4ECDD',panel:'#27231F',accent:'#D7A77A',accentContrast:'#171411'},transition:'cut',observations:[],audio:[],omitted:[],scenes:Array.from({length:seconds/10},(_,i)=>({purpose:'structural fixture '+(i+1),effect:'title-reveal',durationSeconds:10,weight:1,effectParamsJson:'{}',customSourceJson:'',media:[],text:[{role:'title',text:'工程压力测试 '+(i+1)+' / '+seconds/10,factRefs:[]},{role:'feature',text:i*10+'—'+(i+1)*10+' 秒 · 非质量样片',factRefs:[]}]}))});
 assert.equal(document.durationFrames,seconds*30);assert.equal(new Set(document.nodes.map(n=>n.id)).size,document.nodes.length);
 await writeCompiledProject(outputDir,document,[]);await fs.writeFile(path.join(outputDir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
 report.revisionId=document.revisionId;report.scenes=document.scenes.length;report.nodes=document.nodes.length;await save();
 const rendered=await renderCommerceProject({outputDir:path.relative(ROOT,outputDir).replaceAll('\\','/')});
 assert.equal(rendered.mediaReview.frames,seconds*30);report.mediaReview=rendered.mediaReview;report.status='passed';
}catch(error){report.status='failed';report.error={code:error.code,message:error.message};process.exitCode=1;}
report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,outputDir,error:report.error}));
