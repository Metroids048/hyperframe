# OpenClaw Migration Closeout

范围：以 OpenClaw v2026.6.11 原生 WebUI 为入口，复核 F01-F14、修复本轮阻断、冻结构建后执行 A0/A1/A2/A3/B 原生浏览器验收。HyperFrames 固定 0.8.33。

顺序：环境与保护 → 原生浏览器首失败复现 → 合同/任务修复 → 完整制作与续改 → 稳定性/恢复 → 视觉音频验收 → 冻结复验。

停止条件：仅 AGENT_ACCEPTED / READY_FOR_USER_ACCEPTANCE；USER_ACCEPTED 需要用户本人确认。外部不可解阻塞标记 BLOCKED_EXTERNAL / NOT_ACCEPTED。
