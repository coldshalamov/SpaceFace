import bpy, sys, os
ROOT = r'C:\Users\93rob\Documents\GitHub\SpaceFace'
sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'art', 'blender'))
from spaceface_export import export_gltf
# ensure object mode + active
meshes = [o for o in bpy.data.objects if o.type=='MESH']
if meshes:
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        o.select_set(True)
part_id = 'place_asteroid_rock_c'
evidence = os.path.join(ROOT, 'assets/ships/parts/revamp-evidence', part_id)
os.makedirs(evidence, exist_ok=True)
out = os.path.join(evidence, '_export_tmp.glb')
try:
    export_gltf(out, {'kind':'place','id':part_id,'assetId':part_id,'slot':'place','tri_budget':25000,'min_hull_tris':0,'required_maps':['ao','roughness']})
    print('EXPORT_OK', out, os.path.getsize(out))
except Exception as e:
    print('EXPORT_FAIL', e)
    # fallback raw gltf export
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=True, export_yup=True)
    print('RAW_EXPORT', out, os.path.getsize(out) if os.path.exists(out) else 0)
