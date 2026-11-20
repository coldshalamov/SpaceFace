"""Rebuild the small native contract donor from its pinned source geometry.

Run with Blender --background --python <this file>. No generated game GLB is read or written.
"""
from pathlib import Path
import json
import bpy

HERE = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
document = json.loads((HERE / 'contract-source.json').read_text(encoding='utf8'))
for item in document['meshes']:
    mesh = bpy.data.meshes.new(item['name'])
    indices = item['indices']
    mesh.from_pydata(item['positions'], [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
    if 'uv' in item:
        layer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            layer.data[loop.index].uv = item['uv'][loop.vertex_index]
    if 'normals' in item:
        for face in mesh.polygons:
            face.use_smooth = True
        mesh.normals_split_custom_set_from_vertices(item['normals'])
    obj = bpy.data.objects.new(item['name'], mesh)
    bpy.context.scene.collection.objects.link(obj)
    for key, value in item['extras'].items():
        obj[key] = value
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'contract.blend'), compress=True)
