import bpy, os, json, math
from mathutils import Vector
D=os.environ.get('INSPECTION_DIR','./inspection-input')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=False;s.render.resolution_x=480;s.render.resolution_y=400;s.render.resolution_percentage=100;s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=88;s.world.color=(.15,.15,.15)
s.view_settings.view_transform='Standard'
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=65
for loc in [(25,-30,40),(-30,-15,20),(10,30,25)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=18000;l.data.size=25;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
report={}
for name in ['dead-hulk','drill-platform','drill-platform-cold','seamed-asteroid']:
 for o in list(bpy.data.objects):
  if o.type in ['MESH','EMPTY']:bpy.data.objects.remove(o,do_unlink=True)
 bpy.ops.import_scene.gltf(filepath=f'{D}/{name}-decoded.glb')
 meshes=[]
 for o in bpy.data.objects:
  if o.type=='MESH':
   o.hide_render=any(t in o.name.lower() for t in ['lod1','lod2','collision'])
   if not o.hide_render:meshes.append(o)
 coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box];mn=Vector(tuple(min(v[i] for v in coords) for i in range(3)));mx=Vector(tuple(max(v[i] for v in coords) for i in range(3)));center=(mn+mx)/2
 report[name]={'bounds_blender':[list(mn),list(mx)],'meshes':[o.name for o in meshes],'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'materials':list({m.name for o in meshes for m in o.data.materials if m})}
 for view,offset in [('oblique',(45,-65,65)),('top',(0,0,100))]:
  cam.location=center+Vector(offset);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=f'{D}/{name}-{view}.jpg';bpy.ops.render.render(write_still=True)
json.dump(report,open(f'{D}/geometry.json','w'),indent=2)
