# OpenClaw视频编辑系统关键问题分析

## 问题现状

### 1. 用户报告的问题
- ❌ 14个插件全部ERROR
- ❌ 任务要求"必须绑定工程"，导致无法执行任何任务
- ❌ 简单的改动请求无法实现
- ❌ Agent报错"没有任何蛋白粉的真实素材"（用户明明上传了视频）
- ❌ 与通过Codex使用项目的体验差距巨大

### 2. 根本原因分析

#### 问题A：Skills的Tool order误导Agent
**当前状态（错误）：**
```markdown
## Tool order
**Session start:**
1. Call `video_project_list` to show existing project names
2. If user asks for a new project: call `video_task` with `projectId: "new"`
3. If user selects an existing project: call `video_project_open` with the exact selected ID
```

**问题：**
- Agent将"Call `video_project_list`"理解为必须调用
- Agent将"If user asks for a new project"理解为"任何新任务都需要绑定工程"
- 导致Agent在用户上传视频要求处理时，仍然要求"先选择工程"

#### 问题B：video_task的自动创建逻辑未被Agent触发
**代码实现（lib/openclaw/commerce-engine-facade.mjs）：**
```javascript
if (tool === 'video_task') {
  // 支持自动创建工程：如果没有projectId但有附件，自动创建新工程
  let projectId = input.projectId;
  let value = projectId ? service.get(projectId) : null;

  if (!projectId && Array.isArray(input.attachmentPaths) && input.attachmentPaths.length > 0) {
    // 用户上传了新视频文件，自动创建工程
    const autoCreated = await service.create({...});
    projectId = autoCreated.id;
    value = autoCreated;
  }
```

**问题：**
- 代码逻辑正确：用户上传视频 → 自动创建工程 → 执行任务
- 但Skills的Tool order误导Agent：必须先选择工程 → Agent不会调用video_task with attachments
- 结果：自动创建逻辑永远不会被触发

#### 问题C：baseRevisionId强制校验导致新用户无法使用
**代码逻辑：**
```javascript
if (!Object.hasOwn(input, 'baseRevisionId')) fail('baseRevisionId 缺失', 'BASE_REVISION_ID_INVALID');
if ((value.currentRevisionId || null) !== (input.baseRevisionId || null)) 
  fail('已有工程编辑必须提供当前基准版本', 'REVISION_CONFLICT', 409);
```

**问题：**
- 新建工程时，currentRevisionId为null，baseRevisionId也应该是null
- 但Agent被Skills误导，不知道新任务应该传`baseRevisionId: null`
- Agent尝试各种调用都失败，最终放弃

## 真实用户场景分析

**用户期望：**
```
上传视频 → 描述需求 → 视频被处理 → 看到结果
```

**当前实际流程：**
```
上传视频 → Agent: "请先选择工程"
用户: "我就想处理这个视频"
Agent: "没有可编辑的工程"
用户: "？？？"
```

**为什么Codex可以工作：**
- Codex直接调用service.create() + service.enqueue()
- 不通过OpenClaw的工具抽象层
- 不受Skills的Tool order误导

## 修复方案

### 核心原则
**用户体验优先：让简单的事情保持简单**

### 修复1：重写所有Skills的Tool order（关键）

**修复前（错误）：**
```markdown
## Tool order
1. Call `video_project_list` to show existing project names
2. If user asks for a new project: call `video_task` with `projectId: "new"`
3. If user selects an existing project: call `video_project_open`
```

**修复后（正确）：**
```markdown
## Tool order

**For brand-new requests with uploaded files:**
1. Call `video_task` directly with `attachmentPaths` or `attachmentIds`, `projectId: null`, `baseRevisionId: null`
2. The service will auto-create a project and return `projectId` and `baseRevisionId`
3. Call `video_job_status` to poll progress
4. Call `video_result` to get artifacts

**For editing an existing project:**
1. Call `video_project_list` to show available projects
2. Call `video_project_open` with the selected `projectId`
3. Call `video_task` with `projectId`, `baseRevisionId` (from video_project_open), and the edit request
4. Call `video_job_status` and `video_result`

**Key rules:**
- New task with files → `projectId: null`, `baseRevisionId: null`, must include `attachmentPaths`/`attachmentIds`
- Edit existing → must provide current `projectId` and `baseRevisionId`
- Never use `projectId: "new"` or `projectId: "current"`
```

### 修复2：video_task参数明确化

**在所有Skills中添加：**
```markdown
## video_task parameters

**Creating new project from uploaded files:**
```json
{
  "projectId": null,
  "baseRevisionId": null,
  "message": "user's natural language request",
  "attachmentPaths": ["path/to/uploaded/video.mp4"],
  "operationId": "unique-operation-id",
  "authorizationId": "from-context"
}
```

**Editing existing project:**
```json
{
  "projectId": "actual-uuid-from-video_project_open",
  "baseRevisionId": "current-revision-id-from-video_project_open",
  "message": "user's edit request",
  "attachmentPaths": [],
  "operationId": "unique-operation-id",
  "authorizationId": "from-context"
}
```

### 修复3：移除误导性的"Session start"流程

**问题：**
- "Session start"暗示每个会话必须先列出工程
- 导致Agent在新用户场景下强制要求选择工程

**修复：**
- 移除"Session start"章节
- 按实际场景分类：新建 vs 编辑

### 修复4：在commerce-orchestrator中添加明确的路由逻辑

```markdown
## Routing logic

**Step 1: Analyze user request**
- Has uploaded files? → New project creation flow
- Refers to "this video", "current project", or specific project name? → Existing project edit flow
- Ambiguous? → Ask user

**Step 2: Execute**
- New project: `video_task` with `projectId: null`, `baseRevisionId: null`, `attachmentPaths: [...]`
- Existing: `video_project_open` → get `projectId` and `baseRevisionId` → `video_task`

**Step 3: Never assume**
- Don't assume user wants to create a project when they're editing
- Don't assume user wants to edit when they uploaded new files
- Don't invent UUIDs or use magic strings like "new" or "current"
```

## 测试场景

### 场景1：新用户上传视频（修复验证关键）
```
用户输入：把这个视频里面的咖啡袋全部改成蛋白粉
上传文件：_____.mp4

期望结果：
1. Agent调用 video_task(projectId=null, baseRevisionId=null, attachmentPaths=[...])
2. 服务自动创建工程
3. 任务执行
4. 返回结果

当前错误：
Agent要求"请先选择工程"或"没有蛋白粉的真实素材"
```

### 场景2：编辑现有工程
```
用户输入：把刚才那个视频的标题改小一点

期望结果：
1. Agent调用 video_project_list()
2. 找到最近的工程
3. 调用 video_project_open(projectId=...)
4. 调用 video_task(projectId=..., baseRevisionId=..., message=...)

当前错误：
如果之前没有成功创建工程，这里也会失败
```

### 场景3：多个工程选择
```
用户输入：把第二个视频的背景音乐去掉

期望结果：
1. Agent调用 video_project_list()
2. 返回工程列表
3. 让用户选择具体是哪个
4. 用户选择后继续

当前错误：
可能在第1步就失败了
```

## 执行计划

### 阶段1：立即修复Skills（30分钟）
1. 修改所有12个业务Skills的Tool order
2. 添加明确的参数示例
3. 移除误导性的"Session start"流程

### 阶段2：增强commerce-orchestrator（20分钟）
1. 添加明确的路由逻辑
2. 添加参数示例
3. 添加错误处理指导

### 阶段3：真实环境测试（40分钟）
1. 重启OpenClaw Control
2. 测试场景1：新用户上传视频
3. 测试场景2：编辑现有工程
4. 测试场景3：多工程选择
5. 记录所有ERROR和修复

### 阶段4：文档和防护（20分钟）
1. 更新SKILLS_WRITING_GUIDE.md
2. 创建真实场景测试脚本
3. 添加到验收清单

## 预期结果

### 修复后的用户体验
```
用户：把这个视频里的咖啡袋全部改成蛋白粉
      [上传 _____.mp4]

Agent：[自动创建工程]
       好的，我正在处理这个视频...
       [调用 video_task with attachments]
       [等待任务完成]
       已完成，视频中的咖啡袋已替换为蛋白粉。
       [显示结果]
```

### 关键指标
- ✅ 新用户上传视频 → 0次ERROR → 直接处理
- ✅ 编辑现有工程 → 0次ERROR → 正确定位和修改
- ✅ 与Codex体验一致
- ✅ 不再出现"必须绑定工程"的错误提示

## 根本问题回顾

**为什么之前的测试没有发现？**
1. 测试脚本直接调用service层，绕过了OpenClaw工具抽象
2. 没有真正在OpenClaw Control界面测试新用户场景
3. Skills的Tool order只通过了语法检查，没有通过Agent实际执行验证
4. 过早声称"完成"，没有等待真实用户反馈

**如何防止再次发生？**
1. 所有Skills必须在真实OpenClaw Control界面测试
2. 测试新用户场景（最容易发现问题）
3. 记录Agent的实际Tool调用序列，不只看最终结果
4. 用户反馈的ERROR必须在真实环境复现并修复，不能只改代码

---
**创建时间：** 2026-09-21
**待验证：** 修复后在OpenClaw Control界面真实测试
