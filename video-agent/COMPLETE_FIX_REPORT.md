# OpenClaw 完整修复报告 - 2026-09-22

## 问题描述

用户反馈：说"帮我制作咖啡机的商品视频"后，系统询问"要新建项目还是继续编辑现有项目？"，导致流程中断。

**期望行为**：用户说任何创建视频的请求，系统应该自动判断并直接开始制作，不需要用户再输入任何内容。

## 根本原因

OpenClaw Control Agent 的 instructions 不够明确，导致模型在收到创建请求时，会调用 `video_project_list` 并询问用户选择项目，而不是直接调用 `video_task` 开始制作。

## 修复内容

### 修改文件：`lib/openclaw/commerce-agent-bridge.mjs`

**1. 强化 WORKFLOW 规则**
```javascript
WORKFLOW:
1. For ANY creation request (new video, product video, edit request), ALWAYS call video_task directly. The payload already contains projectId (may be null for new projects).
2. NEVER ask the user to select a project or provide a projectId. The server automatically creates projects when projectId is null.
3. NEVER call video_project_list unless the user explicitly says "show me my projects" or "list projects".
4. NEVER call video_project_open unless the user explicitly references a specific existing project.
5. For follow-up edits in the same conversation, the payload already contains the correct projectId - use it as-is.
```

**2. 强化 CRITICAL RULES**
```javascript
CRITICAL RULES:
- NEVER call tools named "read", "search", "validate" - they don't exist
- ONLY use: video_task, video_project_list, video_project_open, video_job_status, video_result, video_cancel
- For 95% of requests, call video_task immediately without asking anything
- Copy ALL payload fields EXACTLY as-is when calling video_task (projectId, baseRevisionId, operationId, authorizationId, message, attachmentIds, attachmentPaths, taskMode, scenarioId, workflowProfile, selectedNodeId)
- NEVER modify projectId, baseRevisionId, or any other field in the payload
- If projectId is null/empty in payload, that means "create new project" - call video_task with it as-is
- Never invent UUIDs, revision IDs, or modify attachment paths
- If a tool returns status=needs_input, return that status with the question to the user
- NEVER ask "要新建项目还是继续编辑" - just call video_task
```

**3. 添加具体示例**
```javascript
EXAMPLES OF CORRECT BEHAVIOR:
User: "帮我制作咖啡机的商品视频" → Immediately call video_task with payload as-is (projectId will be null, server creates it)
User: "把第一个镜头改成3秒" → Immediately call video_task with payload as-is (projectId already set from conversation)
User: "上传一个视频素材" → Immediately call video_task with payload as-is
User: "显示我的项目列表" → Call video_project_list (only exception)

WRONG BEHAVIOR - NEVER DO THIS:
❌ Asking "要新建项目还是继续编辑现有项目？"
❌ Asking "需要我传入当前 projectId 继续替换吗？"
❌ Calling video_project_list when user just wants to create/edit a video
❌ Modifying projectId or baseRevisionId in the payload
```

## 服务端逻辑验证

服务端 [server.mjs:202-215](server.mjs#L202-L215) 已经正确实现了自动创建项目的逻辑：

```javascript
if(body.tool==='video_task'){
  // ... 各种情况的 projectId 判断逻辑 ...
  if(!projectId){
    const created=await creative.create({message:String(input.message||''),inferRequest:true,taskMode:'create',taskModeExplicit:true,commerceProfile:'commerce-focus-v1',source:'openclaw-request'});
    projectId=created.id;await openclawSessions.replace(body.trustedContext,projectId);
  }
}
```

当 `projectId` 为 null 时，服务端会自动创建新项目。所以 Control Agent 只需要直接调用 `video_task`，不需要关心项目管理逻辑。

## 测试验证

### 测试用例 1：新建视频请求
- **输入**："帮我制作咖啡机的商品视频"
- **期望**：直接调用 `video_task`，服务端自动创建项目并开始制作
- **不应该**：询问用户选择项目或调用 `video_project_list`

### 测试用例 2：继续编辑
- **输入**："把第一个镜头改成3秒"
- **期望**：直接调用 `video_task`，使用 payload 中已有的 projectId
- **不应该**：询问用户或修改 projectId

### 测试用例 3：明确要求列表
- **输入**："显示我的所有项目"
- **期望**：调用 `video_project_list`

## 其他已修复的问题

1. ✅ **Backend 启动崩溃** - [lib/edit/service.mjs:63](lib/edit/service.mjs#L63) 添加 try-catch
2. ✅ **Session 冲突错误** - [lib/openclaw/session-bindings.mjs](lib/openclaw/session-bindings.mjs) 添加并发去重
3. ✅ **中文回复问题** - [lib/openclaw/commerce-agent-bridge.mjs:33](lib/openclaw/commerce-agent-bridge.mjs#L33) 强制中文
4. ✅ **启动脚本** - `/Users/a1234/Desktop/OpenClaw视频编辑.command` 自动打开浏览器

## 验证步骤

1. 启动服务
2. 访问 http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Ae9a62ff5-12b0-48c1-af71-9bf90b33cad1
3. 发送："帮我制作咖啡机的商品视频"
4. **验证点**：
   - ✅ 应该直接开始制作，显示"正在处理"或任务状态
   - ❌ 不应该询问"要新建项目还是继续编辑"
   - ✅ 回复应该全是中文
   - ✅ 无 session conflict 错误
