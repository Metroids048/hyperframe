# 03. HyperFrames 资源智能调度

## 资源调度哲学

**目标**：充分利用 HyperFrames 生态，而不是堆砌模板

**原则**：
1. **适配优先**：选择真正匹配需求的资源，不为了用而用
2. **组合创新**：多个简单组件 > 一个复杂但不贴合的模板
3. **原创兜底**：没有合适资源时，用原生能力创建
4. **性能可控**：不引入超出预算的重度资源

## 资源类型与选择策略

### 1. Composition Templates（组合模板）

**适用场景**：
- 有现成的、高度匹配的完整案例
- 只需要替换素材和文字，逻辑不变

**选择标准**：
```
✓ 业务场景匹配（产品上新 vs 教程演示）
✓ 画幅匹配（16:9 vs 9:16）
✓ 时长接近（±20%）
✓ 素材结构相似（图片主导 vs 视频主导）
```

**反例**（不要强行套用）**：
```
✗ 用美妆教程模板做咖啡机演示
✗ 用16:9模板强行裁切成9:16
✗ 用60秒模板硬塞进15秒
```

### 2. Components（可复用组件）

**适用场景**：
- 局部功能需要（标题卡、价格标签、步骤指示）
- 需要组合多个独立元素

**核心组件库**：
```
文字类：
- dynamic-title: 动态标题，适合开场
- caption-rail: 字幕轨，适合旁白
- price-tag: 价格标签，突出优惠
- step-indicator: 步骤指示，适合教程

视觉类：
- product-reveal: 商品揭示动画
- detail-callout: 细节标注
- comparison-split: 对比分屏
- sequence-grid: 序列网格

转场类：
- smooth-fade: 柔和淡入淡出
- swipe-transition: 滑动转场
- zoom-bridge: 缩放衔接
```

**组合策略**：
```
新品上市 = dynamic-title + product-reveal + caption-rail + price-tag
教程演示 = step-indicator + detail-callout + caption-rail
商品对比 = comparison-split + detail-callout + caption-rail
```

### 3. Effects & Animations（特效与动画）

**适用场景**：
- 需要突出某个元素
- 需要引导观众视线
- 需要增强节奏感

**克制原则**：
```
✓ 有明确目的的动效（引导视线到价格标签）
✗ 无目的的炫技（3D 翻转纯粹为了酷炫）

✓ 符合品牌调性的动效（运动品牌用快速切换）
✗ 违背调性的动效（母婴产品用重金属转场）

✓ 性能可控的动效（简单的缩放、位移）
✗ 性能杀手动效（复杂粒子系统、实时3D渲染）
```

### 4. Themes & Styles（主题与风格）

**适用场景**：
- 需要统一的视觉风格
- 品牌有明确的色彩/字体规范

**选择流程**：
```
1. 识别品牌调性
   科技感 → 简约几何、冷色调
   活力感 → 动态曲线、暖色调
   高端感 → 留白、衬线字体、低饱和度
   
2. 匹配预设主题
   检查主题的：
   - 色彩方案（主色、辅色、强调色）
   - 字体选择（标题、正文、标注）
   - 动效风格（快/慢、线性/弹性）
   
3. 微调适配
   替换品牌色、调整字号、修改动效时长
```

## 资源选择决策树

```
用户需求
  ↓
有完整匹配的模板？
  ├─ 是 → 使用模板 + 替换内容
  └─ 否 ↓
    
有多个可组合的组件？
  ├─ 是 → 组合组件 + 自定义衔接
  └─ 否 ↓
    
需求可以拆解吗？
  ├─ 是 → 部分用组件 + 部分原创
  └─ 否 ↓
    
完全原创
  └─ 使用 HyperFrames 原生能力
     - HTML + data-* 属性
     - GSAP 时间轴
     - 自定义动画
```

## 资源验证清单

在选择资源前，必须验证：

```
□ 依赖检查
  - HyperFrames 版本兼容（当前：0.8.33）
  - 所需字体已安装
  - 所需插件已启用

□ 输入契约
  - 素材格式符合要求（图片/视频）
  - 素材尺寸在允许范围内
  - 文字长度不超过限制

□ 性能预算
  - 渲染时长预估（<5分钟）
  - 内存占用预估（<4GB）
  - 文件大小预估（<100MB）

□ 可编辑性
  - 关键元素可独立修改
  - 时间轴不依赖硬编码值
  - 资源路径不是绝对路径

□ 授权合规
  - 资源许可证明确
  - 使用范围符合许可
  - 归属信息保留
```

## 原创兜底能力

当没有合适资源时，使用这些原生能力：

### 基础布局
```html
<!-- 全屏商品展示 -->
<div class="clip" data-start="0" data-duration="3">
  <img src="product.jpg" style="width:100%; height:100%; object-fit:contain;">
</div>

<!-- 分屏对比 -->
<div class="clip" data-start="3" data-duration="4">
  <div style="display:flex; width:100%; height:100%;">
    <img src="before.jpg" style="width:50%; object-fit:cover;">
    <img src="after.jpg" style="width:50%; object-fit:cover;">
  </div>
</div>
```

### 动态文字
```html
<!-- 标题渐显 -->
<div class="clip" data-start="0" data-duration="2">
  <h1 data-animate="fade-in" data-animate-delay="0.5">
    新品上市
  </h1>
</div>
```

### 简单转场
```javascript
// GSAP 时间轴
gsap.timeline()
  .to('.scene-1', {opacity: 0, duration: 0.5})
  .set('.scene-2', {opacity: 1}, '-=0.25');
```

## 输出格式

```json
{
  "selected_resources": [
    {
      "type": "component",
      "name": "product-reveal",
      "version": "1.2.0",
      "reason": "适合商品从黑暗中逐渐显现的效果",
      "usage": {
        "scene_id": "scene-001",
        "position": "0-3s",
        "customization": {
          "duration": 2.5,
          "easing": "power2.out",
          "background": "#000000"
        }
      },
      "dependencies": ["gsap@3.12.0"],
      "verified": true
    }
  ],
  "custom_elements": [
    {
      "type": "text-overlay",
      "reason": "价格标签样式在组件库中找不到合适的",
      "implementation": "custom_html_css",
      "complexity": "low"
    }
  ],
  "performance_estimate": {
    "render_time": "3-4 min",
    "memory_peak": "2.1 GB",
    "output_size": "45 MB"
  }
}
```
