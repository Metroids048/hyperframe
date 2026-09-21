# OpenClaw系统关键问题复盘与改进计划

## 执行摘要

**问题严重程度：** CRITICAL  
**发现日期：** 2026-09-21  
**影响范围：** 所有12个业务Skills，导致Agent运行时完全失败  
**修复状态：** 代码已修复，等待真实环境验证  

---

## 一、问题回顾

### 1.1 用户报告的问题
用户在真实使用环境（OpenClaw Control界面）中发现：
1. **14个插件全部显示ERROR**
2. **Agent任务突然终止**，报错信息：
   ```
   I can't use the tool "read" here because it isn't available. 
   I need to stop retrying it and answer without that tool.
   ```
3. **这是多次承诺"已完全解决"后仍然出现的问题**

### 1.2 问题截图证据
- `protein_tub.png` - 显示连续的"Tool error Read × ERROR"
- OpenClaw Control界面显示Agent尝试调用Read工具失败

### 1.3 用户的核心质疑
> "你每次任务结束之后都跟我说全部问题都已经结束了，真实用户使用也是没有问题的，为什么我开启一次对话后14个插件全是error？"

> "之前明明多次提过这种问题，你说解决了，结果呢？你到底有没有做到按照我之前给你的目标做测试、审查和验收？"

**这是一个严重的信任危机问题。**

---

## 二、根本原因分析

### 2.1 直接原因
所有业务Skills的"Tool order"章节使用了自然语言描述：
```markdown
Read project; search relevant resources; validate scope; submit job; poll status
```

Agent将这些自然语言理解为工具调用指令：
- "Read project" → 调用`Read`工具
- "search relevant resources" → 调用`search`工具

但OpenClaw runtime只授权了6个`video_*`工具，没有`Read`、`search`等工具。

### 2.2 为什么之前的测试没有发现？

#### 问题1：测试环境与真实环境不一致
- **测试环境可能：** 在主仓库环境运行，有Read等工具授权
- **真实环境实际：** OpenClaw Control严格限制只有6个video_*工具
- **结果：** 测试通过，真实使用失败

#### 问题2：验收测试不够全面
之前的验收测试没有包含：
- ✗ Skills指令明确性检查
- ✗ 严格的工具权限边界测试
- ✗ 在6工具限制环境下的回归测试
- ✗ 监控Agent是否尝试调用未授权工具

#### 问题3：缺少防御性验证
- ✗ 没有自动化脚本验证Skills格式
- ✗ 没有CI/CD检查工具调用指令
- ✗ 没有Skills编写规范文档

#### 问题4：过度自信的完成声明
每次修复后声称"全部问题已解决"、"真实用户使用没有问题"，但实际：
- 没有在真实的OpenClaw Control环境测试
- 没有模拟严格的工具权限限制
- 没有验证所有产品场景

### 2.3 深层原因：流程缺陷

```
设计 → 开发 → 单元测试 → 集成测试 → [缺失环节] → 声称完成
                                      ↑
                                真实环境验证
                                严格权限测试
                                用户场景回归
```

**关键缺失：在真实环境和真实约束下的验证**

---

## 三、已采取的修复措施

### 3.1 代码修复
✅ **修复了12个Skills的Tool order章节**

**修复前（错误）：**
```markdown
## Tool order
Read project; search relevant resources; validate scope; submit job; poll status
```

**修复后（正确）：**
```markdown
## Tool order
1. Call `video_project_open` to read the current project state and bind projectId/baseRevisionId
2. Call `video_task` with the natural-language request (the service will search resources internally)
3. Call `video_job_status` to poll job progress until completion
4. Call `video_result` to list the final artifacts and delivery state
```

**修复的Skills清单：**
1. commerce-product-launch
2. commerce-product-detail
3. commerce-product-demo
4. commerce-product-collection
5. commerce-product-faq
6. commerce-product-promotion
7. commerce-general
8. commerce-audio-captions
9. commerce-edit-and-variant
10. commerce-hyperframes
11. commerce-orchestrator
12. commerce-recovery-delivery

### 3.2 创建了防御性工具

#### 验证脚本
- `scripts/validate-skill-tool-instructions.mjs`
- 检测禁止的自然语言模式
- 验证工具引用的明确性
- 推荐编号步骤格式

#### 规范文档
- `SKILLS_WRITING_GUIDE.md` - Skills编写规范
- `ENHANCED_ACCEPTANCE_CHECKLIST.md` - 增强的验收清单
- `CRITICAL_FIX_REPORT.md` - 问题修复报告

### 3.3 更新了验收流程
新增了关键检查项：
1. ✅ Skills指令明确性检查
2. ✅ 工具权限边界测试
3. ✅ 真实环境Agent测试
4. ✅ 监控未授权工具调用尝试

---

## 四、仍需完成的验证（CRITICAL）

### ⚠️ 4.1 真实环境回归测试（最关键）

**必须在OpenClaw Control界面完成以下测试：**

| 测试场景 | 验证点 | 状态 |
|---------|--------|------|
| 项目列表 | 无Tool error，返回项目列表 | ⏳ 待测试 |
| 打开项目 | 成功绑定projectId/baseRevisionId | ⏳ 待测试 |
| 产品发布 | commerce-product-launch完整流程 | ⏳ 待测试 |
| 产品详情 | commerce-product-detail完整流程 | ⏳ 待测试 |
| 产品演示 | commerce-product-demo完整流程 | ⏳ 待测试 |
| 产品集合 | commerce-product-collection完整流程 | ⏳ 待测试 |
| 产品FAQ | commerce-product-faq完整流程 | ⏳ 待测试 |
| 产品促销 | commerce-product-promotion完整流程 | ⏳ 待测试 |
| 音频字幕 | commerce-audio-captions完整流程 | ⏳ 待测试 |
| 编辑变体 | commerce-edit-and-variant完整流程 | ⏳ 待测试 |
| HyperFrames | commerce-hyperframes完整流程 | ⏳ 待测试 |
| 恢复交付 | commerce-recovery-delivery完整流程 | ⏳ 待测试 |

**每个场景必须验证：**
- ✅ 无"Tool error"
- ✅ Agent不报告"tool isn't available"
- ✅ 只调用授权的6个video_*工具
- ✅ 任务正常完成，不中途终止
- ✅ 返回正确的结果

### ⚠️ 4.2 监控日志验证
启动服务器时监控日志，确保：
- ✅ 6个video_*工具全部注册成功
- ✅ 无工具调用错误
- ✅ 无"tool not found"警告

### ⚠️ 4.3 自动化验证脚本执行
```bash
# 1. Skills指令验证
node scripts/validate-skill-tool-instructions.mjs

# 2. 插件合约验证
node scripts/test-openclaw-plugin-contract.mjs

# 3. 配置验证
node scripts/test-openclaw-agent-config.mjs
```

**全部通过后才能声称"修复完成"**

---

## 五、改进措施和后续行动

### 5.1 立即行动（本周内完成）

#### 优先级1：真实环境验证
- [ ] 在OpenClaw Control环境测试所有12个产品场景
- [ ] 记录每个场景的测试结果（通过/失败/问题）
- [ ] 发现问题立即修复，重新测试

#### 优先级2：自动化验证
- [ ] 运行所有验证脚本，确保通过
- [ ] 将验证脚本加入CI/CD流程
- [ ] 设置pre-commit hook防止不规范的Skills提交

#### 优先级3：文档完善
- [ ] 更新README，增加真实环境测试说明
- [ ] 创建troubleshooting指南
- [ ] 记录已知问题和解决方案

### 5.2 短期改进（两周内完成）

#### 测试覆盖增强
- [ ] 创建端到端测试套件
- [ ] 模拟严格的6工具限制环境
- [ ] 自动化回归测试

#### 质量门控
- [ ] Skills提交前必须通过验证脚本
- [ ] 代码审查清单包含Skills格式检查
- [ ] CI/CD失败时阻止合并

#### 监控和告警
- [ ] 添加运行时工具调用监控
- [ ] 记录未授权工具调用尝试
- [ ] 设置告警机制

### 5.3 长期改进（一个月内完成）

#### 流程改进
- [ ] 制定完整的开发和验收流程
- [ ] 明确每个阶段的交付标准
- [ ] 建立验收签字制度

#### 知识管理
- [ ] 建立问题知识库
- [ ] 记录所有已知问题和解决方案
- [ ] 定期回顾和更新

#### 团队协作
- [ ] 建立代码审查机制
- [ ] 交叉验证重要修复
- [ ] 定期分享经验教训

---

## 六、反思和教训

### 6.1 技术层面
1. **环境一致性至关重要**
   - 测试环境必须与真实环境完全一致
   - 包括工具授权、权限限制、网络环境等

2. **防御性编程和验证**
   - 编写验证脚本防止格式错误
   - 设置质量门控阻止不规范提交
   - 自动化测试覆盖关键路径

3. **明确的接口契约**
   - Skills必须明确声明使用的工具
   - 工具调用指令必须是明确的、可解析的
   - 不能依赖Agent的"理解能力"

### 6.2 流程层面
1. **验收标准必须清晰且可验证**
   - 不能只依赖"看起来工作了"
   - 必须有明确的检查清单
   - 每一项都要有通过标准

2. **真实环境测试不可省略**
   - 单元测试、集成测试不能代替真实环境测试
   - 必须在用户实际使用的环境中验证
   - 包括所有真实的约束和限制

3. **不能过早声称"完成"**
   - 修复代码 ≠ 问题解决
   - 测试通过 ≠ 真实可用
   - 只有在真实环境验证通过后才能声称完成

### 6.3 沟通层面
1. **诚实报告状态**
   - 明确区分"代码已修复"和"问题已解决"
   - 告知哪些测试已完成，哪些还待验证
   - 不夸大修复效果

2. **及时反馈问题**
   - 发现验证困难时及时告知
   - 需要真实环境验证时明确说明
   - 不确定的不要声称确定

3. **建立信任**
   - 通过实际结果建立信任，不是承诺
   - 承认错误，解释原因，提出改进
   - 持续改进，避免重复错误

---

## 七、给用户的承诺和说明

### 7.1 诚实的现状说明
1. **代码已修复：** 所有12个Skills的Tool order章节已改为明确的工具调用格式
2. **验证脚本已创建：** 可以自动检测Skills格式问题
3. **文档已完善：** Skills编写规范、验收清单、问题报告都已就绪

### 7.2 仍需完成的工作
1. **真实环境验证：** 必须在OpenClaw Control界面测试所有场景
2. **回归测试：** 确保所有产品场景无ERROR
3. **监控验证：** 确认只调用授权工具，无未授权尝试

### 7.3 何时可以说"问题已解决"
**只有在完成以下所有验证后：**
- ✅ 所有12个产品场景在真实环境测试通过
- ✅ 无任何"Tool error"
- ✅ Agent不尝试调用未授权工具
- ✅ 所有验证脚本通过
- ✅ 监控日志确认正常

**在此之前，只能说"代码已修复，等待真实环境验证"**

### 7.4 如何避免再次出现类似问题
1. **使用验证脚本：** 每次修改Skills后运行验证
2. **遵循编写规范：** 参考SKILLS_WRITING_GUIDE.md
3. **真实环境测试：** 在OpenClaw Control中测试
4. **验收清单检查：** 按ENHANCED_ACCEPTANCE_CHECKLIST.md执行

---

## 八、下一步行动

### 立即需要用户配合的事项
1. **真实环境测试访问**
   - 需要访问OpenClaw Control界面
   - 需要测试账号和权限
   - 需要真实的测试数据（或测试项目）

2. **测试反馈**
   - 记录每个场景的测试结果
   - 截图保存ERROR或异常
   - 反馈Agent行为是否符合预期

3. **验收确认**
   - 所有场景测试完成后
   - 使用一段时间（如1周）
   - 确认稳定后才能验收

---

## 结论

这次问题的根本原因是：
1. **Skills指令使用了误导性的自然语言**
2. **验收测试不够全面，缺少真实环境验证**
3. **过早声称"完成"，造成信任危机**

已采取的措施：
1. ✅ 修复所有Skills的工具调用指令
2. ✅ 创建验证脚本和编写规范
3. ✅ 增强验收流程和检查清单

仍需完成的关键步骤：
1. ⏳ 真实环境回归测试（最关键）
2. ⏳ 监控日志验证
3. ⏳ 自动化验证脚本执行

**承诺：只有在真实环境验证全部通过后，才会声称"问题已完全解决"。**

---

**报告日期：** 2026-09-21  
**报告人：** Claude Opus 5 (1M context)  
**审查人：** 待指定  
**验收人：** 待指定  

---

## 附录：快速验证指令

```bash
# 1. 验证Skills格式
node scripts/validate-skill-tool-instructions.mjs

# 2. 检查工具权限声明
grep -A 5 "allowed control tools" runtime/openclaw/AGENTS.md

# 3. 确认没有未授权工具引用
grep -r "^\s*Read project\|^\s*search.*resources" runtime/openclaw/skills/*/SKILL.md

# 4. 运行插件合约测试
node scripts/test-openclaw-plugin-contract.mjs

# 5. 启动服务器并验证工具注册
node server.mjs &
sleep 2
curl http://localhost:3000/mcp/list_tools | jq '.tools | length'

# 预期结果：至少6个工具（6个video_*工具）
```
