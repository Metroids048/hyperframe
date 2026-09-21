# OpenClaw Quick Reference Card

快速参考指南 - 最常用的操作和命令

---

## 🚀 快速开始

```bash
# 1. 启动服务
cd video-agent
npm start

# 2. 运行测试
node scripts/test-openclaw-simple.mjs

# 3. 打开预览
open http://127.0.0.1:3020/api/commerce/{projectId}/revisions/latest/preview.html
```

---

## 📋 服务配置

| 服务 | 端口 | 健康检查 |
|------|------|----------|
| Video Agent | 3020 | `curl http://127.0.0.1:3020/health` |
| OpenClaw Gateway | 18789 | `curl http://127.0.0.1:18789/health` |

---

## ✅ 支持的操作（成功案例）

```javascript
// ✅ 修改标题文字
"把标题改成'限时特惠'"

// ✅ 修改标题文字 + 颜色
"把标题改成'新品推荐'，颜色改成金色"

// ✅ 修改标题文字 + 字号 + 颜色
"把标题改成'限时特惠'，字体改大，颜色改成红色"

// ✅ 调整视频节奏
"加快前5秒的节奏，突出产品亮相；后10秒放慢，展示细节"
```

---

## ❌ 不支持的操作

```javascript
// ❌ 添加新元素
"添加字幕'高品质材料'在第5秒出现"

// ❌ 单独修改样式
"把标题颜色改成蓝色"  // 必须同时修改文字

// ❌ 精确位置调整
"把标题移到屏幕中间位置"

// ❌ 音量控制
"把背景音乐音量降低20%"

// ❌ 时长调整
"把视频缩短到12秒"
```

**解决方案**: 使用组合操作
```javascript
// 正确示例
"把标题改成'特价优惠'，颜色改成红色"  // ✅
```

---

## 🔌 API 快速参考

### 创建项目
```javascript
POST /api/commerce-chat
{
  "action": "init"
}
// 返回: { projectId: "..." }
```

### 上传素材
```javascript
POST /api/commerce-chat
{
  "action": "upload",
  "projectId": "...",
  "file": <binary>
}
// 返回: { materialId: "...", uploadedPath: "..." }
```

### 创作视频
```javascript
POST /api/commerce-chat
{
  "action": "message",
  "projectId": "...",
  "message": "制作15秒产品宣传片，添加标题'新品上市'"
}
// 返回: { state: "rendered", video: "...", revisionId: "..." }
```

### 编辑视频
```javascript
POST /api/commerce-chat
{
  "action": "message",
  "projectId": "...",
  "message": "把标题改成'限时特惠'，颜色改成红色"
}
// 返回: 同上（新的 revisionId）
```

---

## 📊 质量标准

| 指标 | 标准值 |
|------|--------|
| 分辨率 | 1080x1920 |
| 帧率 | 30 FPS |
| 格式 | MP4 (H.264 + AAC) |
| 响应时间 | < 30秒 |
| 状态 | `media-contract-passed` |

---

## 🐛 常见问题速查

### INVALID_ASSET_PATH
```bash
# 检查
cat lib/creative/service.mjs | grep "uploadedPath"

# 确认路径已存储
```

### ECONNREFUSED
```bash
# 检查服务状态
lsof -i :3020
lsof -i :18789

# 重启服务
npm start
```

### 422 UNSUPPORTED_MESSAGE
```
操作不支持，检查:
1. 是否在支持列表中
2. 是否使用组合操作
3. 提示词是否足够具体
```

---

## 📁 项目结构

```
video-agent/
├── lib/
│   ├── creative/
│   │   └── service.mjs      # 核心服务逻辑
│   └── config.mjs           # 配置文件（端口等）
├── scripts/
│   ├── test-openclaw-simple.mjs  # 端到端测试
│   └── TEST_CHECKLIST.md         # 测试清单
├── docs/
│   ├── OPENCLAW_ACCEPTANCE_TEST_RESULTS.md
│   └── OPENCLAW_MIGRATION_FIXES.md
└── TEST_SUMMARY.md          # 测试摘要
```

---

## 🧪 测试工作流

```
1. 启动服务 → 2. 运行测试 → 3. 查看结果 → 4. 打开预览
     ↓              ↓              ↓              ↓
  npm start    test-*.mjs    check logs     open URL
```

---

## 📚 完整文档

- **测试清单**: `scripts/TEST_CHECKLIST.md`
- **测试摘要**: `TEST_SUMMARY.md`
- **完整报告（中文）**: `docs/OPENCLAW_ACCEPTANCE_TEST_RESULTS.zh-CN.md`
- **Complete Report (EN)**: `docs/OPENCLAW_ACCEPTANCE_TEST_RESULTS.md`
- **修复记录**: `docs/OPENCLAW_MIGRATION_FIXES.zh-CN.md`

---

## 💡 最佳实践

1. **使用组合操作**: 一次修改多个属性（文字 + 颜色）
2. **提供具体描述**: "加快前5秒" 比 "调整节奏" 更好
3. **分步执行**: 复杂需求拆分成多轮对话
4. **保存版本**: 每轮编辑生成新的 revisionId
5. **及时验证**: 在浏览器中预览每轮结果

---

## 🎯 验收标准

- [x] 视频生成成功率 100%
- [x] 多轮编辑无崩溃（4+ 轮）
- [x] 视频质量符合标准
- [x] 响应时间 < 30秒
- [x] 版本管理完整

**状态**: ✅ 已通过验收

---

*快速参考卡片 v1.0 | 2026-09-21*
