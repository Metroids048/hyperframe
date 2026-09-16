import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The Chinese 1.1 model requires its own voice bank, vocabulary and frontend.
// Keep the 1.0 assets: historical projects explicitly selecting them still reopen.
export const chineseSpeechModels=[
 {file:'models/kokoro-v1.1-zh.onnx',url:'https://github.com/thewh1teagle/kokoro-onnx/releases/download/v1.1-zh/kokoro-v1.1-zh.onnx',sha256:'859f9ded9f53be16c24857cdab3254a45da53c3afd5ba6ef134c7de3f822e326'},
 {file:'voices/voices-v1.1-zh.bin',url:'https://github.com/thewh1teagle/kokoro-onnx/releases/download/v1.1-zh/voices-v1.1-zh.bin',sha256:'14cb6186c99e4f6016871405f62046c5df863ae27465cbdc4ee08be7dd703acd'},
 {file:'models/kokoro-v1.1-zh-config.json',url:'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/raw/main/config.json',sha256:'bc333efa5ce4ceff433c8c8e5d027a1eca0166001e4e4a62bea2d26ff7a46890'},
];
async function hash(file){const digest=createHash('sha256');for await(const bytes of createReadStream(file))digest.update(bytes);return digest.digest('hex');}
export async function setupChineseSpeechModels({checkOnly=false,cache=path.join(os.homedir(),'.cache/hyperframes/tts')}={}){
 const report=[];
 for(const entry of chineseSpeechModels){
  const target=path.join(cache,entry.file),actual=await hash(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(actual===entry.sha256){report.push({...entry,status:'verified',path:target});continue;}
  if(actual)throw new Error('模型内容与锁定版本不同，已保留原文件：'+target);
  if(checkOnly){report.push({...entry,status:'missing',path:target});continue;}
  await fs.mkdir(path.dirname(target),{recursive:true});
  const pending=target+'.'+randomUUID()+'.partial';
  await new Promise((resolve,reject)=>{const child=spawn(process.platform==='win32'?'curl.exe':'curl',['--fail','--location','--proto','=https','--proto-redir','=https','--connect-timeout','30','--max-time','900','--output',pending,entry.url],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('模型下载失败，保留部分文件供定位：'+pending)));});
  if(await hash(pending)!==entry.sha256)throw new Error('模型校验失败，未启用下载文件：'+pending);
  // A concurrent install must not replace a file that appeared during download.
  await fs.copyFile(pending,target,fs.constants.COPYFILE_EXCL).catch(async error=>{if(error.code!=='EEXIST'||await hash(target)!==entry.sha256)throw error;});
  await fs.unlink(pending);report.push({...entry,status:'installed',path:target});
 }
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await setupChineseSpeechModels({checkOnly:process.argv.includes('--check')});console.log(JSON.stringify(report,null,2));if(report.some(item=>item.status==='missing'))process.exitCode=1;
}
