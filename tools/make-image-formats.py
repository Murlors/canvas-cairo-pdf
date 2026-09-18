from pathlib import Path
from PIL import Image,ImageDraw
out=Path(__file__).resolve().parent.parent/'fixtures/representative'
out.mkdir(parents=True, exist_ok=True)
for orientation,size in [('portrait',(240,360)),('landscape',(360,240))]:
    image=Image.new('RGB',size,'#eef2f5');draw=ImageDraw.Draw(image)
    draw.rectangle((12,12,size[0]-12,size[1]-12),outline='#1d5c85',width=5)
    draw.line((0,0,*size),fill='#db5b46',width=4)
    draw.text((25,40),'IMAGE FORMAT TEST',fill='black')
    for extension,format in [('png','PNG'),('jpg','JPEG'),('jpeg','JPEG'),('webp','WEBP'),('gif','GIF'),('bmp','BMP')]:
        image.save(out/f'{orientation}.{extension}',format=format)
