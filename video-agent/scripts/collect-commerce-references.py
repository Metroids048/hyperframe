"""Collect public references for private analysis and reusable stock demo inputs.
Competitor reference videos are NOT included in the final demo distribution.
"""
import hashlib, html, json, pathlib, re, urllib.request, urllib.parse, zipfile
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path('research-output'); ROOT.mkdir(exist_ok=True)
PAGES = {
 'jitter-launch': 'https://jitter.video/template/the-edit-product-launch/',
 'jitter-fragrance': 'https://jitter.video/template/the-edit-fragrance-promo/',
 'jitter-track': 'https://jitter.video/template/the-track-product-reveal/',
 'creatomate': 'https://creatomate.com/templates',
 'creatify': 'https://creatify.ai/use-cases/cinematic',
}
IMAGES = [7364096,38721551,30970926,30970929,7054538,7241360,1037996,8188889,6776079,14447345]

def fetch(url, target, limit=45000000):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=35) as response:
        data = response.read(limit + 1)
    if len(data)>limit: raise ValueError('download exceeds size budget')
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    return {'url':url,'file':str(target),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def media_urls(raw, base):
    raw = html.unescape(raw).replace('\\/','/')
    candidates = re.findall(r'(?:https://|/)[^\s<>\"\x27\\]+?\.(?:mp4|webm)(?:\?[^\s<>\"\x27\\]*)?',raw)
    return list(dict.fromkeys(urllib.parse.urljoin(base,u) for u in candidates))

def page_job(item):
    name,url=item
    try:
        target=ROOT/'references'/(name+'.html'); result=fetch(url,target,6000000)
        urls=media_urls(target.read_text(errors='replace'),url)
        result['media_urls']=urls; result['downloads']=[]
        for i,video_url in enumerate(urls[:3]):
            try: result['downloads'].append(fetch(video_url,ROOT/'references'/(f'{name}-{i}'+pathlib.Path(urllib.parse.urlparse(video_url).path).suffix)))
            except Exception as e: result['downloads'].append({'url':video_url,'error':str(e)})
        return result
    except Exception as e: return {'url':url,'error':str(e)}

def image_job(photo_id):
    url=f'https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w=1800'
    try:return fetch(url,ROOT/'inputs'/f'{photo_id}.jpg',9000000)
    except Exception as e:return {'url':url,'error':str(e)}

if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=5) as pool:
        pages=list(pool.map(page_job,PAGES.items())); images=list(pool.map(image_job,IMAGES))
    (ROOT/'downloads.json').write_text(json.dumps({'references':pages,'inputs':images},indent=2))
    with zipfile.ZipFile('commerce-research-runtime.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in ROOT.rglob('*'):
            if p.is_file():z.write(p,p)
        app=pathlib.Path('video-agent')
        for folder in ['lib','config/skills','node_modules','scripts']:
            for p in (app/folder).rglob('*'):
                if p.is_file() and p.suffix.lower() not in {'.ttf','.otf','.woff','.woff2','.ttc'}:z.write(p,p)
        for name in ['package.json','package-lock.json']:
            z.write(app/name,app/name)
    print(json.dumps({'references':pages,'inputs':images},indent=2))
