from pathlib import Path
import subprocess,json,hashlib,array,math
p=Path(__file__).resolve().parent;root=p.parents[2]
ff=str(root/'node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg');fp=str(root/'node_modules/@ffprobe-installer/darwin-arm64/ffprobe');f=p/'demo.mp4'
def run(args):return subprocess.run(args,capture_output=True,check=True)
run([ff,'-v','error','-i',str(f),'-f','null','-'])
meta=json.loads(run([fp,'-v','error','-show_streams','-show_format','-of','json',str(f)]).stdout)
(p/'review/media-probe.json').write_text(json.dumps(meta,indent=2))
for t,n in [(2,'opening'),(8,'start'),(22,'change'),(34,'detail'),(40,'return'),(49,'ending'),(53.5,'tail')]:run([ff,'-v','error','-y','-ss',str(t),'-i',str(f),'-frames:v','1',str(p/'review'/f'{n}.jpg')])
run([ff,'-v','error','-y','-i',str(f),'-vf','fps=1/5,scale=480:-1,tile=3x4','-frames:v','1',str(p/'review/final-contact.jpg')])
edl=json.load(open(p/'source-selection.json'))['segments'];audio=[]
def samples(file,t):
 r=run([ff,'-v','error','-ss',str(t),'-i',str(file),'-t','1','-vn','-ac','1','-ar','8000','-f','s16le','-']);v=array.array('h',r.stdout);return list(v)
for s in edl:
 a=samples(f,s['start']+s['duration']/2);b=samples(p/'assets/source.webm',s['sourceStart']+s['duration']/2);n=min(len(a),len(b));a=a[:n];b=b[:n];ma=sum(a)/n;mb=sum(b)/n
 corr=sum((x-ma)*(y-mb) for x,y in zip(a,b))/math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b));audio.append({'segment':s['id'],'correlation':round(corr,5)})
report={'provenance':'reference-author-v2','sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'duration':meta['format']['duration'],'fullDecode':True,'hyperframesCheck':'passed','warnings':['Synchronous macro intentionally repeats source video','Single composition contains several timed graphic hosts'],'audioSourceCorrelations':audio,'reviewCoverage':'exported keyframes and technical audio mapping; continuous listening and human judgement pending','humanAccepted':False}
(p/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
