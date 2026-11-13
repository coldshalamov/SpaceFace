# Component-only engine authoring helper; invoked by refine_engine_ion_small.mjs.
import bpy,bmesh,json,sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:];b=Path(args[0]);data=json.loads((b/'components-source.json').read_text());variant='rivets-rings'
if bpy.app.version[:2] != (5,1): raise RuntimeError('Reviewed reduction requires Blender 5.1')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
report=[]
for comp in data['components']:
 if comp['name'].startswith('ring') and variant=='rivets':continue
 m=bpy.data.meshes.new(comp['name']);m.from_pydata(comp['verts'],[],comp['faces']);m.update();o=bpy.data.objects.new(comp['name'],m);bpy.context.collection.objects.link(o)
 for name,uvs in comp['uvs'].items():
  uv=m.uv_layers.new(name=name)
  for poly in m.polygons:
   for li in poly.loop_indices:uv.data[li].uv=(uvs[m.loops[li].vertex_index][0],1-uvs[m.loops[li].vertex_index][1])
 for poly in m.polygons:poly.use_smooth=True
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bm=bmesh.new();bm.from_mesh(m);bmesh.ops.remove_doubles(bm,verts=bm.verts[:],dist=1e-6);bm.to_mesh(m);bm.free()
 dec=o.modifiers.new('Scoped component reduction','DECIMATE');dec.ratio=.05 if comp['name'].startswith('rivet') else .3;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
 m.calc_loop_triangles();report.append({'name':o.name,'before':len(comp['faces']),'after':len(m.loop_triangles)})
 o.select_set(False)
bpy.ops.object.select_all(action='SELECT')
# Input positions are already glTF coordinates, so suppress Blender's axis conversion.
bpy.ops.export_scene.gltf(filepath=str((b/(variant+'-components.glb')).resolve()),export_format='GLB',use_selection=True,export_yup=False,export_normals=True,export_tangents=True)
bpy.ops.wm.save_as_mainfile(filepath=str((b/(variant+'.blend')).resolve()))
(b/(variant+'-decimation.json')).write_text(json.dumps(report,indent=2))

