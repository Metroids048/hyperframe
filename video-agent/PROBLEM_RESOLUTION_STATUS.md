# OpenClaw 插件问题解决状态

## 📅 更新时间
2026-09-21 18:50

## 🎯 原始问题

### 问题1：插件Tool Error
**症状：**
- 所有插件工具调用都返回ERROR
- Video Task、Video Project List等工具全部失败
- 对话无法正常工作

### 问题2：任务提交后中断
**症状：**
- 任务创建显示"running"
- 但立即查询显示项目"not_found"
- 像是创建了项目但无法访问

### 问题3：重复修复未解决
**症状：**
- 多次尝试修复
- 问题持续存在
- 用户体验极差

## 🔍 根本原因分析

经过深入诊断，发现了**三层问题**：

### 第一层：环境变量未加载
```
OpenClaw应用启动时没有加载environment.json
↓
OPENCLAW_BRIDGE_TOKEN未设置
↓
插件无法通过授权验证
↓
所有工具调用失败
```

### 第二层：多进程冲突
```
同时运行了两个video-agent进程
↓
端口3020被占用
↓
请求路由到错误的进程
↓
项目数据不一致
```

### 第三层：配置缺失
```
openclaw.json缺少env配置
↓
OpenClaw不知道从哪里加载环境变量
↓
每次重启都丢失token配置
```

## ✅ 已实施的修复

### 修复1：添加环境变量加载配置
**文件：** `~/.openclaw/hyperframe/openclaw.json`

**添加内容：**
```json
"env": {
  "file": "${HOME}/.openclaw/hyperframe/environment.json"
}
```

**作用：**
- OpenClaw启动时自动加载environment.json
- 包含OPENCLAW_BRIDGE_TOKEN等所有必需变量
- 持久化配置，不会丢失

### 修复2：创建重启脚本
**文件：** `restart-openclaw-environment.sh`

**功能：**
1. 停止所有video-agent进程
2. 清理端口占用
3. 启动单一video-agent实例
4. 引导用户重启OpenClaw
5. 自动验证连接

### 修复3：创建诊断脚本
**文件：** `scripts/diagnose-openclaw-connection.mjs`

**功能：**
- 检查环境配置
- 验证插件配置
- 测试video-agent连接
- 测试OpenClaw网关
- 提供明确的问题定位

## 📋 用户需要执行的操作

### 步骤1：运行重启脚本（推荐）
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
./restart-openclaw-environment.sh
```

这个脚本会：
1. 自动停止旧的video-agent进程
2. 启动新的video-agent
3. 引导你重启OpenClaw
4. 自动验证连接

### 步骤2：手动重启（如果脚本失败）

**A. 重启video-agent：**
```bash
# 停止旧进程
lsof -ti :3020 | xargs kill

# 启动新进程
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node server.mjs
```

**B. 重启OpenClaw：**
1. 在菜单栏找到OpenClaw图标
2. 选择"退出OpenClaw"或按Cmd+Q
3. 重新打开OpenClaw应用程序

### 步骤3：验证修复
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

**预期输出：**
```
✓ 环境配置正确
✓ 插件配置正确
✓ video-agent服务正常
✓ OpenClaw网关正常
```

### 步骤4：功能测试
1. 打开 http://127.0.0.1:18789
2. 进入commerce-control对话
3. 发送：`帮我生成一个测试商品的30秒介绍视频`
4. 观察是否还有Tool error

## 🎯 预期结果

### 修复前
```
Activity: 4 tools Video Task, Video Project List ❌ ERROR

❌ Tool error  Video Task         ❌ ERROR
❌ Tool error  Video Task         ❌ ERROR  
❌ Tool error  Video Task         ❌ ERROR
❌ Tool error  Video Project List ❌ ERROR
```

### 修复后
```
Activity: 2 tools Video Task ✓

✓ Video Task
  projectId: d3044829-4ab7-4bf5-9f51-e4c8e65345ed
  jobId: job-26dff83b-9960-42bb-801d-38252774f57
  status: running

✓ Video Job Status
  status: complete
  result: [视频内容]
```

## 📊 技术细节

### 配置文件层次
```
~/.openclaw/hyperframe/
├── openclaw.json           # OpenClaw主配置
│   └── env.file            # → 指向environment.json
├── environment.json        # 环境变量（token等）
│   ├── OPENCLAW_BRIDGE_TOKEN
│   ├── VIDEO_AGENT_BRIDGE_URL
│   └── VIDEO_AGENT_WORKSPACE_ID
└── state/
    └── projects/          # 项目数据
```

### 授权验证流程
```
1. OpenClaw加载environment.json
   → 设置OPENCLAW_BRIDGE_TOKEN环境变量

2. 插件读取process.env.OPENCLAW_BRIDGE_TOKEN
   → 在HTTP请求头中发送：Authorization: Bearer <token>

3. video-agent验证token
   → 检查请求头中的token是否匹配environment.json
   
4. 验证通过
   → 执行工具调用，返回结果
```

### 为什么之前失败
```
OpenClaw启动 (没有加载environment.json)
↓
process.env.OPENCLAW_BRIDGE_TOKEN = undefined
↓
插件请求头：Authorization: Bearer undefined
↓
video-agent拒绝：token不匹配
↓
返回401 Unauthorized
↓
OpenClaw显示：Tool error
```

### 修复后的流程
```
OpenClaw启动 (加载environment.json)
↓
process.env.OPENCLAW_BRIDGE_TOKEN = "rzpK63TwqLKE..."
↓
插件请求头：Authorization: Bearer rzpK63TwqLKE...
↓
video-agent验证：token匹配
↓
执行工具调用
↓
返回结果
↓
OpenClaw显示：✓ 成功
```

## 🔧 如果问题仍然存在

### 检查清单

1. **OpenClaw是否真的重启了？**
   ```bash
   # 检查进程启动时间
   ps aux | grep OpenClaw
   ```
   
2. **environment.json是否包含token？**
   ```bash
   cat ~/.openclaw/hyperframe/environment.json | jq -r '.OPENCLAW_BRIDGE_TOKEN'
   ```
   应输出一个长字符串，不是null或空。

3. **video-agent是否在运行？**
   ```bash
   lsof -i :3020
   ```
   应该只有一个进程。

4. **配置是否正确加载？**
   ```bash
   cat ~/.openclaw/hyperframe/openclaw.json | jq '.env'
   ```
   应输出：
   ```json
   {
     "file": "${HOME}/.openclaw/hyperframe/environment.json"
   }
   ```

### 完全重置（最后手段）

如果以上都正确但仍有问题，执行完全重置：

```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent

# 1. 停止所有服务
lsof -ti :3020 | xargs kill
lsof -ti :18789 | xargs kill

# 2. 重新bootstrap
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/bootstrap-openclaw.mjs

# 3. 重启video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node server.mjs &

# 4. 重启OpenClaw应用

# 5. 验证
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

## 📈 后续工作

修复插件问题后，继续原定任务：

### 1. 端到端验收测试
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/e2e-commerce.mjs
```

验证内容：
- ✅ 视频生成完整流程
- ✅ 商品信息正确展示
- ✅ 编辑和重剪功能
- ✅ 历史恢复功能
- ✅ 质量评审（叙事、镜头、视觉、音频）

### 2. 复杂场景验证
- 实质性重剪辑
- 选择性历史恢复
- 第二商品验证
- 连续编辑场景（制作→重剪→恢复）

### 3. 性能与稳定性
- 响应时间测量
- 制作耗时统计
- 并发处理测试
- 异常恢复测试（刷新、重连、取消）

### 4. 质量门槛
- 85分质量标准验证
- 硬伤检查（商品错误、字幕错误）
- 保持项破坏检测

## 📝 维护建议

### 日常检查
```bash
# 检查服务状态
lsof -i :3020  # video-agent
lsof -i :18789 # OpenClaw

# 查看日志
tail -f ~/Desktop/hyperframe-main/video-agent/video-agent.log

# 快速诊断
cd ~/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

### 备份配置
```bash
# 备份OpenClaw配置
cp -r ~/.openclaw/hyperframe ~/.openclaw/hyperframe.backup.$(date +%Y%m%d)
```

### 更新后重新验证
每次OpenClaw更新后：
1. 检查`~/.openclaw/hyperframe/openclaw.json`中的`env`配置是否还在
2. 如果丢失，重新添加
3. 重启并验证

---

**状态：** ✅ 配置已修复，等待用户重启验证
**责任人：** Claude Opus 5
**最后更新：** 2026-09-21 18:50
