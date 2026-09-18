"""Verify browser page recordings against the PDF without logging document text."""
import json, subprocess, collections, sys
from pathlib import Path
from pypdf import PdfReader
from PIL import Image,ImageChops,ImageStat,ImageDraw

directory=Path(sys.argv[1]).resolve()
other=Path(sys.argv[2]).resolve() if len(sys.argv)>2 else None
result=json.loads((directory/'result.json').read_text())
reader=PdfReader(directory/'document.pdf')
assert len(reader.pages)==result['sourcePages']
rows=[];thumbs=[]
for index,page in enumerate(reader.pages):
    prefix=directory/f'page-{index+1:03d}'
    recording=json.loads(prefix.with_suffix('.json').read_text())
    assert abs(float(page.mediabox.width)-recording['size']['widthPt'])<0.001
    assert abs(float(page.mediabox.height)-recording['size']['heightPt'])<0.001
    original=''.join(c['args'][0] for c in recording['commands'] if c['op']=='fillText')
    extracted=page.extract_text()
    chars=lambda s:collections.Counter(c for c in s if not c.isspace())
    assert chars(original)==chars(extracted),f'Page {index+1} codepoint counts differ'
    # 直接渲染最终多页 PDF，避免只检查诊断单页而漏掉最终输出问题。
    subprocess.run(['pdftoppm','-f',str(index+1),'-l',str(index+1),'-scale-to-x',str(recording['width']),'-scale-to-y',str(recording['height']),'-singlefile','-png',str(directory/'document.pdf'),str(prefix)+'-native'],check=True,capture_output=True)
    reference=Image.open(prefix.with_suffix('.png')).convert('RGB')
    native=Image.open(str(prefix)+'-native.png').convert('RGB')
    assert native.size==reference.size
    mae=sum(ImageStat.Stat(ImageChops.difference(reference,native)).mean)/3
    row={'page':index+1,'sizePt':[float(page.mediabox.width),float(page.mediabox.height)],
         'nonWhitespaceCodepointsExact':True,'rgbMAE255':mae,'commands':len(recording['commands']),
         'imageObjects':len(page.images)}
    if other:
        b=json.loads((other/prefix.with_suffix('.json').name).read_text())
        row['chromiumSizeEqual']=b['size']==recording['size']
        row['chromiumCommandCount']=len(b['commands'])
        text=lambda r:[c['args'] for c in r['commands'] if c['op']=='fillText']
        aa,bb=text(recording),text(b)
        row['chromiumTextRunsSame']=[x[0] for x in aa]==[x[0] for x in bb]
        if row['chromiumTextRunsSame']:
            row['chromiumMaxTextCoordinateDelta']=max([abs(x[k]-y[k]) for x,y in zip(aa,bb) for k in [1,2]],default=0)
    rows.append(row)
    panel=Image.new('RGB',(620,450),'#eeeeee');d=ImageDraw.Draw(panel)
    for n,(label,im) in enumerate([('Browser Canvas',reference),('Native PDF',native)]):
        im.thumbnail((300,410));panel.paste(im,(n*310,30));d.text((n*310+5,8),f'Page {index+1}: {label}',fill='black')
    thumbs.append(panel)
sheet=Image.new('RGB',(1240,450*((len(thumbs)+1)//2)),'white')
for i,im in enumerate(thumbs):sheet.paste(im,((i%2)*620,(i//2)*450))
sheet.save(directory/'overview.png')
report={'pages':len(rows),'bytes':(directory/'document.pdf').stat().st_size,'rows':rows}
(directory/'checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
