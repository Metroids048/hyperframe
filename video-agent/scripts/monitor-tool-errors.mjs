#!/usr/bin/env node

/**
 * OpenClaw Tool Error 实时监控
 * 监控所有会话的tool调用，实时捕获错误
 */

import { watchFile, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SESSIONS_DIR = join(homedir(), '.openclaw/hyperframe/state/agents/commerce-control/sessions');
const MONITOR_LOG = '/tmp/tool-error-monitor.log';

function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  console.log(logLine);
}

function extractToolErrors(line) {
  try {
    const event = JSON.parse(line);

    // 检测 tool.error
    if (event.type === 'tool.error') {
      return {
        type: 'tool_error',
        tool: event.data?.tool || 'unknown',
        error: event.data?.error || event.data?.message || 'unknown error',
        timestamp: event.ts
      };
    }

    // 检测 tool.use (尝试调用工具)
    if (event.type === 'tool.use') {
      return {
        type: 'tool_attempt',
        tool: event.data?.tool || event.data?.name || 'unknown',
        timestamp: event.ts
      };
    }

    // 检测 assistant message 中的错误
    if (event.type === 'assistant.message' && event.data?.content) {
      const content = event.data.content;
      if (typeof content === 'string') {
        if (content.includes("isn't available") || content.includes("can't use the tool")) {
          return {
            type: 'unavailable_tool_message',
            content: content.substring(0, 200),
            timestamp: event.ts
          };
        }
      }
    }

  } catch (err) {
    // 忽略JSON解析错误
  }

  return null;
}

function monitorSession(sessionFile) {
  log(`📊 开始监控会话: ${sessionFile}`);

  let lastSize = 0;

  watchFile(sessionFile, { interval: 500 }, (curr, prev) => {
    if (curr.size > lastSize) {
      const content = readFileSync(sessionFile, 'utf8');
      const lines = content.split('\n');

      // 只处理新增的行
      const newLines = lines.slice(Math.floor(lastSize / 100));

      for (const line of newLines) {
        if (!line.trim()) continue;

        const error = extractToolErrors(line);
        if (error) {
          if (error.type === 'tool_error') {
            log(`❌ Tool Error: ${error.tool} - ${error.error}`);
          } else if (error.type === 'tool_attempt') {
            log(`🔧 Tool Attempt: ${error.tool}`);
          } else if (error.type === 'unavailable_tool_message') {
            log(`⚠️  Unavailable Tool Message: ${error.content}`);
          }
        }
      }

      lastSize = curr.size;
    }
  });
}

async function main() {
  log('========================================');
  log('OpenClaw Tool Error 实时监控');
  log('========================================');
  log(`会话目录: ${SESSIONS_DIR}`);
  log('监控中... (Ctrl+C 停止)');
  log('');

  // 监控现有会话
  const { readdirSync } = await import('fs');
  const sessions = readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.trajectory.jsonl'))
    .map(f => join(SESSIONS_DIR, f));

  if (sessions.length === 0) {
    log('⚠️  未找到活跃会话');
  }

  for (const sessionFile of sessions) {
    monitorSession(sessionFile);
  }

  // 保持运行
  process.on('SIGINT', () => {
    log('\n监控已停止');
    process.exit(0);
  });
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
