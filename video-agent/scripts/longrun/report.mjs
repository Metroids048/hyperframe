import fs from 'node:fs/promises';
import {ensureState,loadState,inspectLock,appendLog,atomicWrite,STATE_DIR,LOG_DIR,now} from './common.mjs';
const state=await ensureState(),lock=await inspectLock();
const logFiles=await fs.readdir(LOG_DIR).catch(()=>[]);const latest=[];
// stdout/stderr are launchd plumbing and can contain plain text. Only read
// structured task logs here; a malformed line must never make the hourly
// report task exit non-zero.
for(const file of logFiles.filter(f=>/^(watchdog|resume|report|init)\.log$/.test(f))){const lines=(await fs.readFile(`${LOG_DIR}/${file}`,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean);for(const line of lines.slice(-1)){try{latest.push(JSON.parse(line));}catch{}}}
const report=`# Longrun Status\n\n更新时间：${now()}\n\n当前阶段：${state.phase||'unknown'}\n\n长期目标：${state.accepted?'已完成':'未完成'}\n\n最近实际成果：\n- ${state.lastProgressAt||'暂无真实进展记录'}\n\n当前视频任务：\n- ${state.activeVideoJobId||'none'}\n\n最近生成视频：\n- ${(state.artifacts||[]).filter(x=>/mp4|video/i.test(String(x))).slice(-1)[0]||'暂无'}\n\n最近一次视觉验收：\n- ${state.acceptance?.visualReview||'pending'}\n\n当前最高优先级问题：\n- ${state.nextAction||'暂无'}\n\n最近错误：\n- ${state.lastError||'暂无'}\n\n下一动作：\n- ${state.nextAction||'暂无'}\n\nWriter：\n- ${lock.exists&&!lock.safeToRecover?'running':'stopped'}\n\n下次自动续跑：\n- ${state.capacityRetryAfter||'按15分钟任务检查'}\n`;
await atomicWrite(`${STATE_DIR}/REPORT.md`,report);await appendLog('report',{task:'report',state_before:state.status,decision:'read_only_report',action:'write_REPORT.md',state_after:state.status});
console.log(JSON.stringify({reportPath:'video-agent/.longrun/REPORT.md',writerAlive:lock.exists&&!lock.safeToRecover},null,2));
