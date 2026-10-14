# Schedule Status

Verified: 2026-10-08T00:55:18.479723Z

Backend: macOS launchd. Three existing jobs are loaded; this is not a new Codex-native automation. No native task file exists at the previously recorded `.codex/automations/hyperframe/automation.toml`.

Watchdog
- backend: launchd
- task id / plist: com.hyperframe.longrun.watchdog / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.watchdog.plist
- interval: 60 seconds
- loaded: true
- manual trigger: launchctl kickstart gui/501/com.hyperframe.longrun.watchdog (no -k; current writer was not interrupted)
- last run log: 2026-10-08T00:59:49.477Z / wait_external
- launchctl: runs = 38; last exit code = 0; run interval = 60 seconds; job state = exited
- log: .longrun/logs/watchdog.log

Resume
- backend: launchd
- task id / plist: com.hyperframe.longrun.resume / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.resume.plist
- interval: 900 seconds
- loaded: true
- manual trigger: launchctl kickstart gui/501/com.hyperframe.longrun.resume (no -k; current writer was not interrupted)
- last run log: 2026-10-08T00:59:49.401Z / wait_external
- launchctl: runs = 2; pid = 3299; last exit code = 1; run interval = 900 seconds; job state = running
- log: .longrun/logs/resume.log
- real resume verified: this execution was resumed in session 01a0c9ca-9cdd-7533-904f-6fee16ea34ca by PID 3299 at 2026-10-08T00:27:12.315Z; running kickstart did not create a second execution. Direct resume script additionally returned SKIP_ALREADY_RUNNING.

Report
- backend: launchd
- task id / plist: com.hyperframe.longrun.report / /Users/a1234/Library/LaunchAgents/com.hyperframe.longrun.report.plist
- interval: 3600 seconds
- loaded: true
- manual trigger: launchctl kickstart gui/501/com.hyperframe.longrun.report (no -k; current writer was not interrupted)
- last run log: 2026-10-08T00:59:49.591Z / read_only_report
- launchctl: runs = 3; last exit code = 0; run interval = 3600 seconds; job state = exited
- log: .longrun/logs/report.log
- report path: .longrun/REPORT.md

Validation (this round)
- Active single-writer guard: PASS, actual writer plus isolated real-script test. Dead PID plus 120-second heartbeat expiry required; six concurrent stale-recovery entrants produced exactly one owner.
- Capacity classification/backoff gate: PASS in current-execution event tests and isolated WAIT_CAPACITY script run. Real capacity outage/recovery was not induced.
- Existing running job dedupe: PASS in isolated real-script run, TRACK_EXISTING_JOB and unchanged job id. Current live backend query is permission-blocked; persisted production snapshot is needs_user.
- accepted and user STOP: PASS, watchdog skips backend probing; resume does not start Codex; report leaves STATE unchanged.
- 12 scheduler regressions plus the existing self-test passed. Watchdog/report manual kickstarts returned exit 0. Current resume wrapper predates the source fix; repaired code loads at the next launch.
- Current STATE: waiting_external, accepted=false. Browser authorization and localhost access must be restored before production continues. Scheduled gates wait without new model calls.
- Raw Codex log: updated wrapper caps at 4 MiB, retains newest 2 MiB; bounded-write test passed. Existing live wrapper was not interrupted and still uses its earlier code until it exits. New wrapper launch/model recovery after these source repairs is not claimed as verified.
