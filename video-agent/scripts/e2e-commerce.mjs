#!/usr/bin/env node
/**
 * OpenClaw 电商视频 E2E 自动化测试
 * 通过HTTP API模拟完整的浏览器工作流
 */

import { readFile, writeFile } from 'fs/promises';
import { readFileSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_BASE = 'http://127.0.0.1:3024';

// 测试状态
const state = {
  startTime: Date.now(),
  round: 1,
  projectId: null,
  videoPath: null,
  results: [],
  timings: {}
};

function log(category, message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${time}] [${category}] ${message}`);
}

function logTiming(label, ms) {
  state.timings[label] = ms;
  const sec = (ms / 1000).toFixed(2);
  log('性能', `${label}: ${sec}秒`);
}

// 保存状态
async function saveState() {
  const stateFile = join(ROOT, 'e2e-state.json');
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  log('状态', `已保存到 ${basename(stateFile)}`);
}

// 加载状态
async function loadState() {
  const stateFile = join(ROOT, 'e2e-state.json');
  try {
    const data = await readFile(stateFile, 'utf8');
    Object.assign(state, JSON.parse(data));
    log('状态', `已从 ${basename(stateFile)} 恢复，当前第${state.round}轮`);
    return true;
  } catch {
    log('状态', '无现有状态，从第1轮开始');
    return false;
  }
}

// 健康检查
async function healthCheck() {
  const resp = await fetch(`${API_BASE}/api/health`);
  if (!resp.ok) throw new Error(`健康检查失败: ${resp.status}`);
  const data = await resp.json();
  log('健康', `服务正常 - 版本 ${data.version}, 工作台 ${data.workbench}`);
  return data;
}

// 创建multipart/form-data请求体
function createMultipartBody(fields, files) {
  const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const parts = [];

  // 添加文本字段
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
      `${value}\r\n`
    );
  }

  // 添加文件
  for (const file of files) {
    const content = readFileSync(file.path);
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.type}\r\n\r\n`
    );
    parts.push(content);
    parts.push('\r\n');
  }

  parts.push(`--${boundary}--\r\n`);

  // 组合body
  const buffers = parts.map(part =>
    Buffer.isBuffer(part) ? part : Buffer.from(part, 'utf8')
  );

  return {
    body: Buffer.concat(buffers),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

// 第一轮：创建完整商品短片
async function round1_createVideo() {
  log('测试', '='.repeat(60));
  log('测试', '第一轮：完整商品短片制作');
  log('测试', '='.repeat(60));

  const startTime = Date.now();

  // 准备素材路径
  const assets = [
    join(ROOT, 'assets/commerce-serum/hero-8131892.mp4'),
    join(ROOT, 'assets/commerce-serum/apply-8131889.mp4'),
    join(ROOT, 'assets/commerce-serum/drop-8131887.mp4')
  ];

  log('素材', `准备上传 ${assets.length} 个视频文件`);
  for (const asset of assets) {
    const stats = statSync(asset);
    log('素材', `- ${basename(asset)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // 详细需求
  const message = `把这些护肤精华素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头，至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看，再展开三个有依据的产品特点：质地轻盈易吸收、精准滴管设计、温和亲肤配方，串起一个看得懂的使用过程，最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计，例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏，不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低，产品滴落和涂抹的操作声保留。竖屏不能裁掉关键商品结构和操作动作。

自动制作、检查并交付可播放和下载的新视频，显示真实进度，不要只返回方案。`;

  // 构建multipart请求
  const fields = {
    productName: '氨基酸修护精华',
    facts: '质地轻盈易吸收、精准滴管设计、温和亲肤配方',
    cta: '立即体验',
    style: 'premium',
    creativeMode: 'mixed',
    duration: '45',
    message: message
  };

  const files = assets.map(assetPath => ({
    name: 'images',
    filename: basename(assetPath),
    path: assetPath,
    type: 'video/mp4'
  }));

  const { body, contentType } = createMultipartBody(fields, files);

  log('请求', '上传素材并创建项目...');
  const uploadStart = Date.now();

  try {
    const resp = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType
      },
      body: body
    });

    const uploadTime = Date.now() - uploadStart;
    logTiming('上传和任务受理', uploadTime);

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`创建失败 (${resp.status}): ${error}`);
    }

    const result = await resp.json();
    log('响应', JSON.stringify(result, null, 2));

    if (!result.ok || !result.result) {
      throw new Error('返回格式异常');
    }

    state.projectId = result.result.projectId;
    state.round = 1;

    log('项目', `已创建项目ID: ${state.projectId}`);
    await saveState();

    // 等待视频生成
    await waitForVideo(state.projectId);

    const totalTime = Date.now() - startTime;
    logTiming('第一轮总时长', totalTime);

    if (totalTime > 10 * 60 * 1000) {
      log('警告', `第一轮耗时 ${(totalTime / 60000).toFixed(2)} 分钟，超过10分钟目标`);
    }

    state.results.push({
      round: 1,
      success: true,
      projectId: state.projectId,
      duration: totalTime
    });

    return true;

  } catch (error) {
    log('错误', error.message);
    state.results.push({
      round: 1,
      success: false,
      error: error.message
    });
    throw error;
  }
}

// 等待视频生成完成
async function waitForVideo(projectId) {
  log('等待', '视频生成中...');

  const startTime = Date.now();
  const maxWait = 15 * 60 * 1000; // 最多等待15分钟
  let lastProgress = -1;

  while (Date.now() - startTime < maxWait) {
    try {
      // 检查状态
      const resp = await fetch(`${API_BASE}/api/commerce/${projectId}/status`);
      if (resp.ok) {
        const status = await resp.json();

        if (status.progress !== lastProgress) {
          log('进度', `${status.stage || '处理中'} - ${status.progress || 0}%`);
          lastProgress = status.progress || 0;
        }

        if (status.phase === 'complete' || status.stage === 'complete') {
          log('完成', '视频生成完毕');

          // 下载视频
          await downloadVideo(projectId);
          return true;
        }

        if (status.phase === 'failed' || status.stage === 'failed') {
          throw new Error(`生成失败: ${status.error || '未知错误'}`);
        }
      }
    } catch (err) {
      if (!err.message.includes('ECONNREFUSED')) {
        log('警告', `状态检查异常: ${err.message}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查一次
  }

  throw new Error('等待超时');
}

// 下载视频
async function downloadVideo(projectId) {
  const videoUrl = `${API_BASE}/api/commerce/${projectId}/video`;
  log('下载', `正在下载: ${videoUrl}`);

  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new Error(`下载失败: ${resp.status}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  const videoPath = join(ROOT, `test-output-${projectId}.mp4`);
  await writeFile(videoPath, buffer);

  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  log('下载', `已保存到 ${basename(videoPath)} (${sizeMB} MB)`);

  state.videoPath = videoPath;
  await saveState();
}

// 主函数
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('OpenClaw 电商视频 E2E 自动化测试');
  console.log('='.repeat(70) + '\n');

  try {
    // 健康检查
    await healthCheck();

    // 加载状态
    const hasState = await loadState();

    if (!hasState || !state.projectId) {
      // 第一轮
      await round1_createVideo();
    } else {
      log('测试', `已有项目 ${state.projectId}，当前应该进行第 ${state.round + 1} 轮`);
      // TODO: 实现第二轮和第三轮
    }

    console.log('\n' + '='.repeat(70));
    log('总结', '当前轮次测试完成');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n' + '='.repeat(70));
    log('失败', error.message);
    console.error(error.stack);
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
}

// Node.js环境检查
main();
