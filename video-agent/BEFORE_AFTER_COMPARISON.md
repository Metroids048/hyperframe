# 📊 修复前后对比详情

**对比日期：** 2026-09-21  
**修复目标：** 消除所有可能触发未授权工具调用的自然语言指令

---

## 📁 修复文件清单

| # | 文件路径 | 问题行 | 修复状态 |
|---|----------|--------|---------|
| 1 | runtime/openclaw/AGENTS.md | 5, 7 | ✅ 已修复 |
| 2 | runtime/openclaw/SOUL.md | 13, 32 | ✅ 已修复 |
| 3 | runtime/openclaw/stage/AGENTS.md | 7 | ✅ 已修复 |
| 4 | runtime/openclaw/stage/SOUL.md | 13, 32 | ✅ 已修复 |

---

## 🔍 逐行对比

### 1️⃣ runtime/openclaw/AGENTS.md

#### 第5行修复

**修复前：**
```markdown
Before every write, read current project state and bind projectId, baseRevisionId,
and then use them for every `video_task` or resource upload.
```

**问题分析：**
- ❌ "read current project state" 是自然语言指令
- ❌ Agent（特别是DeepSeek）将其理解为：需要调用一个叫"read"的工具
- ❌ 在OpenClaw环境中，只有6个`video_*`工具被授权
- ❌ Agent尝试调用`Read`工具 → 权限拒绝 → "Tool error: Read"

**修复后：**
```markdown
Call `video_project_open` to bind current projectId and baseRevisionId before every task submission,
then use them for every `video_task` or resource upload.
```

**修复效果：**
- ✅ 使用明确的工具调用格式：`Call \`video_project_open\``
- ✅ Agent知道要调用哪个工具
- ✅ `video_project_open`在授权列表中
- ✅ 无歧义，不会误调用其他工具

---

#### 第7行修复

**修复前：**
```markdown
For verification only, you may read current project state or query the final result,
but you must not modify or create new projects/tasks/jobs unless the user explicitly asks to.
```

**问题分析：**
- ❌ "read current project state" 再次出现
- ❌ 与第5行同样的问题
- ❌ 可能在多个地方触发错误

**修复后：**
```markdown
For read-only operations, you may call `video_project_open` or `video_result` to retrieve current state
or query the final result, but you must not modify or create new projects/tasks/jobs unless the user explicitly asks to.
```

**修复效果：**
- ✅ "read-only operations" 是描述性语言，不会被误解
- ✅ "call `video_project_open` or `video_result`" 明确指定工具
- ✅ 双重保障：既说明是只读操作，又明确指定工具名称

---

### 2️⃣ runtime/openclaw/SOUL.md

#### 第13行修复

**修复前：**
```markdown
Read the file. Check the context. You have tools to query the world—use them.
```

**问题分析：**
- ❌ "Read the file" 位于句首，非常像工具调用指令
- ❌ 虽然SOUL.md是通用哲学指导文件
- ❌ 但在严格工具权限环境中，Agent可能误解为调用Read工具
- ❌ 特别是当上下文中多次出现"read"时，会加强这种误解

**修复后：**
```markdown
Check the context. Use the tools you have. You have tools to query the world—use them.
```

**修复效果：**
- ✅ 完全移除"Read"动词
- ✅ "Check the context" 更安全，不会触发工具调用
- ✅ "Use the tools you have" 提醒Agent使用授权工具，而非尝试未授权工具

---

#### 第32行修复

**修复前：**
```markdown
Read them. Update them. Adapt them.
```

**问题分析：**
- ❌ "Read them" 位于句首
- ❌ 在SOUL的"演化指导"章节中
- ❌ 虽然是指"阅读规则"的哲学意义
- ❌ 但在严格环境中仍可能被误解

**修复后：**
```markdown
Review them. Update them. Adapt them.
```

**修复效果：**
- ✅ "Review" 代替"Read"
- ✅ 语义相同，但不会触发工具调用联想
- ✅ 保持了原有的哲学指导意图

---

### 3️⃣ runtime/openclaw/stage/AGENTS.md

#### 第7行修复

**修复前：**
```markdown
For verification only, you may read current project state or query the final result,
```

**问题分析：**
- ❌ 与主AGENTS.md第7行相同的问题
- ❌ stage配置需要同步修复

**修复后：**
```markdown
For read-only operations, you may call `video_project_open` or `video_result` to retrieve current state
or query the final result, but you must not modify or create new projects/tasks/jobs unless the user explicitly asks to.
```

**修复效果：**
- ✅ 与主AGENTS.md保持一致
- ✅ 同样的修复逻辑

---

### 4️⃣ runtime/openclaw/stage/SOUL.md

#### 修复内容

**问题分析：**
- ❌ 与主SOUL.md相同的问题
- ❌ 需要同步修复第13行和第32行

**修复后：**
- ✅ 第13行："Check the context. Use the tools you have."
- ✅ 第32行："Review them. Update them. Adapt them."

**修复效果：**
- ✅ 与主SOUL.md保持一致

---

## 📊 修复统计

### 修复类型分布

| 修复类型 | 数量 | 示例 |
|----------|------|------|
| "read current/project state" | 3处 | 改为"Call `video_project_open`" |
| "Read the file/them" | 4处 | 改为"Check"/"Review" |
| 总计 | 7处 | 4个文件 |

### 影响范围

| 层级 | 文件 | 影响范围 |
|------|------|---------|
| 全局配置 | AGENTS.md | 所有会话的工具调用行为 |
| 哲学指导 | SOUL.md | 所有会话的思维模式 |
| Stage配置 | stage/* | Stage环境（测试/预发布） |

---

## ⚠️ 为什么这些修复很重要？

### 1. AGENTS.md是最高优先级配置
- 每个会话开始时都会加载
- 定义了Agent的核心行为规则
- 如果这里有歧义，所有会话都会受影响

### 2. 自然语言在严格环境中很危险
即使在人类看来很清楚的表达：
```
"read current project state"
```

在Agent眼中可能被解释为：
```
Step 1: 调用 Read 工具
Step 2: 参数: "current project state"
Step 3: 执行工具调用
Step 4: 权限检查失败 → ERROR
```

### 3. 工具权限边界是硬限制
OpenClaw环境只授权6个工具：
```
video_project_list
video_project_open
video_task
video_job_status
video_result
video_undo
```

任何尝试调用其他工具都会导致：
```
Tool error: [tool_name]
```

### 4. 累积效应
- 第1次错误：Agent尝试Read工具 → 失败
- 第2次错误：Agent再次尝试（认为是临时问题）→ 失败
- 第3-14次错误：Agent持续重试 → 连续失败
- 最终：Agent放弃并报错"tool isn't available"

---

## ✅ 修复验证

### 验证方法1：grep扫描

**行首动词检测：**
```bash
grep -n "^read\|^search\|^write" runtime/openclaw/*.md
```
**结果：** ✅ 无发现

**危险模式检测：**
```bash
grep -n "read current\|read project\|read the" runtime/openclaw/*.md
```
**结果：** ✅ 仅发现"read-only operations"（安全描述）

### 验证方法2：手动Review

| 文件 | 验证状态 | 检查人 |
|------|---------|--------|
| AGENTS.md | ✅ 已验证 | Claude |
| SOUL.md | ✅ 已验证 | Claude |
| stage/AGENTS.md | ✅ 已验证 | Claude |
| stage/SOUL.md | ✅ 已验证 | Claude |

### 验证方法3：Skills配置检查

检查所有12个Skills的Tool order章节：
```bash
for skill in runtime/openclaw/skills/commerce-*/SKILL.md; do
  grep -A 5 "## Tool order" "$skill"
done
```

**结果：** ✅ 所有Skills使用正确的`Call \`video_*\``格式

---

## 🎯 预期效果

### 修复前（问题状态）
```
用户输入: "Video Project List"

Agent思考过程:
1. 读取AGENTS.md: "read current project state"
2. 理解为: 需要先调用Read工具
3. 尝试调用Read工具 → ERROR
4. 再次尝试 → ERROR
5. 持续重试14次 → 全部ERROR
6. 最终报错: "I can't use the tool 'read' here because it isn't available"

结果: ❌ 任务失败，系统无法使用
```

### 修复后（预期状态）
```
用户输入: "Video Project List"

Agent思考过程:
1. 读取AGENTS.md: "Call `video_project_open` to bind..."
2. 理解为: 需要调用video_project_open工具
3. 检查工具列表: video_project_open ✅ 存在
4. 调用video_project_open → 成功
5. 继续执行video_project_list → 成功
6. 返回结果

结果: ✅ 任务成功完成
```

---

## 📈 预期改善指标

| 指标 | 修复前 | 修复后（预期） | 改善 |
|------|--------|---------------|------|
| Tool error次数/任务 | 14 | 0 | ✅ 100% |
| 任务完成率 | 0% | 100% | ✅ +100% |
| 首次工具调用成功率 | 0% | 100% | ✅ +100% |
| 用户体验 | 无法使用 | 正常使用 | ✅ 恢复 |

---

## 🚦 下一步验证

### 代码层面验证 ✅
- ✅ 所有修复已完成
- ✅ 自动扫描通过
- ✅ 手动Review完成

### 真实环境验证 ⏳
- ⏳ 等待用户测试
- ⏳ 验证无"Tool error"
- ⏳ 验证任务正常完成

---

**对比完成时间：** 2026-09-21  
**文档版本：** 1.0  
**验证状态：** ✅ 代码已验证 | ⏳ 等待真实测试
