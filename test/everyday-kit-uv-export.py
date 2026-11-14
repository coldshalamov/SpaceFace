"""Run with Blender: verify deterministic export preserves face-corner data."""
import importlib.util
from pathlib import Path

import bpy


root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('everyday_kit', root / 'tools/blender/build_everyday_space_kit.py')
kit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kit)
kit.reset_scene()

mesh = bpy.data.meshes.new('uv-correspondence')
mesh.from_pydata([(0, 0, 0), (2, 0, 0), (2, 1, 0), (0, 1, 1)], [], [(0, 2, 3), (0, 1, 2)])
obj = bpy.data.objects.new('UV check', mesh)
bpy.context.collection.objects.link(obj)
for role in ['esk_struct_alloy', 'esk_paint_civic_bone']:
    mesh.materials.append(kit.material(role))
mesh.polygons[0].material_index = 1
mesh.polygons[1].material_index = 0
for poly in mesh.polygons:
    poly.use_smooth = True
for name, offset in [('UVMap', 0), ('Lightmap', 3)]:
    uv = mesh.uv_layers.new(name=name)
    for li, pair in enumerate([(0, 0), (1, 1), (0, 1), (2, 0), (3, 0), (3, 1)]):
        uv.data[li].uv = (pair[0] + offset, pair[1])


def snapshot(source):
    source.calc_tangents(uvmap='UVMap')
    return {
        tuple(poly.vertices): {
            'material': poly.material_index,
            'smooth': poly.use_smooth,
            'uv': {uv.name: [tuple(uv.data[i].uv) for i in poly.loop_indices] for uv in source.uv_layers},
            'normals': [tuple(round(v, 5) for v in source.corner_normals[i].vector) for i in poly.loop_indices],
            'tangents': [tuple(round(v, 5) for v in source.loops[i].tangent) for i in poly.loop_indices],
            'signs': [source.loops[i].bitangent_sign for i in poly.loop_indices],
        }
        for poly in source.polygons
    }


before = snapshot(obj.data)
kit.stabilize_mesh_for_export(obj)
assert before == snapshot(obj.data), 'Face materials, UVs, normals or tangents changed'
assert [poly.material_index for poly in obj.data.polygons] == [0, 1], 'Fixture must reorder faces'
for edge in obj.data.edges:
    edge.use_edge_sharp = tuple(sorted(edge.vertices)) == (0, 2)
before = snapshot(obj.data)
kit.stabilize_mesh_for_export(obj)
assert before == snapshot(obj.data), 'Sharp edge split normals or tangents changed'
assert any(edge.use_edge_sharp and tuple(sorted(edge.vertices)) == (0, 2) for edge in obj.data.edges)
print('PASS: deterministic reorder preserves UVs, face materials, normals and tangents')
