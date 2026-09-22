# OpenClaw 启动稳定性与成片质量修复方案

**日期**: 2026-09-22  
**状态**: 🔧 修复中  
**目标**: 解决启动失败 + 提升成片质量 + 打通浏览器真人验收

---

## 🔍 问题诊断

### 问题 1: 启动失败

**症状**:
```
cp: /Users/a1234/Desktop/hyperframe-main/video-agent/scripts/openclaw-local.py: 
Operation not permitted
启动失败
```

**根因**:
- `openclaw-local.py` 没有执行权限（`-rw-r--r--`）
- 可能有残留的僵尸进程占用端口 3024/18789
- 数据目录 `data/result-completion-projects` 存在权限冲突

**影响**:
- 用户无法通过 `.command` 文件启动系统
- Gateway 和 Backend 无法正常初始化

---

### 问题 2: 成片质量差

**症状**:
用户任务：
```
替换视频中的咖啡袋为蛋白粉袋（保持位置、大小、运动）
```

系统响应：
```json
{
  "mode": "clarify",
  "question": "请先打开要修改或派生的原生工程。",
  "source": "missing-base"
}
```

最终结果：
- `fetch failed`
- 路由失败，未生成成片
- 用户看到的是未处理的原始素材

**根因分析**:

#### 1. 路由判断错误
`lib/creative/message-routing.mjs:64`:
```javascript
if(!project.currentRevisionId&&['edit','variant','undo','redo','restore'].includes(result.mode))
  return {mode:'clarify',quote:message,revisionId:null,assetIds:[],
    question:'请先打开要修改或派生的原生工程。',source:'missing-base'};
```

**逻辑缺陷**:
- 系统把"上传视频 + 替换物体"误判为 `mode: 'edit'`
- 实际应该是 `mode: 'create'`（基于素材创作新成片）
- 用户上传的是**源素材**，不是"工程文件"

#### 2. 业务理解偏差
OpenClaw Control Agent 的指令（`lib/openclaw/commerce-agent-bridge.mjs:39-75`）：
```javascript
WORKFLOW:
1. For ANY creation request (new video, product video, edit request), 
   ALWAYS call video_task directly.
2. NEVER ask the user to select a project or provide a projectId.
```

**但实际行为**:
- 系统仍然要求"打开原生工程"
- 澄清环节阻断了创作流程
- 用户重新发送任务后遇到 `fetch failed`

#### 3. 缺少"基于上传视频直接创作"工作流
当前支持的模式：
- `create`: 从头创作（需要文字描述）
- `edit`: 编辑现有工程
- `variant`: 派生变体
- `recut`: 精剪

**缺失的模式**:
- `upload-and-create`: 上传视频素材 → 理解内容 → 应用编辑意图 → 输出成片

---

## ✅ 修复方案

### 修复 1: 启动稳定性

#### 1.1 权限修复
```bash
chmod +x scripts/openclaw-local.py
chmod +x scripts/start-openclaw-gateway.sh
chmod +x scripts/test-real-browser-acceptance.mjs
```

**状态**: ✅ 已完成

#### 1.2 僵尸进程清理
创建 `scripts/repair-openclaw-runtime.mjs`:
- 查找并终止占用端口的旧进程
- 清理过期的 `.video-agent-writer.lock`
- 验证环境配置完整性
- 测试启动并检查健康状态

**使用方法**:
```bash
node scripts/repair-openclaw-runtime.mjs
```

**状态**: ✅ 已创建

#### 1.3 启动验证
```bash
# 清理 + 修复 + 启动
node scripts/repair-openclaw-runtime.mjs

# 手动启动（可选）
python3 scripts/openclaw-local.py start

# 检查状态
curl http://127.0.0.1:3024/health
curl http://127.0.0.1:18789/healthz
```

---

### 修复 2: 成片质量提升

#### 2.1 路由逻辑修复

**目标**: 当用户上传视频素材并提出编辑需求时，应识别为"创作"而非"编辑工程"

**判断标准**:
```javascript
// 新增判断：上传视频 + 无 currentRevisionId + 明确物体替换/创作意图
if (!project.currentRevisionId && 
    input.attachmentIds.length > 0 && 
    /(?:替换|改成|换成|创作|制作|生成)/.test(message)) {
  return { mode: 'create', source: 'upload-and-create' };
}
```

**修改位置**: `lib/creative/message-routing.mjs:64` 之前插入

#### 2.2 Commerce Agent 指令强化

**当前问题**:
- 指令说"ALWAYS call video_task"
- 但路由层仍然拦截并要求"打开工程"

**强化方案**:
在 `lib/openclaw/commerce-agent-bridge.mjs:39-75` 补充：
```javascript
CRITICAL: 上传视频素材的创作请求
- 用户上传 .mp4/.mov 视频文件
- 描述要对视频做什么（替换物体、添加字幕、重新剪辑等）
- projectId 为 null 或不存在 currentRevisionId
→ 这是「基于素材创作」，mode 应为 'create'，不是 'edit'
→ 不要要求"打开原生工程"
→ 直接调用 video_task，服务端会自动创建项目并分析素材
```

#### 2.3 创作工作流增强

**新增处理路径**: `lib/creative/service.mjs`

```javascript
// 识别"上传视频 + 创作意图"
function isUploadedVideoCreation(project, message, attachments) {
  return (
    !project.currentRevisionId &&
    attachments.length > 0 &&
    attachments.some(a => a.kind === 'video') &&
    /(?:替换|改成|换成|创作|制作|生成|把.*改|让.*变)/.test(message)
  );
}

// 构建分析 + 编辑工作流
async function executeUploadedVideoCreation(project, input) {
  // 1. 分析上传的视频素材（场景、物体、时长、动作）
  // 2. 理解用户意图（替换什么、保持什么）
  // 3. 规划编辑操作（物体追踪、替换、合成）
  // 4. 执行 HyperFrames 工作流
  // 5. 输出成片
}
```

---

### 修复 3: 浏览器真人验收

#### 3.1 验收脚本
已创建 `scripts/test-real-browser-acceptance.mjs`：

**测试流程**:
```
Phase A: Cold Start (冷启动)
  ├─ 启动 Gateway + Backend
  ├─ 自动认证
  └─ 验证聊天界面加载

Phase B: Upload Real Video (上传真实素材)
  ├─ 上传 headphones 视频
  └─ 确认附件加载

Phase C: First Complex Creation (首次复杂创作)
  ├─ 发送 25-35s 9:16 电商视频任务
  ├─ 追踪 job/revision
  └─ 验证成片生成

Phase D: Continuous Edits (同 Session 三轮精剪)
  ├─ Round 1: 重做前 6 秒品牌广告感
  ├─ Round 2: 中段叙事重组
  └─ Round 3: 最终审片

Phase E: Quality Inspection (质量验收)
  ├─ 截取关键帧
  ├─ 检查清单（12 项）
  └─ 生成证据包
```

**运行方式**:
```bash
# 确保系统已启动
python3 scripts/openclaw-local.py start

# 运行浏览器验收（保持 30 秒供人工检查）
node scripts/test-real-browser-acceptance.mjs
```

**输出**:
- 截图: `codex-evidence/openclaw-closeout/browser-acceptance/screenshots/`
- 录屏: `codex-evidence/openclaw-closeout/browser-acceptance/videos/`
- 证据: `codex-evidence/openclaw-closeout/browser-acceptance/evidence-*.json`

#### 3.2 质量检查清单
验收脚本会生成 12 项质量清单：
- ✓ 商品清楚、无错误裁切、无视觉损坏
- ✓ 前 3 秒有明确 Hook
- ✓ 中段有信息推进，不像流水账
- ✓ 结尾有明确收束
- ✓ 没有明显重复素材凑时间
- ✓ 镜头长度合理，节奏有变化
- ✓ 转场不生硬
- ✓ 能看出 HyperFrames 设计
- ✓ 字幕可读、一致、不越界、不遮挡商品
- ✓ 无爆音、无意外静音、BGM 不压重要声音
- ✓ 无黑帧、无 corrupt frame、无 placeholder
- ✓ MP4 可正常播放和下载

---

## 🚀 执行计划

### Step 1: 立即修复启动问题 (5 分钟)
```bash
cd /Users/a1234/Desktop/hyperframe-main/video-agent

# 运行修复工具
node scripts/repair-openclaw-runtime.mjs

# 如果自动启动失败，手动启动
python3 scripts/openclaw-local.py start
```

**预期结果**:
- ✅ Backend: http://127.0.0.1:3024/
- ✅ Gateway: http://127.0.0.1:18789/

---

### Step 2: 修复路由逻辑 (15 分钟)

**文件**: `lib/creative/message-routing.mjs`

**修改点 1** (第 64 行之前):
```javascript
// 新增：识别上传视频创作
if(!project.currentRevisionId && result.mode==='edit' && 
   project.assets.some(a=>a.kind==='video') &&
   /(?:替换|改成|换成|创作|制作|生成|把.*改)/.test(message)){
  return {
    mode:'create',
    quote:message,
    revisionId:null,
    assetIds:project.assets.filter(a=>a.kind==='video').map(a=>a.id),
    question:'',
    source:'upload-video-creation',
    reason:'用户上传视频素材并提出创作需求，应创作新成片而非编辑工程'
  };
}
```

**修改点 2** (第 33 行 variant 检查后):
```javascript
if(taskModeExplicit&&taskMode==='create'&&project.assets.length>0&&!project.currentRevisionId)
  return {mode:'create',quote:message,revisionId:null,
    assetIds:project.assets.filter(a=>a.kind==='video').map(a=>a.id),
    question:'',source:'explicit-create-with-assets'};
```

---

### Step 3: 测试修复效果 (20 分钟)

#### 3.1 手动测试
```bash
# 1. 打开 OpenClaw WebUI
open "http://127.0.0.1:18789/chat?agent=commerce-control"

# 2. 上传测试视频
# assets/user-library/headphones-launch/8004703-uhd_3840_2160_25fps.mp4

# 3. 发送任务（之前失败的场景）
"把这个视频里的耳机替换成墨镜，保持位置、大小和运动，其他不变"
```

**预期行为**:
- ✅ 不再提示"请先打开原生工程"
- ✅ 直接进入创作流程
- ✅ 分析视频素材
- ✅ 执行替换操作
- ✅ 输出成片

#### 3.2 自动化验收
```bash
# 运行完整浏览器验收
node scripts/test-real-browser-acceptance.mjs
```

**预期结果**:
- ✅ Phase A-E 全部通过
- ✅ 生成 3 个不同的 revision
- ✅ 最终视频通过质量清单

---

### Step 4: 质量审片 (10 分钟)

**人工检查**:
1. 找到最新成片: `data/result-completion-projects/[最新UUID]/output.mp4`
2. 用 QuickTime/VLC 播放
3. 对照质量检查清单逐项确认
4. 记录不符合项

**如有质量问题**:
- 截图保存到 `codex-evidence/openclaw-closeout/quality-issues/`
- 记录时间点和具体问题
- 提交到开发团队进一步优化

---

## 📊 验证标准

### 启动稳定性
- [ ] `.command` 文件能正常启动
- [ ] Backend 健康检查通过
- [ ] Gateway 健康检查通过
- [ ] 无端口占用冲突
- [ ] 无权限错误

### 成片质量
- [ ] 上传视频 + 编辑意图 → 直接创作成片
- [ ] 不再提示"打开原生工程"
- [ ] 物体替换准确（位置、大小、运动一致）
- [ ] 保留原视频的其他元素
- [ ] 音频、时长、构图不变
- [ ] 输出 MP4 可播放

### 浏览器验收
- [ ] Phase A-E 全部通过
- [ ] 无 JavaScript 错误
- [ ] 无网络失败
- [ ] Job/Revision 正确追踪
- [ ] 12 项质量清单通过

---

## 🔄 回归测试

修复后需要测试的场景：

### 场景 1: 上传视频 + 物体替换
```
上传: coffee-shop.mp4
任务: "把所有咖啡袋替换成蛋白粉袋，位置和运动保持一致"
预期: 直接创作成片，无澄清拦截
```

### 场景 2: 上传视频 + 重新剪辑
```
上传: product-demo.mp4
任务: "把这段素材剪成 30 秒的 9:16 短视频，前 3 秒要有 Hook"
预期: 分析素材 → 规划剪辑 → 输出成片
```

### 场景 3: 上传视频 + 添加元素
```
上传: headphones.mp4
任务: "给这个视频加字幕和背景音乐，风格科技感"
预期: 识别内容 → 生成字幕 → 配乐 → 输出成片
```

### 场景 4: 正常工程编辑（不应被影响）
```
前提: 已有工程，currentRevisionId 存在
任务: "把第一个镜头改成 3 秒"
预期: 正常进入 edit 模式，局部修改
```

---

## 📝 后续优化

### 短期 (本周)
1. ✅ 修复启动权限问题
2. 🔧 修复路由逻辑（上传视频创作）
3. 🔧 运行浏览器验收并通过
4. 📊 收集 3 个真实用户案例的质量反馈

### 中期 (下周)
1. 增强物体追踪与替换准确度
2. 优化视频分析提示词（识别场景、物体、动作）
3. 添加质量自检环节（黑帧、闪帧、音画同步）
4. 完善错误恢复机制

### 长期 (本月)
1. 支持批量视频处理
2. 引入用户反馈循环
3. 建立质量基准数据集
4. 自动化回归测试套件

---

## 🤝 协作

**需要人工审核的环节**:
- 成片视觉质量（是否真正替换了物体）
- 动作匹配度（替换物体的运动是否自然）
- 整体观感（是否像"成品"而非"拼接"）

**反馈渠道**:
- 截图/录屏 → `codex-evidence/openclaw-closeout/user-feedback/`
- 文字描述 → 本文档末尾追加
- 紧急问题 → 直接联系开发团队

---

## 📅 时间线

- **2026-09-22 13:36**: 发现问题（启动失败 + 成片质量差）
- **2026-09-22 14:00**: 完成诊断和修复方案
- **2026-09-22 14:15**: 执行 Step 1-2（启动 + 路由修复）
- **2026-09-22 14:30**: 执行 Step 3-4（测试 + 审片）
- **2026-09-22 15:00**: 完成验收并生成报告

---

**状态**: 🔧 修复工具已就绪，等待执行 Step 1-4
