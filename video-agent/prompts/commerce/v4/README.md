# V4 提示词系统 Manifest

## 版本信息

- 版本：4.0.0
- 创建日期：2026-09-21
- 状态：开发中
- 目标：系统化、结构化、可维护的提示词架构

## 设计理念

### 1. 分层清晰
- 00: 系统核心规则（所有阶段必读）
- 01: 输入理解与路由
- 02: 素材分析与充分性判断
- 03: HyperFrames 资源智能调度
- 04: 视频导演与分镜设计
- 05: 质量审查与问题修复
- 99: 故障排查与兜底策略

### 2. 职责单一
每个文件只负责一个明确的阶段，避免职责重叠和冲突。

### 3. 可测试性
每个阶段都有清晰的输入输出格式，可以独立测试。

### 4. 可维护性
- 清晰的命名规则（数字前缀 + 功能描述）
- 独立的文件，易于修改和版本控制
- 避免硬编码，使用配置化

### 5. 兜底完善
每个环节都有明确的失败处理策略，不会悄悄失败。

## 文件结构

```
prompts/commerce/v4/
├── 00-system-core.md          # 系统核心规则
├── 01-input-understanding.md  # 用户输入理解
├── 02-asset-analysis.md       # 素材分析
├── 03-hyperframes-resources.md # HyperFrames 资源调度
├── 04-director-storyboard.md  # 导演与分镜
├── 05-quality-review.md       # 质量审查
├── 99-troubleshooting.md      # 故障排查
├── manifest.json              # 本文件
└── README.md                  # 使用说明
```

## 集成方式

### 阶段映射

V4 提示词系统与现有 R0-R8 的对应关系：

```
V4                          现有 R0-R8
00-system-core          →   R0 (全局规则)
01-input-understanding  →   R1 (INTAKE)
02-asset-analysis       →   R2 (ASSET_REVIEW)
03-hyperframes-resources →  R3 (资源规划)
04-director-storyboard  →   R4 (导演/分镜)
05-quality-review       →   R8 (FINAL_REVIEW)
99-troubleshooting      →   新增（兜底策略）
```

### 加载策略

**方式 A：全量加载**（推荐用于开发测试）
```javascript
const prompts = [
  '00-system-core.md',
  '01-input-understanding.md',
  '02-asset-analysis.md',
  '03-hyperframes-resources.md',
  '04-director-storyboard.md',
  '05-quality-review.md',
  '99-troubleshooting.md'
].map(file => loadPrompt(`prompts/commerce/v4/${file}`));
```

**方式 B：按需加载**（推荐用于生产）
```javascript
// 根据当前阶段加载对应提示词
const stage = 'asset-analysis';
const corePrompt = loadPrompt('prompts/commerce/v4/00-system-core.md');
const stagePrompt = loadPrompt(`prompts/commerce/v4/02-asset-analysis.md`);
const troubleshootingPrompt = loadPrompt('prompts/commerce/v4/99-troubleshooting.md');

const context = [corePrompt, stagePrompt, troubleshootingPrompt].join('\n\n');
```

## 与现有系统的兼容性

### 过渡期策略

1. **Phase 1：并行运行**（当前阶段）
   - V4 提示词与现有 R0-R8 并行存在
   - 通过配置开关选择使用哪个版本
   - 对比两个版本的输出质量

2. **Phase 2：灰度发布**
   - 部分用户/场景使用 V4
   - 收集反馈并优化
   - 验证稳定性

3. **Phase 3：全面切换**
   - V4 成为默认版本
   - R0-R8 标记为 deprecated
   - 最终移除旧版本

### 配置示例

```json
{
  "prompt_version": "v4",
  "prompt_base_path": "prompts/commerce/v4",
  "enable_troubleshooting": true,
  "enable_quality_review": true,
  "fallback_to_v3": false
}
```

## 质量保证

### 单元测试

每个阶段的提示词都需要通过以下测试：

```javascript
// 示例：测试输入理解阶段
test('01-input-understanding: 识别 CREATE 操作', async () => {
  const input = "我要做一个蛋白粉的上新视频";
  const result = await runStage('01-input-understanding', input);
  
  assert.equal(result.operation, 'create');
  assert.equal(result.scenario, 'product_launch');
  assert.equal(result.product_name, '蛋白粉');
});
```

### 集成测试

完整流程测试：

```javascript
test('端到端：新品上新视频制作', async () => {
  const input = {
    message: "制作蛋白粉上新视频",
    assets: ['protein-front.jpg', 'protein-usage.mp4']
  };
  
  const result = await runFullPipeline(input);
  
  assert.equal(result.status, 'success');
  assert.exists(result.video_path);
  assert.exists(result.project_path);
});
```

### 回归测试

确保 V4 不会降低现有功能的质量：

```javascript
test('回归：V4 vs V3 质量对比', async () => {
  const testCases = loadRegressionTestCases();
  
  for (const testCase of testCases) {
    const v3Result = await runV3(testCase.input);
    const v4Result = await runV4(testCase.input);
    
    // 确保 V4 的质量不低于 V3
    assert.greaterOrEqual(v4Result.quality_score, v3Result.quality_score);
  }
});
```

## 性能指标

### 目标指标

```
制作成功率：≥95%
平均制作时间：≤5分钟
首次成功率：≥85%（无需重试）
用户满意度：≥4.0/5.0
```

### 监控方式

```javascript
// 记录每个阶段的性能
const metrics = {
  stage: '01-input-understanding',
  duration_ms: 1200,
  success: true,
  retry_count: 0,
  token_usage: 450
};

await logMetrics(metrics);
```

## 后续优化方向

1. **提示词压缩**
   - 当前版本注重可读性和完整性
   - 生产环境可以压缩为更简洁的版本
   - 移除示例和详细说明，保留核心规则

2. **动态提示词**
   - 根据用户历史行为调整提示词
   - 根据模型反馈优化提示词
   - A/B 测试不同提示词版本

3. **多语言支持**
   - 当前仅支持中文
   - 未来可扩展到英文、日文等
   - 使用国际化框架管理

4. **领域扩展**
   - 当前专注于电商场景
   - 未来可扩展到教育、企业宣传等
   - 通过插件化机制添加新场景

## 贡献指南

### 修改提示词

1. 修改对应的 `.md` 文件
2. 更新 `manifest.json` 中的版本号和变更日志
3. 运行测试确保没有破坏现有功能
4. 提交 PR 并说明修改原因

### 添加新阶段

1. 创建新的 `.md` 文件，命名规则：`NN-stage-name.md`
2. 在 `manifest.json` 中注册新阶段
3. 编写对应的测试用例
4. 更新本 README

## 变更日志

### v4.0.0 (2026-09-21)

**新增**：
- 创建 V4 提示词系统
- 7个核心提示词文件
- 系统化的兜底策略
- 完整的故障排查指南

**改进**：
- 更清晰的职责划分
- 更结构化的输入输出格式
- 更完善的错误处理
- 更详细的用户沟通模板

**待办**：
- [ ] 完成所有单元测试
- [ ] 与现有系统集成
- [ ] 灰度发布验证
- [ ] 性能优化
- [ ] 文档完善
