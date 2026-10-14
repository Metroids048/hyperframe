import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {registerUpload} from './upload.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const str = {type: 'string'};
const num = {type: 'number'};
const array = items => ({type: 'array', items});
const object = (properties, required = []) => ({type: 'object', additionalProperties: false, properties, required});
const shot = object({id: str, source: str, start: {type:'number',minimum:0}, duration: {type:'number',minimum:0.1,maximum:300}, fit: {type:'string',enum:['contain','cover']},
  text: str, fontSize: {type:'number',minimum:12,maximum:160,description:'字幕字号，像素；通常省略使用默认。'},
  textY: {type:'number',minimum:0,maximum:0.95,description:'字幕顶端占画面高度的比例，如0.84；不是百分数或像素，通常省略。'},
  sourceAudio: {type:'boolean'}}, ['id','source','duration']);
const recipe = object({width:{type:'integer'},height:{type:'integer'},shots:array(shot),mute:{type:'boolean'},
  audio:object({source:str,volume:num},['source']),
  audioTracks:array(object({source:str,volume:{type:'number',minimum:0,maximum:2},
    start:{type:'number',minimum:0,description:'在成片中开始播放的位置，秒。'},
    sourceStart:{type:'number',minimum:0,description:'音源截取起点，秒。'},
    loop:{type:'boolean',description:'是否循环填满剩余时长；配乐可用，旁白通常为false。'}},['source']))}, ['shots']);
const tools = {
  commerce_capabilities: {
    description: '检查实际媒体工具、RunningHub配置、付费预算和授权输入目录。制作前调用，不发起付费请求。',
    parameters: object({}),
  },
  commerce_media: {
    description: '检查真实媒体并返回可见抽帧，或按明确镜头制作单剪辑、加字幕和混音。revise仅修改指定镜头或字段，保留旧版本。render/revise异步返回runId，使用commerce_task等待真实结果。',
    parameters: object({operation:{type:'string',enum:['inspect','render','revise']},paths:array(str),start:num,duration:num,recipe,runId:str,
      changes:array(object({shotId:str,field:str,value:{}},['field','value']))},['operation']),
  },
  commerce_generate: {
    description: '查询锁定的RunningHub能力或AI应用参数，并执行已授权的图像、视频、声音生成。实际执行必须使用已核对能力及配置预算。任务提交后返回runId，由commerce_task查询；不能将入队当完成。',
    parameters: object({operation:{type:'string',enum:['catalog','app_info','generate']},task:str,capabilityId:str,webappId:str,
      prompt:str,params:{type:'object',additionalProperties:true},images:array(str),audio:array(str),videos:array(str),
      nodes:array(object({nodeId:str,fieldName:str,fieldValue:str},['nodeId','fieldName','fieldValue'])),
      estimatedCostCny:num,parentRunId:str},['operation']),
  },
  commerce_task: {
    description: '查看或等待当前会话真实任务结果；recipe读取已有制作单供局部修改；resume恢复已中断本地制作或查询已有供应商任务，绝不重新收费提交。wait每次至多45秒。',
    parameters: object({runId:str,action:{type:'string',enum:['status','wait','recipe','resume']},waitSeconds:num},['runId']),
  },
};

export async function callRuntime(name, input, context, config = {}, signal) {
  if (!context.sessionKey) throw new Error('可信会话缺失，不能执行媒体任务。');
  const env = {...process.env, COMMERCE_SESSION_KEY: context.sessionKey,
    COMMERCE_TOOL_CALL_ID: context.toolCallId, COMMERCE_WORKSPACE: context.workspaceDir || path.join(root,'workspace')};
  for (const key of ['ffmpeg','ffprobe','font']) if (config[key]) env['COMMERCE_'+key.toUpperCase()] = config[key];
  if (config.inputRoots) env.COMMERCE_INPUT_ROOTS = config.inputRoots.join(path.delimiter);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(config.python || process.env.COMMERCE_PYTHON || 'python3', [path.join(root,'runtime.py')],
      {env, stdio:['pipe','pipe','pipe'], signal});
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {child.kill('SIGTERM');reject(new Error('媒体工具响应超时，已提交任务可用原runId查询。'));}, 65_000);
    child.stdout.on('data', chunk => {stdout += chunk; if (stdout.length > 2_000_000) child.kill();});
    child.stderr.on('data', chunk => {stderr = (stderr+chunk).slice(-2000);});
    child.on('error', e => {clearTimeout(timer);reject(e);});
    child.on('close', code => {
      clearTimeout(timer);
      try {resolve(JSON.parse(stdout));}
      catch {reject(new Error(`媒体工具未返回有效结果（exit ${code}）。`));}
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({tool:name,input}));
  });
  const content = [{type:'text',text:JSON.stringify(result)}];
  if (name === 'commerce_media' && input.operation === 'inspect' && result.ok) {
    for (const item of (result.result.media || []).slice(0,2)) {
      for (const frame of (item.frames || []).slice(0,4)) {
        content.push({type:'text',text:`源媒体 ${path.basename(item.path)}，时间 ${frame.sourceTime.toFixed(2)} 秒`});
        content.push({type:'image',mimeType:'image/jpeg',data:(await fs.readFile(frame.path)).toString('base64')});
      }
    }
  }
  return {content, details: result, ...(result.ok ? {} : {isError:true})};
}

export default {
  id: 'commerce-creator', name: '电商创作工具',
  register(api) {
    registerUpload(api);
    for (const [name, def] of Object.entries(tools)) {
      api.registerTool(context => ({name,label:name,...def,
        execute: (toolCallId, input, signal) => callRuntime(name,input,{...context,toolCallId},api.pluginConfig || {},signal),
      }), {names:[name]});
    }
  },
};

export {tools as toolDefinitions};
