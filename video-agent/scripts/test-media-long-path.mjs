import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ffmpeg,run,probe} from '../lib/edit/media.mjs';

// Exercise actual native input AND output beyond Windows MAX_PATH. Keep the
// fixture isolated; no user assets or production job directories are removed.
const root=await fs.mkdtemp(path.join(os.tmpdir(),'hf-long-path-'));
try {
  let dir=root;
  while(dir.length<280)dir=path.join(dir,'native-media-path-segment');
  await fs.mkdir(dir,{recursive:true});
  const source=path.join(dir,'source.mp4'),output=path.join(dir,'copy.mp4');
  await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=red:s=64x64:r=30','-t','0.2','-c:v','libx264','-pix_fmt','yuv420p',source]);
  await run(ffmpeg,['-y','-v','error','-i',source,'-c','copy',output]);
  const info=await probe(output);
  assert.equal(info.width,64);assert.equal(info.frames,6);
  await run(ffmpeg,['-v','error','-i',output,'-f','null','-']);
  console.log('PASS real native media creation, remux, probe and full decode beyond 280-character paths');
} finally {
  const target=path.resolve(root);
  assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
  assert(path.basename(target).startsWith('hf-long-path-'));
  await fs.rm(target,{recursive:true,force:true});
}
