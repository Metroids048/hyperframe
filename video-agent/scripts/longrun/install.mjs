import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {ensureState,ROOT,STATE_DIR,LOG_DIR,now,atomicWrite} from './common.mjs';
const exec=promisify(execFile),node=process.execPath,uid=String(process.getuid?.()||0),domain=`gui/${uid}`,agents=path.join(os.homedir(),'Library','LaunchAgents');
await ensureState();await fs.mkdir(agents,{recursive:true});await fs.mkdir(LOG_DIR,{recursive:true});
const jobs=[
  {label:'com.hyperframe.longrun.watchdog',script:'watchdog.mjs',interval:60,log:'watchdog'},
  {label:'com.hyperframe.longrun.resume',script:'resume.mjs',interval:900,log:'resume'},
  {label:'com.hyperframe.longrun.report',script:'report.mjs',interval:3600,log:'report'}
];
const plist=job=>`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${job.label}</string>\n<key>ProgramArguments</key><array><string>${node}</string><string>${ROOT}/scripts/longrun/${job.script}</string></array>\n<key>WorkingDirectory</key><string>${ROOT}</string>\n<key>StartInterval</key><integer>${job.interval}</integer>\n<key>RunAtLoad</key><true/>\n<key>ProcessType</key><string>Background</string>\n<key>StandardOutPath</key><string>${LOG_DIR}/${job.log}.stdout.log</string>\n<key>StandardErrorPath</key><string>${LOG_DIR}/${job.log}.stderr.log</string>\n</dict></plist>\n`;
const rows=[];
for(const job of jobs){const file=path.join(agents,job.label+'.plist');await atomicWrite(file,plist(job));await exec('launchctl',['bootout',domain+'/'+job.label]).catch(()=>{});await exec('launchctl',['bootstrap',domain,file]);await exec('launchctl',['enable',domain+'/'+job.label]).catch(()=>{});await exec('launchctl',['kickstart','-k',domain+'/'+job.label]);rows.push({label:job.label,plist:file,intervalSeconds:job.interval,loaded:true,manualTrigger:'kickstart'});}
const schedule=`# Schedule Status\n\n安装时间：${now()}\n\nWatchdog\n- backend: launchd\n- task id / plist: ${rows[0].label} / ${rows[0].plist}\n- interval: 60 seconds\n- loaded: true\n- manual trigger: kickstart -k ${domain}/${rows[0].label}\n- last run: see .longrun/logs/watchdog.log\n- log: .longrun/logs/watchdog.log\n\nResume\n- backend: launchd\n- task id / plist: ${rows[1].label} / ${rows[1].plist}\n- interval: 900 seconds (15 minutes)\n- loaded: true\n- manual trigger: kickstart -k ${domain}/${rows[1].label}\n- real resume verified: see `.longrun/SCHEDULE_STATUS.md` and `.longrun/logs/validation.log`\n\nReport\n- backend: launchd\n- task id / plist: ${rows[2].label} / ${rows[2].plist}\n- interval: 3600 seconds\n- loaded: true\n- manual trigger: kickstart -k ${domain}/${rows[2].label}\n- last run: see .longrun/logs/report.log\n- report path: .longrun/REPORT.md\n\nSingle writer: enforced by .longrun/WRITER.lock; watchdog/report do not acquire it.\n`;
await atomicWrite(path.join(STATE_DIR,'SCHEDULE_STATUS.md'),schedule);console.log(JSON.stringify({backend:'mixed-native-and-launchd',domain,jobs:rows,scheduleStatus:path.join(STATE_DIR,'SCHEDULE_STATUS.md')},null,2));
