from pathlib import Path
import argparse
from PIL import Image,ImageDraw,ImageFont
parser=argparse.ArgumentParser();parser.add_argument('--input-dir',default='artifacts');parser.add_argument('--output-dir',default='artifacts');args=parser.parse_args();r=Path(args.input_dir);out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
views=[('source-oblique','Source / chase direction'),('export-oblique','Export / chase direction'),('export-top','Export / top'),('export-side','Export / side')]
def sheet(labels,title,name):
 im=Image.new('RGB',(1280,890),(22,25,30));d=ImageDraw.Draw(im);d.text((12,8),title,font=f,fill='white')
 for row,(label,description) in enumerate(labels):
  y=36+row*344
  for col,(suffix,heading) in enumerate(views):
   d.text((col*320+10,y),description+' | '+heading,font=f,fill='white');im.paste(Image.open(r/f'{label}-{suffix}.jpg'),(col*320,y+23))
 d.text((12,729),'Reduced 128px panels, same framing: each pair = first row / second row. Inspection scale, not gameplay distance.',font=f,fill='white')
 for col,(suffix,_) in enumerate(views):
  for row,(label,_) in enumerate(labels):im.paste(Image.open(r/f'{label}-{suffix}.jpg').resize((128,128)),(col*320+row*144+16,752))
 im.save(out/name,quality=93)
sheet([('baseline','Original 4 tris'),('candidate','Refined 480 tris')],'Loose Rib: actual runtime arrays vs glTF import. Existing tissue maps. Blender offline; NOT a live game capture.','rib-refined-source-export-comparison.jpg')
if (r/'first-good-source-oblique.jpg').exists():
 sheet([('first-good','First good 256 tris'),('candidate','Refined 480 tris')],'Restrained smoothing + motion-envelope sizing: two draws; final geometry 0.93x. Offline matched views.','rib-refined-smoothing-comparison.jpg')
im=Image.new('RGB',(640,744),(22,25,30));d=ImageDraw.Draw(im);d.text((8,8),'Actual exported motion extremes / offline Blender inspection',font=f,fill='white')
for row,label in enumerate(['candidate-charge','candidate-flee']):
 for col,(suffix,title) in enumerate([('oblique','chase direction'),('top','top')]):
  y=40+row*344;d.text((col*320+8,y),label+' / '+title,font=f,fill='white');im.paste(Image.open(r/f'{label}-export-{suffix}.jpg'),(col*320,y+22))
d.text((8,727),'Visible joint cuff/crease retained; overlap checked, no motion rewrite.',font=f,fill='white');im.save(out/'rib-refined-motion-comparison.jpg',quality=93)
