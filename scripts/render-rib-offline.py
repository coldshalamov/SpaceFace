# Blender diagnostic: source arrays and exported glTF, matched neutral lighting.
import bpy, math, json, os, sys, argparse
from mathutils import Vector,Matrix
parser=argparse.ArgumentParser();parser.add_argument('--input-dir',default='artifacts');parser.add_argument('--output-dir',default='artifacts');parser.add_argument('--motion',action='store_true');parser.add_argument('--smooth-compare',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=os.path.abspath(args.input_dir);OUT=os.path.abspath(args.output_dir);os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.world.color=(0.12,0.12,0.12);scene.render.image_settings.file_format='JPEG';scene.render.image_settings.quality=92
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
bpy.ops.object.camera_add(location=(33,-48,32));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=33
for loc,power,size in [((20,-30,38),17000,25),((-25,-10,20),11000,20),((10,25,30),18000,18)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,5))-o.location).to_track_quat('-Z','Y').to_euler()
# glTF Y-up becomes Blender Z-up. Source uses the same conversion.
conv=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
motion='--motion' in sys.argv
smooth='--smooth-compare' in sys.argv
for label in (['candidate-charge','candidate-flee'] if motion else (['first-good','candidate'] if smooth else ['baseline','candidate'])):
 for mode,view in ([('export','oblique'),('export','top')] if motion else [('source','oblique'),('export','oblique'),('export','top'),('export','side')]):
  for o in list(bpy.data.objects):
   if o.type=='MESH' or o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)
  if mode=='export':bpy.ops.import_scene.gltf(filepath=f'{ROOT}/{label}.gltf')
  else:
   data=json.load(open(f'{ROOT}/{label}-source.json'))
   for m in data['meshes']:
    mesh=bpy.data.meshes.new(m['name']);verts=list(zip(*[iter(m['positions'])]*3));faces=list(zip(*[iter(m['indices'])]*3));mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(m['name'],mesh);scene.collection.objects.link(obj);obj.matrix_world=conv@Matrix([m['matrix'][i::4] for i in range(4)])
    for p in mesh.polygons:p.use_smooth=True
    mesh.normals_split_custom_set_from_vertices(list(zip(*[iter(m['normals'])]*3)))
    if m['uvs']:
     uv=mesh.uv_layers.new();coords=list(zip(*[iter(m['uvs'])]*2))
     for loop in mesh.loops:uv.data[loop.index].uv=coords[loop.vertex_index]
    mat=bpy.data.materials.new(m['name']);mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=m['roughness'];bs.inputs['Metallic'].default_value=0
    bs.inputs['Emission Color'].default_value=(*m['emissive'],1);bs.inputs['Emission Strength'].default_value=m['emissiveIntensity']
    tc=nodes.new('ShaderNodeTexCoord');mapping=nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(3,2,1);links.new(tc.outputs['UV'],mapping.inputs[0]);img=nodes.new('ShaderNodeTexImage');img.image=bpy.data.images.load(f'{ROOT}/tissue_basecolor.jpg',check_existing=True);links.new(mapping.outputs[0],img.inputs[0]);mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*m['color'],1);links.new(img.outputs['Color'],mix.inputs[1]);links.new(mix.outputs[0],bs.inputs['Base Color'])
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(f'{ROOT}/tissue_normal.png',check_existing=True);tex.image.colorspace_settings.name='Non-Color';links.new(mapping.outputs[0],tex.inputs[0]);normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.9;links.new(tex.outputs[0],normal.inputs['Color']);links.new(normal.outputs[0],bs.inputs['Normal']);obj.data.materials.append(mat)
  target=Vector((3,-.5,4));loc={'oblique':(3,29.5,4+30*math.sqrt(3)),'top':(3,-.5,60),'side':(45,-.5,4)}[view];cam.location=loc;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=f'{OUT}/{label}-{mode}-{view}.jpg';bpy.ops.render.render(write_still=True)
