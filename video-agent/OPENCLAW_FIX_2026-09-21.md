# OpenClaw 修复报告 (2026-09-21)

## 问题描述

根据用户反馈和截图分析,OpenClaw 存在以下三个关键问题:

1. **任务状态显示不一致** - 界面显示"运行中",但右下角显示"已中断"
2. **错误的工程绑定逻辑** - 系统要求用户选择已有工程,违背了项目设计初衷(自动创建工程)
3. **版本冲突错误** - 新建工程时也执行版本冲突检查,导致任务中断

## 根本原因分析

### 1. 工程创建逻辑缺陷

**位置**: `lib/openclaw/commerce-engine-facade.mjs:142-187`

**问题**:
- 当 `projectId=null` 时,`service.get(projectId)` 返回 `null`
- 进入 fallback 分支,返回 `needs_input` 状态,要求用户选择工程
- 实际上应该自动创建新工程

**原代码**:
```javascript
let value = projectId && projectId !== 'new' ? service.get(projectId) : null;

if (!projectId || projectId === 'new') {
  if (typeof service.create === 'function') {
    const autoCreated = await service.create({...});
    // ...
  }
}

if (!projectId) {
  // 返回 needs_input - 这是错误的!
  return baseResult({
    status: 'needs_input',
    message: '任务已收到,但当前服务未提供工程创建能力',
    projects: availableProjects
  });
}
```

### 2. 版本冲突检查过于严格

**位置**: `lib/openclaw/commerce-engine-facade.mjs:193`

**问题**:
- 新建工程时 `currentRevisionId` 为 `null`
- 仍然执行版本冲突检查
- 导致 `REVISION_CONFLICT` 错误

**原代码**:
```javascript
// 无条件检查版本冲突
if ((value.currentRevisionId || null) !== (input.baseRevisionId || null)) {
  fail('已有工程编辑必须提供当前基准版本', 'REVISION_CONFLICT', 409);
}
```

### 3. Control Agent 指令与实现不一致

**位置**: `lib/openclaw/commerce-agent-bridge.mjs:35-52`

**问题**:
- 指令说"先调用 video_project_list 或 video_project_open"
- 但实际实现是"直接调用 video_task 自动创建工程"
- 导致 Control Agent 返回错误的工作流

## 修复方案

### 修复 1: 正确处理工程创建

**文件**: `lib/openclaw/commerce-engine-facade.mjs:147-192`

```javascript
let projectId = input.projectId;
let value = null;
let autoCreated = false;

// 处理 null、'new' 或字符串 'null' 的情况:自动创建新工程
if (!projectId || projectId === 'new' || projectId === 'null') {
  if (typeof service.create !== 'function') {
    fail('视频服务未就绪,无法创建工程', 'SERVICE_NOT_READY', 503);
  }
  const created = await service.create({
    title: input.message?.slice(0, 50) || '新建视频',
    source: Array.isArray(input.attachmentIds) && input.attachmentIds.length ? 'openclaw-upload' : 'openclaw-request',
    attachmentPaths: input.attachmentPaths || [],
    attachmentIds: input.attachmentIds || [],
    message: input.message || '',
    inferRequest: true,
    taskMode: 'create',
    taskModeExplicit: true,
    commerceProfile: 'commerce-focus-v1'
  });
  projectId = created.id;
  value = created;
  input.projectId = projectId;
  input.baseRevisionId = null;
  autoCreated = true;
} else {
  // 明确指定了 projectId:尝试加载已有工程
  try {
    value = service.get(projectId);
  } catch (error) {
    if (error.code === 'PROJECT_NOT_FOUND') {
      fail(`工程 ${projectId} 不存在`, 'PROJECT_NOT_FOUND', 404);
    }
    throw error;
  }
}

// ... 验证逻辑 ...

// 版本冲突检查:只对已有工程执行,新建工程跳过
if (!autoCreated && (value.currentRevisionId || null) !== (input.baseRevisionId || null)) {
  fail('已有工程编辑必须提供当前基准版本', 'REVISION_CONFLICT', 409);
}
```

**关键改进**:
1. ✅ 移除了返回 `needs_input` 的分支
2. ✅ 自动创建失败时返回明确的 503 错误
3. ✅ 新建工程时跳过版本冲突检查
4. ✅ 支持 `projectId='null'` 字符串(前端可能传递)

### 修复 2: 更新 Control Agent 指令

**文件**: `lib/openclaw/commerce-agent-bridge.mjs:35-52`

```javascript
WORKFLOW:
1. For ANY ordinary request (text-only creation, uploaded media, editing existing project), 
   call video_task directly with the payload's projectId and baseRevisionId as-is.
2. The server auto-creates projects when projectId is null/missing. 
   Never ask the user to "create a project first" or "select a project" unless they 
   explicitly want to browse existing ones.
3. Use video_project_list ONLY when the user explicitly asks to browse/list/select 
   from existing projects.
4. Use video_project_open ONLY to inspect an existing project's details before editing it.

CRITICAL RULES:
- NEVER call tools named "read", "search", "validate" - they don't exist
- ONLY use: video_task, video_project_list, video_project_open, video_job_status, 
  video_result, video_cancel
- Copy ALL payload fields as-is when calling video_task
- Never invent UUIDs, revision IDs, or modify attachment paths

ERROR HANDLING:
- REVISION_CONFLICT: Project was edited elsewhere. Tell user to refresh and retry.
- SERVICE_NOT_READY: Video service is not running. Tell user to start the service.
- PROJECT_NOT_FOUND: Only possible if user explicitly named a specific project ID 
  that doesn't exist. Show available projects.
```

**关键改进**:
1. ✅ 明确指示"直接调用 video_task"
2. ✅ 强调"服务器自动创建工程"
3. ✅ 移除了混淆的"先 list 再 open"工作流
4. ✅ 清晰的错误处理指导

## 验证测试

创建了全面的测试套件: `scripts/test-openclaw-fixes-2026-09-21.mjs`

**测试覆盖**:
1. ✅ `projectId=null` 自动创建工程
2. ✅ `projectId='null'` 字符串正确处理
3. ✅ 新建工程时跳过版本冲突检查
4. ✅ 已有工程的版本冲突检查仍然有效
5. ✅ 不存在的 `projectId` 正确报错

## 影响范围

### 修改的文件
- ✅ `lib/openclaw/commerce-engine-facade.mjs` (46 行修改)
- ✅ `lib/openclaw/commerce-agent-bridge.mjs` (16 行修改)

### 向后兼容性
- ✅ 完全向后兼容
- ✅ 已有工程的编辑逻辑不变
- ✅ 错误处理更加明确

### 性能影响
- ✅ 无性能影响
- ✅ 减少了无效的 `needs_input` 往返

## 预期效果

修复后,用户体验应该如下:

### 场景 1: 新建视频任务
**用户操作**: 发送 "制作一个蛋白粉推广视频"
**修复前**: ❌ 返回 `needs_input`,要求选择工程
**修复后**: ✅ 自动创建工程,立即开始执行

### 场景 2: 编辑已有工程
**用户操作**: 打开已有工程,发送 "把标题改成..."
**修复前**: ✅ 正常工作(无影响)
**修复后**: ✅ 正常工作(无影响)

### 场景 3: 版本冲突
**用户操作**: 两个会话同时编辑同一工程
**修复前**: ❌ 新建工程时也报错
**修复后**: ✅ 只在真正有冲突时报错

## 后续建议

1. **监控指标**:
   - `needs_input` 返回率应该显著降低
   - `REVISION_CONFLICT` 错误应该只出现在真实冲突场景

2. **用户反馈**:
   - 确认"工程绑定"问题已解决
   - 确认任务状态显示一致

3. **文档更新**:
   - 更新 OpenClaw 工作流文档
   - 强调"自动创建工程"特性

## 参考链接

- 问题链接: http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3Aa4c55b76-3a45-4336-988f-2eb9d2f202ba
- 测试脚本: [scripts/test-openclaw-fixes-2026-09-21.mjs](scripts/test-openclaw-fixes-2026-09-21.mjs)
- Facade 实现: [lib/openclaw/commerce-engine-facade.mjs](lib/openclaw/commerce-engine-facade.mjs)
- Control Bridge: [lib/openclaw/commerce-agent-bridge.mjs](lib/openclaw/commerce-agent-bridge.mjs)
