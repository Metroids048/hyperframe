# 🧪 OpenClaw Control 手动测试指南

## 测试目的

验证修复后的系统在真实环境中：
- ✅ 不再出现"Tool error: Read"
- ✅ Agent不报告"tool isn't available"
- ✅ 所有12个产品场景正常工作
- ✅ 只调用授权的6个video_*工具

## 前置准备

### 1. 启动服务

```bash
# 进入项目目录
cd /Users/a1234/Desktop/hyperframe-main/video-agent

# 启动video-agent服务
node server.mjs

# 验证服务运行
curl http://127.0.0.1:3020
```

**预期输出：** 服务正常响应

### 2. 打开OpenClaw Control

```bash
# 在浏览器中访问
http://127.0.0.1:18789
```

### 3. 选择配置

在OpenClaw Control界面：
1. 左侧选择 **commerce-control** 配置
2. 确认显示"控制"标签

---

## 测试场景清单

### ✅ 基础测试：项目列表

**测试步骤：**
1. 在聊天框中输入："Video Project List"
2. 点击发送

**预期结果：**
- ✅ 显示"Activity: 1 tool - Video Project List"
- ✅ 工具调用成功，无ERROR标记
- ✅ 返回项目列表或"暂无项目"消息
- ✅ Agent回复简洁明确

**如果失败：**
- ❌ 出现"Tool error: Read" - 截图并报告
- ❌ 出现"tool isn't available" - 截图并报告
- ❌ 任务中途终止 - 截图并报告

---

### ✅ 核心场景 1：产品发布

**测试步骤：**
1. 输入："创建一个蛋白粉产品发布视频"
2. 点击发送

**预期结果：**
- ✅ 识别为commerce-product-launch场景
- ✅ 依次调用：
  1. `video_project_open` - 无ERROR
  2. `video_task` - 无ERROR
  3. `video_job_status` - 无ERROR
  4. `video_result` - 无ERROR
- ✅ 任务完成，返回视频结果
- ✅ 整个过程无"Tool error"

**如果失败：**
- 记录第一个失败的工具调用
- 记录ERROR消息
- 截图并报告

---

### ✅ 核心场景 2：产品详情

**测试步骤：**
1. 输入："生成蛋白粉的产品详情视频，突出成分和功效"
2. 点击发送

**预期结果：**
- ✅ 识别为commerce-product-detail场景
- ✅ 工具调用顺序正确
- ✅ 无ERROR
- ✅ 返回详情视频

---

### ✅ 核心场景 3：产品演示

**测试步骤：**
1. 输入："制作蛋白粉使用演示视频"
2. 点击发送

**预期结果：**
- ✅ 识别为commerce-product-demo场景
- ✅ 工具调用成功
- ✅ 无ERROR
- ✅ 返回演示视频

---

### ✅ 扩展场景测试（可选）

**快速测试其他9个场景：**

| 场景 | 测试输入 | Skill名称 |
|------|---------|-----------|
| 产品合集 | "制作蛋白粉产品合集视频" | commerce-product-collection |
| 常见问题 | "生成蛋白粉FAQ视频" | commerce-product-faq |
| 促销活动 | "创建蛋白粉促销视频" | commerce-product-promotion |
| 通用视频 | "生成蛋白粉品牌介绍视频" | commerce-general |
| 字幕配音 | "给现有视频添加字幕和配音" | commerce-audio-captions |
| 编辑变体 | "调整视频时长为15秒" | commerce-edit-and-variant |
| 超级帧 | "使用HyperFrames增强视频" | commerce-hyperframes |
| 编排任务 | "批量生成3个产品视频" | commerce-orchestrator |
| 恢复交付 | "恢复上次失败的任务" | commerce-recovery-delivery |

**每个场景的验证点：**
- ✅ 无"Tool error"
- ✅ 无"tool isn't available"
- ✅ 任务正常完成

---

## 日志验证

### 1. 检查video-agent日志

```bash
tail -f /tmp/video-agent.log
```

**验证点：**
- ✅ 只看到`video_*`工具调用
- ❌ 不应该出现`Read`、`Write`、`Edit`等工具

### 2. 检查OpenClaw Control日志

在浏览器开发者工具（F12）的Console中：
- ✅ 无红色ERROR
- ✅ 工具调用日志正常

---

## 测试结果记录表

### 基础测试

| 测试项 | 通过 | 失败 | 备注 |
|--------|------|------|------|
| 项目列表 | ⬜ | ⬜ | |

### 核心场景

| 场景 | 通过 | 失败 | ERROR信息 |
|------|------|------|-----------|
| 产品发布 | ⬜ | ⬜ | |
| 产品详情 | ⬜ | ⬜ | |
| 产品演示 | ⬜ | ⬜ | |

### 扩展场景

| 场景 | 通过 | 失败 | ERROR信息 |
|------|------|------|-----------|
| 产品合集 | ⬜ | ⬜ | |
| 常见问题 | ⬜ | ⬜ | |
| 促销活动 | ⬜ | ⬜ | |
| 通用视频 | ⬜ | ⬜ | |
| 字幕配音 | ⬜ | ⬜ | |
| 编辑变体 | ⬜ | ⬜ | |
| 超级帧 | ⬜ | ⬜ | |
| 编排任务 | ⬜ | ⬜ | |
| 恢复交付 | ⬜ | ⬜ | |

---

## 失败处理流程

如果任何测试失败：

### 1. 收集信息
- 截图OpenClaw Control界面（包含ERROR消息）
- 复制完整的工具调用日志
- 记录失败的场景和输入

### 2. 检查关键点
- ERROR消息中是否提到"Read"工具？
- ERROR消息中是否提到"tool isn't available"？
- 是哪个Skill触发的问题？

### 3. 报告问题
将以下信息发送给开发者：
```
失败场景：[场景名称]
用户输入：[原始输入]
ERROR消息：[完整ERROR]
截图：[附上截图]
```

---

## 成功标准

**✅ 测试通过的条件：**
1. 所有核心场景（项目列表、产品发布、产品详情、产品演示）通过
2. 无任何"Tool error: Read"
3. 无任何"tool isn't available"错误
4. Agent能正常完成任务并返回结果
5. 日志中只出现授权的6个`video_*`工具

**⏳ 部分通过：**
- 核心场景通过，但扩展场景有问题 → 需要进一步修复

**❌ 测试失败：**
- 核心场景失败 → 立即报告，系统不可用

---

## 常见问题排查

### Q1: 服务启动失败
```bash
# 检查端口占用
lsof -i :3020

# 清理旧进程
kill -9 [PID]

# 重新启动
node server.mjs
```

### Q2: OpenClaw Control无法访问
```bash
# 检查OpenClaw服务
curl http://127.0.0.1:18789

# 如果无响应，重启OpenClaw
```

### Q3: 工具调用超时
- 检查网络连接
- 检查video-agent服务是否正常响应
- 查看服务日志

---

**测试时间：** 预计30-60分钟  
**优先级：** 🔴 高 - 阻塞性问题  
**测试人员：** 需要用户手动执行
