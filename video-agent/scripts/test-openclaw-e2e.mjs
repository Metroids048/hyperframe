#!/usr/bin/env node
/**
 * OpenClaw E2E测试 - 通过API模拟真实用户操作
 * 验证所有Skills在真实环境下不会触发Tool error
 */

import http from 'node:http';
import { promisify } from 'node:util';

const OPENCLAW_URL = 'http://127.0.0.1:18789';
const AGENT_ID = 'commerce-control';

// 测试场景
const TEST_SCENARIOS = [
  {
    id: 'scenario-1',
    name: '获取项目列表',
    prompt: 'Video Project List',
    expectedTools: ['video_project_list'],
    timeout: 30000
  },
  {
    id: 'scenario-2',
    name: '获取项目信息',
    prompt: 'Show me the current project details',
    expectedTools: ['video_project_open'],
    timeout: 30000
  }
];

/**
 * 发送HTTP请求到OpenClaw
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, OPENCLAW_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * 创建新会话
 */
async function createSession() {
  const response = await request('POST', '/api/sessions', {
    agentId: AGENT_ID
  });
  return response.sessionId;
}

/**
 * 发送消息并等待完成
 */
async function sendMessage(sessionId, prompt) {
  // 发送消息
  await request('POST', `/api/sessions/${sessionId}/messages`, {
    content: prompt
  });

  // 轮询直到完成
  let attempts = 0;
  const maxAttempts = 60; // 最多等待60秒

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    const status = await request('GET', `/api/sessions/${sessionId}/status`);

    if (status.state === 'idle') {
      // 获取完整的消息历史
      const messages = await request('GET', `/api/sessions/${sessionId}/messages`);
      return messages;
    }

    if (status.state === 'error') {
      throw new Error('会话进入错误状态');
    }

    attempts++;
  }

  throw new Error('等待响应超时');
}

/**
 * 分析消息中的工具调用和错误
 */
function analyzeMessages(messages) {
  const analysis = {
    toolCalls: [],
    toolErrors: [],
    hasUnauthorizedTools: false,
    hasToolAvailabilityError: false,
    success: true
  };

  for (const msg of messages) {
    // 检查工具调用
    if (msg.toolCalls) {
      analysis.toolCalls.push(...msg.toolCalls.map(tc => tc.name));
    }

    // 检查工具错误
    if (msg.toolResults) {
      for (const result of msg.toolResults) {
        if (result.isError || result.content?.includes('ERROR')) {
          analysis.toolErrors.push({
            tool: result.toolName,
            error: result.content
          });
          analysis.success = false;
        }
      }
    }

    // 检查消息内容中的错误
    if (msg.role === 'assistant' && msg.content) {
      const content = msg.content.toLowerCase();
      if (content.includes("tool") && content.includes("isn't available")) {
        analysis.hasToolAvailabilityError = true;
        analysis.success = false;
      }
      if (content.includes("read") && content.includes("not available")) {
        analysis.hasUnauthorizedTools = true;
        analysis.success = false;
      }
    }
  }

  return analysis;
}

/**
 * 运行单个测试场景
 */
async function runScenario(scenario) {
  console.log(`\n📝 测试场景: ${scenario.name}`);
  console.log(`   提示语: "${scenario.prompt}"`);

  try {
    // 创建会话
    const sessionId = await createSession();
    console.log(`   ✅ 会话已创建: ${sessionId}`);

    // 发送消息
    const messages = await sendMessage(sessionId, scenario.prompt);
    console.log(`   ✅ 收到响应 (${messages.length}条消息)`);

    // 分析结果
    const analysis = analyzeMessages(messages);

    console.log(`   📊 工具调用: ${analysis.toolCalls.join(', ') || '无'}`);

    if (analysis.toolErrors.length > 0) {
      console.log(`   ❌ 工具错误:`);
      for (const err of analysis.toolErrors) {
        console.log(`      - ${err.tool}: ${err.error}`);
      }
    }

    if (analysis.hasToolAvailabilityError) {
      console.log(`   ❌ 发现 "tool isn't available" 错误`);
    }

    if (analysis.hasUnauthorizedTools) {
      console.log(`   ❌ 尝试调用未授权工具 (如Read)`);
    }

    if (analysis.success) {
      console.log(`   ✅ 测试通过 - 无工具错误`);
      return { success: true, scenario: scenario.name };
    } else {
      console.log(`   ❌ 测试失败`);
      return { success: false, scenario: scenario.name, analysis };
    }

  } catch (error) {
    console.log(`   ❌ 测试异常: ${error.message}`);
    return { success: false, scenario: scenario.name, error: error.message };
  }
}

/**
 * 主测试流程
 */
async function main() {
  console.log('========================================');
  console.log('OpenClaw E2E真实环境测试');
  console.log('========================================');

  // 1. 健康检查
  console.log('\n1️⃣ 检查OpenClaw服务...');
  try {
    const health = await request('GET', '/health');
    if (health.ok) {
      console.log('✅ OpenClaw服务正常');
    } else {
      throw new Error('服务不健康');
    }
  } catch (err) {
    console.error('❌ OpenClaw服务不可用:', err.message);
    process.exit(1);
  }

  // 2. 运行测试场景
  console.log('\n2️⃣ 运行测试场景...');
  const results = [];

  for (const scenario of TEST_SCENARIOS) {
    const result = await runScenario(scenario);
    results.push(result);

    // 场景间稍作等待
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 3. 汇总结果
  console.log('\n========================================');
  console.log('测试结果汇总');
  console.log('========================================');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n总计: ${results.length} | 通过: ${passed} | 失败: ${failed}\n`);

  if (failed === 0) {
    console.log('🎉 所有测试通过！');
    console.log('✅ 无Tool error');
    console.log('✅ 无未授权工具调用');
    console.log('✅ Agent正常完成任务');
  } else {
    console.log('❌ 存在失败的测试:');
    for (const result of results.filter(r => !r.success)) {
      console.log(`   - ${result.scenario}`);
      if (result.error) {
        console.log(`     错误: ${result.error}`);
      }
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
