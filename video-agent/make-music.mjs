import fs from 'node:fs';
const rate=44100, duration=15, samples=rate*duration;
const buffer=Buffer.alloc(44+samples*2);
buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
const notes=[60,64,67,71,69,67,64,62],beat=60/112;
for(let i=0;i<samples;i++){
 const t=i/rate, step=Math.floor(t/(beat/2)), age=t-step*beat/2,f=440*2**((notes[step%notes.length]+12-69)/12);
 const pluck=(Math.sin(2*Math.PI*f*age)+.3*Math.sin(4*Math.PI*f*age))*Math.exp(-age*12)*.16;
 const kickAge=t%beat,kick=Math.sin(2*Math.PI*(55*kickAge+4*(1-Math.exp(-25*kickAge))))*Math.exp(-kickAge*20)*.16;
 const bass=440*2**(([48,45,53,55][Math.floor(t/(beat*4))%4]-69)/12);
 const low=Math.sin(2*Math.PI*bass*t)*.045;
 const fade=Math.min(1,t/.15,(duration-t)/1.1);
 buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,(pluck+kick+low)*fade))*32767),44+i*2);
}
fs.writeFileSync(new URL('assets/music.wav',import.meta.url),buffer);
console.log('Original synthesized 15-second music bed created.');
