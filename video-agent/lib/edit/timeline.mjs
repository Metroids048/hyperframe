import {randomUUID,createHash} from 'node:crypto';

export const FPS=30;
export class EditError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const uid=()=>randomUUID();
export const frame=s=>Math.round(s*FPS);
export const seconds=f=>f/FPS;
export function insist(ok,message){if(!ok)throw new EditError(message);}
const copy=x=>structuredClone(x),integer=Number.isSafeInteger,finite=Number.isFinite;
const rateOf=c=>c.rate??1;
const key=c=>c.groupId||c.id;
const fragmentId=(...parts)=>'p-'+createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);
export const sourceStart=c=>c.in+(c.sourceOffset||0);
export const sourceLength=c=>c.sourceDuration??(c.out-c.in-(c.sourceOffset||0));
function sourceRange(start,end){const inFrame=Math.floor(start+1e-8),outFrame=Math.ceil(end-1e-8),offset=Math.max(0,start-inFrame),length=end-start;return {in:inFrame,out:outFrame,sourceOffset:offset,sourceDuration:length};}
export function positioned(clips){let at=0;return clips.map(c=>{const start=integer(c.start)?c.start:at,end=integer(c.end)?c.end:start+Math.round(sourceLength(c)/rateOf(c));at=end;return {...c,start,end,duration:end-start};});}
export function duration(t){return Math.max(0,...positioned(t.clips||[]).map(c=>c.end));}
export function migrateTimeline(input){
  insist(input&&[1,2].includes(input.schemaVersion),'时间轴格式不兼容');
  const t=copy(input);t.schemaVersion=2;t.overlays??=[];t.transitions??=[];
  t.clips=positioned(t.clips).map(c=>({...c,track:0,rate:rateOf(c)}));
  for(const c of [...t.captions,...t.audio,...t.overlays]){c.anchor??='source';if(c.rate===undefined&&t.audio.includes(c))c.rate=1;}
  return t;
}
export function initialTimeline(a){return {schemaVersion:2,fps:FPS,output:{width:a.width,height:a.height,fit:'contain'},clips:[{id:uid(),assetId:a.id,in:0,out:a.frames,start:0,end:a.frames,duration:a.frames,track:0,rate:1,gain:1}],captions:[],audio:[],overlays:[],transitions:[]};}
function range(a,b,max){insist(integer(a)&&integer(b)&&a>=0&&b>a&&b<=max,'时间范围无效或超出视频长度');}
function gain(v){insist(finite(v)&&v>=0&&v<=3.98,'音量必须在 0～3.98 之间');}
function rate(v){insist(finite(v)&&v>=0.1&&v<=5,'播放速度必须在 0.1～5 倍之间');}
function box(v,label){if(v==null)return;insist(v&&['x','y','width','height'].every(k=>finite(v[k]))&&v.x>=0&&v.y>=0&&v.width>0&&v.height>0&&v.x+v.width<=1.000001&&v.y+v.height<=1.000001,label+'必须位于 0～1 的画面范围内');}
function anchor(c){insist(['source','timeline','end'].includes(c.anchor||'source'),'图层时间锚点无效');}
function caption(c,n){range(c.start,c.end,n);insist(typeof c.text==='string'&&c.text.trim()&&[...c.text].length<=240,'字幕必须为 1～240 个字');insist(['bottom','top','center'].includes(c.position),'字幕位置无效');insist(/^#[\da-f]{6}$/i.test(c.color),'字幕颜色无效');insist(finite(c.size)&&c.size>=0.025&&c.size<=0.09,'字幕字号比例无效');anchor(c);}
export function validateTimeline(input,assets){
  insist(input&&[1,2].includes(input.schemaVersion)&&input.fps===FPS,'时间轴格式不兼容');
  insist(Array.isArray(input.clips)&&input.clips.length>0&&input.clips.length<=300,'需保留至少一个片段，最多 300 个');
  insist(Array.isArray(input.captions)&&Array.isArray(input.audio),'字幕或音轨格式无效');
  if(input.schemaVersion===2){insist(Array.isArray(input.overlays)&&Array.isArray(input.transitions),'叠层或转场格式无效');for(const c of input.clips)insist(integer(c.start)&&integer(c.end)&&integer(c.duration)&&c.end-c.start===c.duration&&c.track===0,'v2 主画面需要明确的 start/end/duration 和第 0 轨道');}
  const t=migrateTimeline(input),n=duration(t);insist(n>0&&n<=18000,'成片长度必须在 0～600 秒之间');
  insist(t.captions.length<=2000&&t.audio.length<=300&&t.overlays.length<=300,'文字或音轨数量过多');
  const ids=new Set();for(const c of [...t.clips,...t.captions,...t.audio,...t.overlays]){insist(typeof c.id==='string'&&/^[\w-]{1,160}$/.test(c.id)&&!ids.has(c.id),'元素 ID 无效或重复');ids.add(c.id);}
  for(const c of [...t.clips,...t.overlays]){
    const a=assets[c.assetId];insist(a?.kind==='video'&&a.status==='ready','视频素材尚未准备完成');range(c.in,c.out,a.frames);range(c.start,c.end,n);rate(rateOf(c));gain(c.gain??0);box(c.crop,'裁切范围');box(c.rect,'叠层范围');
    insist(finite(sourceStart(c))&&finite(sourceLength(c))&&sourceLength(c)>0&&(c.sourceOffset||0)>=0&&(c.sourceOffset||0)<1&&sourceStart(c)+sourceLength(c)<=c.out+1e-6,'源取样范围无效');
    insist(Math.abs(c.end-c.start-Math.round(sourceLength(c)/rateOf(c)))<=1,'源范围、速度与成片时长不一致');
    if(c.fit!==undefined)insist(['contain','cover'].includes(c.fit),'画面适配方式无效');
    if(t.overlays.includes(c)){insist(integer(c.track)&&c.track>=1&&c.track<=20,'叠层轨道需为 1～20');anchor(c);}
  }
  insist(t.clips[0].start===0,'主画面必须从第 0 帧开始');
  for(let i=1;i<t.clips.length;i++){const a=t.clips[i-1],b=t.clips[i];insist(b.start<=a.end&&b.end>=a.end,'主画面存在空隙或完全覆盖的片段');const overlap=a.end-b.start,tr=t.transitions.find(x=>x.fromId===a.id&&x.toId===b.id);insist(overlap===0||tr&&tr.duration===overlap,'主画面重叠必须对应显式转场');}
  const transitionPairs=new Set();for(const tr of t.transitions){const pair=tr.fromId+':'+tr.toId;insist(!transitionPairs.has(pair),'同一片段连接只能有一个转场');transitionPairs.add(pair);const i=t.clips.findIndex(c=>c.id===tr.fromId),a=t.clips[i],b=t.clips[i+1];insist(a&&b&&b.id===tr.toId&&['crossfade','wipe'].includes(tr.style)&&integer(tr.duration)&&tr.duration>0&&tr.duration<=Math.min(a.duration,b.duration)&&a.end-b.start===tr.duration,'转场必须连接相邻片段且不超过两个片段');}
  for(const c of t.captions)caption(c,n);
  for(const c of t.audio){const a=assets[c.assetId];insist(a?.hasAudio&&a.status==='ready','该素材没有可用声音');range(c.start,c.end,n);rate(rateOf(c));insist(integer(c.in)&&c.in>=0&&finite(sourceStart(c))&&(c.sourceOffset||0)>=0&&(c.sourceOffset||0)<1&&finite(c.sourceDuration??((c.end-c.start)*rateOf(c)))&&(c.sourceDuration??((c.end-c.start)*rateOf(c)))>0&&Math.abs(c.end-c.start-Math.round((c.sourceDuration??((c.end-c.start)*rateOf(c)))/rateOf(c)))<=1&&sourceStart(c)+(c.sourceDuration??((c.end-c.start)*rateOf(c)))<=a.frames+1e-6,'音轨源范围无效或超出素材长度');gain(c.gain);insist(['music','voice','effect'].includes(c.role),'音轨类型无效');insist(typeof c.duck==='boolean'&&integer(c.fadeIn)&&integer(c.fadeOut)&&c.fadeIn>=0&&c.fadeOut>=0,'音轨参数无效');anchor(c);}
  const o=t.output;insist(integer(o.width)&&integer(o.height)&&o.width>=64&&o.height>=64&&o.width<=1920&&o.height<=1920&&o.width%2===0&&o.height%2===0,'输出尺寸需为不超过 1920 的偶数');insist(Math.min(o.width,o.height)<=1080,'输出最高支持 1080p');insist(['contain','cover'].includes(o.fit),'画面适配方式无效');if(o.loudness!=null)insist(finite(o.loudness)&&o.loudness>=-30&&o.loudness<=-8,'响度目标必须在 -30～-8 LUFS 之间');return input;
}
const commonCaption={position:'bottom',color:'#FFFFFF',size:0.045,anchor:'source',voicePolicy:'none'};
const allowed=new Set(['delete_range','keep_ranges','split','move','insert','caption_add','caption_update','caption_remove','audio_add','audio_update','audio_remove','clip_volume','clip_speed','clip_crop','overlay_add','overlay_update','overlay_remove','transition','output']);
export function applyOperations(input,ops,assets){
  validateTimeline(input,assets);insist(Array.isArray(ops)&&ops.length>0&&ops.length<=2000,'编辑清单为空或超过 2000 项');for(const o of ops)insist(o&&allowed.has(o.type),'不支持的剪辑操作');
  const base=migrateTimeline(input),draft=copy(base),total=duration(base),original=base.clips;
  const addedId=(prefix,o)=>o.id||fragmentId(prefix,[...base.clips,...base.captions,...base.audio,...base.overlays].map(c=>c.id),ops.indexOf(o),o);
  for(const tr of base.transitions){const from=original.find(c=>c.id===tr.fromId),to=original.find(c=>c.id===tr.toId),inside=f=>integer(f)&&f>to.start&&f<from.end;
    for(const o of ops){const points=['delete_range'].includes(o.type)?[o.start,o.end]:['split','move','insert'].includes(o.type)?[o.at]:o.type==='keep_ranges'?(o.ranges||[]).flatMap(r=>[r.start,r.end]):[];insist(!points.some(inside),'目标切点位于转场重叠区。请先移除该转场，再进行精确分割或裁切。');}
  }
  const structural=ops.some(o=>['keep_ranges','delete_range','split','move','insert'].includes(o.type));
  const keeps=ops.filter(o=>o.type==='keep_ranges');insist(keeps.length<=1,'一次只能有一份保留片段清单');
  let ranges=keeps.length?copy(keeps[0].ranges):[{start:0,end:total}];insist(Array.isArray(ranges)&&ranges.length&&ranges.length<=300,'保留片段清单为空或过多');for(const r of ranges)range(r.start,r.end,total);
  const sorted=[...ranges].sort((a,b)=>a.start-b.start);for(let i=1;i<sorted.length;i++)insist(sorted[i].start>=sorted[i-1].end,'保留范围重复');
  for(const o of ops.filter(o=>o.type==='delete_range')){range(o.start,o.end,total);ranges=ranges.flatMap(r=>o.start>=r.end||o.end<=r.start?[r]:[{start:r.start,end:Math.min(r.end,o.start)},{start:Math.max(r.start,o.end),end:r.end}].filter(x=>x.end>x.start));}
  const splits=ops.filter(o=>o.type==='split').map(o=>{insist(integer(o.at)&&o.at>0&&o.at<total,'分割位置超出范围');return o.at;});
  for(const o of ops.filter(o=>['move','insert'].includes(o.type))){insist(integer(o.at)&&o.at>=0&&o.at<=total,'目标位置超出范围');splits.push(o.at);}
  let pieces=[];
  for(const r of ranges)for(const c of original){const s=Math.max(r.start,c.start),e=Math.min(r.end,c.end);if(e<=s)continue;const points=[s,...splits.filter(f=>f>s&&f<e),e].sort((a,b)=>a-b);for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],sourceIn=sourceStart(c)+(a-c.start)*c.rate,sourceOut=b===c.end?sourceStart(c)+sourceLength(c):sourceStart(c)+(b-c.start)*c.rate;if(sourceOut>sourceIn)pieces.push({oldStart:a,oldEnd:b,oldClipId:c.id,clip:{...c,...sourceRange(sourceIn,sourceOut)}});}}
  // Resolve every destination against the immutable input. Equal destinations
  // retain request order; a failed operation never mutates the input revision.
  const moved=new Set(),buckets=new Map();
  for(const o of ops.filter(o=>['move','insert'].includes(o.type))){let additions;if(o.type==='move'){insist(!moved.has(o.id),'同一片段不能在一轮中移动两次');const c=original.find(c=>c.id===o.id);insist(c,'目标片段已不存在');insist(o.at<=c.start||o.at>=c.end,'不能把片段移到自身内部');additions=pieces.filter(p=>p.oldClipId===o.id);insist(additions.length,'移动的片段已被本轮删除');pieces=pieces.filter(p=>p.oldClipId!==o.id);moved.add(o.id);}else{const a=assets[o.assetId];insist(a?.kind==='video'&&a.status==='ready','插入的视频未准备完成');range(o.in,o.out,a.frames);rate(o.rate??1);additions=[{oldStart:null,oldEnd:null,oldClipId:null,clip:{id:addedId('insert',o),assetId:a.id,in:o.in,out:o.out,rate:o.rate??1,gain:o.gain??1,track:0}}];}const list=buckets.get(o.at)||[];list.push(...additions);buckets.set(o.at,list);}
  // Resolve slots before adding moved material: a destination never targets an
  // earlier insertion from this request.
  const slots=new Map();for(const [at,additions] of [...buckets].sort((a,b)=>a[0]-b[0])){let i=pieces.findIndex(p=>p.oldStart!==null&&p.oldStart>=at);if(i<0)i=pieces.length;slots.set(i,[...(slots.get(i)||[]),...additions]);}
  pieces=pieces.flatMap((p,i)=>[...(slots.get(i)||[]),p]).concat(slots.get(pieces.length)||[]);
  insist(pieces.length,'不能删除整条视频');
  const used=new Set();for(const p of pieces){if(used.has(p.clip.id))p.clip.id=fragmentId('clip',p.clip.id,p.oldStart,p.oldEnd);used.add(p.clip.id);}
  for(const o of ops.filter(o=>['clip_volume','clip_speed','clip_crop'].includes(o.type))){const targets=pieces.filter(p=>p.oldClipId===o.id||p.clip.id===o.id);insist(targets.length,'原声片段已不存在');for(const p of targets){if(o.type==='clip_volume'){gain(o.gain);p.clip.gain=o.gain;}if(o.type==='clip_speed'){rate(o.rate);p.clip.rate=o.rate;}if(o.type==='clip_crop'){box(o.crop,'裁切范围');p.clip.crop=copy(o.crop);if(o.fit)p.clip.fit=o.fit;}}}
  const resolveClipId=(id,edge='first')=>{const found=pieces.filter(p=>p.clip.id===id||p.oldClipId===id);return (edge==='last'?found.at(-1):found[0])?.clip.id;};
  let transitions=base.transitions.map(tr=>{const from=original.find(c=>c.id===tr.fromId),to=original.find(c=>c.id===tr.toId),remaining=ranges.reduce((sum,r)=>sum+Math.max(0,Math.min(r.end,from.end)-Math.max(r.start,to.start)),0);return {...tr,duration:remaining,fromId:resolveClipId(tr.fromId,'last'),toId:resolveClipId(tr.toId)};}).filter(tr=>tr.duration>0&&pieces.some((p,i)=>p.clip.id===tr.fromId&&pieces[i+1]?.clip.id===tr.toId));
  for(const o of ops.filter(o=>o.type==='transition')){const fromId=resolveClipId(o.fromId),toId=resolveClipId(o.toId),i=pieces.findIndex(p=>p.clip.id===fromId);insist(fromId&&toId&&pieces[i+1]?.clip.id===toId,'转场需要两个相邻主画面片段');transitions=transitions.filter(t=>t.fromId!==fromId||t.toId!==toId);if(o.style!=='none'){insist(['crossfade','wipe'].includes(o.style)&&integer(o.duration)&&o.duration>0,'转场参数无效');transitions.push({fromId,toId,duration:o.duration,style:o.style});}}
  let at=0;for(let i=0;i<pieces.length;i++){const p=pieces[i],tr=transitions.find(t=>t.toId===p.clip.id&&t.fromId===pieces[i-1]?.clip.id),len=Math.round(sourceLength(p.clip)/p.clip.rate);if(tr)at-=tr.duration;p.start=at;p.end=at+len;p.clip={...p.clip,start:p.start,end:p.end,duration:len,track:0};at=p.end;}
  const newTotal=at;draft.clips=pieces.map(p=>p.clip);draft.transitions=transitions;
  function editElements(collection,prefix){for(const o of ops.filter(o=>o.type.startsWith(prefix+'_'))){const kind=o.type.slice(prefix.length+1);if(kind==='add'){const c=prefix==='caption'?{...commonCaption,...copy(o),id:addedId(prefix,o)}:prefix==='audio'?{gain:1,in:0,rate:1,role:'effect',duck:false,fadeIn:0,fadeOut:0,anchor:'source',...copy(o),id:addedId(prefix,o)}:{gain:0,rate:1,track:1,rect:{x:0.62,y:0.08,width:0.3,height:0.3},anchor:'source',...copy(o),id:addedId(prefix,o)};delete c.type;if(prefix==='overlay')c.end??=c.start+Math.round((c.out-c.in)/c.rate);range(c.start,c.end,c.anchor==='timeline'||c.coordinateSpace==='result'?newTotal:total);collection.push(c);}else{let targets=collection.filter(c=>c.id===o.id||c.groupId===o.id);insist(targets.length,'指定的字幕或音轨已不存在');if(kind==='remove'){for(const c of targets)collection.splice(collection.indexOf(c),1);continue;}if(targets.length>1&&prefix==='audio'&&o.assetId!==undefined){for(const c of targets.slice(1))collection.splice(collection.indexOf(c),1);targets=targets.slice(0,1);}else if(targets.length>1&&(o.start!==undefined||o.end!==undefined))throw new EditError('这个图层已被剪成多个片段，请选中具体片段再调整时间');const fields=prefix==='caption'?['text','position','color','size','start','end','anchor','anchorClipId','voicePolicy','sourceSpoken','audioId','sourceAssetId']:prefix==='audio'?['assetId','in','start','end','rate','gain','role','duck','fadeIn','fadeOut','text','anchor','anchorClipId','captionGroupId']:['assetId','in','out','start','end','rate','gain','track','rect','crop','fit','anchor','anchorClipId'];for(const c of targets){for(const f of fields)if(o[f]!==undefined&&o[f]!==null)c[f]=copy(o[f]);if(o.in!==undefined){c.sourceOffset=0;}if(prefix==='audio'&&(o.assetId!==undefined||o.in!==undefined||o.start!==undefined||o.end!==undefined||o.rate!==undefined))delete c.sourceDuration;if(prefix==='overlay'&&(o.in!==undefined||o.out!==undefined))c.sourceDuration=c.out-c.in;if(prefix==='overlay'&&(o.rate!==undefined||o.in!==undefined||o.out!==undefined)&&o.end===undefined)c.end=c.start+Math.round(sourceLength(c)/c.rate);}}}}
  editElements(draft.captions,'caption');editElements(draft.audio,'audio');editElements(draft.overlays,'overlay');
  function remap(items,isAudio=false,isOverlay=false){return items.flatMap(c=>{
    range(c.start,c.end,c.anchor==='timeline'||c.coordinateSpace==='result'?newTotal:total);anchor(c);if(c.coordinateSpace==='result'){const x={...c};delete x.coordinateSpace;return [x];}
    if(c.anchor==='timeline'||c.anchor==='end'){const delta=c.anchor==='end'?newTotal-total:0,start=Math.max(0,c.start+delta),end=Math.min(newTotal,c.end+delta);if(end<=start)return [];const x={...c,start,end};if(isAudio||isOverlay){const source=sourceStart(c)+(start-(c.start+delta))*rateOf(c);if(isOverlay)Object.assign(x,sourceRange(source,source+(end-start)*rateOf(c)));else{x.in=Math.floor(source+1e-8);x.sourceOffset=Math.max(0,source-x.in);x.sourceDuration=Math.min((end-start)*rateOf(c),(c.sourceDuration??((c.end-c.start)*rateOf(c)))-(source-sourceStart(c)));}}return [x];}
    let count=0;const mapped=[];
    for(const p of pieces){if(p.oldStart===null)continue;let s=Math.max(c.start,p.oldStart),e=Math.min(c.end,p.oldEnd);if(e<=s)continue;if(c.anchorClipId&&c.anchorClipId!==p.oldClipId&&c.anchorClipId!==p.clip.id)continue;
      if(!c.anchorClipId){const overlap=mapped.find(x=>x._oldStart<=s&&x._oldEnd>s);if(overlap)s=overlap._oldEnd;if(e<=s)continue;}
      const scale=(p.end-p.start)/(p.oldEnd-p.oldStart),start=p.start+Math.round((s-p.oldStart)*scale),end=p.start+Math.round((e-p.oldStart)*scale);if(end<=start)continue;const x={...c,id:count++?fragmentId('layer',c.id,p.clip.id,s,e):c.id,groupId:key(c),start,end,_oldStart:s,_oldEnd:e};if(c.anchorClipId)x.anchorClipId=p.clip.id;
      if(isAudio||isOverlay){const source=sourceStart(c)+(s-c.start)*rateOf(c);x.in=Math.floor(source+1e-8);x.sourceOffset=Math.max(0,source-x.in);x.rate=rateOf(c)/scale;if(isAudio)x.sourceDuration=Math.min((e-s)*rateOf(c),(c.sourceDuration??((c.end-c.start)*rateOf(c)))-(source-sourceStart(c)));if(isOverlay)Object.assign(x,sourceRange(source,source+(e-s)*rateOf(c)));if(isAudio){x.fadeIn=s===c.start?Math.round(c.fadeIn*scale):0;x.fadeOut=e===c.end?Math.round(c.fadeOut*scale):0;}}
      mapped.push(x);
    }
    const merged=[];for(const x of mapped){delete x._oldStart;delete x._oldEnd;const last=merged.at(-1);if(last&&last.end===x.start&&last.anchorClipId===x.anchorClipId&&(!isAudio&&!isOverlay||Math.abs(rateOf(last)-rateOf(x))<1e-8&&Math.abs(sourceStart(last)+(last.end-last.start)*rateOf(last)-sourceStart(x))<1e-6)){last.end=x.end;if(isAudio){last.fadeOut=x.fadeOut;last.sourceDuration=(last.sourceDuration??0)+(x.sourceDuration??0);}if(isOverlay){last.out=x.out;last.sourceDuration=(last.sourceDuration??(last.out-last.in))+(x.sourceDuration??(x.out-x.in));}}else merged.push(x);}return merged;
  });}
  if(structural||ops.some(o=>['clip_speed','transition'].includes(o.type))){draft.captions=remap(draft.captions);draft.audio=remap(draft.audio,true);draft.overlays=remap(draft.overlays,false,true);}
  for(const o of ops.filter(o=>o.type==='output'))for(const field of ['width','height','fit','loudness'])if(o[field]!==undefined&&o[field]!==null){if(field==='loudness'&&o[field]==='off')delete draft.output.loudness;else draft.output[field]=o[field];}
  for(const o of keeps)if(o.maxFrames!=null)insist(newTotal<=o.maxFrames,'必须保留的片段超过目标时长，请减少保留内容或增加时长');
  for(const collection of [draft.captions,draft.audio,draft.overlays])for(const c of collection)delete c.coordinateSpace;
  validateTimeline(draft,assets);return draft;
}
export function srt(t){const stamp=f=>{const ms=Math.round(f/FPS*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return [...t.captions].sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');}
