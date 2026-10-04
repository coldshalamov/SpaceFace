from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[1];D=R/'review';tag='mite-lamellar-r4'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
F=lambda n:ImageFont.truetype(font,n)
bg=(47,55,61);panel=(59,65,70);ink=(231,234,235);sub=(173,186,193)
def sprite(name,width=None):
 im=Image.open(D/name).convert('RGBA');alpha=im.getchannel('A');bbox=alpha.point(lambda a:255 if a>8 else 0).getbbox()
 im=im.crop(bbox)
 if width:im=im.resize((width,round(im.height*width/im.width)),Image.Resampling.LANCZOS)
 return im
sheet=Image.new('RGB',(1800,1950),bg);draw=ImageDraw.Draw(sheet)
draw.text((28,22),'BROOD MITE / ACTUAL EXPORTED GEOMETRY R4',font=F(30),fill=ink)
draw.text((28,64),'Blender neutral/clay study. NOT production, NOT the game Look, NOT generated concept pixels.',font=F(19),fill=sub)
cells=[('material-top','TOP / actual GLB'),('material-threequarter','THREE-QUARTER / actual GLB'),('material-chase60','60-DEGREE ORTHOGRAPHIC / actual GLB'),('clay-top','CLAY TOP / same geometry'),('clay-threequarter','CLAY THREE-QUARTER / same geometry'),('clay-jawroot','CLAY ROOT / actual closed forms')]
for i,(stem,label) in enumerate(cells):
 x=20+(i%3)*594;y=112+(i//3)*460
 draw.rounded_rectangle((x,y,x+574,y+441),radius=5,fill=panel)
 im=sprite(tag+'-'+stem+'.png');im.thumbnail((546,376),Image.Resampling.LANCZOS)
 sheet.paste(im,(x+(574-im.width)//2,y+36+(376-im.height)//2),im)
 draw.text((x+14,y+13),label,font=F(17),fill=ink)
draw.text((28,1050),'MEASURED PIXEL WIDTHS / no reframing between the material and clay versions',font=F(22),fill=ink)
for ci,mode in enumerate(['material','clay']):
 y=1110+ci*400
 for x,w in [(28,450),(610,170),(930,96)]:
  im=sprite(tag+'-'+mode+'-chase60.png',w);sheet.paste(im,(x,y),im)
  draw.text((x,y+im.height+14),f'{mode} / {w} px',font=F(17),fill=sub)
draw.text((1150,1114),'WHAT IS PROVEN',font=F(20),fill=ink)
for j,line in enumerate(['One consistent model in all views','Real shell thickness and overlaps','Paired fixed jaw tips and open slot','Actual Blender/GLB portability']):draw.text((1150,1150+j*27),line,font=F(17),fill=sub)
draw.text((1150,1290),'WHAT IS STILL OPEN',font=F(20),fill=ink)
for j,line in enumerate(['Joint and shell craft to concept standard','UV/bake, production rig and LODs','New truthful collision fit','Actual runtime Look and scene cost']):draw.text((1150,1326+j*27),line,font=F(17),fill=sub)
sha=hashlib.sha256((R/'prototype'/f'{tag}.glb').read_bytes()).hexdigest()
draw.text((28,1905),'Source GLB SHA256 '+sha,font=F(15),fill=sub)
sheet.save(D/'mite-r4-neutral-and-scale-review.png')
# A compact two-view pair for rapid root review.
small=Image.new('RGB',(1300,650),bg);d=ImageDraw.Draw(small)
d.text((20,17),'ACTUAL GLB R4 / unfinished form prototype',font=F(24),fill=ink)
for i,mode in enumerate(['material','clay']):
 im=sprite(tag+'-'+mode+'-threequarter.png');im.thumbnail((620,550),Image.Resampling.LANCZOS);small.paste(im,(20+i*650,80+(550-im.height)//2),im)
small.save(D/'mite-r4-material-clay-pair.png')
(D/'scale-method.json').write_text(json.dumps({'sourceGlbSha256':sha,'method':'Crop cold-import RGBA render to alpha > 8 bounds, Lanczos-scale silhouette to explicit width; composite on neutral RGB 47/55/61. No painted geometry.','widths':[450,170,96],'actualGameCamera':False,'gameplaySizeClaim':False},indent=2))
