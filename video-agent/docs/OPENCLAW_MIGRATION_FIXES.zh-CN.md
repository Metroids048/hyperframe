# OpenClaw 迁移问题诊断与修复方案

**生成时间**: 2026-09-20  
**当前分支**: `codex/webui-agent-workflow`  
**问题严重程度**: 🔴 关键 - 影响所有核心功能

---

## 📋 问题清单

| 序号 | 问题 | 严重性 | 根本原因 | 影响范围 |
|------|------|--------|----------|----------|
| 1 | 传不上去文件 | 🔴 高 | 上传与导入目录不一致 | 所有需要上传原片的任务 |
| 2 | 对话慢 | 🟡 中 | 多层模型调用叠加 | 所有交互 |
| 3 | 没有生成视频 | 🔴 高 | 任务分流逻辑混乱 | 创作类任务 |
| 4 | 插件各种报错 | 🔴 高 | 契约不一致 | 所有工具调用 |
| 5 | 任务经常中断 | 🟡 中 | 超时与恢复链路不完整 | 长时间任务 |
| 6 | 连接不上 | 🔴 高 | 端口/凭据配置问题 | 初始连接 |

---

## 🔍 根本原因分析

### 核心问题: **架构边界不清晰**

**当前架构**:
```
用户输入
  ↓
OpenClaw Gateway (理解意图 + 决策分流)
  ↓
Commerce Agent Bridge (授权 + 验证)
  ↓
Commerce Engine Facade (工具映射)
  ↓
Video Agent Creative Service (真正执行)
  ↓
HyperFrames / Audio / Render
```

**问题点**:
1. **职责重复**: OpenClaw 层和 Video Agent 都在做意图理解和路由决策
2. **数据割裂**: 上传、素材、授权、会话状态分散在多个系统
3. **超时不匹配**: OpenClaw 300秒超时 vs 渲染 5-10 分钟
4. **恢复链路断**: 三层各自的错误处理不能无缝衔接

---

## 🎯 修复策略

### 原则
1. **OpenClaw 只做入口**: 接收、上传、会话管理,不理解业务
2. **Video Agent 统一决策**: 所有规划、执行、HyperFrames、音频由原系统完成
3. **异步为主**: OpenClaw 工具调用立即返回 `jobId`,后续轮询状态
4. **保留现有能力**: 不删除 HyperFrames/音频/字幕代码,只修路由

---

## ✅ 修复方案

### 阶段 1: 紧急修复 (1-2 天)

#### 1.1 统一上传目录

**问题**: 
- [openclaw-plugin/index.mjs:126-127](../openclaw-plugin/index.mjs#L126-L127) 上传到 `OPENCLAW_INBOUND_MEDIA_DIR`
- 后端从 `VIDEO_AGENT_CREATIVE_DATA_DIR` 读取

**修复**:
```bash
# 1. 统一环境变量
cat >> .env << 'EOF'

# OpenClaw 统一状态目录
OPENCLAW_STATE_DIR=/Users/a1234/.openclaw/hyperframe/state
OPENCLAW_INBOUND_MEDIA_DIR=/Users/a1234/.openclaw/hyperframe/state/media/inbound
VIDEO_AGENT_CREATIVE_DATA_DIR=/Users/a1234/.openclaw/hyperframe/state/projects
EOF

# 2. 创建目录
mkdir -p ~/.openclaw/hyperframe/state/{media/inbound,projects}
```

**验证**:
```bash
# 上传测试文件
curl -X POST \
  -H "Content-Type: video/mp4" \
  -H "X-OpenClaw-File-Name: test.mp4" \
  --data-binary @protein_tub.png \
  http://127.0.0.1:18789/plugins/commerce-engine/upload

# 检查文件是否在正确位置
ls -lh ~/.openclaw/hyperframe/state/media/inbound/
```

#### 1.2 简化工具映射

**问题**: 
- [lib/openclaw/commerce-engine-facade.mjs:131-134](../lib/openclaw/commerce-engine-facade.mjs#L131-L134) 有冗余映射

**修复**:
```javascript
// lib/openclaw/commerce-engine-facade.mjs
async function invoke(tool, input = {}, context = {}) {
  // 直接映射,不做二次决策
  if (tool === 'video_project_list') {
    return service.list().map(p => ({
      id: p.id,
      name: displayProjectName(p),
      currentRevisionId: p.currentRevisionId
    }));
  }
  
  if (tool === 'video_task') {
    // 直接调用原 service.submitMessage,不再经过 dispatchMessage
    const job = await service.submitMessage(project, {
      message: input.message,
      attachmentIds: input.attachmentIds || [],
      attachmentPaths: input.attachmentPaths || [],
      baseRevisionId: input.baseRevisionId,
      idempotencyKey: input.operationId
    });
    
    // 立即返回 jobId,不等待完成
    return {
      tool: 'video_task',
      status: 'queued',
      jobId: job.id,
      projectId: project.id
    };
  }
}
```

#### 1.3 移除 OpenClaw 层的意图理解

**问题**: 
- [lib/openclaw/commerce-agent-bridge.mjs:35](../lib/openclaw/commerce-agent-bridge.mjs#L35) 有完整的推理指令

**修复**:
```javascript
// lib/openclaw/commerce-agent-bridge.mjs
const request = {
  model,
  input: [{
    type: 'message',
    role: 'user',
    content: [{
      type: 'input_text',
      text: JSON.stringify(payload)
    }]
  }],
  // 简化指令: 只做工具选择,不理解业务
  instructions: 'Parse the JSON payload. If projectId is missing, call video_project_list first. Then call the appropriate video_* tool with the exact parameters provided. Do not interpret the message content.',
  tools: [resultToolSchemaWithProjectList()],
  tool_choice: { type: 'function', name: 'return_control_result' }
};
```

#### 1.4 修复超时配置

**问题**: 
- [lib/openclaw/commerce-agent-bridge.mjs:34](../lib/openclaw/commerce-agent-bridge.mjs#L34) 超时 300 秒
- 但 `video_task` 应该立即返回

**修复**:
```javascript
// lib/openclaw/commerce-agent-bridge.mjs
async function runControl(project, input, { readOnly = false } = {}) {
  // 工具调用超时缩短到 60 秒(只是提交任务)
  const timeoutMs = 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  // ... 其他代码保持
}
```

#### 1.5 修复启动脚本

**问题**: 连接不上可能是服务没正确启动

**验证当前配置**:
```bash
# 检查环境变量
env | grep -E '(OPENCLAW|VIDEO_AGENT|PORT)'

# 检查服务是否运行
lsof -i :18789  # OpenClaw Gateway
lsof -i :3024   # Video Agent Backend

# 检查日志
tail -f ~/.openclaw/hyperframe/logs/gateway.log 2>/dev/null || echo "日志文件不存在"
```

**修复启动**:
```python
# start.py 补充
import os
import sys

def start_openclaw():
    """启动 OpenClaw Gateway"""
    env = os.environ.copy()
    
    # 确保必要的环境变量
    required = {
        'OPENCLAW_GATEWAY_TOKEN': 'dev-token-' + os.urandom(16).hex(),
        'OPENCLAW_BRIDGE_TOKEN': 'bridge-token-' + os.urandom(16).hex(),
        'OPENCLAW_STATE_DIR': os.path.expanduser('~/.openclaw/hyperframe/state'),
        'VIDEO_AGENT_BRIDGE_URL': 'http://127.0.0.1:3024',
        'VIDEO_AGENT_WORKSPACE_ID': 'default',
        'VIDEO_AGENT_OPENCLAW_WORKSPACE': os.path.join(os.getcwd(), 'runtime/openclaw'),
        'VIDEO_AGENT_OPENCLAW_PLUGIN': os.path.join(os.getcwd(), 'openclaw-plugin')
    }
    
    for key, value in required.items():
        if key not in env:
            env[key] = value
            print(f"设置 {key}={value}")
    
    # 启动 Gateway
    cmd = [
        'openclaw', 'gateway', 'start',
        '--config', 'runtime/openclaw/openclaw.example.json'
    ]
    
    print(f"启动 OpenClaw Gateway: {' '.join(cmd)}")
    os.execve(cmd[0], cmd, env)
```

### 阶段 2: 结构优化 (3-5 天)

#### 2.1 去除快捷编辑分流

**问题**: 
- [lib/creative/service.mjs:67-103](../lib/creative/service.mjs#L67-L103) `deterministicExternalReplacement` 和 `deterministicUploadedVideoEdit` 
- 这些快速路径绕过了完整的 HyperFrames 制作

**修复**:
```javascript
// lib/creative/service.mjs:dispatchMessage
async function dispatchMessage(p, input, routeJob = null) {
  // 移除所有快速编辑分支
  // const quickEdit = deterministicUploadedVideoEdit(document, input.message);
  // if (quickEdit) { ... }
  
  // 统一走完整规划路径
  const route = await routeWorkbenchMessage({
    project: p,
    document,
    message: input.message,
    attachments: input.attachmentIds || [],
    provider: routingProvider
  });
  
  // 根据路由结果调用完整制作流程
  if (route.intent === 'create') {
    return await enqueueCreativeJob(p, {
      action: 'generate',
      message: input.message,
      attachments: input.attachmentIds
    });
  } else if (route.intent === 'edit') {
    return await enqueueCreativeJob(p, {
      action: 'patch',
      message: input.message,
      operations: route.operations
    });
  }
}
```

#### 2.2 恢复完整的 HyperFrames 能力

**验证当前状态**:
```bash
# 检查 HyperFrames 技能是否加载
ls -lh runtime/openclaw/skills/commerce-hyperframes/

# 检查 MiniMax 音频配置
grep -r "minimax" config/ runtime/
```

**确认修复点**:
1. `commerce-hyperframes` skill 必须在 [runtime/openclaw/openclaw.example.json:50](../runtime/openclaw/openclaw.example.json#L50) 的 skills 列表中
2. `commerce-audio-captions` skill 必须正确调用 MiniMax TTS/ASR
3. 字幕时间轴必须与音频同步

#### 2.3 建立真实验证流程

**当前问题**: 只测试代码逻辑,没有端到端验证

**建立验证清单**:
```bash
# test-e2e-openclaw.sh
#!/bin/bash
set -e

echo "=== OpenClaw 端到端测试 ==="

# 1. 上传原片
UPLOAD_RESULT=$(curl -s -X POST \
  -H "Content-Type: video/mp4" \
  -H "X-OpenClaw-File-Name: test-video.mp4" \
  --data-binary @视频样例_蛋白粉版.mp4 \
  http://127.0.0.1:18789/plugins/commerce-engine/upload)

MEDIA_PATH=$(echo "$UPLOAD_RESULT" | jq -r '.mediaPath')
echo "✓ 上传成功: $MEDIA_PATH"

# 2. 创建项目
PROJECT_ID=$(curl -s -X POST \
  http://127.0.0.1:3024/api/commerce/projects \
  -H "Content-Type: application/json" \
  -d '{"title":"E2E测试项目"}' | jq -r '.id')

echo "✓ 项目创建: $PROJECT_ID"

# 3. 提交创作任务
JOB_RESULT=$(curl -s -X POST \
  http://127.0.0.1:3024/api/commerce/$PROJECT_ID/messages \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"用这个视频做一个30秒的产品宣传片,加上字幕和背景音乐\",
    \"attachmentPaths\": [\"$MEDIA_PATH\"],
    \"idempotencyKey\": \"test-$(date +%s)\"
  }")

JOB_ID=$(echo "$JOB_RESULT" | jq -r '.jobId')
echo "✓ 任务提交: $JOB_ID"

# 4. 轮询状态
for i in {1..60}; do
  STATUS=$(curl -s http://127.0.0.1:3024/api/commerce/$PROJECT_ID/jobs/$JOB_ID | jq -r '.status')
  echo "[$i/60] 状态: $STATUS"
  
  if [ "$STATUS" = "complete" ]; then
    echo "✓ 任务完成"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "✗ 任务失败"
    curl -s http://127.0.0.1:3024/api/commerce/$PROJECT_ID/jobs/$JOB_ID | jq '.error'
    exit 1
  fi
  
  sleep 10
done

# 5. 获取成品
ARTIFACTS=$(curl -s http://127.0.0.1:3024/api/commerce/$PROJECT_ID/artifacts)
VIDEO_URL=$(echo "$ARTIFACTS" | jq -r '.files[] | select(.name=="commerce-final.mp4") | .url')

if [ -n "$VIDEO_URL" ]; then
  echo "✓ 成品已生成: $VIDEO_URL"
  curl -o test-output.mp4 "$VIDEO_URL"
  echo "✓ 已下载到 test-output.mp4"
else
  echo "✗ 没有找到成品视频"
  exit 1
fi

echo "=== 测试通过 ==="
```

### 阶段 3: 性能优化 (可选)

#### 3.1 短路径优化

对于简单修改(如"把标题改成XXX"),可以保留快速路径,但必须:
1. 明确判断条件(不能误判创作为编辑)
2. 记录决策理由
3. 失败时自动回退到完整路径

#### 3.2 缓存与复用

- 音频合成结果缓存(相同文本+音色)
- 字幕识别结果缓存(相同音频)
- HyperFrames 编译结果缓存(相同 HTML)

---

## 📊 验收标准

### 必须通过的测试

| 测试项 | 预期结果 | 验收方法 |
|--------|----------|----------|
| 上传 64MB 视频 | 返回 `media://inbound/*` 且文件存在 | 手动上传 + 检查目录 |
| 创作新视频 | 3-5 分钟内生成 MP4 + 字幕 + 音频 | E2E 测试脚本 |
| 编辑已有视频 | 1-2 分钟内生成新版本 | 修改标题测试 |
| 任务中断恢复 | 重启服务后可以继续 | 手动 kill + 恢复 |
| 连续对话 | 5 轮编辑不丢失状态 | 多轮对话测试 |

### 性能目标

| 指标 | 当前 | 目标 |
|------|------|------|
| 首次响应 | 10-30秒 | <5秒 |
| 简单编辑 | 2-5分钟 | <1分钟 |
| 完整创作 | 5-10分钟 | 3-5分钟 |
| 上传 64MB | 30-60秒 | <10秒 |

---

## 🚀 执行计划

### Day 1: 环境与上传
- [ ] 统一目录配置
- [ ] 修复上传路径
- [ ] 验证文件可见性
- [ ] 测试 64MB 视频上传

### Day 2: 工具调用
- [ ] 简化 Facade 映射
- [ ] 移除 OpenClaw 推理
- [ ] 修复超时配置
- [ ] 测试 `video_task` 立即返回

### Day 3-4: 业务恢复
- [ ] 移除快捷编辑分流
- [ ] 恢复完整 HyperFrames 路径
- [ ] 修复 MiniMax 音频链路
- [ ] 端到端创作测试

### Day 5: 验收
- [ ] 运行 E2E 测试脚本
- [ ] 真实用户场景测试
- [ ] 性能指标对比
- [ ] 文档更新

---

## 📝 检查清单

在声称"修复完成"之前,必须:

- [ ] 运行 `test-e2e-openclaw.sh` 全部通过
- [ ] 上传真实视频(非 PNG)并成功导入
- [ ] 生成一个完整的 30 秒营销视频(有字幕+音频)
- [ ] 对已有视频做 3 轮编辑且版本正确
- [ ] 重启服务后可以恢复中断的任务
- [ ] 查看生成的 MP4 文件,确认质量符合原 Video Agent 水平

**禁止**:
- ❌ 只修改代码没有真实测试
- ❌ 用简单的"改标题"代表完整能力
- ❌ 声称"理论上应该可以"而没有实际运行
- ❌ 跳过音频/字幕验证
- ❌ 用 Mock 或假数据替代真实素材

---

## 🔗 相关文件

- 上传: [openclaw-plugin/index.mjs:96-137](../openclaw-plugin/index.mjs#L96-L137)
- 工具映射: [lib/openclaw/commerce-engine-facade.mjs:129-264](../lib/openclaw/commerce-engine-facade.mjs#L129-L264)
- 业务路由: [lib/creative/service.mjs:186-200](../lib/creative/service.mjs#L186-L200)
- 快捷编辑: [lib/creative/service.mjs:67-103](../lib/creative/service.mjs#L67-L103)
- 授权桥接: [lib/openclaw/commerce-agent-bridge.mjs:23-62](../lib/openclaw/commerce-agent-bridge.mjs#L23-L62)

---

## 💡 长期改进方向

1. **彻底去除 OpenClaw 推理层**: 让 Gateway 只做 HTTP 路由,不调用模型
2. **统一状态管理**: Project/Revision/Job/Asset 只在 Video Agent 维护
3. **流式进度**: 使用 WebSocket 实时推送任务进度
4. **分离关注点**: 上传、会话、执行、交付各自独立可测试

---

**最后更新**: 2026-09-20  
**负责人**: Claude (诊断) + 用户 (验收)  
**预计完成**: 5 个工作日
