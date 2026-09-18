import json,os,subprocess,sys,tempfile
from pathlib import Path
from pypdf import PdfReader
root=Path(__file__).resolve().parent.parent
out=Path(tempfile.mkdtemp(prefix='image-format-check-',dir=root/'output'))
rows=[]
for ext in ['png','jpg','jpeg','webp','gif','bmp']:
    for orientation in ['portrait','landscape']:
        for sizing in ['fit','actual']:
            p=subprocess.run(['node','scripts/run-pages.ts',f'fixtures/representative/{orientation}.{ext}'],cwd=root,env={**os.environ,'PLIFLO_IMAGE_SIZING':sizing},capture_output=True,text=True,check=True)
            result=json.loads(p.stdout);pages=Path(result['run'])/'pages'
            check=subprocess.run([sys.executable,'tools/check-pages.py',str(pages)],cwd=root,capture_output=True,text=True,check=True)
            report=json.loads(check.stdout);assert report['pages']==1 and report['rows'][0]['imageObjects']==1
            w,h=report['rows'][0]['sizePt'];assert (w>h)==(orientation=='landscape')
            recording=json.loads((pages/'page-001.json').read_text())
            draw=next(c['args'] for c in recording['commands'] if c['op']=='drawImage')
            if sizing=='actual':assert draw[3:]==([360,540] if orientation=='portrait' else [540,360])
            rows.append({'format':ext,'orientation':orientation,'sizing':sizing,'run':result['run'],'mae':report['rows'][0]['rgbMAE255']})
            (out/'results.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows[-1]),flush=True)
print(out)
