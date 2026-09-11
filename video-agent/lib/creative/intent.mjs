import {CreativeError, insist} from './contracts.mjs';

const chineseNumbers = new Map([['一',1],['二',2],['两',2],['三',3],['四',4],['五',5],['六',6],['七',7],['八',8],['九',9],['十',10]]);
function sceneNumber(message) {
  const match = String(message).match(/第\s*([0-9]+|[一二两三四五六七八九十]+)\s*(?:幕|段|个?场景)/);
  if (!match) return null;
  if (/^\d+$/.test(match[1])) return Number(match[1]);
  if (match[1].length === 2 && match[1][0] === '十') return 10 + chineseNumbers.get(match[1][1]);
  if (match[1].startsWith('十')) return 10;
  if (match[1].length === 2 && match[1][1] === '十') return chineseNumbers.get(match[1][0]) * 10;
  return chineseNumbers.get(match[1]) || null;
}

function targetScene(document, message) {
  const number = sceneNumber(message);
  if (number != null) {
    insist(number >= 1 && number <= document.scenes.length, `找不到第 ${number} 幕`, 'INTENT_TARGET_MISSING');
    return document.scenes[number - 1];
  }
  if (/价格|优惠|折扣/.test(message)) return document.scenes.find(s => s.purpose === 'price') || document.scenes.at(-1);
  if (/片尾|结尾|最后|收尾/.test(message)) return document.scenes.at(-1);
  return document.scenes[0];
}

function targetText(document, scene, role) {
  return document.nodes.find(n => n.sceneId === scene.id && n.kind === 'text' && n.semanticRole === role) || null;
}

function quoted(message) {
  const match = String(message).match(/[“"]([^”"]{1,240})[”"]/);
  return match?.[1]?.trim() || null;
}

/**
 * Translate a deliberately small, deterministic set of common commerce edits
 * into object-level patches. Unsupported prose returns null so the caller can
 * ask for a structured/model plan instead of silently dropping the request.
 */
export function planCommerceMessage(document, message = '') {
  const text = String(message).trim();
  if (!text) return null;
  const scene = targetScene(document, text);
  const operations = [];
  const price=text.match(/(?:价格|演示价)\s*(?:改成|改为|设为|调整为)\s*([¥￥]?\s*\d+(?:\.\d{1,2})?)/);
  if(price){const node=document.nodes.find(n=>n.semanticRole==='price');insist(node,'工程没有价格对象','INTENT_TARGET_MISSING');operations.push({type:'update_text',nodeId:node.id,text:'¥'+price[1].replace(/[¥￥\s]/g,'')});}
  if(/锁定|解锁/.test(text)){
    const kinds=[];if(/内容/.test(text))kinds.push('content');if(/布局/.test(text))kinds.push('layout');if(/时长|段内时间/.test(text))kinds.push('timing');if(/绝对位置/.test(text))kinds.push('absolute');
    operations.push({type:/解锁|取消锁定/.test(text)?'unlock_scene':'lock_scene',sceneId:scene.id,params:{kinds:kinds.length?kinds:['content','timing']}});
  }
  const total=text.match(/(?:改成|改为|调整为)\s*(\d+)\s*秒/);if(total)operations.push({type:'retime_document',durationFrames:Number(total[1])*30});
  if (/价格|优惠|折扣/.test(text) && /醒目|突出|放大|大一点|更大/.test(text)) {
    const priceScene = document.scenes.find(s => s.purpose === 'price') || scene;
    operations.push({type:'update_effect_params', sceneId:priceScene.id, params:{priceScale:Math.min(1.5, Number(priceScene.effectParams?.priceScale || 1.08) + .1)}});
  }
  if (/切快|快一点|加快/.test(text) || /慢一点|放慢/.test(text)) {
    const delta = /慢一点|放慢/.test(text) ? 30 : -30;
    operations.push({type:'set_scene_duration', sceneId:scene.id, durationFrames:Math.max(30, Math.min(3600, scene.durationFrames + delta))});
  }
  if (/闪白|白闪|白色闪光/.test(text)) {
    const index = Math.max(0, document.scenes.indexOf(scene));
    const next = document.scenes[index + 1] || document.scenes[1];
    if (next) operations.push({type:'set_transition', fromSceneId:scene.id, toSceneId:next.id, effect:'flash-transition', durationFrames:6, params:{color:'#FFFFFF', intensity:.82}});
  } else if (/方向转场|滑动转场|向左转场|向右转场/.test(text)) {
    const index = Math.max(0, document.scenes.indexOf(scene));
    const next = document.scenes[index + 1] || document.scenes[1];
    if (next) operations.push({type:'set_transition', fromSceneId:scene.id, toSceneId:next.id, effect:'directional-transition', durationFrames:9, params:{direction:/向右/.test(text) ? 'right' : 'left'}});
  }
  if (/引导线|标注|箭头|高亮框/.test(text)) operations.push({type:'set_scene_effect', sceneId:scene.id, effect:'feature-callout'});
  if (/细节放大|局部放大|放大镜头/.test(text)) operations.push({type:'set_scene_effect', sceneId:scene.id, effect:'detail-inset'});
  if (/标题动画|标题弹入|文字揭示/.test(text)) operations.push({type:'set_scene_effect', sceneId:scene.id, effect:'title-reveal'});
  if (/推近|放大|拉近/.test(text)) {
    const effect = scene.effect === 'image-pan-zoom' ? {scaleTo:Math.min(1.6, Number(scene.effectParams?.scaleTo || 1.14) + .06)} : {scale:Math.min(1.4, Number(scene.effectParams?.scale || 1.08) + .06)};
    operations.push({type:'update_effect_params', sceneId:scene.id, params:effect});
  }
  const title = quoted(text);
  if (title && /标题|商品名|主标题/.test(text)) {
    const node = targetText(document, scene, 'title');
    insist(node, '目标场景没有标题', 'INTENT_TARGET_MISSING');
    operations.push({type:'update_text', nodeId:node.id, text:title});
  }
  if (title && /片尾|结尾|CTA|行动提示|下单/.test(text)) {
    const end = document.scenes.at(-1), node = targetText(document, end, 'cta')||targetText(document,end,'title');
    insist(node, '片尾没有行动提示文字', 'INTENT_TARGET_MISSING');
    operations.push({type:'update_text', nodeId:node.id, text:title});
  }
  return operations.length ? {operations, summary:`已按对话修改 ${operations.length} 个商品视频对象`} : null;
}

export function requireCommerceMessagePlan(document, message) {
  const result = planCommerceMessage(document, message);
  if (!result) throw new CreativeError('这条商品视频要求需要更具体的对象或效果参数', 'UNSUPPORTED_MESSAGE', 422);
  return result;
}
