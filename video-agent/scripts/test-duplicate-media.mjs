import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createNativeDocument} from '../lib/creative/document.mjs';import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {nativeChangeReceipt} from '../lib/orchestration/conversation-edit.mjs';
const asset={id:'v',kind:'video',compiledRef:'assets/v.mp4',mediaMetadata:{width:1920,height:1080,duration:10,hasAudio:true}};
const doc=createNativeDocument({projectId:'duplicate-test',output:{width:1920,height:1080},brief:{name:'test',facts:[]},design:{background:'#101418',foreground:'#FFFFFF',panel:'#151A20',accent:'#55EEAA',accentContrast:'#101418',fontFamily:'Arial',transition:'cut'},assets:[asset],scenes:[{id:'scene-01',effect:'media-cut',effectParams:{},purpose:'detail',startFrame:0,durationFrames:150}],nodes:[{id:'video-1',sceneId:'scene-01',kind:'video',semanticRole:'hero',assetId:'v',anchor:'scene-local',localStartFrame:0,localDurationFrames:150,durationFrames:150,params:{sourceStartSeconds:2,playbackRate:1,fit:'contain'}}]});
test('duplicate visual window preserves source and audio; rejects cross-scene or duplicate ids',()=>{
 const op={type:'duplicate_media',sceneId:'scene-01',nodeId:'video-1',params:{newId:'video-detail'}};
 const next=applyDocumentPatch(doc,[op],{v:asset});
 assert.equal(next.nodes.length,2);assert.deepEqual({...next.nodes[1],id:'video-1'},next.nodes[0]);
 assert.deepEqual(next.audioGraph,doc.audioGraph);assert.equal(next.durationFrames,doc.durationFrames);
 nativeChangeReceipt(doc,next,'整体与局部同屏，声音不变',[op]);
 for(const bad of [{...op,sceneId:'missing'},{...op,params:{newId:'video-1'}},{...op,params:{newId:'x',sourceStartSeconds:8}}])assert.throws(()=>applyDocumentPatch(doc,[bad],{v:asset}));
});
