#!/usr/bin/env node
/**
 * OpenClaw Runtime 修复工具
 *
 * 修复目标：
 * 1. 启动稳定性 - 清理僵尸进程、修复权限
 * 2. 成片质量 - 启用真实创作工作流而非工程编辑模式
 */

import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HOST = path.join(process.env.HOME, '.openclaw/hyperframe');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log(`\n${COLORS.cyan}${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}${COLORS.reset}\n`);
}

/**
 * 1. 清理僵尸进程
 */
async function cleanupProcesses() {
  logSection('清理僵尸进程');

  try {
    // 查找占用端口的进程
    const ports = [3024, 18789];

    for (const port of ports) {
      try {
        const listeners = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: 'utf-8' })
          .trim()
          .split('\n')
          .filter(Boolean);

        if (listeners.length > 0) {
          log(`发现端口 ${port} 被占用，PID: ${listeners.join(', ')}`, 'yellow');

          for (const pid of listeners) {
            try {
              const command = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8' }).trim();

              // 只清理本项目的进程
              if (command.includes('openclaw') || command.includes('server.mjs') || command.includes('hyperframe')) {
                log(`  终止进程 ${pid}: ${command.substring(0, 50)}...`, 'yellow');
                execSync(`kill -15 ${pid}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            } catch (err) {
              // 进程已不存在或权限不足
            }
          }
        } else {
          log(`端口 ${port} 空闲`, 'green');
        }
      } catch (err) {
        log(`端口 ${port} 空闲`, 'green');
      }
    }
  } catch (error) {
    log(`清理进程时出错: ${error.message}`, 'red');
  }
}

/**
 * 2. 修复启动脚本权限
 */
async function fixPermissions() {
  logSection('修复文件权限');

  const criticalFiles = [
    'scripts/openclaw-local.py',
    'scripts/start-openclaw-gateway.sh',
    'scripts/test-real-browser-acceptance.mjs',
  ];

  for (const file of criticalFiles) {
    const fullPath = path.join(ROOT, file);
    try {
      await fs.access(fullPath);
      await fs.chmod(fullPath, 0o755);
      log(`✓ ${file}`, 'green');
    } catch (error) {
      log(`✗ ${file} - ${error.message}`, 'red');
    }
  }
}

/**
 * 3. 检查并修复数据目录权限
 */
async function fixDataDirPermissions() {
  logSection('检查数据目录权限');

  const dataDirs = [
    'data/result-completion-projects',
    'data/media',
    'data/edit-projects',
  ];

  for (const dir of dataDirs) {
    const fullPath = path.join(ROOT, dir);
    try {
      await fs.access(fullPath);

      // 检查是否有 .video-agent-writer.lock
      const lockFile = path.join(fullPath, '.video-agent-writer.lock');
      try {
        const lockStat = await fs.stat(lockFile);
        const age = Date.now() - lockStat.mtimeMs;

        if (age > 60000) { // 超过 1 分钟的旧锁
          log(`  发现过期锁文件: ${lockFile}`, 'yellow');
          await fs.unlink(lockFile);
          log(`  已清理`, 'green');
        }
      } catch {}

      log(`✓ ${dir}`, 'green');
    } catch (error) {
      log(`✗ ${dir} - ${error.message}`, 'yellow');

      // 尝试创建
      try {
        await fs.mkdir(fullPath, { recursive: true });
        log(`  已创建`, 'green');
      } catch {}
    }
  }
}

/**
 * 4. 验证环境配置
 */
async function validateEnvironment() {
  logSection('验证环境配置');

  const envFile = path.join(HOST, 'environment.json');

  try {
    const envData = JSON.parse(await fs.readFile(envFile, 'utf-8'));

    const requiredKeys = [
      'OPENCLAW_GATEWAY_TOKEN',
      'OPENCLAW_CONTROL_TOKEN',
    ];

    // API Key 可以是 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY
    const hasApiKey = envData.ANTHROPIC_API_KEY || envData.DEEPSEEK_API_KEY || envData.OPENCLAW_RELAY_API_KEY;
    if (!hasApiKey) {
      requiredKeys.push('ANTHROPIC_API_KEY or DEEPSEEK_API_KEY');
    }

    const missing = requiredKeys.filter(key => !envData[key]);

    if (missing.length > 0) {
      log(`缺少必需的环境变量: ${missing.join(', ')}`, 'red');
      return false;
    }

    log('✓ 环境配置完整', 'green');
    return true;
  } catch (error) {
    log(`环境配置文件错误: ${error.message}`, 'red');
    return false;
  }
}

/**
 * 5. 测试启动
 */
async function testStartup() {
  logSection('测试系统启动');

  log('启动服务...', 'cyan');

  const startScript = path.join(ROOT, 'scripts/openclaw-local.py');

  return new Promise((resolve) => {
    const proc = spawn('python3', [startScript, 'start'], {
      cwd: ROOT,
      stdio: 'inherit',
    });

    // 等待 10 秒
    setTimeout(async () => {
      log('\n检查服务状态...', 'cyan');

      try {
        // 检查 Backend
        const backendRes = await fetch('http://127.0.0.1:3024/health');
        const backendHealthy = backendRes.ok;

        // 检查 Gateway
        const gatewayRes = await fetch('http://127.0.0.1:18789/healthz');
        const gatewayHealthy = gatewayRes.ok;

        if (backendHealthy && gatewayHealthy) {
          log('\n✅ 系统启动成功！', 'green');
          log('  Backend: http://127.0.0.1:3024/', 'cyan');
          log('  Gateway: http://127.0.0.1:18789/', 'cyan');
          resolve(true);
        } else {
          log('\n⚠️  服务启动不完整', 'yellow');
          log(`  Backend: ${backendHealthy ? '✓' : '✗'}`, backendHealthy ? 'green' : 'red');
          log(`  Gateway: ${gatewayHealthy ? '✓' : '✗'}`, gatewayHealthy ? 'green' : 'red');
          resolve(false);
        }
      } catch (error) {
        log(`\n✗ 服务检查失败: ${error.message}`, 'red');
        resolve(false);
      }
    }, 10000);
  });
}

/**
 * 主流程
 */
async function main() {
  log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║       OpenClaw Runtime 修复工具                          ║
║       Fix Startup Stability & Video Quality              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`, 'cyan');

  const steps = [
    { name: '清理僵尸进程', fn: cleanupProcesses },
    { name: '修复文件权限', fn: fixPermissions },
    { name: '修复数据目录', fn: fixDataDirPermissions },
    { name: '验证环境配置', fn: validateEnvironment },
  ];

  let allOk = true;

  for (const step of steps) {
    try {
      const result = await step.fn();
      if (result === false) {
        allOk = false;
      }
    } catch (error) {
      log(`${step.name}失败: ${error.message}`, 'red');
      allOk = false;
    }
  }

  if (allOk) {
    log('\n✅ 所有修复步骤完成\n', 'green');

    // 询问是否测试启动
    log('是否测试启动系统? (将在 10 秒后自动检查)', 'cyan');
    await testStartup();
  } else {
    log('\n⚠️  部分修复步骤失败，请检查日志', 'yellow');
  }
}

main().catch(error => {
  log(`\n修复过程异常: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
