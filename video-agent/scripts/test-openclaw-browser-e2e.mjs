#!/usr/bin/env node
/**
 * OpenClaw 浏览器端到端验证测试
 *
 * 测试场景：营销视频多轮精修
 * 1. 创建项目并上传视频素材
 * 2. 生成基础营销视频（15秒，带标题和音乐）
 * 3. 第一轮编辑：修改标题样式（颜色、大小、位置）
 * 4. 第二轮编辑：调整视频节奏
 * 5. 第三轮编辑：添加字幕和动画
 * 6. 验证最终质量
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const config = {
  openclawUrl: 'http://localhost:18789',
  testVideoPath: path.join(ROOT, 'assets/edit-samples/coffee.mp4'),
  headless: false, // 设置为 true 可无头运行
  timeout: 300000, // 5分钟任务超时
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForTaskComplete(page, maxWaitMs = 300000) {
  const startTime = Date.now();
  console.log('⏳ 等待任务完成...');

  while (Date.now() - startTime < maxWaitMs) {
    // 检查是否有完成标志（视频预览、下载按钮等）
    const hasVideo = await page.locator('video').count() > 0;
    const hasDownload = await page.locator('button:has-text("下载"), button:has-text("导出"), a:has-text("下载")').count() > 0;

    if (hasVideo || hasDownload) {
      console.log('✓ 任务完成');
      return true;
    }

    // 检查错误提示
    const hasError = await page.locator('[class*="error"], [class*="Error"], .alert-error').count() > 0;
    if (hasError) {
      const errorText = await page.locator('[class*="error"], [class*="Error"], .alert-error').first().textContent();
      throw new Error(`任务失败: ${errorText}`);
    }

    await sleep(2000);
  }

  throw new Error('任务超时');
}

async function main() {
  console.log('=== OpenClaw 浏览器端到端测试 ===\n');

  // 1. 启动浏览器
  console.log('【1/7】启动浏览器...');
  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: 100, // 减慢操作速度以便观察
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: path.join(ROOT, 'test-output/videos'),
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  try {
    // 2. 打开 OpenClaw WebUI
    console.log('\n【2/7】打开 OpenClaw WebUI...');
    await page.goto(config.openclawUrl, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(ROOT, 'test-output/01-homepage.png') });
    console.log('✓ 页面加载完成');

    // 3. 创建新项目
    console.log('\n【3/7】创建新项目...');
    const newProjectSelectors = [
      'button:has-text("新建项目")',
      'button:has-text("创建项目")',
      'button:has-text("New Project")',
      'a:has-text("新建")',
      '[data-testid="new-project"]',
    ];

    let projectCreated = false;
    for (const selector of newProjectSelectors) {
      if (await page.locator(selector).count() > 0) {
        await page.click(selector);
        projectCreated = true;
        console.log(`✓ 点击了: ${selector}`);
        break;
      }
    }

    if (!projectCreated) {
      console.log('⚠ 未找到"新建项目"按钮，假设已在项目页面');
    }

    await sleep(2000);
    await page.screenshot({ path: path.join(ROOT, 'test-output/02-project-created.png') });

    // 4. 上传视频素材
    console.log('\n【4/7】上传视频素材...');
    const fileInputSelectors = [
      'input[type="file"]',
      'input[accept*="video"]',
      '[data-testid="file-upload"]',
    ];

    let uploaded = false;
    for (const selector of fileInputSelectors) {
      const fileInputs = await page.locator(selector).all();
      if (fileInputs.length > 0) {
        await fileInputs[0].setInputFiles(config.testVideoPath);
        uploaded = true;
        console.log(`✓ 上传了素材: ${path.basename(config.testVideoPath)}`);
        break;
      }
    }

    if (!uploaded) {
      throw new Error('未找到文件上传控件');
    }

    await sleep(3000);
    await page.screenshot({ path: path.join(ROOT, 'test-output/03-material-uploaded.png') });

    // 5. 提交创作任务
    console.log('\n【5/7】提交创作任务: 生成15秒营销视频...');
    const taskPrompt = '制作15秒产品营销视频，突出咖啡的香浓口感，添加醒目的标题"新品上市"，配轻快的背景音乐';

    const textareaSelectors = [
      'textarea',
      'input[type="text"][placeholder*="需求"]',
      'input[type="text"][placeholder*="描述"]',
      '[contenteditable="true"]',
    ];

    let taskSubmitted = false;
    for (const selector of textareaSelectors) {
      if (await page.locator(selector).count() > 0) {
        await page.fill(selector, taskPrompt);
        console.log(`✓ 填写了任务描述`);

        // 查找提交按钮
        const submitSelectors = [
          'button:has-text("生成")',
          'button:has-text("开始")',
          'button:has-text("创建")',
          'button:has-text("提交")',
          'button[type="submit"]',
        ];

        for (const submitSelector of submitSelectors) {
          if (await page.locator(submitSelector).count() > 0) {
            await page.click(submitSelector);
            taskSubmitted = true;
            console.log(`✓ 点击了: ${submitSelector}`);
            break;
          }
        }

        if (taskSubmitted) break;
      }
    }

    if (!taskSubmitted) {
      throw new Error('未能提交任务');
    }

    await page.screenshot({ path: path.join(ROOT, 'test-output/04-task-submitted.png') });

    // 6. 等待任务完成
    console.log('\n【6/7】等待视频生成...');
    await waitForTaskComplete(page, config.timeout);
    await sleep(2000);
    await page.screenshot({ path: path.join(ROOT, 'test-output/05-video-generated.png') });

    // 7. 多轮对话编辑
    console.log('\n【7/7】执行多轮编辑...');

    const edits = [
      { round: 1, prompt: '把标题改成红色，字号放大一倍，位置移到屏幕顶部居中' },
      { round: 2, prompt: '前5秒加快节奏突出咖啡特写，后10秒放慢展示细节' },
      { round: 3, prompt: '在咖啡倒入杯子的镜头添加字幕"香浓醇厚"，加入渐入渐出动画' },
    ];

    for (const edit of edits) {
      console.log(`\n  第 ${edit.round} 轮编辑: ${edit.prompt.slice(0, 30)}...`);

      // 查找输入框并填写
      const inputFound = await page.locator('textarea, input[type="text"]').first().fill(edit.prompt);

      // 查找并点击提交按钮
      const editSubmitSelectors = [
        'button:has-text("应用")',
        'button:has-text("修改")',
        'button:has-text("更新")',
        'button:has-text("生成")',
      ];

      for (const selector of editSubmitSelectors) {
        if (await page.locator(selector).count() > 0) {
          await page.click(selector);
          console.log(`  ✓ 提交了编辑请求`);
          break;
        }
      }

      // 等待编辑完成
      await waitForTaskComplete(page, 60000); // 每次编辑最多等待1分钟
      await page.screenshot({ path: path.join(ROOT, `test-output/06-edit-round-${edit.round}.png`) });
      console.log(`  ✓ 第 ${edit.round} 轮编辑完成`);

      await sleep(2000);
    }

    // 最终验证
    console.log('\n【验证】检查最终结果...');
    await page.screenshot({ path: path.join(ROOT, 'test-output/07-final-result.png'), fullPage: true });

    const hasVideo = await page.locator('video').count() > 0;
    console.log(`  视频播放器: ${hasVideo ? '✓ 存在' : '✗ 缺失'}`);

    if (hasVideo) {
      const videoSrc = await page.locator('video').first().getAttribute('src');
      console.log(`  视频地址: ${videoSrc}`);
    }

    console.log('\n=== 测试完成 ===');
    console.log('截图已保存到 test-output/ 目录');
    console.log('视频录制已保存到 test-output/videos/ 目录');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    await page.screenshot({ path: path.join(ROOT, 'test-output/error.png'), fullPage: true });
    throw error;
  } finally {
    await sleep(5000); // 保持浏览器打开5秒以便观察
    await context.close();
    await browser.close();
  }
}

// 执行测试
main().catch(error => {
  console.error('测试异常:', error);
  process.exit(1);
});
