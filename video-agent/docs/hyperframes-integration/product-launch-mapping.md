# HyperFrames 0.8.33 → Commerce V3

| 官方工作流 | Commerce 层 | 融合方式 |
|---|---|---|
| Setup / brief | R1 business brief + Scene Package | 读取本地合同、版本化 |
| Capture | R2 material understanding | 读取用户选定目录、metadata、抽帧和源秒数 |
| Design system | Creative Director | 输出 `creative-direction.json`，从四种视觉方向选择 |
| Storyboard / script | Story Director | 输出 `story-plan.json`，每幕引用事实和源区间 |
| Audio | Audio Planner | 字幕、原声、BGM、TTS 分离；无明确旁白不生成 |
| Visual design | HyperFrames Resource Planner | 全量 Catalog 检索，再限制到受审 native adapter |
| Frames | Scene Production | 原生可编辑对象，实拍优先，动效不覆盖主体 |
| Final render | R9/R10 | HyperFrames check/render、实际 MP4 技术和抽帧业务审查 |

上游源码位于 `third_party/hyperframes`，只读镜像，固定 v0.8.33。官方 Registry 的 block/component 是参考资源；真正执行必须经过本地适配、哈希 receipt、check 和 render。官方 launch compositions 只提炼“每幕一个信息、持续层级、真实媒体和完整收尾”等规则，不复制其品牌资产或 bundled media。
