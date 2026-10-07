from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,hashlib,sys
R=Path(__file__).resolve().parents[1];version=sys.argv[1] if len(sys.argv)>1 else 'm6';O=R/('candidate-'+version);V=O/'review'
f='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';font=ImageFont.truetype(f,23);sm=ImageFont.truetype(f,16)
C=Image.new('RGB',(2040,1370),'#151c22');d=ImageDraw.Draw(C)
d.text((25,20),'BROOD MITE / '+version.upper()+' MATCHED COLD-IMPORT LOD REVIEW',font=font,fill='#e1edf1')
d.text((25,62),'Same exact camera, lighting and shared Brood maps. Blender diagnostics, not actual game Look/GPU acceptance.',font=sm,fill='#b8c9d2')
stats=json.loads((O/'lod-stats.json').read_text())
for i,name in enumerate(['source','LOD0','LOD1','LOD2']):
 x=i*510;d.text((x+20,108),name.upper()+(' / editable form' if i==0 else ' / '+str(stats[i-1]['triangles'])+' triangles'),font=sm,fill='#e1edf1')
 for j,view in enumerate(['top','chase60','mouth']):
  im=Image.open(V/f'{name}-{view}.png').convert('RGBA');im.thumbnail((510,320));C.paste(im,(x,142+j*325),im)
 im=Image.open(V/f'{name}-chase60.png').convert('RGBA');im=im.crop(im.getbbox());im.thumbnail((170,170));C.paste(im,(x+155,1140),im)
 d.text((x+20,1310),'170px equal-screen-size read',font=sm,fill='#b8c9d2')
C.save(V/('mite-'+version+'-matched-lod-review.png'))
manifest={'status':'immutable review snapshot; no runtime admission','sourceForm':'study-m6/mite-M6-source.blend','lods':[{k:v for k,v in s.items() if k!='parts'} for s in stats],'artImageSha256':hashlib.sha256((V/('mite-'+version+'-matched-lod-review.png')).read_bytes()).hexdigest(),'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [O/'brood_mite_v01.glb',O/'brood-mite.motion.json']},'openGates':['independent art acceptance','shared canonical convex implementation','all required native/LOS/projectile/tether fixture tests','target GPU swarm/default-route Look']}
(O/'REVIEW_FREEZE.json').write_text(json.dumps(manifest,indent=2))
