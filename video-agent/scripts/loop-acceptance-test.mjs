#!/usr/bin/env node
/**
 * OpenClaw 循环验收测试
 *
 * 执行完整的商品视频制作和编辑流程：
 * 1. 第一轮：从长素材制作完整电商成片（45秒护肤品视频）
 * 2. 第二轮：实质性重剪辑（改变镜头顺序、结构、讲解）
 * 3. 第三轮：选择性恢复（保留第二轮大部分改动，恢复特定元素）
 * 4. 第四轮：另一商品验证（不同商品，不同表达方式）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Blob } from 'node:buffer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_BASE = 'http://127.0.0.1:3024';

// 测试状态
const state = {
  round1ProjectId: null,
  round1VideoPath: null,
  round2VideoPath: null,
  round3VideoPath: null,
  round4ProjectId: null,
  round4VideoPath: null,
  startTime: Date.now(),
  issues: [],
  evidence: {}
};

// 日志工具
function log(emoji, message) {
  const timestamp = new Date().toISOString().substring(11, 23);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

function logStep(round, step, message) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`第${round}轮 - 步骤${step}: ${message}`);
  console.log(`${'='.repeat(80)}\n`);
}

function recordIssue(round, severity, description, evidence = {}) {
  state.issues.push({ round, severity, description, evidence, timestamp: new Date().toISOString() });
  const icon = severity === 'CRITICAL' ? '🔴' : severity === 'HIGH' ? '🟠' : severity === 'MEDIUM' ? '🟡' : '⚪';
  log(icon, `[${severity}] ${description}`);
}

// 等待任务完成（带超时）
async function waitForCompletion(checkFn, description, timeoutMs = 600000, intervalMs = 3000) {
  const startTime = Date.now();
  let lastStatus = null;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await checkFn();

      if (result.status !== lastStatus) {
        log('📊', `${description}: ${result.status}`);
        lastStatus = result.status;
      }

      if (result.complete) {
        return result;
      }

      if (result.failed) {
        throw new Error(`任务失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      if (error.message.includes('任务失败')) throw error;
      log('⚠️', `检查状态时出错: ${error.message}，继续等待...`);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${description} 超时（${timeoutMs / 1000}秒）`);
}

// 上传素材到项目
async function uploadAssets(projectId, assets) {
  log('📤', `准备上传 ${assets.length} 个素材文件...`);

  const uploaded = [];
  for (const [i, asset] of assets.entries()) {
    log('📤', `上传 ${i + 1}/${assets.length}: ${asset.name}`);

    const videoPath = path.join(ROOT, asset.path);
    const videoData = await fs.readFile(videoPath);

    const response = await fetch(`${API_BASE}/api/commerce/${projectId}/assets`, {
      method: 'POST',
      headers: {
        'x-file-name': encodeURIComponent(asset.name)
      },
      body: videoData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`素材上传失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    if (result.asset) {
      uploaded.push(result.asset);
      log('✅', `已上传: ${asset.name} (ID: ${result.asset.id})`);
    }
  }

  return uploaded;
}

// 创建draft项目
async function createDraft(message) {
  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'draft',
      request: {
        message,
        inferRequest: true,
        target: 'marketing',
        output: {
          width: 1080,
          height: 1920,
          durationSeconds: 45
        },
        taskMode: 'create',
        pipelineVersion: 3
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`创建draft失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (!result.ok || !result.project) {
    throw new Error('创建draft失败: 无法获取项目');
  }

  return result.project;
}

// 发送消息到项目
async function sendMessage(projectId, message, attachmentIds) {
  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      attachmentIds,
      taskMode: 'create',
      baseRevisionId: null,
      idempotencyKey: randomUUID()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`发送消息失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error('发送消息失败');
  }

  return result;
}

// 检查视频文件质量
async function analyzeVideo(videoPath) {
  const stat = await fs.stat(videoPath);

  if (stat.size < 100000) {
    return { valid: false, reason: '文件过小，可能生成失败' };
  }

  log('✅', `视频文件大小: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  // 计算SHA256用于版本追踪
  const videoData = await fs.readFile(videoPath);
  const sha256 = createHash('sha256').update(videoData).digest('hex');

  return {
    valid: true,
    size: stat.size,
    sha256,
    path: videoPath
  };
}

// 第一轮：完整商品推广视频制作
async function round1_CompleteCommercialProduction() {
  logStep(1, 1, '从长素材制作完整电商成片（护肤精华）');

  // 选择素材
  const assets = [
    { path: 'assets/commerce-serum/hero-8131892.mp4', name: 'hero.mp4', duration: 26 },
    { path: 'assets/commerce-serum/drop-8131887.mp4', name: 'drop.mp4', duration: 19 },
    { path: 'assets/commerce-serum/apply-8131889.mp4', name: 'apply.mp4', duration: 27 }
  ];

  log('📋', '素材选择：');
  assets.forEach(a => log('  📹', `${a.name} (${a.duration}秒)`));

  // 构建详细的制作要求
  const message = `把这些护肤精华素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头，至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看，再展开三个有依据的产品特点，串起一个看得懂的使用过程，最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计，例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏，不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低，有价值的产品操作声保留。竖屏不能裁掉关键商品结构和操作动作。

自动制作、检查并交付可播放和下载的新视频，显示真实进度，不要只返回方案。`;

  log('🎬', '创建项目草稿...');
  const startTime = Date.now();

  // 1. 创建draft
  const project = await createDraft(message);
  const projectId = project.id;
  state.round1ProjectId = projectId;
  log('✅', `项目已创建: ${projectId}`);

  // 2. 上传素材
  const uploaded = await uploadAssets(projectId, assets);
  const attachmentIds = uploaded.map(a => a.id);
  log('✅', `已上传 ${uploaded.length} 个素材`);

  // 3. 发送制作消息
  log('📤', '发送制作请求...');
  await sendMessage(projectId, message, attachmentIds);
  log('✅', '制作请求已提交');

  // 4. 等待完成
  log('⏳', '等待视频生成...');

  const finalResult = await waitForCompletion(
    async () => {
      const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
      if (!statusResponse.ok) {
        throw new Error(`获取状态失败: ${statusResponse.status}`);
      }
      const status = await statusResponse.json();
      const project = status.project;

      // 检查是否有活跃的job
      const activeJob = project.jobs?.find(j => ['queued', 'running'].includes(j.status));
      const latestJob = project.jobs?.[project.jobs.length - 1];

      return {
        status: latestJob?.status || 'unknown',
        complete: project.currentRevisionId && project.revisions?.find(r => r.id === project.currentRevisionId)?.rendered,
        failed: latestJob?.status === 'failed',
        error: latestJob?.error,
        progress: activeJob ? `${activeJob.kind}: ${activeJob.status}` : null
      };
    },
    '第一轮制作',
    600000 // 10分钟超时
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('⏱️', `制作耗时: ${duration}秒`);

  if (duration > 600) {
    recordIssue(1, 'HIGH', `制作耗时超过目标（${duration}秒 > 600秒）`);
  }

  // 5. 获取当前revision
  const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  const statusData = await statusResponse.json();
  const currentRevisionId = statusData.project.currentRevisionId;

  if (!currentRevisionId) {
    recordIssue(1, 'CRITICAL', '制作完成但无法获取revision ID');
    throw new Error('无法获取revision ID');
  }

  state.round1RevisionId = currentRevisionId;
  log('✅', `当前版本: ${currentRevisionId}`);

  // 6. 下载视频
  log('📥', '下载成片...');
  const videoResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/revisions/${currentRevisionId}/commerce-final.mp4`);

  if (!videoResponse.ok) {
    recordIssue(1, 'CRITICAL', `视频下载失败 (${videoResponse.status})`);
    throw new Error('视频下载失败');
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const videoPath = path.join(ROOT, 'test-outputs', `round1-${projectId}.mp4`);
  await fs.mkdir(path.dirname(videoPath), { recursive: true });
  await fs.writeFile(videoPath, Buffer.from(videoBuffer));

  state.round1VideoPath = videoPath;
  log('✅', `视频已保存: ${videoPath}`);

  // 分析视频
  const analysis = await analyzeVideo(videoPath);
  if (!analysis.valid) {
    recordIssue(1, 'CRITICAL', `视频验证失败: ${analysis.reason}`);
    throw new Error(analysis.reason);
  }

  state.evidence.round1 = {
    projectId,
    videoPath,
    sha256: analysis.sha256,
    size: analysis.size,
    duration: duration
  };

  log('🎉', '第一轮完成！');
  return { projectId, videoPath };
}

// 第二轮：实质性重剪辑
async function round2_SubstantialReEdit(projectId) {
  logStep(2, 1, '实质性重剪辑（改变结构和内容）');

  const message = `上一版还太像常规产品介绍。前4秒直接展示真实使用中的关键动作，不要先放静态品牌卡；把使用演示移到第二段，再用细节解释为什么值得关注。

删掉两处信息重复的展示，换成其他真实细节镜头。第二个特点改成整体和细节并排展示，不要编造使用前后效果。

随新顺序重写受影响的讲解，重新对齐字幕，调整相应节奏和音量衔接。

保留商品身份、已确认事实、原来的背景音乐曲目、整体视觉风格、结尾行动引导、时长和竖屏输出。不要把没涉及的部分全部重做。`;

  log('✏️', '发送编辑请求...');
  const startTime = Date.now();

  // 获取当前项目状态
  const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  if (!statusResponse.ok) {
    recordIssue(2, 'CRITICAL', '无法获取项目状态');
    throw new Error('无法获取项目状态');
  }
  const statusData = await statusResponse.json();
  const baseRevisionId = statusData.project.currentRevisionId;

  // 发送编辑消息
  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      taskMode: 'edit',
      baseRevisionId,
      attachmentIds: [],
      idempotencyKey: randomUUID()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    recordIssue(2, 'CRITICAL', `编辑请求失败 (${response.status})`, { error: errorText });
    throw new Error(`编辑请求失败: ${errorText}`);
  }

  // 等待重新渲染
  log('⏳', '等待编辑完成...');
  await waitForCompletion(
    async () => {
      const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
      if (!statusResponse.ok) {
        throw new Error(`获取状态失败: ${statusResponse.status}`);
      }
      const status = await statusResponse.json();
      const project = status.project;

      const activeJob = project.jobs?.find(j => ['queued', 'running'].includes(j.status));
      const latestJob = project.jobs?.[project.jobs.length - 1];

      return {
        status: latestJob?.status || 'unknown',
        complete: project.currentRevisionId && project.currentRevisionId !== baseRevisionId && project.revisions?.find(r => r.id === project.currentRevisionId)?.rendered,
        failed: latestJob?.status === 'failed',
        error: latestJob?.error,
        progress: activeJob ? `${activeJob.kind}: ${activeJob.status}` : null
      };
    },
    '第二轮编辑',
    360000 // 6分钟
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('⏱️', `编辑耗时: ${duration}秒`);

  // 获取新的revision ID
  const newStatusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  const newStatusData = await newStatusResponse.json();
  const newRevisionId = newStatusData.project.currentRevisionId;

  if (!newRevisionId || newRevisionId === baseRevisionId) {
    recordIssue(2, 'CRITICAL', '编辑未产生新版本');
    throw new Error('编辑未产生新版本');
  }

  state.round2RevisionId = newRevisionId;
  log('✅', `新版本: ${newRevisionId}`);

  // 下载新版本
  log('📥', '下载编辑后的视频...');
  const videoResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/revisions/${newRevisionId}/commerce-final.mp4`);

  if (!videoResponse.ok) {
    recordIssue(2, 'CRITICAL', `视频下载失败 (${videoResponse.status})`);
    throw new Error('视频下载失败');
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const videoPath = path.join(ROOT, 'test-outputs', `round2-${projectId}-${newRevisionId}.mp4`);
  await fs.writeFile(videoPath, Buffer.from(videoBuffer));

  state.round2VideoPath = videoPath;
  log('✅', `视频已保存: ${videoPath}`);

  // 验证是否真的改变了
  const analysis = await analyzeVideo(videoPath);
  if (analysis.sha256 === state.evidence.round1.sha256) {
    recordIssue(2, 'CRITICAL', '视频内容未改变（SHA256相同）', {
      round1: state.evidence.round1.sha256,
      round2: analysis.sha256
    });
  }

  state.evidence.round2 = {
    revisionId: newRevisionId,
    videoPath,
    sha256: analysis.sha256,
    size: analysis.size,
    duration: duration
  };

  log('🎉', '第二轮完成！');
  return videoPath;
}

// 第三轮：选择性恢复
async function round3_SelectiveRestore(projectId) {
  logStep(3, 1, '选择性恢复（保留大部分改动，恢复特定元素）');

  const message = `保留刚才的新开头、新叙事顺序、新镜头和新讲解字幕。只把第二个特点展示段的版式恢复成第一版的整体展示（不要并排分屏），其他地方保持刚才这版，不要把整条视频回滚。`;

  log('↩️', '发送恢复请求...');
  const startTime = Date.now();

  // 获取当前项目状态
  const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  if (!statusResponse.ok) {
    recordIssue(3, 'CRITICAL', '无法获取项目状态');
    throw new Error('无法获取项目状态');
  }
  const statusData = await statusResponse.json();
  const baseRevisionId = statusData.project.currentRevisionId;

  // 发送恢复消息
  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      taskMode: 'edit',
      baseRevisionId,
      attachmentIds: [],
      idempotencyKey: randomUUID()
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    recordIssue(3, 'CRITICAL', `恢复请求失败 (${response.status})`, { error: errorText });
    throw new Error(`恢复请求失败: ${errorText}`);
  }

  log('⏳', '等待恢复完成...');
  await waitForCompletion(
    async () => {
      const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
      if (!statusResponse.ok) {
        throw new Error(`获取状态失败: ${statusResponse.status}`);
      }
      const status = await statusResponse.json();
      const project = status.project;

      const activeJob = project.jobs?.find(j => ['queued', 'running'].includes(j.status));
      const latestJob = project.jobs?.[project.jobs.length - 1];

      return {
        status: latestJob?.status || 'unknown',
        complete: project.currentRevisionId && project.currentRevisionId !== baseRevisionId && project.revisions?.find(r => r.id === project.currentRevisionId)?.rendered,
        failed: latestJob?.status === 'failed',
        error: latestJob?.error,
        progress: activeJob ? `${activeJob.kind}: ${activeJob.status}` : null
      };
    },
    '第三轮恢复',
    180000 // 3分钟
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('⏱️', `恢复耗时: ${duration}秒`);

  // 获取新的revision ID
  const newStatusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  const newStatusData = await newStatusResponse.json();
  const newRevisionId = newStatusData.project.currentRevisionId;

  if (!newRevisionId || newRevisionId === baseRevisionId) {
    recordIssue(3, 'CRITICAL', '恢复未产生新版本');
    throw new Error('恢复未产生新版本');
  }

  state.round3RevisionId = newRevisionId;
  log('✅', `新版本: ${newRevisionId}`);

  // 下载最终版本
  log('📥', '下载恢复后的视频...');
  const videoResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/revisions/${newRevisionId}/commerce-final.mp4`);

  if (!videoResponse.ok) {
    recordIssue(3, 'CRITICAL', `视频下载失败 (${videoResponse.status})`);
    throw new Error('视频下载失败');
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const videoPath = path.join(ROOT, 'test-outputs', `round3-${projectId}-${newRevisionId}.mp4`);
  await fs.writeFile(videoPath, Buffer.from(videoBuffer));

  state.round3VideoPath = videoPath;
  log('✅', `视频已保存: ${videoPath}`);

  const analysis = await analyzeVideo(videoPath);

  // 验证：应该不同于round1和round2
  if (analysis.sha256 === state.evidence.round2.sha256) {
    recordIssue(3, 'HIGH', '视频内容与第二轮相同，可能未执行恢复');
  }
  if (analysis.sha256 === state.evidence.round1.sha256) {
    recordIssue(3, 'CRITICAL', '视频完全回滚到第一轮，不是选择性恢复');
  }

  state.evidence.round3 = {
    revisionId: newRevisionId,
    videoPath,
    sha256: analysis.sha256,
    size: analysis.size,
    duration: duration
  };

  log('🎉', '第三轮完成！');
  return videoPath;
}

// 第四轮：另一商品验证
async function round4_DifferentProduct() {
  logStep(4, 1, '另一商品验证（机械键盘）');

  // 使用不同的素材和表达方式
  const assets = [
    { path: 'assets/commerce-keyboard/01-keyboard-close.mp4', name: 'close.mp4', duration: 15 },
    { path: 'assets/commerce-keyboard/02-keyboard-angle.mp4', name: 'angle.mp4', duration: 15 }
  ];

  log('📋', '素材选择：');
  assets.forEach(a => log('  📹', `${a.name} (${a.duration}秒)`));

  const message = `制作一条30秒的机械键盘推广视频，竖屏1080×1920。

从细节入手展现品质：开场用键帽和轴体的特写吸引发烧友，展示按键手感和RGB灯效，最后呈现整体设计和使用场景。

用专业、科技感的视觉风格，配合节奏明快的电子音乐，字幕突出核心卖点（机械手感、RGB灯效、人体工学设计、专业品质）。保持高端数码产品的推广质感。`;

  log('🎬', '创建第二个商品项目...');
  const startTime = Date.now();

  // 1. 创建draft
  const project = await createDraft(message);
  const projectId = project.id;
  state.round4ProjectId = projectId;
  log('✅', `项目已创建: ${projectId}`);

  // 2. 上传素材
  const uploaded = await uploadAssets(projectId, assets);
  const attachmentIds = uploaded.map(a => a.id);
  log('✅', `已上传 ${uploaded.length} 个素材`);

  // 3. 发送制作消息
  log('📤', '发送制作请求...');
  await sendMessage(projectId, message, attachmentIds);
  log('✅', '制作请求已提交');

  // 4. 等待完成
  log('⏳', '等待视频生成...');
  await waitForCompletion(
    async () => {
      const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
      if (!statusResponse.ok) {
        throw new Error(`获取状态失败: ${statusResponse.status}`);
      }
      const status = await statusResponse.json();
      const project = status.project;

      const activeJob = project.jobs?.find(j => ['queued', 'running'].includes(j.status));
      const latestJob = project.jobs?.[project.jobs.length - 1];

      return {
        status: latestJob?.status || 'unknown',
        complete: project.currentRevisionId && project.revisions?.find(r => r.id === project.currentRevisionId)?.rendered,
        failed: latestJob?.status === 'failed',
        error: latestJob?.error,
        progress: activeJob ? `${activeJob.kind}: ${activeJob.status}` : null
      };
    },
    '第四轮制作',
    600000 // 10分钟
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  log('⏱️', `制作耗时: ${duration}秒`);

  // 5. 获取当前revision
  const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  const statusData = await statusResponse.json();
  const currentRevisionId = statusData.project.currentRevisionId;

  if (!currentRevisionId) {
    recordIssue(4, 'CRITICAL', '制作完成但无法获取revision ID');
    throw new Error('无法获取revision ID');
  }

  state.round4RevisionId = currentRevisionId;
  log('✅', `当前版本: ${currentRevisionId}`);

  // 6. 下载视频
  log('📥', '下载成片...');
  const videoResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/revisions/${currentRevisionId}/commerce-final.mp4`);

  if (!videoResponse.ok) {
    recordIssue(4, 'CRITICAL', `视频下载失败 (${videoResponse.status})`);
    throw new Error('视频下载失败');
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const videoPath = path.join(ROOT, 'test-outputs', `round4-${projectId}-${currentRevisionId}.mp4`);
  await fs.writeFile(videoPath, Buffer.from(videoBuffer));

  state.round4VideoPath = videoPath;
  log('✅', `视频已保存: ${videoPath}`);

  const analysis = await analyzeVideo(videoPath);
  state.evidence.round4 = {
    projectId,
    revisionId: currentRevisionId,
    videoPath,
    sha256: analysis.sha256,
    size: analysis.size,
    duration: duration
  };

  log('🎉', '第四轮初始制作完成！');

  // 对第二个商品也进行一次编辑测试
  log('✏️', '对第二个商品进行编辑测试...');

  const editMessage = `把开场的节奏放慢，突出键盘的设计细节和质感，不要一开始就强调RGB灯效。配乐改成更沉稳的风格，保持专业数码产品的调性。`;

  const editStartTime = Date.now();

  // 获取当前项目状态
  const editStatusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
  const editStatusData = await editStatusResponse.json();
  const baseRevisionId = editStatusData.project.currentRevisionId;

  // 发送编辑消息
  const editResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message: editMessage,
      taskMode: 'edit',
      baseRevisionId,
      attachmentIds: [],
      idempotencyKey: randomUUID()
    })
  });

  if (!editResponse.ok) {
    const errorText = await editResponse.text();
    recordIssue(4, 'HIGH', `第二个商品编辑失败 (${editResponse.status})`, { error: errorText });
    log('⚠️', '编辑请求失败，但主流程已完成');
  } else {
    log('⏳', '等待编辑完成...');
    await waitForCompletion(
      async () => {
        const statusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
        if (!statusResponse.ok) {
          throw new Error(`获取状态失败: ${statusResponse.status}`);
        }
        const status = await statusResponse.json();
        const project = status.project;

        const activeJob = project.jobs?.find(j => ['queued', 'running'].includes(j.status));
        const latestJob = project.jobs?.[project.jobs.length - 1];

        return {
          status: latestJob?.status || 'unknown',
          complete: project.currentRevisionId && project.currentRevisionId !== baseRevisionId && project.revisions?.find(r => r.id === project.currentRevisionId)?.rendered,
          failed: latestJob?.status === 'failed',
          error: latestJob?.error,
          progress: activeJob ? `${activeJob.kind}: ${activeJob.status}` : null
        };
      },
      '第四轮编辑',
      360000 // 6分钟
    );

    const editDuration = ((Date.now() - editStartTime) / 1000).toFixed(1);
    log('⏱️', `编辑耗时: ${editDuration}秒`);

    // 下载编辑后的视频
    const newStatusResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
    const newStatusData = await newStatusResponse.json();
    const newRevisionId = newStatusData.project.currentRevisionId;

    if (newRevisionId && newRevisionId !== baseRevisionId) {
      log('📥', '下载编辑后的视频...');
      const editedVideoResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/revisions/${newRevisionId}/commerce-final.mp4`);

      if (editedVideoResponse.ok) {
        const editedVideoBuffer = await editedVideoResponse.arrayBuffer();
        const editedVideoPath = path.join(ROOT, 'test-outputs', `round4-edited-${projectId}-${newRevisionId}.mp4`);
        await fs.writeFile(editedVideoPath, Buffer.from(editedVideoBuffer));
        log('✅', `编辑后视频已保存: ${editedVideoPath}`);

        state.evidence.round4Edit = {
          revisionId: newRevisionId,
          videoPath: editedVideoPath,
          duration: editDuration
        };
      }
    }

    log('✅', '第二个商品编辑完成');
  }

  return projectId;
}

// 生成最终报告
function generateReport() {
  console.log('\n\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('║' + '        OpenClaw 循环验收测试 - 最终报告'.padEnd(78) + '║');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');
  console.log();

  const totalDuration = ((Date.now() - state.startTime) / 1000).toFixed(1);
  console.log(`总测试时长: ${totalDuration}秒\n`);

  console.log('━━━ 完成情况 ━━━\n');
  console.log(`✓ 第一轮: ${state.round1VideoPath ? '完成' : '失败'}`);
  console.log(`✓ 第二轮: ${state.round2VideoPath ? '完成' : '失败'}`);
  console.log(`✓ 第三轮: ${state.round3VideoPath ? '完成' : '失败'}`);
  console.log(`✓ 第四轮: ${state.round4VideoPath ? '完成' : '失败'}\n`);

  console.log('━━━ 问题汇总 ━━━\n');
  const critical = state.issues.filter(i => i.severity === 'CRITICAL');
  const high = state.issues.filter(i => i.severity === 'HIGH');
  const medium = state.issues.filter(i => i.severity === 'MEDIUM');

  console.log(`🔴 CRITICAL: ${critical.length}个`);
  console.log(`🟠 HIGH: ${high.length}个`);
  console.log(`🟡 MEDIUM: ${medium.length}个\n`);

  if (state.issues.length > 0) {
    console.log('━━━ 详细问题列表 ━━━\n');
    state.issues.forEach((issue, i) => {
      console.log(`${i + 1}. [${issue.severity}] 第${issue.round}轮: ${issue.description}`);
      if (Object.keys(issue.evidence).length > 0) {
        console.log(`   证据: ${JSON.stringify(issue.evidence)}`);
      }
    });
    console.log();
  }

  console.log('━━━ 成片证据 ━━━\n');
  Object.entries(state.evidence).forEach(([round, data]) => {
    console.log(`${round}:`);
    console.log(`  路径: ${data.videoPath}`);
    console.log(`  大小: ${(data.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  SHA256: ${data.sha256.substring(0, 16)}...`);
    console.log(`  耗时: ${data.duration}秒`);
    console.log();
  });

  console.log('━━━ 验收结论 ━━━\n');

  const passed = critical.length === 0 && state.round1VideoPath && state.round2VideoPath && state.round3VideoPath && state.round4VideoPath;

  if (passed) {
    console.log('✅ AGENT_ACCEPTED / READY_FOR_USER_ACCEPTANCE');
    console.log('\n所有轮次完成，无严重问题。等待用户最终验收。\n');
  } else {
    console.log('❌ 验收未通过\n');
    console.log('原因:');
    if (critical.length > 0) console.log(`  - ${critical.length}个CRITICAL问题未解决`);
    if (!state.round1VideoPath) console.log('  - 第一轮未完成');
    if (!state.round2VideoPath) console.log('  - 第二轮未完成');
    if (!state.round3VideoPath) console.log('  - 第三轮未完成');
    if (!state.round4VideoPath) console.log('  - 第四轮未完成');
    console.log('\n需要继续修复。\n');
  }

  return passed;
}

// 主执行流程
async function main() {
  try {
    console.log('\n启动OpenClaw循环验收测试...\n');

    // 检查服务健康
    log('🏥', '检查服务健康状态...');
    const healthResponse = await fetch(`${API_BASE}/api/health`);
    if (!healthResponse.ok) {
      throw new Error('服务不可用');
    }
    const health = await healthResponse.json();
    log('✅', `服务正常 (版本: ${health.version}, 运行时: ${health.agentRuntime})`);

    // 执行四轮测试
    const { projectId } = await round1_CompleteCommercialProduction();
    await round2_SubstantialReEdit(projectId);
    await round3_SelectiveRestore(projectId);
    await round4_DifferentProduct();

    // 生成报告
    const passed = generateReport();

    process.exit(passed ? 0 : 1);

  } catch (error) {
    console.error('\n\n❌ 测试失败:\n');
    console.error(error.message);
    console.error(error.stack);

    generateReport();

    process.exit(1);
  }
}

main();