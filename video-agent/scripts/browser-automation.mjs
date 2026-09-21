#!/usr/bin/env node
/**
 * 浏览器自动化验收测试
 * 使用Puppeteer（如果已安装）或回退到手动指导模式
 */

import { spawn } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 测试状态
const state = {
  startTime: Date.now(),
  currentStep: 0,
  projectId: null,
  conversationId: null,
  results: []
};

// 保存状态
async function saveState() {
  const stateFile = join(ROOT, 'test-state.json');
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  console.log(`[状态] 已保存到 ${stateFile}`);
}

// 加载状态
async function loadState() {
  const stateFile = join(ROOT, 'test-state.json');
  try {
    const data = await readFile(stateFile, 'utf8');
    Object.assign(state, JSON.parse(data));
    console.log(`[状态] 已从 ${stateFile} 恢复`);
    return true;
  } catch {
    console.log('[状态] 无现有状态，从头开始');
    return false;
  }
}

// 检查Puppeteer是否可用
async function checkPuppeteer() {
  try {
    await import('puppeteer');
    return true;
  } catch {
    return false;
  }
}

// 手动指导模式
async function manualMode() {
  console.log('\n='.repeat(60));
  console.log('手动验收测试指导');
  console.log('='.repeat(60));
  console.log('\n【第一轮：完整商品短片制作】\n');

  const instructions = `
1. 打开浏览器访问 http://127.0.0.1:3024/

2. 准备素材：
   - 使用 assets/commerce-serum/ 目录下的护肤品视频
   - apply-8131889.mp4 (使用场景)
   - drop-8131887.mp4 (产品细节)
   - hero-8131892.mp4 (整体展示)

3. 在WebUI上传这三个素材文件

4. 输入以下完整需求：

把这些护肤精华素材制作成一条45秒左右、1080×1920竖屏的商品推广视频。

从原素材中选取6—9个有效镜头，至少使用5个不同的有效源区间。开头3秒用实际产品画面吸引观看，再展开三个有依据的产品特点：质地轻盈易吸收、精准滴管设计、温和亲肤配方，串起一个看得懂的使用过程，最后做自然的行动引导。

统一字体、配色、版式和运动节奏。至少使用两种真正帮助看清商品的视觉设计，例如细节放大与标注、整体和特写分屏、随解说出现的重点信息。转场要服务节奏，不要每个镜头都炫技。

加入自然中文讲解、与讲解对齐的字幕和合适的背景音乐。有人声时音乐降低，产品滴落和涂抹的操作声保留。竖屏不能裁掉关键商品结构和操作动作。

自动制作、检查并交付可播放和下载的新视频，显示真实进度，不要只返回方案。

5. 观察以下内容：
   - 界面反馈是否在1秒内
   - 任务受理是否在3秒内
   - 是否有不超过10秒间隔的状态心跳
   - 是否显示真实上传/渲染进度
   - 成片制作是否在10分钟内完成

6. 成片完成后：
   - 完整播放视频
   - 下载成片文件
   - 记录项目ID

7. 完成后输入项目ID继续第二轮测试
`;

  console.log(instructions);
  console.log('\n' + '='.repeat(60));
  console.log('等待用户完成第一轮并输入项目ID...');
  console.log('='.repeat(60) + '\n');

  await saveState();
}

// 自动化模式（使用Puppeteer）
async function automatedMode() {
  console.log('[自动化] 启动Puppeteer测试...');

  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log('[自动化] 打开WebUI...');
  await page.goto('http://127.0.0.1:3024/');

  // TODO: 实现上传和表单填写
  console.log('[自动化] Puppeteer模式需要完整实现，当前使用手动模式');

  await browser.close();
}

// 主函数
async function main() {
  console.log('OpenClaw 浏览器验收测试');
  console.log(`时间: ${new Date().toISOString()}`);

  // 检查是否有保存的状态
  const hasState = await loadState();

  if (hasState && state.projectId) {
    console.log(`\n[恢复] 检测到项目ID: ${state.projectId}`);
    console.log('[恢复] 继续第二轮测试...\n');

    console.log('【第二轮：实质性重剪辑】\n');
    console.log(`
在同一个OpenClaw会话中继续，输入以下修改需求：

上一版还太像常规产品介绍。前4秒直接展示真实使用中的关键动作（涂抹吸收过程），不要先放静态品牌卡；把使用演示移到第二段，再用细节解释为什么值得关注。

删掉两处信息重复的展示，换成其他真实细节镜头（例如质地流动、包装设计）。第二个特点改成整体和细节并排展示，不要编造使用前后效果。

随新顺序重写受影响的讲解，重新对齐字幕，调整相应节奏和音量衔接。

保留商品身份、已确认事实、原来的背景音乐曲目、整体视觉风格、结尾行动引导、时长和竖屏输出。不要把没涉及的部分全部重做。

观察：
- 修改项是否真的改了（镜头顺序、源区间、布局、旁白、字幕）
- 保持项是否真的保留了（音乐、风格、时长、竖屏）
- 复杂编辑是否在6分钟内完成
- 是否交付了新版本的视频文件
`);
  } else {
    // 检查Puppeteer
    const hasPuppeteer = await checkPuppeteer();

    if (hasPuppeteer) {
      console.log('[检测] 找到Puppeteer，使用自动化模式');
      await automatedMode();
    } else {
      console.log('[检测] 未找到Puppeteer，使用手动指导模式');
      await manualMode();
    }
  }
}

main().catch(err => {
  console.error('[错误]', err);
  process.exit(1);
});
