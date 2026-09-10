import {duration,frame} from './timeline.mjs';
import {selectSkills} from './skills.mjs';

// An exact grammar for low-risk, unambiguous edits. Unknown clauses always fall
// back to the model; this is not a fuzzy keyword detector.
const quote='[「“"]([^「」“”"]{1,240})[」”"]';
const protections=new Set(['其他不变','其他内容不变','其余内容不变','保留它的位置和时间','保留字幕时间与位置','保留字幕时间和位置','声音和画面都不变','保留原声','不要添加或修改任何声音','不添加或修改任何声音','不要添加旁白','不要配音','不要朗读','不加旁白','不加声音']);
const number='\\s*(\\d+(?:\\.\\d{1,3})?)\\s*';
function clauses(text){
  const result=[];let part='',inside=false;
  for(const c of text.trim()){if('「“"'.includes(c)){if(c==='"')inside=!inside;else inside=true;}else if('」”'.includes(c))inside=false;
    if(!inside&&'，,。；;！!'.includes(c)){if(part.trim())result.push(part.trim());part='';}else part+=c;
  }if(part.trim())result.push(part.trim());return result;
}
function onlyOneTextGroup(t,old){const matches=t.captions.filter(c=>old===null||c.text===old),groups=new Map();for(const c of matches){const id=c.groupId||c.id;groups.set(id,[...(groups.get(id)||[]),c]);}return groups.size===1?[...groups.values()][0]:null;}
export function fastIntent(revision,message,selection){
  if(selection||typeof message!=='string'||message.length>6000)return null;
  const parts=clauses(message);if(parts.length<1||parts.slice(1).some(x=>!protections.has(x)))return null;
  const first=parts[0],t=revision.timeline;let operations,summary;
  const add=new RegExp('^在第?'+number+'\\s*秒(?:到|至)第?'+number+'\\s*秒(?:添加|加上|加)(底部|顶部|居中)?字幕'+quote+'$').exec(first);
  if(add){const start=frame(Number(add[1])),end=frame(Number(add[2]));if(start<0||end<=start||end>duration(t))return null;operations=[{type:'caption_add',start,end,text:add[4],position:({底部:'bottom',顶部:'top',居中:'center'})[add[3]]||'bottom'}];summary=`已在 ${(start/30).toFixed(2)}～${(end/30).toFixed(2)} 秒添加字幕「${add[4]}」。`;}
  else{
    const named=new RegExp('^把(?:字幕|标题)'+quote+'(?:的文字)?(?:改为|改成|换成)'+quote+'$').exec(first);
    const last=new RegExp('^把(?:刚才那条字幕|刚才的字幕|这条字幕|那条字幕|唯一的字幕|字幕|标题)(?:的文字)?(?:改为|改成|换成)'+quote+'$').exec(first);
    if(!named&&!last)return null;
    const group=onlyOneTextGroup(t,named?named[1]:null),text=named?named[2]:last[1];if(!group?.length||group.every(c=>c.text===text))return null;
    // Linked narration must use the regular plan/speech conflict checks.
    if(group.some(c=>c.audioId||c.voicePolicy==='linked'||t.audio.some(a=>a.captionGroupId===(c.groupId||c.id))))return null;
    operations=[{type:'caption_update',id:group[0].groupId||group[0].id,text}];summary=`已将字幕改为「${text}」，时间、位置和声音保持原样。`;
  }
  const selectedSkills=selectSkills(message,operations).map(({id,version,source,sourceCommit,license})=>({id,version,source,sourceCommit,license}));
  return {result:{analysisRequired:false,contentBased:false,summary,clarification:null,action:null,toolRequests:[],operations},model:null,executionMode:'exact-local-intent',selectedSkills,toolCalls:[{tool:'exact_caption_intent',status:'completed',revisionId:revision.id}],metrics:{modelCalls:0,planMs:0,executionMode:'exact-local-intent'}};
}
