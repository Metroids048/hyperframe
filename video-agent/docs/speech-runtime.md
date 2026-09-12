# 本地中文语音

运行 `node scripts/setup-speech.mjs`，使用 uv 在项目 `.venv-speech` 中安装 `requirements-speech.lock` 的固定版本和哈希。不会改动 Codex 自带的 Python 环境。需先安装 uv 和 Python 3.12；当前 Windows 工作台可复用 Codex 已安装的 Python。显式 `VIDEO_AGENT_PYTHON` / `HYPERFRAMES_PYTHON` 优先于项目环境。

Kokoro 模型缓存位置：`~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx` 和 `~/.cache/hyperframes/tts/voices/voices-v1.0.bin`。文件缺失时会报告错误，不替换成无声轨或冒充真人声音。依赖与模型不写入演示视频输入包。

在主输入框说明需要先试听、台词、音色数量（1—3）。试听只产生 WAV；确认某一版后，制作视频使用同一 WAV 文件。新试听会清除旧确认。音色选择没有独立必填表单。

语音和识别均为本地处理；需求理解沿用已有 Codex 订阅。实际播放检查、声音哈希和确认记录保存在项目中；自动检查通过不等同于人工听感验收。
