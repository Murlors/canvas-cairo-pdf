"""同一次浏览器画布的raster对照；不是Pliflo Rust封装或worker性能基准。"""
import json,sys
from pathlib import Path
from reportlab.pdfgen.canvas import Canvas
from pypdf import PdfReader

directory=Path(sys.argv[1]).resolve()
target=directory/(sys.argv[2] if len(sys.argv)>2 else 'raster-reference.pdf')
if target.exists():raise FileExistsError(target)
canvas=Canvas(str(target))
for path in sorted(directory.glob('page-*.json')):
    doc=json.loads(path.read_text());s=doc['size'];w,h=s['widthPt'],s['heightPt']
    canvas.setPageSize((w,h));canvas.drawImage(str(path.with_suffix('.png')),0,0,width=w,height=h);canvas.showPage()
canvas.save()
rows=[]
for kind,path in [('direct',directory/'document.pdf'),('raster',target)]:
    reader=PdfReader(path)
    rows.append({'kind':kind,'pages':len(reader.pages),'bytes':path.stat().st_size,'images':sum(len(p.images) for p in reader.pages),'extractedCharacters':sum(len(p.extract_text()) for p in reader.pages),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in reader.pages]})
assert rows[0]['pages']==rows[1]['pages']
assert all(abs(a-b)<0.001 for sa,sb in zip(rows[0]['sizes'],rows[1]['sizes']) for a,b in zip(sa,sb))
(directory/'raster-comparison.json').write_text(json.dumps(rows,indent=2))
print(json.dumps(rows))
