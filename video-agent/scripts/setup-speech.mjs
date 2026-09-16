import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {ROOT} from '../lib/workflow.mjs';
import {pythonExecutable} from '../lib/runtime-tools.mjs';
import {setupChineseSpeechModels} from './setup-speech-models.mjs';

const uv=process.env.VIDEO_AGENT_UV||[path.join(os.homedir(),'.local/bin/uv.exe'),path.join(os.homedir(),'.local/bin/uv')].find(existsSync)||'uv';
const venv=path.join(ROOT,'.venv-speech'),python=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(args){const result=spawnSync(uv,args,{cwd:ROOT,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status)process.exit(result.status);}
if(!existsSync(python))run(['venv',venv,'--python',pythonExecutable()]);
run(['pip','install','-r','requirements-speech.lock','--python',python,'--require-hashes']);
console.log(JSON.stringify(await setupChineseSpeechModels(),null,2));
console.log('本地中文语音依赖及锁定模型已就绪：'+python+'。既有环境的额外依赖与旧模型已保留。');
