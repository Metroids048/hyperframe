# OpenClaw Gateway 重启指南

## 问题总结

OpenClaw Gateway 迁移后遇到的问题：

1. ✅ **配置文件缺少 `plugins.bundledDiscovery`** - 已修复
2. ⚠️ **"unknown parent session: agent:commerce-control:main"** - 这是 OpenClaw Gateway 的 session 管理问题
3. ✅ **启动命令错误** - 必须使用 `openclaw gateway` 而不是裸命令

## 当前状态

- ✅ Gateway 成功启动 (PID: 75763)
- ✅ 端口 18789 正常监听
- ✅ WebUI 可以访问
- ✅ Backend 健康运行 (端口 3020)
- ✅ 配置文件已修复 (`plugins.bundledDiscovery: "compat"`)

## 启动脚本

已创建自动启动脚本：

```bash
/Users/a1234/Desktop/hyperframe-main/video-agent/scripts/start-openclaw-gateway.sh
```

## 手动启动步骤

如果启动脚本不工作，使用以下命令：

```bash
cd ~/.openclaw/hyperframe

# 1. 加载环境变量
source <(cat environment.json | /Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e "
const env = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
for (const [key, value] of Object.entries(env)) {
  console.log('export ' + key + '=\"' + value + '\"');
}
")

# 2. 启动 Gateway
/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  /Users/a1234/.local/share/hyperframe-openclaw/2026.6.11/node_modules/.pnpm/openclaw@2026.6.11/node_modules/openclaw/openclaw.mjs \
  gateway > gateway.log 2>&1 &

# 3. 保存 PID
echo $! > gateway.pid
```

## "unknown parent session" 问题

这是 OpenClaw Gateway 的已知限制：

- **原因**: Gateway 不会自动创建名为 "main" 的 session
- **解决方案**: 
  1. 使用 "新会话" 按钮创建会话
  2. 或使用 URL: `http://127.0.0.1:18789/chat?agent=commerce-control&session=dashboard`

## WebUI 访问地址

- **主界面**: http://127.0.0.1:18789/
- **对话页面**: http://127.0.0.1:18789/chat?agent=commerce-control&session=dashboard
- **新会话**: 在 WebUI 中点击"新会话"按钮

## 验证 Gateway 状态

```bash
# 检查进程
ps aux | grep openclaw.mjs | grep -v grep

# 检查端口
lsof -i :18789

# 查看日志
tail -50 /tmp/openclaw/openclaw-2026-09-22.log
tail -50 ~/.openclaw/hyperframe/gateway.log
```

## 停止 Gateway

```bash
# 方法 1: 使用 PID 文件
kill $(cat ~/.openclaw/hyperframe/gateway.pid)

# 方法 2: 强制停止所有
ps aux | grep openclaw.mjs | grep -v grep | awk '{print $2}' | xargs kill -9
```

## 配置文件位置

- **主配置**: `~/.openclaw/hyperframe/openclaw.json`
- **环境变量**: `~/.openclaw/hyperframe/environment.json`
- **Workspace**: `~/.openclaw/hyperframe/workspace/`
- **State**: `~/.openclaw/hyperframe/state/`

## 关键配置修复

已在 `openclaw.json` 中添加：

```json
{
  "plugins": {
    "enabled": true,
    "bundledDiscovery": "compat",  // ← 这一行是新添加的
    "allow": [
      "commerce-engine",
      "memory-core"
    ],
    ...
  }
}
```

这修复了 `openclaw doctor --fix` 提示的 legacy config 问题。
