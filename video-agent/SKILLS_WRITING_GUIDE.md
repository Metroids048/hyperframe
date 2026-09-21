# OpenClaw Skills 编写规范

## 版本：1.0
## 创建日期：2026-09-21
## 目的：防止Skills指令被Agent误解，确保只调用授权的工具

---

## 核心原则

### 1. 明确性原则 ⚠️ **CRITICAL**
**永远使用明确的工具调用指令，不使用自然语言描述**

#### ❌ 错误示例（会导致Agent调用未授权工具）
```markdown
## Tool order
Read project; search relevant resources; validate scope; submit job; poll status; inspect results
```

**问题：**
- "Read project" → Agent尝试调用 `Read` 工具（未授权）
- "search relevant resources" → Agent尝试调用 `search` 工具（不存在）
- 导致连续工具调用错误，任务终止

#### ✅ 正确示例
```markdown
## Tool order
1. Call `video_project_open` to read the current project state and bind projectId/baseRevisionId
2. Call `video_task` with the natural-language request (the service will search resources internally)
3. Call `video_job_status` to poll job progress until completion
4. Call `video_result` to list the final artifacts and delivery state
```

**优点：**
- 明确指定要调用的工具名（用反引号包裹）
- 说明每个工具的目的和参数
- Agent不会误解为其他工具调用

---

## Skill文件结构规范

### 必需的frontmatter
```yaml
---
name: commerce-product-launch
version: 1.0.0
description: 简洁的一句话描述，说明这个Skill的用途
---
```

### 必需的章节
按以下顺序组织：

```markdown
## Trigger
说明何时使用这个Skill

## Exclude
说明何时不应该使用这个Skill

## Inputs
说明需要的输入数据和上下文

## Tool order
详细的工具调用步骤（最关键的章节）

## Output
说明期望的输出格式

## Preserve
说明需要保留的状态和数据

## Failure
说明如何处理错误情况

## Acceptance
说明验证标准和策略来源
```

---

## Tool order章节编写规范 ⚠️ **CRITICAL**

### 规范1：使用编号列表
```markdown
## Tool order
1. Call `video_project_open` to...
2. Call `video_task` with...
3. Call `video_job_status` to...
4. Call `video_result` to...
```

**要求：**
- 每个步骤必须以编号开头（1. 2. 3.）
- 每个步骤必须以"Call"开头（或"(Optional) Call"）
- 明确说明调用目的

### 规范2：工具名必须用反引号包裹
```markdown
✅ Call `video_project_open`
❌ Call video_project_open
❌ Use video_project_open
❌ Read project
```

**原因：**
- 反引号是明确的代码标记
- Agent能识别这是工具名而非自然语言
- 防止误解为动词短语

### 规范3：说明每个工具调用的目的
```markdown
✅ Call `video_project_open` to read the current project state and bind projectId/baseRevisionId
❌ Call `video_project_open`
```

**要求：**
- 用"to"引出目的说明
- 明确说明输入参数和期望输出
- 如果有重要的参数，显式说明

### 规范4：对可选步骤使用明确标记
```markdown
3. (Optional) Call `video_cancel` only for explicit user cancel/resume requests
4. (Optional) Call `commerce_revision_control` for history queries
```

**要求：**
- 在步骤开头加"(Optional)"
- 说明什么情况下需要调用

### 规范5：对条件分支使用清晰的结构
```markdown
## Tool order
**Session start:**
1. Call `video_project_list` to show existing project names
2. If user asks for a new project: call `video_task` with `projectId: "new"`
3. If user selects an existing project: call `video_project_open` with the exact selected ID

**If `video_project_open` returns `needs_selection`:**
- Stop before any write
- Call `video_project_list` again
- Ask user to choose by name

**Normal operation (after project is bound):**
1. Call `video_task` with the natural-language request
2. Call `video_job_status` to poll job progress
3. Call `video_result` to inspect artifacts
```

**要求：**
- 使用粗体标题分隔不同流程
- 条件分支使用"If"明确标记
- 每个分支的步骤清晰独立

---

## 授权工具清单

OpenClaw runtime **只授权以下6个工具**：

1. `video_project_list` - 列出所有项目
2. `video_project_open` - 打开指定项目
3. `video_task` - 提交视频编辑任务
4. `video_job_status` - 查询任务状态
5. `video_cancel` - 取消任务
6. `video_result` - 获取任务结果

### ❌ 绝对不能在Skills中引用的工具
- `Read` - 文件读取（不可用）
- `Write` - 文件写入（不可用）
- `Edit` - 文件编辑（不可用）
- `Bash` - Shell命令（不可用）
- `WebFetch` - 网页抓取（不可用）
- `WebSearch` - 网页搜索（不可用）
- 任何其他非video_*的工具

### 如果需要这些功能怎么办？
**所有资源搜索、文件读取、状态验证都应该在video_task的自然语言请求中描述，由Video Agent服务内部处理。**

示例：
```markdown
✅ Call `video_task` with the natural-language request (the service will search resources internally)
❌ Search for relevant resources, then call `video_task`
```

---

## 常见错误和修复

### 错误1：使用自然语言动作描述
```markdown
❌ 错误：
## Tool order
Read project state; search for suitable resources; validate inputs; submit the job; poll until complete

✅ 正确：
## Tool order
1. Call `video_project_open` to read the current project state
2. Call `video_task` with the natural-language request (resource search is handled internally)
3. Call `video_job_status` to poll job progress until completion
```

### 错误2：工具名没有反引号
```markdown
❌ 错误：
1. Call video_project_open to read project state

✅ 正确：
1. Call `video_project_open` to read project state
```

### 错误3：步骤没有编号
```markdown
❌ 错误：
## Tool order
Call `video_project_open` first, then call `video_task`, finally poll with `video_job_status`

✅ 正确：
## Tool order
1. Call `video_project_open` to read project state
2. Call `video_task` with the request
3. Call `video_job_status` to poll progress
```

### 错误4：引用未授权工具
```markdown
❌ 错误：
1. Read the project configuration file
2. Call `video_task` with validated inputs

✅ 正确：
1. Call `video_project_open` to read project state (configuration is included)
2. Call `video_task` with the natural-language request
```

---

## Skill模板

使用以下模板创建新的Skill：

```markdown
---
name: commerce-[scene-name]
version: 1.0.0
description: [一句话描述这个Skill的用途]
---

## Trigger
Use for [具体的使用场景和触发条件]

## Exclude
Do not [明确不应该使用的场景]

## Inputs
Require [必需的输入数据和上下文]

## Tool order
1. Call `video_project_open` to read the current project state and bind projectId/baseRevisionId
2. Call `video_task` with the natural-language request (the service will [说明内部如何处理])
3. Call `video_job_status` to poll job progress until completion
4. Call `video_result` to list the final artifacts and delivery state

## Output
Return [具体的输出格式和内容]

## Preserve
Preserve [需要保留的状态和数据]

## Failure
[如何处理错误情况]

## Acceptance
[验证标准和策略来源]
```

---

## 验证清单

在提交新Skill或修改现有Skill前，检查：

### Tool order章节
- [ ] 使用编号列表（1. 2. 3.）
- [ ] 每个步骤以"Call"开头
- [ ] 所有工具名用反引号包裹（\`video_project_open\`）
- [ ] 每个步骤说明了调用目的
- [ ] 可选步骤标记为"(Optional)"
- [ ] 条件分支使用清晰的结构标记

### 工具引用检查
- [ ] 只引用6个授权的video_*工具
- [ ] 不包含"Read project"等自然语言动作
- [ ] 不引用Read/Write/Edit/Bash等未授权工具
- [ ] 资源搜索逻辑在video_task的自然语言请求中说明

### 整体质量
- [ ] frontmatter完整且格式正确
- [ ] 所有必需章节都存在
- [ ] 描述清晰、无歧义
- [ ] 与其他Skills保持一致的风格

---

## 自动化验证

使用以下脚本验证Skills是否符合规范：

```bash
node scripts/validate-skill-tool-instructions.mjs
```

**此脚本会检查：**
1. Tool order章节是否存在
2. 是否包含禁止的自然语言模式
3. 是否引用了授权的工具
4. 是否遵循推荐的编号格式

**失败时不要提交！**

---

## 参考资源

- **AGENTS.md** - 查看工具权限声明
- **openclaw.example.json** - 查看完整的工具配置
- **现有Skills** - 参考已有的正确示例

---

## 维护和更新

### 何时更新此规范
1. 发现新的常见错误模式
2. 授权工具清单变化
3. Skill结构要求变化
4. 发现更好的编写模式

### 如何更新
1. 记录问题和解决方案
2. 更新对应的规范章节
3. 更新验证脚本
4. 通知团队成员

---

**最后更新：2026-09-21**  
**创建原因：修复关键的工具调用指令误解问题**  
**维护人：开发团队**
