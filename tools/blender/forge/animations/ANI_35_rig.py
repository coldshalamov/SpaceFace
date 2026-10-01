"""ANI-35 — engine-part nozzle gimbal rigging (import → pivot → reparent → export).

The parts-library engine GLBs are hand-finished assets (MCP revamp pass), so the
rig is applied in-place rather than regenerated: each nozzle assembly is parked
under a MOTION_ENG_NOZZLE_* pivot the motion bank can articulate.

- engine_ion_twin : Twin_Nozzle_P/S already own their drive hooks — they swing
  under MOTION_ENG_NOZZLE_P/S.
- engine_plasma_ring: Plasma_Ring_Outer + HOOK_DRIVE_PLUME precess under
  MOTION_ENG_NOZZLE.
- engine_vector   : the nozzle is welded into LOD0_ENGINE_VECTOR_MAIN — its rear
  fragment (world x > SPLIT_X) is separated into Vector_Nozzle_Rig, which joins
  HOOK_DRIVE_PLUME + the heat decals under MOTION_ENG_NOZZLE.

Run: blender -b --factory-startup --python tools/blender/forge/animations/ANI_35_rig.py
"""
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', '..', '..', '..'))
PARTS = os.path.join(ROOT, 'assets', 'ships', 'parts', 'engines')

# rear seam: main body keeps x <= seam, the gimballed tail rides the pivot
VECTOR_SPLIT_X = 0.62


def _clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _import(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return {o.name: o for o in bpy.data.objects}


def _pivot(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse.identity()
    return e


def _parent_keep_world(obj, pivot):
    world = obj.matrix_world.copy()
    obj.parent = pivot
    obj.matrix_parent_inverse = pivot.matrix_world.inverted()
    obj.matrix_world = world


def _root_of(objs, part_id):
    root = objs.get(part_id)
    if root is not None:
        return root
    for o in objs.values():
        if o.parent is None:
            return o
    return None


def _export(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        export_extras=True, export_hierarchy_full_collections=False,
        export_apply=False, export_yup=True,
        export_animations=False, export_skins=False, export_morph=False,
        export_image_format='AUTO',
    )


def _split_rear(objs, mesh_name, seam_x, new_name):
    """Separate the verts of `mesh_name` whose WORLD x exceeds seam_x into a new object."""
    src = objs[mesh_name]
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = src
    src.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    import bmesh
    bm = bmesh.from_edit_mesh(src.data)
    world = src.matrix_world
    for v in bm.verts:
        v.select_set((world @ v.co).x > seam_x)
    bm.select_flush(True)
    bmesh.update_edit_mesh(src.data)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [o for o in bpy.context.selected_objects if o is not src]
    src.select_set(False)
    assert new, f'{mesh_name}: rear split produced no object at x>{seam_x}'
    new[0].name = new_name
    return new[0]


def rig_ion_twin():
    path = os.path.join(PARTS, 'engine_ion_twin.glb')
    _clean()
    objs = _import(path)
    root = _root_of(objs, 'engine_ion_twin')
    for side in ('P', 'S'):
        nozzle = objs[f'Twin_Nozzle_{side}']
        pivot = _pivot(f'MOTION_ENG_NOZZLE_{side}', nozzle.matrix_world.translation, root)
        _parent_keep_world(nozzle, pivot)
    _export(path)
    return 'engine_ion_twin: MOTION_ENG_NOZZLE_P/S'


def rig_plasma_ring():
    path = os.path.join(PARTS, 'engine_plasma_ring.glb')
    _clean()
    objs = _import(path)
    root = _root_of(objs, 'engine_plasma_ring')
    pivot = _pivot('MOTION_ENG_NOZZLE', (0.35, 0.0, 0.0), root)
    _parent_keep_world(objs['Plasma_Ring_Outer'], pivot)
    _parent_keep_world(objs['HOOK_DRIVE_PLUME'], pivot)
    _export(path)
    return 'engine_plasma_ring: MOTION_ENG_NOZZLE'


def rig_vector():
    path = os.path.join(PARTS, 'engine_vector.glb')
    _clean()
    objs = _import(path)
    root = objs['ENGINE_VECTOR_ROOT']
    nozzle = _split_rear(objs, 'LOD0_ENGINE_VECTOR_MAIN', VECTOR_SPLIT_X, 'Vector_Nozzle_Rig')
    pivot = _pivot('MOTION_ENG_NOZZLE', (VECTOR_SPLIT_X, 0.0, 0.0), root)
    _parent_keep_world(nozzle, pivot)
    for name in ('HOOK_DRIVE_PLUME', 'DET_heat_scorch_band', 'DET_heat_streak'):
        if objs.get(name) is not None:
            _parent_keep_world(objs[name], pivot)
    _export(path)
    return 'engine_vector: MOTION_ENG_NOZZLE'


if __name__ == '__main__':
    print(rig_ion_twin())
    print(rig_plasma_ring())
    print(rig_vector())
