#!/usr/bin/env node
import {businessContract} from './lib/creative/commerce-focus.mjs';
import {explicitBusinessConstraints} from './lib/creative/business-constraints.mjs';

// 测试用户消息
const testMessage = `把这些商品素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头,至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看,再展开三个有依据的产品特点,串起一个看得懂的使用过程,最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计,例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏,不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低,有价值的产品操作声保留。竖屏不能裁掉关键商品结构和操作动作。`;

console.log('🧪 测试音频需求识别\n');
console.log('用户消息:', testMessage.substring(0, 100) + '...\n');

// 测试第一层：businessContract
console.log('📍 第一层测试: businessContract (commerce-focus.mjs)');
const contract = businessContract({message: testMessage});
console.log('audio字段:', contract.audio);
console.log('完整contract:', JSON.stringify(contract, null, 2));

// 测试第二层：explicitBusinessConstraints
console.log('\n📍 第二层测试: explicitBusinessConstraints (business-constraints.mjs)');
const constraints = explicitBusinessConstraints(testMessage);
console.log('narration:', constraints.narration);
console.log('music:', constraints.music);
console.log('完整constraints:', JSON.stringify(constraints, null, 2));
