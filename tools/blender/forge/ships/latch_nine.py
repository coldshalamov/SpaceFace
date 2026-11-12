"""NEW Latch Nine reconstruction. Original missing bytes are not claimed recovered.
Precise amber industrial signal tender; Forge source is portable within this checkpoint.
Coordinates: Blender +X nose,+Y port,+Z up. Physical geometry and sockets share this recipe.
"""
import sys,json,math,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import bpy,bmesh
import forge as F
import forge_export as E
ROOT=Path(__file__).resolve().parents[4]
SOURCE_DIR=ROOT/'assets/ships/forge/sources/latch_nine'
SOURCE_DIR.mkdir(parents=True,exist_ok=True)
# Structural collision uses these actual seated solids, not a convex envelope over empty space.
STRUCTURE=[
 ('Keel',(-.5,0,-.25),(12,4.3,1.1),'paint2'),
 ('BayFloor',(-.7,.5,.42),(8.4,7.5,.38),'dark'),
 ('PortRim',(-.7,4.4,1.18),(9.4,1.15,1.6),'paint'),
 ('StarboardRim',(-.7,-3.6,1.18),(9.4,1.25,1.6),'paint'),
 ('AftRim',(-5.05,.4,1.18),(1.1,7.15,1.6),'paint'),
 ('ForeRim',(3.65,.4,1.18),(1.0,7.15,1.6),'paint'),
 ('AftDriveBridge',(-6.9,0,-.05),(3.5,4.9,1.2),'paint2'),
 ('PortDrive',(-7.5,2.35,.1),(3.9,1.35,1.55),'paint2'),
 ('StarboardDrive',(-7.5,-2.35,.1),(3.9,1.35,1.55),'paint2'),
 ('ForeShoulder',(5.2,0,-.02),(2.1,3.8,1.35),'paint2'),
 ('OpticalBow',(6.65,0,-.08),(1.7,3.0,1.1),'paint2'),
 ('Nose',(7.8,0,-.16),(.8,1.65,.78),'paint2'),
 ('HingeA',(-3.4,-4.18,1.12),(1.55,1.65,.6),'gunmetal'),
 ('HingeB',(-.5,-4.18,1.12),(1.55,1.65,.6),'gunmetal'),
 ('HingeC',(2.4,-4.18,1.12),(1.55,1.65,.6),'gunmetal'),
 ('PortStrake',(-.6,5.1,.55),(8.1,.48,.7),'paint2'),
 ('StarboardStrake',(-.6,-4.3,.4),(8.1,.45,.55),'paint2'),
 ('DriveBracePort',(-6.1,3.0,.18),(1.2,1.2,1.2),'paint'),
 ('DriveBraceStbd',(-6.1,-3.0,.18),(1.2,1.2,1.2),'paint'),
]
# Hollow, supported aft cages: four real slabs per drive leave the engine mouth open.
for side,y in [('port',2.35),('stbd',-2.35)]:
 for suffix,c,size in [('top',(-9.7,y,.81),(.8,1.6,.18)),('bottom',(-9.7,y,-.61),(.8,1.6,.18)),('left',(-9.7,y-.71,.1),(.8,.18,1.25)),('right',(-9.7,y+.71,.1),(.8,.18,1.25))]:
  STRUCTURE.append(('DriveCage_'+side+'_'+suffix,c,size,'gunmetal'))
# Two source-solid control-nozzle seats keep the port mouths inside the native compound.
for name,x in [('aft',-3.5),('fore',2.6)]:
 STRUCTURE.append(('PortControlSeat_'+name,(x,5.33,.7),(.55,.26,.55),'gunmetal'))
PADDLES=[{'id':n,'pivot':[x,-4.35,1.65],'length':3.8,'width':1.05,'thickness':.32,'min':-math.pi/3,'max':math.pi*5/12} for n,x in [('a',-3.4),('b',-.5),('c',2.4)]]
SOCKETS=[
 ('MAIN_PORT',[-10.07,2.35,.10],[-1,0,0],900),('MAIN_STBD',[-10.07,-2.35,.10],[-1,0,0],900),
 ('REVERSE_PORT',[7.5,1.23,.12],[1,0,0],500),('REVERSE_STBD',[7.5,-1.23,.12],[1,0,0],500),
 ('PORT_FORE',[2.6,5.46,.7],[0,1,0],400),('PORT_AFT',[-3.5,5.46,.7],[0,1,0],400),
 ('STBD_FORE',[3.2,-4.53,.55],[0,-1,0],400),('STBD_AFT',[-4.25,-4.53,.55],[0,-1,0],400),
]
def coords(v):return [v[0],v[2],-v[1]]
def split_drive_core(s,obj,name):
 # Preserve a dedicated per-socket emitter through LOD welding. Runtime can then extinguish
 # every mouth independently from actual force telemetry, without lighting unrelated drives.
 bm=bmesh.new();bm.from_mesh(obj.data)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index!=2],context='FACES')
 mesh=bpy.data.meshes.new(name);bm.to_mesh(mesh);bm.free()
 for mat in obj.data.materials:mesh.materials.append(mat)
 core=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(core);s.add(core)
 bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index==2],context='FACES');bm.to_mesh(obj.data);bm.free()
 core['spaceface']={'instance':False};s.hook_part('HOOK_LATCH_THRUSTER_'+name,core)
def build():
 F.reset_scene();s=F.Ship('latch_nine',{'paint':'#ada58f','paint2':'#30383d','hazard':'#c48532','stripe':'#c48532','dark':'#141c21','gunmetal':'#343e45','bare':'#899795','glow_drive':'#85bfce'})
 for name,center,size,mat in STRUCTURE:
  ob=F.box(s,name,center,size,mat,bevel=.09 if mat=='paint' else .06);ob['latch_structural']=True
 # Rim seams are construction gaps; narrow occupation bands wrap rather than cover the machinery.
 for x in (-3.6,-.7,2.1):
  F.box(s,'RimSegmentPort'+str(x),(x,4.4,2.02),(2.6,1.02,.10),'paint',bevel=.045)
 F.box(s,'OccupationBand',(-.7,4.42,2.1),(8.15,.17,.04),'hazard',bevel=.012)
 # Three unmistakable physical signal blades. Every visible detail rides its actual pivot.
 for p in PADDLES:
  x,y,z=p['pivot'];start=len(s.objects);n=p['id']
  F.cylinder(s,'HingeAxle_'+n,(x,y,z-.3),(x,y,z+.08),.36,material='bare',segments=24)
  outline=[(x-.525,y+.2),(x-.525,y-3.55),(x-.32,y-3.8),(x+.32,y-3.8),(x+.525,y-3.55),(x+.525,y+.2)]
  # Reverse clockwise outline for top-facing Forge plate.
  F.plate(s,'SignalBlade_'+n,outline,z0=z-.16,thickness=.32,material='hazard',chamfer=.08,side_material='gunmetal')
  F.box(s,'BladeInset_'+n,(x,y-1.64,z+.19),(.66,2.62,.08),'hazard',bevel=.045)
  F.box(s,'BladeWitness_'+n,(x,y-3.27,z+.2),(.73,.4,.07),'glow_warm',bevel=.025)
  F.box(s,'BladeSpine_'+n,(x,y-1.42,z+.25),(.09,2.12,.06),'gunmetal',bevel=.015)
  for yy in (.05,-2.83):F.box(s,'BladeCross_'+n+str(yy),(x,y+yy,z+.23),(.84,.08,.06),'gunmetal',bevel=.01)
  s.motion_group('latch_paddle_'+n,(x,y,z),s.objects[start:])
 # Exposed actuation bay: two independent long linkages and a shielded optical carriage.
 for x in (-3.15,-.9):
  F.box(s,'LinearRail'+str(x),(x,.4,.83),(.55,5.7,.40),'gunmetal',bevel=.06)
  F.cylinder(s,'Ram'+str(x),(x,-2.25,1.03),(x,.45,1.03),.21,material='dark',segments=20)
  F.cylinder(s,'Piston'+str(x),(x,.4,1.03),(x,2.95,1.03),.115,material='bare',segments=16)
  for y in (-2.35,2.98):F.box(s,'PistonMount'+str(x)+str(y),(x,y,1.0),(.85,.42,.55),'gunmetal',bevel=.055)
 F.box(s,'OpticalCarriage',(1.65,.5,.92),(1.4,4.95,.67),'gunmetal',bevel=.08)
 for x in (.95,2.35):F.box(s,'ShutterFrame'+str(x),(x,.8,1.42),(.18,3.35,.35),'paint',bevel=.04)
 for y in (-.92,2.52):F.box(s,'ShutterCross'+str(y),(1.65,y,1.42),(1.57,.2,.35),'paint',bevel=.04)
 st=len(s.objects)
 F.box(s,'OpticalShutter',(1.65,1.85,1.4),(1.16,1.15,.15),'paint2',bevel=.04)
 F.box(s,'OpticalSlit',(1.65,.27,1.37),(1.02,.16,.09),'glow_amber',bevel=.015)
 s.motion_group('latch_shutter',(1.65,1.85,1.4),s.objects[st:])
 # Recessed ribs and deliberately spaced fasteners, retained only at closer LODs.
 s.detail=1
 F.boxes(s,'BayRibs',[((x,.5,.68),(.07,6.3,.09)) for x in [-4.25,-3.95,-2.5,-2.2,-1.95,-.25,.1,2.75,3.05]],'gunmetal',bevel=.01)
 F.boxes(s,'BayFasteners',[((x,y,.76),(.13,.13,.08)) for x in [-4,-2.2,.1,2.9] for y in [-2.7,-1.35,0,1.35,2.8]],'bare',bevel=.025)
 for y in (-1,1):
  F.beams(s,'ForeRibs'+str(y),[((4.2,y*1.75,.66),(7.6,y*.65,.35)),((4.2,y*1.4,.73),(7.5,y*.5,.4))],.10,'gunmetal')
 s.detail=0
 # Supported engine bells on the existing drive nacelles.
 for name,y in [('MAIN_STBD',-2.35),('MAIN_PORT',2.35)]:
  bell=F.nozzle(s,'MainDrive'+name,(-10.05,y,.10),.58,.8,material='gunmetal',glow='glow_drive');split_drive_core(s,bell,name)
 # Six directional control nozzles have actual dark mouths seated in mounts.
 for name,pos,direction,limit in SOCKETS[2:]:
  inside=tuple(pos[i]-direction[i]*.34 for i in range(3));outer=tuple(pos)
  F.cylinder(s,'RCSMount_'+name,inside,outer,.23,.19,'gunmetal',segments=16,cap_material='dark')
  core=tuple(pos[i]+direction[i]*.008 for i in range(3));back=tuple(pos[i]-direction[i]*.012 for i in range(3))
  emitter=F.cylinder(s,'RCSCore_'+name,back,core,.083,material='glow_drive',segments=12);emitter['spaceface']={'instance':False};s.hook_part('HOOK_LATCH_THRUSTER_'+name,emitter)
 for name,pos,direction,limit in SOCKETS:s.socket('SOCKET_LATCH_'+name,pos,direction)
 s.socket_names=['SOCKET_LATCH_'+x[0] for x in SOCKETS]
 F.light(s,'PortNav',(-.7,5.2,.95),'glow_red',.10);F.light(s,'StbdNav',(3.25,-4.32,.91),'glow_green',.10)
 F.beacon(s,'ServiceBeacon',(-6.5,0,1.01),size=.16)
 s.finish();return s

def main():
 s=build();SOURCE_DIR.mkdir(parents=True,exist_ok=True)
 bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR/'LatchNine.blend'))
 spec={'layout':'place','file':'place_latch_nine','asset_id':'SF_PLACE_LATCH_NINE','part_id':'latch-nine','new_place':True,'no_collision':True}
 paths=E.export_place(s,spec,preview='--live' not in sys.argv);path=Path(paths[0][0])
 directions={'SOCKET_LATCH_'+n:coords(d) for n,p,d,f in SOCKETS}
 def stamp(doc):
  # The same actual structural/paddle recipe certifies the source GLB. Release tooling
  # preserves this metadata byte-bound to each published asset; census compares all boxes.
  boxes=[{'name':n,'centerWU':coords(c),'sizeWU':[d[0],d[2],d[1]]} for n,c,d,m in STRUCTURE]
  boxes += [{'name':'paddle-'+p['id'],'centerWU':[p['pivot'][0],p['pivot'][2],-p['pivot'][1]+(p['length']-.2)/2],'sizeWU':[p['width'],p['thickness'],p['length']+.2]} for p in PADDLES]
  doc.setdefault('asset',{}).setdefault('extras',{})['authoredCompound']={'schema':'spaceface.authoredCompound.v1','assetId':'SF_PLACE_LATCH_NINE','sourceRecipeSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'collision':{'kind':'bounded-box-compound','units':'WU','boxes':boxes},'referenceState':'rest','strictClearVolumes':{}}
  for n in doc['nodes']:
   if 'HOOK_LATCH_THRUSTER_' in n.get('name',''):n.setdefault('extras',{}).setdefault('spaceface',{})['instance']=False
   if n.get('name') in directions:n.setdefault('extras',{}).setdefault('spaceface',{}).update({'role':'vfx','forward':directions[n['name']]})
 doc=E.patch_glb_json(str(path),stamp)
 contract={'schemaVersion':1,'status':'new-reconstruction-unpromoted','assetId':'SF_PLACE_LATCH_NINE','units':'metres','renderScale':1,'sourceAxes':'+X nose,+Y port,+Z up','glTFMapping':'x,z,-y','glbSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'staticSlabs':[{'id':n,'center':coords(c),'size':[d[0],d[2],d[1]]} for n,c,d,m in STRUCTURE],'paddles':[{**p,'pivot':coords(p['pivot']),'axis':[0,-1,0],'restDirection':[0,0,1]} for p in PADDLES],'thrusters':[{'id':n,'node':'SOCKET_LATCH_'+n,'position':coords(p),'exhaust':coords(d),'maxForce':f} for n,p,d,f in SOCKETS]}
 (SOURCE_DIR/'latch-nine.geometry.json').write_text(json.dumps(contract,indent=2)+'\n')
 (ROOT/'src/data/latchNineGeometry.js').write_text('// Generated from the editable Forge Latch source.\nexport const LATCH_GEOMETRY = Object.freeze('+json.dumps(contract,separators=(',',':'))+');\n')
 bindings=[{'id':n['name'][7:].lower(),'node':n['name'],'parent':None,'restPose':{'translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1])},'requiredAtLod':[0,1,2]} for n in doc['nodes'] if n.get('name','').startswith('MOTION_')]
 bank={'schema':'spaceface.rigidMotionBank.v1','rigId':'latch_nine_native_paddles','sourceAssetId':'SF_PLACE_LATCH_NINE','sourceGlbSha256':contract['glbSha256'],'fps':60,'bindings':bindings,'clips':[{'name':'source_rest_pose','durationS':1/60,'loop':False,'endMode':'hold','channels':[{'group':b['id'],'path':'translation','times':[0,1/60],'values':[0]*6,'interpolation':'linear'} for b in bindings]}],'simulationAuthority':'Native Latch paddle angles; presentation applies after the rest-only bank. No renderer motor clock.'}
 (ROOT/'assets/ships/motions/latch-nine.motion.json').write_text(json.dumps(bank,indent=2)+'\n')
 print('LATCH_RECONSTRUCTION_EXPORTED',path)
if __name__=='__main__':main()
