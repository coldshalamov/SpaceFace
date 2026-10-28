import bpy, json, pathlib
from mathutils import Vector
D=pathlib.Path(__file__).resolve().parent
data=json.loads((D/'geometry.json').read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.samples=32; s.cycles.use_denoising=False
s.render.resolution_x=1500; s.render.resolution_y=850; s.render.resolution_percentage=100
s.render.image_settings.file_format='JPEG'; s.render.image_settings.quality=94
s.world.use_nodes=True; s.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.20,.25,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
s.view_settings.view_transform='AgX'
for model,dx in zip(data['models'],[-29,29]):
 for j,m in enumerate(model['meshes']):
  verts=[(p[0]+dx,p[1],p[2]) for p in m['positions']]
  faces=[tuple(m['indices'][i:i+3]) for i in range(0,len(m['indices']),3)]
  mesh=bpy.data.meshes.new(model['name']+str(j)); mesh.from_pydata(verts,[],faces); mesh.update()
  if m.get('normals'):
   for p in mesh.polygons:p.use_smooth=True
   mesh.normals_split_custom_set_from_vertices(m['normals'])
  obj=bpy.data.objects.new(mesh.name,mesh);s.collection.objects.link(obj)
  mat=bpy.data.materials.new(mesh.name);mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF')
  p.inputs['Base Color'].default_value=(*m['color'],1);p.inputs['Metallic'].default_value=m['metalness'];p.inputs['Roughness'].default_value=m['roughness']
  p.inputs['Emission Color'].default_value=(*m['emissive'],1);p.inputs['Emission Strength'].default_value=m['emissiveIntensity']
  mesh.materials.append(mat)
for loc,power in [((-30,-35,50),70000),((40,25,30),45000),((0,-10,-30),20000)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=40;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(0,-90,70));cam=bpy.context.object;s.camera=cam;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=120
bpy.context.view_layer.update()
ink=bpy.data.materials.new('label');ink.use_nodes=True;nodes=ink.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=(.85,.9,.95,1);em.inputs[1].default_value=1;ink.node_tree.links.new(em.outputs[0],out.inputs[0])
for text,x,y,size in [('RUNAWAY KILN / PROCEDURAL SOURCE COMPARISON',-55,29,2),('BEFORE: NAVIGATION BEACON',-53,22,1.8),('AFTER: SEALED CARGO CANISTER',5,22,1.8),('Same 23 WU entity radius. Static source geometry, not a live game-camera capture.',-55,-30,1.45)]:
 curve=bpy.data.curves.new('label','FONT');curve.body=text;curve.size=size;obj=bpy.data.objects.new('label',curve);s.collection.objects.link(obj);obj.location=cam.matrix_world@Vector((x,y,-80));obj.rotation_euler=cam.rotation_euler;curve.materials.append(ink)
s.render.filepath=str(D/'source-comparison.jpg');bpy.ops.render.render(write_still=True)
