#!/usr/bin/env python3
"""Reproduce from frozen native packet: python3 -B script.py samples.json out.webp."""
import hashlib,io,json,os,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
src,out=sys.argv[1:]
b=open(src,'rb').read()
assert hashlib.sha256(b).hexdigest()=='03b5996d0480390e4d29a8e5fcc10083ff739af42d201d46e9c05a8692d1eea8'
p=json.loads(b); assert p['sceneBlob']=='557c71463cab778899f335474bf4118ed6fdf027'
im=Image.new('RGB',(900,600),'#081321'); d=ImageDraw.Draw(im)
fonts='/usr/share/fonts/truetype/dejavu/'
def f(n,b=False): return ImageFont.truetype(fonts+('DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf'),n)
def txt(x,y,s,n=14,c='#b9cadb',b=False): d.text((x,y),s,font=f(n,b),fill=c)
cyan='#61e5f5'; gold='#ffd078'; lavender='#bfabff'
txt(28,20,'PITBORN / PHYSICAL RECOVERY',25,'#edf8ff',True)
txt(28,55,'Native physics trajectory, not game-camera capture',16,cyan)
txt(28,80,'Source 557c7146  |  measured X/Z positions  |  world units (WU)',12)
# Equal scale; positive Z points up. Symbols are point markers, not hull shapes.
def xy(a): return (70+(a['x']+750)*.25,490-(a['z']+750)*.25)
for v in (-500,0,500):
 x,y=xy({'x':v,'z':v})
 d.line((x,105,x,480),fill='#203044'); d.line((55,y,455,y),fill='#203044')
 txt(x-13,482,str(v),11,'#8195ab'); txt(18,y-6,str(v),11,'#8195ab')
txt(218,503,'X (WU)',12);txt(18,101,'Z',12)
samples=p['measuredSamples']
for kind,color in [('player',cyan),('pod',gold)]:
 pts=[xy(s[kind]) for s in samples]
 d.line(pts,fill=color,width=2)
 for x,y in pts: d.ellipse((x-2,y-2,x+2,y+2),fill=color)
# Selected labels are rounded from actual times.
for idx,dx,dy in [(0,8,3),(11,-3,-23),(14,-30,-25),(17,-42,-8),(18,12,-4)]:
 s=samples[idx];x,y=xy(s['player']);txt(x+dx,y+dy,f"{s['time']:.0f}s",12,cyan)
x,y=xy(samples[0]['pod']);txt(x-32,y-28,'Pod start',12,gold)
x,y=xy({'x':0,'z':0});d.line((x-6,y-6,x+6,y+6),fill='#d9e2ec',width=2);d.line((x-6,y+6,x+6,y-6),fill='#d9e2ec',width=2);txt(x+11,y-8,'Original wreck',12,'#d9e2ec')
x,y=xy(p['terminal']['poses']['tender']);d.rectangle((x-4,y-4,x+4,y+4),outline=lavender,width=2)
d.line((x+6,y,225,y),fill=lavender);txt(229,y-10,'190.08s handoff',13,lavender,True)
d.line((490,112,490,511),fill='#273b50')
for y,c,s in [(116,cyan,'Player'),(142,gold,'Escape pod'),(168,lavender,'Tender: terminal point only')]:
 d.line((520,y+8,542,y+8),fill=c,width=3) if c!=lavender else d.rectangle((528,y+4,536,y+12),outline=c,width=2)
 txt(553,y,s,14,c)
txt(520,207,'SAMPLED TRACE',13,'#edf8ff',True)
txt(520,230,'Dots every 10 seconds; straight connectors.',13)
txt(520,250,'Tender route was not sampled.',13)
txt(520,280,'FIXTURE SEQUENCE',13,'#edf8ff',True)
txt(520,303,'19.23s  Real kernel tether attaches',13)
txt(520,324,'~100s   Pilot ends deliberate hold; tows',13)
txt(520,345,'180s     Tender fallback begins',13)
txt(520,366,'190.08s  Original pod recovered once',13)
txt(520,400,'260 credits / +4 Pitborn',17,gold,True)
txt(520,428,'13-unit wreck pool intact; claim released.',13)
txt(520,449,'Completed Save retains reward + receipt.',13)
txt(520,479,'One low-speed player/pod contact; trauma 0.',12)
d.rectangle((0,535,900,600),fill='#101f30')
txt(28,546,'Forced component admission + fixture pilot; mixed archive graph.',13,'#e3edf8')
txt(28,569,'Not ordinary first-arrival proof, a game-camera capture, or visual acceptance.',12)
buf=io.BytesIO();im.quantize(colors=24).convert('RGB').save(buf,format='WEBP',lossless=True,method=6)
data=buf.getvalue()
assert len(data)<=19000, len(data)
assert not Path(out).exists(), 'Refusing to overwrite an existing output'
st=os.statvfs(Path(out).resolve().parent);free=st.f_bavail*st.f_frsize
assert free-((len(data)+4095)//4096)*4096>=3072*1024,free
open(out,'wb').write(data)
print(json.dumps({'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'freeKiB':st.f_bavail*st.f_frsize//1024}))
