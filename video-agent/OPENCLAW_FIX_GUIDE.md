# OpenClaw 插件错误修复指南

## 🔍 问题诊断

已完成以下诊断和修复：

### ✅ 已修复的配置问题

1. **插件配置** - commerce-engine插件已正确配置在`~/.openclaw/hyperframe/openclaw.json`
2. **环境变量文件** - `~/.openclaw/hyperframe/environment.json`包含所有必需的token
3. **video-agent服务** - 运行正常，端点响应正确
4. **环境变量加载** - OpenClaw配置已更新，添加了`env.file`配置项

### 🔧 最新修复（刚完成）

在`~/.openclaw/hyperframe/openclaw.json`中添加了环境变量加载配置：

```json
"env": {
  "file": "${HOME}/.openclaw/hyperframe/environment.json"
}
```

这确保OpenClaw启动时加载包含`OPENCLAW_BRIDGE_TOKEN`的环境变量文件。

## 📋 立即执行的步骤

### 步骤1：重启OpenClaw应用

**关键步骤 - 必须执行！**

1. 完全退出OpenClaw应用程序
   - 在菜单栏点击OpenClaw图标
   - 选择"退出OpenClaw"或按Cmd+Q
   - 确保应用完全关闭

2. 重新启动OpenClaw应用程序
   - 从应用程序文件夹或Dock重新打开OpenClaw
   - 等待应用完全启动（看到主窗口）

### 步骤2：验证配置加载

打开终端，运行验证脚本：

```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

**预期结果：**
```
✓ 环境配置正确
✓ 插件配置正确  
✓ video-agent服务正常
✓ OpenClaw网关正常
```

### 步骤3：测试插件功能

1. 在浏览器打开：http://127.0.0.1:18789

2. 进入`commerce-control`对话

3. 发送测试消息：
   ```
   帮我生成一个测试商品的30秒介绍视频
   ```

4. 检查是否还有"Tool error"
   - 如果没有错误，插件工作正常 ✅
   - 如果仍有错误，查看错误信息并联系我

## 🐛 如果仍有问题

### 问题A：插件仍然报"Tool error"

**可能原因：**
- OpenClaw没有重启
- video-agent服务未运行

**解决方案：**
```bash
# 1. 检查video-agent是否运行
lsof -i :3020

# 如果没有进程，启动video-agent
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node server.mjs

# 2. 确保OpenClaw完全重启
```

### 问题B：任务创建后项目消失

**症状：**
- 任务显示"running"
- 但`video_project_open`返回"not_found"

**解决方案：**
这通常是因为：
1. video-agent服务崩溃或重启
2. 项目目录权限问题

检查video-agent日志：
```bash
tail -f /Users/a1234/.openclaw/hyperframe/state/projects/*/job-*.log
```

### 问题C：授权失败

**错误信息：**
```
OpenClaw bridge authorization required
```

**解决方案：**
这是本次修复的核心问题。如果仍出现，说明：
1. OpenClaw没有重启（**最可能**）
2. environment.json损坏

验证token：
```bash
cat ~/.openclaw/hyperframe/environment.json | jq -r '.OPENCLAW_BRIDGE_TOKEN'
```

应该输出一个非空字符串。如果为空或null，重新生成：
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/bootstrap-openclaw.mjs
```

## 📊 诊断命令速查

```bash
# 检查video-agent服务
lsof -i :3020

# 检查OpenClaw网关
lsof -i :18789

# 查看环境变量
cat ~/.openclaw/hyperframe/environment.json | jq .

# 查看插件配置
cat ~/.openclaw/hyperframe/openclaw.json | jq '.plugins.entries["commerce-engine"]'

# 完整诊断
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs
```

## ✅ 成功标志

当一切正常时，你会看到：

1. **在OpenClaw对话中：**
   - 没有"Tool error"红色标签
   - 任务成功创建并显示projectId
   - 可以查询项目状态和结果

2. **在诊断脚本中：**
   ```
   ✓ 环境配置正确
   ✓ 插件配置正确
   ✓ video-agent服务正常
   ✓ OpenClaw网关正常
   ```

3. **在video-agent日志中：**
   - 看到"OpenClaw tool call: video_task"
   - 看到项目创建日志
   - 看到任务排队和执行日志

## 🎯 下一步：端到端验收测试

当插件工作正常后，执行完整的验收测试：

```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/e2e-commerce.mjs
```

这将验证：
- 视频生成完整流程
- 编辑和重剪功能
- 历史恢复功能
- 质量评审标准

---

**最后更新：** 2026-09-21 18:45
**状态：** 配置已修复，等待重启验证
