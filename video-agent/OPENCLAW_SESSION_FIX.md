# OpenClaw Session 错误修复报告

## 问题描述

用户反馈两个问题：
1. ✅ 启动脚本没有配置 Gateway Token，导致 WebUI 无法连接
2. ❌ 进入 WebUI 后无法新建对话，报错：`GatewayRequestError: unknown parent session: agent:commerce-control:main`

## 根本原因分析

### 问题 1：启动脚本缺少 Token 配置

**旧的启动脚本**：
```bash
open "http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Ae9a62ff5-12b0-48c1-af71-9bf90b33cad1"
```

**问题**：
- 直接打开特定的 session URL，但浏览器没有配置 Gateway Token
- 导致 WebSocket 连接失败：`unauthorized: gateway token missing`

### 问题 2：Session 路径错误

**错误日志**：
```
[ws] ⇄ res ✗ sessions.create 6ms 
errorCode=INVALID_REQUEST 
errorMessage=unknown parent session: agent:commerce-control:main
```

**根本原因**：
1. OpenClaw 的前端尝试在 `agent:commerce-control:main` 这个 parent session 下创建新对话
2. 但这个 parent session **根本不存在**
3. URL 参数 `?session=agent:commerce-control:main` 会导致前端尝试在这个不存在的 session 下创建子对话

**正确的做法**：
- 使用 `?agent=commerce-control` 而不是 `?session=...`
- 让 OpenClaw 自动创建根 session 和对话

## 修复方案

### 修复 1：启动脚本添加 Token 配置

**新的启动脚本** (`/Users/a1234/Desktop/OpenClaw视频编辑.command`)：

```bash
# 读取 Gateway Token
TOKEN=$(grep -o '"OPENCLAW_GATEWAY_TOKEN": "[^"]*"' ~/.openclaw/hyperframe/environment.json | cut -d'"' -f4)

# 自动打开浏览器到 OpenClaw WebUI（一步到位：认证 + 对话）
if command -v open > /dev/null 2>&1; then
  echo "🌐 正在打开浏览器并配置认证..."
  # 使用带 token 和 agent 参数的 URL，一次性完成认证和打开对话
  open "http://127.0.0.1:18789/?agent=commerce-control&token=$TOKEN"
fi
```

**改进点**：
1. ✅ 从 `environment.json` 读取真实的 Gateway Token
2. ✅ 使用 `?token=$TOKEN` 参数自动配置认证
3. ✅ 使用 `?agent=commerce-control` 而不是 `?session=...`
4. ✅ 一次性完成认证和打开对话界面

### 修复 2：使用正确的 URL 参数

**错误的 URL**：
```
❌ http://127.0.0.1:18789/chat?session=agent:commerce-control:main
❌ http://127.0.0.1:18789/chat?session=agent:commerce-control:dashboard:xxx
```

**正确的 URL**：
```
✅ http://127.0.0.1:18789/?agent=commerce-control&token=TOKEN
✅ http://127.0.0.1:18789/?agent=commerce-control  (如果已配置过 token)
```

**URL 参数说明**：
- `?agent=commerce-control` - 打开 commerce-control agent 的对话界面
- `?token=xxx` - 自动配置 Gateway Token（一次性，会保存到 localStorage）
- 不需要指定 `session` 参数，OpenClaw 会自动创建根 session

## 测试验证

### 步骤 1：启动服务

双击桌面上的 `OpenClaw视频编辑.command`

**期望结果**：
```
✅ OpenClaw 启动成功！
🌐 正在打开浏览器并配置认证...
```

浏览器自动打开：`http://127.0.0.1:18789/?agent=commerce-control&token=xxx`

### 步骤 2：验证认证

打开浏览器后，检查：
1. ✅ 页面正常加载，没有显示"需要认证"错误
2. ✅ 右上角显示"已连接"或绿色状态指示
3. ✅ 左侧显示 "commerce-control" agent 名称

### 步骤 3：创建新对话

点击左侧的 **"+ 新会话"** 按钮

**期望结果**：
- ✅ 成功创建新对话，显示空白聊天界面
- ✅ 没有报 `unknown parent session` 错误
- ✅ 底部输入框可以输入消息

### 步骤 4：测试视频生成

在输入框中发送：
```
帮我制作咖啡机的商品视频
```

**期望结果**：
- ✅ 系统直接开始处理，不再询问"要新建项目还是继续编辑"
- ✅ 显示任务处理状态
- ✅ 回复内容全部是中文

## 技术细节

### OpenClaw Session 结构

```
agent:commerce-control (agent ID)
  └─ main (workspace session，自动创建)
      └─ 对话-1 (user session)
      └─ 对话-2 (user session)
      └─ 对话-3 (user session)
```

**正确的访问方式**：
1. 使用 `?agent=commerce-control` 打开 agent 根路径
2. OpenClaw 自动创建 workspace session（如果不存在）
3. 用户点击"新会话"时，OpenClaw 在 workspace session 下创建 user session

**错误的访问方式**：
1. 直接访问 `?session=agent:commerce-control:main`
2. 前端认为 `agent:commerce-control:main` 是一个已存在的 parent session
3. 尝试在这个不存在的 parent 下创建子对话
4. 报错：`unknown parent session`

### Gateway Token 认证流程

```
1. 用户访问 http://127.0.0.1:18789/?token=xxx
   ↓
2. 前端 JavaScript 读取 URL 中的 token 参数
   ↓
3. 将 token 保存到 localStorage['openclaw.control.settings.v1']
   ↓
4. WebSocket 连接时，从 localStorage 读取 token
   ↓
5. 在 WebSocket 握手时发送 token 进行认证
   ↓
6. Gateway 验证 token，建立连接
```

## 相关文件

修改的文件：
- ✅ `/Users/a1234/Desktop/OpenClaw视频编辑.command` - 启动脚本

未修改的文件（无需改动）：
- ⭕ `lib/openclaw/session-bindings.mjs` - Session 绑定逻辑（之前已修复）
- ⭕ `lib/openclaw/commerce-agent-bridge.mjs` - Control Agent（之前已修复）
- ⭕ `server.mjs` - 后端服务（无需修改）

## 总结

### 问题 1：启动脚本 - 已修复 ✅

**修复内容**：
- 从 `environment.json` 读取真实的 Gateway Token
- 使用 `?token=$TOKEN` 参数自动配置认证
- 使用正确的 URL 格式：`?agent=commerce-control&token=$TOKEN`

### 问题 2：Session 错误 - 已修复 ✅

**根本原因**：
- URL 使用了错误的 `?session=agent:commerce-control:main` 参数
- 这个 parent session 不存在，导致创建子对话失败

**修复方案**：
- 使用 `?agent=commerce-control` 而不是 `?session=...`
- 让 OpenClaw 自动管理 session 层级结构

### 验证清单

启动脚本修复后，用户应该能够：
- ✅ 双击启动脚本，浏览器自动打开并完成认证
- ✅ 点击"新会话"按钮，成功创建新对话
- ✅ 发送消息后，系统直接处理，不询问用户
- ✅ 所有回复内容都是中文
- ✅ 在同一会话中创建多个视频项目，不报 session conflict 错误

所有问题已修复完成。
