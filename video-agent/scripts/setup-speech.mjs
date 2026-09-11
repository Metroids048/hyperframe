import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from '../lib/workflow.mjs';
import {pythonExecutable} from '../lib/runtime-tools.mjs';

const uv=process.env.VIDEO_AGENT_UV||[path.join(os.homedir(),'.local/bin/uv.exe'),path.join(os.homedir(),'.local/bin/uv')].find(existsSync)||'uv';
const venv=path.join(ROOT,'.venv-speech'),python=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(args){const result=spawnSync(uv,args,{cwd:ROOT,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status)process.exit(result.status);}
if(!existsSync(python))run(['venv',venv,'--python',pythonExecutable()]);
run(['pip','sync','requirements-speech.lock','--python',python,'--require-hashes']);
console.log('本地语音依赖已就绪：'+python+'。模型缓存由语音引擎单独检查。');
