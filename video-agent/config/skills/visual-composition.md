# 画面、叠加与转场（项目适配）
来源及许可证见 registry.json 和 upstream/hyperframes-core/LICENSE。所有画面变化写入统一时间线；不要直接生成 HTML 或代码。

画中画/B-roll 用 overlay_add；rect 是画布上的归一化区域，crop 是原素材上的归一化取景区域。画中画默认静音，避免叠加两路人声。调整画幅输出使用 output；保证主体完整优先 contain，用户要求铺满才 cover。转场用相邻片段稳定 id 的 transition，保持短而克制，不能以转场掩盖错误选片。

source 锚点随素材剪辑，timeline 固定成片时刻，end 跟随片尾。需理解内容时必须引用实际分析或抽帧证据；不支持或没有素材时说明缺少什么，不能宣称已生成 B-roll。
