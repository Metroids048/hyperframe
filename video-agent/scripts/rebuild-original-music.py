"""Deterministic original PCM pulse bed; no external samples or licensed melody."""
import argparse,math,wave,struct,os
p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--seconds',type=float,default=40);p.add_argument('--bpm',type=float,default=120);a=p.parse_args()
sr=44100;beat=60/a.bpm;os.makedirs(os.path.dirname(a.output),exist_ok=True)
with wave.open(a.output,'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);data=bytearray()
 for i in range(round(a.seconds*sr)):
  t=i/sr;q=(t-.2)%beat;bar=int(max(0,t-.2)/(beat*8));v=0
  if t>=.2:
   v+=.19*math.sin(2*math.pi*(52*q+21*(1-math.exp(-32*q))/32))*math.exp(-24*q)
   if int((t-.2)/beat)%2:v+=.027*(math.sin(2*math.pi*7103*t)+math.sin(2*math.pi*9127*t))*math.exp(-70*q)
   root=[130.8128,146.8324,110,130.8128][bar%4];r=(t-.2)%(beat*8);env=min(1,r/.3)*math.exp(-.65*r)
   v+=.028*env*sum(math.sin(2*math.pi*root*f*t) for f in [1,1.25,1.5])
  fade=min(1,t/.08,max(0,(a.seconds-t)/.5));data.extend(struct.pack('<h',round(max(-.9,min(.9,v*fade))*32767)))
 w.writeframes(data)
print(a.output)
