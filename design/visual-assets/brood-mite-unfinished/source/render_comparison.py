import bpy,sys,json,math,hashlib
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];O=R/'candidate-m7/review';O.mkdir(exist_ok=True)
items=[('source',R/'study-m6/mite-M6-source.blend')]+[(f'LOD{i}',R/f'candidate-m7/mite-M7-LOD{i}-review.glb') for i in range(3)]
if '--only' in sys.argv:items=[r for r in items if r[0]==sys.argv[sys.argv.index('--only')+1]]
receipts=[]
center=Vector((.35,0,.62));extent=11.301
for name,path in items:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 if path.suffix=='.blend':bpy.ops.wm.open_mainfile(filepath=str(path))
 else:bpy.ops.import_scene.gltf(filepath=str(path))
 scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH'];pts=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
 lo=[min(v[i] for v in pts) for i in range(3)];hi=[max(v[i] for v in pts) for i in range(3)]
 for label,loc,power,size in [('key',(.2,-.7,1),1700,.8),('fill',(-.8,.2,.5),800,1),('rim',(.5,.8,.6),1800,.6)]:
  d=bpy.data.lights.new(label,'AREA');d.energy=power*extent*extent/100;d.shape='DISK';d.size=extent*size;o=bpy.data.objects.new(label,d);scene.collection.objects.link(o);o.location=center+Vector(loc)*extent;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
 world=bpy.data.worlds.new('Matched neutral diagnostic');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.12,.12,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.world=world
 scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
 scene.render.resolution_x=850;scene.render.resolution_y=680;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.render.film_transparent=True
 cd=bpy.data.cameras.new('Matched camera');cam=bpy.data.objects.new('Matched camera',cd);scene.collection.objects.link(cam);scene.camera=cam;cd.type='ORTHO'
 views=[('top',(0,0,3)),('chase60',(0,-1.5,2.598076)),('mouth',(3,-1,.55)),('windup',(.3,-2,1.8)),('side',(.3,-3,.25)),('underside',(1.7,-1.1,-1.0))]
 if '--views' in sys.argv:views=[v for v in views if v[0] in sys.argv[sys.argv.index('--views')+1].split(',')]
 ld=bpy.data.lights.new('Ventral diagnostic fill','AREA');ld.energy=650;ld.size=6;ll=bpy.data.objects.new('Ventral diagnostic fill',ld);scene.collection.objects.link(ll);ll.location=(3,-4,-7);ll.rotation_euler=(-ll.location).to_track_quat('-Z','Y').to_euler()
 for view,pos in views:
  ll.hide_render=view!='underside'
  target=Vector((1.75,0,-.16)) if view=='mouth' else center;cd.ortho_scale=4.2 if view=='mouth' else extent*1.25;cam.location=target+Vector(pos)*extent;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
  if view=='windup':
   for side,tag in [(1,'PORT'),(-1,'STARBOARD')]:bpy.data.objects['MOTION_MITE_MEMBRANE_'+tag].rotation_euler.x=side*.3
  scene.render.filepath=str(O/f'{name}-{view}.png');bpy.ops.render.render(write_still=True)
 receipts.append({'subject':name,'file':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'boundsBlender':{'min':lo,'max':hi},'cameraCenter':list(center),'orthoScale':extent*1.25,'runtimeLook':False,'maps':'actual shared Brood normal/ORM pair, not KTX2 runtime shader'})
(O/('render-receipts-extra.json' if '--views' in sys.argv else 'render-receipts.json')).write_text(json.dumps(receipts,indent=2))
