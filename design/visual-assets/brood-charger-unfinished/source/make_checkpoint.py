from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
R=Path(__file__).resolve().parents[1];font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
C=Image.new('RGB',(1440,1030),'#151c22');d=ImageDraw.Draw(C)
for j,version in enumerate(['c3','c5']):
 for i,view in enumerate(['top','threequarter','fork']):
  im=Image.open(R/f'study-{version}/{version}-lod0-{view}.png').convert('RGBA');im.thumbnail((480,370));C.paste(im,(i*480,j*420+35),im);d.text((i*480+15,j*420+10),f'{version.upper()} / {view}',font=font,fill='#dce6eb')
for j,version in enumerate(['c3','c5']):
 im=Image.open(R/f'study-{version}/{version}-lod0-chase60.png').convert('RGBA');box=im.getbbox();im=im.crop(box);im.thumbnail((170,170));C.paste(im,(400+j*360,865),im);d.text((380+j*360,1000),f'{version.upper()} / 170px wide',font=font,fill='#dce6eb')
C.save(R/'study-c5/c3-c5-checkpoint.png')
