# 路径标记：现有运行规则／新增制作计划／待生成产物

## [EXISTING] 已核对或由现有读取链引用的运行入口
| 文件/目录 | 本轮用途 |
|---|---|
| `video-agent/config/commerce.json` | 素材根配置；读当前完整文件后最小更新materialRoots，不覆盖其他配置 |
| `video-agent/lib/creative/material-roots.mjs` | 授权素材扫描、header检查；不能把not_assessed改成已看过 |
| `video-agent/lib/creative/message-routing.mjs` | 实际模式判定与冲突处理 |
| `video-agent/lib/creative/commerce-skills.mjs` | 业务Skill和失败合同 |
| `video-agent/lib/creative/scene-package.mjs` | 将场景包按生产阶段加载 |
| `video-agent/commerce/scenes/product-launch/` | S01运行规则 |
| `video-agent/commerce/scenes/product-detail/` | S02与继承详情目的的S08规则 |
| `video-agent/commerce/scenes/product-demo/` | S03及继承过程目的的S07规则 |
| `video-agent/commerce/scenes/product-collection/` | S04运行规则 |
| `video-agent/commerce/scenes/product-promotion/` | S05运行规则 |
| `video-agent/commerce/scenes/product-faq/` | S06运行规则 |
| `video-agent/lib/creative/resource-catalog.mjs` | 精确资源召回和作用范围 |
| `video-agent/lib/creative/effects.mjs` | 已注册项目效果；不能据此认定所有官方资源都已适配 |
| `video-agent/lib/creative/model-edit.mjs`、`patch.mjs`、`history.mjs`、`branches.mjs` | 规划、对象修改、历史和分支 |
| `video-agent/lib/creative/captions.mjs`、`voice.mjs`、`audio-assets.mjs` | 字幕、人声、声音替换 |
| `video-agent/lib/creative/service.mjs` | 现有消息/制作/编辑/交付入口 |
| `hyperframe_full_closeout/scenes/S01.md`—`S08.md` | 原八场景义务，不当成已完成状态 |
| `video-agent/EXECUTION_STATUS.md` | 既有状态记录；复用，不另建监督平台 |

六个业务场景目录内重点修改的是`STORY_GRAMMAR.md`、`MATERIAL_POLICY.md`、`RESOURCE_PROFILE.json`、`AUDIO_POLICY.md`、`QUALITY_RUBRIC.json`、`EDITING_POLICY.md`以及对应真实加载函数。只改本包文档不会改变运行中的Agent。

## [NEW-IN-PACKAGE] 本轮实际提供的新增文件
本包所有文件位于`video-agent/docs/scene-demos-phase2/`。它们已经生成在对话附件中，**尚未写入或推送GitHub，也不是已生效运行配置**。包文件清单见`PACKAGE_CHECK.json`。

## [PROPOSED] Codex执行时按真实结果建立
- `video-agent/assets/scene-demo-inputs/raw/`：允许下载的补充视频；现在不存在于本包。
- `video-agent/deliverables/scene-demos-phase2/S01/`—`S08/`：实际视频/工程/回执，S08含A/B。
- 当前场景必要的生产源文件修改：先定位调用断点，最小修改；不强制新增上一轮提议的五个全局文件。

每次收口更新状态：`[NEW] 路径 → 业务目的 → 谁加载/调用 → 哪个实际run验证`；已有文件用`[MODIFIED]`，沿用正确能力用`[REUSED]`。开发Prompt、运行时规则与产物路径分开，不把开发文档数量当成产品能力。
