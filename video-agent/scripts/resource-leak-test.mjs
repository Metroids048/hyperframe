#!/usr/bin/env node
/**
 * 资源监控和泄漏检测
 *
 * 监控内存、文件句柄、临时文件等资源使用情况
 */

import { createCommerceVideo, editCommerceVideo, getProjectStatus } from '../lib/creative/service.mjs';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
}

async function getProjectDiskUsage(projectId) {
  const projectDir = path.join(process.cwd(), 'data', 'projects', projectId);

  try {
    const files = await fs.readdir(projectDir, { recursive: true, withFileTypes: true });
    let totalSize = 0;
    let fileCount = 0;

    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(file.path || projectDir, file.name);
        try {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
          fileCount++;
        } catch (error) {
          // 文件可能被删除，跳过
        }
      }
    }

    return { totalSize, fileCount };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { totalSize: 0, fileCount: 0 };
    }
    throw error;
  }
}

async function getTempFiles() {
  const tempDir = path.join(process.cwd(), 'data', 'temp');
  const projectsDir = path.join(process.cwd(), 'data', 'projects');

  const tempFiles = [];

  try {
    // 检查 temp 目录
    const files = await fs.readdir(tempDir, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (file.isFile()) {
        tempFiles.push(path.join(file.path || tempDir, file.name));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  try {
    // 检查项目目录中的临时文件
    const projects = await fs.readdir(projectsDir);
    for (const project of projects) {
      const projectDir = path.join(projectsDir, project);
      const files = await fs.readdir(projectDir);

      for (const file of files) {
        if (file.includes('.tmp') || file.includes('.lock') || file.includes('~')) {
          tempFiles.push(path.join(projectDir, file));
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return tempFiles;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runResourceMonitoringTests() {
  log('📊', colors.magenta, '='.repeat(60));
  log('📊', colors.magenta, '资源监控和泄漏检测');
  log('📊', colors.magenta, '='.repeat(60));
  console.log();

  const baseline = {
    memory: getMemoryUsage(),
    tempFiles: await getTempFiles()
  };

  log('📌', colors.cyan, '基线指标:');
  log('  💾', colors.cyan, `内存使用: ${formatBytes(baseline.memory.heapUsed)} / ${formatBytes(baseline.memory.heapTotal)}`);
  log('  📁', colors.cyan, `临时文件: ${baseline.tempFiles.length} 个`);
  console.log();

  // 测试1：内存泄漏检测（多次创建和编辑）
  log('🧪', colors.blue, '测试1: 内存泄漏检测');
  log('📝', colors.cyan, '执行 10 次创建+编辑循环...');
  console.log();

  const iterations = 10;
  const memorySnapshots = [];
  const projectIds = [];

  for (let i = 0; i < iterations; i++) {
    log('  🔄', colors.cyan, `迭代 ${i + 1}/${iterations}...`);

    // 创建项目
    const project = await createCommerceVideo({
      productName: `测试产品${i + 1}`,
      price: 99 + i,
      style: '现代简约'
    });
    projectIds.push(project.id);

    // 编辑几次
    await editCommerceVideo(project.id, '标题改成"测试"');
    await editCommerceVideo(project.id, '价格改成¥199');
    await editCommerceVideo(project.id, '第2幕改成3秒');

    // 记录内存使用
    const memory = getMemoryUsage();
    memorySnapshots.push({
      iteration: i + 1,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss
    });

    log('    💾', colors.cyan, `内存: ${formatBytes(memory.heapUsed)}`);

    await sleep(500);
  }

  console.log();

  // 分析内存增长趋势
  const firstSnapshot = memorySnapshots[0];
  const lastSnapshot = memorySnapshots[iterations - 1];
  const memoryGrowth = lastSnapshot.heapUsed - firstSnapshot.heapUsed;
  const growthRate = (memoryGrowth / firstSnapshot.heapUsed * 100).toFixed(2);

  log('📊', colors.cyan, '内存增长分析:');
  log('  📈', colors.cyan, `初始: ${formatBytes(firstSnapshot.heapUsed)}`);
  log('  📈', colors.cyan, `最终: ${formatBytes(lastSnapshot.heapUsed)}`);
  log('  📈', colors.cyan, `增长: ${formatBytes(memoryGrowth)} (${growthRate}%)`);
  console.log();

  let memoryLeakDetected = false;
  if (growthRate > 200) {
    log('  ⚠️', colors.red, '警告：内存增长过快，可能存在内存泄漏');
    memoryLeakDetected = true;
  } else if (growthRate > 100) {
    log('  ⚠️', colors.yellow, '提示：内存增长较快，建议检查');
  } else {
    log('  ✅', colors.green, '内存增长正常');
  }

  console.log();

  // 测试2：磁盘空间使用
  log('🧪', colors.blue, '测试2: 磁盘空间使用');
  console.log();

  let totalDiskUsage = 0;
  let totalFileCount = 0;

  for (const projectId of projectIds) {
    const usage = await getProjectDiskUsage(projectId);
    totalDiskUsage += usage.totalSize;
    totalFileCount += usage.fileCount;
    log('  📁', colors.cyan, `项目 ${projectId}: ${formatBytes(usage.totalSize)} (${usage.fileCount} 个文件)`);
  }

  console.log();
  log('📊', colors.cyan, '磁盘使用汇总:');
  log('  💾', colors.cyan, `总大小: ${formatBytes(totalDiskUsage)}`);
  log('  📄', colors.cyan, `总文件: ${totalFileCount} 个`);
  log('  📊', colors.cyan, `平均每项目: ${formatBytes(totalDiskUsage / projectIds.length)}`);
  console.log();

  const avgProjectSize = totalDiskUsage / projectIds.length;
  if (avgProjectSize > 100 * 1024 * 1024) { // 100MB
    log('  ⚠️', colors.yellow, '警告：平均项目大小过大，可能需要清理');
  } else {
    log('  ✅', colors.green, '磁盘使用正常');
  }

  console.log();

  // 测试3：临时文件泄漏检测
  log('🧪', colors.blue, '测试3: 临时文件泄漏检测');
  console.log();

  const currentTempFiles = await getTempFiles();
  const newTempFiles = currentTempFiles.filter(f => !baseline.tempFiles.includes(f));

  log('📊', colors.cyan, '临时文件统计:');
  log('  📁', colors.cyan, `基线: ${baseline.tempFiles.length} 个`);
  log('  📁', colors.cyan, `当前: ${currentTempFiles.length} 个`);
  log('  📁', colors.cyan, `新增: ${newTempFiles.length} 个`);
  console.log();

  if (newTempFiles.length > 0) {
    log('  ⚠️', colors.yellow, '新增临时文件:');
    newTempFiles.slice(0, 10).forEach(file => {
      log('    📄', colors.cyan, path.basename(file));
    });
    if (newTempFiles.length > 10) {
      log('    ...', colors.cyan, `以及 ${newTempFiles.length - 10} 个其他文件`);
    }
    console.log();

    if (newTempFiles.length > 50) {
      log('  ⚠️', colors.red, '警告：临时文件过多，可能存在清理问题');
    } else {
      log('  ⚠️', colors.yellow, '提示：有临时文件残留，建议检查清理逻辑');
    }
  } else {
    log('  ✅', colors.green, '无临时文件泄漏');
  }

  console.log();

  // 测试4：文件句柄泄漏检测（仅 Unix 系统）
  log('🧪', colors.blue, '测试4: 文件句柄检测');
  console.log();

  try {
    if (process.platform !== 'win32') {
      const lsofOutput = execSync(`lsof -p ${process.pid} | wc -l`).toString().trim();
      const openFiles = parseInt(lsofOutput);

      log('  📊', colors.cyan, `打开的文件句柄: ${openFiles}`);

      if (openFiles > 1000) {
        log('  ⚠️', colors.red, '警告：文件句柄过多，可能存在泄漏');
      } else if (openFiles > 500) {
        log('  ⚠️', colors.yellow, '提示：文件句柄较多，建议监控');
      } else {
        log('  ✅', colors.green, '文件句柄使用正常');
      }
    } else {
      log('  ⏭️', colors.cyan, 'Windows 系统，跳过文件句柄检测');
    }
  } catch (error) {
    log('  ⚠️', colors.yellow, `无法检测文件句柄: ${error.message}`);
  }

  console.log();

  // 测试5：垃圾回收效果
  log('🧪', colors.blue, '测试5: 垃圾回收效果');
  console.log();

  const beforeGC = getMemoryUsage();
  log('  📊', colors.cyan, `GC前: ${formatBytes(beforeGC.heapUsed)}`);

  if (global.gc) {
    global.gc();
    await sleep(1000);

    const afterGC = getMemoryUsage();
    const freed = beforeGC.heapUsed - afterGC.heapUsed;
    const freedRate = (freed / beforeGC.heapUsed * 100).toFixed(2);

    log('  📊', colors.cyan, `GC后: ${formatBytes(afterGC.heapUsed)}`);
    log('  📊', colors.cyan, `释放: ${formatBytes(freed)} (${freedRate}%)`);
    console.log();

    if (freedRate > 30) {
      log('  ✅', colors.green, 'GC 效果良好，释放了大量内存');
    } else if (freedRate > 10) {
      log('  ✅', colors.green, 'GC 效果正常');
    } else {
      log('  ⚠️', colors.yellow, 'GC 释放内存较少，可能存在未释放的引用');
    }
  } else {
    log('  ⚠️', colors.yellow, '未启用 --expose-gc，跳过 GC 测试');
    log('  💡', colors.cyan, '运行 node --expose-gc 以启用此测试');
  }

  console.log();

  // 汇总报告
  log('📊', colors.magenta, '='.repeat(60));
  log('📊', colors.magenta, '资源监控结果');
  log('📊', colors.magenta, '='.repeat(60));
  console.log();

  const issues = [];

  if (memoryLeakDetected) {
    issues.push('❌ 检测到可能的内存泄漏');
  }
  if (avgProjectSize > 100 * 1024 * 1024) {
    issues.push('⚠️ 项目平均大小过大');
  }
  if (newTempFiles.length > 50) {
    issues.push('❌ 临时文件过多');
  } else if (newTempFiles.length > 0) {
    issues.push('⚠️ 有临时文件残留');
  }

  if (issues.length === 0) {
    log('🎉', colors.green, '资源使用健康，未发现泄漏');
  } else {
    log('⚠️', colors.yellow, '发现以下问题:');
    issues.forEach(issue => {
      log('  ', colors.yellow, issue);
    });
  }

  console.log();
  log('💡', colors.cyan, '建议:');
  log('  ', colors.cyan, '1. 定期运行此测试监控资源使用趋势');
  log('  ', colors.cyan, '2. 在生产环境启用日志记录和监控');
  log('  ', colors.cyan, '3. 实施定期清理策略（临时文件、旧项目等）');
  log('  ', colors.cyan, '4. 考虑添加资源使用限制和告警');

  console.log();
  log('🏁', colors.magenta, '测试完成');

  process.exit(issues.filter(i => i.startsWith('❌')).length > 0 ? 1 : 0);
}

runResourceMonitoringTests().catch(error => {
  log('💥', colors.red, `测试执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
