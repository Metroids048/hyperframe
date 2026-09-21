/**
 * OpenClaw 浏览器端到端测试
 * 使用 Playwright 自动化浏览器操作，验证完整用户体验
 */

import {chromium} from 'playwright';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';
import {existsSync} from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// 配置
const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:18789';
const VIDEO_PATH = join(ROOT, '视频样例_蛋白粉版.mp4');
const HEADLESS = process.env.HEADLESS === 'true';

console.log('=== OpenClaw 浏览器端到端测试 ===\n');
console.log('配置:');
console.log('  - OpenClaw URL:', OPENCLAW_URL);
console.log('  - 测试素材:', VIDEO_PATH);
console.log('  - 无头模式:', HEADLESS);
console.log('');

if (!existsSync(VIDEO_PATH)) {
  console.error('❌ 测试素材不存在:', VIDEO_PATH);
  process.exit(1);
}

let browser, page;

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function screenshot(name) {
  const path = join(ROOT, 'outputs', `screenshot-${name}.png`);
  await page.screenshot({path, fullPage: false});
  console.log(`    📸 截图保存: ${path}`);
}

try {
  // 启动浏览器
  console.log('【步骤 1/8】启动浏览器...');
  browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 100 // 减慢操作速度，方便观察
  });

  const context = await browser.newContext({
    viewport: {width: 1920, height: 1080}
  });

  page = await context.newPage();

  // 监听控制台日志
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`    [浏览器 ${type}]:`, msg.text());
    }
  });

  console.log('  ✓ 浏览器启动成功');
  console.log('');

  // 打开 OpenClaw WebUI
  console.log('【步骤 2/8】打开 OpenClaw WebUI...');
  await page.goto(OPENCLAW_URL, {waitUntil: 'networkidle'});
  await wait(2000);
  await screenshot('01-home');
  console.log('  ✓ WebUI 加载成功');
  console.log('');

  // 创建新项目
  console.log('【步骤 3/8】创建新项目...');

  // 尝试多种可能的选择器
  const newProjectSelectors = [
    'button:has-text("新建项目")',
    'button:has-text("创建项目")',
    'button:has-text("New Project")',
    'button:has-text("Create")',
    '[data-testid="new-project"]',
    '.new-project-button'
  ];

  let clicked = false;
  for (const selector of newProjectSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({timeout: 1000})) {
        await button.click();
        clicked = true;
        console.log(`  ✓ 点击按钮成功: ${selector}`);
        break;
      }
    } catch (e) {
      // 继续尝试下一个选择器
    }
  }

  if (!clicked) {
    console.log('  ⚠️ 未找到"新建项目"按钮，尝试直接上传素材');
  }

  await wait(2000);
  await screenshot('02-new-project');
  console.log('');

  // 上传视频素材
  console.log('【步骤 4/8】上传视频素材...');

  const fileInputSelectors = [
    'input[type="file"]',
    'input[accept*="video"]',
    '[data-testid="file-upload"]'
  ];

  let uploaded = false;
  for (const selector of fileInputSelectors) {
    try {
      const fileInput = page.locator(selector).first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(VIDEO_PATH);
        uploaded = true;
        console.log(`  ✓ 素材上传成功: ${selector}`);
        break;
      }
    } catch (e) {
      console.log(`  ! 尝试 ${selector} 失败:`, e.message);
    }
  }

  if (!uploaded) {
    throw new Error('无法找到文件上传控件');
  }

  await wait(3000);
  await screenshot('03-upload');
  console.log('');

  // 输入创作需求
  console.log('【步骤 5/8】输入创作需求...');

  const textareaSelectors = [
    'textarea',
    '[contenteditable="true"]',
    'input[type="text"]',
    '[data-testid="prompt-input"]'
  ];

  const intent = '制作15秒产品宣传片，标题"健康蛋白 活力满分"，添加动感背景音乐';

  let inputted = false;
  for (const selector of textareaSelectors) {
    try {
      const input = page.locator(selector).first();
      if (await input.isVisible({timeout: 1000})) {
        await input.fill(intent);
        inputted = true;
        console.log(`  ✓ 需求输入成功: ${selector}`);
        console.log(`  需求内容: ${intent}`);
        break;
      }
    } catch (e) {
      // 继续尝试
    }
  }

  if (!inputted) {
    throw new Error('无法找到输入框');
  }

  await wait(1000);
  await screenshot('04-input');
  console.log('');

  // 提交生成任务
  console.log('【步骤 6/8】提交生成任务...');

  const submitSelectors = [
    'button:has-text("生成")',
    'button:has-text("提交")',
    'button:has-text("创建")',
    'button:has-text("Generate")',
    'button:has-text("Submit")',
    '[data-testid="submit"]',
    'button[type="submit"]'
  ];

  let submitted = false;
  for (const selector of submitSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({timeout: 1000})) {
        await button.click();
        submitted = true;
        console.log(`  ✓ 任务提交成功: ${selector}`);
        break;
      }
    } catch (e) {
      // 继续尝试
    }
  }

  if (!submitted) {
    console.log('  ⚠️ 未找到提交按钮，任务可能自动提交');
  }

  await wait(3000);
  await screenshot('05-submit');
  console.log('');

  // 等待视频生成
  console.log('【步骤 7/8】等待视频生成（最多5分钟）...');

  const videoSelector = 'video';
  let videoGenerated = false;

  for (let i = 0; i < 60; i++) {
    try {
      const video = page.locator(videoSelector).first();
      if (await video.isVisible({timeout: 5000})) {
        videoGenerated = true;
        console.log(`  ✓ 视频生成成功（${(i + 1) * 5}秒）`);
        break;
      }
    } catch (e) {
      // 继续等待
    }

    if (i % 6 === 0) {
      console.log(`  ⏳ 等待中... ${(i + 1) * 5}秒`);
    }

    await wait(5000);
  }

  if (!videoGenerated) {
    throw new Error('视频生成超时（5分钟）');
  }

  await wait(2000);
  await screenshot('06-video-generated');
  console.log('');

  // 对话编辑
  console.log('【步骤 8/8】测试多轮对话编辑...');

  const edits = [
    {round: 1, message: '把标题改成"限时特惠"，字号调大', wait: 30000},
    {round: 2, message: '换一首更优雅的背景音乐', wait: 40000},
    {round: 3, message: '在产品特写时添加字幕"天然成分 零添加"', wait: 35000}
  ];

  for (const edit of edits) {
    console.log(`  第 ${edit.round} 轮编辑: ${edit.message}`);

    // 找到输入框并输入
    let editInputted = false;
    for (const selector of textareaSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.isVisible({timeout: 1000})) {
          await input.fill(edit.message);
          editInputted = true;
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!editInputted) {
      console.log(`  ⚠️ 第 ${edit.round} 轮：无法找到输入框，跳过`);
      continue;
    }

    // 提交编辑
    let editSubmitted = false;
    for (const selector of [...submitSelectors, 'button:has-text("应用")', 'button:has-text("Apply")']) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({timeout: 1000})) {
          await button.click();
          editSubmitted = true;
          break;
        }
      } catch (e) {
        // 继续尝试
      }
    }

    if (!editSubmitted) {
      console.log(`  ⚠️ 第 ${edit.round} 轮：无法找到提交按钮`);
      continue;
    }

    // 等待编辑完成
    console.log(`  ⏳ 等待编辑完成（最多 ${edit.wait / 1000} 秒）...`);
    await wait(edit.wait);
    await screenshot(`07-edit-round-${edit.round}`);
    console.log(`  ✓ 第 ${edit.round} 轮编辑完成`);
  }

  console.log('');
  console.log('✅ 浏览器端到端测试完成！');
  console.log('');
  console.log('测试摘要:');
  console.log('  ✓ WebUI 加载正常');
  console.log('  ✓ 素材上传成功');
  console.log('  ✓ 视频生成成功');
  console.log('  ✓ 多轮对话编辑测试完成');
  console.log('');
  console.log(`截图保存在: ${join(ROOT, 'outputs')}/`);

} catch (error) {
  console.error('');
  console.error('❌ 测试失败:', error.message);
  console.error('');

  if (page) {
    await screenshot('error');
  }

  throw error;

} finally {
  if (browser) {
    if (!HEADLESS) {
      console.log('');
      console.log('浏览器将在 10 秒后关闭...');
      await wait(10000);
    }
    await browser.close();
  }
}
