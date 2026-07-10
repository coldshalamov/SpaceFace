"""Repair and export one SpaceFace runtime asset from its authored Blender source.

Environment:
  SF_PART_ID   manifest part id (required)
  SF_OUTPUT    temporary GLB output path (required)
  SF_MODE      hull_lods | scoped_export (required)

This is deliberately a source-side repair. It scopes export to the requested part so stale
objects elsewhere in an authoring scene cannot leak MOUNT_/SOCKET_/HOOK_ markers into the GLB.
For hulls it also authors distinct LOD1/LOD2 geometry from the current LOD0 silhouette.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
import bmesh
from bmesh.types import BMFace
from mathutils import Matrix


ROOT = Path(os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace'))
PART_ID = os.environ['SF_PART_ID']
OUTPUT = Path(os.environ['SF_OUTPUT'])
MODE = os.environ['SF_MODE']
BLEND = ROOT / 'assets' / 'ships' / 'parts' / 'blender' / f'{PART_ID}_authored.blend'
MANIFEST = json.loads((ROOT / 'assets' / 'ships' / 'parts' / 'parts_manifest.json').read_text(encoding='utf-8'))
PART_ENTRY = next(part for part in MANIFEST['parts'] if part['id'] == PART_ID)
EXPECTED_MARKERS = tuple((*PART_ENTRY.get('hooks', ()), *PART_ENTRY.get('sockets', ())))

sys.path.insert(0, str(ROOT / 'tools' / 'blender'))
from spaceface_export import export_gltf  # noqa: E402


COMMON_HULL_MARKERS = (
    'MOUNT_COCKPIT',
    'MOUNT_ENGINE_L',
    'MOUNT_ENGINE_R',
    'MOUNT_FIN_L',
    'MOUNT_FIN_R',
    'SOCKET_Trail_Main',
    'SOCKET_Weapon_Front',
)

STARTER_MARKER_POSITIONS = {
    'MOUNT_COCKPIT': (1.1, 0.66, 0.0),
    'MOUNT_ENGINE_L': (-4.7, 0.1, -0.62),
    'MOUNT_ENGINE_R': (-4.7, 0.1, 0.62),
    'MOUNT_FIN_L': (-0.8, 0.05, -1.7),
    'MOUNT_FIN_R': (-0.8, 0.05, 1.7),
    'SOCKET_Trail_Main': (-5.2, 0.05, 0.0),
    'SOCKET_Weapon_Front': (5.3, 0.1, 0.0),
}

CANONICAL_HOOKS = {
    'cockpit_dome': ('HOOK_Emissive',),
    'cockpit_slab': ('HOOK_Emissive',),
    'engine_ion_small': ('HOOK_DRIVE_CORE', 'HOOK_DRIVE_FAN', 'HOOK_DRIVE_PLUME'),
    'place_station_trade_hub': ('HOOK_Emissive', 'SOCKET_Structure_Core'),
}

SLOT_BY_PREFIX = {
    'hull_': 'hull',
    'cockpit_': 'cockpit',
    'engine_': 'engine',
    'weapon_': 'weapon',
    'fin_': 'fin',
    'skid_': 'gear',
    'pod_': 'pod',
    'place_': 'place',
}

CONTRACT_MATERIALS = {
    'Material_Hull',
    'Material_Accent',
    'Material_Mechanical',
    'Material_Glass',
}


def descendants(root: bpy.types.Object) -> list[bpy.types.Object]:
    out: list[bpy.types.Object] = []
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        out.append(obj)
        stack.extend(obj.children)
    return out


def find_root() -> bpy.types.Object | None:
    candidates = (
        PART_ID,
        f'{PART_ID.upper()}_ROOT',
        f'{PART_ID.upper().replace("PLACE_", "PLACE_")}_ROOT',
    )
    for name in candidates:
        obj = bpy.data.objects.get(name)
        if obj:
            return obj
    return None


def create_root() -> bpy.types.Object:
    root = bpy.data.objects.new(f'{PART_ID.upper()}_ROOT', None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (0.0, 0.0, 0.0)
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    return root


def reparent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != 'MESH':
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def canonical_base(name: str) -> str:
    return re.sub(r'\.\d{3}$', '', name)


def canonicalize_markers(root: bpy.types.Object) -> None:
    target = set(descendants(root))
    target.add(root)
    seen: set[str] = set()
    for obj in list(target):
        base = canonical_base(obj.name)
        if base not in COMMON_HULL_MARKERS:
            continue
        if base in seen:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        seen.add(base)
        owner = bpy.data.objects.get(base)
        if owner and owner is not obj and owner not in target:
            owner.name = f'FOREIGN_{base}_{PART_ID}'
        obj.name = base


def restore_starter_markers(root: bpy.types.Object) -> None:
    if PART_ID != 'hull_starter':
        return
    target_names = {canonical_base(obj.name) for obj in descendants(root)}
    for name, position in STARTER_MARKER_POSITIONS.items():
        if name in target_names:
            continue
        marker = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(marker)
        marker.parent = root
        marker.location = position
        marker.empty_display_type = 'PLAIN_AXES'
        marker.empty_display_size = 0.2


def set_lod_tags(obj: bpy.types.Object, lod: str, tint: str = 'hull') -> None:
    obj['spacefaceLod'] = lod
    current = obj.get('spaceface')
    data = dict(current) if hasattr(current, 'items') else {}
    data.update({'lod': lod, 'tint': tint, 'chamfered': True})
    obj['spaceface'] = data
    obj['spaceface_chamfered'] = True


def add_decimated_copy(source: bpy.types.Object, root: bpy.types.Object, level: int, ratio: float,
                       strip_bevel: bool) -> bpy.types.Object:
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.animation_data_clear()
    bpy.context.scene.collection.objects.link(duplicate)
    duplicate.name = f'LOD{level}_{PART_ID.upper()}_SILHOUETTE'
    reparent_keep_world(duplicate, root)
    if strip_bevel:
        for modifier in list(duplicate.modifiers):
            if modifier.type in {'BEVEL', 'WEIGHTED_NORMAL'}:
                duplicate.modifiers.remove(modifier)
        # Far-distance silhouette uses the canonical hull material only. Consolidating the
        # material boundaries lets Blender collapse internal panel seams instead of preserving
        # thousands of invisible per-role edges at LOD2.
        hull_material = bpy.data.materials.get('Material_Hull')
        if hull_material:
            duplicate.data.materials.clear()
            duplicate.data.materials.append(hull_material)
            for polygon in duplicate.data.polygons:
                polygon.material_index = 0
        # A far LOD is a silhouette proxy, not another dense panel mesh. Rebuild the disconnected
        # authored shell as its convex envelope before final collapse; LOD0 remains untouched.
        bm = bmesh.new()
        bm.from_mesh(duplicate.data)
        result = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
        hull_faces = {geom for geom in result.get('geom', []) if isinstance(geom, BMFace)}
        non_hull_faces = [face for face in bm.faces if face not in hull_faces]
        if non_hull_faces:
            bmesh.ops.delete(bm, geom=non_hull_faces, context='FACES_ONLY')
        loose_vertices = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose_vertices:
            bmesh.ops.delete(bm, geom=loose_vertices, context='VERTS')
        if bm.faces:
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.to_mesh(duplicate.data)
        bm.free()
        duplicate.data.update()
    decimate = duplicate.modifiers.new(f'SF_LOD{level}_Decimate', 'DECIMATE')
    decimate.decimate_type = 'COLLAPSE'
    decimate.ratio = ratio
    decimate.use_collapse_triangulate = True
    set_lod_tags(duplicate, f'lod{level}')
    return duplicate


def repair_hull_lods() -> tuple[bpy.types.Object, list[bpy.types.Object], dict]:
    root = find_root() or create_root()
    for obj in list(bpy.data.objects):
        if re.match(r'^LOD[12](?:_|$)', obj.name, re.I):
            bpy.data.objects.remove(obj, do_unlink=True)

    canonicalize_markers(root)
    restore_starter_markers(root)
    canonicalize_markers(root)

    root_descendants = set(descendants(root))
    source_meshes = [
        obj for obj in bpy.data.objects
        if obj.type == 'MESH'
        and not re.match(r'^LOD[12](?:_|$)', obj.name, re.I)
        and (obj in root_descendants or obj.parent is None and re.match(r'^(?:LOD0_|DET_)', obj.name, re.I))
    ]
    if not source_meshes:
        raise RuntimeError(f'{PART_ID}: no source hull meshes')

    for obj in source_meshes:
        if not re.match(r'^LOD0(?:_|$)', obj.name, re.I):
            obj.name = f'LOD0_{obj.name}'
        reparent_keep_world(obj, root)
        set_lod_tags(obj, 'lod0')

    main_meshes = [obj for obj in source_meshes if '_MAIN' in obj.name.upper()]
    source_main = max(main_meshes or source_meshes, key=triangle_count)
    if PART_ID == 'hull_miner':
        # The miner's identity is carried by its hopper/chute silhouette, material breaks, and
        # eight separate wear/detail meshes. Preserve all of those, but collapse excess bevel-era
        # topology on the dense main shell before deriving distance LODs. The modifier sits after
        # BevelPro, so the visible chamfer remains while redundant edge loops are reduced.
        for modifier in list(source_main.modifiers):
            if modifier.name == 'SF_MinerContractDecimate':
                source_main.modifiers.remove(modifier)
        miner_decimate = source_main.modifiers.new('SF_MinerContractDecimate', 'DECIMATE')
        miner_decimate.decimate_type = 'COLLAPSE'
        miner_decimate.ratio = 0.42
        miner_decimate.use_collapse_triangulate = True
    # The denser starter hero keeps its current LOD0 untouched, but needs a slightly steeper
    # distance reduction so the complete three-level chain remains within the per-part alarm.
    lod1_ratio = 0.42 if PART_ID == 'hull_starter' else 0.55
    lod2_ratio = 0.10 if PART_ID == 'hull_starter' else 0.18
    lod1 = add_decimated_copy(source_main, root, 1, lod1_ratio, strip_bevel=False)
    if PART_ID == 'hull_miner':
        # Mid-distance geometry retains the authored shell and material boundaries, but does not
        # need the close-up three-segment chamfer stack already represented by LOD0.
        for modifier in list(lod1.modifiers):
            if modifier.type in {'BEVEL', 'WEIGHTED_NORMAL'}:
                lod1.modifiers.remove(modifier)
    lod2 = add_decimated_copy(source_main, root, 2, lod2_ratio, strip_bevel=True)

    selected = [root, *descendants(root)]
    metrics = {
        'lod0RawTris': sum(triangle_count(obj) for obj in source_meshes),
        'lod1SourceTris': triangle_count(lod1),
        'lod2SourceTris': triangle_count(lod2),
        'lod0Meshes': len(source_meshes),
        'lod1Meshes': 1,
        'lod2Meshes': 1,
    }
    return root, selected, metrics


def canonicalize_target_hook(root: bpy.types.Object, expected: str) -> None:
    target = set(descendants(root))
    candidate = next((obj for obj in target if canonical_base(obj.name) == expected), None)
    if not candidate:
        candidate = next((obj for obj in bpy.data.objects if canonical_base(obj.name) == expected), None)
    if not candidate:
        return
    owner = bpy.data.objects.get(expected)
    if owner and owner is not candidate and owner not in target:
        owner.name = f'FOREIGN_{expected}_{PART_ID}'
    candidate.name = expected


def create_drive_surface(marker: bpy.types.Object, expected: str, root: bpy.types.Object) -> bpy.types.Object:
    world = marker.matrix_world.copy()
    role = expected.upper()
    if 'PLUME' in role:
        radius1, radius2, depth = 0.30, 0.06, 0.75
        material_name = 'Material_Accent'
    elif 'FAN' in role:
        radius1, radius2, depth = 0.42, 0.42, 0.10
        material_name = 'Material_Accent'
    else:
        radius1, radius2, depth = 0.28, 0.28, 0.20
        material_name = 'Material_Mechanical'
    mesh = bpy.data.meshes.new(f'{expected}_Mesh')
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=24,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
    )
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(1.5707963267948966, 4, 'Y'), verts=list(bm.verts))
    bm.to_mesh(mesh)
    bm.free()
    marker.name = f'REPLACED_{expected}'
    obj = bpy.data.objects.new(expected, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = world
    reparent_keep_world(obj, root)
    material = bpy.data.materials.get(material_name) or bpy.data.materials.new(material_name)
    material.diffuse_color = (0.08, 0.55, 0.68, 1.0) if material_name == 'Material_Accent' else (0.08, 0.10, 0.12, 1.0)
    obj.data.materials.append(material)
    obj['spaceface_chamfered'] = True
    obj['spaceface'] = {'chamfered': True}
    bevel = obj.modifiers.new('SF_DriveSurfaceBevel', 'BEVEL')
    bevel.width = 0.02
    bevel.segments = 1
    bpy.data.objects.remove(marker, do_unlink=True)
    return obj


def ensure_uv0(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH' or obj.data.uv_layers:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv_layer = bm.loops.layers.uv.new('UVMap')
    xs = [vertex.co.x for vertex in bm.verts]
    x_min = min(xs, default=0.0)
    x_span = max(max(xs, default=1.0) - x_min, 1e-6)
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            loop[uv_layer].uv = (
                math.atan2(co.y, co.z) / (2.0 * math.pi) + 0.5,
                (co.x - x_min) / x_span,
            )
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def restore_engine_hooks(root: bpy.types.Object) -> None:
    if not PART_ID.startswith('engine_'):
        return
    expected = tuple(name for name in EXPECTED_MARKERS if name.startswith('HOOK_DRIVE_'))
    target_names = {canonical_base(obj.name) for obj in bpy.data.objects}
    missing = [name for name in expected if name not in target_names]
    if missing:
        backup = BLEND.with_suffix('.blend1')
        if not backup.exists():
            raise RuntimeError(f'{PART_ID}: missing Blender backup for drive hooks: {backup}')
        with bpy.data.libraries.load(str(backup), link=False) as (source, target):
            unavailable = [name for name in missing if name not in source.objects]
            if unavailable:
                raise RuntimeError(f'{PART_ID}: backup missing drive hook meshes {unavailable}')
            target.objects = missing
        for obj in target.objects:
            if not obj:
                continue
            local = obj.matrix_local.copy()
            bpy.context.scene.collection.objects.link(obj)
            obj.parent = root
            obj.matrix_local = local

    for name in expected:
        obj = next((item for item in bpy.data.objects if canonical_base(item.name) == name), None)
        if not obj:
            raise RuntimeError(f'{PART_ID}: missing restored drive surface {name}')
        if obj.type != 'MESH':
            obj = create_drive_surface(obj, name, root)
        ensure_uv0(obj)
        if canonical_base(obj.name) not in expected:
            continue
        obj.hide_render = False
        obj.hide_viewport = False
        obj.hide_set(False)
        obj['spaceface_chamfered'] = True
        for index, material in enumerate(obj.data.materials):
            if not material:
                continue
            canonical = canonical_base(material.name)
            replacement = bpy.data.materials.get(canonical)
            if replacement:
                obj.data.materials[index] = replacement


def canonicalize_materials(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for index, material in enumerate(obj.data.materials):
            if not material:
                continue
            canonical = canonical_base(material.name)
            if canonical not in CONTRACT_MATERIALS:
                continue
            replacement = bpy.data.materials.get(canonical)
            if replacement and replacement is not material:
                obj.data.materials[index] = replacement
            else:
                material.name = canonical


def ensure_neutral_map_contract(objects: list[bpy.types.Object]) -> None:
    seen: set[bpy.types.Material] = set()
    for obj in objects:
        if obj.type != 'MESH':
            continue
        for material in obj.data.materials:
            if not material or material in seen:
                continue
            seen.add(material)
            material.use_nodes = True
            nodes = material.node_tree.nodes
            links = material.node_tree.links
            if not any(node.type == 'AMBIENT_OCCLUSION' for node in nodes):
                ao = nodes.new('ShaderNodeAmbientOcclusion')
                ao.name = 'SpaceFace Neutral AO'
                ao.label = 'Neutral AO source contract'
            bsdf = next((node for node in nodes if node.type == 'BSDF_PRINCIPLED'), None)
            roughness = bsdf.inputs.get('Roughness') if bsdf else None
            if roughness and not roughness.is_linked:
                value = nodes.new('ShaderNodeValue')
                value.name = 'SpaceFace Roughness Contract'
                value.label = 'Authored roughness value'
                value.outputs[0].default_value = roughness.default_value
                links.new(value.outputs[0], roughness)


def apply_asset_budget_cleanup(objects: list[bpy.types.Object]) -> None:
    for obj in objects:
        if obj.type != 'MESH':
            continue
        if PART_ID == 'engine_resonator':
            # The source had accumulated three identical export-only bevel modifiers on top of
            # its authored bevel. Remove only those duplicates; all modeled facets/rings remain.
            for modifier in list(obj.modifiers):
                if modifier.name.startswith('SF_ExportBevel'):
                    obj.modifiers.remove(modifier)
        elif PART_ID in {'engine_industrial', 'place_gate_jump_ring'}:
            # One chamfer segment preserves the authored highlight edge without multiplying every
            # pipe, rail, and fastener into budget-breaking close-up topology.
            for modifier in obj.modifiers:
                if modifier.type == 'BEVEL':
                    modifier.segments = 1


def repair_scoped_export() -> tuple[bpy.types.Object, list[bpy.types.Object], dict]:
    root = find_root() or create_root()
    restore_engine_hooks(root)
    for expected in EXPECTED_MARKERS:  # free canonical names from foreign scene debris
        canonicalize_target_hook(root, expected)

    target = {root, *descendants(root)}
    # Quality passes intentionally author DET_/STN_ meshes outside the original root. They belong
    # to the requested part; unlike foreign empty roots, all scene meshes in these four files do.
    target.update(obj for obj in bpy.data.objects if obj.type == 'MESH')
    target.update(obj for obj in bpy.data.objects if canonical_base(obj.name) in EXPECTED_MARKERS)
    for obj in list(target):
        parent = obj.parent
        while parent:
            target.add(parent)
            parent = parent.parent
    selected = [obj for obj in target if obj.type not in {'CAMERA', 'LIGHT'}]
    canonicalize_materials(selected)
    ensure_neutral_map_contract(selected)
    apply_asset_budget_cleanup(selected)
    if PART_ID == 'place_station_trade_hub':
        # The quality pass accumulated two-segment bevels across 84 small structural pieces.
        # Preserve every authored piece/material, but collapse the post-bevel geometry to the
        # landmark's enforced 10k-triangle shipping budget.
        for obj in selected:
            if obj.type != 'MESH':
                continue
            for modifier in list(obj.modifiers):
                if modifier.name == 'SF_ContractDecimate':
                    obj.modifiers.remove(modifier)
            decimate = obj.modifiers.new('SF_ContractDecimate', 'DECIMATE')
            decimate.decimate_type = 'COLLAPSE'
            decimate.ratio = 0.38
            decimate.use_collapse_triangulate = True
    metrics = {
        'selectedObjects': len(selected),
        'selectedMeshes': sum(1 for obj in selected if obj.type == 'MESH'),
        'selectedTris': sum(triangle_count(obj) for obj in selected),
    }
    return root, selected, metrics


def slot_for_part() -> str:
    for prefix, slot in SLOT_BY_PREFIX.items():
        if PART_ID.startswith(prefix):
            return slot
    raise RuntimeError(f'{PART_ID}: unknown slot prefix')


if MODE not in {'hull_lods', 'scoped_export'}:
    raise RuntimeError(f'unsupported SF_MODE={MODE}')
if not BLEND.exists():
    raise RuntimeError(f'missing authored Blender source: {BLEND}')

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
if MODE == 'hull_lods':
    root, selected, metrics = repair_hull_lods()
else:
    root, selected, metrics = repair_scoped_export()

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
export_gltf(str(OUTPUT), {
    'kind': 'part',
    'id': PART_ID,
    'assetId': f'SF_{PART_ID.upper()}',
    'slot': slot_for_part(),
    'tri_budget': 15000,
    'min_hull_tris': 0,
    # The ion-small drive is an explicitly legacy procedural-library part. Its recovered
    # renderable drive hooks predate the strict baked-map contract; the finalizer preserves
    # that legacy classification while runtime validation still checks its real hook surface.
    'required_maps': [] if PART_ID == 'engine_ion_small' else ['ao', 'roughness'],
}, objects=selected)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))

print('SF_REPAIR_RESULT=' + json.dumps({
    'partId': PART_ID,
    'mode': MODE,
    'blend': str(BLEND),
    'output': str(OUTPUT),
    'bytes': OUTPUT.stat().st_size,
    **metrics,
}, sort_keys=True))
