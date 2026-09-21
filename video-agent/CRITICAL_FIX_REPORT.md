# 关键问题修复报告

## 问题发现时间
2026-09-21

## 问题严重程度
**CRITICAL** - 导致所有Agent运行时工具调用失败

## 问题现象
用户反馈：开启对话后14个插件全部显示ERROR，Agent任务突然终止并报错：
```
I can't use the tool "read" here because it isn't available. 
I need to stop retrying it and answer without that tool.
```

截图证据：`protein_tub.png`（显示连续的"Tool error Read × ERROR"）

## 根本原因分析

### 1. 误导性的自然语言指令
所有业务Skills（7个产品场景Skills）的"Tool order"章节都使用了自然语言描述：
```markdown
## Tool order
Read project; search relevant resources; validate scope; submit job; poll status; inspect results
```

### 2. Agent错误理解
Agent将自然语言描述理解为**工具调用指令**：
- "Read project" → 尝试调用**Read工具**
- "search relevant resources" → 尝试调用**search工具**
- 但OpenClaw runtime**只授权了6个video_*工具**

### 3. 工具权限冲突
**AGENTS.md明确声明：**
```markdown
The only allowed control tools are the six video_* tools registered by the
commerce-engine plugin. The video-agent session has no Read, Write, Edit, 
Bash, or web tools.
```

**Agent尝试调用未授权工具 → 14次ERROR → 终止执行**

## 影响范围
- ✅ commerce-product-launch
- ✅ commerce-product-detail  
- ✅ commerce-product-demo
- ✅ commerce-product-collection
- ✅ commerce-product-faq
- ✅ commerce-product-promotion
- ✅ commerce-general

**所有产品场景Skills都存在此问题**

## 修复方案

### 1. 重写Tool order为明确的工具调用步骤
**修复前：**
```markdown
## Tool order
Read project; search relevant resources; validate scope; submit job; poll status; inspect results
```

**修复后：**
```markdown
## Tool order
1. Call `video_project_open` to read the current project state and bind projectId/baseRevisionId
2. Call `video_task` with the natural-language request (the service will search resources internally)
3. Call `video_job_status` to poll job progress until completion
4. Call `video_result` to list the final artifacts and delivery state
```

### 2. 关键改进点
- ✅ 使用编号列表明确执行顺序
- ✅ 用反引号包裹工具名（\`video_project_open\`）
- ✅ 说明每个工具调用的目的和参数
- ✅ 移除所有误导性自然语言（"Read project", "search"等）

## 已修复的文件
1. `runtime/openclaw/skills/commerce-product-launch/SKILL.md`
2. `runtime/openclaw/skills/commerce-product-detail/SKILL.md`
3. `runtime/openclaw/skills/commerce-product-demo/SKILL.md`
4. `runtime/openclaw/skills/commerce-product-collection/SKILL.md`
5. `runtime/openclaw/skills/commerce-product-faq/SKILL.md`
6. `runtime/openclaw/skills/commerce-product-promotion/SKILL.md`
7. `runtime/openclaw/skills/commerce-general/SKILL.md`
8. `runtime/openclaw/skills/commerce-audio-captions/SKILL.md`
9. `runtime/openclaw/skills/commerce-edit-and-variant/SKILL.md`
10. `runtime/openclaw/skills/commerce-hyperframes/SKILL.md`
11. `runtime/openclaw/skills/commerce-orchestrator/SKILL.md`
12. `runtime/openclaw/skills/commerce-recovery-delivery/SKILL.md`

**总计：12个Skills全部修复**

## 验证措施

### 1. 创建验证脚本
创建了 `scripts/validate-skill-tool-instructions.mjs` 用于检测：
- ❌ 禁止的自然语言模式（"Read project", "search resources"）
- ✅ 必需的明确工具引用（\`video_project_open\`等）
- ✅ 推荐的编号步骤格式

### 2. 手动验证结果
✅ 所有12个Skills的Tool order章节都已改为明确的工具调用格式
✅ 不再包含任何误导性自然语言指令
✅ 所有工具引用都使用反引号包裹

## 为什么之前的验收测试没有发现？

### 根本原因分析
1. **测试工具权限配置不同**
   - 之前测试可能使用了不同的工具授权配置
   - 或者在主仓库环境（有Read工具）而非纯OpenClaw环境测试

2. **Skills内容理解测试不足**
   - 只测试了工具调用结果，没有测试Skills的指令是否会被误解
   - 没有在**严格的6工具限制环境**下验证所有场景

3. **验收清单缺失此项检查**
   - 之前的验收测试没有包含"Skills指令明确性"检查项
   - 没有验证"Agent是否会尝试调用未授权工具"

## 改进的验收流程

### 新增验收检查项
1. ✅ **工具权限边界测试**
   - 在严格的6工具限制环境运行所有Skills
   - 监控是否有未授权工具调用尝试

2. ✅ **Skills指令明确性检查**
   - 运行 `validate-skill-tool-instructions.mjs`
   - 确保所有工具引用都是明确的反引号包裹格式

3. ✅ **真实用户场景回归测试**
   - 在OpenClaw Control界面启动真实Agent会话
   - 验证不会出现"Tool error"
   - 验证Agent能正常完成任务而不中途终止

## 后续行动

### 立即行动（已完成）
- [x] 修复所有12个Skills的Tool order章节
- [x] 创建验证脚本防止问题再次出现
- [x] 手动验证所有修复

### 短期行动（需要完成）
- [ ] 在真实OpenClaw Control环境重新测试所有产品场景
- [ ] 将 `validate-skill-tool-instructions.mjs` 加入CI/CD流程
- [ ] 更新验收清单，加入"工具权限边界测试"

### 长期改进
- [ ] 建立Skills编写规范文档
- [ ] 创建Skills模板，预防类似问题
- [ ] 增强测试覆盖：不同权限配置下的回归测试

## 责任声明
此问题是由于Skills编写时使用了自然语言描述而非明确的工具调用指令导致的。之前的验收测试未能在严格的权限限制环境下验证，导致问题遗漏到真实使用场景。

## 修复确认
所有修复已完成，但**必须在真实OpenClaw Control环境重新验证**才能确认问题完全解决。

---
修复日期：2026-09-21  
修复人：Claude Opus 5 (1M context)  
审查状态：等待真实环境验证
