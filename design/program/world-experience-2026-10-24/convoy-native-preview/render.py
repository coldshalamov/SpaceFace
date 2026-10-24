# Measured native headless test, not game-camera imagery. Data: parent independent
# rerun; contextual provenance: https://github.com/coldshalamov/SpaceFace/blob/d98ea998bf93dfcd2e36dff401c3432bee1418a1/design/program/world-experience-2026-10-24/ACCOMPANIED_FORMATION_PROGRESS.md.
# No rerun; no interpolation represented as measured full trajectories.
import os, hashlib, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).with_name('convoy-trajectory.png'))
im=Image.new('RGB',(1000,620),'#101b2a'); d=ImageDraw.Draw(im)
def font(n,b=False): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if b else '')+'.ttf',n)
def txt(x,y,s,n=14,c='#dbe5f0',b=False): d.text((x,y),s,font=font(n,b),fill=c)
cyan='#54d9e7'; gold='#ffd485'; muted='#9dafc3'; grid='#304156'
txt(32,22,'NATIVE PHYSICS TEST • NOT GAME CAMERA',17,cyan,True)
txt(32,52,'8 s accompanying / one payout',30,b=True)
txt(32,96,'Input-only pilot • 3 dynamic Rapier bodies • actual NPC ring motion',15,muted)
d.rounded_rectangle((24,135,486,503),radius=12,fill='#192739')
d.rounded_rectangle((504,135,976,503),radius=12,fill='#192739')
txt(44,150,'LEADER / sampled positions',18,b=True)
txt(524,150,'PLAYER–LEADER RANGE',18,b=True)
pts=[(-12678.770508,8687.928711),(-12670.230469,8693.875),(-12655.889648,8750.457031),(-12638.105469,8852.053711),(-12622.378906,8958.291016),(-12614.563477,9048.862305),(-12634.169922,9090.528320),(-12665.875,9111.291992),(-12732.698242,9098.271484),(-12841.127930,9005.093750)]
end=(-12898.897461,8922.249023); player=(-12998.880859,8968.275391); hold=(-12621.255859,9080.001953)
# Equal-scale X/Z axes, world units. All positions are explicitly measured.
def xy(p): return (88+(p[0]+13050)*.55,443-(p[1]-8650)*.55)
for x in [-13000,-12800,-12600]:
 a,b=xy((x,8650)); d.line((a,187,a,443),fill=grid); txt(a-24,450,str(x),11,muted)
for z in [8700,8900,9100]:
 a,b=xy((-13050,z)); d.line((88,b,347,b),fill=grid); txt(47,b-7,str(z),11,muted)
txt(174,478,'X (world units)',12,muted); txt(46,174,'Z',12,muted)
ordered=pts[:6]+[hold]+pts[6:]+[end]
d.line([xy(p) for p in ordered],fill='#387d91',width=2)
for p in pts:
 x,y=xy(p); d.ellipse((x-3,y-3,x+3,y+3),fill=cyan)
for p,c in [(hold,gold),(end,cyan)]:
 x,y=xy(p); d.ellipse((x-5,y-5,x+5,y+5),outline=c,width=2)
x,y=xy(player); d.rectangle((x-4,y-4,x+4,y+4),fill=gold)
txt(300,420,'start',12,cyan); txt(335,198,'hold starts',12,gold)
txt(179,299,'leader settles',12,cyan); txt(93,245,'player settles',12,gold)
txt(357,350,'319.3 WU',13,b=True); txt(357,369,'leader hold',11,muted); txt(357,384,'displacement',11,muted)
# Range samples, final settlement; no player path is inferred.
ranges=[719.956,506.453,344.606,248.394,191.275,156.892,136.076,122.100,105.542,106.052]
def rp(t,r): return (564+t*19,443-r*.30)
hs=11.083333; he=19.083333
x0,_=rp(hs,0); x1,_=rp(he,0)
d.rectangle((x0,199,x1,443),fill='#243c45')
_,y180=rp(0,180); _,y60=rp(0,60)
d.rectangle((564,y180,944,y60),fill='#30554d')
for r in [0,180,400,720]:
 x,y=rp(0,r); d.line((564,y,944,y),fill=grid); txt(528,y-7,str(r),11,muted)
for t in [0,5,10,15,20]:
 x,y=rp(t,0); d.line((x,199,x,443),fill=grid); txt(x-5,450,str(t),11,muted)
coords=[rp(i*2+.0167,r) for i,r in enumerate(ranges)]+[rp(he,110.068644)]
d.line(coords,fill=cyan,width=2)
for x,y in coords: d.ellipse((x-3,y-3,x+3,y+3),fill=cyan)
d.line((x0,210,x1,210),fill=gold,width=2)
for x in [x0,x1]: d.line((x,205,x,216),fill=gold,width=2)
txt(x0+42,184,'8 s hold',13,gold,True)
txt(650,399,'60–180 WU band',12,'#b8e4d6'); txt(831,371,'110.1 WU final',12,cyan)
txt(633,478,'Elapsed simulation time (s)',12,muted)
txt(32,521,'48 credits  /  +2 Helix  /  1 receipt  /  0 observed impacts',18,b=True)
txt(32,553,'Lines connect samples as guides, not full measured trajectories. Only final player position is shown.',13,muted)
txt(32,577,'Corrected pilot route passed; initial pilot: 36 impacts / timeout. Not human-playability or visual acceptance.',12,muted)
im=im.quantize(colors=64,method=Image.Quantize.MEDIANCUT)
im.save(out,optimize=True)
size=os.path.getsize(out)
print(out,size,'bytes; SHA256',hashlib.sha256(open(out,'rb').read()).hexdigest())
