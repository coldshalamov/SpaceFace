from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[1];O=R/'candidate-c6/review';font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20);small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
def paste(C,p,xy,size):
 im=Image.open(p).convert('RGBA');im.thumbnail(size);C.paste(im,xy,im)
C=Image.new('RGB',(1440,1530),'#151c22');d=ImageDraw.Draw(C);d.text((20,15),'CHARGER C6 / UNFINISHED ART HANDOFF / cold GLB LOD review',font=font,fill='#edf0f5');d.text((20,47),'User rejected the art direction. Neutral Blender diagnostics; actual game Look and GPU performance unverified.',font=small,fill='#a6b4bd')
for lod,tris in [(0,3712),(1,2308),(2,1428)]:
 x=lod*480;d.text((x+20,90),f'LOD {lod} / {tris} triangles / 6 draws',font=font,fill='#edf0f5')
 for j,view in enumerate(['top','threequarter','fork']):paste(C,O/f'lod{lod}-{view}.png',(x,j*370+122),(480,365))
 im=Image.open(O/f'lod{lod}-chase60.png').convert('RGBA');im=im.crop(im.getbbox())
 for i,width in enumerate([170,96,64]):
  cut=im.copy();cut.thumbnail((width,width));C.paste(cut,(x+25+i*160,1260),cut);d.text((x+25+i*160,1450),f'{width}px wide',font=small,fill='#a6b4bd')
C.save(O/'c6-matched-lod-review.png')
C=Image.new('RGB',(1680,980),'#151c22');d=ImageDraw.Draw(C);d.text((18,14),'CHARGER C6 / actual named action endpoints / cold GLB, quaternion-correct',font=font,fill='#edf0f5')
for i,phase in enumerate(['approach','windup','attack','recovery']):
 d.text((i*420+18,58),phase,font=font,fill='#edf0f5')
 for j,lod in enumerate([0,2]):paste(C,O/f'lod{lod}-{phase}.png',(i*420,j*380+90),(420,360));d.text((i*420+18,j*380+440),f'LOD{lod}',font=small,fill='#a6b4bd')
d.text((18,915),'45 / 144 / 84 ticks. .42-rad paddle fold and .8 WU abdomen travel; fixed contact anatomy and fixed support.',font=small,fill='#a6b4bd');C.save(O/'c6-action-review.png')
C=Image.new('RGB',(1440,1110),'#151c22');d=ImageDraw.Draw(C);d.text((18,12),'CHARGER C6 / underside, thickness and normal-map isolation',font=font,fill='#edf0f5')
for i,lod in enumerate([0,1,2]):
 for j,view in enumerate(['underside','side']):paste(C,O/f'lod{lod}-{view}.png',(i*480,j*360+60),(480,350));d.text((i*480+15,j*360+65),f'LOD{lod} {view}',font=small,fill='#a6b4bd')
paste(C,O/'lod0-threequarter.png',(250,775),(430,325));paste(C,O/'lod0-untextured-normal-check.png',(720,775),(430,325));d.text((250,760),'Shared normal map enabled',font=small,fill='#a6b4bd');d.text((720,760),'Normal map disconnected',font=small,fill='#a6b4bd');C.save(O/'c6-structural-review.png')
