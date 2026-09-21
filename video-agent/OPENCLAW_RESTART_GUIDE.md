# OpenClaw服务重启指南

## 当前状态

### 运行中的进程
- **OpenClaw服务**: PID 7391 (启动时间: 9:28AM)
- **video-agent服务器**: PID 5831 (启动时间: 9:25AM)

### 问题
OpenClaw服务启动于Skills文件修复**之前**，因此：
- ❌ 仍在使用旧版本的Skills（包含误导性指令）
- ❌ Agent会尝试调用Read/search等未授权工具
- ❌ 导致连续14次Tool Error

---

## 重启步骤

### 步骤1：停止OpenClaw服务

```bash
# 方法1：优雅停止（推荐）
kill 7391

# 方法2：如果方法1无效，强制停止
kill -9 7391

# 验证已停止
ps aux | grep openclaw | grep -v grep
# 应该没有输出
```

### 步骤2：重启OpenClaw服务

**选项A：如果有启动脚本**
```bash
# 查找启动脚本
ls -la ~/bin/*openclaw* ~/.local/bin/*openclaw* /usr/local/bin/*openclaw* 2>/dev/null

# 运行启动脚本（根据实际位置）
openclaw start
# 或
~/bin/openclaw-start.sh
```

**选项B：手动启动**
```bash
# 进入OpenClaw配置目录
cd ~/.openclaw/hyperframe

# 启动服务
openclaw &

# 或指定配置文件
openclaw --config openclaw.json &
```

### 步骤3：验证服务已重启

```bash
# 检查进程
ps aux | grep openclaw | grep -v grep

# 应该看到新的PID和启动时间（应该是当前时间）
# 例如：
# a1234  12345  0.0  1.0  ...  10:30AM  0:00.01 openclaw
```

### 步骤4：测试Skills是否生效

**测试1：检查日志**
```bash
# 查看OpenClaw日志（如果有）
tail -f ~/.openclaw/logs/openclaw.log

# 或系统日志
tail -f /var/log/openclaw.log
```

**测试2：新建对话测试**
1. 打开OpenClaw Control界面：http://127.0.0.1:18789
2. 点击"新会话"
3. 输入简单任务："给这个视频换个背景音乐"
4. 观察工具调用：
   - ✅ 应该只看到：video_project_list, video_task等
   - ❌ 不应该看到：Read, search, validate等

---

## 如果找不到OpenClaw命令

### 检查安装位置
```bash
# 方法1：查找可执行文件
find /usr/local -name openclaw 2>/dev/null
find ~/bin -name openclaw 2>/dev/null
find ~/.local -name openclaw 2>/dev/null

# 方法2：检查是否通过npm安装
npm list -g | grep openclaw

# 方法3：检查环境变量
echo $PATH | tr ':' '\n' | xargs -I {} ls {}/openclaw 2>/dev/null
```

### 如果是通过npm安装
```bash
# 全局安装
npm install -g openclaw

# 启动
openclaw &
```

### 如果是从源码运行
```bash
cd /path/to/openclaw/source
npm start &
```

---

## 验证修复是否生效

### 方法1：使用验证脚本

**如果node命令可用：**
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
node scripts/verify-openclaw-ready.mjs
```

**如果找不到node，找到正确的路径：**
```bash
# video-agent服务器使用的node路径
/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/verify-openclaw-ready.mjs
```

### 方法2：手动检查Skills文件

```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent/runtime/openclaw/skills

# 检查一个Skills文件的Tool order章节
grep -A 10 "## Tool order" commerce-product-launch/SKILL.md

# 正确格式应该是：
# 1. Call `video_project_open` to read...
# 2. Call `video_task` with...
# 3. Call `video_job_status` to poll...

# 错误格式（旧版本）：
# Read project; search relevant resources; validate scope...
```

### 方法3：真实场景测试

在OpenClaw Control界面测试以下场景：

#### 测试场景1：上传新视频
1. 上传一个mp4文件
2. 输入："给这个视频换个蛋白粉包装"
3. **预期**：
   - ✅ 自动创建新工程
   - ✅ 提交video_task
   - ✅ 返回jobId
   - ❌ 无Tool Error

#### 测试场景2：编辑现有工程
1. 选择一个现有工程
2. 输入："把标题改成'新品上市'"
3. **预期**：
   - ✅ video_project_open成功
   - ✅ video_task提交成功
   - ✅ 返回jobId
   - ❌ 无Tool Error

#### 测试场景3：无工程无附件
1. 新会话，不上传文件
2. 输入："创建一个产品视频"
3. **预期**：
   - ✅ 返回："请先上传视频文件，或选择现有工程"
   - ✅ 列出可用工程（如果有）
   - ❌ 无Tool Error

---

## 如果重启后仍然报错

### 检查清单

1. **确认OpenClaw服务已真正重启**
   ```bash
   ps aux | grep openclaw | grep -v grep
   # 确认启动时间是当前时间，不是9:28AM
   ```

2. **确认Skills文件路径正确**
   ```bash
   # OpenClaw配置中的workspace路径
   cat ~/.openclaw/hyperframe/openclaw.json | grep workspace
   
   # 应该指向
   # ${VIDEO_AGENT_OPENCLAW_WORKSPACE}
   # 或绝对路径：/Users/a1234/Desktop/hyperframe-main/video-agent/runtime/openclaw
   ```

3. **确认video-agent服务器也重启了**
   ```bash
   # 如果commerce-engine-facade.mjs被修改，需要重启服务器
   kill 5831
   cd /Users/a1234/Desktop/hyperframe-main/video-agent
   /Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs &
   ```

4. **检查是否有缓存问题**
   ```bash
   # 清除可能的缓存
   rm -rf ~/.openclaw/cache/*
   rm -rf /tmp/openclaw-*
   ```

---

## 重启后的预期行为

### ✅ 正确行为
- Agent只调用授权的6个video_*工具
- 上传视频后自动创建工程
- 明确的错误提示（REVISION_CONFLICT等）
- 任务正常完成，无中途中断

### ❌ 如果还有这些问题
- 仍然尝试调用Read工具 → Skills未重新加载
- "媒体对象不存在" → video_task自动创建逻辑未生效
- "操作暂时无法完成" → 后端服务问题，需要检查video-agent服务器

---

## 紧急联系

如果重启后问题仍未解决：

1. **收集诊断信息**
   ```bash
   # OpenClaw版本
   openclaw --version
   
   # OpenClaw配置
   cat ~/.openclaw/hyperframe/openclaw.json
   
   # 最近的对话日志（如果有）
   ls -lt ~/.openclaw/sessions/ | head -5
   ```

2. **提供错误截图**
   - 包含完整的Tool Error堆栈
   - Agent的最后一条消息
   - 浏览器控制台错误（F12）

3. **检查根本原因分析文档**
   - 阅读：`/Users/a1234/Desktop/hyperframe-main/video-agent/ROOT_CAUSE_ANALYSIS_AND_FIX.md`
   - 按照修复方案逐步验证

---

## 成功标志

当以下所有条件满足时，说明修复成功：

- ✅ OpenClaw服务已重启（PID变化，启动时间更新）
- ✅ 新对话无Tool Error（除了正常的业务错误）
- ✅ 上传视频后能自动创建工程
- ✅ 编辑任务能正常提交并返回jobId
- ✅ 用户反馈："现在可以正常使用了"

**只有达到以上标准，才能声称任务完成。**
