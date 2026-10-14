"""Original deterministic Forge cargo bank: 36 reusable metre-scale assemblies.
Run Blender with --python this_file -- [--only recipe-key] [--render-all].
LOD1/2 use authored coarse circular topology, preserving structural beam sections.
"""
import argparse,json,math,os,sys
import bpy
from mathutils import Vector
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
import forge as F
from asset_bank_export import export_asset,render_glb_preview
ROOT=os.path.abspath(os.path.join(HERE,'../../..'));OUT=os.path.join(ROOT,'assets/models/asset-bank/cargo');LOD=0
PAYLOAD=[('cryogenic-dewar','Vacuum-jacketed dewar with protected neck valve and vent line'),('gas-bottle-cluster','Six pressure bottles retained in a transport rack'),('ore-skip','Open tapered ore skip with lifting trunnions and wear floor'),('bagged-regolith-pallet','Bulged regolith sacks strapped to a forkable pallet'),('machine-tool-skid','Spindle and carriage secured on a machine transport skid'),('inert-reactor-core-cask','Finned inert-core cask with bolted closure'),('habitat-panel-pack','Fragile layered habitat panels in an A-frame'),('biological-containment-cage','Sealed specimen chamber inside a containment cage'),('insulated-medical-carrier','Insulated medical carrier with latches and handles'),('sealed-custody-safe','Armoured custody safe with locking wheel and tamper seal'),('sample-carousel','Radial sample-vial carousel with handling spindle'),('wound-conductor-spool','Wound conductor spool held on a cradle')]
HANDLING=[('twin-tank-cradle','Paired semicircular tank saddles on a common bed'),('v-load-cradle','V-shaped padded cradle for an irregular load'),('hoist-spreader','Spreader beam with central lift eye and end shackles'),('four-point-sling-frame','Perimeter lifting frame with four slings to an apex'),('tether-fairlead','Four-roller fairlead with an open tether throat'),('tow-bridle-yoke','Triangular tow yoke with paired stern pins'),('magnetic-handling-shoe','Segmented magnetic shoe with gimballed head'),('docking-bumper','Resilient docking pads on a rigid mount'),('fork-receiver','Twin hollow fork sleeves with rear crossmember'),('rail-cargo-dolly','Flanged-wheel cargo dolly with corner pads'),('load-restraint-hoop','Hinged restraint hoop with a ratchet latch'),('transit-pressure-cap','Pressure-port transit cover with radial dogs')]
AFTERMATH=[('torn-hull-strip','Jagged torn hull skin exposing stiffening ribs'),('peeled-armor-corner','Armour corner peeled from fractured support plate'),('split-pressure-vessel','Open ruptured vessel half with severed seam'),('fractured-drive-bell','Flared fractured drive bell with a missing sector'),('snapped-truss-node','Broken truss junction with torn chord stubs'),('buckled-solar-wing','Three impact-buckled solar leaves and broken spar'),('severed-umbilical','Bent service umbilical with exposed conductors'),('broken-docking-collar','Incomplete collar arc with contact pads'),('exposed-avionics-tray','Open service tray with circuit modules and severed wiring'),('punctured-cargo-cage','Cargo frame with bent puncture rails'),('scavenged-pipe-bundle','Unequal hollow salvage pipes with retaining straps'),('crumpled-shield-louvre','Kinked heat shield slats and fractured rail')]
RECORDS=[(n,d,'payload')for n,d in PAYLOAD]+[(n,d,'handling')for n,d in HANDLING]+[(n,d,'aftermath')for n,d in AFTERMATH]
def box(s,n,c,size,m='paint',**kw):return F.box(s,n,c,size,material=m,bevel=.025,**kw)
def cyl(s,n,a,b,r,m='gunmetal',r1=None,cap=True):return F.cylinder(s,n,a,b,r,r1=r1,material=m,segments=(20,14,10)[LOD],cap=cap,bevel=.012)
def bar(s,n,a,b,w=.09,m='gunmetal'):return F.beams(s,n,[(a,b)],w,material=m,bevel=.009)
def ring(s,n,c,r=.2,t=.045,axis=(0,0,1),m='gunmetal'):return F.ring(s,n,c,r,t,axis=axis,material=m,segments=(24,16,10)[LOD],sides=(8,6,4)[LOD])
def plate(s,n,pts,z=0,t=.08,m='paint'):return F.plate(s,n,pts,z,t,material=m,side_material='bare',bevel=.015)
def solid(s,c,size):s.solids.append({'center':list(c),'size':list(size)})
def frame(s,x=1.2,y=.75,z=.2,top=None):
 for yy in(-y,y):box(s,'skid',(0,yy,z),(2*x,.14,.2),'gunmetal');solid(s,(0,yy,z),(2*x,.14,.2))
 for xx in(-x,x):
  box(s,'cross-member',(xx,0,z),(.14,2*y,.2),'gunmetal')
  for yy in(-y,y):
   box(s,'cast-corner',(xx,yy,z),(.25,.25,.27),'paint2')
   if LOD<2:cyl(s,'corner-bolt',(xx,yy,z+.13),(xx,yy,z+.175),.04,'bare')
  if top:
   for yy in(-y,y):bar(s,'upright',(xx,yy,z),(xx,yy,top),.11)
 if top:
  for yy in(-y,y):bar(s,'top-rail',(-x,yy,top),(x,yy,top),.1)
  for xx in(-x,x):bar(s,'top-cross',(xx,-y,top),(xx,y,top),.1)
def arc(s,n,r,t,z0,z1,start,end,m='paint',steps=24,flare=0):
 steps=max(6,round(steps*(1,.7,.45)[LOD]));v=[];faces=[];stride=steps+1
 for z in(z0,z1):
  rr=r+(flare if z==z1 else 0)
  for radius in(rr-t,rr):
   for j in range(stride):a=start+(end-start)*j/steps;v.append((radius*math.cos(a),radius*math.sin(a),z))
 for j in range(steps):
  for a,b in((0,1),(1,3),(3,2),(2,0)):faces.append((a*stride+j,a*stride+j+1,b*stride+j+1,b*stride+j))
 faces.extend([(0,stride,3*stride,2*stride),(steps,2*stride-1,4*stride-1,3*stride-1)])
 if n in('bell-shell','fractured-lip'):
  for k,(vx,vy,vz) in enumerate(v):
   j=k%stride
   if k>=2*stride and(j<3 or j>steps-3):
    dz=(.13,-.07,.045)[min(j,steps-j)]
    v[k]=(vx*1.025,vy*1.025,vz+dz)
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],faces);me.update();o=bpy.data.objects.new(n,me);bpy.context.scene.collection.objects.link(o);me.materials.append(s.mat(m));o['forge_bevel']=.01;o['forge_uv_scale']=1.;o['forge_smooth']=35;s.add(o);return o

def build(name,lod=0):
 global LOD
 LOD=lod
 colors={'paint':'#1c5552','paint2':'#262a2f','stripe':'#9c7a2a','bare':'#8f989c','hazard':'#b88a22','ceramic':'#9a9382'}
 if name in {'insulated-medical-carrier','biological-containment-cage','sample-carousel','habitat-panel-pack'}:colors.update(paint='#a69d8a',stripe='#276d76',paint2='#303e45')
 if name in {n for n,_ in AFTERMATH}:colors.update(paint='#4a4438',paint2='#23282e',stripe='#6b5416',bare='#81776a',ceramic='#867b66')
 s=F.Ship('cargo-'+name,colors);s.solids=[];s.bank_source='tools/blender/forge/asset_bank_cargo.py'
 s.socket('SOCKET_Mount',(0,0,0),(0,0,-1))
 if name=='cryogenic-dewar':
  frame(s,.7,.65);cyl(s,'vacuum-vessel',(0,0,.25),(0,0,1.8),.62,'ceramic');cyl(s,'shoulder',(0,0,1.8),(0,0,2),.62,'ceramic',.26);cyl(s,'neck',(0,0,2),(0,0,2.27),.14,'bare');ring(s,'guard',(0,0,2.22),.4,.05)
  for x in(-.35,.35):bar(s,'guard-leg',(x,0,1.77),(x,0,2.22),.06)
  F.sweep(s,'vent-pipe',[(.15,0,2.15),(.42,0,2.15),(.65,0,1.6),(.65,0,.55)],.05,.05,'bare');ring(s,'lower-band',(0,0,.5),.63,.04,m='stripe');solid(s,(0,0,1.15),(1.2,1.2,1.8))
 elif name=='gas-bottle-cluster':
  frame(s,1,.65,top=1.8)
  for x in(-.65,0,.65):
   for y in(-.32,.32):cyl(s,'bottle',(x,y,.3),(x,y,1.5),.25,'paint');cyl(s,'shoulder',(x,y,1.5),(x,y,1.65),.25,'paint',.1);cyl(s,'valve',(x,y,1.65),(x,y,1.85),.07,'stripe');solid(s,(x,y,1),(.5,.5,1.5))
  for z in(.65,1.3):box(s,'retaining-bar',(0,-.6,z),(2.1,.07,.12),'hazard')
 elif name=='ore-skip':
  box(s,'wear-floor',(0,0,.25),(2.3,1.4,.16),'dark')
  for y in(-.85,.85):box(s,'sloped-side',(0,y,.85),(2.6,.14,1.25),'paint',rot=(y*.2,0,0));solid(s,(0,y,.85),(2.6,.2,1.25))
  for x in(-1.25,1.25):box(s,'end-wall',(x,0,.8),(.15,1.75,1.2),'paint');cyl(s,'trunnion',(x,0,1.25),(x*1.16,0,1.25),.13,'bare')
  for x in(-.7,.7):box(s,'wear-rib',(x,0,.37),(.11,1.5,.1),'bare')
  solid(s,(0,0,.25),(2.3,1.4,.16))
 elif name=='bagged-regolith-pallet':
  frame(s)
  for x in(-.75,0,.75):
   for y in(-.38,.38):
    F.loft(s,'soft-sack',[dict(x=x+dx,w=w,ht=h,hb=h-.01,zc=.62,y=y,n=3.2)for dx,w,h in[(-.34,.17,.2),(-.25,.31,.29),(.2,.32,.3),(.32,.18,.2)]],material='ceramic',count=(24,16,12)[LOD],bevel=.01,uv_scale=.15);box(s,'sack-seam',(x,y,.925),(.48,.025,.025),'stripe')
  for x in(-.85,.85):
   box(s,'strap',(x,0,.94),(.06,1.5,.025),'stripe')
   for y in(-.73,.73):box(s,'strap-side',(x,y,.62),(.06,.025,.64),'stripe')
  solid(s,(0,0,.65),(2.2,1.4,.7))
 elif name=='machine-tool-skid':
  frame(s,1.5,.75);box(s,'machine-bed',(0,0,.5),(2.6,1,.45),'paint');box(s,'headstock',(-.8,0,1),(.65,.8,.85),'paint2');cyl(s,'spindle',(-.6,0,1.05),(.2,0,1.05),.25,'bare');cyl(s,'chuck',(.2,0,1.05),(.4,0,1.05),.36);box(s,'tool-carriage',(.65,0,.87),(.6,.8,.2),'stripe')
  for y in(-.38,.38):bar(s,'slide',(-.4,y,.75),(1.2,y,.75),.09,'bare')
  solid(s,(0,0,.7),(2.6,1,1.25))
 elif name=='inert-reactor-core-cask':
  cyl(s,'shield-body',(0,0,.15),(0,0,1.75),.8,'paint2')
  for z in(.25,.5,.75,1,1.25,1.5):ring(s,'cooling-fin',(0,0,z),.81,.065,m='bare')
  cyl(s,'closure',(0,0,1.75),(0,0,1.94),.9,'stripe')
  for i in range(8):a=i*math.tau/8;cyl(s,'lid-bolt',(.72*math.cos(a),.72*math.sin(a),1.92),(.72*math.cos(a),.72*math.sin(a),2.03),.07)
  ring(s,'lift-eye',(0,0,2.12),.19,.05,axis=(1,0,0));solid(s,(0,0,1),(1.6,1.6,1.9))
 elif name=='habitat-panel-pack':
  frame(s,1.5,.85)
  for i in range(5):box(s,'layered-panel',(0,(i-2)*.17,.98),(2.7,.1,1.4),'ceramic',rot=(.15,0,0))
  for x in(-1.2,1.2):bar(s,'A-frame',(x,-.8,.25),(x,0,1.8),.12,'stripe');bar(s,'A-frame',(x,.8,.25),(x,0,1.8),.12,'stripe')
  solid(s,(0,0,1),(2.8,1,1.5))
 elif name=='biological-containment-cage':
  frame(s,.8,.8,top=2);cyl(s,'sealed-specimen-chamber',(0,0,.35),(0,0,1.7),.6,'paint2')
  for z in(.45,1.65):ring(s,'containment-band',(0,0,z),.61,.08,m='stripe')
  box(s,'inspection-port',(0,-.55,1.05),(.74,.22,.74),'gunmetal');box(s,'inspection-window',(0,-.67,1.05),(.65,.025,.65),'glass');box(s,'status-strip',(.6,-.6,1.5),(.08,.05,.25),'glow_green');solid(s,(0,0,1),(1.2,1.2,1.5))
 elif name=='insulated-medical-carrier':
  box(s,'lower-shell',(0,0,.45),(1.7,1,.75),'ceramic');box(s,'seal',(0,0,.85),(1.74,1.04,.08),'dark');box(s,'lid',(0,0,1),(1.75,1.05,.24),'ceramic');box(s,'cross-a',(0,0,1.13),(.6,.18,.035),'stripe')
  for y in(-.195,.195):box(s,'cross-b',(0,y,1.13),(.18,.21,.035),'stripe')
  for x in(-.92,.92):ring(s,'handle',(x,0,.67),.19,.045,axis=(1,0,0))
  for x in(-.5,.5):box(s,'latch',(x,-.54,.85),(.12,.08,.25),'bare')
  solid(s,(0,0,.6),(1.8,1.1,1.1))
 elif name=='sealed-custody-safe':
  box(s,'safe-body',(0,0,.75),(1.5,1.1,1.5),'paint2');box(s,'door',(0,-.6,.75),(1.25,.14,1.25));ring(s,'locking-wheel',(.15,-.72,.8),.28,.05,axis=(0,1,0),m='bare')
  for a in range(3):bar(s,'wheel-spoke',(.15,-.72,.8),(.15+.25*math.cos(a*math.tau/3),-.72,.8+.25*math.sin(a*math.tau/3)),.035,'bare')
  for z in(.35,1.15):box(s,'hinge',(-.62,-.72,z),(.13,.12,.22),'bare')
  box(s,'seal',(.58,-.7,.8),(.1,.04,.25),'stripe');solid(s,(0,0,.75),(1.5,1.3,1.5))
 elif name=='sample-carousel':
  cyl(s,'base',(0,0,.1),(0,0,.28),.95,'paint2');cyl(s,'spindle',(0,0,.28),(0,0,1.1),.13,'bare');ring(s,'upper-holder',(0,0,.8),.66,.06,m='stripe')
  for i in range(8):a=i*math.tau/8;x,y=.65*math.cos(a),.65*math.sin(a);cyl(s,'sample-vial',(x,y,.28),(x,y,.82),.16,'ceramic');cyl(s,'cap',(x,y,.82),(x,y,.92),.18,'stripe')
  ring(s,'lifting-eye',(0,0,1.16),.18,.045,axis=(1,0,0));solid(s,(0,0,.5),(1.9,1.9,1))
 elif name=='wound-conductor-spool':
  frame(s,1,.8);cyl(s,'conductor',(-.65,0,1),(.65,0,1),.57,'stripe')
  for x in(-.75,.75):cyl(s,'spool-flange',(x-.05,0,1),(x+.05,0,1),.82,'paint2');bar(s,'cradle',(x,-.7,.3),(x,0,1),.13);bar(s,'cradle',(x,.7,.3),(x,0,1),.13)
  for i in range((14,8,5)[LOD]):ring(s,'winding',(-.62+i*1.24/((14,8,5)[LOD]-1),0,1),.59,.025,axis=(1,0,0),m='bare')
  solid(s,(0,0,1),(1.7,1.65,1.65))
 elif name=='twin-tank-cradle':
  frame(s,1.35,1)
  for x in(-.9,.9):
   for y in(-.55,.55):
    o=arc(s,'tank-saddle',.5,.12,-.09,.09,-math.pi/2,math.pi/2,'stripe',12);o.rotation_euler[1]=math.pi/2;o.location=(x,y,.85);box(s,'saddle-foot',(x,y,.4),(.25,.9,.4),'paint2');solid(s,(x,y,.4),(.25,.9,.4))
 elif name=='v-load-cradle':
  frame(s,1.3,.95)
  for y in(-.52,.52):box(s,'inclined-pad',(0,y,.65),(2.5,.85,.16),'dark',rot=(math.copysign(.65,y),0,0));solid(s,(0,y,.45),(2.5,.75,.3))
  for x in(-1,1):bar(s,'V-brace',(x,-.95,.25),(x,0,.32),.15,'stripe');bar(s,'V-brace',(x,0,.32),(x,.95,.25),.15,'stripe')
 elif name=='hoist-spreader':
  box(s,'beam',(0,0,.6),(3.6,.36,.42),'stripe');solid(s,(0,0,.6),(3.6,.36,.42));ring(s,'lift-eye',(0,0,1),.26,.07,axis=(0,1,0))
  for x in(-1.6,1.6):ring(s,'shackle',(x,0,.28),.22,.06,axis=(0,1,0));box(s,'reinforcement',(x,0,.6),(.3,.45,.55),'paint2')
 elif name=='four-point-sling-frame':
  frame(s,1.25,.85,z=.3)
  for x in(-1.25,1.25):
   for y in(-.85,.85):bar(s,'sling',(x,y,.3),(0,0,1.8),.065,'bare');ring(s,'corner-eye',(x,y,.15),.15,.04,axis=(1,0,0))
  ring(s,'master-eye',(0,0,1.97),.22,.055,axis=(0,1,0))
 elif name=='tether-fairlead':
  for y in(-.65,.65):cyl(s,'vertical-roller',(0,y,.25),(0,y,1.5),.16,'bare');solid(s,(0,y,.85),(.32,.32,1.25))
  for z in(.3,1.45):cyl(s,'horizontal-roller',(0,-.65,z),(0,.65,z),.16,'stripe');solid(s,(0,0,z),(.32,1.3,.32))
  for y in(-.85,.85):box(s,'mount',(0,y,.1),(.7,.35,.15),'paint2')
  s.socket('SOCKET_Tether',(0,0,.88),(1,0,0))
 elif name=='tow-bridle-yoke':
  for y in(-.85,.85):bar(s,'yoke-arm',(-1,y,.3),(1,0,.3),.24,'stripe');ring(s,'stern-eye',(-1,y,.3),.2,.055)
  bar(s,'cross-brace',(-.8,-.75,.3),(-.8,.75,.3),.14);ring(s,'tow-eye',(1.17,0,.3),.26,.07);solid(s,(0,0,.3),(1.6,.25,.25));s.socket('SOCKET_Tow',(1.4,0,.3),(1,0,0))
 elif name=='magnetic-handling-shoe':
  box(s,'shoe-back',(0,0,.45),(1.7,1,.3),'paint2')
  for x in(-.6,-.2,.2,.6):box(s,'magnet-pole',(x,0,.18),(.28,.9,.24),'bare')
  cyl(s,'gimbal',(-.4,0,.75),(.4,0,.75),.25,'stripe');ring(s,'lift-eye',(0,0,1.08),.24,.065,axis=(0,1,0));solid(s,(0,0,.35),(1.7,1,.6))
 elif name=='docking-bumper':
  box(s,'backplate',(0,0,.12),(2.2,1,.24),'paint2')
  for x in(-.75,0,.75):box(s,'resilient-pad',(x,0,.45),(.6,.85,.5),'dark')
  for x in(-.95,.95):cyl(s,'bolt',(x,0,.23),(x,0,.35),.09,'bare')
  solid(s,(0,0,.35),(2.2,1,.7))
 elif name=='fork-receiver':
  for y in(-.58,.58):
   for z in(.16,.59):box(s,'sleeve-flange',(0,y,z),(2.2,.55,.1),'stripe');solid(s,(0,y,z),(2.2,.55,.1))
   for yy in(y-.23,y+.23):box(s,'sleeve-wall',(0,yy,.37),(2.2,.1,.35),'paint2');solid(s,(0,yy,.37),(2.2,.1,.35))
  bar(s,'rear-cross',(1,-.83,.7),(1,.83,.7),.13);s.socket('SOCKET_Fork_Left',(-1.1,-.58,.37),(-1,0,0));s.socket('SOCKET_Fork_Right',(-1.1,.58,.37),(-1,0,0))
 elif name=='rail-cargo-dolly':
  frame(s,1.3,.75,z=.55)
  for x in(-.85,.85):
   cyl(s,'axle',(x,-1,.3),(x,1,.3),.1,'bare')
   for y in(-.78,.78):cyl(s,'wheel',(x,y-.12,.3),(x,y+.12,.3),.3);cyl(s,'flange',(x,y,.3),(x,y+.06,.3),.35,'bare');box(s,'load-pad',(x,y,.72),(.5,.4,.18),'stripe')
  solid(s,(0,0,.6),(2.6,1.5,.3))
  for x in(-1.5,1.5):ring(s,'coupler',(x,0,.55),.16,.04)
 elif name=='load-restraint-hoop':
  o=arc(s,'hoop',1,.13,-.1,.1,0,math.pi,'stripe',24);o.rotation_euler[0]=math.pi/2;o.location.z=.25
  for x in(-1,1):box(s,'foot',(x,0,.15),(.45,.6,.2),'paint2');solid(s,(x,0,.2),(.4,.6,.3))
  cyl(s,'hinge',(-1,-.22,.32),(-1,.22,.32),.15,'bare');box(s,'ratchet',(1,0,.35),(.23,.35,.4),'bare')
 elif name=='transit-pressure-cap':
  cyl(s,'cap',(0,0,.12),(0,0,.35),.9,'paint');ring(s,'seal',(0,0,.12),.84,.04,m='dark')
  for i in range(6):a=i*math.tau/6;box(s,'radial-dog',(.78*math.cos(a),.78*math.sin(a),.4),(.35,.13,.13),'stripe',rot_z=a)
  for x in(-.4,.4):ring(s,'handle',(x,0,.55),.18,.045,axis=(1,0,0))
  solid(s,(0,0,.25),(1.8,1.8,.35))
 elif name=='torn-hull-strip':
  plate(s,'torn-skin',[(-1.8,-.55),(.9,-.7),(1.6,-.4),(1.25,-.15),(1.8,.02),(1.3,.3),(1.55,.65),(-1.8,.6)],.25,.09)
  for x in(-1.3,-.3,.7):bar(s,'exposed-stiffener',(x,-.55,.18),(x,.6,.18),.14)
  plate(s,'peeled-tip',[(1.1,-.1),(1.7,.03),(1.3,.3)],.35,.06,'bare');solid(s,(-.2,0,.25),(3.2,1.2,.3))
 elif name=='peeled-armor-corner':
  plate(s,'base',[(-1,-.8),(1,-.8),(.6,.1),(.9,.6),(-1,.8)],.1,.12,'paint2');box(s,'attached-armor',(-.45,0,.32),(1,1.45,.2));o=plate(s,'peeled-leaf',[(0,-.7),(.9,-.7),(.7,-.1),(1.1,.3),(.65,.7),(0,.7)],.3,.13);o.rotation_euler[1]=-.7;bar(s,'broken-strut',(-.8,0,.1),(.75,0,.15),.17,'bare');solid(s,(-.5,0,.3),(1,1.5,.6))
 elif name=='split-pressure-vessel':
  o=arc(s,'half-shell',.85,.075,-1.25,1.25,-math.pi/2,math.pi/2,'paint',24);o.rotation_euler=(0,math.pi/2,0);o.location.z=.85
  for x in(-1.1,1.1):o=arc(s,'stiffening-band',.89,.09,-.07,.07,-math.pi/2,math.pi/2,'bare',16);o.rotation_euler=(0,math.pi/2,0);o.location=(x,0,.85)
  for x in(-.8,.1,.7):plate(s,'tear-tab',[(x,-.83),(x+.18,-1),(x+.35,-.83)],.82,.06,'bare')
  solid(s,(0,0,.15),(2.5,1.7,.16))
 elif name=='fractured-drive-bell':
  arc(s,'bell-shell',.38,.09,.15,1.45,.35,5.7,'paint2',24,flare=.65);arc(s,'fractured-lip',1.03,.1,1.38,1.5,.35,5.7,'bare',24);cyl(s,'throat',(0,0,0),(0,0,.25),.42,'dark',cap=False)
  for i in range(7):a=.5+i*.72;bar(s,'cooling-rib',(.4*math.cos(a),.4*math.sin(a),.3),(.95*math.cos(a),.95*math.sin(a),1.35),.06,'bare')
  solid(s,(0,0,.2),(.8,.8,.4))
 elif name=='snapped-truss-node':
  box(s,'node',(0,0,.55),(.45,.45,.45),'paint2')
  for a,length in((0,1.35),(1.57,.8),(3.14,1),(4.71,.65)):
   F.truss(s,'fractured-arm',(0,0,.55),(length*math.cos(a),length*math.sin(a),.55),.35,2,material='gunmetal',chord=.055,web=.028)
   for k in(-1,1):bar(s,'torn-chord',(length*math.cos(a)-k*.175*math.sin(a),length*math.sin(a)+k*.175*math.cos(a),.725),((length+.2)*math.cos(a)-k*.2*math.sin(a),(length+.2)*math.sin(a)+k*.2*math.cos(a),.79),.055,'bare')
  solid(s,(0,0,.55),(.5,.5,.5))
 elif name=='buckled-solar-wing':
  for i,angle in enumerate((-.3,.18,-.55)):
   x=(i-1)*1.15;box(s,'solar-leaf',(x,0,.4+abs(i-1)*.23),(1.08,1.6,.07),'paint2',rot=(0,angle,0))
   for y in(-.82,.82):bar(s,'leaf-rail',(x-.52*math.cos(angle),y,.4+abs(i-1)*.23+.52*math.sin(angle)),(x+.52*math.cos(angle),y,.4+abs(i-1)*.23-.52*math.sin(angle)),.06,'bare')
   for j in range(4):box(s,'cell-strip',(x,(j-1.5)*.36,.49+abs(i-1)*.23),(.92,.3,.015),'glass',rot=(0,angle,0))
  F.sweep(s,'broken-spar',[(-1.8,0,.25),(-.5,0,.25),(.65,0,.45),(1.6,0,.95)],.1,.1,'bare');solid(s,(0,0,.45),(1,1.6,.15))
 elif name=='severed-umbilical':
  hose=[(-1.5,0,.25),(-1,0,.27),(-.4,.12,.3),(.1,.35,.45),(.7,.4,.5)]
  for a,b in zip(hose,hose[1:]):cyl(s,'jacket',a,b,.18,'dark')
  for c in hose[1:-1]:F.sphere(s,'hose-bend',c,.18,material='dark',segments=(16,12,8)[LOD])
  cyl(s,'connector',(-1.65,0,.25),(-1.3,0,.25),.28,'bare')
  for i,m in enumerate(('stripe','bare','paint','ceramic')):F.sweep(s,'exposed-conductor',[(.5,.3+i*.06,.45),(.9,.3+i*.1,.5),(1.4-i*.15,.2+i*.2,.45+i*.1)],.055,.055,m)
  for x in(-1.2,-.85):ring(s,'strain-relief',(x,0,.26),.2,.035,axis=(1,0,0))
  solid(s,(-.7,.08,.3),(1.6,.4,.4))
 elif name=='broken-docking-collar':
  arc(s,'collar',1.2,.2,.15,.45,.2,4.9,'paint',28);arc(s,'seal',1.03,.06,.44,.51,.2,4.9,'dark',28)
  for i in range(7):a=.4+i*.65;x,y=1.1*math.cos(a),1.1*math.sin(a);box(s,'contact-dog',(x,y,.53),(.22,.18,.18),'bare',rot_z=a);solid(s,(x,y,.3),(.25,.25,.3))
  s.socket('SOCKET_DockAxis',(0,0,.3),(0,0,1))
 elif name=='exposed-avionics-tray':
  box(s,'tray-floor',(0,0,.15),(2,1.4,.12),'paint2')
  for y in(-.7,.7):box(s,'tray-side',(0,y,.35),(2,.08,.4),'bare')
  for i in range(4):
   box(s,'board',((i-1.5)*.43,0,.25),(.35,1.1,.05))
   for j in range(3):box(s,'processor',((i-1.5)*.43,(j-1)*.3,.31),(.18,.18,.08),'dark')
   F.sweep(s,'loose-wire',[((i-1.5)*.43,.55,.3),((i-1.5)*.43,.8,.45),((i-1.5)*.5,1,.2)],.025,.025,'stripe')
  solid(s,(0,0,.2),(2,1.4,.2))
 elif name=='punctured-cargo-cage':
  frame(s,1,.7,top=1.6)
  for x in(-.8,-.4,.4,.8):bar(s,'rear-bars',(x,.7,.2),(x,.7,1.6),.045)
  for x in(-.8,.8):bar(s,'front-bars',(x,-.7,.2),(x,-.7,1.6),.045)
  for sign in(-1,1):F.sweep(s,'puncture-curl',[(sign*.3,-.7,.2),(sign*.25,-.7,.7),(sign*.55,-1,1)],.05,.05,'bare')
  for z in(.5,1.2):bar(s,'side-bars',(-1,-.7,z),(-1,.7,z),.045);bar(s,'side-bars',(1,-.7,z),(1,.7,z),.045)
 elif name=='scavenged-pipe-bundle':
  for y,z,length in((-.4,.3,2.7),(0,.3,3),(.4,.3,2.3),(-.2,.66,2.5),(.2,.66,2.8)):
   cyl(s,'hollow-pipe',(-length/2,y,z),(length/2,y,z),.2,'bare',cap=False)
   for x in(-length/2,length/2):ring(s,'cut-edge',(x,y,z),.19,.018,axis=(1,0,0),m='dark')
  for x in(-.8,.8):
   box(s,'strap-top',(x,0,.88),(.09,1.1,.06),'stripe');box(s,'strap-bottom',(x,0,.08),(.09,1.1,.06),'stripe')
   for y in(-.53,.53):box(s,'strap-side',(x,y,.48),(.09,.06,.8),'stripe')
  solid(s,(0,0,.45),(2.5,1.1,.85))
 elif name=='crumpled-shield-louvre':
  for x in(-1.1,1.1):bar(s,'mount-rail',(x,-.9,.15),(x,.9,.15),.13,'paint2')
  for i in range(6):
   y=(i-2.5)*.3;F.sweep(s,'buckled-louvre',[(-1.1,y,.2),(-.4,y,.22),(.1,y,.3+(.2 if i%2 else 0)),(.55,y,.17),(1.1,y,.2)],.24,.045,'ceramic')
  bar(s,'snapped-rail',(-1.1,.9,.15),(-.4,1.05,.25),.1,'bare');solid(s,(0,0,.2),(2.3,1.8,.25))
 else:raise ValueError(name)
 details(s,name)
 from forge_export import ship_bounds
 bpy.context.view_layer.update();lo,hi=ship_bounds(s);s.socket('SOCKET_Grab',((lo.x+hi.x)/2,(lo.y+hi.y)/2,hi.z),(0,0,1));s.socket('SOCKET_Forward',(hi.x,0,(hi.z+lo.z)/2),(1,0,0))
 if lod:
  for o in s.objects:o['forge_bevel']=0.
 else:s.bank_lod_factory=lambda level:build(name,level)
 return s

def details(s,name):
 """Manufactured anatomy, following freight pod castings and dead-hulk fracture layering.
 Deliberately different clinical, industrial and salvage families; no noise texture overlays.
 """
 def dial(c,r=.12):
  x,y,z=c;cyl(s,'gauge-housing',(x,y+.04,z),(x,y-.025,z),r,'gunmetal');cyl(s,'gauge-face',(x,y-.026,z),(x,y-.033,z),r*.8,'ceramic');bar(s,'gauge-needle',(x,y-.04,z),(x+r*.5,y-.04,z+r*.4),.012,'dark')
 def bolts(points):
  if LOD==2:return
  for x,y,z in points:cyl(s,'fastener',(x,y,z),(x,y,z+.035),.035,'bare')
 def pads(points):
  for x,y,z in points:box(s,'mount-pad',(x,y,z),(.24,.24,.07),'paint2');bolts([(x,y,z+.035)])
 if name=='cryogenic-dewar':
  box(s,'instrument-box',(.27,-.54,1.54),(.42,.25,.36),'paint2');dial((.27,-.68,1.57),.13)
  cyl(s,'relief-stem',(0,0,2.22),(0,0,2.38),.075,'bare');ring(s,'valve-wheel',(0,0,2.4),.16,.025,m='stripe')
  for a in range(3):bar(s,'valve-spoke',(0,0,2.4),(.15*math.cos(a*math.tau/3),.15*math.sin(a*math.tau/3),2.4),.025,'stripe')
  for z in(.65,1.2):box(s,'vent-standoff',(.57,0,z),(.22,.1,.1),'paint2')
  for x in(-.38,.38):box(s,'foot-shoe',(x,0,.2),(.17,1.1,.22),'paint2')
 elif name=='gas-bottle-cluster':
  cyl(s,'header',(-.83,0,1.98),(.83,0,1.98),.065,'bare')
  for x in(-.65,0,.65):
   for y in(-.32,.32):F.sweep(s,'bottle-feed',[(x,y,1.82),(x,y,1.98),(x,0,1.98)],.035,.035,'bare')
  dial((.7,-.11,2.02),.1)
  for x in(-.65,0,.65):box(s,'strap-anchor',(x,-.64,.65),(.18,.13,.2),'paint2')
 elif name=='ore-skip':
  for y in(-.95,.95):
   for x in(-.85,0,.85):bar(s,'welded-stiffener',(x,y,.3),(x,y,1.3),.065,'paint2')
  for x in(-1.22,1.22):
   for y in(-.45,.45):plate(s,'trunnion-gusset',[(x-.12,y-.12),(x+.12,y-.12),(x,y+.15)],1.2,.1,'stripe')
  bolts([(x,y,.39)for x in(-.85,.85)for y in(-.4,.4)])
 elif name=='bagged-regolith-pallet':
  for x in(-.95,-.48,0,.48,.95):box(s,'pallet-deck',(x,0,.3),(.32,1.5,.08),'paint2')
  for x in(-.75,0,.75):
   for y in(-.38,.38):F.sweep(s,'gathered-seam',[(x-.24,y-.13,.87),(x-.24,y,.96),(x-.24,y+.13,.87)],.025,.025,'stripe')
  for x in(-.85,.85):box(s,'strap-buckle',(x,-.72,.72),(.12,.07,.16),'bare')
 elif name=='machine-tool-skid':
  cyl(s,'lead-screw',(-.4,-.48,.62),(1.2,-.48,.62),.055,'bare');box(s,'feed-motor',(1.1,-.4,.5),(.36,.42,.32),'paint2')
  box(s,'belt-guard',(-.9,.48,1),(.55,.16,.68),'paint2')
  for z in(.79,.91,1.03,1.15):box(s,'motor-vent',(-.9,.57,z),(.35,.02,.035),'dark')
  ring(s,'carriage-wheel',(.75,-.59,.64),.16,.03,axis=(0,1,0),m='stripe');F.sweep(s,'power-cable',[(-.8,.5,.6),(-.8,.62,.4),(.8,.62,.4)],.045,.045,'dark')
  bolts([(x,y,.76)for x in(-1.05,1.05)for y in(-.32,.32)])
 elif name=='inert-reactor-core-cask':
  ring(s,'lid-shadow',(0,0,1.94),.58,.035,m='dark');cyl(s,'shield-insert',(0,0,1.95),(0,0,2.01),.48,'paint2')
  for a in range(4):
   t=a*math.tau/4;x,y=.7*math.cos(t),.7*math.sin(t);box(s,'locking-dog',(x,y,1.82),(.34,.17,.16),'gunmetal',rot_z=t)
  for y in(-.83,.83):box(s,'impact-rail',(0,y,.9),(.25,.1,1.4),'paint2')
 elif name=='habitat-panel-pack':
  for x in(-1.3,1.3):
   for y in(-.39,.39):box(s,'corner-protector',(x,y,1.56),(.26,.2,.26),'paint2')
   box(s,'ratchet-strap',(x,0,1.7),(.12,.9,.06),'stripe')
  for x in(-1.2,1.2):box(s,'ratchet-catch',(x,-.68,.56),(.22,.17,.28),'gunmetal')
 elif name=='biological-containment-cage':
  box(s,'filter-housing',(0,.63,.95),(.7,.33,.55),'ceramic')
  for x in(-.24,-.12,0,.12,.24):box(s,'filter-vent',(x,.806,.95),(.045,.025,.38),'dark')
  cyl(s,'service-line',(.52,0,.5),(.52,0,1.58),.05,'bare');dial((-.32,-.69,1.62),.08)
  for x in(-.8,.8):
   for y in(-.8,.8):box(s,'isolation-mount',(x,y,.31),(.22,.22,.22),'dark')
  bolts([(x,-.7,z)for x in(-.32,.32)for z in(.72,1.38)])
 elif name=='insulated-medical-carrier':
  for x in(-.6,.6):box(s,'foot',(x,0,.035),(.23,.85,.1),'paint2');box(s,'hinge',(x,.55,.85),(.25,.14,.2),'bare')
  box(s,'display-bezel',(.45,-.55,.6),(.4,.07,.2),'paint2');box(s,'cold-status',(.45,-.59,.6),(.29,.025,.09),'glow_cyan')
  for x in(-.92,.92):box(s,'handle-mount',(x,0,.65),(.12,.46,.13),'paint2')
 elif name=='sealed-custody-safe':
  for x in(-.7,.7):box(s,'door-coaming',(x,-.625,.75),(.09,.08,1.4),'dark')
  for z in(.07,1.43):box(s,'door-coaming',(0,-.625,z),(1.4,.08,.09),'dark')
  box(s,'keypad',(-.38,-.7,.78),(.2,.08,.34),'paint2')
  if LOD<2:
   for z in(.68,.76,.84):
    for x in(-.43,-.34):box(s,'key',(x,-.747,z),(.05,.018,.045),'ceramic')
  for x in(-.55,.55):box(s,'safe-foot',(x,0,-.04),(.22,.95,.12),'dark')
 elif name=='sample-carousel':
  for i in range(8):
   a=i*math.tau/8;x,y=.65*math.cos(a),.65*math.sin(a);bar(s,'carousel-spoke',(0,0,.34),(x,y,.34),.065,'bare');ring(s,'vial-neck',(x,y,.78),.16,.025,m='gunmetal')
  cyl(s,'hub-lock',(0,0,.82),(0,0,.97),.24,'stripe');bolts([(.8*math.cos(a*math.tau/8),.8*math.sin(a*math.tau/8),.3)for a in range(8)])
 elif name=='wound-conductor-spool':
  cyl(s,'axle',(-.99,0,1),(.99,0,1),.13,'bare')
  for x in(-.82,.82):
   ring(s,'hub-bearing',(x,0,1),.23,.06,axis=(1,0,0),m='stripe')
   for i in range(6):a=i*math.tau/6;bar(s,'flange-rib',(x,.24*math.cos(a),1+.24*math.sin(a)),(x,.7*math.cos(a),1+.7*math.sin(a)),.045,'bare')
 elif name=='twin-tank-cradle':
  for x in(-.9,.9):
   for y in(-.55,.55):
    box(s,'saddle-fastener-pad',(x,y,.23),(.4,.35,.08),'bare');bolts([(x,y-.12,.28),(x,y+.12,.28)])
  for y in(-1,1):bar(s,'bed-diagonal',(-1.2,y,.28),(1.2,-y,.28),.075,'paint2')
 elif name=='v-load-cradle':
  for x in(-1,.0,1):
   for y in(-.52,.52):box(s,'replaceable-pad',(x,y,.75),(.55,.6,.07),'paint2',rot=(math.copysign(.65,y),0,0))
  for x in(-1.2,1.2):ring(s,'tie-eye',(x,0,.38),.16,.04,axis=(1,0,0),m='stripe')
 elif name=='hoist-spreader':
  for x in(-1.4,0,1.4):box(s,'web-doubler',(x,-.2,.6),(.2,.06,.35),'paint2')
  for x in(-1.6,1.6):cyl(s,'shackle-pin',(x,-.28,.39),(x,.28,.39),.065,'bare')
  bolts([(x,y,.83)for x in(-1.4,1.4)for y in(-.1,.1)])
 elif name=='four-point-sling-frame':
  for x in(-1.25,1.25):
   for y in(-.85,.85):cyl(s,'sling-clevis',(x,y,.28),(x*.87,y*.87,.52),.095,'stripe')
  cyl(s,'master-ferrule',(0,0,1.66),(0,0,1.84),.13,'gunmetal')
 elif name=='tether-fairlead':
  for y in(-.65,.65):
   for z in(.2,1.55):box(s,'roller-bearing',(0,y,z),(.38,.35,.14),'paint2')
  for y in(-.85,.85):bolts([(-.23,y,.2),(.23,y,.2)])
 elif name=='tow-bridle-yoke':
  plate(s,'apex-gusset',[(.42,-.29),(1.16,0),(.42,.29)],.43,.07,'paint2')
  for y in(-.85,.85):cyl(s,'tow-pin',(-1,y,.15),(-1,y,.49),.08,'bare')
  bolts([(.55,-.13,.5),(.55,.13,.5)])
 elif name=='magnetic-handling-shoe':
  for y in(-.46,.46):box(s,'contact-guard',(0,y,.3),(1.8,.09,.24),'stripe')
  for x in(-.58,.58):box(s,'coil-housing',(x,0,.65),(.3,.66,.2),'paint')
  F.sweep(s,'coil-feed',[(-.5,.35,.6),(0,.44,.64),(.5,.35,.6)],.055,.055,'dark');bolts([(x,y,.61)for x in(-.72,.72)for y in(-.3,.3)])
 elif name=='docking-bumper':
  for x in(-.75,0,.75):
   for z in(.36,.47,.58):box(s,'compression-slot',(x,-.434,z),(.45,.018,.035),'paint2')
  for x in(-1,1):
   for y in(-.38,.38):cyl(s,'mount-bolt',(x,y,.22),(x,y,.3),.06,'bare')
 elif name=='fork-receiver':
  for y in(-.58,.58):
   for x in(-1.08,1.08):
    for z in(.15,.6):box(s,'entry-wear-lip',(x,y,z),(.14,.6,.12),'bare')
  bolts([(1,y,.79)for y in(-.65,.65)])
 elif name=='rail-cargo-dolly':
  for x in(-.85,.85):
   for y in(-.68,.68):box(s,'axle-bearing',(x,y,.48),(.36,.22,.28),'paint2')
  box(s,'brake-box',(.0,.7,.45),(.4,.28,.35),'paint');bar(s,'brake-lever',(0,.7,.65),(.35,.7,1),.045,'stripe');bar(s,'underdeck-brace',(-1.1,-.6,.6),(1.1,.6,.6),.09)
 elif name=='load-restraint-hoop':
  o=arc(s,'inner-cushion',.88,.06,-.08,.08,.1,math.pi-.1,'dark',20);o.rotation_euler[0]=math.pi/2;o.location.z=.25
  for x in(-1,1):bolts([(x,-.2,.27),(x,.2,.27)])
  bar(s,'ratchet-handle',(1,0,.49),(1.25,0,.75),.065,'stripe')
 elif name=='transit-pressure-cap':
  cyl(s,'recessed-centre',(0,0,.35),(0,0,.385),.55,'paint2');ring(s,'cover-bead',(0,0,.39),.6,.025,m='bare')
  for i in range(6):a=i*math.tau/6;bolts([(.78*math.cos(a),.78*math.sin(a),.5)])
 elif name=='torn-hull-strip':
  plate(s,'insulation-exposure',[(-1.6,-.45),(.6,-.5),(1.3,-.18),(.7,.35),(-1.6,.48)],.14,.055,'ceramic')
  F.sweep(s,'severed-service-line',[(-1.6,.37,.1),(-.4,.37,.1),(.5,.45,.13),(1,.62,.3)],.055,.055,'bare')
  bolts([(x,y,.36)for x in(-1.25,-.25)for y in(-.45,.48)])
 elif name=='peeled-armor-corner':
  plate(s,'insulation-sheet',[(-.3,-.65),(.7,-.55),(.42,.05),(.6,.35),(-.3,.6)],.25,.04,'ceramic')
  for y in(-.5,0,.5):bar(s,'ripped-stud',(.1,y,.22),(.28,y,.52),.045,'bare')
  bolts([(-.75,-.55,.45),(-.75,.55,.45)])
 elif name=='split-pressure-vessel':
  for x in(-.9,0,.8):
   bar(s,'seam-stud',(x,-.8,.82),(x,-.98,.86),.04,'bare')
  F.sweep(s,'broken-sensor-line',[(-1.1,.5,.18),(-.4,.5,.18),(.2,.4,.36)],.035,.035,'stripe')
 elif name=='fractured-drive-bell':
  ring(s,'feed-manifold',(0,0,.3),.48,.05,m='bare')
  for a in(.6,2.1,3.6,5.1):
   cyl(s,'injector',(.24*math.cos(a),.24*math.sin(a),.15),(.24*math.cos(a),.24*math.sin(a),.45),.055,'bare')
  plate(s,'torn-lip',[(.85,-.16),(1.15,-.28),(1.0,.08)],1.4,.06,'bare')
 elif name=='snapped-truss-node':
  for x in(-.24,.24):box(s,'node-gusset',(x,0,.55),(.05,.6,.55),'stripe')
  bolts([(x,y,.84)for x in(-.18,.18)for y in(-.18,.18)])
  F.sweep(s,'dangling-harness',[(-.2,.2,.7),(-.7,.35,.62),(-.82,.52,.2)],.045,.045,'dark')
 elif name=='buckled-solar-wing':
  for x in(-.57,.57):cyl(s,'hinge-barrel',(x,-.65,.4),(x,.65,.4),.055,'bare')
  F.sweep(s,'torn-bus-cable',[(-1.3,.72,.5),(-.4,.72,.4),(.25,.9,.7),(.65,1,.8)],.035,.035,'stripe')
 elif name=='severed-umbilical':
  for a in range(4):
   t=a*math.tau/4;cyl(s,'connector-pin',(-1.76,.13*math.cos(t),.25+.13*math.sin(t)),(-1.61,.13*math.cos(t),.25+.13*math.sin(t)),.027,'stripe')
  for x in(-1.05,-.62):ring(s,'jacket-retainer',(x,.02,.28),.205,.022,axis=(1,0,0),m='paint2')
 elif name=='broken-docking-collar':
  for i in range(8):
   a=.3+i*.57;x,y=1.13*math.cos(a),1.13*math.sin(a);cyl(s,'bolt-socket',(x,y,.44),(x,y,.5),.06,'dark')
  F.sweep(s,'seal-peel',[(-.85,-.6,.5),(-.72,-.85,.55),(-.45,-1,.7)],.055,.055,'dark')
 elif name=='exposed-avionics-tray':
  for x in(-.78,.78):box(s,'tray-latch',(x,-.76,.35),(.15,.2,.25),'stripe')
  for i in range(4):
   x=(i-1.5)*.43;box(s,'board-connector',(x,-.5,.32),(.24,.14,.13),'bare')
   for j in range(3):bar(s,'cooling-fin',(x-.07,(j-1)*.3,.37),(x+.07,(j-1)*.3,.37),.025,'bare')
  bolts([(x,y,.24)for x in(-.9,.9)for y in(-.6,.6)])
 elif name=='punctured-cargo-cage':
  for z in(.45,.9,1.35):bar(s,'rear-mesh',(-.85,.7,z),(.85,.7,z),.025,'bare')
  plate(s,'torn-panel',[(-.8,-.71),(-.3,-.71),(-.45,-.98),(-.7,-1.05)],.25,.045,'paint')
  for x in(-1,1):ring(s,'cargo-eye',(x,0,1.6),.14,.035,m='stripe')
 elif name=='scavenged-pipe-bundle':
  for x in(-.8,.8):box(s,'strap-clamp',(x,-.57,.48),(.22,.15,.25),'gunmetal');bolts([(x,-.57,.63)])
  ring(s,'old-pipe-flange',(-1.4,0,.3),.27,.045,axis=(1,0,0),m='paint2')
 elif name=='crumpled-shield-louvre':
  for y in(-.72,-.12,.48):bar(s,'broken-hinge',(-1.25,y,.15),(-.98,y,.15),.045,'bare')
  plate(s,'missing-corner',[(-1.1,.55),(-.7,.62),(-.86,1.1),(-1.1,.95)],.1,.045,'paint2')
  bolts([(1.1,y,.23)for y in(-.7,0,.7)])

def main():
 p=argparse.ArgumentParser();p.add_argument('--only');p.add_argument('--render-all',action='store_true');p.add_argument('--render',action='store_true');p.add_argument('--render-lod2',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
 from asset_bank_contract import select_asset_ids
 selected=set(select_asset_ids([name for name,_,_ in RECORDS],args.only))
 preview_first=['cryogenic-dewar','insulated-medical-carrier','machine-tool-skid','tether-fairlead','fractured-drive-bell','exposed-avionics-tray']
 ordered=sorted(RECORDS,key=lambda r:preview_first.index(r[0])if r[0]in preview_first else len(preview_first)+RECORDS.index(r))if args.render_all else RECORDS
 for index,(name,description,kind)in enumerate(ordered):
  if name not in selected:continue
  F.reset_scene();s=build(name);aid='cargo-'+name
  export_asset(s,OUT,aid,'cargo',description,collision_boxes=s.solids,tags=[kind,'reusable','industrial','forge'])
  if args.render_all or args.render and(index in(0,12,24)or args.only):
   folder=os.path.join(ROOT,'.devshots/asset-bank/cargo');os.makedirs(folder,exist_ok=True);render_glb_preview(os.path.join(OUT,aid+'_lod0.glb'),os.path.join(folder,aid+'-preview.png'),width=700,height=550,samples=32)
  if args.render_lod2:
   folder=os.path.join(ROOT,'.devshots/asset-bank/cargo');os.makedirs(folder,exist_ok=True);render_glb_preview(os.path.join(OUT,aid+'_lod2.glb'),os.path.join(folder,aid+'-lod2.png'),width=700,height=550,samples=32)
  print('CARGO_EXPORTED '+name,flush=True)
 if all(os.path.exists(os.path.join(OUT,'cargo-'+n+'.json'))for n,_,_ in RECORDS):
  assets=[]
  for n,_,_ in RECORDS:
   with open(os.path.join(OUT,'cargo-'+n+'.json'))as f:d=json.load(f)
   d.update(recipe='tools/blender/forge/asset_bank_cargo.py',recipeKey=n);assets.append(d)
  dst=os.path.join(ROOT,'design/asset-bank/cargo.json');os.makedirs(os.path.dirname(dst),exist_ok=True)
  with open(dst,'w')as f:json.dump({'schemaVersion':1,'category':'cargo','assetCount':len(assets),'provenance':'Original deterministic Forge geometry; no external media','styleReferences':['tools/blender/forge/ships/place_cargo_pod_standard.py','tools/blender/forge/ships/place_dead_hulk.py'],'designLanguage':{'industrial':'Freight teal, charcoal castings, ochre load hardware and exposed machined interfaces','civil':'Ivory insulation, teal identification, dark protected instruments','salvage':'Faded skins, exposed bare edges, missing members and interrupted service paths'},'reviewRenderer':'Blender Cycles CPU exact GLB reimport; not gameplay material proof','assets':assets},f,indent=2);f.write('\n')
if __name__=='__main__':main()
