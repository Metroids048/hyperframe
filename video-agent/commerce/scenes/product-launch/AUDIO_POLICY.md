# AUDIO_POLICY

字幕与TTS独立。只有明确要求旁白才生成。有价值原声可保留；BGM须有授权，不能默认为静音或自动配音。 音频记录source、license、role、volume、timing、hash。技术电平通过不等于实际听感。

V2 音频按情绪曲线设计：开场可用真实动作声或短促声钩建立注意，中段音乐为卖点节奏留空间，体验段保留能增强可信度的原声，结尾在 CTA 前完成一次能量收束。没有真实音乐资产时保持原声和明确待补状态，不假装音乐已经生成。旁白音色必须先由 AudioRequirement 检索 voice profiles，再从候选中 rerank，禁止把完整音色目录直接交给模型。
