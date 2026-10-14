"""Operations bank, reconstructed after ephemeral executor loss and quality-revised.
36 reusable components, metre scale +X forward/+Y port/+Z up. Canonical Forge
finishes only. Source references: Forge Helios Lark rounded civilian housings,
Ashline Rig load-bearing frames and protected machinery, LOOK Neon Industrial.
No live-game integration or performance acceptance is implied.
Run Blender with --python this_file; optional -- asset_name...; -- --review
renders six representative exported GLBs (not the source scene).
"""
import math, os, sys, json, hashlib
from pathlib import Path
sys.path.insert(0,os.path.dirname(__file__))
import bpy
import forge as F
from asset_bank_export import export_asset
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'assets/models/asset-bank/operations'
GROUPS={
'power':['rectangular_solar_wing','radial_solar_petal','solar_hinge_mast_adapter','battery_cassette','capacitor_drum','transformer_skid','switchyard_busbar','distribution_cabinet','induction_coil','reactor_containment_shell','coolant_fin_cassette','power_junction_saddle'],
'mechanisms':['sliding_bulkhead_leaf','bulkhead_guide_rail','hinged_vent_vane','piston_ram','paired_capture_jaws','rail_carriage','launch_sled','ejector_stop','cargo_turntable','retractable_bollard','clamp_shoe','gantry_swivel_pedestal'],
'service':['narrowband_antenna_blade','phased_array_tile','optical_rangefinder','docking_light_bar','status_signal_housing','exclusion_baffle','sensor_iris','camera_pod','fire_suppression_head','robotic_tool_changer','hose_caddy','repair_tool_tray']}
PALETTES={
'power':{'paint':'#8c743e','paint2':'#263743','stripe':'#d39628'},
'mechanisms':{'paint':'#833f25','paint2':'#242c33','stripe':'#d9a134'},
'service':{'paint':'#a69e8c','paint2':'#1c686b','stripe':'#167b82'}}
HEROES=['battery_cassette','distribution_cabinet','piston_ram','paired_capture_jaws','camera_pod','hose_caddy']
class Kit:
 def __init__(self,name,group):
  self.s=F.Ship('ops_'+name,{**PALETTES[group],'ceramic.solar':'#122a43'});self.s.bank_source='tools/blender/forge/asset_bank_operations.py';self.s.bank_socket_groups={};self.cols=[];self.moves=[];self.s.socket('mount',(0,0,0),(0,0,-1))
 def b(self,n,p,d,m='paint',col=True,detail=0,rz=0):
  self.s.detail=detail;o=F.box(self.s,n,p,d,m,bevel=min(d)*.14,rot_z=rz);self.s.detail=0
  if col and not rz:self.cols.append({'center':list(p),'size':list(d)})
  return o
 def c(self,n,p,q,r,m='gunmetal',r1=None,detail=0):
  self.s.detail=detail;o=F.cylinder(self.s,n,p,q,r,r1=r1,material=m,segments=28,bevel=.012);self.s.detail=0
  l=math.dist(p,q);rr=max(r,r if r1 is None else r1);self.cols.append({'center':[(p[i]+q[i])/2 for i in range(3)],'size':[abs(q[i]-p[i])+2*rr*math.sqrt(max(0,1-((q[i]-p[i])/l)**2)) for i in range(3)]});return o
 def ring(self,n,p,r,t=.055,axis=(0,0,1),m='bare'):
  return F.ring(self.s,n,p,r,t,axis=axis,material=m,segments=28,sides=8)
 def foot(self,x=1.8,y=1.3):
  self.b('base_casting',(0,0,.12),(x,y,.24),'gunmetal')
  for xx in (-.38*x,.38*x):
   for yy in (-.35*y,.35*y):self.bolt((xx,yy,.24))
 def bolt(self,p,r=.055):
  x,y,z=p;self.c('bolt_washer',(x,y,z),(x,y,z+.025),r*1.4,'dark',detail=2);self.c('captive_fastener',(x,y,z+.025),(x,y,z+.065),r,'bare',detail=2)
 def sock(self,n,p,f=(1,0,0),group=None):
  self.s.socket(n,p,f)
  if group:self.s.bank_socket_groups[n]=group
 def move(self,n,p,obs,axis=(0,0,1),kind='rotate',limits=(-90,90)):
  self.s.motion_group(n,p,obs);self.moves.append({'id':n,'pivotBlender':p,'axisBlender':axis,'kind':kind,'range':sorted(limits),'unit':'degrees' if kind=='rotate' else 'metres','binding':'rigid node only; consumer animation required'})
 def ribs(self,n,p,d,count=6,step=.22,m='bare',axis=0):
  for i in range(count):
   q=list(p);q[axis]+=(i-(count-1)/2)*step;self.b(n+str(i),q,d,m,False,1)
 def hatch(self,n,p,d,m='paint'):
  x,y,z=p;dx,dy=d
  self.b(n+'_gasket',(x,y,z),(dx,dy,.055),'dark',False)
  self.b(n+'_lid',(x,y,z+.035),(dx-.1,dy-.1,.055),m,False)
  for xx in (-1,1):
   for yy in (-1,1):self.bolt((x+xx*(dx/2-.1),y+yy*(dy/2-.1),z+.065),.032)
 def conduit(self,n,pts,r=.045,m='bare'):
  for p,q in zip(pts,pts[1:]):self.c(n,p,q,r,m,detail=1)

def build(name,group):
 k=Kit(name,group);s=k.s;b=k.b;c=k.c
 if name=='rectangular_solar_wing':
  b('hinge_spine',(0,0,.2),(4.8,.24,.3),'gunmetal')
  for y in (-.72,.72):
   b('wing_frame',(0,y,.24),(4.8,1.12,.16),'paint2')
   for x in range(6):
    b('cell',((x-2.5)*.74,y,.34),(.67,.98,.045),'ceramic.solar',False)
    for j in (-.24,0,.24):b('collector_bus',((x-2.5)*.74,y+j,.367),(.62,.012,.012),'bare',False,2)
  c('hinge_axle',(0,-.24,.15),(0,.24,.15),.22,'bare');k.sock('hinge',(0,0,.15),(0,1,0))
 elif name=='radial_solar_petal':
  F.plate(s,'petal_rim',[(-.5,-.32),(2.8,-1),(3.7,-.6),(3.7,.6),(2.8,1),(-.5,.32)],.12,.18,'paint2',chamfer=.06)
  F.plate(s,'collector',[(-.2,-.23),(2.7,-.82),(3.45,-.49),(3.45,.49),(2.7,.82),(-.2,.23)],.31,.04,'ceramic.solar')
  for x in (.5,1.2,1.9,2.6,3.2):b('cell_bus',(x,0,.365),(.035,1.1 if x>3 else .4+.4*x,.03),'bare',False,1)
  b('root_mount',(-.4,0,.1),(.6,.7,.2),'gunmetal');k.sock('root',(-.65,0,.1),(-1,0,0));k.cols.append({'center':[1.7,0,.22],'size':[4,2,.28]})
 elif name=='solar_hinge_mast_adapter':
  k.foot();c('mast',(0,0,.24),(0,0,1.25),.24)
  for y in (-.45,.45):b('clevis_cheek',(0,y,1.15),(.75,.18,.8));k.bolt((0,y,1.55))
  axle=c('rotary_axle',(0,-.62,1.4),(0,.62,1.4),.22,'bare');k.move('solar_hinge',(0,0,1.4),[axle],axis=(0,1,0));k.sock('wing',(0,0,1.4),group='solar_hinge')
 elif name=='battery_cassette':
  b('cell_vault',(0,0,.62),(2.4,1.2,1.24),'paint2')
  for x in (-.75,0,.75):k.hatch('cell_lid',(x,0,1.235),(.66,1.12))
  for y in (-.48,.48):
   b('recessed_handle_well',(1.21,y,.78),(.08,.26,.64),'dark');b('pull_handle',(1.28,y,.8),(.2,.10,.45),'bare')
  for y in (-.3,.3):c('power_terminal',(-1.38,y,.6),(-1.2,y,.6),.13,'ceramic')
  b('charge_indicator',(.7,-.61,.9),(.6,.035,.055),'glow_green',False,1);k.sock('power',(-1.4,0,.6),(-1,0,0))
 elif name=='capacitor_drum':
  k.foot();c('can',(0,0,.24),(0,0,1.9),.62,'paint2')
  for z in (.35,1.6):k.ring('retaining_band',(0,0,z),.64,.07)
  for x in (-.3,.3):c('insulator',(x,0,1.9),(x,0,2.2),.14,'ceramic');c('terminal',(x,0,2.2),(x,0,2.35),.07,'bare')
  k.sock('bus',(0,0,2.3),(0,0,1))
 elif name=='transformer_skid':
  for y in (-.65,.65):b('skid',(0,y,.15),(2.8,.2,.3),'gunmetal')
  b('core',(0,0,1),(1.5,1.2,1.4),'paint2');k.hatch('service',(0,0,1.71),(1.3,1))
  for y in (-.76,.76):k.ribs('cooling_leaf',(0,y,1),(.1,.32,1.2),7)
  for x in (-.5,.5):c('bushing',(x,0,1.7),(x,0,2.1),.18,'ceramic');c('contact',(x,0,2.1),(x,0,2.25),.08,'bare')
  k.sock('input',(-.5,0,2.25),(0,0,1));k.sock('output',(.5,0,2.25),(0,0,1))
 elif name=='switchyard_busbar':
  for x in (-1.5,0,1.5):
   b('bus_mount',(x,0,.1),(.5,1.2,.2),'gunmetal')
   for y in (-.4,0,.4):c('standoff',(x,y,.2),(x,y,.8),.12,'ceramic')
  for y in (-.4,0,.4):b('bus',(0,y,.86),(3.8,.16,.12),'bare')
  k.sock('input',(-1.9,0,.86),(-1,0,0));k.sock('output',(1.9,0,.86))
 elif name=='distribution_cabinet':
  k.foot(1.4,1.2);b('cabinet',(0,0,1.2),(1.2,1,1.9),'paint2')
  start=len(s.objects);b('door_gasket',(.612,0,1.2),(.03,.95,1.81),'dark');b('door_shell',(.64,0,1.2),(.1,.9,1.75));b('latch',(.73,-.27,1.1),(.12,.08,.42),'bare');b('signal',(.7,0,1.8),(.03,.4,.07),'glow_green',False,1)
  k.move('service_door',(.64,.45,1.2),s.objects[start:],limits=(0,110));k.sock('cable',(0,0,.05),(0,0,-1))
 elif name=='induction_coil':
  for x in (-.8,.8):b('saddle',(x,0,.25),(.25,1.35,.5),'paint2')
  for x in range(9):k.ring('coil_turn',((x-4)*.2,0,.85),.63,.075,(1,0,0))
  for y in (-.52,.52):b('tie_rod',(0,y,.4),(2,.1,.1),'ceramic')
  k.cols += [{'center':[0,0,1.45],'size':[1.9,1.3,.22]},{'center':[0,.6,.9],'size':[1.9,.2,1.2]},{'center':[0,-.6,.9],'size':[1.9,.2,1.2]}];k.sock('field_axis',(1,0,.85))
 elif name=='reactor_containment_shell':
  F.annulus(s,'containment_wall',(0,0,0),.85,1.12,.2,1.8,'paint2',segments=32)
  for z in (.28,1.85):k.ring('reinforcement',(0,0,z),1.12,.1)
  for i in range(8):
   t=i*math.tau/8;b('shield_rib',(1.1*math.cos(t),1.1*math.sin(t),1.1),(.2,.2,1.8));k.cols.append({'center':[math.cos(t),math.sin(t),1.1],'size':[.55,.55,1.8]})
  k.sock('core',(0,0,.2),(0,0,1))
 elif name=='coolant_fin_cassette':
  for y in (-.68,.68):b('header',(0,y,.22),(2.6,.22,.35),'paint2')
  for x in range(11):b('cooling_fin',((x-5)*.23,0,.7),(.075,1.3,1.1),'bare',True,1 if x%2 else 0)
  for x in (-1.2,1.2):c('coolant_port',(x,-.92,.22),(x,-.68,.22),.12);k.sock('inlet' if x<0 else 'outlet',(x,-.92,.22),(0,-1,0))
 elif name=='power_junction_saddle':
  k.foot(1.8,1.6);b('junction',(0,0,.55),(1,1,.6),'paint2');k.hatch('cover',(0,0,.88),(1.1,1.1))
  for x,y in ((1,0),(-1,0),(0,1),(0,-1)):c('gland',(.48*x,.48*y,.55),(.88*x,.88*y,.55),.2,'ceramic');k.sock('cable_%s_%s'%(x,y),(.88*x,.88*y,.55),(x,y,0))
 elif name=='sliding_bulkhead_leaf':
  b('leaf',(0,0,1.6),(.3,2.6,3.2),'paint2');b('raised_panel',(.2,0,1.65),(.13,2.2,2.5))
  for y in (-1.23,1.23):b('seal',(0,y,1.6),(.38,.14,3.2),'dark')
  b('hazard_band',(.28,0,1.2),(.035,2.2,.18),'hazard',False);k.move('bulkhead_slide',(0,0,0),list(s.objects),(0,1,0),'translate',(0,2.8));k.sock('carriage',(0,0,3.2),(0,0,1),'bulkhead_slide')
 elif name=='bulkhead_guide_rail':
  for y in (-.24,.24):b('channel_lip',(0,y,.3),(4,.14,.6),'gunmetal')
  b('rail_back',(0,0,.075),(4,.6,.15),'paint2')
  for x in (-1.6,0,1.6):b('anchor',(x,0,-.08),(.35,.9,.18));k.bolt((x,.36,.02))
  k.sock('start',(-2,0,.3),(-1,0,0));k.sock('end',(2,0,.3))
 elif name=='hinged_vent_vane':
  for y in (-.74,.74):b('bearing_bracket',(0,y,.24),(.5,.18,.48),'gunmetal')
  start=len(s.objects);b('vane',(0,0,.42),(1.55,1.3,.12),'paint2');c('axle',(0,-.84,.42),(0,.84,.42),.1,'bare');b('leading_edge',(.72,0,.45),(.12,1.3,.14),'stripe');k.move('vane_pitch',(0,0,.42),s.objects[start:],(0,1,0),limits=(-70,70))
 elif name=='piston_ram':
  c('pressure_barrel',(-1.3,0,.4),(.35,0,.4),.32,'paint2');c('gland',(.25,0,.4),(.5,0,.4),.38)
  start=len(s.objects);c('ram_rod',(.45,0,.4),(1.65,0,.4),.14,'bare');c('rod_eye',(1.65,-.23,.4),(1.65,.23,.4),.24);k.move('ram_extension',(.45,0,.4),s.objects[start:],(1,0,0),'translate',(0,1));k.sock('fixed',(-1.3,0,.4),(-1,0,0));k.sock('rod',(1.65,0,.4),group='ram_extension')
 elif name=='paired_capture_jaws':
  b('crosshead',(-.8,0,.3),(.5,2.4,.6),'paint2')
  for sign in (-1,1):
   start=len(s.objects);b('jaw_arm',(0,sign*.95,.4),(1.8,.3,.5));b('jaw_hook',(.78,sign*.7,.4),(.3,.8,.5),'gunmetal');b('contact_pad',(.62,sign*.5,.4),(.18,.3,.34),'hazard');k.move('jaw_port' if sign>0 else 'jaw_starboard',(-.8,sign*.95,.4),s.objects[start:],limits=(0,35*sign))
  k.sock('capture',(.7,0,.4));k.sock('actuator',(-1.05,0,.3),(-1,0,0))
 elif name=='rail_carriage':
  b('carriage',(0,0,.4),(1.7,1.2,.35),'paint2');b('deck',(0,0,.68),(1.5,1,.2))
  for x in (-.6,.6):
   for y in (-.65,.65):c('roller',(x,y-.1,.25),(x,y+.1,.25),.24,'bare')
  k.move('carriage_translation',(0,0,.3),list(s.objects),(1,0,0),'translate',(-5,5));k.sock('payload',(0,0,.78),(0,0,1),'carriage_translation')
 elif name=='launch_sled':
  for y in (-.7,.7):b('runner',(0,y,.25),(3.8,.25,.5),'gunmetal')
  b('deck',(0,0,.52),(3.2,1.6,.16),'paint2');b('thrust_abutment',(-1.45,0,.95),(.4,1.6,.85))
  for y in (-.56,.56):b('guide_strip',(.2,y,.64),(2.5,.12,.09),'hazard')
  k.move('sled_travel',(0,0,0),list(s.objects),(1,0,0),'translate',(0,10));k.sock('payload',(0,0,.6),(0,0,1),'sled_travel');k.sock('pusher',(-1.65,0,.8),(-1,0,0),'sled_travel')
 elif name=='ejector_stop':
  k.foot();b('backstop',(-.35,0,.65),(.3,1.2,1),'paint2')
  for y in (-.35,.35):c('damper',(-.3,y,.7),(.55,y,.7),.17,'bare')
  pad=b('impact_pad',(.6,0,.7),(.25,1.1,.75),'dark');k.move('compression',(.6,0,.7),[pad],(1,0,0),'translate',(-.35,0));k.sock('impact',(.73,0,.7),group='compression')
 elif name=='cargo_turntable':
  c('bearing',(0,0,0),(0,0,.25),1.15);start=len(s.objects);c('rotating_deck',(0,0,.25),(0,0,.45),1.4,'paint2')
  for y in (-.6,.6):b('cargo_rail',(0,y,.52),(2,.14,.14),'bare')
  k.move('turntable_yaw',(0,0,.25),s.objects[start:],limits=(-180,180));k.sock('payload',(0,0,.59),(0,0,1),'turntable_yaw')
 elif name=='retractable_bollard':
  k.foot(1.3,1.3);c('collar',(0,0,.24),(0,0,.5),.45);start=len(s.objects);c('bollard',(0,0,.45),(0,0,1.55),.28,'paint');c('head',(0,0,1.4),(0,0,1.62),.46,'stripe');k.move('bollard_extension',(0,0,.45),s.objects[start:],(0,0,1),'translate',(-1.05,0));k.sock('tie',(0,0,1.4),group='bollard_extension')
 elif name=='clamp_shoe':
  b('heel',(-.45,0,.25),(.7,.9,.5),'paint2');b('toe',(.2,0,.45),(1.1,.9,.3));b('friction_pad',(.4,0,.23),(.7,.72,.14),'dark');start=len(s.objects);c('screw',(-.4,0,.5),(-.4,0,1.05),.13,'bare');c('handwheel',(-.4,0,1.05),(-.4,0,1.18),.34);k.move('clamp_screw',(-.4,0,.5),s.objects[start:],limits=(-180,180));k.sock('clamped_surface',(.4,0,.16),(0,0,-1))
 elif name=='gantry_swivel_pedestal':
  k.foot(2,2);c('column',(0,0,.24),(0,0,1.4),.65,'paint2',.4);c('slew_bearing',(0,0,1.4),(0,0,1.62),.65,'bare');head=b('gantry_head',(0,0,1.85),(1.4,.85,.45));k.move('gantry_yaw',(0,0,1.5),[head],limits=(-180,180));k.sock('boom',(0,0,2.075),(0,0,1),'gantry_yaw')
 elif name=='narrowband_antenna_blade':
  k.foot(1,.75);b('antenna_blade',(.175,0,1.4),(1.05,.14,2.3),'paint2');b('dielectric_tip',(.2,0,2.65),(.95,.18,.18),'ceramic');b('feed_block',(-.2,0,.5),(.5,.45,.4));k.sock('rf',(-.4,0,.4),(-1,0,0))
 elif name=='phased_array_tile':
  b('backplane',(0,0,.16),(1.6,1.6,.32),'paint2')
  for x in range(5):
   for y in range(5):b('radiator_patch',((x-2)*.29,(y-2)*.29,.35),(.23,.23,.06),'ceramic',False,1 if (x+y)%2 else 0)
  k.sock('rf',(0,0,.02),(0,0,-1));k.sock('boresight',(0,0,.4),(0,0,1))
 elif name=='optical_rangefinder':
  k.foot();c('optics_tube',(-.6,0,.6),(.8,0,.6),.27,'paint2')
  for y in (-.45,.45):c('stereo_lens',(.25,y,.6),(.65,y,.6),.18);c('glass',(.65,y,.6),(.69,y,.6),.145,'glass');b('bridge',(.25,y*.5,.6),(.3,.6,.22),'bare')
  c('front_optic',(.8,0,.6),(.84,0,.6),.22,'glow_cyan');k.sock('boresight',(.84,0,.6))
 elif name=='docking_light_bar':
  b('bar',(0,0,.3),(3.2,.4,.3),'paint2')
  for x in range(7):b('housing',((x-3)*.44,0,.5),(.36,.5,.2));b('lens',((x-3)*.44,0,.62),(.26,.38,.04),'glow_green' if x%2 else 'glow_warm',False)
  for x in (-1.1,1.1):b('bracket',(x,0,.12),(.2,.75,.24),'bare')
  k.sock('power',(-1.6,0,.3),(-1,0,0))
 elif name=='status_signal_housing':
  k.foot(.8,.8);c('stem',(0,0,.24),(0,0,.65),.14)
  for i,m in enumerate(('glow_green','glow_amber','glow_red')):c('collar',(0,0,.65+i*.4),(0,0,.78+i*.4),.29);c('signal_lens',(0,0,.78+i*.4),(0,0,1.01+i*.4),.23,m)
  c('cap',(0,0,1.82),(0,0,1.9),.32,'paint');k.sock('power',(0,0,0),(0,0,-1))
 elif name=='exclusion_baffle':
  for y in (-.65,.65):b('foot',(0,y,.1),(.7,.35,.2));b('support',(0,y,.65),(.15,.15,1.1),'bare')
  for i in range(5):b('shield_louver',((i-2)*.2,0,1),(.12,1.8,1.5),'paint2')
  b('hazard_cap',(.4,0,1.8),(.2,1.8,.1),'hazard');k.sock('shielded_axis',(0,0,1),(-1,0,0))
 elif name=='sensor_iris':
  F.annulus(s,'outer_frame',(0,0,0),.53,.8,.15,.22,'paint2',segments=32)
  for i in range(8):
   t=i*math.tau/8;poly=[(r*math.cos(t+angle),r*math.sin(t+angle)) for r,angle in ((.27,-.08),(.72,0),(.72,.86),(.27,1.02))];o=F.plate(s,'iris_leaf',poly,.235+i*.004,.035,'bare',bevel=.004);k.move('iris_leaf_%02d'%i,(math.cos(t)*.6,math.sin(t)*.6,.25),[o],limits=(-25,25));k.cols.append({'center':[math.cos(t)*.67,math.sin(t)*.67,.26],'size':[.38,.38,.22]})
  k.sock('optic',(0,0,.15),(0,0,1))
 elif name=='camera_pod':
  k.foot(1,.9);b('gimbal_yoke',(-.3,0,.5),(.3,.9,.65),'gunmetal');start=len(s.objects);b('camera_case',(.2,0,.8),(1,.65,.55));c('lens',(.7,0,.8),(.88,0,.8),.23);c('optic',(.88,0,.8),(.9,0,.8),.19,'glass');k.move('camera_pitch',(-.1,0,.8),s.objects[start:],(0,1,0),limits=(-75,75));k.sock('boresight',(.9,0,.8),group='camera_pitch')
 elif name=='fire_suppression_head':
  k.foot(.8,.8);c('riser',(0,0,.24),(0,0,.75),.2,'paint2');c('valve',(0,0,.75),(0,0,.9),.32,'stripe');head=c('nozzle',(0,0,.95),(.7,0,1.1),.24,'bare',.13);k.move('nozzle_yaw',(0,0,.9),[head],limits=(-180,180));k.sock('spray',(.7,0,1.1),group='nozzle_yaw');k.sock('fluid',(0,0,0),(0,0,-1))
 elif name=='robotic_tool_changer':
  c('flange',(0,0,0),(0,0,.2),.64);c('coupler',(0,0,.2),(0,0,.52),.48,'paint2')
  for i in range(3):
   t=i*math.tau/3;jaw=b('dog',(.46*math.cos(t),.46*math.sin(t),.56),(.25,.22,.22),'bare',False,rz=t);k.move('locking_dog_%d'%i,(0,0,.56),[jaw],(math.cos(t),math.sin(t),0),'translate',(-.1,0))
  c('tool_socket',(0,0,.52),(0,0,.6),.25,'dark');k.sock('tool',(0,0,.6),(0,0,1))
 elif name=='hose_caddy':
  for y in (-.55,.55):b('stand',(0,y,.6),(.9,.18,1.2),'paint2')
  for y in (-.62,.62):c('reel_flange',(0,y-.055,1),(0,y+.055,1),.7)
  c('reel_core',(0,-.55,1),(0,.55,1),.27)
  for y in range(7):k.ring('wound_hose',(0,(y-3)*.15,1),.48,.07,(0,1,0),'dark')
  b('base',(0,0,.1),(1.2,1.5,.2),'gunmetal');k.sock('hose',(.55,0,1.1))
 elif name=='repair_tool_tray':
  b('floor',(0,0,.12),(2.1,1.25,.24),'paint2')
  for y in (-.62,.62):b('lip',(0,y,.29),(2.1,.09,.35))
  for x in (-1.02,1.02):b('end',(x,0,.29),(.09,1.2,.35))
  for y in (-.35,0,.35):b('handle',(-.25,y,.3),(.75,.14,.12),'dark');c('shaft',(.1,y,.3),(.65,y,.3),.045,'bare');b('head',(.7,y,.3),(.2,.23,.15),'bare')
 else:raise ValueError(name)
 for obj in s.objects:
  if obj.name in s.sockets:obj.name='part_'+obj.name
 return k

def main():
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 rows=[]
 for group,names in GROUPS.items():
  for name in names:
   if args and name not in args:continue
   F.reset_scene();k=build(name,group)
   row=export_asset(k.s,str(OUT),'ops_'+name,group,name.replace('_',' '),collision_boxes=k.cols,tags=['operations',group,'forge','reusable'])
   row['motionContracts']=k.moves;row['recipe']=str(Path(__file__).relative_to(ROOT));rows.append(row);print('OPERATIONS_DONE',name,flush=True)
 if not args:
  p=ROOT/'design/asset-bank/operations.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps({'schemaVersion':2,'family':'operations','assetCount':len(rows),'status':'reusable_asset_bank_not_live_game','sourceFrame':'+X forward +Y port +Z up; metres','artReferences':['docs/visual-assets/LOOK.md','tools/blender/forge/ships/helios_lark.py','tools/blender/forge/ships/ashline_rig.py'],'collisionPolicy':'Compound approximate AABBs, preserve hollow centers; rest-pose only, consumer updates moving proxies.','assets':rows},indent=2)+'\n')
if __name__=='__main__':main()
