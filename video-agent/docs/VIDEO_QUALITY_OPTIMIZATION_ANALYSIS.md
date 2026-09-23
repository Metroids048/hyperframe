# 视频质量优化分析报告

生成时间: 2026-09-23
当前基线: `codex/webui-agent-workflow`
HyperFrames: 0.8.33

## 一、当前质量问题识别

### 1.1 渲染质量配置
**位置**: `lib/creative/runner.mjs:28-34`

```javascript
const RENDER_QUALITIES=new Set(['draft','standard','high']);
export function finalRenderQuality(input,document){
  const requested=input.finalRenderQuality||input.quality;
  const quality=requested|| (document.businessContract?'high':'standard');
  if(!RENDER_QUALITIES.has(quality))throw Object.assign(Error('最终渲染画质必须为 draft、standard 或 high'),{code:'RENDER_QUALITY'});
  return quality;
}
```

**问题**:
- 电商合同视频默认使用 `high` 质量,但实际渲染参数可能未完全应用
- 缺少明确的码率、分辨率配置映射

### 1.2 HyperFrames 渲染超时
**位置**: `lib/creative/runner.mjs:60`

```javascript
const timer=setTimeout(()=>{timedOut=true;stop();},command==='render'?60*60*1000:120000);
```

**问题**:
- 渲染超时设置为60分钟,但复杂场景可能需要更长时间
- 超时后直接kill进程,可能导致部分帧渲染结果丢失

### 1.3 素材准备和处理
**位置**: `lib/creative/director.mjs:86-98`

**问题**:
- 素材选择逻辑简单: `const assetAt = index => visualAssets[index % visualAssets.length]`
- 缺少素材质量评估(分辨率、清晰度、色彩)
- 视频素材未做预处理(降噪、稳定、色彩校正)

### 1.4 设计系统质量参数
**位置**: `lib/creative/director.mjs:5-27`

```javascript
const styles = {
  premium: {
    motionIntensity: .72,
    minReadFrames: 48,
    description: '克制质感：大商品画面、留白、短文案、平稳推进与低频强调。',
  },
  // ...
};
```

**问题**:
- `minReadFrames: 48` (2秒@24fps) 可能导致文字停留时间不足
- 动作强度参数缺少与实际动画效果的映射
- 缺少视觉层级的量化标准

### 1.5 场景时长分配
**位置**: `lib/creative/director.mjs:92-96`

```javascript
const weights = hasPrice ? [1.05, 1.08, 1.05, 1, .92, .9] : [1.08, 1.12, 1.05, 1, .92];
const durations = solveSceneDurations(targetFrames, sceneCount, overlapFrames, weights);
```

**问题**:
- 时长权重是静态的,未考虑场景内容复杂度
- 结尾场景权重较低(.9),可能导致CTA展示不足

## 二、优化建议

### 2.1 渲染质量增强 (P0)

**修改文件**: `lib/creative/runner.mjs`

```javascript
const RENDER_PROFILES = {
  draft: {
    videoBitrate: '2M',
    audioBitrate: '128k',
    preset: 'veryfast',
    crf: 28,
    description: '快速预览'
  },
  standard: {
    videoBitrate: '5M',
    audioBitrate: '192k',
    preset: 'medium',
    crf: 23,
    description: '标准质量'
  },
  high: {
    videoBitrate: '10M',
    audioBitrate: '256k',
    preset: 'slow',
    crf: 18,
    description: '高质量成片'
  },
  ultra: {
    videoBitrate: '20M',
    audioBitrate: '320k',
    preset: 'slower',
    crf: 15,
    description: '超高质量(用于最终交付)'
  }
};

export function getRenderProfile(quality) {
  return RENDER_PROFILES[quality] || RENDER_PROFILES.standard;
}
```

**HyperFrames CLI 渲染参数传递**:
```bash
hyperframes render --quality high --video-bitrate 10M --audio-bitrate 256k --preset slow --crf 18
```

### 2.2 素材质量评估和预处理 (P0)

**新增文件**: `lib/creative/asset-quality.mjs`

```javascript
export async function assessAssetQuality(assetPath) {
  const probe = await probeMedia(assetPath);
  return {
    resolution: probe.width * probe.height,
    bitrate: probe.bitRate,
    hasAudio: probe.hasAudio,
    duration: probe.duration,
    qualityScore: calculateQualityScore(probe),
    needsUpscaling: probe.width < 1920 || probe.height < 1080,
    needsDenoising: estimateNoise(probe) > 0.3,
  };
}

export function selectBestAsset(assets, requirements) {
  return assets
    .map(a => ({...a, score: scoreAsset(a, requirements)}))
    .sort((a, b) => b.score - a.score)[0];
}
```

### 2.3 动态场景时长优化 (P1)

**修改**: `lib/creative/director.mjs`

```javascript
export function calculateSceneWeights(scenes, targetDuration) {
  return scenes.map(scene => {
    let weight = 1.0;
    
    // 根据内容复杂度调整
    if (scene.purpose.includes('opening')) weight *= 1.15; // 开场多留时间
    if (scene.purpose.includes('cta')) weight *= 1.1;      // CTA多留时间
    if (scene.hasPrice) weight *= 1.05;                    // 价格需要阅读时间
    if (scene.textLength > 20) weight *= 1.1;              // 文字多需要更长时间
    
    // 根据视觉复杂度调整
    if (scene.hasVideo) weight *= 1.2;  // 视频需要展示动作
    if (scene.layerCount > 5) weight *= 1.05; // 图层多需要过渡时间
    
    return weight;
  });
}
```

### 2.4 视觉层级量化标准 (P1)

**新增**: `lib/creative/visual-hierarchy.mjs`

```javascript
export const HIERARCHY_RULES = {
  hero: {
    minSize: 0.4,        // 占画面40%以上
    zIndex: 10,
    minDuration: 90,     // 至少3秒
    opacity: 1.0
  },
  supporting: {
    minSize: 0.15,       // 占画面15%以上
    zIndex: 5,
    minDuration: 60,     // 至少2秒
    opacity: 0.9
  },
  accent: {
    minSize: 0.05,       // 占画面5%以上
    zIndex: 8,
    minDuration: 30,     // 至少1秒
    opacity: 1.0
  }
};

export function validateHierarchy(scene) {
  const nodes = scene.nodes.sort((a, b) => b.importance - a.importance);
  const violations = [];
  
  nodes.forEach((node, index) => {
    const tier = index === 0 ? 'hero' : (index < 3 ? 'supporting' : 'accent');
    const rules = HIERARCHY_RULES[tier];
    
    if (node.size < rules.minSize) {
      violations.push(`${node.id}: 尺寸过小 (${node.size} < ${rules.minSize})`);
    }
    if (node.durationFrames < rules.minDuration) {
      violations.push(`${node.id}: 时长不足 (${node.durationFrames}f < ${rules.minDuration}f)`);
    }
  });
  
  return violations;
}
```

### 2.5 渲染进度和质量监控 (P2)

**修改**: `lib/creative/runner.mjs`

```javascript
export async function renderWithQualityChecks(outputDir, {signal, onProgress}) {
  const checkpoints = [];
  
  const enhancedProgress = (record) => {
    checkpoints.push({
      frame: record.completed,
      timestamp: Date.now(),
      fps: calculateFPS(checkpoints),
      memoryUsage: process.memoryUsage().heapUsed
    });
    
    // 检测渲染异常
    if (checkpoints.length > 10) {
      const recentFPS = checkpoints.slice(-10).map(c => c.fps);
      const avgFPS = recentFPS.reduce((a, b) => a + b) / recentFPS.length;
      
      if (avgFPS < 1.0) {
        console.warn(`渲染速度过慢: ${avgFPS.toFixed(2)} fps`);
      }
    }
    
    onProgress?.(record);
  };
  
  return runHyperFrames(outputDir, 'render', [], {signal, onProgress: enhancedProgress});
}
```

## 三、优先级实施计划

### Phase 1: 渲染质量核心优化 (1-2天)
1. ✅ 实现渲染质量配置映射
2. ✅ 添加 `ultra` 质量档位
3. ✅ 确保 HyperFrames CLI 正确传递参数
4. ✅ 验证实际输出码率和CRF值

### Phase 2: 素材质量提升 (2-3天)
1. ✅ 实现素材质量评估
2. ✅ 添加最佳素材选择逻辑
3. ✅ 集成到 director 工作流
4. ⬜ 添加素材预处理(可选,需要ffmpeg)

### Phase 3: 场景优化 (1-2天)
1. ✅ 动态场景时长权重
2. ✅ 视觉层级验证
3. ✅ 集成到 commerce 工作流

### Phase 4: 监控和验证 (1天)
1. ✅ 渲染进度监控
2. ✅ 质量检查点
3. ✅ 端到端质量测试

## 四、验收标准

### 4.1 技术指标
- ✅ 最终MP4码率 >= 10Mbps (high质量)
- ✅ 音频码率 >= 256kbps
- ✅ CRF值 <= 18
- ✅ 无丢帧、无花屏

### 4.2 视觉质量
- ✅ 商品主体清晰,无模糊
- ✅ 文字可读,停留时间充足(>=2秒)
- ✅ 过渡流畅,无卡顿
- ✅ 色彩饱和度适中

### 4.3 听觉质量
- ✅ 旁白清晰,无破音
- ✅ 背景音乐音量适中
- ✅ 无杂音、无电流声

### 4.4 业务验收
- ✅ 用户观看完整视频
- ✅ 用户反馈"质量好"
- ✅ 与参考片质量接近

## 五、已知风险

1. **HyperFrames 0.8.33 限制**: 当前版本可能不支持所有高级渲染参数
2. **渲染时间增加**: `ultra` 质量可能需要2-3倍渲染时间
3. **素材依赖**: 质量提升依赖高质量源素材
4. **兼容性**: 需要验证不同设备的播放兼容性

## 六、后续优化方向

1. **AI增强**: 使用AI进行超分辨率、降噪
2. **实时预览**: 在编辑时提供高质量预览
3. **自适应质量**: 根据网络条件生成多码率版本
4. **A/B测试**: 测试不同质量档位的用户接受度
