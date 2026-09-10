import fs from 'node:fs/promises';
const doc='../video-agent-definition.md';
let old=await fs.readFile(doc,'utf8');
const current=`# 商品短视频制作助手：Agent 定义与实现方案

当前版本：0.3.0-demo｜2026-09-09｜本地演示

## 当前确定的使用形式

采用「一段话描述 + 商品图片 → 整理与优化 → 用户确认 → 分镜 → 视频 → HyperFrames 工作台」。品牌名、商品名、三个卖点、开场和收尾文案作为提取结果展示，用户需要时展开修改，不再在首次进入时逐项填写。

### 本轮已经实现

| 模块 | 当前行为 |
| --- | --- |
| 段落输入 | 8–3000 字需求描述，可从案例填入 |
| 案例优化 | 完整案例文本返回 Codex 预先编写的优化稿，明确标记「非实时调用」 |
| 自由文本整理 | 本地规则提取品牌、商品、卖点；缺项留空，提示补充；不冒充实时 AI |
| 实时 Codex | 适配器已保留，但默认关闭；模型服务连接超时，本轮不继续重试 |
| 视频设置 | 时长 15/30/60 秒；比例 16:9、9:16、1:1；画质 720p、1080p、4K |
| 设置生效范围 | 参数保存到 requestedSettings；实际样片固定 15 秒、16:9、720p，确认前展示差异提示 |
| 风格 | 清爽绿、暖调咖啡、冷调科技、柔和香氛，实际影响模板配色 |
| 案例与成片 | 气泡水、咖啡、头戴耳机、香氛四个案例，均有可播放的 MP4 |
| 结果 | 独立项目、分镜、图片、视频、历史记录与 HyperFrames 编辑副本 |

### 输入与确认规则

用户仅需先输入一段话，可同时上传 1–3 张商品图片，也可选择案例素材。点击「整理并优化需求」展示信息和文案；缺少品牌或商品事实时只标记缺项，不虚构。用户确认或修改后生成分镜，再确认渲染。

目标参数与实际参数必须分别存储。选择 30 秒竖屏 1080p 时，本轮按钮明确显示「按 Demo 规格生成样片」，实际交付仍是 15 秒横屏 720p。此设计用于确认产品框架，不能宣传已实现多规格输出。后续正式实现时，才让 requestedSettings 驱动时间轴、画幅和编码参数。

### 模型策略与网络处理

当前案例文案由 Codex 编写，商品视觉由内置 image_gen 生成，成片由 HyperFrames 合成；不是生成式视频镜头。实时文本适配器采用官方 codex exec 结构化输出能力，登录有效但本机到模型服务连接超时。因此本地应用默认不启动实时调用，选择实时模式会立即给出不可用提示，普通演示不等待网络。

未来接入路径：统一 PlannerAdapter（段落 → schema Brief）和 MediaAdapter（图片/视频任务），先接可连通的 Codex/GPT，再接公司模型。所有模型结果仍需字段与事实校验。不能把本地规则提取标为实时 AI，也不把保留接口写成已经验证的模型能力。

参考：[OpenAI 官方非交互模式文档](https://learn.chatgpt.com/docs/non-interactive-mode)。本机登录用于本地验证，不在网页或文件中暴露凭据。

### 演示案例

| 案例 | 主题 | 成片 |
| --- | --- | --- |
| 青序 QING 青柠气泡水 | 清爽饮品 | 15 秒 / 720p |
| 早屿 MORNING 精品咖啡豆 | 温暖晨间 | 15 秒 / 720p |
| 声域 AURA 无线头戴耳机 | 冷调数码 | 15 秒 / 720p |
| 花间 FLEUR 玫瑰香氛 | 柔和生活方式 | 15 秒 / 720p |

上述均为虚构品牌案例，产品信息为演示输入。案例库支持直接播放成片、下载和使用需求；后续使用真实商品时以用户提供的事实与素材为准。

### 本轮验收与后续

13 项新增检查通过：四个案例视频访问、段落整理、自由文本提取、缺项留空、实时入口立即返回、需求与设置保存、分镜生成和恢复查询。三条新增成片均通过 HyperFrames 检查与实际媒体验证。记录在 video-agent/outputs/v3-tests.json，案例工程在 video-agent/showcase/。

尚未实现：任意段落实时 LLM 已验证接入、多规格实际渲染、公司模型、生成视频镜头、多人服务。本轮不为这些能力继续排查网络，按产品方案确认后的优先级实施。

---

## v0.2 历史基线（保留供追溯）

以下为前一版定义；入口、设置、模型状态与案例范围以以上 v0.3 说明为准。

`;
old=old.replace(/^# 商品短视频制作助手：Agent 定义与实现方案\r?\n/,'');
await fs.writeFile(doc,current+old);
const local='LOCAL-DEMO.md';const prev=await fs.readFile(local,'utf8');await fs.writeFile(local,'# v0.3 快速使用\n\n打开 http://127.0.0.1:3020 ，刷新页面。写一段需求，或在「案例与成片」点击「使用此需求」；选择「演示整理」，确认提取结果后生成分镜和样片。\n\n四个案例可直接播放。时长、比例和画质选项当前保存制作意图；真实出片仍为 15 秒 / 16:9 / 720p。实时 Codex 默认关闭，会立即提示，不再等待重连。输入、文件、分镜与成片仍由本地项目保存。\n\n新版检查：outputs/v3-tests.json，13 项通过。旧版启动方式继续有效。\n\n---\n\n以下为 v0.2 使用记录，入口与当前范围以以上说明为准。\n\n'+prev);
let start=await fs.readFile('start-local.ps1','utf8');await fs.writeFile('start-local.ps1',start.replace("-eq '0.2.0-demo'","-eq '0.3.0-demo'"));
let ui=await fs.readFile('web/experience.js','utf8');ui=ui.replace("$('download').href=c.videoUrl+'?download=1';","$('download').href=c.videoUrl+'?download=1';$('download').download=c.id+'.mp4';");await fs.writeFile('web/experience.js',ui);
console.log('v0.3 documents synchronized');
