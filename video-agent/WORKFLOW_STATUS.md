# OpenClaw Video Agent 工作流 - 状态报告

**日期**: 2026-09-21  
**分支**: codex/webui-agent-workflow  
**状态**: ✅ 服务就绪，等待浏览器端验收测试

---

## ✅ 已完成的工作

### 1. 服务架构修复

#### 1.1 Bridge Server配置
- ✅ 修复端口硬编码问题（3020 → 环境变量）
- ✅ 环境变量读取：`VIDEO_AGENT_PORT`
- ✅ 默认端口：3024
- ✅ 代码位置：`bridge-server.mjs:5`

#### 1.2 启动脚本增强
- ✅ 更新桌面启动脚本：`OpenClaw视频编辑.command`
- ✅ 增加服务健康检查
- ✅ 增加进程清理逻辑
- ✅ 增加服务验证（Gateway + Backend）
- ✅ 增加可选的自动打开浏览器功能

#### 1.3 诊断工具完善
- ✅ 创建连接诊断脚本：`scripts/diagnose-openclaw-connection.mjs`
- ✅ 创建插件功能测试：`test-openclaw-plugin.mjs`
- ✅ 创建完整连接测试：`test-openclaw-connection.mjs`
- ✅ 创建UI探测工具：`explore-openclaw-ui.mjs`

### 2. 服务验证

#### 2.1 Gateway (端口18789)
```bash
✅ curl http://127.0.0.1:18789/
✅ 响应正常
```

#### 2.2 Backend (端口3024)
```bash
✅ curl http://127.0.0.1:3024/projects
✅ 返回项目列表（1个测试项目）
```

#### 2.3 Bridge Server API
```bash
✅ POST /video - 创建视频任务
✅ GET /video/:jobId - 查询任务状态  
✅ GET /projects - 获取项目列表
✅ GET /health - 健康检查
```

#### 2.4 插件功能测试
```bash
✅ Video Task工具正常
   - 任务ID: job-85f077d4-ea60-454f-b805-f0290fcd5491
   - 项目ID: project-02da2ee2
   - 状态: queued → completed (100%)

✅ Video Project List工具正常
   - 找到2个项目
   - 最新项目: 测试商品视频 (completed)
```

### 3. 文档和指南

- ✅ 手动测试指南：`MANUAL_TEST_GUIDE.md`
- ✅ 服务启动说明
- ✅ 常见问题排查
- ✅ 验收标准清单

---

## 🧪 待验收测试项

### A. 基础功能测试（浏览器端）

**环境**: OpenClaw WebUI (http://127.0.0.1:18789)  
**会话**: commerce-control

#### A.1 查看项目列表
```
输入: "查看我的视频项目列表"
预期: 
  - ✅ 返回项目列表（至少1个）
  - ❌ 无"Tool error"提示
状态: ⏳ 待测试
```

#### A.2 创建视频任务
```
输入: "帮我生成一个iPhone 15 Pro的商品视频，专业风格"
预期:
  - ✅ 返回任务ID和项目ID
  - ✅ 任务状态: queued/completed
  - ❌ 无"Tool error"提示
状态: ⏳ 待测试
```

#### A.3 查询任务状态
```
输入: "查看任务 [任务ID] 的状态"
预期:
  - ✅ 返回进度和状态
  - ✅ 状态: 完成 (100%)
状态: ⏳ 待测试
```

### B. 复杂场景测试（未开始）

#### B.1 实质性视频生成
```
场景: 完整的商品信息 → 视频制作
要素:
  - 商品名称、描述、分类
  - 视频风格选择
  - 叙事结构
  - 镜头设计
  - 音频配置
状态: ⏳ 待测试
```

#### B.2 视频编辑流程
```
场景: 制作 → 重剪 → 选择性恢复
步骤:
  1. 生成初始视频
  2. 修改开场白/结尾
  3. 恢复某个片段
状态: ⏳ 待测试
```

#### B.3 多商品场景
```
场景: 不同商品类型的视频生成
商品:
  - 电子产品（iPhone）
  - 服装（T恤）
  - 食品（咖啡）
状态: ⏳ 待测试
```

### C. 质量评审（未开始）

#### C.1 视频质量检查
```
评审维度:
  - 叙事连贯性 (0-30分)
  - 镜头设计 (0-25分)
  - 视觉设计 (0-25分)
  - 音频质量 (0-20分)
目标: ≥85分
状态: ⏳ 待测试
```

#### C.2 硬伤检查
```
检查项:
  - ❌ 商品信息错误
  - ❌ 字幕错位/错误
  - ❌ 保持项被破坏
  - ❌ 音频缺失/错位
状态: ⏳ 待测试
```

### D. 性能和稳定性（未开始）

#### D.1 性能指标
```
测量项:
  - 响应时间（WebUI → Backend）
  - 视频制作时长
  - 并发任务处理
状态: ⏳ 待测试
```

#### D.2 异常恢复
```
测试场景:
  - 页面刷新
  - 网络中断重连
  - 任务取消
状态: ⏳ 待测试
```

---

## 🚧 已知限制

### 1. 自动化测试环境
- ⚠️ Claude Code环境无法启动Playwright可见浏览器
- ⚠️ 需要手动在真实浏览器中测试
- ✅ 已提供UI探测工具和手动测试指南

### 2. Bridge Server功能
- ℹ️ 当前为模拟实现（返回测试数据）
- ℹ️ 未连接到真实的video-agent服务
- ⏳ 需要后续集成真实的视频生成引擎

### 3. OpenClaw页面结构
- ⚠️ 标准选择器无法定位输入框和按钮
- ⚠️ 需要手动测试或更深入的DOM分析
- ✅ 已生成初始页面截图：`openclaw-ui-initial.png`

---

## 📋 下一步行动

### 立即执行（用户手动）

1. **打开OpenClaw**
   ```bash
   # 双击桌面图标，或在浏览器访问：
   http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c
   ```

2. **执行A组测试**
   - 按照 `MANUAL_TEST_GUIDE.md` 逐项测试
   - 记录每个测试的结果（✓/✗）
   - 截图保存成功和失败的界面

3. **反馈测试结果**
   - 是否看到"Tool error"？
   - 插件是否正常返回数据？
   - 有哪些错误信息？

### 后续工作（测试通过后）

4. **集成真实video-agent**
   - 连接到实际的视频生成服务
   - 实现完整的任务队列
   - 处理异步任务状态更新

5. **执行B组和C组测试**
   - 复杂视频生成场景
   - 编辑和恢复流程
   - 质量评审和硬伤检查

6. **性能优化和稳定性测试**
   - 并发处理
   - 长时间运行
   - 异常恢复

---

## 🔧 快速命令参考

```bash
# 启动服务
双击桌面: OpenClaw视频编辑.command

# 检查服务状态
curl http://127.0.0.1:18789/
curl http://127.0.0.1:3024/projects

# 运行诊断
cd /Users/a1234/Desktop/hyperframe-main/video-agent
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/diagnose-openclaw-connection.mjs

# 测试插件
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node test-openclaw-plugin.mjs

# 查看日志
tail -50 ~/.openclaw/hyperframe/backend-manual.log

# 停止服务
python3 scripts/openclaw-local.py stop
```

---

## 📊 完成度统计

| 类别 | 完成 | 待测试 | 总计 | 进度 |
|------|------|--------|------|------|
| 服务架构 | 8 | 0 | 8 | 100% |
| 诊断工具 | 4 | 0 | 4 | 100% |
| API测试 | 3 | 0 | 3 | 100% |
| 浏览器测试 | 0 | 3 | 3 | 0% |
| 复杂场景 | 0 | 3 | 3 | 0% |
| 质量评审 | 0 | 2 | 2 | 0% |
| 性能测试 | 0 | 2 | 2 | 0% |
| **总计** | **15** | **10** | **25** | **60%** |

---

**核心阻塞**: 需要在真实浏览器中完成A组测试，验证OpenClaw插件功能无ERROR后，才能继续B/C/D组测试。

**当前状态**: ✅ 所有后端服务正常，✅ API测试通过，⏳ 等待浏览器端用户验收。
