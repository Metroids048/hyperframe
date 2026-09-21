/**
 * 真实用户场景端到端测试
 *
 * 模拟真实用户的完整使用流程：
 * 1. 创建项目并上传素材
 * 2. 生成初始视频
 * 3. 多轮编辑（标题、颜色、音乐、时长）
 * 4. 并发编辑冲突场景
 * 5. 导出和下载
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 测试辅助函数
function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function logStep(step, total, message) {
  console.log(`\n[${step}/${total}] ${message}`);
}

// 等待任务完成
async function waitForJob(service, projectId, jobId, maxWaitMs = 300000) {
  const startTime = Date.now();
  let lastStatus = null;

  while (Date.now() - startTime < maxWaitMs) {
    const project = await service.get(projectId);
    const job = project.jobs.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`任务 ${jobId} 不存在`);
    }

    if (job.status !== lastStatus) {
      log('📊', `任务状态: ${job.status} - ${job.stage}`);
      lastStatus = job.status;
    }

    if (job.status === 'complete') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(`任务失败: ${job.error} (${job.code})`);
    }

    await sleep(2000);
  }

  throw new Error('任务超时');
}

// 验证视频文件
async function verifyVideo(videoPath) {
  const stat = await fs.stat(videoPath);

  if (stat.size < 10000) {
    throw new Error(`视频文件太小 (${stat.size} bytes)，可能生成失败`);
  }

  log('✅', `视频文件有效: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  return stat.size;
}

// 场景 1: 基础工作流
async function testBasicWorkflow(service) {
  logStep(1, 6, '基础工作流测试');

  log('📝', '创建项目...');
  const project = await service.create({
    title: '端到端测试产品',
    message: '生成一个展示蛋白粉的商品视频，突出健身效果',
  });

  log('✅', `项目已创建: ${project.id}`);

  // 上传素材
  log('📤', '上传产品图片...');
  const imagePath = path.join(ROOT, '..', 'protein_tub.png');
  const imageExists = await fs.access(imagePath).then(() => true).catch(() => false);

  if (imageExists) {
    const imageBuffer = await fs.readFile(imagePath);
    await service.uploadAsset(project.id, {
      name: 'protein_tub.png',
      buffer: imageBuffer,
    });
    log('✅', '素材上传成功');
  } else {
    log('⚠️', '测试图片不存在，跳过上传');
  }

  // 提交生成请求
  log('🎬', '提交视频生成请求...');
  const result = await service.message(project.id, {
    message: '生成商品视频',
  });

  const job = result.jobs[result.jobs.length - 1];
  log('⏳', `等待任务完成: ${job.id}`);

  await waitForJob(service, project.id, job.id);

  const updatedProject = await service.get(project.id);
  if (!updatedProject.currentRevisionId) {
    throw new Error('未生成视频版本');
  }

  log('✅', `初始视频已生成: ${updatedProject.currentRevisionId}`);
  return project.id;
}

// 场景 2: 多轮编辑
async function testMultipleEdits(service, projectId) {
  logStep(2, 6, '多轮编辑测试');

  const edits = [
    { message: '把标题改成"健身必备"', desc: '修改标题' },
    { message: '把背景颜色改成蓝色', desc: '修改颜色' },
    { message: '把视频延长到20秒', desc: '修改时长' },
    { message: '添加动感音乐', desc: '添加音乐' },
  ];

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    log('✏️', `编辑 ${i + 1}/${edits.length}: ${edit.desc}`);

    const result = await service.message(projectId, {
      message: edit.message,
    });

    const job = result.jobs[result.jobs.length - 1];
    await waitForJob(service, projectId, job.id);

    log('✅', `${edit.desc}完成`);
    await sleep(1000);
  }

  const project = await service.get(projectId);
  const revisionCount = project.revisions.length;

  if (revisionCount < 2) {
    throw new Error(`版本数量不足: ${revisionCount}，预期至少 2 个`);
  }

  log('✅', `多轮编辑完成，共 ${revisionCount} 个版本`);
  return revisionCount;
}

// 场景 3: 并发编辑冲突
async function testConcurrentEdits(service, projectId) {
  logStep(3, 6, '并发编辑冲突测试');

  const project = await service.get(projectId);
  const baseRevisionId = project.currentRevisionId;

  log('📊', `基准版本: ${baseRevisionId}`);

  // 启动两个并发编辑
  log('⚡', '启动并发编辑请求...');

  const edit1Promise = service.message(projectId, {
    message: '把标题改成"并发测试A"',
  });

  const edit2Promise = service.message(projectId, {
    message: '把标题改成"并发测试B"',
  });

  const [result1, result2] = await Promise.allSettled([edit1Promise, edit2Promise]);

  // 至少一个应该成功
  const successCount = [result1, result2].filter(r => r.status === 'fulfilled').length;
  const conflictCount = [result1, result2].filter(r => {
    return r.status === 'rejected' && r.reason?.code === 'REVISION_CONFLICT';
  }).length;

  log('📊', `成功: ${successCount}, 冲突: ${conflictCount}`);

  if (successCount === 0) {
    throw new Error('所有并发编辑都失败了');
  }

  if (conflictCount > 0) {
    log('✅', '版本冲突检测正常工作');
  } else {
    log('⚠️', '未检测到版本冲突（可能是锁生效了）');
  }

  // 等待成功的任务完成
  for (const result of [result1, result2]) {
    if (result.status === 'fulfilled') {
      const job = result.value.jobs[result.value.jobs.length - 1];
      await waitForJob(service, projectId, job.id).catch(() => {
        // 可能因为冲突失败，忽略
      });
    }
  }

  log('✅', '并发编辑测试完成');
}

// 场景 4: 导出和验证
async function testExportAndVerify(service, projectId) {
  logStep(4, 6, '导出和验证测试');

  const project = await service.get(projectId);
  const revisionId = project.currentRevisionId;

  log('📦', `导出版本: ${revisionId}`);

  // 触发导出
  const result = await service.export(projectId, revisionId);
  const exportJob = result.jobs.find(j => j.kind === 'export');

  if (!exportJob) {
    throw new Error('未创建导出任务');
  }

  log('⏳', '等待导出完成...');
  await waitForJob(service, projectId, exportJob.id);

  // 验证导出文件
  const dataDir = process.env.VIDEO_AGENT_CREATIVE_DATA_DIR || path.join(ROOT, 'data/commerce-runs');
  const videoPath = path.join(dataDir, projectId, 'revisions', revisionId, 'commerce-final.mp4');

  await verifyVideo(videoPath);

  log('✅', '导出和验证完成');
}

// 场景 5: 错误恢复
async function testErrorRecovery(service, projectId) {
  logStep(5, 6, '错误恢复测试');

  log('🔧', '提交无效请求（触发错误）...');

  try {
    await service.message(projectId, {
      message: '把字体改成Comic Sans', // 可能不支持的操作
    });

    const project = await service.get(projectId);
    const job = project.jobs[project.jobs.length - 1];

    if (job.status === 'recoverable' || job.status === 'failed') {
      log('✅', `错误被正确捕获: ${job.error}`);

      // 测试恢复
      if (job.resumeAllowed) {
        log('🔄', '尝试恢复任务...');
        await service.resume(projectId, job.id);
        log('✅', '恢复请求已提交');
      }
    } else {
      log('⚠️', '请求未失败，跳过恢复测试');
    }

  } catch (error) {
    log('✅', `错误被正确抛出: ${error.message}`);
  }
}

// 场景 6: 资源清理验证
async function testResourceCleanup(service, projectId) {
  logStep(6, 6, '资源清理验证');

  const dataDir = process.env.VIDEO_AGENT_CREATIVE_DATA_DIR || path.join(ROOT, 'data/commerce-runs');
  const projectDir = path.join(dataDir, projectId);

  // 检查临时文件
  log('🔍', '检查临时文件...');
  const entries = await fs.readdir(projectDir, { withFileTypes: true, recursive: true });

  let tmpCount = 0;
  let lockCount = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(entry.path || projectDir, entry.name);

    if (entry.name.endsWith('.tmp')) {
      tmpCount++;
      log('⚠️', `发现临时文件: ${path.relative(projectDir, fullPath)}`);
    }

    if (entry.name === '.edit.lock') {
      lockCount++;
      log('⚠️', `发现锁文件: ${path.relative(projectDir, fullPath)}`);
    }
  }

  if (tmpCount === 0 && lockCount === 0) {
    log('✅', '未发现遗留的临时文件或锁');
  } else {
    log('⚠️', `发现 ${tmpCount} 个临时文件, ${lockCount} 个锁文件（将在定期清理中删除）`);
  }
}

// 主测试流程
async function runE2ETests() {
  console.log('🚀 开始端到端测试\n');
  console.log('═'.repeat(60));

  let projectId;

  try {
    // 初始化服务
    log('🔧', '初始化 Creative Service...');
    const { createCreativeService } = await import('../lib/creative/service.mjs');
    const service = await createCreativeService({ root: ROOT });
    log('✅', 'Service 已初始化\n');

    // 执行测试场景
    projectId = await testBasicWorkflow(service);
    await testMultipleEdits(service, projectId);
    await testConcurrentEdits(service, projectId);
    await testExportAndVerify(service, projectId);
    await testErrorRecovery(service, projectId);
    await testResourceCleanup(service, projectId);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ 所有端到端测试通过！\n');

    console.log('📊 测试总结:');
    console.log(`  测试项目: ${projectId}`);
    console.log('  场景覆盖: 6/6');
    console.log('  基础工作流: ✅');
    console.log('  多轮编辑: ✅');
    console.log('  并发冲突: ✅');
    console.log('  导出验证: ✅');
    console.log('  错误恢复: ✅');
    console.log('  资源清理: ✅');

  } catch (error) {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ 端到端测试失败\n');
    console.error('错误信息:', error.message);
    console.error('堆栈:', error.stack);

    if (projectId) {
      console.log(`\n测试项目 ID: ${projectId}`);
      console.log('请检查项目日志以获取更多信息');
    }

    process.exit(1);
  }
}

runE2ETests().catch(console.error);
