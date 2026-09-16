import test from 'node:test';
import assert from 'node:assert/strict';
import {cutNativeScene} from '../lib/creative/cuts.mjs';
test('cut projects reserved speech window and source offset with the surviving segment',()=>{
 const document={revisionId:'r',scenes:[{id:'s',startFrame:0,durationFrames:180}],nodes:[{id:'n',sceneId:'s',kind:'image',localStartFrame:0,localDurationFrames:180,durationFrames:180}],transitions:[],audioGraph:[{id:'voice',role:'narration',assetId:'a',startFrame:60,durationFrames:60,speechWindowFrames:120,sourceStartSeconds:0}]};
 cutNativeScene(document,{type:'trim_scene',sceneId:'s',params:{startFrame:90,endFrame:180}});
 assert.equal(document.audioGraph[0].startFrame,0);assert.equal(document.audioGraph[0].durationFrames,30);assert.equal(document.audioGraph[0].sourceStartSeconds,1);assert.equal(document.audioGraph[0].speechWindowFrames,90);
});
