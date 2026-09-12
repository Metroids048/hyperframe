import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,InputError} from './workflow.mjs';
export const cases=JSON.parse(await fs.readFile(path.join(ROOT,'cases.json'),'utf8'));
export function demoOptimize(text){
 if(typeof text!=='string'||text.trim().length<8||text.length>3000)throw new InputError('请用 8–3000 字描述你的需求');
 const exact=cases.find(c=>c.description.trim()===text.trim());
 if(exact)return {...exact.brief,optimizedPrompt:`为${exact.brief.brand}的${exact.brief.product}制作商品展示短片，突出${exact.brief.benefits.join('、')}。开场：${exact.brief.hook} 收尾：${exact.brief.cta}`,missing:[],notes:'这是 Codex 预先整理的案例结果，可修改后继续生成。',provider:'Codex 预置案例 · 非实时调用',mode:'curated',caseId:exact.id};
 const brand=text.match(/(?:我们是|品牌(?:名)?(?:叫|是|为)?[：:\s]*)([\u4e00-\u9fa5A-Za-z0-9]{1,8})/)?.[1]||'';
 const brandLatin=text.match(/\b([A-Z][A-Z0-9]{1,13})\b/)?.[1]||'PRODUCT';
 const product=text.match(/(?:商品|产品)(?:名)?(?:(?:叫|是|为)[：:\s]*|[：:\s]+)([^，。；\s]{1,12})/)?.[1]||['青柠气泡水','精品咖啡豆','无线头戴耳机','玫瑰香氛','咖啡豆','头戴耳机','香氛','手工香皂','保温杯','运动鞋','背包'].find(s=>text.includes(s))||'';
 const segment=text.match(/(?:卖点(?:是|为)?|突出|特点是)[：:\s]*([^。；]+)/)?.[1]||'';
 const values=segment.split(/[、，,和]/).map(s=>s.trim().replace(/^(以及|具有|有)/,'')).filter(s=>s&&[...s].length<=10).slice(0,3);
 const benefits=[0,1,2].map(i=>values[i]||'');const missing=[];if(!product)missing.push('商品名');
 return {brand,brandLatin,product,benefits,hook:'让日常，多一点喜欢。',cta:'发现你的下一份喜欢',optimizedPrompt:`为${brand||'待补充品牌'}的${product||'待补充商品'}制作短片。展示${values.join('、')||'待补充卖点'}，采用开场、卖点、品牌收尾的三幕结构。`,missing,notes:'当前使用本地规则识别；未识别的信息留空，未添加产品事实。可按需补充信息。',provider:'本地规则整理 · 非实时 AI',mode:'rules'};
}
export function validateSettings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('视频设置格式不正确');
 const s={duration:Number(value.duration??30),aspect:value.aspect||'16:9',quality:value.quality||'720p'};
 if(!Number.isFinite(s.duration)||s.duration<10||s.duration>180||!['16:9','9:16','1:1'].includes(s.aspect)||!['720p','1080p','4K'].includes(s.quality))throw new InputError('视频设置不受支持');
 return s;
}
