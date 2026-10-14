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
OUT=Path(os.environ.get('SPACEFACE_OPERATIONS_OUT',str(ROOT/'assets/models/asset-bank/operations')))
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
   for y in range(5):b('radiator_patch',((x-2)*.29,(y-2)*.29,.35),(.23,.23,.06),'ceramic',False,0)
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

def upgrade(k,name):
 """Manufactured assemblies, not random greeble: retain the original interface envelope."""
 s=k.s;b=k.b;c=k.c
 def remove(prefix):
  removed=[o for o in s.objects if o.name==prefix or o.name.startswith(prefix+'.')]
  for o in removed:
   for g in s.motion_groups:g['objects']=[x for x in g['objects'] if x!=o]
   s.objects.remove(o);bpy.data.objects.remove(o,do_unlink=True)
 def moving(start,group):
  for o in s.objects[start:]:o['forge_motion']=group
  next(g for g in s.motion_groups if g['id']==group)['objects'].extend(s.objects[start:])
 if name=='battery_cassette':
  remove('cell_vault')
  F.loft(s,'cast_cell_vault',[dict(x=x,w=w,ht=.59,hb=.59,zc=.62,n=4.5) for x,w in [(-1.2,.47),(-1.08,.59),(.94,.59),(1.2,.48)]],material='paint2',belly='dark',count=32)
  for y in (-.59,.59):
   for z in (.16,1.13):b('impact_rail',(0,y,z),(2.15,.07,.14),'gunmetal',False)
   for x in (-.77,0,.77):
    b('side_access_gasket',(x,y,.65),(.65,.04,.62),'dark',False)
    b('cell_service_panel',(x,y*1.016,.65),(.57,.03,.53),'paint',False)
    b('identification_band',(x,y*1.045,.78),(.48,.014,.065),'stripe',False,1)
    for dx in (-.22,.22):k.bolt((x+dx,y*.92,1.24),.025)
  for y in (-.3,.3):
   k.ring('terminal_lockring',(-1.255,y,.6),.145,.032,(1,0,0),'dark')
   b('terminal_guard',(-1.17,y,.83),(.26,.32,.065),'gunmetal',False)
  b('charge_gauge_bezel',(.7,-.626,.9),(.65,.035,.17),'dark',False)
  for x in range(5):b('charge_segment',(.48+x*.105,-.648,.9),(.065,.018,.045),'glow_green',False,1)
 elif name=='distribution_cabinet':
  for y in (-.46,.46):
   b('corner_spine',(-.5,y,1.21),(.19,.12,1.75),'gunmetal',False)
   b('raised_side_panel',(-.02,y*1.11,1.2),(.89,.025,1.64),'paint',False)
   b('side_access_recess',(-.03,y*1.15,1.15),(.57,.023,.73),'dark',False)
   for z in (.92,1.07,1.22,1.37):b('side_shutter',(-.03,y*1.17,z),(.49,.025,.065),'paint2',False,1)
  for z in (.58,1.72):c('hinge_knuckle',(.63,.46,z-.13),(.63,.46,z+.13),.065,'bare',detail=1)
  start=len(s.objects)
  b('door_panel_surround',(.701,0,1.17),(.02,.76,1.35),'dark',False)
  b('upper_service_panel',(.72,0,1.48),(.025,.68,.63),'paint',False)
  b('lower_service_panel',(.72,0,.82),(.025,.68,.60),'paint',False)
  b('diagnostic_screen_recess',(.738,.08,1.47),(.012,.38,.26),'dark',False)
  for z,length in ((1.52,.22),(1.45,.14),(1.39,.25)):b('diagnostic_bar',(.747,.08,z),(.009,length,.018),'glow_cyan',False,2)
  for y in (-.23,-.11,.01,.13,.25):b('filter_vent',(.741,y,.83),(.015,.038,.30),'dark',False,1)
  b('warning_inlay',(.747,0,1.13),(.012,.60,.065),'stripe',False)
  moving(start,'service_door')
  k.conduit('power_harness',[(-.48,-.52,.35),(-.48,-.52,.55),(-.35,-.52,.7)],.035,'dark')
 elif name=='piston_ram':
  for x in (-1.20,.19):c('end_casting',(x-.07,0,.4),(x+.07,0,.4),.355,'paint')
  for angle in (.785,2.356,3.927,5.498):
   y=math.cos(angle)*.325;z=.4+math.sin(angle)*.325
   c('tension_rod',(-1.21,y,z),(.26,y,z),.034,'bare',detail=1)
   for x in (-1.24,.27):c('rod_locknut',(x-.025,y,z),(x+.025,y,z),.064,'gunmetal',detail=1)
  b('hydraulic_manifold',(-.83,0,.727),(.43,.28,.13),'paint',False)
  k.conduit('pressure_line',[(-.83,-.1,.73),(-.55,-.17,.72),(.08,-.17,.72),(.18,-.12,.64)],.027,'bare')
  c('scraper_seal',(.43,0,.4),(.5,0,.4),.19,'dark')
  remove('rod_eye');start=len(s.objects)
  k.ring('rod_eye_bearing',(1.65,0,.4),.17,.067,(0,1,0),'gunmetal')
  k.ring('eye_wear_race',(1.65,-.04,.4),.13,.018,(0,1,0),'bare')
  moving(start,'ram_extension')
 elif name=='paired_capture_jaws':
  remove('jaw_arm')
  for sign in (-1,1):
   group='jaw_port' if sign>0 else 'jaw_starboard';start=len(s.objects)
   poly=[(-.89,.80),(.54,.80),(.91,.59),(.91,.97),(.42,1.1),(-.89,1.1)]
   poly=[(x,y*sign) for x,y in poly]
   if sign<0:poly.reverse()
   F.plate(s,'tapered_forged_arm',poly,.16,.48,'paint',chamfer=.035)
   c('jaw_pivot',(-.80,sign*.95,.14),(-.80,sign*.95,.64),.19,'gunmetal')
   c('pivot_race',(-.80,sign*.95,.64),(-.80,sign*.95,.67),.12,'bare')
   b('arm_inset_rail',(-.08,sign*.96,.655),(.93,.075,.015),'dark',False)
   for x in (-.43,.3):k.bolt((x,sign*.96,.66),.035)
   for y in (.43,.55,.67):b('gripping_tooth',(.52,sign*y,.4),(.085,.045,.27),'dark',False,1)
   moving(start,group)
  k.conduit('protected_crossfeed',[(-1.0,-.7,.4),(-1.0,0,.4),(-1.0,.7,.4)],.045,'bare')
 elif name=='camera_pod':
  remove('camera_case');start=len(s.objects)
  F.loft(s,'optical_monocoque',[dict(x=x,w=w,ht=h,hb=h,zc=.8,n=3.2) for x,w,h in [(-.3,.23,.18),(-.18,.32,.27),(.45,.32,.27),(.7,.235,.225)]],material='paint',belly='paint2',count=32)
  b('service_recess',(.10,-.325,.80),(.49,.018,.27),'dark',False)
  b('service_cover',(.10,-.338,.80),(.41,.018,.21),'paint2',False)
  for x in (-.025,.225):b('cover_latch',(x,-.352,.8),(.055,.015,.13),'bare',False,1)
  b('lens_sunshade',(.66,0,1.022),(.43,.56,.085),'paint2',False)
  for x in (.735,.815):k.ring('optical_seal',(x,0,.8),.228,.019,(1,0,0),'dark')
  b('record_lamp',(.32,-.333,.96),(.075,.018,.025),'glow_cyan',False,1)
  moving(start,'camera_pitch')
  for y in (-.39,.39):c('trunnion',(-.1,y-.035,.8),(-.1,y+.035,.8),.115,'bare')
 elif name=='hose_caddy':
  remove('reel_flange');remove('stand')
  for y in (-.62,.62):
   k.ring('spoked_reel_rim',(0,y,1),.64,.055,(0,1,0),'paint2')
   c('hub',(0,y-.045,1),(0,y+.045,1),.19,'bare')
   F.beams(s,'reel_spokes',[((.17*math.cos(t),y,1+.17*math.sin(t)),(.63*math.cos(t),y,1+.63*math.sin(t))) for t in [i*math.tau/6 for i in range(6)]],.085,material='paint',bevel=.01)
  for y in (-.54,.54):
   F.beams(s,'triangular_reel_stand',[((-.44,y,.2),(-.12,y,1)),((.44,y,.2),(.12,y,1)),((-.44,y,.2),(.44,y,.2))],.13,material='gunmetal',bevel=.015)
  c('drive_hub',(0,-.74,1),(0,-.67,1),.18,'paint2')
  b('coupler_cradle',(.44,0,.22),(.28,.49,.2),'paint',False)
  k.conduit('hose_tail',[(.4,0,1.31),(.58,0,1.04),(.55,0,.48)],.07,'dark')
  c('hose_quick_coupler',(.55,0,.41),(.55,0,.59),.105,'bare')

 elif name in ('rectangular_solar_wing','radial_solar_petal'):
  if name=='rectangular_solar_wing':
   for y in (-1.23,1.23):b('edge_protector',(0,y,.25),(4.7,.065,.18),'gunmetal',False)
   for x in (-2.1,2.1):b('underside_crossbrace',(x,0,.13),(.09,2.4,.09),'bare',False,1)
  else:
   for y in (-.24,.24):c('root_pin',(-.48,y,.23),(-.48,y,.36),.065,'bare',detail=1)
 elif name=='solar_hinge_mast_adapter':
  for y in (-.47,.47):
   k.ring('bearing_race',(0,y,1.4),.235,.035,(0,1,0),'dark')
   b('clevis_spine',(0,y,.92),(.50,.025,.32),'paint2',False)
  k.ring('mast_seal',(0,0,.3),.26,.05)
 elif name=='capacitor_drum':
  c('pressure_lid',(0,0,1.86),(0,0,1.94),.53,'paint')
  c('relief_valve',(0,.3,1.94),(0,.3,2.06),.075,'gunmetal',detail=1)
  for i in range(6):
   t=i*math.tau/6;k.bolt((.45*math.cos(t),.45*math.sin(t),1.95),.035)
  b('monitor_module',(.53,0,1.1),(.17,.45,.43),'paint',False);b('monitor_window',(.622,0,1.13),(.012,.25,.11),'dark',False)
 elif name=='transformer_skid':
  for x in (-.66,.66):b('core_tie',(x,0,1.0),(.105,1.22,1.45),'gunmetal',False)
  for y in (-.66,.66):b('fin_guard',(0,y,1.57),(1.56,.09,.14),'paint',False)
  k.conduit('return_line',[(-.58,-.5,.37),(-.58,-.5,.58),(.5,-.5,.58)],.042,'bare')
 elif name=='switchyard_busbar':
  for x in (-1.5,0,1.5):
   for y in (-.4,0,.4):
    for z in (.35,.5,.65):c('isolation_shed',(x,y,z),(x,y,z+.055),.155,'ceramic',detail=1)
 elif name=='induction_coil':
  for x in (-.8,.8):
   b('saddle_cap',(x,0,.53),(.28,1.36,.12),'paint',False)
   for y in (-.54,.54):k.bolt((x,y,.61),.037)
  k.conduit('coil_feed',[(.8,-.58,.6),(1.0,-.58,.6),(1.0,-.58,.28)],.06,'bare')
 elif name=='reactor_containment_shell':
  for i in range(8):
   t=i*math.tau/8;k.bolt((1.1*math.cos(t),1.1*math.sin(t),1.94),.055)
  for sign in (-1,1):
   c('cooling_tap',(sign*1.08,0,.62),(sign*1.21,0,.62),.13,'bare');b('shield_service_tab',(sign*1.11,0,1.1),(.1,.4,.65),'paint',False)
 elif name=='coolant_fin_cassette':
  for y in (-.68,.68):
   b('header_cover',(0,y,.425),(2.5,.23,.065),'paint',False)
   for x in (-1.08,1.08):k.bolt((x,y,.465),.036)
  for x in (-1.2,1.2):k.ring('port_seal',(x,-.86,.22),.12,.025,(0,1,0),'dark')
 elif name=='power_junction_saddle':
  for x,y in ((1,0),(-1,0),(0,1),(0,-1)):
   k.ring('gland_lock',(.72*x,.72*y,.55),.205,.028,(x,y,0),'gunmetal')
  b('circuit_label',(0,0,.99),(.43,.22,.018),'paint2',False)
 elif name=='sliding_bulkhead_leaf':
  start=len(s.objects)
  for y in (-.82,.82):b('panel_stiffener',(.275,y,1.66),(.03,.075,2.35),'gunmetal',False)
  for z in (.67,2.53):b('locking_recess',(.277,0,z),(.024,.74,.22),'dark',False);b('locking_bar',(.291,0,z),(.02,.56,.07),'bare',False)
  moving(start,'bulkhead_slide')
 elif name=='bulkhead_guide_rail':
  for y in (-.16,.16):b('wear_strip',(0,y,.49),(3.9,.065,.09),'bare',False)
  for x in (-1.7,1.7):b('travel_stop',(x,0,.3),(.12,.33,.21),'stripe',False)
 elif name=='hinged_vent_vane':
  start=len(s.objects)
  for y in (-.43,.43):b('vane_stiffener',(0,y,.51),(1.35,.045,.045),'gunmetal',False)
  moving(start,'vane_pitch')
 elif name=='rail_carriage':
  start=len(s.objects);k.hatch('payload_plate',(0,0,.77),(1.25,.82))
  for x in (-.67,.67):b('end_buffer',(x,0,.53),(.12,1.0,.19),'dark',False)
  moving(start,'carriage_translation')
 elif name=='launch_sled':
  start=len(s.objects)
  for x in (-1.1,0,1.1):b('sled_crossrib',(x,0,.19),(.13,1.35,.18),'bare',False)
  for y in (-.72,.72):b('runner_guard',(0,y,.43),(3.4,.055,.20),'paint',False)
  moving(start,'sled_travel')
 elif name=='ejector_stop':
  for y in (-.35,.35):
   for x in (-.15,.2):k.ring('damper_boot',(x,y,.7),.18,.027,(1,0,0),'dark')
  start=len(s.objects)
  for y in (-.39,0,.39):b('impact_rib',(.735,y,.7),(.025,.1,.63),'paint2',False)
  moving(start,'compression')
 elif name=='cargo_turntable':
  start=len(s.objects);k.ring('deck_seal',(0,0,.44),1.27,.025,(0,0,1),'dark')
  for x in (-.75,.75):
   for y in (-.6,.6):b('cargo_lock',(x,y,.55),(.22,.22,.075),'stripe',False)
  moving(start,'turntable_yaw')
 elif name=='retractable_bollard':
  k.ring('wiper_seal',(0,0,.5),.3,.04,(0,0,1),'dark');start=len(s.objects)
  for z in (.87,1.02):k.ring('warning_band',(0,0,z),.28,.02,(0,0,1),'stripe')
  moving(start,'bollard_extension')
 elif name=='clamp_shoe':
  remove('toe');remove('handwheel')
  F.plate(s,'tapered_pressure_toe',[(-.35,-.45),(.55,-.34),(.75,-.2),(.75,.2),(.55,.34),(-.35,.45)],.3,.3,'paint',chamfer=.035)
  F.plate(s,'toe_service_insert',[(-.2,-.30),(.5,-.23),(.63,-.14),(.63,.14),(.5,.23),(-.2,.30)],.598,.025,'paint2',bevel=.008)
  for y in (-.25,.25):b('load_spine',(.055,y,.625),(.65,.045,.035),'gunmetal',False)
  start=len(s.objects);k.ring('open_handwheel',(-.4,0,1.115),.25,.05,(0,0,1),'gunmetal');c('screw_hub',(-.4,0,1.05),(-.4,0,1.18),.10,'bare')
  F.beams(s,'wheel_spokes',[((-.4+.08*math.cos(t),.08*math.sin(t),1.115),(-.4+.25*math.cos(t),.25*math.sin(t),1.115)) for t in (0,math.tau/3,2*math.tau/3)],.055,material='bare',bevel=.007)
  moving(start,'clamp_screw')
 elif name=='gantry_swivel_pedestal':
  k.ring('slew_seal',(0,0,1.47),.61,.035,(0,0,1),'dark');start=len(s.objects)
  k.hatch('boom_mount',(0,0,2.02),(1.20,.72));moving(start,'gantry_yaw')
 elif name=='narrowband_antenna_blade':
  b('feed_bay',(-.13,-.09,.82),(.5,.065,.45),'gunmetal',False);b('tuning_plate',(-.13,-.132,.82),(.39,.025,.32),'paint',False)
  b('antenna_edge',(.665,0,1.47),(.065,.16,2.02),'stripe',False)
 elif name=='phased_array_tile':
  for sign in (-1,1):
   b('radome_edge',(sign*.76,0,.34),(.055,1.5,.09),'paint',False)
   b('radome_edge',(0,sign*.76,.34),(1.5,.055,.09),'paint',False)
  for x in (-.66,.66):
   for y in (-.66,.66):k.bolt((x,y,.36),.028)
 elif name=='optical_rangefinder':
  for y in (-.45,.45):k.ring('stereo_seal',(.59,y,.6),.181,.025,(1,0,0),'dark')
  for x in (-.48,.24):k.ring('barrel_lock',(x,0,.6),.273,.025,(1,0,0),'bare')
  b('optic_bridge_cover',(.18,0,.82),(.66,.60,.11),'paint',False)
 elif name=='docking_light_bar':
  for x in range(7):
   px=(x-3)*.44
   for y in (-.21,.21):b('lamp_guard',(px,y,.64),(.35,.045,.06),'paint2',False)
 elif name=='status_signal_housing':
  for z in (.75,1.15,1.55):k.ring('lens_gasket',(0,0,z),.27,.035,(0,0,1),'dark')
  for x in (-.25,.25):c('protective_stay',(x,0,.65),(x,0,1.82),.035,'bare',detail=1)
 elif name=='exclusion_baffle':
  for y in (-.81,.81):b('slat_tie',(0,y,.62),(.94,.08,.13),'bare',False)
  for x in (-.4,0,.4):b('shield_edge',(x,0,1.72),(.14,1.76,.065),'gunmetal',False)
 elif name=='sensor_iris':
  for i in range(8):
   t=i*math.tau/8;k.bolt((.70*math.cos(t),.70*math.sin(t),.37),.031)
  k.ring('aperture_race',(0,0,.36),.545,.023,(0,0,1),'dark')
 elif name=='fire_suppression_head':
  start=len(s.objects)
  c('nozzle_bore',(.702,0,1.1005),(.712,0,1.103),.095,'dark')
  k.ring('nozzle_lock',(.20,0,.994),.213,.02,(1,0,.21),'gunmetal');moving(start,'nozzle_yaw')
  k.conduit('supply_hose',[(-.18,0,.30),(-.29,0,.48),(-.29,0,.67),(0,0,.78)],.045,'dark')
 elif name=='robotic_tool_changer':
  for i in range(6):
   t=i*math.tau/6;k.bolt((.54*math.cos(t),.54*math.sin(t),.20),.036)
  k.ring('coupler_seal',(0,0,.48),.47,.025,(0,0,1),'dark')
  for y in (-.13,.13):c('service_pin',(0,y,.6),(0,y,.64),.032,'bare',detail=1)
 elif name=='repair_tool_tray':
  b('moulded_insert',(0,0,.255),(1.88,1.02,.055),'dark',False)
  for y in (-.52,-.175,.175,.52):b('tool_separator',(0,y,.32),(1.82,.035,.13),'paint2',False)
  for x in (-.94,.94):
   for y in (-.54,.54):k.bolt((x,y,.40),.027)
 if name=='transformer_skid':
  # Cooling leaves define the role; retain alternating full-height fins at LOD2.
  for obj in s.objects:
   if obj.name.startswith('cooling_leaf') and int(obj.name.split('.')[0][-1])%2==0:obj['forge_detail']=0
 # Group source lists own all replacement geometry and remain export-serializable.
 if name=='sensor_iris':s.bank_lod_factory=lambda level: iris_lod(s,level)
 return k

def iris_lod(original,level):
 # Preserve the circular frame and aperture, never decimate the eight moving blades.
 s=F.Ship(original.id,original.colors);s.motion_pivots=original.motion_pivots
 F.annulus(s,'iris_frame',(0,0,0),.53,.8,.15,.22,'paint2',segments=24 if level==1 else 16)
 for i in range(8):
  t=i*math.tau/8;poly=[(r*math.cos(t+a),r*math.sin(t+a)) for r,a in ((.27,-.08),(.72,0),(.72,.86),(.27,1.02))]
  o=F.plate(s,'iris_blade',poly,.235+i*.004,.035,'bare',bevel=.003 if level==1 else 0);o['forge_motion']='iris_leaf_%02d'%i
 F.ring(s,'iris_race',(0,0,.36),.545,.023,axis=(0,0,1),material='dark',segments=24 if level==1 else 16,sides=6 if level==1 else 4)
 return s

def review():
 from asset_bank_export import render_glb_preview
 from PIL import Image,ImageDraw,ImageFont
 folder=ROOT/'.devshots/asset-bank/operations';folder.mkdir(parents=True,exist_ok=True)
 for name in HEROES:
  render_glb_preview(str(OUT/('ops_'+name+'_lod0.glb')),str(folder/(name+'.png')),width=640,height=480,samples=32)
 sheet=Image.new('RGB',(1980,1120),(18,25,34));draw=ImageDraw.Draw(sheet)
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',23)
 small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',16)
 draw.text((24,15),'SPACEFACE / OPERATIONS / MANUFACTURED-ASSEMBLY REVISION',font=font,fill=(225,235,240))
 draw.text((24,49),'Exact exported LOD0 meshes • canonical Forge materials • CPU Blender review, not live game',font=small,fill=(150,180,190))
 rows=[]
 for i,name in enumerate(HEROES):
  x=15+(i%3)*655;y=86+(i//3)*515
  sheet.paste(Image.open(folder/(name+'.png')).convert('RGB'),(x,y));draw.text((x+8,y+478),name.replace('_',' '),font=font,fill=(215,230,240))
  glb=OUT/('ops_'+name+'_lod0.glb');rows.append({'assetId':'ops_'+name,'file':str(glb.relative_to(ROOT)),'sha256':hashlib.sha256(glb.read_bytes()).hexdigest()})
 dest=OUT/'evidence/operations_quality_six.png';dest.parent.mkdir(parents=True,exist_ok=True);sheet.save(dest)
 (OUT/'evidence/operations_quality_six.json').write_text(json.dumps({'method':'Six upgraded exported LOD0 meshes reimported/rendered on CPU; same canonical Forge material finishes.','referenceImages':['.devshots/asset-bank/style-reference/atlas.png','.devshots/asset-bank/style-reference/wasp.png'],'sheetSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sources':rows,'reviewStatus':'awaiting visual inspection'},indent=2)+'\n')
 print('OPERATIONS_REVIEW',str(dest),flush=True)

def comparison(source_path):
 from PIL import Image,ImageDraw,ImageFont
 old=Image.open(source_path).convert('RGB');canvas=Image.new('RGB',(1040,890),(18,25,34));d=ImageDraw.Draw(canvas)
 f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',19)
 d.text((22,16),'EARLIER EXPORTED SERVICE SNAPSHOT',font=f,fill=(185,195,205));d.text((535,16),'NEW MANUFACTURED-ASSEMBLY REVISION',font=f,fill=(225,235,240))
 for row,(name,col,gridrow) in enumerate([('camera_pod',3,1),('hose_caddy',2,2)]):
  x=30+col*505;y=95+gridrow*425
  canvas.paste(old.crop((x,y,x+480,y+360)),(20,60+row*410))
  new=Image.open(ROOT/'.devshots/asset-bank/operations'/(name+'.png')).convert('RGB').resize((480,360))
  canvas.paste(new,(535,60+row*410));d.text((23,424+row*410),name.replace('_',' '),font=f,fill=(200,215,225))
 d.text((22,864),'Same roles and attachment interfaces; old Library snapshot vs newly rendered exported GLBs.',font=f,fill=(145,170,190))
 dest=OUT/'evidence/operations_before_after.png';canvas.save(dest)
 meta={'beforeSourceSha256':hashlib.sha256(Path(source_path).read_bytes()).hexdigest(),'beforeDescription':'Original12service exported model contact sheet previously delivered to user; recovered from Library. Not reconstructed baseline geometry.','afterSourceSha256':{n:hashlib.sha256((OUT/('ops_'+n+'_lod0.glb')).read_bytes()).hexdigest() for n in ['camera_pod','hose_caddy']},'imageSha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
 (dest.with_suffix('.json')).write_text(json.dumps(meta,indent=2)+'\n')

def contacts():
 from asset_bank_export import render_glb_preview
 from PIL import Image,ImageDraw,ImageFont
 folder=ROOT/'.devshots/asset-bank/operations-all';folder.mkdir(parents=True,exist_ok=True)
 for group,names in GROUPS.items():
  sheet=Image.new('RGB',(2040,1390),(18,25,34));draw=ImageDraw.Draw(sheet)
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
  small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
  draw.text((30,20),'SPACEFACE / OPERATIONS / '+group.upper()+' / QUALITY REVISION',font=font,fill=(225,235,240))
  draw.text((30,53),'Actual exported LOD0 meshes, normalized individual framing • canonical Forge materials • CPU review, not live game',font=small,fill=(150,180,195))
  sources=[]
  for i,name in enumerate(names):
   glb=OUT/('ops_'+name+'_lod0.glb');path=folder/(name+'.png')
   render_glb_preview(str(glb),str(path),width=480,height=360,samples=32)
   x=30+(i%4)*505;y=95+(i//4)*425;sheet.paste(Image.open(path).convert('RGB'),(x,y));draw.text((x+8,y+362),name.replace('_',' '),font=font,fill=(215,230,240))
   row=json.loads((OUT/('ops_'+name+'.json')).read_text());dim=[row['bounds']['max'][j]-row['bounds']['min'][j] for j in range(3)]
   draw.text((x+8,y+392),'X %.2f / height %.2f / width %.2f m'%tuple(dim),font=small,fill=(145,170,190))
   sources.append({'assetId':'ops_'+name,'file':str(glb.relative_to(ROOT)),'sha256':hashlib.sha256(glb.read_bytes()).hexdigest()})
  path=OUT/'evidence'/('operations_'+group+'_contact.png');sheet.save(path)
  p=ROOT/'design/asset-bank/operations.json';m=json.loads(p.read_text());m['contactSheets']=[r for r in m.get('contactSheets',[]) if r['group']!=group]+[{'group':group,'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'method':'Reimported exact GLBs, rendered Cycles CPU32samples. Not live-game acceptance.','sources':sources}];p.write_text(json.dumps(m,indent=2)+'\n')
  print('OPERATIONS_CONTACT',group,flush=True)

def inspect_remaining():
 """Render exact remaining candidate GLBs near, plan and coarsest LOD."""
 from asset_bank_export import render_glb_preview
 from mathutils import Vector
 from PIL import Image,ImageDraw,ImageFont
 folder=OUT.parent/'review';folder.mkdir(parents=True,exist_ok=True)
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
 small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
 for group,all_names in GROUPS.items():
  names=[n for n in all_names if n not in HEROES]
  for name in names:
   selected=os.environ.get('SPACEFACE_OPERATIONS_REVIEW_ONLY','')
   if selected and name not in selected.split(','):continue
   for level in (0,2):
    path=folder/(name+('_near.png' if level==0 else '_lod2.png'))
    render_glb_preview(str(OUT/('ops_'+name+'_lod%d.glb'%level)),str(path),width=400,height=300,samples=24)
    if level==0:
     corners=[o.matrix_world@Vector(c) for o in bpy.context.scene.objects if o.type=='MESH' for c in o.bound_box]
     lo=Vector(tuple(min(p[i] for p in corners) for i in range(3)));hi=Vector(tuple(max(p[i] for p in corners) for i in range(3)));center=(lo+hi)/2
     cam=bpy.context.scene.camera;cam.location=center+Vector((0,0,max(hi-lo)*3));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=max(hi.x-lo.x,(hi.y-lo.y)*4/3)*1.15
     bpy.context.scene.render.filepath=str(folder/(name+'_top.png'));bpy.ops.render.render(write_still=True)
   print('OPERATIONS_REVIEWED_VIEWS',name,flush=True)
  if not all((folder/(n+'_lod2.png')).exists() for n in names):continue
  for page in range(2):
   subset=names[page*5:page*5+5];sheet=Image.new('RGB',(1240,1760),(18,25,34));draw=ImageDraw.Draw(sheet)
   draw.text((20,15),'OPERATIONS / '+group.upper()+' / '+str(page+1)+' / NEAR • TOP • LOD2',font=font,fill=(225,235,240))
   draw.text((20,45),'Fresh exported meshes; CPU inspection only. Each row is one model, independently framed.',font=small,fill=(150,175,190))
   for row,name in enumerate(subset):
    y=85+row*330
    for col,suffix in enumerate(('_near.png','_top.png','_lod2.png')):sheet.paste(Image.open(folder/(name+suffix)).convert('RGB'),(10+col*410,y))
    draw.text((18,y+302),name.replace('_',' '),font=font,fill=(215,230,240))
   sheet.save(folder/('operations_'+group+'_inspection_'+str(page+1)+'.png'))

def main():
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 rows=[]
 for group,names in GROUPS.items():
  for name in names:
   if args and name not in args:continue
   F.reset_scene();k=upgrade(build(name,group),name)
   row=export_asset(k.s,str(OUT),'ops_'+name,group,name.replace('_',' '),collision_boxes=k.cols,tags=['operations',group,'forge','reusable'])
   row['motionContracts']=k.moves;row['recipe']=str(Path(__file__).relative_to(ROOT));rows.append(row);print('OPERATIONS_DONE',name,flush=True)
 if not args:
  p=ROOT/'design/asset-bank/operations.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps({'schemaVersion':2,'family':'operations','assetCount':len(rows),'status':'reusable_asset_bank_not_live_game','sourceFrame':'+X forward +Y port +Z up; metres','artReferences':['docs/visual-assets/LOOK.md','tools/blender/forge/ships/helios_lark.py','tools/blender/forge/ships/ashline_rig.py'],'collisionPolicy':'Compound approximate AABBs, preserve hollow centers; rest-pose only, consumer updates moving proxies.','assets':rows},indent=2)+'\n')
if __name__=='__main__':
 if '--inspect-remaining' in sys.argv:inspect_remaining()
 elif '--contacts' in sys.argv:contacts()
 elif '--compare' in sys.argv:comparison(sys.argv[sys.argv.index('--compare')+1])
 elif '--review' in sys.argv:review()
 else:main()
