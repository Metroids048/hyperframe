#!/usr/bin/env node
/**
 * 测试路由修复效果
 * 验证"上传视频 + 创作意图"是否正确识别为 mode: 'create'
 */

import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {routeWorkbenchMessage} from '../lib/creative/message-routing.mjs';

// 加载环境配置
const envPath = join(homedir(), '.openclaw/hyperframe/environment.json');
try {
  const envData = JSON.parse(await readFile(envPath, 'utf8'));
  for (const [key, value] of Object.entries(envData)) {
    if (!process.env[key]) {
      process.env[key] = String(value);
    }
  }
} catch (error) {
  console.error('警告: 无法加载环境配置:', error.message);
}

const testCases = [
  {
    name: '测试用例 1: 上传视频 + 物体替换',
    message: '把视频中的咖啡袋替换成蛋白粉袋，保持位置、大小和运动，其他不变',
    project: {
      currentRevisionId: null,
      assets: [{id: 'video-001', name: 'coffee-shop.mp4', kind: 'video'}],
      revisions: [],
      jobs: [],
    },
    expectedMode: 'create',
    expectedSource: 'upload-video-creation',
    shouldNotContain: '请先打开',
  },
  {
    name: '测试用例 2: 上传视频 + 重新剪辑',
    message: '把这段素材剪成 30 秒的 9:16 竖屏短视频，前 3 秒要有 Hook',
    project: {
      currentRevisionId: null,
      assets: [{id: 'video-002', name: 'product-demo.mp4', kind: 'video'}],
      revisions: [],
      jobs: [],
    },
    expectedMode: 'create',
    // source 可能是 semantic 或 upload-video-creation，只要 mode 正确即可
    shouldNotContain: '请先打开',
  },
  {
    name: '测试用例 3: 上传视频 + 添加元素',
    message: '给这个视频加上字幕和背景音乐，风格要科技感',
    project: {
      currentRevisionId: null,
      assets: [{id: 'video-003', name: 'headphones.mp4', kind: 'video'}],
      revisions: [],
      jobs: [],
    },
    expectedMode: 'create',
    expectedSource: 'upload-video-creation',
    shouldNotContain: '请先打开',
  },
  {
    name: '测试用例 4: 正常工程编辑（回归测试）',
    message: '把第一个镜头改成 3 秒',
    project: {
      currentRevisionId: 'revision-001',
      assets: [{id: 'video-004', name: 'existing-project.mp4', kind: 'video'}],
      revisions: [{id: 'revision-001', description: '初始版本'}],
      jobs: [{quality: {}, status: 'completed'}],
    },
    expectedMode: 'edit',
    expectedSource: 'semantic',
    shouldNotContain: '请先打开',
  },
  {
    name: '测试用例 5: 无视频素材的创作请求',
    message: '创作一个 30 秒的产品宣传视频，突出科技感和创新',
    project: {
      currentRevisionId: null,
      assets: [],
      revisions: [],
      jobs: [],
    },
    // 无素材时，LLM 合理要求澄清产品信息，mode 可能是 clarify
    expectedMode: 'clarify',
    shouldNotContain: '请先打开',
  },
];

async function runTest(testCase) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试: ${testCase.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`消息: ${testCase.message}`);
  console.log(`项目状态: currentRevisionId=${testCase.project.currentRevisionId}, assets=${testCase.project.assets.length}`);

  try {
    const result = await routeWorkbenchMessage(testCase.project, testCase.message, {
      taskMode: null,
      taskModeExplicit: false,
      scenarioId: null,
      conversation: [],
    });

    console.log(`\n路由结果:`);
    console.log(`  mode: ${result.mode}`);
    console.log(`  source: ${result.source}`);
    console.log(`  quote: ${result.quote}`);
    console.log(`  question: ${result.question || '(无)'}`);
    console.log(`  assetIds: [${result.assetIds?.join(', ') || ''}]`);

    // 验证
    const checks = [];

    if (testCase.expectedMode) {
      const modeMatch = result.mode === testCase.expectedMode;
      checks.push({
        name: `mode 应为 ${testCase.expectedMode}`,
        pass: modeMatch,
        actual: result.mode,
      });
    }

    if (testCase.expectedSource) {
      const sourceMatch = result.source === testCase.expectedSource;
      checks.push({
        name: `source 应为 ${testCase.expectedSource}`,
        pass: sourceMatch,
        actual: result.source,
      });
    }

    if (testCase.shouldNotContain) {
      const question = result.question || '';
      const notContain = !question.includes(testCase.shouldNotContain);
      checks.push({
        name: `question 不应包含 "${testCase.shouldNotContain}"`,
        pass: notContain,
        actual: question || '(空)',
      });
    }

    const allPass = checks.every(c => c.pass);

    console.log(`\n验证结果:`);
    checks.forEach(check => {
      const icon = check.pass ? '✅' : '❌';
      console.log(`  ${icon} ${check.name}`);
      if (!check.pass) {
        console.log(`     实际值: ${check.actual}`);
      }
    });

    return {testCase: testCase.name, pass: allPass, checks, result};

  } catch (error) {
    console.log(`\n❌ 测试失败: ${error.message}`);
    console.log(error.stack);
    return {testCase: testCase.name, pass: false, error: error.message};
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║       OpenClaw 路由修复验证测试                          ║
║       Test Routing Fix for Upload Video Creation        ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

  const results = [];

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`测试总结`);
  console.log(`${'='.repeat(60)}`);

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log(`\n通过: ${passed}/${total} (${percentage}%)\n`);

  results.forEach((result, index) => {
    const icon = result.pass ? '✅' : '❌';
    console.log(`${icon} 测试用例 ${index + 1}: ${result.testCase}`);
  });

  console.log(`\n${'='.repeat(60)}`);

  if (passed === total) {
    console.log(`\n🎉 所有测试通过！路由修复成功。\n`);
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${total - passed} 个测试失败，请检查修复逻辑。\n`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
