# OpenClaw视频编辑系统 - 增强验收测试清单

## 版本信息
- 版本：2.0（2026-09-21更新）
- 更新原因：修复关键的工具调用指令问题后的验收流程增强

---

## 第一部分：代码质量检查

### 1.1 Skills指令明确性检查 ⚠️ **NEW - CRITICAL**
- [ ] 运行 `scripts/validate-skill-tool-instructions.mjs`
- [ ] 验证所有Skills的Tool order章节使用明确的工具调用格式
- [ ] 确认没有误导性自然语言（"Read project", "search resources"等）
- [ ] 确认所有工具引用都用反引号包裹（\`video_project_open\`）

**检查命令：**
```bash
node scripts/validate-skill-tool-instructions.mjs
```

**期望结果：**
```
✅ All Skills use correct explicit tool call instructions
Validation passed!
```

### 1.2 工具权限边界检查 ⚠️ **NEW - CRITICAL**
- [ ] 验证AGENTS.md明确声明只允许6个video_*工具
- [ ] 检查openclaw.example.json的tools配置只包含授权工具
- [ ] 确认Skills不尝试调用Read、Write、Edit、Bash等未授权工具

**验证步骤：**
```bash
# 检查AGENTS.md的工具声明
grep -A 3 "allowed control tools" runtime/openclaw/AGENTS.md

# 检查Skills是否引用未授权工具
grep -r "Read\|Write\|Edit\|Bash" runtime/openclaw/skills/*/SKILL.md
```

**期望结果：**
- AGENTS.md明确列出6个video_*工具
- Skills中不包含对未授权工具的引用

### 1.3 类型和导入检查
- [ ] 运行 `node scripts/test-openclaw-plugin-contract.mjs`
- [ ] 验证所有module的exports与imports匹配
- [ ] 检查没有循环依赖

### 1.4 配置文件验证
- [ ] `config/commerce.json` 存在且格式正确
- [ ] `runtime/openclaw/openclaw.example.json` 包含所有必需字段
- [ ] `runtime/openclaw/skills-lock.json` 的hash与实际Skills匹配

---

## 第二部分：功能测试

### 2.1 插件注册和工具暴露
- [ ] 启动服务器：`node server.mjs`
- [ ] 验证6个video_*工具全部注册成功
- [ ] 检查日志无ERROR

**验证命令：**
```bash
curl http://localhost:3000/mcp/list_tools | jq '.tools | length'
```

**期望结果：** 输出 `6`（或更多如果包含其他工具）

### 2.2 真实环境Agent测试 ⚠️ **NEW - CRITICAL**
**必须在严格的6工具限制环境下测试！**

#### 测试环境准备
1. 启动OpenClaw Control界面
2. 选择 `commerce-control` agent配置
3. 验证工具授权只包含6个video_*工具

#### 测试场景清单
- [ ] **场景1：项目列表** - 验证能成功调用 `video_project_list`
- [ ] **场景2：打开项目** - 验证能成功调用 `video_project_open`
- [ ] **场景3：产品发布** - 使用commerce-product-launch skill
- [ ] **场景4：产品详情** - 使用commerce-product-detail skill
- [ ] **场景5：产品演示** - 使用commerce-product-demo skill
- [ ] **场景6：音频字幕** - 使用commerce-audio-captions skill
- [ ] **场景7：编辑变体** - 使用commerce-edit-and-variant skill

#### 每个场景必须验证：
1. ✅ **无工具调用错误** - 不出现"Tool error Read × ERROR"
2. ✅ **任务正常完成** - Agent不会中途终止
3. ✅ **只调用授权工具** - 监控日志确认只有video_*工具被调用
4. ✅ **返回正确结果** - 验证job status和result符合预期

**失败标准：**
- ❌ 出现任何"Tool error" 
- ❌ Agent报错"tool isn't available"
- ❌ 尝试调用Read/Write/Edit/Bash等未授权工具
- ❌ 任务在完成前突然终止

### 2.3 Skills路由测试
- [ ] 每个产品场景都能正确匹配对应的Skill
- [ ] Skill描述清晰，Agent能理解使用时机
- [ ] 跨Skill协作场景正常工作

---

## 第三部分：集成测试

### 3.1 完整工作流测试
选择一个真实用户场景，从头到尾测试：

**示例场景：创建新产品发布视频**
1. [ ] Agent调用 `video_project_list` 展示现有项目
2. [ ] 用户选择"new project"
3. [ ] Agent调用 `video_task` with `projectId: "new"`
4. [ ] Agent调用 `video_job_status` 轮询进度
5. [ ] Agent调用 `video_result` 获取最终产出
6. [ ] 验证整个流程无ERROR，Agent未尝试调用未授权工具

### 3.2 错误恢复测试
- [ ] 网络中断后重连恢复
- [ ] 任务失败后的状态查询
- [ ] 取消任务的正确处理

### 3.3 并发测试
- [ ] 同时处理多个Agent会话
- [ ] 不同项目的session隔离
- [ ] 工具调用无竞态条件

---

## 第四部分：文档和可维护性

### 4.1 文档完整性
- [ ] README.md包含OpenClaw集成说明
- [ ] AGENTS.md明确声明工具权限边界
- [ ] 每个Skill的SKILL.md格式规范且清晰
- [ ] 有清晰的troubleshooting指南

### 4.2 Skills质量
- [ ] 每个Skill有明确的Trigger和Exclude规则
- [ ] Tool order使用编号列表和明确的工具调用
- [ ] Preserve和Failure章节描述清晰
- [ ] Acceptance章节包含验证标准

### 4.3 维护性检查
- [ ] 创建了防御性验证脚本
- [ ] CI/CD包含Skills指令检查
- [ ] 有明确的Skills编写规范
- [ ] 有Skills模板供参考

---

## 第五部分：回归测试（针对已知问题）

### 5.1 工具调用指令问题（2026-09-21修复）
- [ ] 所有Skills的Tool order不包含自然语言描述
- [ ] Agent在6工具限制环境下能正常运行所有场景
- [ ] 不会出现"I can't use the tool 'read'"错误

### 5.2 其他历史问题
_（在此记录之前发现和修复的问题，确保不会再次出现）_

---

## 验收决策标准

### ✅ 通过验收的条件（ALL必须满足）
1. ✅ 所有代码质量检查通过
2. ✅ 所有功能测试场景无ERROR
3. ✅ 真实环境Agent测试全部通过（无工具调用错误）
4. ✅ 集成测试场景全部完成
5. ✅ 文档完整且准确
6. ✅ 回归测试确认已知问题不再出现

### ❌ 不通过验收的标准（ANY一项）
1. ❌ Skills指令验证脚本失败
2. ❌ Agent尝试调用未授权工具
3. ❌ 任何场景出现"Tool error"
4. ❌ Agent中途终止任务
5. ❌ 工具权限边界检查失败
6. ❌ 缺少关键文档或说明

---

## 验收签名

### 代码审查
- [ ] 审查人：________________
- [ ] 日期：________________
- [ ] 结果：通过 / 不通过
- [ ] 备注：________________

### 功能测试
- [ ] 测试人：________________
- [ ] 日期：________________
- [ ] 测试环境：________________
- [ ] 结果：通过 / 不通过
- [ ] 备注：________________

### 最终验收
- [ ] 验收人：________________
- [ ] 日期：________________
- [ ] 决策：通过 / 不通过 / 有条件通过
- [ ] 条件或备注：________________

---

## 附录：快速验收命令集

```bash
# 1. Skills指令验证
node scripts/validate-skill-tool-instructions.mjs

# 2. 工具权限边界检查
grep -A 3 "allowed control tools" runtime/openclaw/AGENTS.md
grep -r "^\s*Read project\|^\s*search.*resources" runtime/openclaw/skills/*/SKILL.md

# 3. 插件合约测试
node scripts/test-openclaw-plugin-contract.mjs

# 4. 配置验证
node scripts/test-openclaw-agent-config.mjs

# 5. 启动服务器并验证工具注册
node server.mjs &
sleep 2
curl http://localhost:3000/mcp/list_tools | jq '.tools | map(.name) | sort'

# 6. 真实环境测试（手动）
# 打开 http://127.0.0.1:18789/
# 选择 commerce-control agent
# 执行各个产品场景测试
```

---

**最后更新：2026-09-21**  
**更新原因：增加工具权限边界检查和Skills指令明确性验证**  
**下次更新：发现新的关键问题后立即更新**
