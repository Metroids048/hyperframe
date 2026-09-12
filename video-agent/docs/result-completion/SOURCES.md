# 来源与版本边界

本包是执行设计，不是代码修复或成片验收结果。2026-09-12 本轮通过 GitHub 读取 main，仍为 8e3e61a5cc3e3edffdd190cda9d0de679a8d3bdc。具体故障以本地最新代码重现为准。

## 项目与用户材料

- 当前会话 AUDIT.md、CODEX_FIX_AND_ACCEPT.md、CI_check.log 与 CI_30s_fixture.mp4：8e3e61a 审查输入。
- 用户 Library 的 CONTINUE_TO_RESULTS.md：已有的持续执行、45/60/90/120/180秒、Q/I/H原任务、10—14轮修改、人评与工程分离约定。里面的绝对路径与失败时间戳是历史线索，不能当作当前现场已存在。
- 较早 ACCEPTANCE_REVIEW.md 对 c175eba 的锁文件和前端问题属于旧快照；8e3e61a 的 CI 与前端已前进，因此本包要求核验而非照旧判缺陷。
- 固定仓库文件：video-agent/lib/creative/{isolation,production,capabilities,native-recipes,evidence-index,repair-routing,direction-preview,service}.mjs；video-agent/scripts/{native-scene-worker.mjs,native-scene-job.ps1,test-creative-custom.mjs}；video-agent/web/commerce.js；docs/commerce-quality-next/ 和 docs/commerce-agent-next/。

## 官方参考（执行时以已锁本地版本为准）

- OpenAI Model guidance，initiative/follow-through 与 skills 指令影响：https://developers.openai.com/api/docs/guides/latest-model
- Node.js 22 child_process 生命周期与 kill 语义：https://nodejs.org/download/release/v22.19.0/docs/api/child_process.html
- HyperFrames prompting overview：https://hyperframes.heygen.com/prompting/overview
- 已安装 HyperFrames 和 hyperframes-cli 技能：布局先于动效、设计规则、预览/渲染与真实检查。技能的新命令不自动意味着固定0.8.33支持，执行前核实本地帮助。

外部参考用于工作方法与技术核验，不授权新提供方、收费、升级或上传素材。检查器是本轮新编写的通用只读工具；其自测不等于项目测试。
