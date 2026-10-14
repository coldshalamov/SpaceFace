"""Twelve metre-scale Forge place components and twelve dependency-only assemblies.
Run blender -b -t 4 --python tools/blender/forge/asset_bank_large.py.
Options after --: --assemblies; --contacts [--source|--lod2] [--top].
Candidate bank only: no runtime spawning, normalization, or visual acceptance implied.
"""
import os,sys,json,math
from pathlib import Path
sys.path.insert(0,os.path.dirname(__file__))
import bpy
from mathutils import Vector,Quaternion,Matrix
from forge import Ship,box,cylinder,beams,truss,ring,sweep,annulus,reset_scene
from asset_bank_export import export_asset,gltf
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'assets/models/asset-bank/large'
COLORS={'paint':'#78858a','paint2':'#354653','stripe':'#ad692e','ceramic':'#9b9789','glass':'#263f47'}
NAMES=['drydock_side_wall','drydock_end_buttress','capital_berth_outrigger','habitation_ring_quadrant','ring_spoke','pressure_dome_habitat','agricultural_cylinder','fabrication_hall_shell','ice_anchoring_terrace','ore_transfer_terrace','relay_dish_backframe','launch_trench_bank']
PREFLIGHT={'scope':'Tier B reusable component candidates; not visual/runtime acceptance','componentReferenceDecision':'not_needed','fiction':'ART EXTRAPOLATION: anonymous industrial infrastructure, no manufacturer/history/canon assertion','supportedViews':['top','60-degree overview','close component inspection'],'zones':{'load_frame':{'status':'billed','substrate':'welded alloy box beams; exposed diagonal load paths','finish':'gunmetal/bare','forbidden':'floating decoration, collision filling real voids'},'shell':{'status':'billed','substrate':'segmented pressure skins and service decks','finish':'lacquer paint/paint2, ceramic thermal surfaces','forbidden':'default plastic, noisy grain'},'interfaces':{'status':'billed','substrate':'machined flange/rim and fitted service mounting pads','finish':'bare, restrained stripe','forbidden':'unsupported sockets'},'occupancy':{'status':'billed','substrate':'sealed glazing and recessed navigation lamps','finish':'glass, warm lamps','forbidden':'emitting paint, indiscriminate cyan'}},'allSupportedViewZonesClassified':False,'review':'CPU source/export sheets; independent root review and normal-route G0-G7 remain separate','assemblySequence':'load frame, cross-bracing, seated shell, bearing flanges, attached equipment'}
class Build:
 def __init__(self,n):
  self.s=Ship('large_'+n,COLORS);self.s.bank_source='tools/blender/forge/asset_bank_large.py';self.col=[]
 def b(self,n,p,d,m='paint',collision=True,rot=None):
  o=box(self.s,n,p,d,m,bevel=min(.18,min(d)*.12),uv_scale=.25,rot=rot)
  if collision:self.col.append({'center':list(p),'size':list(d)})
  return o
 def beam(self,n,p,q,w=1,m='gunmetal'):
  beams(self.s,n,[(p,q)],w,m,bevel=.06,uv_scale=.25)
  d=Vector(q)-Vector(p);x=Vector(gltf(d)).normalized();up=Vector((0,1,0))
  if abs(x.dot(up))>.99:up=Vector((0,0,1))
  z=x.cross(up).normalized();y=z.cross(x).normalized();r=Matrix((x,y,z)).transposed().to_quaternion()
  self.col.append({'center':list((Vector(p)+Vector(q))*.5),'size':[d.length,w,w],'rotation_gltf':[r.x,r.y,r.z,r.w]})
 def port(self,n,p,f=(1,0,0),r=2):
  self.s.socket('SOCKET_'+n,p,f);ring(self.s,n+'_flange',p,r,.22,axis=f,material='bare',segments=24,sides=6)
 def panel(self,n,x,y,z,dx,dy):
  self.b(n,(x,y,z),(dx,dy,.5),'paint',False);self.s.detail=1
  for sign in (-1,1):self.b(n+'_edge',(x+sign*(dx/2-.2),y,z+.3),(.18,dy,.1),'stripe',False)
  self.s.detail=0
 def service(self,p):
  x,y,z=p;self.b('service_pad',(x,y,z),(5,5,.5),'paint2');self.port('Service',(x,y,z+.25),(0,0,1),.9)
 def ribarch(self,n,x,r,z0,w=.9):
  pts=[(x,r*math.cos(i*math.pi/12),z0+r*math.sin(i*math.pi/12)) for i in range(13)]
  for p,q in zip(pts[:-1],pts[1:]):self.beam(n,p,q,w,'bare')

def build(n,lod=0):
 a=Build(n);s=a.s;b=a.b
 if n=='drydock_side_wall':
  for y in (-3,3):
   for z in (-4,8):a.beam('continuous_chord',(-40,y,z),(40,y,z),1.6)
  for x in range(-40,41,10):
   for y in (-3,3):a.beam('upright',(x,y,-4),(x,y,8),1.3)
   if x<40:a.beam('external_diagonal',(x,3,-4),(x+10,3,8),.8);a.panel('walkway',x+5,0,8.5,9.6,7)
   if x%20==0:b('fender',(x,-4,1),(4,2,6),'dark');a.beam('fender_knee',(x,-4,-2),(x,0,-4),1.2)
  a.port('Join_A',(-40,0,0),(-1,0,0));a.port('Join_B',(40,0,0));a.port('Berth',(0,-5,1),(0,-1,0));a.service((0,0,9))
 elif n=='drydock_end_buttress':
  for x in (-12,12):
   a.beam('foot',(x,-25,-5),(x,25,-5),3);a.beam('tower',(x,0,-5),(x,0,22),3)
   for y in (-24,24):a.beam('flying_buttress',(x,y,-5),(x,0,20),2)
  for z in (-5,10,22):a.beam('transom',(-12,0,z),(12,0,z),2)
  for y in (-16,16):a.panel('landing',0,y,-3,24,12)
  a.port('Join_A',(0,-25,-5),(0,-1,0));a.port('Join_B',(0,25,-5),(0,1,0));a.service((0,0,23))
 elif n=='capital_berth_outrigger':
  for y in (-5,5):
   truss(s,'boom',(-36,y,0),(28,y,0),3,8,'gunmetal',chord=.7,web=.35);a.beam('boom_rail',(-36,y,2),(28,y,2),1)
  for x in (-36,-20,-4,12,28):a.beam('crossmember',(x,-7,0),(x,7,0),1.5)
  for y in (-1,1):a.beam('capture_prong',(24,y*5,0),(36,y*15,0),2);b('berth_fender',(36,y*15,1),(5,5,6),'dark')
  a.panel('root_deck',-26,0,2,20,12);a.port('Join_A',(-36,0,0),(-1,0,0));a.port('Berth',(36,0,0));a.service((-26,0,3))
 elif n=='habitation_ring_quadrant':
  for r,z in [(34,-3),(46,-3),(40,5)]:
   pts=[(r*math.cos(i*math.pi/32),r*math.sin(i*math.pi/32),z) for i in range(17)]
   for p,q in zip(pts[:-1],pts[1:]):a.beam('arc_chord',p,q,1.2)
  for i in range(8):
   t=(i+.5)*math.pi/16;p=(40*math.cos(t),40*math.sin(t),0);rotation=t+math.pi/2
   b('pressure_cell',p,(9,8,6),'paint',False,rot=(0,0,rotation))
   a.beam('radial_rib',(33*math.cos(t),33*math.sin(t),-3),(47*math.cos(t),47*math.sin(t),-3),1)
   a.col.append({'center':list(p),'size':[9,8,6],'rotation_gltf':[0,-math.sin(rotation/2),0,math.cos(rotation/2)]})
   b('skylight',(p[0],p[1],3.1),(5,3,.12),'glass',False,rot=(0,0,rotation))
  a.port('Join_A',(40,0,0),(0,-1,0));a.port('Join_B',(0,40,0),(-1,0,0));a.service((28.3,28.3,5.8))
 elif n=='ring_spoke':
  for y in (-3.5,3.5):truss(s,'tension_web',(-32,y,0),(32,y,0),3,8,'gunmetal',chord=.6,web=.3);a.beam('compression_chord',(-32,y,-2),(32,y,-2),1.2)
  cylinder(s,'pressure_tube',(-32,0,0),(32,0,0),2,material='paint2',segments=24);a.col.append({'center':[0,0,0],'size':[64,4,4]})
  for x in range(-28,29,8):ring(s,'compression_hoop',(x,0,0),2.15,.25,material='bare',segments=24,sides=6);a.beam('cross_tie',(x,-4,0),(x,4,0),.5)
  a.port('Join_A',(-32,0,0),(-1,0,0));a.port('Join_B',(32,0,0));a.service((0,0,2.6))
 elif n=='pressure_dome_habitat':
  annulus(s,'foundation',(0,0,0),14,21,-2,2,'paint2',segments=48)
  for i in range(24):
   t=i*math.pi/12;a.beam('foundation_segment',(18*math.cos(t),18*math.sin(t),-1),(18*math.cos(t+math.pi/12),18*math.sin(t+math.pi/12),-1),4)
  verts=[];faces=[]
  for j in range(7):
   phi=j*math.pi/12
   for i in range(32):verts.append((18*math.cos(phi)*math.cos(i*math.pi/16),18*math.cos(phi)*math.sin(i*math.pi/16),18*math.sin(phi)))
  for j in range(6):
   for i in range(32):faces.append((j*32+i,j*32+(i+1)%32,(j+1)*32+(i+1)%32,(j+1)*32+i))
  mesh=bpy.data.meshes.new('pressure_skin');mesh.from_pydata(verts,[],faces);obj=bpy.data.objects.new('segmented_pressure_skin',mesh);bpy.context.scene.collection.objects.link(obj);mesh.materials.append(s.mat('glass'));s.add(obj)
  for i in range(12):
   t=i*math.pi/6;pts=[(18.15*math.cos(j*math.pi/24)*math.cos(t),18.15*math.cos(j*math.pi/24)*math.sin(t),18.15*math.sin(j*math.pi/24)) for j in range(13)];sweep(s,'dome_meridian',pts,.65,.65,'paint',.05,.25)
  for z in (5,10,14):ring(s,'latitude',(0,0,z),math.sqrt(18.15**2-z*z),.28,axis=(0,0,1),material='bare',segments=48,sides=6)
  b('airlock',(20,0,1),(10,6,5),'paint');a.port('Airlock',(25,0,1));a.service((20,0,3.75))
 elif n=='agricultural_cylinder':
  cylinder(s,'pressure_shell',(-36,0,0),(36,0,0),11,material='paint2',segments=32)
  for x in range(-36,37,9):ring(s,'structural_hoop',(x,0,0),11.3,.7,material='bare',segments=32,sides=6)
  for t in [math.pi/6,math.pi/2,5*math.pi/6]:
   y=11.2*math.cos(t);z=11.2*math.sin(t)
   for x in range(-30,31,12):b('greenhouse_lantern',(x,y,z),(10,4,.35),'glass',False,rot=(t-math.pi/2,0,0))
  for y in (-12,12):a.beam('service_spine',(-38,y,-5),(38,y,-5),1.5)
  for x in (-30,0,30):a.beam('saddle',(x,-13,-5),(x,13,-5),2)
  a.col.append({'center':[0,0,0],'size':[72,19,19]});a.port('Join_A',(-36,0,0),(-1,0,0));a.port('Join_B',(36,0,0));a.service((0,0,11.8))
 elif n=='fabrication_hall_shell':
  for y in (-20,20):a.beam('foundation',(-36,y,-3),(36,y,-3),2)
  for x in range(-36,37,12):a.ribarch('portal_rib',x,20,0,1.5)
  for y in (-20,20):
   for x in range(-30,31,12):b('lower_wall',(x,y,4),(11.5,1,8),'paint2')
  for y in (-12,12):a.beam('roof_rail',(-36,y,16),(36,y,16),1)
  for x in (-24,0,24):a.panel('roof_canopy',x,0,20,18,13)
  a.port('Join_A',(-36,-20,-3),(-1,0,0));a.port('Join_B',(36,-20,-3));a.service((0,-20,9))
 elif n in ('ice_anchoring_terrace','ore_transfer_terrace'):
  ice=n.startswith('ice');width=44 if ice else 36
  for y in (-width/2,width/2):a.beam('edge_girder',(-40,y,-3),(40,y,-3),2)
  for x in range(-40,41,10):a.beam('floor_crossbeam',(x,-width/2,-3),(x,width/2,-3),1.4)
  for x in range(-35,36,10):
   for y in (-width/4,width/4):a.panel('deck_tile',x,y,-1.5,9.5,width/2-.5)
  for x in (-32,32):
   for y in (-width/2,width/2):
    if ice:
     cylinder(s,'anchor_screw',(x,y,-16),(x,y,-2),1.5,r1=.4,material='bare',segments=16)
     for z in (-12,-9,-6):ring(s,'anchor_flight',(x,y,z),2,.25,axis=(0,0,1),material='bare',segments=16,sides=4)
    else:a.beam('hopper_support',(x,y,-3),(x,y,8),1.5);b('transfer_cheek',(x,y,4),(9,2,8),'paint2')
  if not ice:
   for y in (-5,5):a.beam('conveyor_rail',(-40,y,1),(40,y,1),1,'bare')
   for x in range(-38,39,4):cylinder(s,'roller',(x,-5,1),(x,5,1),.45,material='bare',segments=12)
  a.port('Join_A',(-40,0,-3),(-1,0,0));a.port('Join_B',(40,0,-3));a.service((0,width/2-4,-.5))
 elif n=='relay_dish_backframe':
  for r,z in ((10,0),(23,7),(35,16)):ring(s,'parabolic_ring',(0,0,z),r,.8,axis=(0,0,1),material='bare',segments=48,sides=6)
  for i in range(16):
   t=i*math.pi/8;pts=[(r*math.cos(t),r*math.sin(t),z) for r,z in ((3,-2),(10,0),(23,7),(35,16))]
   for p,q in zip(pts[:-1],pts[1:]):a.beam('radial_spoke',p,q,1.4)
   if i%2==0:a.beam('foundation_strut',(3*math.cos(t),3*math.sin(t),-10),(23*math.cos(t),23*math.sin(t),7),.7)
  b('bearing',(0,0,-7),(8,8,8),'paint2');a.port('Mount',(0,0,-11),(0,0,-1),3);a.service((0,0,-2.5))
 elif n=='launch_trench_bank':
  for y in (-13,13):
   a.beam('bank_keel',(-48,y,-4),(48,y,-4),3)
   for x in range(-48,49,12):
    a.beam('bank_buttress',(x,y,-4),(x,y*1.5,8),2)
    if x<48:a.panel('bank_cap',x+6,y*1.5,8,11.5,8)
   a.beam('guide_rail',(-48,y,2),(48,y,2),1,'bare')
  for x in (-48,0,48):a.beam('sub_trench_tie',(x,-20,-6),(x,20,-6),2)
  a.port('Join_A',(-48,-13,-4),(-1,0,0));a.port('Join_B',(48,-13,-4));a.service((0,19.5,8.5))
 if lod:
  retained=[]
  for obj in s.objects:
   if obj.get('forge_detail',0)>=1:bpy.data.objects.remove(obj,do_unlink=True)
   else:obj['forge_bevel']=0 if lod==2 else min(float(obj.get('forge_bevel',0)),.025);retained.append(obj)
  s.objects=retained
 return a

def main():
 rows=[]
 for n in NAMES:
  reset_scene();a=build(n);a.s.bank_lod_factory=lambda level,name=n:build(name,level).s
  row=export_asset(a.s,str(OUT),'large_'+n,'large',n.replace('_',' '),a.col,['large','reusable','Forge','metre-scale']);row['preflight']=PREFLIGHT;rows.append(row);print('LARGE_DONE',n,flush=True)
 dest=ROOT/'design/asset-bank/large.json';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps({'schemaVersion':1,'family':'large','assetCount':12,'recipeCount':12,'status':'authoring-library candidate; not live runtime','preflight':PREFLIGHT,'assets':rows},indent=2)+'\n')

def contacts(source=False,top=False):
 reset_scene()
 for index,n in enumerate(NAMES):
  if source:a=build(n);a.s.finish();new=a.s.objects
  else:
   before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/('large_'+n+('_lod2.glb' if '--lod2' in sys.argv else '_lod0.glb'))));new=[o for o in bpy.data.objects if o not in before and o.type=='MESH']
  corners=[o.matrix_world@Vector(c) for o in new for c in o.bound_box];lo=Vector(tuple(min(v[i] for v in corners) for i in range(3)));hi=Vector(tuple(max(v[i] for v in corners) for i in range(3)));center=(lo+hi)*.5;scale=3.7/max(hi-lo);offset=Vector(((index%4)*5.3,(index//4)*5.6,0))
  for o in new:matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix;o.location=(o.location-center)*scale+offset;o.scale*=scale
  curve=bpy.data.curves.new('label','FONT');curve.body=n.replace('_',' ');curve.size=.19;curve.align_x='CENTER';label=bpy.data.objects.new('label',curve);bpy.context.scene.collection.objects.link(label);label.location=offset+Vector((0,-2.3,-1.2))
 review_scene('large_'+('source' if source else 'export')+('_top' if top else '_60')+('_lod2' if '--lod2' in sys.argv else ''),top)

def review_scene(name,top=False):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.render.resolution_x=1900;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('review_world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.13,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
 for pos,power in [((7,-8,22),6000),((-6,12,18),4200)]:
  d=bpy.data.lights.new('softbox','AREA');d.energy=power;d.size=18;o=bpy.data.objects.new('softbox',d);scene.collection.objects.link(o);o.location=pos
 d=bpy.data.cameras.new('review_camera');o=bpy.data.objects.new('review_camera',d);scene.collection.objects.link(o);target=Vector((7.95,5.6,0));o.location=target+Vector((0,0,32) if top else (0,-16,27.71));o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=24;scene.camera=o
 path=ROOT/'.devshots/asset-bank'/(name+'.png');path.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);print('LARGE_CONTACT_DONE',path,flush=True)

def assemblies():
 db={}
 for f in (ROOT/'assets/models/asset-bank').rglob('*.json'):
  row=json.loads(f.read_text())
  if 'assetId' in row:db[row['assetId']]=row
 def basis(socket):
  x=Vector(socket['forward']);y=Vector(socket['up']);return Matrix((x,y,x.cross(y))).transposed()
 def sock(asset,name):return next(s for s in db[asset]['sockets'] if s['name']==name)
 recipes=[]
 definitions=[('customs_inspection_pen','drydock_side_wall','ops_optical_rangefinder','cargo-sealed-custody-safe'),('salvage_custody_court','ore_transfer_terrace','ops_paired_capture_jaws','cargo-ore-skip'),('relief_berth','capital_berth_outrigger','ops_docking_light_bar','cargo-insulated-medical-carrier'),('open_repair_quay','drydock_side_wall','ops_gantry_swivel_pedestal','cargo-machine-tool-skid'),('screened_illicit_intake','fabrication_hall_shell','ops_exclusion_baffle','cargo-gas-bottle-cluster'),('solar_orchard_hub','ring_spoke','ops_solar_hinge_mast_adapter','ops_rectangular_solar_wing'),('bulk_coolant_exchange','agricultural_cylinder','ops_coolant_fin_cassette','cargo-cryogenic-dewar'),('freight_rail_transfer_yard','launch_trench_bank','ops_rail_carriage','cargo-habitat-panel-pack'),('survey_cut_face_worksite','ice_anchoring_terrace','ops_optical_rangefinder','cargo-bagged-regolith-pallet'),('quarantine_transfer_platform','pressure_dome_habitat','ops_fire_suppression_head','cargo-biological-containment-cage'),('derelict_rib_corridor','relay_dish_backframe','ops_camera_pod','cargo-inert-reactor-core-cask'),('ancient_service_threshold','habitation_ring_quadrant','ops_sensor_iris','ops_phased_array_tile')]
 for rid,large,operation,payload in definitions:
  instances=[];joins=[]
  def root(i,asset,t=(0,0,0),q=(0,0,0,1)):
   if asset not in db:raise ValueError('Missing dependency '+asset)
   instances.append({'id':i,'assetId':asset,'translation':list(t),'rotation':list(q),'scale':[1,1,1]});return instances[-1]
  def attach(i,asset,child_socket,parent,parent_socket):
   p=next(k for k in instances if k['id']==parent);ps=sock(p['assetId'],parent_socket);cs=sock(asset,child_socket);pq=Quaternion((p['rotation'][3],*p['rotation'][:3]));pb=pq.to_matrix()@basis(ps);desired=pb@Matrix(((-1,0,0),(0,1,0),(0,0,-1)));rotation=(desired@basis(cs).transposed()).to_quaternion();position=Vector(p['translation'])+pq@Vector(ps['position'])-rotation@Vector(cs['position']);row=root(i,asset,position,(rotation.x,rotation.y,rotation.z,rotation.w));delta=position+rotation@Vector(cs['position'])-Vector(p['translation'])-pq@Vector(ps['position'])
   joins.append({'parent':{'instance':parent,'socket':parent_socket},'child':{'instance':i,'socket':child_socket},'positionErrorMetres':delta.length,'forwardDot':(rotation@Vector(cs['forward'])).dot(pq@Vector(ps['forward'])),'upDot':(rotation@Vector(cs['up'])).dot(pq@Vector(ps['up']))});return row
  aid='large_'+large;bb=db[aid]['bounds'];extent=max(abs(bb['min'][2]),abs(bb['max'][2]));side=extent+18
  if rid!='ancient_service_threshold':
   root('primary',aid,(0,0,-side));root('return_bank','large_drydock_side_wall',(0,0,30),(0,1,0,0));attach('operations',operation,'mount','primary','SOCKET_Service')
   if payload.startswith('cargo-'):attach('payload',payload,'SOCKET_Mount','return_bank','SOCKET_Service')
   elif rid=='solar_orchard_hub':attach('collector',payload,'hinge','operations','wing')
   else:attach('instrument',payload,'mount','return_bank','SOCKET_Service')
  else:
   for gate,x in [('near',-36),('far',36)]:
    root(gate+'_jamb_left','threshold_jamb',(x,0,2.2),(0,math.sqrt(.5),0,math.sqrt(.5)));attach(gate+'_lintel','threshold_lintel','SOCKET_JAMB_-2.2',gate+'_jamb_left','SOCKET_LINTEL');attach(gate+'_jamb_right','threshold_jamb','SOCKET_LINTEL',gate+'_lintel','SOCKET_JAMB_2.2')
  if rid=='solar_orchard_hub':
   root('tee','truss_tee',(0,0,-side-15));attach('span_west','truss_long','SOCKET_LEG_0_1','tee','SOCKET_LEG_0_1');attach('span_east','truss_short','SOCKET_LEG_0_0','tee','SOCKET_LEG_1_1');attach('terminal','terminal_cap','SOCKET_FRAME','tee','SOCKET_LEG_2_1')
  if rid=='bulk_coolant_exchange':
   root('pipe','pressure_pipe_straight',(0,0,-side-20));attach('elbow','pressure_pipe_elbow_90','SOCKET_FLOW_0','pipe','SOCKET_FLOW_1');attach('valve','pressure_pipe_valve','SOCKET_FLOW_0','elbow','SOCKET_FLOW_1')
  if rid=='relief_berth':root('corridor','pressure_corridor_straight',(0,0,-side-20));attach('collar','docking_collar','SOCKET_PASSAGE_-1_0','corridor','SOCKET_PASSAGE_1_0')
  if rid=='survey_cut_face_worksite':root('cut_parent','seam_bearing_quarried_parent_rock',(-20,0,-side-28));attach('removable_wedge','matched_removable_wedge','SOCKET_MATCHED_CUT','cut_parent','SOCKET_MATCHED_CUT')
  corners=[]
  for m in instances:
   bounds=db[m['assetId']]['bounds'];q=Quaternion((m['rotation'][3],*m['rotation'][:3]));t=Vector(m['translation'])
   for x in (bounds['min'][0],bounds['max'][0]):
    for y in (bounds['min'][1],bounds['max'][1]):
     for z in (bounds['min'][2],bounds['max'][2]):corners.append(t+q@Vector((x,y,z)))
  lo=[min(p[i] for p in corners) for i in range(3)];hi=[max(p[i] for p in corners) for i in range(3)];radius=1.2 if rid=='ancient_service_threshold' else 2;nearest=float('inf');samples=0
  for m in instances:
   mq=Quaternion((m['rotation'][3],*m['rotation'][:3]));mt=Vector(m['translation'])
   for solid in db[m['assetId']]['collision']['solids']:
    sq=Quaternion((solid['rotation'][3],*solid['rotation'][:3]));q=mq@sq;c=mt+mq@Vector(solid['center']);half=Vector(solid['size'])*.5
    for k in range(201):
     p=Vector((lo[0]-10+(hi[0]-lo[0]+20)*k/200,0,0));v=q.inverted()@(p-c);distance=Vector(tuple(max(abs(v[i])-half[i],0) for i in range(3))).length;nearest=min(nearest,distance);samples+=1
  assert nearest>radius,(rid,nearest)
  assert 64<=max(hi[i]-lo[i] for i in range(3))<=240,(rid,lo,hi)
  focal={'instance':'near_jamb_left','socket':'SOCKET_LINTEL'} if rid=='ancient_service_threshold' else {'instance':'primary','socket':'SOCKET_Service'}
  ops=[{'instance':'far_lintel','socket':'SOCKET_JAMB_2.2'}] if rid=='ancient_service_threshold' else [{'instance':'operations','socket':db[operation]['sockets'][-1]['name']}]
  recipes.append({'id':rid,'status':'reusable template, no canonical location/gameplay spawning','dependencies':sorted(set(i['assetId'] for i in instances)),'instances':instances,'joins':joins,'bounds':{'min':lo,'max':hi},'approach':{'min':[lo[0]-10,-radius,-radius],'max':[0,radius,radius]},'exit':{'min':[0,-radius,-radius],'max':[hi[0]+10,radius,radius]},'focalSocket':focal,'operationsSockets':ops,'clearanceValidation':{'method':'201 sphere samples along X against transformed compound oriented boxes','probeRadiusMetres':radius,'minimumSurfaceDistanceMetres':nearest,'sampleComparisons':samples,'scope':'authored proxies only; unrepresented pressure skins and decorative meshes not collision-certified'},'states':[{'id':'working','visibleInstances':[i['id'] for i in instances],'description':'Fixed equipment and seated payload present'},{'id':'occupied','visibleInstances':[i['id'] for i in instances],'description':'Same geometry; occupancy remains consumer behavior'},{'id':'after_use','visibleInstances':[i['id'] for i in instances if i['id']!='payload'],'description':'Removable payload absent; no damage state implied'}],'normalization':'none; unit scale in absolute metres'})
 dest=ROOT/'design/asset-bank/assemblies.json';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps({'schemaVersion':1,'modelCount':12,'recipeCount':12,'unit':'metre','coordinateSystem':'glTF +X forward +Y up +Z starboard','socketToleranceMetres':.0002,'recipes':recipes},indent=2)+'\n');print('ASSEMBLIES_DONE',len(recipes),flush=True)

if __name__=='__main__':
 if '--assemblies' in sys.argv:assemblies()
 elif '--contacts' in sys.argv:contacts('--source' in sys.argv,'--top' in sys.argv)
 else:main()
