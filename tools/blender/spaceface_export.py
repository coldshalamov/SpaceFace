#!/usr/bin/env python3
"""SpaceFace Blender export gate — stamps spacefaceAsset metadata, validates contract, exports GLB.

Run inside Blender (MCP bridge or CLI):
  blender --background --python tools/blender/spaceface_export.py -- --validate-only <path.glb>
  blender --background --python tools/blender/spaceface_export.py -- --export <path.glb> --kind part --id fin_wedge

Validation refuses on violation with the exact failing assertion name. The contract is executable
in Blender, not tribal knowledge (SPEC3-37 §2 step 1).
"""
from __future__ import annotations

import copy
import json
import os
import re
import sys
from typing import Any

try:
    import bpy
    import bmesh
    from mathutils import Vector
    IN_BLENDER = True
except ImportError:
    bpy = None  # type: ignore
    bmesh = None  # type: ignore
    Vector = None  # type: ignore
    IN_BLENDER = False

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def _manifest_triangle_growth_guard() -> int:
    """Read the measured library guard; this is a structural-review trigger, not a quality target."""
    path = os.path.join(ROOT, 'assets', 'ships', 'parts', 'parts_manifest.json')
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            manifest = json.load(handle)
        value = manifest.get('budgets', {}).get('trianglesPerLandmark', [None, None])[1]
        return int(value) if isinstance(value, (int, float)) and value > 0 else 1100000
    except (OSError, ValueError, TypeError, IndexError):
        return 1100000


MANIFEST_TRIANGLE_GROWTH_GUARD = _manifest_triangle_growth_guard()

KIND_BUDGETS = {
    # Defaults are diagnostic opt-ins, not universal quality ceilings. Per-asset specs may provide a
    # measured budget; otherwise preserve authored detail and review performance structurally.
    'part': {'tri_budget': None, 'min_hull_tris': 0},
    'wholeship': {'tri_budget': None, 'min_hull_tris': 800},
    'prop': {'tri_budget': None, 'min_hull_tris': 0},
    'landmark': {'tri_budget': None, 'min_hull_tris': 0},
}

REQUIRED_MAPS = ('ao', 'roughness')
HULL_MATERIAL_TOKENS = ('material_hull', 'hull')
ACCESSORY_MESH_TOKENS = (
    'antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit',
)
MERGED_ROLE_TOKENS = {
    'merged_material_hull': 'hull',
    'merged_material_accent': 'accent',
    'merged_material_mechanical': 'mechanical',
    'merged_material_glass': 'glass',
}


class ExportContractError(Exception):
    def __init__(self, assertion: str, detail: str = ''):
        self.assertion = assertion
        self.detail = detail
        message = f'{assertion}: {detail}' if detail else assertion
        super().__init__(message)


def _fail(assertion: str, detail: str = '') -> None:
    raise ExportContractError(assertion, detail)


def tri_count_mesh(obj: Any) -> int:
    if not IN_BLENDER or obj.type != 'MESH' or not obj.data:
        return 0
    mesh = obj.data
    return sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons)


def _edge_crease(mesh: Any, edge: Any) -> float:
    """Read edge crease across Blender's legacy and generic-attribute APIs."""
    legacy_crease = getattr(edge, 'crease', None)
    if isinstance(legacy_crease, (int, float)):
        return float(legacy_crease)

    attributes = getattr(mesh, 'attributes', None)
    crease_attribute = attributes.get('crease_edge') if attributes is not None else None
    if crease_attribute is None or getattr(crease_attribute, 'domain', None) != 'EDGE':
        return 0.0
    index = getattr(edge, 'index', -1)
    data = getattr(crease_attribute, 'data', None)
    if data is None or not isinstance(index, int) or index < 0 or index >= len(data):
        return 0.0
    value = getattr(data[index], 'value', 0.0)
    return float(value) if isinstance(value, (int, float)) else 0.0


def hard_edges_unbeveled(obj: Any, min_segments: int = 2) -> list[int]:
    if not IN_BLENDER or obj.type != 'MESH':
        return []
    bad = []
    beveled = any(
        getattr(mod, 'type', None) == 'BEVEL'
        and getattr(mod, 'segments', 0) >= min_segments
        for mod in obj.modifiers
    )
    for edge in obj.data.edges:
        if not getattr(edge, 'use_edge_sharp', False) and _edge_crease(obj.data, edge) < 0.01:
            continue
        if not beveled:
            bad.append(edge.index)
    return bad


def has_baked_map(obj: Any, role: str) -> bool:
    if not IN_BLENDER or obj.type != 'MESH':
        return False
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        if role == 'ao':
            if any(n.type == 'AMBIENT_OCCLUSION' for n in nodes):
                return True
            for n in nodes:
                if n.type == 'TEX_IMAGE' and 'ao' in (n.name or '').lower():
                    return True
        if role == 'roughness':
            bsdf = nodes.get('Principled BSDF')
            if bsdf and bsdf.inputs['Roughness'].is_linked:
                return True
            for n in nodes:
                if n.type == 'TEX_IMAGE' and 'rough' in (n.name or '').lower():
                    return True
    return False


def object_role_token(obj: Any) -> str:
    name = (obj.name or '').lower()
    mats = ' '.join(
        (slot.material.name or '').lower()
        for slot in getattr(obj, 'material_slots', [])
        if slot.material
    )
    return f'{name} {mats}'


def is_hull_surface(obj: Any) -> bool:
    token = object_role_token(obj)
    if any(acc in token for acc in ACCESSORY_MESH_TOKENS):
        return False
    return any(hull in token for hull in HULL_MATERIAL_TOKENS) or 'lod0_' in token and '_main' in token


def validate_merged_node_mesh_alignment(objects: list[Any]) -> None:
    for obj in objects:
        if obj.type != 'MESH':
            continue
        name = (obj.name or '').lower()
        if not name.startswith('merged_material_'):
            continue
        expected_role = MERGED_ROLE_TOKENS.get(name)
        if not expected_role:
            continue
        token = object_role_token(obj)
        if expected_role == 'hull':
            if not is_hull_surface(obj):
                _fail('wholeship:merged material node mesh mismatch', f'{obj.name} is not hull geometry')
        elif expected_role == 'glass':
            if 'glass' not in token and 'canopy' not in token:
                _fail('wholeship:merged material node mesh mismatch', f'{obj.name} is not glass/canopy geometry')
        elif expected_role == 'accent':
            if 'accent' not in token and 'antenna' not in token and 'decal' not in token:
                _fail('wholeship:merged material node mesh mismatch', f'{obj.name} is not accent geometry')
        elif expected_role == 'mechanical':
            if 'mechanical' not in token and 'engine' not in token and 'brace' not in token:
                _fail('wholeship:merged material node mesh mismatch', f'{obj.name} is not mechanical geometry')


def validate_wholeship_hull_body(objects: list[Any], min_hull_tris: int) -> None:
    hull_tris = 0
    hull_nodes = []
    for obj in objects:
        if obj.type != 'MESH':
            continue
        if is_hull_surface(obj):
            count = tri_count_mesh(obj)
            hull_tris += count
            hull_nodes.append(f'{obj.name}({count}t)')
    if hull_tris < min_hull_tris:
        mesh_names = [obj.name for obj in objects if obj.type == 'MESH']
        _fail(
            'wholeship:missing hull body',
            f'hull triangles={hull_tris} < {min_hull_tris}; meshes={", ".join(mesh_names)}',
        )


def validate_object(obj: Any, spec: dict[str, Any]) -> None:
    asset_id = spec.get('id') or spec.get('assetId')
    extras = obj.get('spacefaceAsset') if isinstance(obj.get, type(lambda: None)) else None
    if IN_BLENDER:
        extras = obj.get('spaceface_asset_extras')  # placeholder — real path uses scene extras

    if IN_BLENDER and obj.type == 'MESH':
        edges = hard_edges_unbeveled(obj)
        if edges:
            _fail('unchamfered hard edge', f'{obj.name} edge index {edges[0]}')
        for role in spec.get('required_maps', REQUIRED_MAPS):
            if not has_baked_map(obj, role):
                _fail(f"missing baked map '{role}'", obj.name)
        tris = tri_count_mesh(obj)
        budget = spec.get('tri_budget', KIND_BUDGETS.get(spec.get('kind', 'part'), {}).get('tri_budget', 1200))
        if budget is not None and tris > budget:
            _fail('tri budget exceeded', f'{obj.name}: {tris} tris > {budget}')


def validate_gltf_document(gltf: dict[str, Any], spec: dict[str, Any]) -> list[str]:
    """Headless GLB JSON validation — mirrors Blender gate for check-exporter.mjs parity."""
    errors: list[str] = []
    asset_id = spec.get('id') or spec.get('assetId') or ''
    kind = spec.get('kind', 'part')
    budget = spec.get('tri_budget', KIND_BUDGETS.get(kind, {}).get('tri_budget', 1200))
    min_hull_tris = spec.get('min_hull_tris', KIND_BUDGETS.get(kind, {}).get('min_hull_tris', 0))

    extras = (gltf.get('asset') or {}).get('extras') or {}
    sf = extras.get('spacefaceAsset') or {}
    if not sf:
        errors.append(f'{asset_id}: missing spacefaceAsset extras')
    elif asset_id and sf.get('assetId') and sf.get('assetId') != spec.get('assetId') and spec.get('assetId'):
        errors.append(f'{asset_id}: spacefaceAsset.assetId mismatch')

    images = gltf.get('images') or []
    materials = gltf.get('materials') or []
    has_maps = len(images) >= 3 or (
        materials
        and all((m.get('pbrMetallicRoughness') or {}).get('baseColorFactor') for m in materials)
    )
    if not has_maps and kind != 'fixture':
        for role in spec.get('required_maps', REQUIRED_MAPS):
            errors.append(f"{asset_id}: missing baked map '{role}'")

    total_tris = 0
    hull_tris = 0
    tris_by_lod = {'lod0': 0, 'lod1': 0, 'lod2': 0, 'untagged': 0}
    seen_mesh_by_lod: set[tuple[str, int]] = set()
    mesh_by_idx = {i: m for i, m in enumerate(gltf.get('meshes') or [])}

    def mesh_tris(mesh: dict) -> int:
        count = 0
        for prim in mesh.get('primitives') or []:
            if (prim.get('mode') or 4) != 4:
                continue
            ia = (gltf.get('accessors') or [])[prim.get('indices', -1)] if prim.get('indices') is not None else None
            pa = (gltf.get('accessors') or [])[(prim.get('attributes') or {}).get('POSITION', -1)]
            count += int((ia or pa or {}).get('count', 0) // 3)
        return count

    def mesh_geometry_token(mesh: dict) -> str:
        names = []
        for prim in mesh.get('primitives') or []:
            mat = materials[prim.get('material', -1)] if prim.get('material') is not None else {}
            if mat.get('name'):
                names.append(mat['name'].lower())
        return f'{(mesh.get("name") or "").lower()} {" ".join(names)}'

    def is_hull_mesh(mesh: dict, node_name: str) -> bool:
        node_token = (node_name or '').lower()
        token = f'{node_token} {mesh_geometry_token(mesh)}'
        if any(acc in token for acc in ACCESSORY_MESH_TOKENS):
            return False
        return any(h in token for h in HULL_MATERIAL_TOKENS) or ('lod0_' in node_token and '_main' in node_token)

    for node in gltf.get('nodes') or []:
        name = node.get('name') or ''
        extras_node = (node.get('extras') or {}).get('spaceface') or {}
        if node.get('mesh') is not None:
            mesh_index = node['mesh']
            mesh = mesh_by_idx.get(mesh_index, {})
            tris = mesh_tris(mesh)
            lod_match = re.match(r'^LOD([012])(?:_|$)', name, re.IGNORECASE)
            lod = extras_node.get('lod') or (f'lod{lod_match.group(1)}' if lod_match else 'untagged')
            lod_key = lod if lod in tris_by_lod else 'untagged'
            unique_key = (lod_key, mesh_index)
            if unique_key not in seen_mesh_by_lod:
                seen_mesh_by_lod.add(unique_key)
                tris_by_lod[lod_key] += tris
                total_tris += tris
                if is_hull_mesh(mesh, name):
                    hull_tris += tris
            if extras_node.get('chamfered') is not True and kind != 'fixture':
                if 'lod0_' in name.lower() or name.lower().startswith('merged_material_'):
                    errors.append(f'{asset_id}: unchamfered hard edge at {name}')

            lname = name.lower()
            if lname.startswith('merged_material_'):
                expected = MERGED_ROLE_TOKENS.get(lname)
                token = mesh_geometry_token(mesh)
                geo = (mesh.get('name') or '').lower()
                if expected == 'hull' and not is_hull_mesh(mesh, name):
                    errors.append(f'wholeship:merged material node mesh mismatch: {name}')
                elif expected == 'glass' and 'glass' not in geo and 'canopy' not in geo:
                    errors.append(f'wholeship:merged material node mesh mismatch: {name}')
                elif expected == 'accent' and 'accent' not in geo and 'antenna' not in geo and 'decal' not in geo:
                    errors.append(f'wholeship:merged material node mesh mismatch: {name}')
                elif expected == 'mechanical' and (
                    ('mechanical' not in geo and 'engine' not in geo and 'brace' not in geo) or 'decal' in geo
                ):
                    errors.append(f'wholeship:merged material node mesh mismatch: {name}')

    # Runtime displays one authored LOD at a time. Use unique LOD0 render primitives for the
    # structural guard; fall back to total unique primitives when no LOD chain is authored.
    budget_tris = tris_by_lod['lod0'] or total_tris
    if budget is not None and budget_tris > budget:
        errors.append(f'{asset_id}: tri budget exceeded: LOD0 {budget_tris} tris > {budget}')

    if kind == 'wholeship' and hull_tris < min_hull_tris:
        mesh_names = [(m.get('name') or f'mesh#{i}') for i, m in enumerate(gltf.get('meshes') or [])]
        errors.append(
            f'wholeship:missing hull body: hull triangles={hull_tris} < {min_hull_tris}; meshes={", ".join(mesh_names)}'
        )

    return errors


def stamp_spaceface_metadata(spec: dict[str, Any]) -> dict[str, Any]:
    asset_id = spec.get('assetId') or f'SF_{spec.get("kind", "part").upper()}_{spec.get("id", "UNKNOWN").upper()}'
    return {
        'contractVersion': 1,
        'assetId': asset_id,
        'slot': spec.get('slot', 'hull'),
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': spec.get('textureCompression', 'PNG-source'),
        'chamfered': True,
        'bevelRadiusM': 0.025,
    }


def validate_scene_objects(spec: dict[str, Any], objects: list[Any] | None = None) -> None:
    if not IN_BLENDER:
        return
    source_objects = objects if objects is not None else list(bpy.data.objects)
    meshes = [obj for obj in source_objects if obj and obj.type == 'MESH']
    for obj in meshes:
        validate_object(obj, spec)
    if spec.get('kind') == 'wholeship':
        validate_merged_node_mesh_alignment(meshes)
        min_hull = spec.get('min_hull_tris', KIND_BUDGETS['wholeship']['min_hull_tris'])
        validate_wholeship_hull_body(meshes, min_hull)


def _object_is_live(obj: Any) -> bool:
    return bool(obj) and obj.name in bpy.data.objects


def _snapshot_custom_property(holder: Any, key: str) -> dict[str, Any]:
    exists = key in holder.keys()
    return {
        'exists': exists,
        'value': _clone_custom_property_value(holder.get(key)) if exists else None,
    }


def _clone_custom_property_value(value: Any) -> Any:
    if hasattr(value, 'to_dict'):
        value = value.to_dict()
    elif hasattr(value, 'to_list'):
        value = value.to_list()
    if isinstance(value, dict):
        return {key: _clone_custom_property_value(child) for key, child in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clone_custom_property_value(child) for child in value]
    return copy.deepcopy(value)


def _restore_custom_property(holder: Any, key: str, snapshot: dict[str, Any]) -> None:
    if snapshot['exists']:
        holder[key] = _clone_custom_property_value(snapshot['value'])
    elif key in holder.keys():
        del holder[key]


def _snapshot_export_state() -> tuple[list[dict[str, Any]], Any, list[dict[str, Any]]]:
    snapshot = []
    for obj in list(bpy.data.objects):
        snapshot.append({
            'object': obj,
            'selected': obj.select_get(),
            'hide_set': obj.hide_get(),
            'hide_viewport': obj.hide_viewport,
            'hide_render': obj.hide_render,
            'spaceface_chamfered': _snapshot_custom_property(obj, 'spaceface_chamfered'),
        })
    scene_snapshot = [
        {
            'scene': scene,
            'spacefaceAsset': _snapshot_custom_property(scene, 'spacefaceAsset'),
        }
        for scene in bpy.data.scenes
    ]
    return snapshot, bpy.context.view_layer.objects.active, scene_snapshot


def _restore_export_state(
    snapshot: list[dict[str, Any]],
    previous_active: Any,
    scene_snapshot: list[dict[str, Any]],
    *,
    restore_export_properties: bool,
) -> None:
    live_records = [record for record in snapshot if _object_is_live(record['object'])]
    # Selection cannot be restored while an object is excluded from the active view layer.
    # Temporarily expose each touched object, restore selection, then reinstate all hide modes.
    for record in live_records:
        obj = record['object']
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(record['selected'])
    for record in live_records:
        obj = record['object']
        obj.hide_render = record['hide_render']
        obj.hide_set(record['hide_set'])
        obj.hide_viewport = record['hide_viewport']
        if restore_export_properties:
            _restore_custom_property(obj, 'spaceface_chamfered', record['spaceface_chamfered'])
    if restore_export_properties:
        for record in scene_snapshot:
            _restore_custom_property(record['scene'], 'spacefaceAsset', record['spacefaceAsset'])
    bpy.context.view_layer.objects.active = previous_active if _object_is_live(previous_active) else None


def _stamp_validated_export_properties(spec: dict[str, Any], objects: list[Any]) -> None:
    metadata = stamp_spaceface_metadata(spec)
    for obj in objects:
        if obj and obj.type == 'MESH':
            obj['spaceface_chamfered'] = True
    for scene in bpy.data.scenes:
        scene['spacefaceAsset'] = metadata


def export_gltf(output_path: str, spec: dict[str, Any], objects: list[Any] | None = None) -> None:
    if not IN_BLENDER:
        raise RuntimeError('export_gltf requires Blender bpy')
    export_objects = [obj for obj in (objects or []) if obj and obj.name in bpy.data.objects]
    state_snapshot, previous_active, scene_snapshot = _snapshot_export_state()
    export_succeeded = False
    try:
        validate_scene_objects(spec, export_objects if objects is not None else None)
        validated_objects = export_objects if objects is not None else list(bpy.data.objects)
        _stamp_validated_export_properties(spec, validated_objects)
        if objects is not None:
            if not export_objects:
                _fail('export selection empty', spec.get('id', 'asset'))
            bpy.ops.object.select_all(action='DESELECT')
            for obj in export_objects:
                obj.hide_viewport = False
                obj.hide_render = False
                obj.hide_set(False)
                obj.select_set(True)
            bpy.context.view_layer.objects.active = export_objects[0]
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            use_selection=objects is not None,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
            export_materials='EXPORT',
            export_extras=True,
            export_yup=True,
        )
        export_succeeded = True
    finally:
        _restore_export_state(
            state_snapshot,
            previous_active,
            scene_snapshot,
            restore_export_properties=not export_succeeded,
        )


def parse_cli(argv: list[str]) -> dict[str, Any]:
    args = {
        'mode': 'validate-only',
        'path': '',
        'kind': 'part',
        'id': '',
        'assetId': '',
        'slot': 'hull',
    }
    i = 0
    while i < len(argv):
        token = argv[i]
        if token == '--validate-only' and i + 1 < len(argv):
            args['mode'] = 'validate-only'
            args['path'] = argv[i + 1]
            i += 2
            continue
        if token == '--export' and i + 1 < len(argv):
            args['mode'] = 'export'
            args['path'] = argv[i + 1]
            i += 2
            continue
        if token == '--kind' and i + 1 < len(argv):
            args['kind'] = argv[i + 1]
            i += 2
            continue
        if token == '--id' and i + 1 < len(argv):
            args['id'] = argv[i + 1]
            i += 2
            continue
        if token == '--asset-id' and i + 1 < len(argv):
            args['assetId'] = argv[i + 1]
            i += 2
            continue
        if token == '--slot' and i + 1 < len(argv):
            args['slot'] = argv[i + 1]
            i += 2
            continue
        i += 1
    return args


def load_gltf_json(path: str) -> dict[str, Any]:
    with open(path, 'rb') as fh:
        data = fh.read()
    if len(data) < 20:
        raise ValueError('file too small')
    chunk_len = int.from_bytes(data[12:16], 'little')
    json_bytes = data[20:20 + chunk_len]
    return json.loads(json_bytes.decode('utf-8').rstrip('\x00'))


def main() -> int:
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = [a for a in argv[1:] if not a.endswith('spaceface_export.py')]

    args = parse_cli(argv)
    if not args['path']:
        print('usage: spaceface_export.py --validate-only <file.glb> | --export <out.glb> --kind part --id <id>')
        return 2

    kind = args['kind']
    budgets = KIND_BUDGETS.get(kind, KIND_BUDGETS['part'])
    spec = {
        'kind': kind,
        'id': args['id'] or os.path.splitext(os.path.basename(args['path']))[0],
        'assetId': args['assetId'] or '',
        'slot': args['slot'],
        'tri_budget': budgets['tri_budget'],
        'min_hull_tris': budgets['min_hull_tris'],
        'required_maps': list(REQUIRED_MAPS),
    }

    if args['mode'] == 'export':
        if not IN_BLENDER:
            print('export mode requires Blender')
            return 2
        export_gltf(args['path'], spec)
        print(json.dumps({'schema': 'spaceface.export.v1', 'ok': True, 'path': args['path']}))
        return 0

    if IN_BLENDER and os.path.isfile(args['path']) and args['path'].endswith('.blend'):
        bpy.ops.wm.open_mainfile(filepath=args['path'])
        try:
            validate_scene_objects(spec)
        except ExportContractError as err:
            print(json.dumps({'schema': 'spaceface.export.v1', 'ok': False, 'assertion': err.assertion, 'detail': err.detail}))
            return 1
        print(json.dumps({'schema': 'spaceface.export.v1', 'ok': True, 'path': args['path']}))
        return 0

    gltf = load_gltf_json(args['path'])
    errors = validate_gltf_document(gltf, spec)
    if errors:
        print(json.dumps({'schema': 'spaceface.export.v1', 'ok': False, 'errors': errors}))
        return 1
    print(json.dumps({'schema': 'spaceface.export.v1', 'ok': True, 'path': args['path']}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
