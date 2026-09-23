#!/usr/bin/env node
/**
 * 通过OpenClaw Gateway直接创建对话任务
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// OpenClaw配置
const OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789/v1/responses';
const OPENCLAW_TOKEN = process.env.OPENCLAW_CONTROL_TOKEN;
const CONTROL_MODEL = 'openclaw/commerce-control';
const WORKSPACE_ID = process.env.VIDEO_AGENT_WORKSPACE_ID;

const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `openclaw-${Date.now()}`);
await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('OpenClaw 对话任务创建');
console.log('Gateway:', OPENCLAW_GATEWAY_URL);
console.log('Model:', CONTROL_MODEL);
console.log('====================================\n');

// 用户消息
const userMessage = "帮我做一个蓝牙降噪耳机的产品上新视频,30秒,竖屏,小红书风格。重点展示主动降噪技术、30小时续航、舒适佩戴和蓝牙5.3连接。最后要有购买引导:立即购买,限时优惠¥299。";

const projectId = randomUUID();
const messageId = `msg-${Date.now()}`;
const sessionKey = `agent:commerce-control:commerce-control:${projectId}`;

// 构建OpenClaw请求
const payload = {
  projectId: null,
  baseRevisionId: null,
  messageId,
  operationId: `op-${Date.now()}`,
  authorizationId: null,
  message: userMessage,
  attachmentIds: [],
  attachmentPaths: [],
  taskMode: null,
  scenarioId: null,
  workflowProfile: null,
  selectedNodeId: null,
  platform: "xiaohongshu",
  output: { durationSeconds: 30, width: 1080, height: 1920 },
  audio: null,
  readOnly: false,
  language: 'zh-CN'
};

const controlRequest = {
  model: CONTROL_MODEL,
  input: [{
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: JSON.stringify(payload) }]
  }],
  instructions: `Parse the JSON payload and handle video editing requests. IMPORTANT: Always reply in Chinese (简体中文).

WORKFLOW:
1. Call video_prepare (projectId may be null)
2. Call video_resource_search and video_web_research if needed
3. Call video_task with complete payload

CRITICAL: Copy ALL payload fields EXACTLY when calling video_task.`,
  tools: [{
    type: 'function',
    name: 'return_control_result',
    description: 'Return the outcome',
    parameters: {
      type: 'object',
      required: ['status', 'tool', 'operationId', 'summary'],
      properties: {
        status: { type: 'string', enum: ['prepared', 'queued', 'read_only', 'needs_input', 'blocked'] },
        tool: { type: 'string' },
        operationId: { type: 'string' },
        jobId: { type: 'string' },
        summary: { type: 'string' }
      }
    }
  }],
  tool_choice: { type: 'function', name: 'return_control_result' },
  user: sessionKey,
  stream: false
};

console.log('1️⃣ 发送OpenClaw控制请求...');
console.log('用户消息:', userMessage);

const response = await fetch(OPENCLAW_GATEWAY_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(controlRequest)
});

if (!response.ok) {
  console.error('❌ OpenClaw请求失败');
  console.error('Status:', response.status);
  console.error('Response:', await response.text());
  process.exit(1);
}

const result = await response.json();
await fs.writeFile(
  path.join(OUTPUT_DIR, 'control-response.json'),
  JSON.stringify(result, null, 2)
);

console.log('✅ OpenClaw响应:', JSON.stringify(result, null, 2));

// 解析结果
const controlOutput = result.output?.find(o => o.type === 'function_call' && o.name === 'return_control_result');
if (!controlOutput) {
  console.error('❌ 未找到控制结果');
  process.exit(1);
}

const controlResult = JSON.parse(controlOutput.arguments);
console.log('\n2️⃣ 任务状态:', controlResult.status);
console.log('   Summary:', controlResult.summary);
console.log('   Job ID:', controlResult.jobId);
console.log('   Operation ID:', controlResult.operationId);

// 保存会话信息
const sessionInfo = {
  testId: path.basename(OUTPUT_DIR),
  projectId: controlResult.projectId || projectId,
  jobId: controlResult.jobId,
  operationId: controlResult.operationId,
  messageId,
  userMessage,
  createdAt: new Date().toISOString(),
  conversationUrl: `http://localhost:3024/?project=${controlResult.projectId || projectId}`,
  gatewayUrl: OPENCLAW_GATEWAY_URL,
  sessionKey
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'SESSION-INFO.json'),
  JSON.stringify(sessionInfo, null, 2)
);

console.log('\n====================================');
console.log('✅ OpenClaw对话已创建!');
console.log('====================================');
console.log('\n📍 对话链接:');
console.log(`   ${sessionInfo.conversationUrl}`);
console.log('\n📁 会话信息:');
console.log(`   ${path.join(OUTPUT_DIR, 'SESSION-INFO.json')}`);
console.log('\n💡 等任务完成后,成品视频会在:');
console.log(`   ~/.openclaw/hyperframe/state/projects/${controlResult.projectId || projectId}/`);
console.log('');
