#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = 'http://127.0.0.1:3020';
const VIDEO_PATH = path.join(__dirname, '../assets/edit-samples/coffee.mp4'); // 4MB，最小的视频

console.log('=== OpenClaw 完整流程测试 ===\n');

// 步骤 1: 创建项目草稿
console.log('【步骤 1】创建项目草稿');
const draftRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'draft',
    request: {
      message: '制作15秒咖啡产品宣传片，添加标题"新鲜现磨"，配轻快背景音乐',
      target: 'marketing',
      output: {width: 1080, height: 1920, durationSeconds: 15}
    }
  })
});

if (!draftRes.ok) {
  const error = await draftRes.json();
  console.log(`  ✗ 创建失败 (${draftRes.status}):`, error);
  process.exit(1);
}

const draft = await draftRes.json();
const projectId = draft.project.id;
console.log(`  ✓ 项目创建成功: ${projectId}\n`);

// 步骤 2: 上传视频素材
console.log('【步骤 2】上传视频素材');
const videoBuffer = await fs.readFile(VIDEO_PATH);
const uploadRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/assets`, {
  method: 'POST',
  headers: {
    'Content-Type': 'video/mp4',
    'X-File-Name': encodeURIComponent('coffee.mp4')
  },
  body: videoBuffer
});

if (!uploadRes.ok) {
  const error = await uploadRes.json();
  console.log(`  ✗ 上传失败 (${uploadRes.status}):`, error);
  process.exit(1);
}

const upload = await uploadRes.json();
console.log(`  ✓ 素材上传成功: ${upload.asset.id}\n`);

// 步骤 3: 提交初始创作任务
console.log('【步骤 3】提交初始创作任务');
const createRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'generate',
    projectId,
    idempotencyKey: 'test-' + Date.now() + '-create',
    message: '开始生成视频'
  })
});

if (!createRes.ok) {
  const error = await createRes.json();
  console.log(`  ✗ 创建任务失败 (${createRes.status}):`, error);
  process.exit(1);
}

const create = await createRes.json();
console.log(`  ✓ 任务已提交: ${create.jobId}`);

// 步骤 4: 等待任务完成
console.log('  等待渲染完成...\n');
let project;
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const statusRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/status`);
  project = (await statusRes.json()).project;

  const job = project.jobs.find(j => j.id === create.jobId);
  if (job.status === 'complete') {
    console.log(`  ✓ 初始视频生成完成\n`);
    break;
  } else if (job.status === 'failed') {
    console.log(`  ✗ 任务失败: ${job.error}\n`);
    process.exit(1);
  } else if (i % 5 === 0) {
    console.log(`  状态: ${job.status} (${i * 2}s)`);
  }
}

// 步骤 5: 第一轮对话编辑 - 修改标题
console.log('【步骤 5】第一轮编辑：修改标题文字');
const edit1Res = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'patch',
    projectId,
    baseRevisionId: project.currentRevisionId,
    idempotencyKey: 'test-' + Date.now() + '-edit1',
    message: '把标题改成"醇香咖啡"'
  })
});

if (!edit1Res.ok) {
  const error = await edit1Res.json();
  console.log(`  ✗ 编辑失败 (${edit1Res.status}):`, error);
} else {
  const edit1 = await edit1Res.json();
  console.log(`  ✓ 编辑任务已提交: ${edit1.jobId}`);

  // 等待编辑完成
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/status`);
    const p = (await statusRes.json()).project;
    const job = p.jobs.find(j => j.id === edit1.jobId);

    if (job.status === 'complete') {
      console.log(`  ✓ 标题修改完成\n`);
      project = p;
      break;
    } else if (job.status === 'failed') {
      console.log(`  ✗ 编辑失败: ${job.error}\n`);
      break;
    }
  }
}

// 步骤 6: 第二轮对话编辑 - 调整视觉样式
console.log('【步骤 6】第二轮编辑：调整标题样式');
const edit2Res = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'patch',
    projectId,
    baseRevisionId: project.currentRevisionId,
    idempotencyKey: 'test-' + Date.now() + '-edit2',
    message: '把标题字体放大到 72px，颜色改成金黄色 #FFD700'
  })
});

if (!edit2Res.ok) {
  const error = await edit2Res.json();
  console.log(`  ✗ 编辑失败 (${edit2Res.status}):`, error);
} else {
  const edit2 = await edit2Res.json();
  console.log(`  ✓ 编辑任务已提交: ${edit2.jobId}`);

  // 等待编辑完成
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/status`);
    const p = (await statusRes.json()).project;
    const job = p.jobs.find(j => j.id === edit2.jobId);

    if (job.status === 'complete') {
      console.log(`  ✓ 样式调整完成\n`);
      project = p;
      break;
    } else if (job.status === 'failed') {
      console.log(`  ✗ 编辑失败: ${job.error}\n`);
      break;
    }
  }
}

// 步骤 7: 第三轮对话编辑 - 添加字幕
console.log('【步骤 7】第三轮编辑：添加产品介绍字幕');
const edit3Res = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    action: 'patch',
    projectId,
    baseRevisionId: project.currentRevisionId,
    idempotencyKey: 'test-' + Date.now() + '-edit3',
    message: '在 3 秒位置添加字幕"100% 阿拉比卡豆"，5 秒位置添加"手工研磨"，8 秒位置添加"现磨现煮"'
  })
});

if (!edit3Res.ok) {
  const error = await edit3Res.json();
  console.log(`  ✗ 编辑失败 (${edit3Res.status}):`, error);
} else {
  const edit3 = await edit3Res.json();
  console.log(`  ✓ 编辑任务已提交: ${edit3.jobId}`);

  // 等待编辑完成
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/status`);
    const p = (await statusRes.json()).project;
    const job = p.jobs.find(j => j.id === edit3.jobId);

    if (job.status === 'complete') {
      console.log(`  ✓ 字幕添加完成\n`);
      project = p;
      break;
    } else if (job.status === 'failed') {
      console.log(`  ✗ 编辑失败: ${job.error}\n`);
      break;
    }
  }
}

// 最终结果
console.log('=== 测试完成 ===');
console.log(`项目 ID: ${projectId}`);
console.log(`当前版本: ${project.currentRevisionId}`);
console.log(`总任务数: ${project.jobs.length}`);
console.log(`消息数: ${project.messages.length}`);
console.log(`\n访问视频:`);
console.log(`  预览: ${BACKEND_URL}/api/commerce/${projectId}/revisions/${project.currentRevisionId}/preview.html`);
console.log(`  下载: ${BACKEND_URL}/api/commerce/${projectId}/revisions/${project.currentRevisionId}/commerce-final.mp4`);
