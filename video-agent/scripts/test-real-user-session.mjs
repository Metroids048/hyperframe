#!/usr/bin/env node

/**
 * 真实用户会话测试
 * 通过OpenClaw API模拟真实用户操作
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OPENCLAW_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN;
const GATEWAY_URL = 'http://127.0.0.1:18789';

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function createChatSession(agentId, message) {
  const url = `${GATEWAY_URL}/api/v1/chat`;

  log(`发起聊天请求: ${agentId} - "${message}"`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`
    },
    body: JSON.stringify({
      agent: agentId,
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  log(`会话创建成功: ${data.sessionId}`);

  return data;
}

async function pollSession(sessionId, maxAttempts = 60) {
  const url = `${GATEWAY_URL}/api/v1/sessions/${sessionId}`;

  log(`轮询会话状态: ${sessionId}`);

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${OPENCLAW_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const session = await response.json();

    log(`状态: ${session.status} (轮询 ${i + 1}/${maxAttempts})`);

    if (session.status === 'completed' || session.status === 'failed' || session.status === 'error') {
      return session;
    }

    // 等待2秒
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('会话超时');
}

async function extractErrors(sessionId) {
  // 读取会话trajectory
  const sessionsDir = join(homedir(), '.openclaw/hyperframe/state/agents/commerce-control/sessions');
  const trajectoryFile = join(sessionsDir, `${sessionId}.trajectory.jsonl`);

  log(`读取trajectory: ${trajectoryFile}`);

  try {
    const content = readFileSync(trajectoryFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    const errors = [];
    const toolAttempts = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line);

        if (event.type === 'tool.error') {
          errors.push({
            tool: event.data?.tool || 'unknown',
            error: event.data?.error || event.data?.message
          });
        }

        if (event.type === 'tool.use') {
          toolAttempts.push({
            tool: event.data?.tool || event.data?.name
          });
        }

        if (event.type === 'assistant.message' && event.data?.content) {
          const content = event.data.content;
          if (typeof content === 'string' &&
              (content.includes("isn't available") || content.includes("can't use the tool"))) {
            errors.push({
              type: 'unavailable_tool',
              message: content.substring(0, 200)
            });
          }
        }
      } catch (err) {
        // 忽略
      }
    }

    return { errors, toolAttempts };
  } catch (err) {
    log(`无法读取trajectory: ${err.message}`);
    return { errors: [], toolAttempts: [] };
  }
}

async function testScenario(agentId, userMessage, scenarioName) {
  log('');
  log('========================================');
  log(`测试场景: ${scenarioName}`);
  log('========================================');

  try {
    // 1. 创建会话
    const chatResponse = await createChatSession(agentId, userMessage);
    const sessionId = chatResponse.sessionId;

    // 2. 轮询完成
    const session = await pollSession(sessionId);

    log(`会话结束状态: ${session.status}`);

    // 3. 提取错误
    const { errors, toolAttempts } = await extractErrors(sessionId);

    log(`工具调用次数: ${toolAttempts.length}`);
    log(`错误次数: ${errors.length}`);

    if (errors.length > 0) {
      log('');
      log('❌ 发现错误:');
      for (const error of errors) {
        if (error.type === 'unavailable_tool') {
          log(`  - 不可用工具: ${error.message}`);
        } else {
          log(`  - ${error.tool}: ${error.error}`);
        }
      }
    }

    if (toolAttempts.length > 0) {
      log('');
      log('工具调用:');
      const toolCounts = {};
      for (const attempt of toolAttempts) {
        toolCounts[attempt.tool] = (toolCounts[attempt.tool] || 0) + 1;
      }
      for (const [tool, count] of Object.entries(toolCounts)) {
        log(`  - ${tool}: ${count}次`);
      }
    }

    return {
      success: errors.length === 0,
      errors,
      toolAttempts,
      sessionId
    };

  } catch (err) {
    log(`❌ 测试失败: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
}

async function main() {
  if (!OPENCLAW_TOKEN) {
    console.error('错误: 未设置 OPENCLAW_GATEWAY_TOKEN');
    process.exit(1);
  }

  log('开始真实用户会话测试');
  log(`Gateway: ${GATEWAY_URL}`);

  // 测试场景1: 视频项目列表
  const result1 = await testScenario(
    'commerce-control',
    'Video Project List',
    '视频项目列表'
  );

  // 等待3秒
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 测试场景2: 产品发布视频
  const result2 = await testScenario(
    'commerce-control',
    '为蛋白粉创建产品发布视频',
    '产品发布视频'
  );

  // 汇总结果
  log('');
  log('========================================');
  log('测试汇总');
  log('========================================');
  log(`场景1 (视频项目列表): ${result1.success ? '✅ 通过' : '❌ 失败'}`);
  log(`场景2 (产品发布视频): ${result2.success ? '✅ 通过' : '❌ 失败'}`);

  if (!result1.success || !result2.success) {
    log('');
    log('⚠️  测试发现问题，请检查错误详情');
    process.exit(1);
  }

  log('');
  log('✅ 所有测试通过');
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
