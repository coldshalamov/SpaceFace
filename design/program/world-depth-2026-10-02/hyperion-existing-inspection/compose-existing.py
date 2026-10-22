import os
from PIL import Image, ImageDraw
D=os.environ.get('INSPECTION_DIR','./inspection-input')
im=Image.new('RGB',(1440,880),(18,22,28));draw=ImageDraw.Draw(im)
draw.text((15,12),'EXISTING EXPORTED ASSETS | Same camera, light and authored scale | NOT new models or live-game acceptance',fill='white')
for i,n in enumerate(['dead-hulk','drill-platform','drill-platform-cold']):
 draw.text((i*480+12,40),n,fill='white')
 for j,v in enumerate(['oblique','top']):im.paste(Image.open(f'{D}/{n}-{v}.jpg'),(i*480,60+j*400))
draw.text((15,862),'Meshopt decoded; scalar PBR materials retained; Basis textures omitted for offline compatibility. LOD0 only.',fill='white')
im.save(D+'/existing-assets-comparison.jpg',quality=88)
