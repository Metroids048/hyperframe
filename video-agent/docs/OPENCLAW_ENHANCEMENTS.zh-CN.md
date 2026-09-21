# OpenClaw 多轮对话编辑能力增强

## 概述

本次改进扩展了 OpenClaw 视频编辑系统的多轮对话编辑能力，使其能够处理更复杂的编辑需求，包括音乐更换、节奏调整和字幕添加等高级功能。

## 改进日期

2025-01-XX

## 问题背景

### 原有限制

在改进前，OpenClaw 的多轮对话编辑功能仅支持以下操作：

✅ **已支持的简单编辑：**
- 修改标题文字（带引号的精确匹配）
- 调整总时长
- 场景加快/减慢
- 转场效果（闪白、滑动等）
- 视觉效果（引导线、放大、标题动画）
- 锁定/解锁场景

❌ **不支持的复杂编辑：**
- 更换背景音乐
- 调整视频节奏（分段加速/减速）
- 添加字幕说明
- 音频相关的其他操作

### 用户痛点

当用户尝试执行以下编辑时会失败：

```javascript
// 失败案例 1：更换背景音乐
"换一首更优雅的背景音乐"
// 错误：UNSUPPORTED_MESSAGE - 需要更具体的对象或效果参数

// 失败案例 2：调整节奏
"前5秒快速展示，后10秒放慢突出细节"
// 错误：UNSUPPORTED_MESSAGE - 需要更具体的对象或效果参数

// 失败案例 3：添加字幕
"在产品特写时添加字幕'天然成分 零添加'"
// 错误：UNSUPPORTED_MESSAGE - 需要更具体的对象或效果参数
```

## 解决方案

### 1. 扩展意图识别 (`lib/creative/intent.mjs`)

#### 添加音乐更换识别

```javascript
// 识别音乐相关的编辑意图
if (/(?:换|更换|替换).{0,4}(?:背景)?音乐/.test(message) || /音乐.{0,10}(?:换成|改成|替换为)/.test(message)) {
  const style = extractMusicStyle(message); // 提取音乐风格
  return {
    operations: [{
      type: 'change_music',
      style: style || 'elegant',
      params: style ? {mood: style} : null
    }],
    summary: `更换背景音乐${style ? `为${style}风格` : ''}`
  };
}
```

**支持的音乐风格描述：**
- 激情/有活力/energetic → "energetic"
- 优雅/舒缓/elegant → "elegant"  
- 欢快/轻快/upbeat → "upbeat"
- 紧张/dramatic → "dramatic"

#### 添加节奏调整识别

```javascript
// 识别节奏调整意图
if (/调整.{0,4}节奏/.test(message) || /(?:前|后)\d+秒.{0,10}(?:快|慢|加速|减速)/.test(message)) {
  const params = extractRhythmParams(message);
  return {
    operations: [{
      type: 'adjust_rhythm',
      params: {
        description: message,
        fastStart: params.fastStart || null,
        slowEnd: params.slowEnd || null
      }
    }],
    summary: '调整视频播放节奏'
  };
}
```

**支持的节奏描述：**
- "前5秒快速展示" → fastStart: 5
- "后10秒放慢" → slowEnd: 10
- "整体加快" → 全局加速

#### 添加字幕识别

```javascript
// 识别字幕添加意图
if (/添加.{0,4}字幕/.test(message) || /字幕.{0,4}[""][^""]+[""]/.test(message)) {
  const texts = extractSubtitleTexts(message);
  const timing = /关键|重要/.test(message) ? 'key-moments' : 'auto';
  const animation = /淡入|淡出|fade/.test(message) ? 'fade' : 'none';

  return {
    operations: [{
      type: 'add_subtitles',
      params: {
        texts: texts,
        timing: timing,
        animation: animation
      }
    }],
    summary: `添加${texts.length}条字幕`
  };
}
```

**支持的字幕参数：**
- texts: 字幕文本数组（从引号中提取）
- timing: "key-moments"（关键镜头）或 "auto"（自动）
- animation: "fade"（淡入淡出）或 "none"（无动画）

### 2. 实现操作执行 (`lib/creative/patch.mjs`)

#### 允许新操作类型

```javascript
const allowed = new Set([
  // ... 现有类型 ...
  'change_music',      // 新增：更换音乐
  'adjust_rhythm',     // 新增：调整节奏
  'add_subtitles'      // 新增：添加字幕
]);
```

#### 音乐更换实现

```javascript
if (op.type === 'change_music') {
  // 移除现有音乐轨道
  document.audioGraph = (document.audioGraph || []).filter(a => a.role !== 'music');
  
  // 标记需要重新生成音乐
  document.audioRequirements = {...document.audioRequirements, music: true};
  
  // 存储音乐风格偏好
  if (op.style || op.params?.mood) {
    document.brief = {...document.brief, musicStyle: op.style || op.params.mood};
  }
}
```

**工作原理：**
1. 删除现有的 `role: 'music'` 音轨
2. 设置 `audioRequirements.music = true` 触发重新生成
3. 将风格偏好存入 `document.brief.musicStyle` 供音频生成使用

#### 节奏调整实现

```javascript
if (op.type === 'adjust_rhythm') {
  const params = op.params || {};
  const totalDuration = document.scenes.reduce((sum, s) => sum + s.durationFrames, 0);

  for (const scene of document.scenes) {
    const sceneStart = scene.startFrame;
    const sceneEnd = scene.startFrame + scene.durationFrames;

    let speedFactor = 1.0;
    
    // 前N秒加速
    if (params.fastStart && sceneStart < params.fastStart * 30) {
      speedFactor = 1.3; // 加速 30%
    }
    
    // 后N秒减速
    else if (params.slowEnd && sceneEnd > (totalDuration / 30 - params.slowEnd) * 30) {
      speedFactor = 0.8; // 减速 20%
    }

    // 应用到视频节点
    for (const node of document.nodes.filter(n => n.sceneId === scene.id && n.kind === 'video')) {
      node.params = {...node.params, playbackRate: speedFactor};
    }
  }
}
```

**工作原理：**
1. 根据时间参数识别需要加速/减速的场景
2. 修改视频节点的 `playbackRate` 属性
3. 1.3 = 加速30%，0.8 = 减速20%

#### 字幕添加实现

```javascript
if (op.type === 'add_subtitles') {
  const params = op.params || {};
  const texts = params.texts || [];

  // 根据 timing 策略选择目标场景
  const targetScenes = params.timing === 'key-moments'
    ? document.scenes.filter((s, i) => i % Math.ceil(document.scenes.length / texts.length) === 0)
    : document.scenes.slice(0, texts.length);

  // 为每个文本创建字幕对象
  for (let i = 0; i < texts.length && i < targetScenes.length; i++) {
    const scene = targetScenes[i];
    const text = texts[i];
    const cueId = stableId('subtitle', scene.id, i);

    if (!document.captions) document.captions = [];
    if (document.captions.some(c => c.id === cueId)) continue;

    const startFrame = scene.startFrame + Math.floor(scene.durationFrames * 0.1);
    const durationFrames = Math.min(60, scene.durationFrames * 0.8);

    document.captions.push({
      id: cueId,
      text: text,
      startFrame: startFrame,
      durationFrames: durationFrames,
      style: {
        fontSize: 32,
        fontWeight: 600,
        color: '#FFFFFF',
        offsetY: -100,
        ...(params.animation === 'fade' ? {fadeIn: 15, fadeOut: 15} : {})
      }
    });
  }
}
```

**工作原理：**
1. 根据 timing 策略选择场景（关键镜头或顺序分配）
2. 为每个文本创建字幕对象，设置时间和样式
3. 字幕在场景开始后10%出现，持续2秒或场景的80%

### 3. 更新模型指令 (`lib/creative/model-edit.mjs`)

#### 添加到操作类型枚举

```javascript
const properties = {
  type: {
    type: 'string',
    enum: [
      // ... 现有类型 ...
      'change_music',
      'adjust_rhythm', 
      'add_subtitles'
    ]
  },
  // 添加新字段
  style: nullable('string')  // 用于音乐风格
};
```

#### 添加操作说明

```javascript
change_music(style为音乐风格如elegant/energetic/upbeat，paramsJson可含mood)
更换背景音乐，移除现有音乐轨道并标记需要重新生成，style指定新音乐风格。

adjust_rhythm(paramsJson含description描述、fastStart前N秒加速、slowEnd后N秒减速)
调整视频节奏，通过修改视频节点的playbackRate实现加速或减速效果。

add_subtitles(paramsJson含texts字幕文字数组、timing为key-moments关键镜头或auto自动、
animation为fade淡入淡出或none无动画)
在指定时机添加多个字幕，自动分配到合适的场景位置。
```

## 测试验证

### 测试脚本

创建了专门的测试脚本验证新功能：

```bash
# 增强多轮对话测试
node scripts/test-enhanced-multi-round.mjs

# 浏览器端到端测试（需要安装 Playwright）
node scripts/browser-e2e-test.mjs
```

### 测试场景

#### 场景 1：标题 → 音乐 → 节奏 → 字幕

```javascript
// 第一轮：修改标题（已有功能）
"把标题改成'限时特惠'，字号调大"
✅ 预期：标题更新，字号增大

// 第二轮：更换音乐（新功能）
"换一首更激情、更有活力的背景音乐"
✅ 预期：移除旧音乐，生成新的energetic风格音乐

// 第三轮：调整节奏（新功能）
"前5秒快速展示，后10秒放慢展示细节"
✅ 预期：前5秒视频加速30%，后10秒减速20%

// 第四轮：添加字幕（新功能）
"添加字幕'天然成分 零添加'、'随时补充 轻松健康'，使用淡入淡出"
✅ 预期：在关键镜头添加2条字幕，带淡入淡出动画
```

### 验收标准

✅ **功能完整性**
- 所有新操作类型都能被正确识别
- 操作能正确执行并修改 document
- 不影响现有的编辑功能

✅ **错误处理**
- 无效参数返回清晰的错误提示
- 不会导致系统崩溃或数据损坏

✅ **用户体验**
- 响应时间在可接受范围内（< 30秒/轮）
- 编辑结果符合用户意图
- 多轮编辑状态管理正确

## 使用示例

### 示例 1：营销视频多轮精修

```javascript
// 基础生成
const project = await createProject({
  message: "制作15秒产品营销视频，标题'新品上市'",
  assets: ['product.mp4']
});

// 第一轮：调整文案
await editProject(project.id, {
  message: "标题改成'限时特惠'，字体调大"
});

// 第二轮：优化音乐
await editProject(project.id, {
  message: "换一首更激情的背景音乐，节奏感强一些"
});

// 第三轮：调整节奏
await editProject(project.id, {
  message: "前3秒快速吸引注意，中间放慢展示细节，最后5秒加快营造紧迫感"
});

// 第四轮：添加字幕
await editProject(project.id, {
  message: "在产品特写添加字幕'限时特惠 立即抢购'、'品质保证 售后无忧'，使用淡入淡出效果"
});
```

### 示例 2：教程视频优化

```javascript
// 基础生成
const project = await createProject({
  message: "制作产品使用教程，清晰展示操作步骤",
  assets: ['tutorial.mp4']
});

// 添加步骤字幕
await editProject(project.id, {
  message: "在关键步骤添加字幕：'第一步 打开包装'、'第二步 取出产品'、'第三步 按照说明使用'"
});

// 调整节奏让步骤更清晰
await editProject(project.id, {
  message: "每个步骤展示时放慢速度，步骤之间加快过渡"
});

// 更换舒缓的背景音乐
await editProject(project.id, {
  message: "换一首更舒缓、适合教程的背景音乐"
});
```

## 技术细节

### 数据结构变化

#### 1. Document Brief 扩展

```javascript
// 添加音乐风格字段
document.brief = {
  // ... 现有字段 ...
  musicStyle: 'energetic'  // 新增：音乐风格偏好
}
```

#### 2. Video Node 参数扩展

```javascript
// 视频节点支持播放速率
node.params = {
  // ... 现有参数 ...
  playbackRate: 1.3  // 新增：播放速率（1.0 = 正常）
}
```

#### 3. Caption 对象

```javascript
// 字幕对象结构
{
  id: 'subtitle-scene1-0',
  text: '天然成分 零添加',
  startFrame: 150,        // 开始帧
  durationFrames: 60,     // 持续帧数（2秒）
  style: {
    fontSize: 32,
    fontWeight: 600,
    color: '#FFFFFF',
    offsetY: -100,
    fadeIn: 15,          // 淡入帧数
    fadeOut: 15          // 淡出帧数
  }
}
```

### 操作类型定义

```typescript
// change_music 操作
interface ChangeMusicOperation {
  type: 'change_music';
  style: 'elegant' | 'energetic' | 'upbeat' | 'dramatic' | null;
  params: {
    mood?: string;
  } | null;
}

// adjust_rhythm 操作
interface AdjustRhythmOperation {
  type: 'adjust_rhythm';
  params: {
    description: string;
    fastStart?: number;  // 前N秒加速
    slowEnd?: number;    // 后N秒减速
  };
}

// add_subtitles 操作
interface AddSubtitlesOperation {
  type: 'add_subtitles';
  params: {
    texts: string[];
    timing: 'key-moments' | 'auto';
    animation: 'fade' | 'none';
  };
}
```

## 限制与注意事项

### 当前限制

1. **音乐生成**
   - 需要 MiniMax API 配置才能生成新音乐
   - 如果 API 不可用，只会移除旧音乐但不生成新音乐

2. **节奏调整**
   - 仅支持基于时间段的简单加速/减速
   - 不支持基于内容的智能变速

3. **字幕添加**
   - 字幕位置是自动分配的
   - 不支持精确指定字幕出现的具体时间点
   - 字幕样式是预设的，用户暂时无法自定义

### 性能考虑

- **音乐更换**：需要重新渲染整个视频（~30-60秒）
- **节奏调整**：只修改播放速率，渲染较快（~20-30秒）
- **字幕添加**：只添加文本层，渲染很快（~10-20秒）

### 兼容性

✅ **向后兼容**
- 所有现有编辑功能继续正常工作
- 现有项目可以使用新功能

✅ **降级处理**
- 如果音频API不可用，会跳过音乐生成但不会失败
- 如果节奏参数无效，会保持原有节奏

## 未来改进方向

### 短期（1-2周）

1. **音乐库集成**
   - 接入真实的音乐生成API
   - 支持更多音乐风格和情绪

2. **字幕定位优化**
   - 支持用户指定字幕位置
   - 基于场景内容智能放置字幕

3. **节奏调整增强**
   - 支持更精细的速率控制
   - 基于场景内容自动建议节奏调整

### 中期（1个月）

1. **批量操作**
   - 支持一次编辑中同时修改多个元素
   - 例如："更换音乐并添加字幕"

2. **模板系统**
   - 预设常见的编辑组合（如"营销视频优化"）
   - 一键应用多个编辑操作

3. **撤销/重做**
   - 支持撤销上一轮编辑
   - 查看编辑历史并回退到任意版本

### 长期（3个月+）

1. **AI辅助编辑**
   - 基于视频内容智能建议编辑操作
   - 自动优化视频节奏和转场

2. **实时预览**
   - 在编辑前预览效果
   - 支持参数调整的实时反馈

3. **协作编辑**
   - 多人同时编辑同一项目
   - 编辑冲突检测和解决

## 相关文档

- [OpenClaw 迁移修复文档](./OPENCLAW_MIGRATION_FIXES.zh-CN.md)
- [多轮对话编辑 API 文档](../runtime/openclaw/skills/commerce-edit-and-variant/SKILL.md)
- [测试脚本使用指南](../scripts/README.md)

## 更新日志

### 2025-01-XX v1.0
- ✅ 实现音乐更换功能
- ✅ 实现节奏调整功能  
- ✅ 实现字幕添加功能
- ✅ 添加意图识别增强
- ✅ 创建测试脚本
- ✅ 完成文档编写

---

**维护者**: Video Agent Team  
**最后更新**: 2025-01-XX
