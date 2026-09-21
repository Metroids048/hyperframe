import {CreativeError, insist} from './contracts.mjs';

const chineseNumbers = new Map([['一',1],['二',2],['两',2],['三',3],['四',4],['五',5],['六',6],['七',7],['八',8],['九',9],['十',10]]);
export function sceneNumber(message) {
  const match = String(message).match(/第\s*([0-9]+|[零一二两三四五六七八九十百]+)\s*(?:幕|段|个?场景)/);
  if (!match) return null;
  if (/^\d+$/.test(match[1])) return Number(match[1]);
  let total=0,digit=0;for(const char of match[1]){if(char==='十'||char==='百'){total+=(digit||1)*(char==='十'?10:100);digit=0;}else digit=char==='零'?0:chineseNumbers.get(char)||0;}return total+digit||null;
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

  // 音乐相关编辑
  if (/换.*音乐|更换.*音乐|背景音乐|配乐/.test(text)) {
    const style = /优雅|轻柔|舒缓/.test(text) ? 'elegant' :
                  /激情|热烈|动感/.test(text) ? 'energetic' :
                  /轻快|活泼|欢快/.test(text) ? 'upbeat' : 'default';
    operations.push({type:'change_music', style, params:{mood:style}});
  }

  // 节奏调整 - 支持分段描述
  const rhythmMatch = text.match(/前\s*(\d+)\s*秒.*快|后\s*(\d+)\s*秒.*慢|中间.*慢/);
  if (rhythmMatch) {
    operations.push({type:'adjust_rhythm', params:{
      description: text,
      fastStart: rhythmMatch[1] ? Number(rhythmMatch[1]) : null,
      slowEnd: rhythmMatch[2] ? Number(rhythmMatch[2]) : null
    }});
  }

  // 字幕添加 - 支持多个字幕描述
  const subtitles = text.match(/[""]([^""]+)[""]/g);
  if (subtitles && /字幕|说明|提示|文案/.test(text)) {
    const texts = subtitles.map(s => s.replace(/["“”]/g, '').trim());
    operations.push({type:'add_subtitles', params:{
      texts,
      timing: /关键镜头|特写/.test(text) ? 'key-moments' : 'auto',
      animation: /渐入|渐出|淡入淡出/.test(text) ? 'fade' : 'none'
    }});
  }

  const title = quoted(text);
  if (title && /标题|商品名|主标题/.test(text)) {
    const node = targetText(document, scene, 'title');
    insist(node, `目标场景（第${scene?.index + 1 || '?'}幕）没有标题文字。请检查场景是否包含标题元素。`, 'INTENT_TARGET_MISSING');
    operations.push({type:'update_text', nodeId:node.id, text:title});
  }
  if (title && /片尾|结尾|CTA|行动提示|下单/.test(text)) {
    const end = document.scenes.at(-1), node = targetText(document, end, 'cta')||targetText(document,end,'title');
    insist(node, `片尾场景（第${document.scenes.length}幕）没有行动提示或标题文字。请先添加行动提示元素。`, 'INTENT_TARGET_MISSING');
    operations.push({type:'update_text', nodeId:node.id, text:title});
  }
  return operations.length ? {operations, summary:`已按对话修改 ${operations.length} 个商品视频对象`} : null;
}

export function requireCommerceMessagePlan(document, message) {
  const result = planCommerceMessage(document, message);
  if (!result) {
    // 提供具体的、可操作的错误提示
    const text = String(message).trim();
    let hint = '当前不支持这种修改方式';

    // 检测常见的不支持场景并给出具体建议
    if (/颜色|色彩|配色/.test(text) && !/标题/.test(text)) {
      hint = '❌ 不支持单独修改颜色\n\n✅ 正确示例：\n• "把标题改成\'限时特惠\'，颜色改成红色"\n• "把价格改成¥99，金色显示"\n\n💡 提示：请同时指定要修改的文字内容和颜色';
    } else if (/字体|字形/.test(text)) {
      hint = '❌ 不支持修改字体\n\n✅ 替代方案：\n• 使用品牌字体上传功能\n• 在创作时指定字体风格（如"现代感"、"手写风"）\n• 使用"标题放大"等相对调整\n\n💡 提示：字体需要在视频创作前设置';
    } else if (/背景/.test(text) && !/音乐|配乐/.test(text)) {
      hint = '❌ 不支持单独修改背景\n\n✅ 替代方案：\n• 调整画面："推近"、"放大"\n• 替换素材："换商品图"、"换场景图"\n\n💡 提示：背景通常与商品图绑定，建议整体替换';
    } else if (/删除|去掉|移除/.test(text) && /场景|镜头/.test(text)) {
      hint = '❌ 不支持直接删除场景\n\n✅ 替代方案：\n• 极短时长：设置为0.3-0.5秒（几乎看不到）\n• 重新生成：锁定其他场景后生成新版本\n\n💡 示例："第2幕改成0.3秒"';
    } else if (/样式|风格/.test(text) && !/音乐/.test(text)) {
      hint = '❌ 不支持抽象的样式描述\n\n✅ 正确示例：\n• 用"标题放大" 而非 "标题样式改大"\n• 用"价格更醒目" 而非 "价格风格突出"\n• 用"闪白转场" 而非 "转场炫酷"\n\n💡 提示：请使用具体的视觉操作词';
    } else {
      // 通用建议：列出支持的操作类型和真实示例
      hint = '❌ 当前不支持这种修改方式\n\n' +
             '✅ 支持的操作类型：\n\n' +
             '📝 文字修改\n' +
             '  • 把标题改成"新标题"\n' +
             '  • 价格改成¥99\n' +
             '  • 片尾改成"立即购买"\n\n' +
             '⏱️ 时长调整\n' +
             '  • 第2幕改成3秒\n' +
             '  • 切快一点\n' +
             '  • 整体加快10%\n\n' +
             '🎬 转场效果\n' +
             '  • 闪白\n' +
             '  • 向左转场\n' +
             '  • 淡入淡出\n\n' +
             '🎨 视觉增强\n' +
             '  • 推近\n' +
             '  • 价格更醒目\n' +
             '  • 标题放大\n\n' +
             '🎵 音乐调整\n' +
             '  • 换轻快音乐\n' +
             '  • 换优雅音乐\n' +
             '  • 音乐声音小一点\n\n' +
             '🔒 场景锁定\n' +
             '  • 锁定第2幕内容\n' +
             '  • 解锁所有时长\n\n' +
             '💡 提示：请尝试用以上方式描述您的需求';
    }

    throw new CreativeError(hint, 'UNSUPPORTED_MESSAGE', 422);
  }
  return result;
}
