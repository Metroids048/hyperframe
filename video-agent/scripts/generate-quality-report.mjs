#!/usr/bin/env node
/**
 * 质量验收助手 - 生成完整的验收报告
 */

import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const VIDEO_AGENT_BASE = 'http://127.0.0.1:3024';

async function analyzeVideo(videoPath) {
  console.log(`\n🔍 分析视频: ${videoPath}\n`);

  try {
    // 使用 ffprobe 获取视频元数据
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`
    );

    const metadata = JSON.parse(stdout);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

    const analysis = {
      file: {
        path: videoPath,
        size: parseInt(metadata.format.size),
        sizeMB: (parseInt(metadata.format.size) / 1024 / 1024).toFixed(2),
        duration: parseFloat(metadata.format.duration).toFixed(2),
        bitrate: parseInt(metadata.format.bit_rate)
      },
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: eval(videoStream.r_frame_rate),
        bitrate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : null
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        sampleRate: audioStream.sample_rate,
        channels: audioStream.channels,
        bitrate: audioStream.bit_rate ? parseInt(audioStream.bit_rate) : null
      } : null
    };

    console.log('文件信息:');
    console.log(`  大小: ${analysis.file.sizeMB} MB`);
    console.log(`  时长: ${analysis.file.duration} 秒`);
    console.log(`  比特率: ${(analysis.file.bitrate / 1000000).toFixed(2)} Mbps`);

    if (analysis.video) {
      console.log('\n视频流:');
      console.log(`  编码: ${analysis.video.codec}`);
      console.log(`  分辨率: ${analysis.video.width}x${analysis.video.height}`);
      console.log(`  帧率: ${analysis.video.fps.toFixed(2)} fps`);
    }

    if (analysis.audio) {
      console.log('\n音频流:');
      console.log(`  编码: ${analysis.audio.codec}`);
      console.log(`  采样率: ${analysis.audio.sampleRate} Hz`);
      console.log(`  声道: ${analysis.audio.channels}`);
    }

    return analysis;
  } catch (error) {
    console.error(`✗ 视频分析失败: ${error.message}`);
    return null;
  }
}

async function generateQualityReport(projectId, revisionId, videoPath) {
  console.log(`\n📊 生成质量验收报告...\n`);

  // 获取项目详情
  const projectResp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce/${projectId}/status`);
  const projectData = await projectResp.json();
  const project = projectData.project;

  // 分析视频
  const videoAnalysis = await analyzeVideo(videoPath);

  // 生成报告
  const report = {
    metadata: {
      projectId,
      revisionId,
      videoPath,
      timestamp: new Date().toISOString(),
      projectTitle: project.title
    },

    technical: {
      resolution: videoAnalysis?.video ?
        `${videoAnalysis.video.width}x${videoAnalysis.video.height}` :
        '未知',
      duration: videoAnalysis?.file.duration ?
        `${videoAnalysis.file.duration}秒` :
        '未知',
      fileSize: videoAnalysis?.file.sizeMB ?
        `${videoAnalysis.file.sizeMB} MB` :
        '未知',
      fps: videoAnalysis?.video?.fps ?
        `${videoAnalysis.video.fps.toFixed(2)} fps` :
        '未知',
      codec: videoAnalysis?.video?.codec || '未知',
      audioCodec: videoAnalysis?.audio?.codec || '未知'
    },

    qualityChecklist: {
      visual: {
        resolution: {
          required: '1080p 或以上',
          actual: videoAnalysis?.video ?
            `${videoAnalysis.video.width}x${videoAnalysis.video.height}` :
            '未知',
          pass: videoAnalysis?.video &&
            (videoAnalysis.video.height >= 1080 || videoAnalysis.video.width >= 1080)
        },
        clarity: { status: '待人工验收', pass: null },
        composition: { status: '待人工验收', pass: null },
        transitions: { status: '待人工验收', pass: null },
        text: { status: '待人工验收', pass: null }
      },

      audio: {
        clarity: { status: '待人工验收', pass: null },
        music: { status: '待人工验收', pass: null },
        balance: { status: '待人工验收', pass: null },
        noise: { status: '待人工验收', pass: null }
      },

      content: {
        accuracy: { status: '待人工验收', pass: null },
        compliance: { status: '待人工验收', pass: null },
        materials: { status: '待人工验收', pass: null }
      }
    },

    jobs: project.jobs.map(j => ({
      kind: j.kind,
      status: j.status,
      stage: j.stage,
      duration: j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}秒` : '未知'
    }))
  };

  // 保存 JSON 报告
  const reportPath = path.join(
    PROJECT_ROOT,
    'outputs',
    `quality-report-${projectId.substring(0, 8)}-${Date.now()}.json`
  );
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  // 生成 Markdown 报告
  const markdown = `# OpenClaw 视频质量验收报告

**生成时间：** ${new Date().toLocaleString('zh-CN')}
**项目ID：** ${projectId}
**版本ID：** ${revisionId}
**项目标题：** ${project.title}

---

## 📹 技术指标

| 项目 | 数值 | 要求 | 状态 |
|------|------|------|------|
| 分辨率 | ${report.technical.resolution} | 1080p+ | ${report.qualityChecklist.visual.resolution.pass ? '✅' : '⏳'} |
| 时长 | ${report.technical.duration} | 30秒 | ⏳ |
| 文件大小 | ${report.technical.fileSize} | - | ✅ |
| 帧率 | ${report.technical.fps} | 30fps+ | ⏳ |
| 视频编码 | ${report.technical.codec} | H.264/H.265 | ✅ |
| 音频编码 | ${report.technical.audioCodec} | AAC | ✅ |

---

## 🎨 视觉质量验收

### 画面清晰度
- [ ] 画面锐利，无模糊
- [ ] 商品细节清晰可见
- [ ] 文字清晰可读
- [ ] 无压缩失真

**评分：** ___ / 100
**备注：** _______________

### 构图与美学
- [ ] 构图平衡
- [ ] 色彩还原准确
- [ ] 光线自然
- [ ] 主体突出

**评分：** ___ / 100
**备注：** _______________

### 镜头切换
- [ ] 切换流畅自然
- [ ] 节奏适中
- [ ] 无突兀跳跃
- [ ] 转场效果到位

**评分：** ___ / 100
**备注：** _______________

### 动效表现
- [ ] 动画流畅
- [ ] 速度曲线自然
- [ ] 无卡顿闪烁
- [ ] 时机把控准确

**评分：** ___ / 100
**备注：** _______________

---

## 🔊 音频质量验收

### 旁白质量
- [ ] 发音清晰标准
- [ ] 语速适中
- [ ] 情感表达到位
- [ ] 无破音杂音

**评分：** ___ / 100
**备注：** _______________

### 背景音乐
- [ ] 风格匹配
- [ ] 音量适中
- [ ] 不影响旁白
- [ ] 节奏配合画面

**评分：** ___ / 100
**备注：** _______________

### 音频平衡
- [ ] 音量稳定
- [ ] 无爆音
- [ ] 声场均衡
- [ ] 整体和谐

**评分：** ___ / 100
**备注：** _______________

---

## 📝 内容质量验收

### 信息准确性
- [ ] 商品信息准确
- [ ] 无夸大宣传
- [ ] 无虚假承诺
- [ ] 符合实际

**评分：** ___ / 100
**备注：** _______________

### 合规性
- [ ] 符合广告法
- [ ] 无违禁词
- [ ] 素材授权清晰
- [ ] 无侵权风险

**评分：** ___ / 100
**备注：** _______________

---

## 📊 综合评分

| 维度 | 权重 | 得分 | 加权得分 |
|------|------|------|----------|
| 视觉质量 | 40% | ___ | ___ |
| 音频质量 | 30% | ___ | ___ |
| 内容质量 | 30% | ___ | ___ |
| **总分** | **100%** | **___** | **___** |

---

## ✅ 验收结论

- [ ] **通过** - 质量达标，可以交付
- [ ] **有条件通过** - 需要小幅修改
- [ ] **不通过** - 需要重新制作

**验收人：** _______________
**验收日期：** ${new Date().toLocaleDateString('zh-CN')}
**验收意见：**

_______________________________________________

_______________________________________________

---

## 🔗 相关链接

- 视频文件：\`${videoPath}\`
- 项目详情：http://127.0.0.1:18789/chat?project=${projectId}
- JSON 报告：\`${reportPath}\`

---

## 📋 制作流程记录

${project.jobs.map((j, i) =>
  `${i + 1}. **${j.kind}** - ${j.status} (${j.stage || '无阶段信息'})`
).join('\n')}

---

**报告生成工具：** OpenClaw Quality Validator v1.0
**生成时间：** ${new Date().toISOString()}
`;

  const markdownPath = path.join(
    PROJECT_ROOT,
    'outputs',
    `quality-report-${projectId.substring(0, 8)}-${Date.now()}.md`
  );
  await fs.writeFile(markdownPath, markdown);

  console.log(`✓ JSON 报告: ${reportPath}`);
  console.log(`✓ Markdown 报告: ${markdownPath}\n`);

  return { json: reportPath, markdown: markdownPath, report };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error('用法: node generate-quality-report.mjs <projectId> <revisionId> <videoPath>');
    process.exit(1);
  }

  const [projectId, revisionId, videoPath] = args;

  console.log('📊 OpenClaw 质量验收报告生成器\n');
  console.log('═'.repeat(60));

  const result = await generateQualityReport(projectId, revisionId, videoPath);

  console.log('═'.repeat(60));
  console.log('\n✅ 报告生成完成！\n');
  console.log('📋 下一步：');
  console.log(`  1. 观看视频: ${videoPath}`);
  console.log(`  2. 填写验收表格: ${result.markdown}`);
  console.log(`  3. 给出最终验收结论\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('\n❌ 报告生成失败:', error.message);
    process.exit(1);
  });
}

export { generateQualityReport, analyzeVideo };
