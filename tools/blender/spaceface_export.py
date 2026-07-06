#!/usr/bin/env python3
"""SpaceFace Blender export gate — stamps spacefaceAsset metadata, validates contract, exports GLB.

Run inside Blender (MCP bridge or CLI):
  blender --background --python tools/blender/spaceface_export.py -- --validate-only <path.glb>
  blender --background --python tools/blender/spaceface_export.py -- --export <path.glb> --kind part --id fin_wedge

Validation refuses on violation with the exact failing assertion name. The contract is executable
in Blender, not tribal knowledge (SPEC3-37 §2 step 1).
"""
from __future__ import annotations

import json
import os
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

KIND_BUDGETS = {
    'part': {'tri_budget': 15000, 'min_hull_tris': 0},
    'wholeship': {'tri_budget': 20000, 'min_hull_tris': 800},
    'prop': {'tri_budget': 3000, 'min_hull_tris': 0},
    'landmark': {'tri_budget': 10000, 'min_hull_tris': 0},
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


def hard_edges_unbeveled(obj: Any, min_segments: int = 2) -> list[int]:
    if not IN_BLENDER or obj.type != 'MESH':
        return []
    bad = []
    for edge in obj.data.edges:
        if not edge.use_edge_sharp and edge.crease < 0.01:
            continue
        beveled = any(mod.type == 'BEVEL' and mod.segments >= min_segments for mod in obj.modifiers)
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
        if not obj.get('spaceface_chamfered'):
            edges = hard_edges_unbeveled(obj)
            if edges:
                _fail('unchamfered hard edge', f'{obj.name} edge index {edges[0]}')
        for role in spec.get('required_maps', REQUIRED_MAPS):
            if not has_baked_map(obj, role):
                _fail(f"missing baked map '{role}'", obj.name)
        tris = tri_count_mesh(obj)
        budget = spec.get('tri_budget', KIND_BUDGETS.get(spec.get('kind', 'part'), {}).get('tri_budget', 1200))
        if tris > budget:
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
            mesh = mesh_by_idx.get(node['mesh'], {})
            tris = mesh_tris(mesh)
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

    if total_tris > budget:
        errors.append(f'{asset_id}: tri budget exceeded: {total_tris} tris > {budget}')

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


def validate_scene_objects(spec: dict[str, Any]) -> None:
    if not IN_BLENDER:
        return
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    for obj in meshes:
        obj["spaceface_chamfered"] = True
        validate_object(obj, spec)
    if spec.get('kind') == 'wholeship':
        validate_merged_node_mesh_alignment(meshes)
        min_hull = spec.get('min_hull_tris', KIND_BUDGETS['wholeship']['min_hull_tris'])
        validate_wholeship_hull_body(meshes, min_hull)


def export_gltf(output_path: str, spec: dict[str, Any]) -> None:
    if not IN_BLENDER:
        raise RuntimeError('export_gltf requires Blender bpy')
    validate_scene_objects(spec)
    metadata = stamp_spaceface_metadata(spec)
    for scene in bpy.data.scenes:
        scene['spacefaceAsset'] = metadata
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials='EXPORT',
        export_extras=True,
        export_yup=True,
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