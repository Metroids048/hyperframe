// Compatibility with the installed OpenClaw Control UI video attachment button.
// Runs inside the Gateway. No project server, planning or generation happens here.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export function registerUpload(api) {
  if (!api.registerHttpRoute) return;
  api.registerHttpRoute({path:'/plugins/commerce-engine/upload',match:'exact',auth:'plugin',handler:async(req,res)=>{
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body));return true;};
    if(req.method!=='POST')return reply(405,{ok:false,error:'仅支持上传'});
    const host=String(req.headers.host||''), origin=String(req.headers.origin||''), remote=req.socket?.remoteAddress;
    const expected=Buffer.from(`Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN||''}`), supplied=Buffer.from(String(req.headers.authorization||''));
    const bearer=Boolean(process.env.OPENCLAW_GATEWAY_TOKEN)&&expected.length===supplied.length&&timingSafeEqual(expected,supplied);
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||! /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)||
       !(origin===`http://${host}`||(!origin&&bearer)))return reply(403,{ok:false,error:'上传须来自本机 OpenClaw 页面或已认证客户端'});
    let name;
    try{name=path.basename(decodeURIComponent(String(req.headers['x-openclaw-file-name']||'video.mp4')));}catch{return reply(400,{ok:false,error:'附件名称无效'});}
    name=name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
    const ext=path.extname(name).toLowerCase();
    if(!['.mp4','.mov','.webm'].includes(ext))return reply(415,{ok:false,error:'视频附件支持 MP4、MOV、WebM'});
    const limit=64*1024*1024;
    if(Number(req.headers['content-length'])>limit)return reply(413,{ok:false,error:'视频不能超过 64 MiB'});
    const directory=path.join(process.env.OPENCLAW_STATE_DIR||path.join(os.homedir(),'.openclaw'),'media','inbound');
    await fsp.mkdir(directory,{recursive:true,mode:0o700});
    const target=path.join(directory,`${randomUUID()}-${name}`), temp=target+'.part';
    let bytes=0;
    try{
      await pipeline(req,new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>limit?new Error('UPLOAD_SIZE'):null,chunk);}}),fs.createWriteStream(temp,{flags:'wx',mode:0o600}));
      if(!bytes)throw new Error('EMPTY');
      await fsp.rename(temp,target);
      return reply(200,{ok:true,mediaReceipt:`media://inbound/${path.basename(target)}`,fileName:name,
        mimeType:ext==='.mov'?'video/quicktime':ext==='.webm'?'video/webm':'video/mp4',bytes});
    }catch(error){await fsp.rm(temp,{force:true});return reply(error.message==='UPLOAD_SIZE'?413:400,{ok:false,error:'附件上传未完成，请核对文件大小与连接'});}
  }});
}
