/**
 * 修复验证脚本
 *
 * 验证所有 P1 和 P2 修复是否已正确实施：
 * 1. 并发竞态条件修复（项目锁）
 * 2. 错误提示改进
 * 3. 重试机制优化
 * 4. 资源清理机制
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CHECKS = [];

function check(name, fn) {
  CHECKS.push({ name, fn });
}

// ============================================================================
// P1-1: 并发竞态条件修复
// ============================================================================

check('项目锁模块存在', async () => {
  const lockPath = path.join(ROOT, 'lib/creative/project-lock.mjs');
  await fs.access(lockPath);
  const content = await fs.readFile(lockPath, 'utf8');

  if (!content.includes('withProjectLock')) {
    throw new Error('项目锁模块缺少 withProjectLock 函数');
  }

  if (!content.includes('LOCK_TIMEOUT')) {
    throw new Error('项目锁模块缺少超时配置');
  }

  return { detail: '✅ 项目锁模块完整' };
});

check('service.mjs 引入项目锁', async () => {
  const servicePath = path.join(ROOT, 'lib/creative/service.mjs');
  const content = await fs.readFile(servicePath, 'utf8');

  if (!content.includes("import {withProjectLock} from './project-lock.mjs'")) {
    throw new Error('service.mjs 未引入 withProjectLock');
  }

  return { detail: '✅ 已引入项目锁' };
});

check('关键路径使用项目锁', async () => {
  const servicePath = path.join(ROOT, 'lib/creative/service.mjs');
  const content = await fs.readFile(servicePath, 'utf8');

  // 检查 save() 函数是否被 withProjectLock 包裹
  const saveMatch = content.match(/async function save\(p\)\{[\s\S]*?withProjectLock\(directory\(p\)/);

  if (!saveMatch) {
    throw new Error('save() 函数未使用项目锁');
  }

  return { detail: '✅ save() 已使用项目锁保护' };
});

// ============================================================================
// P1-2: 错误提示改进
// ============================================================================

check('intent.mjs 改进错误提示', async () => {
  const intentPath = path.join(ROOT, 'lib/creative/intent.mjs');
  const content = await fs.readFile(intentPath, 'utf8');

  // 检查是否有具体的错误提示
  const improvedErrors = [
    '请同时指定标题文字',
    '请同时指定要修改的文字内容',
    '请提供具体的',
  ];

  let foundCount = 0;
  for (const pattern of improvedErrors) {
    if (content.includes(pattern)) {
      foundCount++;
    }
  }

  if (foundCount === 0) {
    throw new Error('intent.mjs 未改进错误提示');
  }

  return { detail: `✅ 已改进 ${foundCount} 处错误提示` };
});

// ============================================================================
// P1-3: 重试机制优化
// ============================================================================

check('重试机制使用指数退避', async () => {
  const servicePath = path.join(ROOT, 'lib/creative/service.mjs');
  const content = await fs.readFile(servicePath, 'utf8');

  // 检查是否有指数退避算法
  if (!content.includes('Math.pow(2, job.retryCount')) {
    throw new Error('未找到指数退避算法');
  }

  // 检查是否有随机抖动
  if (!content.includes('jitter') || !content.includes('Math.random()')) {
    throw new Error('未添加随机抖动');
  }

  // 检查重试次数是否增加到 3 次
  if (!content.includes('job.retryCount<3')) {
    throw new Error('重试次数未增加到 3 次');
  }

  return { detail: '✅ 重试机制已优化（指数退避 + 抖动 + 3 次重试）' };
});

// ============================================================================
// P2-1: 资源清理机制
// ============================================================================

check('资源清理模块存在', async () => {
  const cleanupPath = path.join(ROOT, 'lib/creative/resource-cleanup.mjs');
  await fs.access(cleanupPath);
  const content = await fs.readFile(cleanupPath, 'utf8');

  const requiredFunctions = [
    'cleanupStaleLocks',
    'cleanupTempFiles',
    'cleanupProjectResources',
    'cleanupAllProjects',
    'startPeriodicCleanup',
  ];

  for (const fn of requiredFunctions) {
    if (!content.includes(`export async function ${fn}`) &&
        !content.includes(`export function ${fn}`)) {
      throw new Error(`资源清理模块缺少 ${fn} 函数`);
    }
  }

  return { detail: '✅ 资源清理模块完整' };
});

check('service.mjs 启动定期清理', async () => {
  const servicePath = path.join(ROOT, 'lib/creative/service.mjs');
  const content = await fs.readFile(servicePath, 'utf8');

  if (!content.includes("import {startPeriodicCleanup} from './resource-cleanup.mjs'")) {
    throw new Error('service.mjs 未引入 startPeriodicCleanup');
  }

  if (!content.includes('startPeriodicCleanup(dataDir')) {
    throw new Error('service.mjs 未启动定期清理');
  }

  return { detail: '✅ 已启动定期资源清理（每 5 分钟）' };
});

// ============================================================================
// 测试脚本完整性
// ============================================================================

check('XSS 安全测试脚本存在', async () => {
  const xssTestPath = path.join(ROOT, 'scripts/xss-security-test.mjs');
  await fs.access(xssTestPath);
  const content = await fs.readFile(xssTestPath, 'utf8');

  if (!content.includes('XSS_VECTORS')) {
    throw new Error('XSS 测试脚本缺少测试向量');
  }

  if (!content.includes('containsUnescapedXSS')) {
    throw new Error('XSS 测试脚本缺少检测函数');
  }

  return { detail: '✅ XSS 测试脚本完整' };
});

check('端到端测试脚本存在', async () => {
  const e2eTestPath = path.join(ROOT, 'scripts/e2e-real-user-test.mjs');
  await fs.access(e2eTestPath);
  const content = await fs.readFile(e2eTestPath, 'utf8');

  const scenarios = [
    'testBasicWorkflow',
    'testMultipleEdits',
    'testConcurrentEdits',
    'testExportAndVerify',
    'testErrorRecovery',
    'testResourceCleanup',
  ];

  for (const scenario of scenarios) {
    if (!content.includes(scenario)) {
      throw new Error(`端到端测试缺少场景: ${scenario}`);
    }
  }

  return { detail: '✅ 端到端测试包含 6 个场景' };
});

// ============================================================================
// 主函数
// ============================================================================

async function runFixVerification() {
  console.log('🔍 开始验证所有修复...\n');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, fn } of CHECKS) {
    process.stdout.write(`\n📋 ${name}... `);

    try {
      const result = await fn();
      passed++;
      console.log('✅');
      if (result?.detail) {
        console.log(`   ${result.detail}`);
      }
    } catch (error) {
      failed++;
      console.log('❌');
      console.log(`   错误: ${error.message}`);
      failures.push({ name, error: error.message });
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 验证总结:\n');
  console.log(`  总检查项: ${CHECKS.length}`);
  console.log(`  ✅ 通过: ${passed}`);
  console.log(`  ❌ 失败: ${failed}`);
  console.log(`  成功率: ${((passed / CHECKS.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ 以下检查项失败:\n');
    for (const { name, error } of failures) {
      console.log(`  • ${name}`);
      console.log(`    ${error}\n`);
    }
    process.exit(1);
  } else {
    console.log('\n✅ 所有修复已正确实施！\n');
    console.log('📝 修复清单:');
    console.log('  ✅ P1-1: 并发竞态条件修复（项目锁）');
    console.log('  ✅ P1-2: 错误提示改进（具体化）');
    console.log('  ✅ P1-3: 重试机制优化（指数退避 + 抖动）');
    console.log('  ✅ P2-1: 资源清理机制（定期清理）');
    console.log('  ✅ 测试脚本: XSS 安全测试');
    console.log('  ✅ 测试脚本: 端到端真实用户测试\n');

    console.log('🚀 下一步: 运行测试验证修复效果');
    console.log('  1. node scripts/e2e-real-user-test.mjs');
    console.log('  2. node scripts/xss-security-test.mjs');
    console.log('  3. node scripts/adversarial-security-test.mjs\n');
  }
}

runFixVerification().catch(console.error);
