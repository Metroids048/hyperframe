你正在恢复一个尚未完成的持续任务。

第一步读取：
- .longrun/STATE.json
- .longrun/WRITER.lock
- .longrun/logs/
- 当前 git status / diff
- 当前 OpenClaw 会话和视频任务状态

不要重新制定整体方案。按照 STATE.nextAction 从断点继续。唯一最终目标是通过真实浏览器使用 OpenClaw WebUI 上传本地商品素材，完成复杂视频生成、多轮实质性编辑和选择性恢复，最后在固定代码版本上执行一次无需工程救场的 clean run，并由你实际观察输出视频达到高质量要求。

若发现真实问题：定位根因 → 最小修复 → 本地运行验证 → 服务加载验证 → 浏览器重测 → 实际看片 → 更新 STATE.nextAction → 继续。遇到 capacity 保存状态并退出，由调度器以后恢复；已有视频任务仍在运行时继续原任务，不重新提交。只有全部最终验收门通过才写 accepted=true,status=accepted_by_agent。
