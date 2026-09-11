# 原创场景源码与执行边界

主界面仍只接受需求文本与可选素材。当已有组件不足以表达需求时，导演可返回 `custom-native` 场景。原生 `document.json` 的 `sourceBundles` 保留该场景的 HTML/SVG、CSS、有限 GSAP 时间线、参数范围、对象映射和运动目标。后续对参数或文案的修改仍产生独立版本。

这条路线支持原创布局、路径、多层图形和图片，并非任意 JavaScript 运行器。源码只允许已声明对象的有限 GSAP 调用与简单数值表达式；不接受函数、循环、回调、外链或额外执行入口。Acorn、parse5、PostCSS 分别解析脚本、HTML 与 CSS，服务不使用 eval。图片来自声明素材；文字由可编辑原生节点填入，额外标签需引用用户原话或简单编号。

Windows 下，可信执行器清空继承环境，在独立用户目录启动 Chromium，保留浏览器沙箱。源码页面仅可读取临时服务明确列出的本工程文件；CSP 与请求拦截阻止网络连接、其他项目、文件 URL、worker、子页面和导航。进程启动后先等待隔离分配门闩，进入 Job Object 后才打开页面。

Job Object 限制为单进程 1 GiB、整个作业 2 GiB、最多 24 个进程、30 秒用户态 CPU 时间、50% CPU 上限及45秒墙钟时间。取消或关闭 Job Object 会终止本作业进程树。这里采用 Windows 官方的 [扩展限制结构](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information)、[CPU 限制](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_cpu_rate_control_information)和[进程分配接口](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)。

运动检查采样固定过程时刻与时间线的中间、结束、重复周期等关键时刻，记录对象的可见性、位置、尺寸、变换、透明度和描边状态，同时保存截图。明确声明的目标静止会失败。通过隔离检查后仍需通过固定 HyperFrames 0.8.33 的完整检查与严格导出。

新创作的自定义解析或隔离失败可让模型仅修复场景源码/参数，最多两轮，保存原方案、错误与修复记录。其他场景、事实、媒体和时长不通过修复改写。编辑失败保留之前的有效版本；局部编辑不自动重写已保存的源码。

当前工程证据见 `outputs/resume/custom-isolation-2026-09-11T05-40-40.231Z`（五项测试）和 `outputs/resume/custom-plan-regression-1789105446563`（真实模型原方案修正编译支持后的24时刻采样与完整检查）。后者是工程回归，并非一次新项目生成成功记录。真实 UI 创建/续改/导出另行记录在运行证据中，人工审阅仍独立标记。
