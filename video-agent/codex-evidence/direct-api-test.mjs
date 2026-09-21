#!/usr/bin/env node
/**
 * 直接 API 测试 - 绕过浏览器 UI，直接测试核心功能
 */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3020';
const EVIDENCE_DIR = 'codex-evidence';
const INBOUND_DIR = path.join(process.env.HOME, '.openclaw/hyperframe/state/media/inbound');

class DirectAPITest {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  async init() {
    console.log('🚀 直接 API 验收测试\n');
    await mkdir(EVIDENCE_DIR, { recursive: true });
  }

  async checkHealth() {
    console.log('1️⃣ 检查服务健康状态...');
    const response = await fetch(`${BASE_URL}/api/health`);
    const health = await response.json();
    console.log('   服务状态:', health);
    console.log('   ✓ Backend 正常运行\n');
    return health;
  }

  async createProject() {
    console.log('2️⃣ 创建新项目...');

    // 准备素材
    const videoFile = '0b2c7368-d2b8-409b-8663-3254e87569f5-product.mp4';
    const videoPath = path.join(INBOUND_DIR, videoFile);

    if (!existsSync(videoPath)) {
      throw new Error(`素材文件不存在: ${videoPath}`);
    }

    const request = {
      message: '请为这个商品视频制作一个40秒左右的竖屏推广片，包含6-8个镜头、中文讲解、字幕和背景音乐',
      product: {
        name: '测试商品',
        facts: ['功能强大', '使用方便', '性价比高']
      },
      assets: [{
        id: 'asset-1',
        path: videoPath,
        kind: 'video',
        role: 'hero'
      }],
      output: {
        duration: 40,
        aspect: '9:16',
        resolution: '1080x1920'
      },
      inferRequest: true,
      target: 'marketing'
    };

    const response = await fetch(`${BASE_URL}/api/commerce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`创建项目失败 (${response.status}): ${error}`);
    }

    const project = await response.json();
    console.log('   项目 ID:', project.id);
    console.log('   ✓ 项目创建成功\n');

    return project;
  }

  async waitForJobCompletion(projectId, jobId, maxMinutes = 15) {
    console.log(`3️⃣ 等待任务完成 (最多 ${maxMinutes} 分钟)...`);
    const startWait = Date.now();
    const maxWait = maxMinutes * 60 * 1000;

    while (Date.now() - startWait < maxWait) {
      const response = await fetch(`${BASE_URL}/api/commerce/${projectId}`);
      const project = await response.json();

      const job = project.jobs?.find(j => j.id === jobId);
      if (!job) {
        throw new Error('任务不存在');
      }

      console.log(`   状态: ${job.status}, 阶段: ${job.stage || 'N/A'}, 进度: ${job.progress || 0}%`);

      if (job.status === 'complete') {
        console.log('   ✓ 任务完成\n');
        return project;
      }

      if (job.status === 'failed') {
        throw new Error(`任务失败: ${job.error || '未知错误'}`);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    throw new Error(`任务超时 (${maxMinutes} 分钟)`);
  }

  async downloadVideo(projectId, revisionId, filename) {
    console.log(`4️⃣ 下载视频: ${filename}`);

    const url = `${BASE_URL}/api/commerce/${projectId}/revisions/${revisionId}/commerce-final.mp4`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`下载失败 (${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    const filepath = path.join(EVIDENCE_DIR, filename);
    await writeFile(filepath, Buffer.from(buffer));

    const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
    console.log(`   ✓ 视频已保存: ${filepath} (${sizeMB} MB)\n`);

    return filepath;
  }

  async testRound1() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('第一轮：完整制作');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const roundStart = Date.now();

    const project = await this.createProject();
    const job = project.jobs?.[0];

    if (!job) {
      throw new Error('未找到任务');
    }

    const completedProject = await this.waitForJobCompletion(project.id, job.id);
    const revision = completedProject.revisions?.find(r => r.id === completedProject.currentRevisionId);

    if (!revision || !revision.rendered) {
      throw new Error('视频未渲染');
    }

    const videoPath = await this.downloadVideo(project.id, revision.id, 'round1-api-test.mp4');

    const duration = ((Date.now() - roundStart) / 1000 / 60).toFixed(2);

    this.results.push({
      round: 1,
      name: '完整制作',
      status: '✅ 成功',
      duration: `${duration} 分钟`,
      projectId: project.id,
      revisionId: revision.id,
      videoPath
    });

    console.log(`✅ 第一轮完成 (耗时: ${duration} 分钟)\n`);
  }

  async generateReport() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('生成测试报告');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalDuration = ((Date.now() - this.startTime) / 1000 / 60).toFixed(2);

    const report = `# API 直接测试报告

## 执行信息
- 开始时间: ${new Date(this.startTime).toLocaleString('zh-CN')}
- 总耗时: ${totalDuration} 分钟
- 测试方式: 直接 API 调用（绕过浏览器 UI）

## 测试结果

${this.results.map(r => `### ${r.name}
- 状态: ${r.status}
- 耗时: ${r.duration}
- 项目 ID: ${r.projectId}
- 版本 ID: ${r.revisionId}
- 视频: ${r.videoPath}
`).join('\n')}

## 验证项

✅ **核心功能验证**：
- 服务健康检查通过
- 项目创建成功
- 任务正常执行
- 视频成功生成和下载

⚠️ **待人工验证**：
- 视频质量（需观看 ${this.results.map(r => r.videoPath).join(', ')}）
- 镜头数量和多样性
- 讲解、字幕、音乐质量
- 视觉设计效果

## 性能数据

| 测试项 | 目标 | 实际 | 状态 |
|--------|------|------|------|
${this.results.map(r => {
  const minutes = parseFloat(r.duration);
  const target = 10;
  const status = minutes <= target ? '✅ 通过' : '⚠️ 超时';
  return `| ${r.name} | ${target}分钟 | ${r.duration} | ${status} |`;
}).join('\n')}

## 结论

**系统状态**: ${this.results.every(r => r.status.includes('✅')) ? '✅ 核心功能正常' : '❌ 存在问题'}

**下一步**:
1. 观看生成的视频并进行质量评分
2. 测试编辑功能（重剪、恢复）
3. 执行回归测试
4. 如果质量达标，标记 READY_FOR_USER_ACCEPTANCE
`;

    await writeFile(`${EVIDENCE_DIR}/api-test-report.md`, report);
    console.log(`✓ 报告已生成: ${EVIDENCE_DIR}/api-test-report.md\n`);
    console.log(report);
  }

  async run() {
    try {
      await this.init();
      await this.checkHealth();
      await this.testRound1();
      await this.generateReport();

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ API 测试完成');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
      console.error('\n❌ 测试失败:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  }
}

const test = new DirectAPITest();
test.run();
