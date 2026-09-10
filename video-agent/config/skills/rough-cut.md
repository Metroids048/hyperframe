# 粗剪与素材分析（项目适配）
来源及许可证见 registry.json 和 upstream/auto-editor/LICENSE。原工具的 CLI 不直接执行；项目使用受控 FFmpeg4 兼容分析和可选 PySceneDetect。

去停顿之前读取 analysis.silence；缺失时在 toolRequests 请求 detect_silence，assetId 为真实素材 id，threshold 默认 -38 dB、minDuration 默认 0.5秒。素材没有音轨时不能做静音粗剪。检测的 start/end 是源秒数，必须按片段 in/out/rate 映射到当前成片。语句头尾各保留约0.12秒，关键停顿不可全部删除。

找镜头边界可请求 detect_scenes，结果只提供候选边界，不能代表语义精彩。根据内容选片还需真实 transcript/scenes 分析。已有检测结果或明确 not_configured 时不可反复请求同一工具；改用已有证据或给出准确的能力限制。删句优先使用句子时间，避免从半个词开始；不以静音阈值代替内容理解。
