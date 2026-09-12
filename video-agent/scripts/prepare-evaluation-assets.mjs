import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
const sourceDir=path.join(ROOT,'assets/edit-samples'),manifest=JSON.parse(await fs.readFile(path.join(sourceDir,'source-manifest.json'),'utf8'));
const music=await fs.readFile(path.join(ROOT,'assets/music.wav'));if(music.toString('ascii',0,4)!=='RIFF'||music.toString('ascii',36,40)!=='data')throw Error('Expected the project-generated PCM WAV');
const pcm=music.subarray(44),header=Buffer.from(music.subarray(0,44));header.writeUInt32LE(36+pcm.length*2,4);header.writeUInt32LE(pcm.length*2,40);
const musicFile=path.join(sourceDir,'evaluation-music-30s.wav');await fs.writeFile(musicFile,Buffer.concat([header,pcm,pcm]));
const mapping={tos:'tears-of-steel',tutorial:'viewport-navigation',talk:'mandarin-interview',mandarin:'mandarin-interview'},assets=[];
for(const [id,sampleId] of Object.entries(mapping)){const sample=manifest.samples.find(s=>s.id===sampleId);if(!sample)throw Error('Missing sample '+sampleId);assets.push({id,file:'assets/edit-samples/'+sampleId+'.mp4',sourceUrl:sample.sourceUrl,license:sample.license,attribution:sample.attribution,sourceExcerptSeconds:sample.sourceRangeSeconds,verifiedContent:true,verificationMethod:'Source provenance, exact sampled frames and official subtitles or ASR; not a human quality rating',burnedInSubtitles:sample.burnedInSubtitles||false,note:['talk','mandarin'].includes(id)?'Both IDs use the same authorized Mandarin interview; they are not independent source diversity.':sample.boundaryEvidence});}
assets.push({id:'music',file:'assets/edit-samples/evaluation-music-30s.wav',sourceUrl:'local:make-music.mjs',license:'Project-original synthesized audio, available for this project and its evaluation',attribution:'Video Agent make-music.mjs original synthesized 15-second audio, repeated twice without adding third-party recordings',sourceExcerptSeconds:{start:0,end:30},verifiedContent:true});
await fs.writeFile(path.join(ROOT,'docs/evaluation/asset-inputs.json'),JSON.stringify({schemaVersion:1,assets},null,2));console.log('Prepared verified source inputs; no expert outputs or ratings created.');
