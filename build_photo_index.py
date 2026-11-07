"""Rebuild the local image-search pilot from catalog photos. Requires Pillow, numpy and onnxruntime."""
import base64, io, json, re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageOps
import numpy as np
import onnxruntime as ort
from site_pages import catalog

OUT=Path(__file__).resolve().parent/'web/vendor/vision'
FAMILIES=('9060','XT-6','GEL-KAYANO','SAMBA','AIR FORCE','AIR MAX','GEL-1130','530','DUNK','550','GAZELLE','SPEEDCROSS','CLUB C','GEL-NYC','FORUM','2002','1906','574','SL 72','CAMPUS')
opts=ort.SessionOptions()
opts.intra_op_num_threads=2
session=ort.InferenceSession(str(OUT/'squeezenet1.1-7.onnx'),opts,providers=['CPUExecutionProvider'])


def embed(p):
    try:
        with urlopen(Request(p['image'],headers={'User-Agent':'SoleRadar/1.0'}),timeout=6) as r:
            jpeg=r.read(6000000)
        im=Image.open(io.BytesIO(jpeg)).convert('RGBA')
        if im.width*im.height>30000000:return
        canvas=Image.new('RGB',(224,224),'white')
        im=ImageOps.contain(im,(224,224))
        canvas.paste(im,((224-im.width)//2,(224-im.height)//2),im)
        pixels=np.asarray(canvas)
        background=np.median([pixels[y,x] for y in (0,223) for x in (0,223)],axis=0)
        mask=np.max(np.abs(pixels-background),axis=2)>24
        ys,xs=np.where(mask)
        if len(xs)>100:
            x0,x1=int(xs.min()),int(xs.max())+1
            y0,y1=int(ys.min()),int(ys.max())+1
            crop=ImageOps.contain(canvas.crop((x0,y0,x1,y1)),(210,210))
            canvas=Image.new('RGB',(224,224),'white')
            canvas.paste(crop,((224-crop.width)//2,(224-crop.height)//2))
        foreground=pixels[mask].astype('int32')//64
        bins=np.bincount(foreground@np.array([16,4,1]),minlength=64)
        color=np.round(255*np.sqrt(bins/max(1,bins.sum()))).astype('uint8')
        rgb=np.asarray(canvas).astype('float32')/255
        x=((rgb-[.485,.456,.406])/[.229,.224,.225]).astype('float32').transpose(2,0,1)[None]
        vec=session.run(None,{'data':x})[0].flatten()
        feature=np.round(vec/max(float(abs(vec).max()),1e-9)*127).astype('int8')
        return {k:p[k] for k in ('id','name','brand','image','code')}|{'v':base64.b64encode(feature).decode(),'h':base64.b64encode(color).decode()}
    except (OSError,ValueError):
        return None


if __name__=='__main__':
    products=sorted(catalog()['products'],key=lambda p:p['id'])
    chosen={}
    for family in FAMILIES:
        matches=[p for p in products if re.search(r'(?<![A-Z0-9])'+re.escape(family)+r'(?![0-9])',p['name'].upper()) and p['image'].startswith('https://')]
        chosen.update((p['id'],p) for p in matches[:8])
    with ThreadPoolExecutor(5) as pool:
        rows=[r for r in pool.map(embed,chosen.values()) if r]
    if len(rows)<20:raise SystemExit('Too few reference images')
    (OUT/'index.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print('Indexed references:',len(rows))
