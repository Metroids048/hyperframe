# Recovery checkpoint — 2026-10-08

Recorded: 2026-10-08T00:43:14.850938Z

Goal remains incomplete; accepted=false. This is a repair round, not a clean run.

Two production call sites omitted their schema argument. R2 compact observation retry and R4 opening comparison now put image options in the fifth argument. The production-entry regression uses an injected provider and actual PNG bytes; six image/opening tests passed. No external model or new render was claimed.

Resume previously scanned the full historical transcript for capacity. It now uses only current execution error events/stderr and clears inherited capacity after a successful round. Watchdog now respects accepted, STOP and external wait before probing. Twelve isolated scheduler tests passed, including execution of real scripts against copied states; no model was called.

Current launchd resume PID 3299 owns the lock and this Codex session. Direct resume entry returned SKIP_ALREADY_RUNNING. All three launchd tasks were found. Watchdog/report were manually kickstarted and returned exit 0; kickstart of the running resume did not create another executor. Current wrapper loaded before this repair; updated resume code loads on its next launch.

Browser permission was explicitly denied: Computer Use was not approved to use Google Chrome. Shell localhost probes returned EPERM. No bypass, service restart, or duplicate video task was attempted. waiting_external prevents paid retry loops.

Preserved route: job-c745922c-5971-4f9e-b9d3-4d5165ce00d4
Preserved child: job-f197ec14-7dfe-48bf-9c33-13cb91e3afe5
Snapshot: needs_user; revision rev-f33eeb8c885b3f1c, not accepted.

Saved related conversation: http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A60bf7e5e-84f5-43b8-97db-3c08a0fc8b98
This session hash maps to the same project; live opening could not be verified. It is not claimed as a new clean-run conversation.

User option 2/network permission remains active; the old environment-ending requirement must not block the next WebUI step. Do not convert hand-entered demo-mode admission or fixture tests into acceptance evidence.

Next: 先恢复 Chrome computer-use 与 localhost 访问权限；核对服务加载 production.mjs SHA-256 7c3c02cdfdf6d4e26594e9973e790dd37b9ede07c22488834f04c4016ca1f9dc。打开已保存的同工程历史会话确认上下文，在 WebUI 明确应用用户 option 2，再查原 route/child job 后继续。不得新建重复任务，不采用 demo-mode admission 当验收；修复轮后新会话完成 clean run。

Additional scheduler fixes: writer-file changes use a stable OS mutex; stale recovery requires a dead PID and heartbeat age >=120 seconds; another PID cannot release the owner lock. Six concurrent stale-recovery entrants yielded exactly one writer. Raw Codex logs are capped at 4 MiB by the updated wrapper (active wrapper is not restarted). Existing scheduler self-test passed with zero model calls.
