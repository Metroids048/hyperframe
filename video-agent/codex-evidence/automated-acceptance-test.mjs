#!/usr/bin/env node
/**
 * 自动化验收测试 - 完整执行四轮验收
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const EVIDENCE_DIR = 'codex-evidence';
const OPENCLAW_URL = 'http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c';

// 商品素材路径（用户已上传到授权目录的文件）
const TEST_VIDEOS = [
  '0b2c7368-d2b8-409b-8663-3254e87569f5-product.mp4',
  '06ca3299-d07d-4e9a-8397-e9ab430d156e-____.mp4'
];

class AcceptanceTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.evidence = [];
    this.startTime = Date.now();
  }

  async init() {
    console.log('🚀 启动自动化验收测试\n');
    await mkdir(EVIDENCE_DIR, { recursive: true });
    await mkdir(`${EVIDENCE_DIR}/screenshots`, { recursive: true });

    this.browser = await chromium.launch({
      headless: false,
      slowMo: 100
    });

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    this.page = await context.newPage();

    // 访问 OpenClaw
    console.log('📂 打开 OpenClaw 页面...');
    await this.page.goto(OPENCLAW_URL);
    await this.page.waitForLoadState('networkidle');
    await this.screenshot('00-initial-page');
    console.log('✓ 页面加载完成\n');
  }

  async screenshot(name) {
    const filename = `${EVIDENCE_DIR}/screenshots/${name}.png`;
    await this.page.screenshot({ path: filename, fullPage: true });
    return filename;
  }

  async waitForInput() {
    return await this.page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
  }

  async sendMessage(message) {
    const input = await this.waitForInput();
    await input.fill(message);

    // 查找并点击发送按钮
    const sendButton = this.page.locator('button').filter({ hasText: /发送|Send|提交/i }).first();
    await sendButton.click();

    // 等待响应
    await this.page.waitForTimeout(2000);
  }

  async uploadFile(filename) {
    console.log(`📤 上传素材: ${filename}`);

    // 查找文件上传输入
    const fileInput = await this.page.locator('input[type="file"]').first();
    const videoPath = path.join(process.env.HOME, '.openclaw/hyperframe/state/media/inbound', filename);

    if (!existsSync(videoPath)) {
      throw new Error(`素材文件不存在: ${videoPath}`);
    }

    await fileInput.setInputFiles(videoPath);
    await this.page.waitForTimeout(3000); // 等待上传完成
    console.log('✓ 素材上传完成\n');
  }

  async waitForCompletion(maxWaitMinutes = 15) {
    console.log(`⏳ 等待任务完成（最多 ${maxWaitMinutes} 分钟）...`);
    const startWait = Date.now();
    const maxWait = maxWaitMinutes * 60 * 1000;

    while (Date.now() - startWait < maxWait) {
      const bodyText = await this.page.textContent('body');

      // 检查是否有错误
      if (/ERROR|error|失败|Tool error/i.test(bodyText)) {
        await this.screenshot('error-detected');
        throw new Error('检测到错误: ' + bodyText.match(/(ERROR|error|失败)[^\n]{0,100}/)?.[0]);
      }

      // 检查是否完成
      if (/完成|complete|成功|success|视频已生成|播放|下载/i.test(bodyText)) {
        console.log('✓ 任务完成\n');
        return true;
      }

      // 显示进度
      const progressMatch = bodyText.match(/(\d+)%/);
      if (progressMatch) {
        process.stdout.write(`\r进度: ${progressMatch[1]}%`);
      }

      await this.page.waitForTimeout(5000);
    }

    throw new Error(`任务超时（${maxWaitMinutes} 分钟）`);
  }

  async extractVideoUrl() {
    // 查找视频下载链接
    const links = await this.page.locator('a[href*=".mp4"], a[href*="download"]').all();
    for (const link of links) {
      const href = await link.getAttribute('href');
      if (href && href.includes('.mp4')) {
        return href;
      }
    }

    // 查找视频标签
    const videos = await this.page.locator('video source, video').all();
    for (const video of videos) {
      const src = await video.getAttribute('src');
      if (src) return src;
    }

    return null;
  }

  async downloadVideo(url, filename) {
    console.log(`💾 下载视频: ${filename}`);

    // 将相对 URL 转为绝对 URL
    const baseUrl = 'http://127.0.0.1:3020';
    const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;

    const response = await this.page.request.get(fullUrl);
    const buffer = await response.body();

    const filepath = path.join(EVIDENCE_DIR, filename);
    await writeFile(filepath, buffer);

    console.log(`✓ 视频已保存: ${filepath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)\n`);
    return filepath;
  }

  async round1_CompleteProduction() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第一轮验收：完整制作');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roundStart = Date.now();

    // 上传素材
    await this.uploadFile(TEST_VIDEOS[0]);
    await this.screenshot('01-video-uploaded');

    // 发送制作请求
    const request = `请为这个商品视频制作一个40秒左右的竖屏推广片，要求：
1. 筛选6-8个有效镜头，至少使用5个不同的源视频区间
2. 开头展示真实使用动作，然后展开商品特点和完整使用过程
3. 使用至少两种有信息价值的视觉设计，比如细节放大标注、整体与细节分屏对比
4. 统一字体、配色和节奏
5. 加入自然的中文讲解、同步字幕和合适的背景音乐
6. 人声时降低音乐音量
7. 1080×1920竖屏输出

请自动完成制作并交付成片。`;

    console.log('📝 发送制作请求...');
    await this.sendMessage(request);
    await this.screenshot('01-request-sent');

    // 等待完成
    await this.waitForCompletion(15);
    await this.screenshot('01-completed');

    // 提取和下载视频
    const videoUrl = await this.extractVideoUrl();
    if (!videoUrl) {
      throw new Error('未找到视频下载链接');
    }

    const videoPath = await this.downloadVideo(videoUrl, 'round1-complete-production.mp4');

    const duration = ((Date.now() - roundStart) / 1000 / 60).toFixed(2);

    this.evidence.push({
      round: 1,
      name: '完整制作',
      status: 'completed',
      duration: `${duration} 分钟`,
      videoPath,
      request
    });

    console.log(`✅ 第一轮完成 (耗时: ${duration} 分钟)\n`);
  }

  async round2_SubstantialEdit() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第二轮验收：实质重剪');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roundStart = Date.now();

    const request = `请对刚才的视频进行重剪：
1. 把开头的使用演示和第3-4个镜头调换顺序
2. 替换掉两处重复出现的镜头，用其他源区间代替
3. 把某处展示方式从当前版式改成不同的视觉呈现
4. 相应更新受影响部分的讲解和字幕
5. 保持商品事实、背景音乐曲目、结尾引导、时长40秒左右和竖屏规格不变`;

    console.log('📝 发送重剪请求...');
    await this.sendMessage(request);
    await this.screenshot('02-request-sent');

    await this.waitForCompletion(10);
    await this.screenshot('02-completed');

    const videoUrl = await this.extractVideoUrl();
    const videoPath = await this.downloadVideo(videoUrl, 'round2-substantial-edit.mp4');

    const duration = ((Date.now() - roundStart) / 1000 / 60).toFixed(2);

    this.evidence.push({
      round: 2,
      name: '实质重剪',
      status: 'completed',
      duration: `${duration} 分钟`,
      videoPath,
      request
    });

    console.log(`✅ 第二轮完成 (耗时: ${duration} 分钟)\n`);
  }

  async round3_SelectiveRestore() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第三轮验收：选择性恢复');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roundStart = Date.now();

    const request = `请恢复第一版中第3-4个镜头之间的转场效果，
但保留第二版的新镜头顺序、新镜头选择和更新后的讲解字幕，
不要整体回滚到第一版。`;

    console.log('📝 发送恢复请求...');
    await this.sendMessage(request);
    await this.screenshot('03-request-sent');

    await this.waitForCompletion(6);
    await this.screenshot('03-completed');

    const videoUrl = await this.extractVideoUrl();
    const videoPath = await this.downloadVideo(videoUrl, 'round3-selective-restore.mp4');

    const duration = ((Date.now() - roundStart) / 1000 / 60).toFixed(2);

    this.evidence.push({
      round: 3,
      name: '选择性恢复',
      status: 'completed',
      duration: `${duration} 分钟`,
      videoPath,
      request
    });

    console.log(`✅ 第三轮完成 (耗时: ${duration} 分钟)\n`);
  }

  async round4_DifferentProduct() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第四轮验收：通用性测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roundStart = Date.now();

    // 明确说明换商品
    await this.sendMessage('现在换一个不同的商品');
    await this.page.waitForTimeout(2000);

    // 上传不同素材
    await this.uploadFile(TEST_VIDEOS[1]);
    await this.screenshot('04-different-video-uploaded');

    const request = `帮我做一个这个商品的宣传短片，大概40秒，竖版，
要包含多个使用场景、产品亮点说明、语音讲解和字幕。`;

    console.log('📝 发送制作请求（不同措辞）...');
    await this.sendMessage(request);
    await this.screenshot('04-request-sent');

    await this.waitForCompletion(15);
    await this.screenshot('04-completed');

    const videoUrl = await this.extractVideoUrl();
    const videoPath = await this.downloadVideo(videoUrl, 'round4-different-product.mp4');

    const duration = ((Date.now() - roundStart) / 1000 / 60).toFixed(2);

    this.evidence.push({
      round: 4,
      name: '通用性测试',
      status: 'completed',
      duration: `${duration} 分钟`,
      videoPath,
      request
    });

    console.log(`✅ 第四轮完成 (耗时: ${duration} 分钟)\n`);
  }

  async generateReport() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('生成验收报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalDuration = ((Date.now() - this.startTime) / 1000 / 60).toFixed(2);

    const report = `# 自动化验收测试报告

## 执行时间
- 开始时间: ${new Date(this.startTime).toLocaleString('zh-CN')}
- 总耗时: ${totalDuration} 分钟

## 测试结果

${this.evidence.map(e => `### 第${e.round}轮：${e.name}
- 状态: ✅ ${e.status}
- 耗时: ${e.duration}
- 视频: ${e.videoPath}
- 请求:
\`\`\`
${e.request}
\`\`\`
`).join('\n')}

## 性能数据

| 场景 | 目标 | 实际 | 通过 |
|------|------|------|------|
${this.evidence.map(e => {
  const minutes = parseFloat(e.duration);
  const target = e.round === 1 ? 10 : e.round === 2 ? 6 : e.round === 3 ? 3 : 10;
  const pass = minutes <= target ? '✅' : '⚠️';
  return `| ${e.name} | ${target}分钟 | ${e.duration} | ${pass} |`;
}).join('\n')}

## 下一步

1. **人工复审**：观看所有生成的视频，确认质量达标
2. **评分**：按照验收标准评分（85+ 且无硬伤）
3. **回归测试**：执行重复发送、取消、刷新等场景
4. **最终判定**：决定是否标记 READY_FOR_USER_ACCEPTANCE

## 证据文件

- 截图: ${EVIDENCE_DIR}/screenshots/
- 视频: ${this.evidence.map(e => e.videoPath).join(', ')}
- 报告: ${EVIDENCE_DIR}/acceptance-report.md
`;

    await writeFile(`${EVIDENCE_DIR}/acceptance-report.md`, report);
    console.log(`✓ 报告已生成: ${EVIDENCE_DIR}/acceptance-report.md\n`);
  }

  async cleanup() {
    if (this.browser) {
      console.log('🔚 关闭浏览器...');
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.init();
      await this.round1_CompleteProduction();
      await this.round2_SubstantialEdit();
      await this.round3_SelectiveRestore();
      await this.round4_DifferentProduct();
      await this.generateReport();

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ 自动化验收测试完成');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('📋 下一步：');
      console.log('1. 观看生成的视频并评分');
      console.log('2. 执行回归测试');
      console.log('3. 查看报告: codex-evidence/acceptance-report.md\n');

    } catch (error) {
      console.error('\n❌ 测试失败:', error.message);
      await this.screenshot('fatal-error');
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// 执行测试
const test = new AcceptanceTest();
test.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
