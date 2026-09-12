import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {prepareSpeech,ffmpeg,run} from '../lib/edit/media.mjs';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
const out=path.join(ROOT,'outputs/upgrade/vad',crypto.randomUUID());await fs.mkdir(out,{recursive:true});
process.env.EDIT_MEDIA_CACHE_DIR=path.join(out,'media-cache');const provider=new CodexProvider({skipLoginCheck:true,cacheRoot:path.join(out,'speech-cache')});
const report={validation:'real local speech activity, no transcription or model planning',tests:[]};
try{
  await fs.link(path.join(ROOT,'assets/edit-samples/viewport-navigation.mp4'),path.join(out,'source.mp4'));const a={work:'source.mp4',kind:'video',hasAudio:true,duration:221.833};let start=Date.now();await prepareSpeech(out,a);report.prepareMs=Date.now()-start;assert.equal(a.analysisReady,undefined);assert.equal(a.thumbnails,undefined);assert.equal(a.proxy,undefined);
  start=Date.now();const cold=await provider.detectSpeech(path.join(out,a.speech));report.coldMs=Date.now()-start;assert(cold.regions.length>3);assert(cold.regions.every(r=>r.end<=222));report.regions=cold.regions;report.tests.push('speech-only preparation omits proxy and frame/scene analysis; real tutorial yields speech regions');
  start=Date.now();const cached=await provider.detectSpeech(path.join(out,a.speech));report.cacheMs=Date.now()-start;assert.equal(cached.metrics.cacheHit,true);assert.deepEqual(cached.regions,cold.regions);report.tests.push('identical speech detection reuses content cache');
  const silence=path.join(out,'silence.wav');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','3',silence]);start=Date.now();assert.deepEqual((await provider.detectSpeech(silence)).regions,[]);report.warmSilenceMs=Date.now()-start;report.tests.push('silence yields no speech regions');
  report.status='passed';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:out,prepareMs:report.prepareMs,coldMs:report.coldMs,cacheMs:report.cacheMs,warmSilenceMs:report.warmSilenceMs}));
}finally{await provider.close();}
