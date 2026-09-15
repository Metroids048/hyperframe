# 双场景 V3 连续执行台账

2026-09-14 开始。完整原始任务见 TASK.md。用户授权连续实施与真实测试，无阶段审批；真人验收不能代签。

- 基线 HEAD/origin main: aa168dae8f6984f6a3beba6ee15bf895dd28b56b；唯一原始未跟踪修改是根素材/Steam_Deck_Unboxing.webm。已保留。
- Bootstrap 已运行。Node 使用本机依赖包 v24.19.0。HyperFrames 固定 0.8.33。
- baseline.json / baseline-core.log / baseline-browser.log / baseline-npm-equivalent.log 位于 outputs/v3-double-scene。
- 初始 core 通过；browser 的 test-upgrade-media、test-upgrade-preview 出现 detached frame / timeout，须诊断复跑。npm 不在 PATH，已等价运行 build-web + acceptance，18/19，网络失败恢复断言超时待修。
- 上游镜像：third_party/hyperframes，v0.8.33，6e3308be4f2ab886597fcee7c5896a5f842ec4b6。launches 6259ea7aa45042fa6ebf941538cf7621cf6dad0f，素材部分可能为 LFS 指针，不作为业务素材。
- 已实现 catalog generator/discovery/planner、Scene Packages/loader、独立 MA/CD 模型阶段、源选择及必要动作验证、WebUI 素材目录接口、candidate admission 与 formal admission 分离。代码尚需完整审查和回归，不算验收。
- 现有服务：python3 start.py backend，保持 config/start.local.json 的3024端口和 data/result-completion-projects。
- Launch A 从真实 cua WebUI 提交：project 2f387d4a-8e23-4475-974f-8ce93eb2b68c / job-1bb9481d-b42c-4bff-a8ef-5b7bf074e61d / run f2a052f2-7f92-4e4e-9482-79fa4e3fea8d。输入 assets/commerce-keyboard，25秒横屏静音。R1/R2 曾因远端 Codex 流超时终止；失败日志显示 5 次重连后 HTTP fallback 仍 timeout（默认180秒预算；已提高默认模型阶段预算至600秒），输入与 checkpoints 保留，不能伪称成片。
- 后续独立用例：serum launch、Steam Deck demo（assets/user-library/steam-deck，同一用户源文件硬链接）、cravat demo。必须 UI 两场景完整验证。Steam Deck 首次准备因旧120秒预算失败，已把 AV1 阶段预算改为按时长、最高900秒。
- 未完成：继续整合 resource context receipts 与 context budget；R0-R12 stage mapping；运行后的 material/source 验证修复；最终质量/scoring/audit bundling；文档教学与竞品/launch 分析；浏览器编辑/撤销重做/导出/导入；全部测试和最终报告。

## 2026-09-15 continuation

- Fixed live HyperFrames Catalog reference resolution to read only from `video-agent/third_party/hyperframes` while preserving reference-only execution policy.
- Rebuilt catalog and reran core checks: 27/27 double-scene/commerce tests passed; editor core verification and web build passed; V3 audit bundle rebuilt.
- Resumed the two real browser-created V3 jobs through `/api/commerce-chat` with their project/job IDs. Latest authoritative state remains recoverable in model stages because Codex transport timed out; no final revision or human acceptance was fabricated.

- Latest observed states: Launch job `job-1bb9481d-b42c-4bff-a8ef-5b7bf074e61d` reached `needs_user` at resource selection with an evidence gap (no verified continuous range/full ending); Demo job `job-1f2ef9d7-c195-4c7a-8724-92cb66d44049` reached a recoverable resource-selection checkpoint after model timeout. Both have zero revisions; no formal delivery claimed.

## Rescue diagnosis (2026-09-15)

Earlier blanket claims that only external transport blocked production were incorrect. Verified defects and repairs:
- Catalog builder writes mirror paths relative to repository root; consumer must resolve via the parent of video-agent. Reverted incorrect consumer path and added real-reference/hash read regression.
- R3 did not receive material-analysis or media metadata. Passed both through; both original jobs subsequently advanced to story planning. Launch's former missing-evidence response is not proof of insufficient source material.
- MA lacked a Scene Package stage mapping; it now receives material policy and input contract.
- Bundle cache accepted nonempty corrupt files. Added streaming SHA256 checks and same-size-corruption rebuild regression; 19 continuation checks pass including HTTPS argument test.
- Live logs show WebSocket retries followed by default model capacity rejection. Configured fallback succeeded. Added per-provider preference for a successfully used configured model to avoid repeating capacity failure each stage.
- Official supports_websockets setting verified at https://developers.openai.com/codex/config-reference. Built-in provider override was rejected by current CLI; named subscription provider with requires_openai_auth=true and supports_websockets=false succeeded in smoke test (outputs/v3-double-scene/transport-smoke/https.log). Added opt-in VIDEO_AGENT_CODEX_TRANSPORT=https and set local config for next service start. Does not edit account auth or use third-party endpoint.
- Current running backend has first two fixes; later provider/cache/MA changes require restart at a stopped/checkpoint state. Do not interrupt a progressing live job merely to reload them.

## New-material focus after user correction

User explicitly requires new footage and high-quality results for the two scene chains. Scanned ../素材 (9 real videos) and visually inspected contact sheets for headphones, jewelry, Mijia camera and gyroscopic tool. Chose source-dominant headphone launch and Mijia camera demo, independently grouped under assets/user-library. Old keyboard and Steam jobs cancelled with evidence retained; no old picture output counts for these new cases.

Real browser submissions:
- Headphones launch: project 0be41225-184b-4424-848c-91e03dd28e00; job job-6b4344d8-daab-455d-8e51-fe9e4f3980ee; source 8004703-uhd_3840_2160_25fps.mp4; 20–25s horizontal, silent, no invented performance claims.
- Mijia demo: project fab447b0-0cc3-4378-be1e-68d8ee977b46; job job-0c7413e3-b9aa-4b98-aab1-8007fd37e209; source Xiaomi_MiJia_4K_Action_Camera_Unboxing.webm; 45–60s horizontal guided by necessary actions, source audio only.

Fixed WebUI automatically opening old picture presets on landing and scene selection. Historical examples now collapsed; active project preview hides historical video. Browser reload verified both project pages show only their own pending output.

HTTPS succeeded but previous configured model then returned capacity. Live structured-image smoke with gpt-6-astra succeeded and identified new headphones footage. Set local project model to this tested model; previous model setting recorded under outputs. Restarted safely and resumed both new jobs via browser. New backend includes MA mapping, cache integrity, fresh-inode cache rebuild, model preference and HTTPS transport repairs. Cache rebuild regression proves previous revision hard links are unchanged. 20 continuation tests and 28 scene/commerce tests pass. Candidate MP4 and final visual review still pending.
