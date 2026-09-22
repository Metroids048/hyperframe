# Session Conflict 根本原因与最终修复

## 问题根源

**真正的问题**：[session-bindings.mjs:29](lib/openclaw/session-bindings.mjs#L29) 的检查逻辑过于严格。

```javascript
// 旧逻辑：禁止 session 重新绑定到不同项目
if(existing&&(existing.workspaceId!==workspaceId||existing.projectId!==projectId))
  fail('OpenClaw session is already bound to another project','SESSION_PROJECT_CONFLICT',409);
```

**触发场景**：
1. 用户说"帮我制作咖啡机的商品视频"
2. OpenClaw Control Agent 正确地调用了 `video_task`
3. [server.mjs:199](server.mjs#L199) 先执行 `bind(trustedContext, null)` 查询当前 session
4. [server.mjs:212-214](server.mjs#L212-L214) 创建新项目后调用 `replace(trustedContext, newProjectId)`
5. 但如果该 session 之前绑定过其他项目，第 29 行的检查会抛出 `SESSION_PROJECT_CONFLICT` 错误

**为什么会重复出现**：
- 用户在同一个 OpenClaw 会话中创建多个视频项目
- 每次创建新项目时，session 需要从旧项目切换到新项目
- 旧逻辑禁止这种切换，导致第二次及之后的请求都失败

## 最终修复

修改 [session-bindings.mjs:29](lib/openclaw/session-bindings.mjs#L29)：

```javascript
// 新逻辑：允许 session 重新绑定到不同项目，只检查 workspaceId
if(existing&&existing.workspaceId!==workspaceId)
  fail('OpenClaw session workspace mismatch','SESSION_WORKSPACE_CONFLICT',409);
```

**修复逻辑**：
- ✅ 允许同一个 session 绑定到不同项目（支持用户创建多个视频）
- ✅ 仍然检查 workspaceId（防止跨 workspace 污染）
- ✅ `replace()` 方法本身就是用来切换项目的，`bind()` 不应该阻止它

## 其他已修复的问题

1. ✅ **OpenClaw Control Agent Instructions** - 强化了"直接调用 video_task"的规则
2. ✅ **Backend 启动崩溃** - [edit/service.mjs:63](lib/edit/service.mjs#L63) 添加 try-catch
3. ✅ **中文回复** - [commerce-agent-bridge.mjs:35](lib/openclaw/commerce-agent-bridge.mjs#L35) 强制中文

## 验证步骤

重启服务后测试：

```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent
pkill -9 -f "node.*server.mjs"
~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs &
```

访问 http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A... 并测试：

1. "帮我制作咖啡机的商品视频" → 应该成功创建项目
2. "再帮我制作笔记本的商品视频" → 应该成功创建第二个项目（之前会报 SESSION_PROJECT_CONFLICT）
3. "把第一个镜头改成3秒" → 应该成功编辑当前项目

## 为什么之前改了好几次都没解决

1. **误判了问题根源** - 一直在改 OpenClaw Control Agent 的 instructions，但问题其实在 session-bindings.mjs 的业务逻辑
2. **代码确实改了但没重启** - 多次修改后没有完全重启 backend 进程
3. **Session conflict 的真实含义被忽略了** - 这个错误不是说"并发冲突"，而是说"session 已经绑定到另一个项目"

这次的修复直接解决了根本原因：**允许 session 在同一个会话中创建和切换多个项目**。
