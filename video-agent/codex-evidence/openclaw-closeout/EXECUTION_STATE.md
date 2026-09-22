# OpenClaw × HyperFrames Video Agent 收口执行状态

## 元信息

- 开始时间: 2026-09-22
- 分支: codex/webui-agent-workflow
- OpenClaw 版本: 2026.6.11 (固定)
- 负责人: Claude Opus 5

## 问题账本

### P0-001: Bridge 删除关键业务字段

**Symptom**: 视频质量退化，场景判断失效，revision 冲突

**Root Cause**: `commerce-agent-bridge.mjs` 创建 simplifiedPayload 时删除了：
- baseRevisionId
- taskMode
- scenarioId
- workflowProfile
- selectedNodeId

**Affected Files**:
- `lib/openclaw/commerce-agent-bridge.mjs`

**Fix**: 
- ✅ 移除 simplifiedPayload 逻辑
- ✅ 完整传递所有字段到 payload 和 request
- ✅ Prompt 已要求 "Copy ALL payload fields EXACTLY"

**Status**: FIXED_NOT_VERIFIED

---

### P0-002: Timeout 被意外覆盖为硬编码值

**Symptom**: 长视频任务 1 分钟后被强制中止

**Root Cause**: `commerce-agent-bridge.mjs:34` 重新声明 `timeoutMs`，覆盖了函数参数中配置的 300000ms

**Affected Files**:
- `lib/openclaw/commerce-agent-bridge.mjs`

**Fix**:
- ✅ 删除重复的 `timeoutMs` 声明
- ✅ 使用函数参数传入的 timeoutMs（默认 300000）

**Status**: FIXED_NOT_VERIFIED

---

### P0-003: 上传限制配置不一致

**Symptom**: UI 认为可以上传，但 Agent 拒绝

**Root Cause**: 
- Patch 脚本: 64 MiB
- Example config: 15 MiB
- 实际运行配置: 67108864 (64 MiB) ✅

**Affected Files**:
- `runtime/openclaw/openclaw.example.json`

**Fix**:
- ✅ 更新 example 为 67108864 与实际一致

**Status**: FIXED_NOT_VERIFIED

---

### P0-004: Unknown parent session 错误

**Symptom**: 新建会话时报错 `unknown parent session: agent:commerce-control:main`

**Root Cause**: 
- 文档中存在错误的 `session=main` URL 引用
- OpenClaw 2026.6.11 的 session 创建逻辑问题
- `repair-openclaw-runtime.mjs` 通过 minified bundle patch 修复

**Affected Files**:
- `docs/migration/openclaw-2026.6.11/LOCAL_USAGE.zh-CN.md`
- `docs/openclaw-user-loop/STATUS.md`
- `scripts/repair-openclaw-runtime.mjs`

**Fix**:
- ✅ 从两个文档中删除 `session=main` 引用，改为 `?agent=commerce-control`
- ✅ 添加警告说明不要使用 `session=main`
- ✅ 保留 `repair-openclaw-runtime.mjs`（用户要求不升级版本）
- ✅ 启动脚本会在每次 Gateway 启动时自动运行 repair

**Status**: FIXED_NOT_VERIFIED

---

### P0-005: Reply session initialization conflict

**Symptom**: 连续消息时出现 `reply session initialization conflicted`

**Root Cause**: OpenClaw 2026.6.11 的 reply-session CAS 竞态

**Affected Files**:
- `scripts/repair-openclaw-runtime.mjs`

**Fix**:
- ✅ 保持使用 2026.6.11（用户要求）
- ✅ `repair-openclaw-runtime.mjs` 增加 5 次重试 + backoff
- ✅ 启动脚本自动运行 repair
- ⚠️  这是 minified bundle patch，非理想方案但当前唯一可行

**Status**: FIXED_NOT_VERIFIED

**Regression Test**: 需要在真实浏览器中连续快速发送 3+ 条消息验证

---

## 当前工作

已完成:
- ✅ P0-001: 修复 Bridge simplifiedPayload 删除关键字段
- ✅ P0-002: 修复 Timeout 硬编码覆盖
- ✅ P0-003: 统一上传限制配置
- ✅ P0-004: 清理文档中的 session=main 引用
- ✅ P0-005: 确认使用 2026.6.11 + repair script
- ✅ 重写真实浏览器 E2E 验收脚本 (`test-real-browser-acceptance.mjs`)

正在执行:
- 🔄 运行 REAL_BROWSER_FINAL_ACCEPTANCE

## 测试素材

- 文件: `assets/user-library/headphones-launch/8004703-uhd_3840_2160_25fps.mp4`
- 大小: 67.04 MB (在 64 MiB 限制内)
- 状态: ✅ 已验证存在

## 验收脚本

新脚本 `test-real-browser-acceptance.mjs` 特性：
- 真实 Playwright 浏览器自动化
- 追踪 operation/job/revision 流程
- 捕获所有 console/network/page errors
- 分阶段验收 (A: Cold Start, B: Upload, C: First Creation, D: 3x Edits, E: Quality)
- 关键帧截图
- 完整证据收集
- 不依赖简单 DOM 检查

## 下一步

1. ✅ 修复文档引用
2. ✅ 确定 OpenClaw 版本策略（保持 2026.6.11）
3. ✅ 保留 repair script（用户要求）
4. ✅ 重写 browser E2E
5. 🔄 执行真实验收
6. ⏳ 根据验收结果修复剩余问题
7. ⏳ 循环直到完全通过

## 最终验收标准

- [ ] Cold start: Gateway + Backend 正常启动
- [ ] New session: 不出现 unknown parent session
- [ ] Upload: 真实商品视频上传成功
- [ ] Create: 复杂电商任务自动执行
- [ ] Edit 1: 同 session 第一次编辑成功，新 revision
- [ ] Edit 2: 同 session 第二次编辑成功，新 revision
- [ ] Edit 3: 同 session 第三次编辑成功，新 revision
- [ ] Quality: 最终视频通过视觉审片
- [ ] No errors: 整个流程无未解决异常
