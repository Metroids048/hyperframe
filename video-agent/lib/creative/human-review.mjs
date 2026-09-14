import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {currentBinding} from './delivery-gate.mjs';
import {digest} from './commerce-focus.mjs';
import {CreativeError} from './contracts.mjs';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tokens=new Map();
async function secret(root){
  const dir=path.join(root,'.state/commerce-review');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'key');
  try{await fs.writeFile(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  return fs.readFile(file);
}
const sign=(key,event)=>createHmac('sha256',key).update(JSON.stringify(event)).digest('hex');
export async function readHumanEvent(root,binding){
  try{const {event,signature}=JSON.parse(await fs.readFile(path.join(root,'.state/commerce-review',digest(binding)+'.json'),'utf8'));const expected=sign(await secret(root),event);if(typeof signature!=='string'||signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;return event;}catch{return null;}
}
/** Not registered with the model's tool registry. Imported reports cannot create events. */
export async function humanReviewRoute(root,service,req,res,url,{json,jsonBody}){
  const match=/^\/api\/commerce\/([a-zA-Z0-9_-]+)\/review$/.exec(url.pathname);
  if(!match||!service.has(match[1]))return false;
  const p=service.get(match[1]),r=service.revision(p,p.currentRevisionId),directory=service.versionDirectory(p,r);
  if(req.method==='POST'&&(!tokens.has(req.headers['x-review-token'])||req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']!=='same-origin'))throw new CreativeError('真人确认只能从当前审阅页面提交','HUMAN_REVIEW_CONTEXT',403);
  let binding;try{binding=await currentBinding(root,directory);}catch{throw new CreativeError('当前作品缺少新标准的合同或最终文件证据；可继续下载候选审阅','REVIEW_EVIDENCE_MISSING',409);}
  if(req.method==='GET'){
    const token=randomBytes(32).toString('hex');tokens.set(token,{bindingHash:digest(binding),createdAt:Date.now()});
    for(const [key,value] of tokens)if(Date.now()-value.createdAt>3600000)tokens.delete(key);
    const contract=JSON.parse(await fs.readFile(path.join(directory,'business-contract.json'),'utf8'));
    const report=JSON.parse(await fs.readFile(path.join(directory,'final-quality-report.json'),'utf8').catch(()=>'{}'));
    const html=`<!doctype html><meta charset="utf-8"><title>当前候选片审阅</title><style>body{max-width:960px;margin:32px auto;font:17px/1.6 system-ui;padding:20px}video{width:100%;max-height:65vh;background:#111}label{display:block;margin:15px 0}textarea{width:95%;height:100px}button{padding:12px}pre{white-space:pre-wrap}</style><h1>候选片审阅</h1><p>本地操作者确认，未核实实名身份。请完整观看当前最终文件并记录具体反馈。</p><p>版本 ${esc(binding.revisionId)} · 文件 ${esc(binding.finalVideoSha256)}</p><h2>原始需求</h2><p>${esc(contract.originalRequest)}</p><h2>自动审查与未覆盖内容</h2><pre>${esc(JSON.stringify({dimensions:report.dimensions,issues:report.issues,unreviewed:report.unreviewed},null,2))}</pre><video controls src="revisions/${encodeURIComponent(r.id)}/commerce-final.mp4"></video><form id="review"><label><input type="checkbox" name="fullVideoObserved" required>我已完整观看这份文件，检查商品、文字、必要动作与衔接</label><label><input type="checkbox" name="audioObserved">我已实际听过这份文件的声音</label><label><input type="checkbox" name="businessGoalObserved" required>我已对照原需求检查商品事实、必要内容和业务目标</label><label>审阅反馈<textarea name="feedback" required minlength="2"></textarea></label><button name="status" value="accepted">认可当前版本</button> <button name="status" value="needs_fix">需要修改</button></form><pre id="result"></pre><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const response=await fetch(location.href,{method:'POST',headers:{'Content-Type':'application/json','X-Review-Token':${JSON.stringify(token)}},body:JSON.stringify({status:e.submitter.value,feedback:f.get('feedback'),fullVideoObserved:f.has('fullVideoObserved'),audioObserved:f.has('audioObserved'),businessGoalObserved:f.has('businessGoalObserved')})});document.querySelector('#result').textContent=JSON.stringify(await response.json(),null,2);};</script>`;
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`commerce_review=${token}; HttpOnly; SameSite=Strict; Path=/api/commerce/${p.id}/review`});res.end(html);return true;
  }
  if(req.method==='POST'){
    const token=req.headers['x-review-token'],pending=tokens.get(token),cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).includes('commerce_review='+token);
    if(!cookie||!pending||Date.now()-pending.createdAt>3600000||pending.bindingHash!==digest(binding)||req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']!=='same-origin')throw new CreativeError('请从当前版本的本地审阅页面提交，不能使用模型工具代签','HUMAN_REVIEW_CONTEXT',403);
    const input=await jsonBody(req,16000,'人工审阅');
    if(!['accepted','needs_fix'].includes(input.status)||typeof input.feedback!=='string'||input.feedback.trim().length<2||input.status==='accepted'&&(input.fullVideoObserved!==true||input.businessGoalObserved!==true))throw new CreativeError('请完整观看并填写具体反馈','REVIEW_INCOMPLETE');
    const event={source:'local-review-ui',actorContext:'local-operator-not-identity-verified',status:input.status,feedback:input.feedback.trim(),fullVideoObserved:input.fullVideoObserved===true,audioObserved:input.audioObserved===true,businessGoalObserved:input.businessGoalObserved===true,submittedAt:new Date().toISOString(),bindingHash:digest(binding)};
    const key=await secret(root),target=path.join(root,'.state/commerce-review',digest(binding)+'.json');
    // Keep prior feedback; never overwrite an earlier acceptance event.
    await fs.writeFile(target+'.'+Date.now()+'.history',JSON.stringify({event,signature:sign(key,event)}),{flag:'wx'});
    await fs.writeFile(target,JSON.stringify({event,signature:sign(key,event)}));tokens.delete(token);
    json(res,{ok:true,review:input.status,message:'已记录本地操作者反馈；正式交付仍需全部证据满足门禁。'});return true;
  }
  throw new CreativeError('不支持的审阅操作','REVIEW_METHOD',405);
}
