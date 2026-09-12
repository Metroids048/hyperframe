import assert from 'node:assert/strict';
import {replaceFileAtomically} from '../lib/edit/project-store.mjs';
let attempts=0;const waits=[];
await replaceFileAtomically('pending','current',{rename:async(from,to)=>{assert.equal(from,'pending');assert.equal(to,'current');if(++attempts<4)throw Object.assign(Error('locked'),{code:'EPERM'});},wait:async ms=>waits.push(ms)});
assert.equal(attempts,4);assert.deepEqual(waits,[15,30,60]);
attempts=0;await assert.rejects(replaceFileAtomically('pending','current',{rename:async()=>{attempts++;throw Object.assign(Error('missing'),{code:'ENOENT'});},wait:async()=>{throw Error('must not wait');}}),/missing/);assert.equal(attempts,1);
attempts=0;await assert.rejects(replaceFileAtomically('pending','current',{rename:async()=>{attempts++;throw Object.assign(Error('permanent lock'),{code:'EBUSY'});},wait:async()=>{}}),/permanent lock/);assert.equal(attempts,8);
console.log('3 atomic metadata replacement regressions passed');
