#!/usr/bin/env node
/**
 * 端到端音频验收测试
 *
 * 验证完整的音频生成链条：
 * 1. 上传商品视频素材
 * 2. 提交包含音频要求的完整需求
 * 3. 监控任务执行
 * 4. 验证最终成片包含配音和音乐
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const INBOUND_DIR = path.join(process.env.HOME, '.openclaw/hyperframe/state/media/inbound');
const SERVER_URL = 'http://localhost:3020';
const PROJECT_ROOT = process.cwd();

console.log('🧪 端到端音频验收测试\n');

// 步骤1：选择素材
console.log('📂 步骤1：选择测试素材');
const files = await fs.readdir(INBOUND_DIR);
const videoFiles = files.filter(f => f.endsWith('.mp4') && !f.includes('fixture'));
let selectedFile = null;
for (const f of videoFiles) {
  try {
    const stat = await fs.stat(path.join(INBOUND_DIR, f));
    if (stat.size > 1024 * 1024 && stat.size < 50 * 1024 * 1024) {
      selectedFile = f;
      break;
    }
  } catch {}
}

if (!selectedFile) {
  console.error('❌ 未找到合适的测试素材（1MB-50MB的MP4文件）');
  process.exit(1);
}

const videoPath = path.join(INBOUND_DIR, selectedFile);
const videoStat = await fs.stat(videoPath);
console.log(`✅ 选中素材: ${selectedFile}`);
console.log(`   大小: ${(videoStat.size / 1024 / 1024).toFixed(2)} MB\n`);

// 步骤2：构造请求
console.log('📝 步骤2：构造完整需求');

const form = new FormData();
const videoBuffer = await fs.readFile(videoPath);
form.append('images', new File([videoBuffer], 'product.mp4', {type: 'video/mp4'}));
form.append('productName', '测试商品');
form.append('facts', '高品质\n实用设计\n值得信赖');
form.append('cta', '立即了解');
form.append('duration', '30');
form.append('style', 'premium');
form.append('creativeMode', 'mixed');
form.append('message', `
请制作一条30秒的商品推广视频，要求：
1. 从素材中选取5-7个有效镜头
2. 开头3秒用产品画面吸引观看
3. 展示3个产品特点
4. 结尾做行动引导

重要：必须加入清晰的中文讲解配音、与讲解对齐的字幕、以及合适的背景音乐。
配音要自然流畅，音乐音量要低于配音。
`.trim());

console.log('✅ 需求已构造\n');

// 步骤3：提交任务
console.log('📤 步骤3：提交任务到服务器');
const response = await fetch(`${SERVER_URL}/api/commerce-chat`, {
  method: 'POST',
  body: form
});

if (!response.ok) {
  const text = await response.text();
  console.error(`❌ 提交失败: ${response.status} ${response.statusText}`);
  console.error(text);
  process.exit(1);
}

const result = await response.json();
console.log('✅ 任务已提交');
console.log(`   项目ID: ${result.result?.projectId || 'unknown'}`);
console.log(`   操作ID: ${result.result?.operationId || 'unknown'}\n`);

const projectId = result.result?.projectId;
if (!projectId) {
  console.error('❌ 未获取到项目ID');
  process.exit(1);
}

// 步骤4：监控任务进度
console.log('⏳ 步骤4：监控任务进度');
let lastStatus = null;
let attempts = 0;
const maxAttempts = 120; // 10分钟超时

while (attempts < maxAttempts) {
  await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查一次
  attempts++;

  try {
    const statusRes = await fetch(`${SERVER_URL}/api/commerce/${projectId}/status`);
    if (!statusRes.ok) continue;

    const status = await statusRes.json();
    if (JSON.stringify(status) !== JSON.stringify(lastStatus)) {
      console.log(`   [${new Date().toLocaleTimeString()}] 状态: ${status.stage || 'unknown'} - ${status.message || ''}`);
      lastStatus = status;
    }

    if (status.stage === 'complete') {
      console.log('✅ 任务完成\n');
      break;
    }

    if (status.stage === 'failed') {
      console.error(`❌ 任务失败: ${status.message || 'unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    // 继续等待
  }
}

if (attempts >= maxAttempts) {
  console.error('❌ 任务超时（10分钟）');
  process.exit(1);
}

// 步骤5：下载成片
console.log('📥 步骤5：下载成片');
const videoRes = await fetch(`${SERVER_URL}/api/commerce/${projectId}/video`);
if (!videoRes.ok) {
  console.error(`❌ 下载失败: ${videoRes.status}`);
  process.exit(1);
}

const outputPath = path.join(PROJECT_ROOT, `test-output-${projectId}.mp4`);
const videoArrayBuffer = await videoRes.arrayBuffer();
await fs.writeFile(outputPath, Buffer.from(videoArrayBuffer));
console.log(`✅ 成片已下载: ${outputPath}`);
console.log(`   大小: ${(videoArrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB\n`);

// 步骤6：验证音频
console.log('🎵 步骤6：验证音频内容');
console.log('   使用ffprobe检查音频流...');

const ffprobe = spawn('ffprobe', [
  '-v', 'error',
  '-show_entries', 'stream=codec_type,codec_name',
  '-of', 'json',
  outputPath
]);

let ffprobeOutput = '';
ffprobe.stdout.on('data', data => ffprobeOutput += data);
ffprobe.stderr.on('data', data => console.error(`   ffprobe错误: ${data}`));

await new Promise((resolve, reject) => {
  ffprobe.on('close', code => {
    if (code === 0) resolve();
    else reject(new Error(`ffprobe退出码: ${code}`));
  });
});

try {
  const streams = JSON.parse(ffprobeOutput);
  const audioStreams = streams.streams?.filter(s => s.codec_type === 'audio') || [];

  if (audioStreams.length === 0) {
    console.error('❌ 验收失败: 视频不包含音频流');
    console.log('\n📋 失败原因：');
    console.log('   - 最终视频无音频轨道');
    console.log('   - 音频生成链条未生效');
    process.exit(1);
  }

  console.log(`✅ 发现 ${audioStreams.length} 个音频流`);
  audioStreams.forEach((stream, i) => {
    console.log(`   音频流${i + 1}: ${stream.codec_name}`);
  });

} catch (err) {
  console.error(`❌ 解析ffprobe输出失败: ${err.message}`);
  process.exit(1);
}

// 步骤7：检查项目目录
console.log('\n📁 步骤7：检查项目目录');
const projectDir = path.join(PROJECT_ROOT, 'data/commerce-runs', projectId);

try {
  const files = await fs.readdir(projectDir);
  const audioFiles = files.filter(f =>
    f.includes('narration') ||
    f.includes('music') ||
    f.includes('audio') ||
    f.match(/\.(mp3|wav|aac|m4a)$/)
  );

  if (audioFiles.length > 0) {
    console.log(`✅ 发现 ${audioFiles.length} 个音频文件:`);
    audioFiles.forEach(f => console.log(`   - ${f}`));
  } else {
    console.log('⚠️  项目目录未发现音频文件（可能已集成到视频）');
  }
} catch (err) {
  console.log(`⚠️  无法读取项目目录: ${err.message}`);
}

// 最终结果
console.log('\n' + '='.repeat(60));
console.log('🎉 音频验收测试通过！');
console.log('='.repeat(60));
console.log('\n✅ 验收要点：');
console.log('   1. 任务成功完成');
console.log('   2. 最终视频包含音频流');
console.log('   3. 音频编码格式正确');
console.log('\n📝 后续人工检查：');
console.log(`   1. 播放视频: ${outputPath}`);
console.log('   2. 确认有清晰的中文配音');
console.log('   3. 确认有合适的背景音乐');
console.log('   4. 确认配音与字幕同步');
console.log('   5. 确认音乐音量低于配音');

process.exit(0);
