import fs from 'node:fs/promises';
import {ffmpeg,run,hashFile} from '../edit/media.mjs';
import {cachedFile,cacheKey} from '../edit/media-cache.mjs';

const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:0;};
function spectrum(samples,start,size){
 const re=new Float64Array(size),im=new Float64Array(size);
 for(let i=0;i<size;i++)re[i]=(samples[start+i]||0)*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));
 for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
 for(let n=2;n<=size;n<<=1){const theta=-2*Math.PI/n,cos=Math.cos(theta),sin=Math.sin(theta);for(let i=0;i<size;i+=n){let wr=1,wi=0;for(let j=0;j<n/2;j++){const a=i+j,b=a+n/2,vr=re[b]*wr-im[b]*wi,vi=re[b]*wi+im[b]*wr;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;const next=wr*cos-wi*sin;wi=wr*sin+wi*cos;wr=next;}}}
 return re.slice(0,size/2).map((v,i)=>Math.log1p(Math.hypot(v,im[i])*10));
}

export function analyzePcm(samples,sampleRate=8000){
 const size=512,hop=128,frames=[],onsets=[];let prior=new Float64Array(size/2),peak=0,sumSquares=0;
 for(const sample of samples){peak=Math.max(peak,Math.abs(sample));sumSquares+=sample*sample;}
 for(let start=0;start+size<=samples.length;start+=hop){const next=spectrum(samples,start,size);let flux=0,energy=0;
  for(let k=1;k<next.length;k++)flux+=Math.max(0,next[k]-prior[k]);
  for(let i=start;i<start+size;i++)energy+=samples[i]**2;
  frames.push({time:(start+size/2)/sampleRate,flux,energy:Math.sqrt(energy/size)});prior=next;
 }
 const allFlux=frames.map(f=>f.flux),floor=median(allFlux),mad=median(allFlux.map(v=>Math.abs(v-floor))),globalThreshold=floor+Math.max(1.5*mad,.1);
 for(let i=2;i<frames.length-2;i++){
  const f=frames[i],local=median(frames.slice(Math.max(0,i-24),i).map(x=>x.flux)),threshold=Math.max(globalThreshold,local*1.65);
  // A release/cutoff can spread energy into new bins without being an attack.
  // Require rising energy and retain unbounded salience until peak selection.
  if(f.flux<threshold||f.energy<.002||f.energy<=frames[i-1].energy||f.flux<frames[i-1].flux||f.flux<=frames[i+1].flux)continue;
  const onset={time:Math.max(0,f.time-hop/(2*sampleRate)),strength:(f.flux-threshold)/(threshold+1)};
  if(onsets.length&&onset.time-onsets.at(-1).time<.12){if(onset.strength>onsets.at(-1).strength)onsets[onsets.length-1]=onset;}else onsets.push(onset);
 }
 const maxStrength=Math.max(1,...onsets.map(o=>o.strength));for(const onset of onsets)onset.strength/=maxStrength;
 const tempos=new Float64Array(121);
 for(let i=0;i<onsets.length;i++)for(let j=i+1;j<Math.min(onsets.length,i+9);j++){
  let gap=onsets[j].time-onsets[i].time;if(gap>4)break;while(gap<.333)gap*=2;while(gap>1)gap/=2;
  const bpm=Math.round(60/gap);if(bpm>=60&&bpm<=180)tempos[bpm-60]+=Math.sqrt(onsets[i].strength*onsets[j].strength)/(j-i);
 }
 let bpm=null,tempoConfidence=0;if(onsets.length>=5){const smooth=Array.from(tempos,(v,i)=>v+(tempos[i-1]||0)*.5+(tempos[i+1]||0)*.5),best=Math.max(...smooth),index=smooth.indexOf(best);bpm=index+60;tempoConfidence=best/(smooth.reduce((a,b)=>a+b,0)||1);if(tempoConfidence<.12)bpm=null;}
 const energy=[];for(let i=0;i<frames.length;i+=Math.max(1,Math.round(sampleRate/hop/2))){const chunk=frames.slice(i,i+Math.round(sampleRate/hop/2));energy.push({time:frames[i].time,rms:Math.sqrt(chunk.reduce((s,f)=>s+f.energy*f.energy,0)/chunk.length)});}
 const phraseCandidates=energy.slice(1,-1).flatMap((f,i)=>f.rms<energy[i].rms*.5&&f.rms<energy[i+2].rms*.7?[{time:f.time,reason:'measured-energy-valley'}]:[]);
 return {sampleRate,duration:samples.length/sampleRate,peak,rms:Math.sqrt(sumSquares/Math.max(1,samples.length)),onsets,energy,phraseCandidates,tempo:{bpm,confidence:tempoConfidence},limitations:'Onsets and energy valleys are measured candidates, not semantic phrase labels. Tempo may be ambiguous or absent; preserve musical phrasing rather than cutting on every onset.'};
}

export async function analyzeCreativeAudio(source,{sourceSha256,signal}={}){
 const hash=sourceSha256||await hashFile(source),key=cacheKey(['creative-spectral-flux-v1',hash]);
 const cached=await cachedFile('creative-audio-analysis',key,'.json',async file=>{
  const pcm=await run(ffmpeg,['-v','error','-threads','2','-i',source,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{signal,binary:true,timeout:180000});
  const samples=new Float32Array(pcm.length/4);for(let i=0;i<samples.length;i++)samples[i]=pcm.readFloatLE(i*4);
  signal?.throwIfAborted();const result=analyzePcm(samples);signal?.throwIfAborted();
  await fs.writeFile(file,JSON.stringify({...result,engine:'ffmpeg-pcm + spectral-flux-v1',sourceSha256:hash}));
 });
 return {...JSON.parse(await fs.readFile(cached.file,'utf8')),cacheHit:cached.hit};
}
