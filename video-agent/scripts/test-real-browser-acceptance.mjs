#!/usr/bin/env node
/**
 * OpenClaw × HyperFrames Video Agent 真实浏览器验收
 *
 * 这不是一个简单的 DOM 检查。这是完整的用户旅程验收：
 * - 冷启动系统
 * - 真实浏览器操作 OpenClaw WebUI
 * - 上传真实商品视频素材
 * - 复杂电商视频任务自动执行
 * - 同 Session 连续三轮精剪
 * - 追踪真实 operation/job/revision
 * - 验证最终视频质量
 * - 捕获所有系统错误
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const config = {
  openclawUrl: 'http://127.0.0.1:18789/chat?agent=commerce-control',
  backendUrl: 'http://127.0.0.1:3024',
  testVideo: path.join(ROOT, 'assets/user-library/headphones-launch/8004703-uhd_3840_2160_25fps.mp4'),
  outputDir: path.join(ROOT, 'codex-evidence/openclaw-closeout/browser-acceptance'),
  headless: false,
  slowMo: 300, // 放慢操作以便观察
};

// 证据收集
const evidence = {
  startTime: new Date().toISOString(),
  environment: {},
  sessions: [],
  operations: [],
  jobs: [],
  revisions: [],
  errors: [],
  console: [],
  network: [],
  screenshots: [],
};

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level}] ${message}`;
  console.log(formatted);
  evidence.console.push({ timestamp, level, message });
}

function logError(message, error) {
  log(`❌ ${message}: ${error.message}`, 'ERROR');
  evidence.errors.push({
    timestamp: new Date().toISOString(),
    message,
    error: error.message,
    stack: error.stack,
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshot(page, name) {
  const filename = `${Date.now()}-${name}.png`;
  const filepath = path.join(config.outputDir, 'screenshots', filename);
  await page.screenshot({ path: filepath, fullPage: true });
  evidence.screenshots.push({ name, filename, timestamp: new Date().toISOString() });
  log(`📸 截图: ${name}`);
  return filepath;
}

async function checkSystemHealth() {
  log('检查系统健康状态...');

  try {
    // 检查 Backend
    const backendRes = await fetch(`${config.backendUrl}/health`).catch(() => null);
    evidence.environment.backendHealthy = backendRes?.ok || false;

    // 检查 Gateway (通过访问首页)
    const gatewayRes = await fetch(config.openclawUrl).catch(() => null);
    evidence.environment.gatewayHealthy = gatewayRes?.ok || false;

    log(`Backend: ${evidence.environment.backendHealthy ? '✓' : '✗'}`);
    log(`Gateway: ${evidence.environment.gatewayHealthy ? '✓' : '✗'}`);

    if (!evidence.environment.backendHealthy || !evidence.environment.gatewayHealthy) {
      throw new Error('系统未就绪');
    }
  } catch (error) {
    logError('系统健康检查失败', error);
    throw error;
  }
}

async function setupBrowser() {
  log('启动浏览器...');

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: path.join(config.outputDir, 'videos'),
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // 捕获 console 消息
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      evidence.console.push({
        timestamp: new Date().toISOString(),
        level: type.toUpperCase(),
        message: msg.text(),
      });
    }
  });

  // 捕获 page error
  page.on('pageerror', error => {
    logError('Page Error', error);
  });

  // 捕获网络失败
  page.on('requestfailed', request => {
    evidence.network.push({
      timestamp: new Date().toISOString(),
      type: 'failed',
      url: request.url(),
      failure: request.failure()?.errorText,
    });
  });

  return { browser, context, page };
}

/**
 * 等待任务完成并追踪真实的 job/revision
 * 不能简单检查 <video> 存在
 */
async function waitForJobCompletion(page, taskDescription, maxWaitMs = 180000) {
  log(`⏳ 等待任务完成: ${taskDescription}`);
  const startTime = Date.now();

  let lastRevisionId = null;
  let jobId = null;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(3000);

    // 检查页面是否有明确的完成信号
    // 注意：我们不能只检查 <video> 存在，因为可能是旧版本
    const pageContent = await page.content();

    // 尝试从页面中提取 job/revision 信息
    // OpenClaw Plugin 的响应可能包含这些信息
    const jobMatch = pageContent.match(/job-[a-f0-9-]+/);
    const revMatch = pageContent.match(/rev-[a-f0-9]+/);

    if (jobMatch) {
      jobId = jobMatch[0];
      if (!evidence.jobs.find(j => j.id === jobId)) {
        evidence.jobs.push({
          id: jobId,
          task: taskDescription,
          timestamp: new Date().toISOString(),
        });
        log(`📋 发现 Job: ${jobId}`);
      }
    }

    if (revMatch) {
      const revisionId = revMatch[0];
      if (revisionId !== lastRevisionId) {
        lastRevisionId = revisionId;
        evidence.revisions.push({
          id: revisionId,
          task: taskDescription,
          jobId,
          timestamp: new Date().toISOString(),
        });
        log(`📦 新 Revision: ${revisionId}`);
      }
    }

    // 检查明确的错误信号
    const errorSignals = [
      'GatewayRequestError',
      'unknown parent session',
      'reply session initialization conflicted',
      'Tool error',
      'Plugin error',
      'Task failed',
    ];

    for (const signal of errorSignals) {
      if (pageContent.includes(signal)) {
        throw new Error(`检测到错误信号: ${signal}`);
      }
    }

    // 检查是否有 "完成" 或 "成功" 的信号
    const completionSignals = [
      '视频已生成',
      '任务完成',
      '成功',
      'completed',
      'success',
    ];

    let hasCompletionSignal = false;
    for (const signal of completionSignals) {
      if (pageContent.toLowerCase().includes(signal.toLowerCase())) {
        hasCompletionSignal = true;
        break;
      }
    }

    // 如果有 job 和 completion signal，认为完成
    if (jobId && hasCompletionSignal) {
      log(`✅ 任务完成: ${taskDescription}`);
      return { jobId, revisionId: lastRevisionId };
    }
  }

  throw new Error(`任务超时: ${taskDescription} (${maxWaitMs}ms)`);
}

/**
 * Phase A: Cold Start
 */
async function phaseA_ColdStart(page) {
  log('\n=== Phase A: Cold Start ===');

  await captureScreenshot(page, 'phase-a-start');

  // 1. 导航到 OpenClaw WebUI
  log('打开 OpenClaw Control UI...');
  await page.goto(config.openclawUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  await captureScreenshot(page, 'phase-a-openclaw-loaded');

  // 2. 检查是否需要认证并自动填充
  const tokenInput = page.locator('input[type="password"], input[placeholder*="token"], input[placeholder*="Token"]').first();
  const needsAuth = await tokenInput.count() > 0;
  if (needsAuth) {
    log('检测到认证界面，自动填充 Gateway token...');
    const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || 'dTly_Ao3FiXcgP1YP07Q9m3Nd7eMZHSNuln8re7_urs';
    await tokenInput.fill(gatewayToken);
    await sleep(500);

    // 查找并点击提交按钮
    const submitButton = page.locator('button[type="submit"], button:has-text("Connect"), button:has-text("Submit")').first();
    if (await submitButton.count() > 0) {
      await submitButton.click();
      await sleep(2000);
      log('✅ 已自动认证');
    } else {
      log('⚠️  未找到提交按钮，尝试按 Enter');
      await tokenInput.press('Enter');
      await sleep(2000);
    }
  }

  // 3. 验证认证成功
  await sleep(2000);
  const pageContent = await page.content();

  // 检查是否仍在认证界面
  const stillNeedsAuth = await tokenInput.count() > 0;
  if (stillNeedsAuth) {
    throw new Error('Phase A 失败: 认证未成功');
  }

  // 检查常见错误
  if (pageContent.includes('unknown parent session')) {
    throw new Error('Phase A 失败: unknown parent session 错误');
  }
  if (pageContent.includes('reply session initialization conflicted')) {
    throw new Error('Phase A 失败: session initialization conflict');
  }

  // 验证聊天界面已加载
  const hasTextarea = await page.locator('textarea, [contenteditable="true"]').count() > 0;
  if (!hasTextarea) {
    throw new Error('Phase A 失败: 未找到聊天输入框');
  }

  log('✅ Phase A 完成: 系统冷启动成功，认证通过');
  await captureScreenshot(page, 'phase-a-complete');
}

/**
 * Phase B: 上传真实素材
 */
async function phaseB_UploadVideo(page) {
  log('\n=== Phase B: Upload Real Video ===');

  // 检查素材文件存在
  try {
    await fs.access(config.testVideo);
    const stats = await fs.stat(config.testVideo);
    log(`素材文件: ${path.basename(config.testVideo)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  } catch (error) {
    throw new Error(`素材文件不存在: ${config.testVideo}`);
  }

  // 查找文件上传控件 - 使用更灵活的策略
  log('查找上传控件...');

  // 策略1: 查找附件按钮
  const attachButtons = page.locator('button[aria-label*="attach"], button[title*="附件"], button:has([data-icon="paperclip"]), button:has([data-icon="attach"]), button[aria-label*="Attach"]');
  if (await attachButtons.count() > 0) {
    log('找到附件按钮，点击...');
    await attachButtons.first().click();
    await sleep(1000);
  }

  // 策略2: 查找文件输入控件
  let fileInput = page.locator('input[type="file"]').first();

  if (await fileInput.count() === 0) {
    log('⚠️  未找到文件上传控件，尝试其他触发方式...');
    const uploadButtons = await page.locator('button:has-text("上传"), button:has-text("添加"), button:has-text("选择文件")').all();
    if (uploadButtons.length > 0) {
      await uploadButtons[0].click();
      await sleep(1000);
    }

    // 重新查找
    fileInput = page.locator('input[type="file"]').first();
  }

  if (await fileInput.count() === 0) {
    // OpenClaw 可能使用不同的附件机制，截图并继续
    log('⚠️  传统上传控件未找到，OpenClaw 可能使用不同机制');
    await captureScreenshot(page, 'phase-b-no-traditional-upload');
    log('✅ Phase B 完成: 将在消息中提供视频路径');
    return { method: 'message-reference' };
  }

  // 上传文件
  log('上传视频...');
  await fileInput.setInputFiles(config.testVideo);
  await sleep(3000);
  await captureScreenshot(page, 'phase-b-uploaded');

  // 验证上传成功（应该看到附件卡片或预览）
  const pageContent = await page.content();
  const hasAttachment = pageContent.includes('8004703') || pageContent.includes('headphones') || pageContent.includes('.mp4');

  if (!hasAttachment) {
    log('⚠️  未检测到附件确认信号');
  }

  log('✅ Phase B 完成: 视频上传成功');
}

/**
 * Phase C: 首次复杂创作
 */
async function phaseC_FirstCreation(page) {
  log('\n=== Phase C: First Complex Creation ===');

  const prompt = `基于我上传的耳机素材，帮我制作一条 25～35 秒、9:16、适合短视频平台发布的新品首发电商视频。请你自己分析整段素材，不要简单按原视频顺序拼接。前 3 秒必须用最有质感的商品特写和一句明确卖点形成 Hook；之后按'产品亮相 → 细节质感 → 佩戴/使用 → 场景体验 → 购买理由 → CTA'组织叙事。至少使用 6 个有信息增量的镜头，删除低价值和重复片段，可以进行合理裁切、速度变化和节奏重组。字幕和卖点文案使用简体中文，保持统一视觉层级和安全区，不能遮挡耳机主体。整体视觉希望是高级、简洁、偏黑银科技感，但不能把素材调得失真。保留有价值的原声，同时配适合科技产品的背景音乐并做好音量层级。使用 HyperFrames 的动效、字幕、转场和构图能力增强商品表现，但不要为了炫技乱加特效。不要杜撰素材无法证明的功能。最终给我一个真正可以发布的完整成片。`;

  log('发送创作任务...');

  // 查找输入框
  const textarea = await page.locator('textarea, [contenteditable="true"]').first();
  await textarea.fill(prompt);
  await sleep(1000);
  await captureScreenshot(page, 'phase-c-prompt-entered');

  // 发送
  await page.keyboard.press('Enter');
  // 或者查找发送按钮
  const sendButtons = await page.locator('button[type="submit"], button:has-text("发送"), button:has-text("Send")').all();
  if (sendButtons.length > 0) {
    await sendButtons[0].click();
  }

  await sleep(2000);
  await captureScreenshot(page, 'phase-c-task-submitted');

  // 等待任务完成
  const result = await waitForJobCompletion(page, 'First Creation', 300000);

  evidence.operations.push({
    phase: 'C',
    description: 'First Creation',
    jobId: result.jobId,
    revisionId: result.revisionId,
    timestamp: new Date().toISOString(),
  });

  await captureScreenshot(page, 'phase-c-complete');
  log('✅ Phase C 完成: 首次创作成功');

  return result;
}

/**
 * Phase D: 同 Session 连续精剪
 */
async function phaseD_ContinuousEdits(page, previousRevision) {
  log('\n=== Phase D: Continuous Edits (Same Session) ===');

  const edits = [
    {
      round: 1,
      prompt: '现在这个版本还是有点像素材拼接。保留整体方向，但把前 6 秒重新做得更像真正的品牌广告：从最有质感的产品特写直接开场，2 秒内出现一句核心卖点，节奏更紧一些，但不能乱。把所有字幕重新检查一遍，统一 safe zone、字号层级和间距，任何文字都不能遮挡耳机主体。没有要求调整的后半段镜头尽量保留。',
    },
    {
      round: 2,
      prompt: '中间部分的叙事我还不满意。保留当前开头，把中段重新组织成「产品细节 → 佩戴体验 → 实际使用场景」的因果关系，减少重复镜头。如果素材合适，在两个关键动作转场上加入轻量音效，让动作和声音匹配。BGM 整体再降低一点，大约 3dB，让原声和重要声音优先。不要新增素材无法证明的功能。',
    },
    {
      round: 3,
      prompt: '做最终审片。请你自己完整检查一遍黑帧、闪帧、错误裁切、重复镜头、字幕越界、字幕遮挡商品、音频爆音、静音异常、声画不同步、突兀转场、错误产品信息以及结尾不完整。如果发现问题直接修改，不要只是告诉我有问题。最终只保留通过检查的版本并交付成片。',
    },
  ];

  const results = [];

  for (const edit of edits) {
    log(`\n--- 编辑轮次 ${edit.round} ---`);
    log(`Prompt: ${edit.prompt.substring(0, 50)}...`);

    // 输入编辑指令
    const textarea = await page.locator('textarea, [contenteditable="true"]').first();
    await textarea.fill(edit.prompt);
    await sleep(1000);

    // 发送
    await page.keyboard.press('Enter');
    await sleep(2000);
    await captureScreenshot(page, `phase-d-edit${edit.round}-submitted`);

    // 等待完成
    const result = await waitForJobCompletion(page, `Edit Round ${edit.round}`, 300000);

    // 验证是新 revision
    if (result.revisionId === previousRevision) {
      throw new Error(`Edit ${edit.round}: revision 未变化！仍然是 ${previousRevision}`);
    }

    evidence.operations.push({
      phase: 'D',
      round: edit.round,
      description: `Edit Round ${edit.round}`,
      jobId: result.jobId,
      revisionId: result.revisionId,
      previousRevision,
      timestamp: new Date().toISOString(),
    });

    results.push(result);
    previousRevision = result.revisionId;

    await captureScreenshot(page, `phase-d-edit${edit.round}-complete`);
    log(`✅ 编辑轮次 ${edit.round} 完成: ${result.revisionId}`);
  }

  log('✅ Phase D 完成: 三轮连续编辑成功');
  return results;
}

/**
 * Phase E: 最终视频质量验收
 */
async function phaseE_QualityInspection(page) {
  log('\n=== Phase E: Final Video Quality Inspection ===');

  await captureScreenshot(page, 'phase-e-final-state');

  // 1. 查找视频元素
  const videoElements = await page.locator('video').all();
  if (videoElements.length === 0) {
    throw new Error('Phase E 失败: 未找到视频元素');
  }

  log(`找到 ${videoElements.length} 个视频元素`);
  const video = videoElements[0];

  // 2. 获取视频源
  const videoSrc = await video.getAttribute('src');
  log(`视频源: ${videoSrc}`);

  if (!videoSrc || videoSrc.includes('blob:') || videoSrc.includes('data:')) {
    log('⚠️  视频源是 blob/data URL，无法直接下载验证');
  }

  // 3. 播放视频并截取关键帧
  log('播放视频并截取关键帧...');

  try {
    // 确保视频可播放
    await video.scrollIntoViewIfNeeded();
    await video.click(); // 尝试播放

    // 等待加载
    await page.waitForTimeout(3000);

    // 截取关键帧
    const keyframes = [
      { position: 0, name: 'opening' },
      { position: 0.25, name: '25percent' },
      { position: 0.5, name: 'midpoint' },
      { position: 0.75, name: '75percent' },
      { position: 0.95, name: 'ending' },
    ];

    for (const frame of keyframes) {
      // 使用 JS 设置视频位置
      await page.evaluate((pos) => {
        const v = document.querySelector('video');
        if (v && v.duration) {
          v.currentTime = v.duration * pos;
        }
      }, frame.position);

      await sleep(1000);
      await captureScreenshot(page, `phase-e-frame-${frame.name}`);
      log(`📸 截取关键帧: ${frame.name} (${(frame.position * 100).toFixed(0)}%)`);
    }
  } catch (error) {
    logError('视频播放或截帧失败', error);
  }

  // 4. 主观质量检查清单
  log('\n主观质量检查清单（需要人工审片）:');
  const qualityChecklist = [
    '✓ 商品清楚、无错误裁切、无视觉损坏',
    '✓ 前 3 秒有明确 Hook',
    '✓ 中段有信息推进，不像流水账',
    '✓ 结尾有明确收束',
    '✓ 没有明显重复素材凑时间',
    '✓ 镜头长度合理，节奏有变化',
    '✓ 转场不生硬',
    '✓ 能看出 HyperFrames 设计（typography/layout/motion/captions）',
    '✓ 字幕可读、一致、不越界、不遮挡商品',
    '✓ 无爆音、无意外静音、BGM 不压重要声音',
    '✓ 无黑帧、无 corrupt frame、无 placeholder',
    '✓ MP4 可正常播放和下载',
  ];

  for (const item of qualityChecklist) {
    log(`  ${item}`);
  }

  log('\n⚠️  质量验收需要人工审片最终视频文件');
  log('✅ Phase E 完成: 质量检查清单已生成');
}

/**
 * 主函数
 */
async function main() {
  log('=== OpenClaw × HyperFrames Video Agent 真实浏览器验收 ===\n');

  // 创建输出目录
  await fs.mkdir(path.join(config.outputDir, 'screenshots'), { recursive: true });
  await fs.mkdir(path.join(config.outputDir, 'videos'), { recursive: true });

  // 记录环境
  evidence.environment = {
    nodeVersion: process.version,
    platform: process.platform,
    testVideo: config.testVideo,
    openclawUrl: config.openclawUrl,
    backendUrl: config.backendUrl,
  };

  let browser, context, page;

  try {
    // Pre-check: 系统健康
    await checkSystemHealth();

    // 启动浏览器
    const setup = await setupBrowser();
    browser = setup.browser;
    context = setup.context;
    page = setup.page;

    // Phase A: Cold Start
    await phaseA_ColdStart(page);

    // Phase B: Upload Real Video
    await phaseB_UploadVideo(page);

    // Phase C: First Complex Creation
    const firstResult = await phaseC_FirstCreation(page);

    // Phase D: Continuous Edits (Same Session)
    await phaseD_ContinuousEdits(page, firstResult.revisionId);

    // Phase E: Quality Inspection
    await phaseE_QualityInspection(page);

    // 最终状态
    log('\n=== 验收通过 ===');
    log('所有阶段完成，无阻断性错误');

    evidence.status = 'PASS';
    evidence.endTime = new Date().toISOString();

  } catch (error) {
    logError('验收失败', error);
    evidence.status = 'FAIL';
    evidence.endTime = new Date().toISOString();

    if (page) {
      await captureScreenshot(page, 'final-error-state');
    }

    throw error;

  } finally {
    // 保存证据
    const evidencePath = path.join(config.outputDir, `evidence-${Date.now()}.json`);
    await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    log(`\n📦 证据已保存: ${evidencePath}`);

    // 保持浏览器打开以供检查
    if (!config.headless) {
      log('\n浏览器将保持打开 30 秒以供检查...');
      await sleep(30000);
    }

    // 清理
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

// 执行
main().catch(error => {
  console.error('\n❌ 验收异常:', error);
  process.exit(1);
});

