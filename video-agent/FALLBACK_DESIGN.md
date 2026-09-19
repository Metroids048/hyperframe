# 兜底与恢复设计

## 模型层

- 主模型由 `VIDEO_AGENT_CODEX_MODEL` 指定，按顺序读取 `VIDEO_AGENT_CODEX_FALLBACK_MODELS`。
- 可降级错误：额度/限流、模型不可用、容量不足、`CODEX_TIMEOUT`。
- 不可降级：登录失效、CLI 不兼容、普通请求失败、用户取消。
- 每次调用保留 prompt、schema、request、failure.log、模型和 attempt，不重置预算或输入指纹。

## 生产层

- brief、observe、material、plan、director、HyperFrames、render/export 都是可恢复检查点。
- 素材证据错误允许一次受约束模型重做，但不放宽源时间范围、动作证据或事实门禁。
- 超时/限流恢复沿用同一 job/run；已完成观察不重复执行。
- revision 冲突、当前版本变化和未知供应商提交均保留原任务与用户消息，要求显式下一步。

## 真实验证

本轮真实咖啡任务曾在 gpt-5.6-sol 额度失败；修复后同一 run 从 gpt-5.6-sol 自动切到 gpt-5.6-luna，modelCalls 从 7 增至 8，并继续进入商品理解。该证据证明路径生效，不代表最终 MP4 已交付。
