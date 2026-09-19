# OpenClaw 项目能力映射（2026-09-20）

本表只记录本轮已接通的真实入口；PASS 表示代码与合同联调证据，原生浏览器三条成片路径仍需现场任务证据。

| 用户需求 | Skill | 实际工具 | 现有执行器 | 工件 | 状态 |
|---|---|---|---|---|---|
| 新建干净工程 | commerce-orchestrator | commerce_project_create | service.create + session/auth binding | projectId、native-project.json | PASS（HTTP 冒烟） |
| 选择已有工程 | commerce-orchestrator | commerce_project_list / get | service.list / openclawProjectContext | project/revision context | PASS（合同测试） |
| 查找本地素材 | commerce-hyperframes | commerce_resource_search | discoverMaterialRoots + query filter | asset candidate、sha256、metadata | PASS（service 联调） |
| 查找可执行制作资源 | commerce-hyperframes | commerce_resource_search | HyperFramesResourceCatalog 0.8.33 | catalog id、compatibility、execution/binding status | PASS（service 联调） |
| 上传源视频 | commerce-orchestrator | managed upload + attachmentPaths | plugin media route + service.upload/probe | inbound path、assetId、mediaMetadata | PASS（patch 已安装；原生页面待复验） |
| 生成素材 | commerce-hyperframes | commerce_generate_asset | enqueue action=generate-asset → asset job → generateCommerceAsset | assetId 或真实暂停错误 | PASS（分类合同）；付费生成暂停时 BLOCKED |
| 编辑、续改、撤销、变体 | commerce-edit-and-variant | commerce_edit_video / revision_control | service.enqueue / navigate | revision、changeReceipt、history | PASS（合同测试）；原生成片 NOT_RUN |
| 导出与媒体检查 | commerce-recovery-delivery | commerce_export / artifact_list | candidateExport、artifacts、delivery gate | MP4、artifact receipt、failureReceipt | PASS（执行器可用）；真实 F4 NOT_RUN |
| 取消与恢复 | commerce-recovery-delivery | commerce_job_control / job_get | AbortController、persisted job | job status/code/error | PASS（全局 journal 不再包等待） |

## 证据

- `scripts/test-openclaw-facade.mjs`：8/8 PASS。
- `scripts/test-openclaw-security-boundary.mjs`：6/6 PASS。
- `scripts/test-openclaw-agent-config.mjs`：14/14 PASS。
- `scripts/test-openclaw-runtime-skills.mjs`：12/12 PASS。
- `scripts/test-openclaw-plugin-contract.mjs`：3/3 PASS。
- `scripts/test-commerce-native.mjs`：13/13 PASS。
- 本地 OpenClaw 2026.6.11 patch：UI 与 attachment bundle 均返回 `already-patched`，并报告实际 bundle hash。
- 真实 HTTP：`/api/health`、授权、`commerce_project_create`、`/api/openclaw/tools` 已在隔离数据目录成功跑通。

## 本轮未完成验收

F4 的 A/B/C 三条必须从原生 Control UI 普通中文输入到真实新 MP4 的任务，在本轮没有可脱敏的全新用户素材、模型供应商回执和页面播放/下载记录，因此标记 `NOT_RUN`；不能用旧样片、工具受理或合同测试替代。生成策略继续保持 `mediaGenerationPaused: true`。
