# 来源、范围和当前状态说明

本包于2026-09-11编制。依据用户在本次对话明确确认的产品需求，以及可读取的历史方案内容。未连接用户本机，未据此声明当前仓库实现状态。

## 用户方案来源
[S1] IMPLEMENTATION_PLAN.md：HyperFrames-native Demo & Creative Agent，四种输入、设计/分镜/路由、原生工程、四类演示、证据与复用原则。
[S2] CODEX_LOOPS.md：原 creative-v2 Loop00—11，输入、动效、真实视频、声音、多轮续改与最终验收。
[S3] ENGINEERING_SPEC.md（日期2026-09-10）：原生Document、组件/代码双路径、工具入口、事务、受控范围、音频、质量、Windows性能、24任务与专家相对分。
[S4] 本次用户确认：先完成全部约定功能，已完成部分跳过，重点补未完成；然后准备用户文本/图片等真实演示输入，用户手动通过已有WebUI生成优质输出。

用户给出的另一个对话链接不是本包运行证据。本文本以实际读取的上述方案为背景，当前真完成度必须由P00在本地核对；旧文档中的历史缺口不自动代表现在缺口。

## 本次核验的官方技术参考（不是用户项目已实现证明）
[O1] How a HyperFrames project works：同一原生工程、有限可seek composition、规划文件、变量与同源编辑。官方网页当前能力与用户固定版本应分开核对。
https://hyperframes.heygen.com/concepts

[O2] Create a product or website video：以真实产品证据和目标组织宣传内容，用户不必指定每一幕；不是直接把原素材拼完就算宣传片。
https://hyperframes.heygen.com/guides/product-launch-video

[O3] Create a music-driven video：先分析真实音轨，再按乐句、节奏与信息可读性安排视觉；不默认追加旁白。
https://hyperframes.heygen.com/guides/music-to-video

[O4] Work on a project in Studio：同源原生工程与最终检查、导出后完整观看的官方说明。此参考不是要求用户改用Studio，更不意味着重做已有WebUI。
https://hyperframes.heygen.com/studio

[S5] 当前已安装的 hyperframes / hyperframes-cli 创作技能：定时媒体、有限动画、检查与运行规范。执行时读本地实际生效版本并运行探针；本包不提供未经本机验证的CLI命令。

## 关键区别
HyperFrames官方将HTML源码视为工程。本应用额外维护Document/对象/版本与受管源码bundle，是为可靠对话修改服务的应用层设计；它不得制造多个可独立更改却不同步的事实来源。输出到HyperFrames的源码与应用模型之间要有确定编译/导入合同。

方案中的P00—P14、需求ID、Demo目录、状态文件为本包拟定任务合同，不能宣传成HyperFrames上游内置命令，也不是当前仓库已经存在的函数。

本包未生成商品图片/视频/音频，未执行用户应用测试、未取得人审或Windows性能结果。附带结构校验只证明方案包内部的文件、编号、引用和依赖基本一致；不证明产品功能通过。
