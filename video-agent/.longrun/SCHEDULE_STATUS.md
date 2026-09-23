# Schedule Status

更新时间：2026-09-22T16:19:35.298739Z

Native Codex scheduled task probe：未采用。当前安装版本的 heartbeat 创建尝试被客户端规范化为 30 分钟，不能满足 15 分钟续跑；已删除该重复 heartbeat，使用已加载的本机 launchd fallback。

Watchdog
- backend: launchd
- task id / plist: com.hyperframe.longrun.watchdog / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.watchdog.plist
- interval: 60 seconds
- loaded: true
- manual trigger: `launchctl kickstart -k gui/501/com.hyperframe.longrun.watchdog`
- last run: {"timestamp":"2026-09-22T16:18:43.687Z","task":"watchdog","state_before":"{\"status\":\"running\",\"accepted\":false,\"userStopped\":false,\"job\":null}","decision":"already_running","action":"none","state_after":"{\"status\":\"running\",\"resumeNeeded\":true}","writer":50537,"activeVideoJobId":null}
- log: `.longrun/logs/watchdog.log`
- last exit: 0

Resume
- backend: launchd
- task id / plist: com.hyperframe.longrun.resume / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.resume.plist
- interval: 900 seconds (15 minutes)
- loaded: true
- manual trigger: `launchctl kickstart -k gui/501/com.hyperframe.longrun.resume`
- last run: {"timestamp":"2026-09-22T16:18:43.730Z","task":"resume","state_before":"running","decision":"already_running","action":"none","state_after":"running","ownerPid":50537}
- real resume verified: **true** — isolated persistent Codex session `01a0c9de-3d32-7e53-b808-45e98b04cb77` resumed through the same `codex exec resume` entry, returned exit 0 and emitted `PROBE_RESUMED`.
- production run with writer active: `SKIP_ALREADY_RUNNING` for PID 50537.
- log: `.longrun/logs/resume.log`

Report
- backend: launchd
- task id / plist: com.hyperframe.longrun.report / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.report.plist
- interval: 3600 seconds
- loaded: true
- manual trigger: `launchctl kickstart -k gui/501/com.hyperframe.longrun.report`
- last run: {"timestamp":"2026-09-22T16:18:43.738Z","task":"report","state_before":"running","decision":"read_only_report","action":"write_REPORT.md","state_after":"running"}
- report path: `.longrun/REPORT.md`
- last exit: 0

Validation
- single writer lock: PASS; live PID-backed lock blocks resume and watchdog.
- capacity backoff: PASS; fixture run returned `WAIT_CAPACITY` with retry timestamp and no model invocation.
- backend video-job dedupe: PASS; fixture run returned `TRACK_EXISTING_JOB` and `no_new_submission`.
- accepted stop: PASS; fixture run returned `ACCEPTED_STOP`.
- state writes: atomic temp-file + rename; task logs capped at 1 MiB.
- active production state: accepted=false, userStopped=false, activeVideoJobId=null; video quality goal remains unfinished.
Codex 原生 automation
- backend: Codex desktop automation
- automation id/path: hyperframe / /Users/a1234/.codex/automations/hyperframe/automation.toml
- status: ACTIVE
- actual cadence: RRULE:FREQ=MINUTELY;INTERVAL=20（客户端将请求的 15 分钟规范化为 20 分钟）
- target thread: 01a0c9ee-eedb-7ee1-87bc-76e445449af8
- prompt: reads the same `.longrun/STATE.json` and uses the same writer lock; it does not submit a second video job.

## 2026-09-23 recovery verification

- Native browser session: `agent:commerce-control:dashboard:25fc0336-4015-4062-befc-bd4feb02d148`.
- Initial native status query found the original child `job-c80a4238-dcf5-4a01-a394-c096ee75d57b` recoverable with `OPENCLAW_STAGE_TIMEOUT` and the native assistant emitted a second queued route job `job-fe4f0ad1-6b91-4f8e-87e1-deb634da8a45` → `job-623d430e-87e3-4d75-af3c-d9ff6c73a129`. No further `video_task` submission is permitted; the persistent state tracks this pair.
- Exact child resume was invoked through the existing service resume action for `job-623d430e-87e3-4d75-af3c-d9ff6c73a129` (HTTP 202). The job re-entered `安排整片内容与节奏`; its second story call carried 12 real image inputs.
- Watchdog was extended to probe `/api/commerce/:project` without model calls, prefer an active child over a recoverable route parent, and record `parentStatus`/`childStatus`. A manual run at `2026-09-23T00:16:40Z` returned `track_existing_job` with child `running` and `modelCalls:0`.
- On `OPENCLAW_STAGE_TIMEOUT`, the 15-minute recovery now waits for backoff and resumes the exact persisted child job before any Codex resume; it does not submit a new video task.
- Exact child resume was exercised once; the same `job-623d430e-87e3-4d75-af3c-d9ff6c73a129` reached `story.plan` again and timed out after 300012 ms. The persisted receipts `007-R4.json` and `008-R4.json` both record `OPENCLAW_STAGE_TIMEOUT`, HTTP 409, and `imageCount:12` / `imageBytes:1149888`; this confirms the real story/model request received media before the external timeout.
- Current state is `waiting_capacity` with `accepted:false`; the 60-second watchdog observed both route and child as `recoverable`, and the 15-minute runner will wait until the backoff then call exact child resume. No MP4/revision exists yet, so acceptance remains false.
- Controlled backend reload after source changes: PID `74090`, `/api/health` returned `ok:true`, version `0.7.0-conversation`, `agentRuntime:openclaw`; the recoverable project/jobs remained intact after reload.
