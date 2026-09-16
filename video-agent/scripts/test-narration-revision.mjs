import test from 'node:test';
import assert from 'node:assert/strict';
import {narrationRevisionPolicy,validateNarrationRevision} from '../lib/creative/narration-revision.mjs';
const record={enabled:true,script:{text:'端部则是金属挡板，四个接口开口依次排列，旁边还有栅格。',voice:'zf_001'}};
const revision={text:'端部接口，依次排开。',reason:'对应端部实拍2.4秒，原自拟草稿读5.8秒'};
test('S02 self-authored narration can be repaired without changing the selected voice',()=>{
 const before=structuredClone(record),next=validateNarrationRevision({message:'加简短旁白，只解释可见结构'},record,[],revision);
 assert.equal(next.voice,'zf_001');assert.equal(next.text,revision.text);assert.deepEqual(record,before);
});
test('provided exact copy, protected audio and confirmed voice cannot be rewritten',()=>{
 for(const request of [{message:record.script.text},{message:'旁白逐字照读'},{message:'声音不变'},{message:'生成视频',assets:[{generatedVoice:true}]}])assert.throws(()=>validateNarrationRevision(request,record,[],revision),{code:'NARRATION_REVISION_PROTECTED'});
});
test('revision attempts stay bounded and cannot oscillate between old drafts',()=>{
 assert.equal(narrationRevisionPolicy({},record,[record,record]).allowed,false);
 assert.throws(()=>validateNarrationRevision({},record,[{script:{text:revision.text}}],revision),{code:'NARRATION_REVISION_CYCLE'});
 assert.throws(()=>validateNarrationRevision({},record,[],{...revision,text:record.script.text}),{code:'NARRATION_REVISION_INVALID'});
});
