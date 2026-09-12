import fs from 'node:fs/promises';
import path from 'node:path';
import {hashFile} from '../lib/edit/media.mjs';
import {ROOT} from '../lib/workflow.mjs';
const moka='assets/commerce-showcase/moka-brewing.webm';
const photos=['assets/creative-observation/01.jpg','assets/creative-observation/02.jpg','assets/creative-observation/04.jpg'];
const cases=[
 {id:'H01',files:[moka],message:'把提供材料讲清楚，60秒，只用已有信息。输出横屏1080p。'},
 {id:'H02',files:photos,message:'用这三张器具照片做45秒观察介绍，照片并未确认为同款，分别说明可见的外观与部件，不编造使用实拍或性能。文字和图片要有层级。横屏1080p，静音。',scope:'Existing photos are observation test material, not approved marketing assets.'},
 {id:'H03',files:[moka],message:'用操作片做45秒介绍，保留动作和原声。不编造参数，不加配音或价格。横屏1080p。'},
 {id:'H04',files:[],message:'做15秒纯文字排版功能测试，保留全部以下演示文案，不添加照片。第一秒显示“演示样例 · ¥199”。条件：“仅限指定款式；活动有效期以店铺页面为准；优惠不可与其他活动叠加；实际支付金额请以结算页面为准。”最后显示“下单前请核对款式与适用条件”。中文较长时重新排版，横屏1080p，静音。',scope:'Synthetic typography fixture, not an actual offer.'},
 {id:'H05',files:photos,message:'只介绍第二张照片里出现的器具，其他照片没有确认是同型号，不要凭相似外观混用。做15秒静音横屏展示，只写照片能够证明的内容。',scope:'Observation correctness fixture, not marketing approval.'},
 {id:'H06',files:[photos[1]],message:'只有一张照片和足量批准说明，做90秒解释型视频。',status:'blocked-input',blocker:'No approved long-form product copy was supplied. Do not invent it to satisfy the duration.'},
 {id:'H08',files:[],message:'制作15秒静音字体测试。逐字保留“演示品牌 DEMO STUDIO”和“观察 · 理解 · 制作 / Observe · Understand · Create”，把中文和英文排成清晰层级，统一字体；这是排版样例，不声明真实商标。1920×1080。',scope:'Synthetic bilingual typography fixture.'},
 {id:'H09',files:[moka],message:'把这些资料做成60秒静音视频，不加音乐和配音。操作过程看得懂，适量文字，不能虚构价格参数，也不要重复片段填时间。1920×1080。'},
 {id:'H07',files:[moka],message:'从这段长视频里找完整操作，剪成一分钟。保留原声，少量中文提示，横屏1080p；不能把其他器具当同一商品，不加配音。'},
 {id:'H10',files:[],package:'data/commerce-next-current/4b4696cc-a5fb-488a-a218-764e6cfedc83/versions/job-0edc7207-bb55-47c5-8623-75cf7968fc2f/history.zip',message:'只把第三段“整理粉面”改为“整理咖啡粉面”，素材、声音、其他文字和时长保持。',kind:'edit'}
];
for(const c of cases){c.inputs=await Promise.all([...c.files,...(c.package?[c.package]:[])].map(async file=>({file,sha256:await hashFile(path.join(ROOT,file)),bytes:(await fs.stat(path.join(ROOT,file))).size})));c.status??='frozen-not-run';}
const record={schemaVersion:1,frozenAt:new Date().toISOString(),earlierDimensions:'outputs/commerce-next/holdout.json',purpose:'Implementation regression fixtures. A/B/C core benchmark remains the separately frozen full moka source and exact brief. These do not replace the commercial quality acceptance.',cases};
await fs.writeFile(path.join(ROOT,'outputs/commerce-next/holdout-inputs.json'),JSON.stringify(record,null,2),{flag:'wx'});
console.log('Frozen ten cases; H06 remains blocked on absent approved copy. No run is marked passed.');
