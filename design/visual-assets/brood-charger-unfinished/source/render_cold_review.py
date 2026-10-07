"""Cold reimport of single resident GLB. Exact pinned views and runtime rigid poses."""
import bpy,math,sys,json,hashlib
from pathlib import Path
from mathutils import Vector,Quaternion
R=Path(__file__).resolve().parents[1];O=R/'candidate-c6';D=O/'review';D.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(O/'brood_charger_v01.glb'))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];scene=bpy.context.scene
# Fixed envelope across every tier and state, no auto-fit shifts.
lo=Vector((-9.7,-8.133986,-1.28));hi=Vector((11,8.133986,3.3814));center=(lo+hi)*.5;extent=max(hi-lo)
for name,loc,power,size in [('key',(.2,-.7,1),1700,.8),('fill',(-.8,.2,.5),800,1),('rim',(.5,.8,.6),1800,.6),('ventral',(.2,-.5,-1),650,.8)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power*extent*extent/100;d.shape='DISK';d.size=extent*size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=center+Vector(loc)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
w=bpy.data.worlds.new('Neutral diagnostic');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.12,.12,.12,1);w.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=w
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=840;scene.render.resolution_y=660;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True;scene.view_settings.view_transform='AgX'
cd=bpy.data.cameras.new('Cold diagnostic');cam=bpy.data.objects.new('Cold diagnostic',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO';views=[('top',(0,0,3)),('chase60',(0,-1.5,2.598076)),('threequarter',(1.6,-2,1.8)),('fork',(3,-.65,.8)),('underside',(1.5,-1.5,-1.5)),('side',(.1,-3,.05))]
rests={o.name:(o.location.copy(),o.rotation_quaternion.copy())for o in bpy.context.scene.objects if o.name.startswith('MOTION_')}
def pose(f):
 for name,(p,q)in rests.items():
  o=bpy.data.objects[name];o.location=p;o.rotation_mode='QUATERNION';o.rotation_quaternion=q
  if 'PADDLE_'in name:o.rotation_quaternion=q@Quaternion((1,0,0),(1 if name.endswith('PORT')else-1)*.42*f)
  else:o.location.x+=.8*f
 bpy.context.view_layer.update()
def camera(view,pos):
 target=Vector((5.8,0,.2))if view=='fork'else center;cd.ortho_scale=14 if view=='fork'else extent*1.18;cam.location=target+Vector(pos)*extent;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
receipts=[]
for lod in range(3):
 for ob in meshes:ob.hide_render=not ob.name.startswith(f'LOD{lod}_')
 pose(0)
 for view,pos in views:
  camera(view,pos);f=D/f'lod{lod}-{view}.png';scene.render.filepath=str(f);bpy.ops.render.render(write_still=True);receipts.append({'file':f.name,'lod':lod,'fraction':0,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'camera':list(cam.matrix_world),'orthoScale':cd.ortho_scale})
 camera('motion',(.4,-2,1.8))
 for phase,fraction in [('approach',0),('windup',1),('attack',.08),('recovery',.65)]:
  pose(fraction);f=D/f'lod{lod}-{phase}.png';scene.render.filepath=str(f);bpy.ops.render.render(write_still=True);receipts.append({'file':f.name,'lod':lod,'phase':phase,'fraction':fraction,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'pivots':{name:{'translation':list(bpy.data.objects[name].location),'quaternionWXYZ':list(bpy.data.objects[name].rotation_quaternion)}for name in rests}})
# Explicit no-map diagnostic to identify texture lamellae versus topology defects.
pose(0)
for ob in meshes:ob.hide_render=not ob.name.startswith('LOD0_')
for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 for node in mat.node_tree.nodes:
  if node.type=='BSDF_PRINCIPLED':
   for socket in ['Normal']:
    for link in list(node.inputs[socket].links):mat.node_tree.links.remove(link)
camera('threequarter',(1.6,-2,1.8));scene.render.filepath=str(D/'lod0-untextured-normal-check.png');bpy.ops.render.render(write_still=True)
(D/'render-receipts.json').write_text(json.dumps(receipts,indent=2,default=lambda x:list(x)))
