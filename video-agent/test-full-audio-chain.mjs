#!/usr/bin/env node
import {readFileSync, existsSync} from 'fs';
import {join} from 'path';

// 等待任务完成并检查结果
async function waitForTask(taskId, maxWaitMinutes = 15) {
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const startTime = Date.now();
  const checkInterval = 10000; // 每10秒检查一次

  console.log(`\n⏳ 等待任务完成 (最多${maxWaitMinutes}分钟)...`);

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[${elapsed}s] 检查任务状态...`);

    // 检查任务目录
    const taskDir = `/Users/a1234/.openclaw/hyperframe/state/tasks/${taskId}`;
    if (!existsSync(taskDir)) {
      console.log('  任务目录尚不存在');
      continue;
    }

    // 检查document.json
    const docPath = join(taskDir, 'document.json');
    if (!existsSync(docPath)) {
      console.log('  document.json尚不存在');
      continue;
    }

    const doc = JSON.parse(readFileSync(docPath, 'utf-8'));
    console.log(`  状态: ${doc.status || 'unknown'}`);

    if (doc.status === 'completed' || doc.status === 'failed') {
      console.log(`\n✅ 任务完成！状态: ${doc.status}`);
      return doc;
    }

    // 显示进度信息
    if (doc.tracks && doc.tracks.length > 0) {
      console.log(`  已有 ${doc.tracks.length} 个轨道`);
    }
    if (doc.audioGraph && doc.audioGraph.length > 0) {
      console.log(`  🎵 audioGraph有 ${doc.audioGraph.length} 个节点`);
    }
  }

  throw new Error(`任务超时 (${maxWaitMinutes}分钟)`);
}

// 主测试流程
async function runTest() {
  console.log('🧪 完整音频链条端到端测试\n');

  // 1. 创建任务
  console.log('📤 发送创建任务请求...');
  const response = await fetch('http://localhost:3020/v1/tasks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      message: `把这些商品素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头,至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看,再展开三个有依据的产品特点,串起一个看得懂的使用过程,最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计,例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏,不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低,有价值的产品操作声保留。竖屏不能裁掉关键商品结构和操作动作。`,
      assets: ['sample-product.mp4'] // 使用测试素材
    })
  });

  const result = await response.json();
  console.log('响应:', JSON.stringify(result, null, 2));

  if (!result.taskId) {
    throw new Error('未获取到taskId');
  }

  // 2. 等待任务完成
  const doc = await waitForTask(result.taskId);

  // 3. 检查音频相关字段
  console.log('\n📊 音频链条检查:');
  console.log('==================');

  console.log('\n1️⃣ business-contract.explicitConstraints:');
  console.log('  narration:', doc.businessContract?.explicitConstraints?.narration || 'MISSING');
  console.log('  music:', doc.businessContract?.explicitConstraints?.music || 'MISSING');

  console.log('\n2️⃣ document.audioRequirements:');
  console.log('  music:', doc.audioRequirements?.music);
  console.log('  original:', doc.audioRequirements?.original);

  console.log('\n3️⃣ brief.needsNarration:');
  const brief = doc.brief || {};
  console.log('  needsNarration:', brief.needsNarration);

  console.log('\n4️⃣ audioGraph:');
  console.log('  节点数量:', doc.audioGraph?.length || 0);
  if (doc.audioGraph && doc.audioGraph.length > 0) {
    doc.audioGraph.forEach((node, i) => {
      console.log(`  [${i}] ${node.type}: ${node.source || node.text?.substring(0, 50) || 'N/A'}`);
    });
  }

  console.log('\n5️⃣ audio-processing.json:');
  const audioProcessingPath = join(`/Users/a1234/.openclaw/hyperframe/state/tasks/${result.taskId}`, 'audio-processing.json');
  if (existsSync(audioProcessingPath)) {
    const audioProcessing = JSON.parse(readFileSync(audioProcessingPath, 'utf-8'));
    console.log('  记录数量:', audioProcessing.length);
    audioProcessing.forEach((record, i) => {
      console.log(`  [${i}] ${record.stage}: ${record.action}`);
    });
  } else {
    console.log('  文件不存在');
  }

  // 4. 判定结果
  console.log('\n🎯 最终判定:');
  console.log('==================');

  const checks = {
    'business-contract识别narration': doc.businessContract?.explicitConstraints?.narration === 'required',
    'business-contract识别music': doc.businessContract?.explicitConstraints?.music === 'required',
    'document设置audioRequirements.music': doc.audioRequirements?.music === true,
    'brief设置needsNarration': brief.needsNarration === true,
    'audioGraph非空': doc.audioGraph && doc.audioGraph.length > 0,
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`${passed ? '✅' : '❌'} ${check}`);
    if (!passed) allPassed = false;
  }

  console.log('\n' + (allPassed ? '🎉 所有检查通过！音频链条完全修复！' : '⚠️  仍有问题待修复'));

  return allPassed;
}

runTest().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
