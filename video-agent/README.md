# 商品视频生成与自然语言剪辑

打开 [本地工作台](http://127.0.0.1:3020/)，生成成片后点击“对话剪辑”即可连续修改，无需重新上传。也可在 [上传视频 / 剪辑案例](http://127.0.0.1:3020/edit) 导入自己的视频或体验三个真实样例。

默认通过本机 Codex / ChatGPT 订阅理解指令，HyperFrames 执行、检查、渲染，中文转写和配音本地处理，无需另外填写 API Key。安装与使用见 [EDITING.md](EDITING.md)，真实模型验收见 [EDITING-ACCEPTANCE.md](EDITING-ACCEPTANCE.md)。

以下是保留的早期生成原型说明，不能代表当前剪辑功能范围。

# HyperFrames 视频 Agent：最小可运行原型

**保留的 v0.6 生成前端**：打开 http://127.0.0.1:3020/create ，一段话加图片即可直接生成，生成后在结果区编辑分镜；新增 60/120 秒多镜头样片，原四个案例仍可播放。使用方式见 [LOCAL-DEMO.md](LOCAL-DEMO.md)，产品定义见 [video-agent-definition.md](../video-agent-definition.md)。下文仅保留 v0.1 命令行示例说明。

已跑通：商品 Brief → 输入校验 → 三幕分镜 → HyperFrames HTML / GSAP → 配乐合成 → 15 秒 MP4。

## 先看效果

- 成片：`outputs/qing-demo.mp4`，1280×720，30fps，H.264 + AAC。
- Studio：运行 `npm run preview`，打开 http://localhost:3017/#project/video-agent 。
- 示例：虚构品牌「青序 QING」青柠气泡水，清爽浅绿风格，三幕分别是开场、卖点、品牌 CTA。

## 替换输入

复制 `brief.example.json` 为 `brief.my.json`，修改商品名称、开场文案、三个卖点和 CTA；把商品图放入 `assets/` 并更新 image。当前模板仍是饮料广告，换品类需要同时调整模板内固定的饮料文案。

```powershell
node agent.mjs build brief.my.json
node agent.mjs check
node agent.mjs preview
node agent.mjs render brief.my.json
```

`build` 更新当前工程和分镜；`render` 重建并导出到固定的 `outputs/qing-demo.mp4`，会覆盖上一版。需要保留版本时先另存 MP4。首版支持 15 秒横屏；文本长度在入口处限制，动态内容做 HTML 转义，图片限定为 assets 内本地图片。用户也可以直接在 Codex 中提供新 Brief，让 Codex 修改工程并出片。

## 首版边界

这是由 Codex 执行创意和素材生成、Node 脚本负责确定性编排的 Agent 原型。独立脚本采用固定三幕结构，不包含大模型自由策划、多轮对话 UI、任务队列或镜头级版本系统。没有连接公司生图/生视频 API，也没有生成视频模型镜头或中文配音。

下一步可在 `build()` 前接入规划模型，将自然语言转换为校验过的 Brief；在素材准备阶段接公司图片/视频接口，再把视频以 muted video + 独立 audio 放入 HyperFrames 时间轴。HyperFrames 在本工程承担 HTML 动画合成与渲染，Agent 编排由 Codex 和 `agent.mjs` 承担。

## 运行环境

Windows，Node 22+，Chrome。依赖锁定在 package-lock.json，运行 `npm ci` 安装。FFmpeg/FFprobe 随 npm 依赖安装到本项目，无需全局配置；浏览器路径在 agent.mjs 的 runHF 中。Studio 状态保存在本项目 `.state/`。

## 检查结果与素材来源

- HyperFrames check 已通过运行时、布局、运动、对比度检查，40/40 文本对比度合格。
- 重复图片检测提醒：三幕有意复用同一张商品图；编译结果只有一条音轨，MP4 已验证只有一条 H.264 和一条 AAC。
- 商品图：内置 image_gen 工具生成，保存为 `assets/product.png`。提示词见 `assets/image-prompt.txt`。
- 配乐：`make-music.mjs` 合成的原创轻快音型，15 秒，无人声。GSAP 动画负责镜头推进、排版和转场。
- `outputs/storyboard.json` 保存分镜，`outputs/status.json` 保存最近编排状态。

这是便于看效果的第一版，不等同于已完成公司 API 集成的生产服务。


