import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeShotSource} from '../lib/creative/capabilities.mjs';
test('native footage checkpoint is valid without custom HTML in preview and assembly',()=>{
  assert.equal(normalizeShotSource({source:null,receipt:{method:'footage-cut',tool:'native.footage-cut'}},['video']),null);
  assert.throws(()=>normalizeShotSource({source:null,receipt:{method:'original'}},['video']),{code:'CUSTOM_SOURCE'});
});
test('custom checkpoint still normalizes native image bindings',()=>{
  const source={html:'<div id="image"></div>',objects:[{elementId:'image',ref:'media-1'}]};
  assert.match(normalizeShotSource({source},['image']).html,/<img/);
});
