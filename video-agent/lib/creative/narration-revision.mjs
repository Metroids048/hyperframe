import {insist} from './contracts.mjs';

export function narrationRevisionPolicy(request,record,history=[]){
 const message=String(request.message||'');
 const protectedVoice=(request.assets||[]).some(a=>a.generatedVoice)||/逐字|一字不改|原文照读|(?:台词|旁白|声音|配音)不变/.test(message)||Boolean(record?.script?.text&&message.includes(record.script.text));
 return {allowed:record?.enabled===true&&!protectedVoice&&history.length<2,remaining:Math.max(0,2-history.length),reason:protectedVoice?'用户提供或要求保持的声音／逐字台词不可自动改写':'自拟旁白属于可修订草稿，按已观察画面容量调整；事实、用户目标、音色和总片长保持，旧声音保留'};
}

export function validateNarrationRevision(request,record,history,revision){
 insist(narrationRevisionPolicy(request,record,history).allowed,'该声音不能自动改写，原声音已保留','NARRATION_REVISION_PROTECTED');
 insist(typeof revision?.text==='string'&&revision.text.trim()&&revision.text.length<=4000&&revision.text!==record.script.text&&typeof revision.reason==='string'&&revision.reason.trim(),'旁白修订需要新的台词及画声冲突依据','NARRATION_REVISION_INVALID');
 insist(!history.some(item=>item.script.text===revision.text),'不能循环使用已经被替换的旁白稿','NARRATION_REVISION_CYCLE');
 return {text:revision.text.trim(),voice:record.script.voice,basis:revision.reason};
}
