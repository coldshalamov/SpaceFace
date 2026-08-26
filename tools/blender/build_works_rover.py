"""PQ-131.01 Works rover — production builder.

Rebuilds the three LOD sources (via the cycle-78 MTX form), then exports ONE
Y-up glTF with:

- LOD roots named LOD0_* / LOD1_* / LOD2_*
- named sockets the runtime drives (boom_pivot, bit_tip, hopper_fill_0..4,
  hopper_lid, lamp_socket, vent_stack, track_L, track_R, scar_plate)
- a named LOD<n>_Bit cutter mesh parented under bit_tip
- spacefaceAsset on the glTF asset, the scene, and the canonical root

Authored at works scale: 1.87 x 1.76 x 0.99 wu, origin at cell centre, +Z up
in Blender / +Y up after glTF export. Tracks' underside at z = 0.

    blender --background --python tools/blender/build_works_rover.py
    blender --background --python tools/blender/build_works_rover.py -- --combine-only
"""
from __future__ import annotations

import hashlib
import json
import shutil
import struct
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import build_works_rover_mtx as mtx  # noqa: E402

FAMILY = ROOT / "assets" / "works" / "rover"
SOURCE_DIR = FAMILY / "source"
PARTS_DIR = ROOT / "assets" / "ships" / "parts" / "works"
COMBINED_NAME = "place_works_rover.glb"
ASSET_ID = "place_works_rover"
HOOK_NAMES = mtx.HOOK_NAMES
HOOK_MESHES = tuple(mtx.HOOK_MESHES)
EMPTY_HOOKS = ("boom_pivot", "bit_tip", "lamp_socket", "vent_stack")

# The cutter. The LOD builder merges every boom part into one node per material role, so the
# only thing `bit_tip` could ever have driven arrives welded into Merged_Material_Scar_Boom and
# Merged_Material_Steel_Boom. Recover it here, at combine time, without touching the frozen
# hash-sealed LOD sources: blow those two role groups apart by loose part, take back every part
# that sits on the cutter's own axis, and rebuild them as one named LOD<n>_Bit mesh whose origin
# is on that axis at the cutting end. Everything else in each role group is rejoined unchanged.
BIT_MESH_STEM = "Bit"
BIT_SOURCE_STEMS = ("Merged_Material_Scar_Boom", "Merged_Material_Steel_Boom")
BIT_AXIS_RADIUS = 0.12       # wu from the cutter axis; nearest non-cutter part sits at 0.165
BIT_AXIS_BACKREACH = 0.32    # wu behind BIT_TIP; nearest boom-arm part centres at 0.44 behind
BIT_LOOSE_PARTS = 4          # head + collar (scar role) + tip + point (steel role)
BIT_SPAN_X = (0.20, 0.50)
BIT_SPAN_LATERAL = 0.30
BIT_AXIS_TOLERANCE = 0.05


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def parse_args(argv):
    combine_only = False
    for tok in argv:
        if tok == "--combine-only":
            combine_only = True
    return combine_only


def rebuild_lods():
    FAMILY.mkdir(parents=True, exist_ok=True)
    mtx.TEX_DIR.mkdir(parents=True, exist_ok=True)
    reports = []
    for lod in (0, 1, 2):
        mtx.reset_scene()
        mtx.TEX = mtx.TEX_BY_LOD[lod]
        atlas_maps, atlas_mat, _tile = mtx.create_atlas(lod)
        role_mats = mtx.create_role_materials(lod)
        collection, report = mtx.build_lod(lod, role_mats, atlas_mat, atlas_maps)
        output = mtx.export_lod(collection, lod)
        nbytes = output.stat().st_size
        report.update({
            "path": str(output.relative_to(ROOT)).replace("\\", "/"),
            "bytes": nbytes,
            "sha256": sha256(output),
        })
        reports.append(report)
        print(json.dumps({
            "lod": lod,
            "triangles": report["triangles"],
            "draws": report["draws"],
            "bytes": nbytes,
        }, indent=2))
    return reports


def _clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images, bpy.data.collections,
        bpy.data.armatures,
    ):
        for item in list(bucket):
            try:
                bucket.remove(item)
            except Exception:
                pass


def _world_loc(obj):
    return obj.matrix_world.translation.copy()


def _reparent_keep_world(obj, parent):
    mw = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    obj.matrix_world = mw


def _stamp_socket(obj):
    obj["spacefaceSocket"] = True
    obj["spaceface.socket"] = True
    obj["spaceface"] = {"socket": True, "role": "works_hook"}
    obj["socket"] = True


def _ensure_empty(name, location, parent, size=0.06):
    existing = bpy.data.objects.get(name)
    if existing is not None:
        _stamp_socket(existing)
        if parent and existing.parent != parent:
            _reparent_keep_world(existing, parent)
        return existing
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = size
    obj.location = location
    if parent:
        _reparent_keep_world(obj, parent)
    _stamp_socket(obj)
    return obj


def _import_lod(path: Path, lod: int):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    for obj in imported:
        obj["sf_import_lod"] = lod
    return imported


def _strip_blender_dup(name: str) -> str:
    if "." in name:
        stem, suffix = name.rsplit(".", 1)
        if suffix.isdigit():
            return stem
    return name


def _lod_stem(name: str) -> str:
    raw = _strip_blender_dup(name)
    for lod in (0, 1, 2):
        prefix = f"LOD{lod}_"
        if raw.startswith(prefix):
            return raw[len(prefix):]
    return raw


def _world_bounds(obj):
    matrix = obj.matrix_world
    points = [matrix @ Vector(corner[:]) for corner in obj.bound_box]
    low = Vector((
        min(p.x for p in points), min(p.y for p in points), min(p.z for p in points),
    ))
    high = Vector((
        max(p.x for p in points), max(p.y for p in points), max(p.z for p in points),
    ))
    return low, high


def _on_bit_axis(centre) -> bool:
    tip_x, tip_y, tip_z = mtx.BIT_TIP
    lateral = ((centre.y - tip_y) ** 2 + (centre.z - tip_z) ** 2) ** 0.5
    return lateral <= BIT_AXIS_RADIUS and centre.x >= tip_x - BIT_AXIS_BACKREACH


def _activate(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def _mesh_components(obj):
    """Connected components of `obj`, joined through COINCIDENT POSITIONS.

    Blender's loose-part operator cannot be used here: the glTF import splits vertices at
    every normal/UV seam, so `separate(type='LOOSE')` sees each face as its own island.
    This walks the same welded adjacency the release artifact would show without touching a
    single vertex — no merge-by-distance, no UV or normal damage.
    """
    mesh = obj.data
    parent = {}

    def find(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(a, b):
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_a] = root_b

    key_of = []
    for vert in mesh.vertices:
        key = (round(vert.co.x, 4), round(vert.co.y, 4), round(vert.co.z, 4))
        if key not in parent:
            parent[key] = key
        key_of.append(key)
    for poly in mesh.polygons:
        indices = list(poly.vertices)
        for other in indices[1:]:
            union(key_of[indices[0]], key_of[other])

    matrix = obj.matrix_world
    records = {}
    for poly in mesh.polygons:
        root = find(key_of[poly.vertices[0]])
        record = records.get(root)
        if record is None:
            record = {"faces": [], "low": None, "high": None}
            records[root] = record
        record["faces"].append(poly.index)
        for index in poly.vertices:
            point = matrix @ mesh.vertices[index].co
            if record["low"] is None:
                record["low"] = point.copy()
                record["high"] = point.copy()
            else:
                low, high = record["low"], record["high"]
                low.x, low.y, low.z = min(low.x, point.x), min(low.y, point.y), min(low.z, point.z)
                high.x, high.y, high.z = max(high.x, point.x), max(high.y, point.y), max(high.z, point.z)
    for record in records.values():
        record["centre"] = (record["low"] + record["high"]) * 0.5
    return list(records.values())


def _separate_faces(obj, face_indices, lod):
    """Peel exactly `face_indices` off `obj` into a new object. Returns the new object."""
    before = set(bpy.data.objects)
    _activate([obj])
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.select_mode = {"FACE"}
    for face in bm.faces:
        face.select_set(face.index in face_indices)
    bm.select_flush(True)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    made = [o for o in bpy.data.objects if o not in before]
    if len(made) != 1:
        raise RuntimeError(f"lod{lod}: face separation produced {len(made)} objects, expected 1")
    made[0]["sf_import_lod"] = lod
    return made[0]


def _join_objects(objects, name, parent, lod):
    if not objects:
        return None
    _activate(objects)
    if len(objects) > 1:
        bpy.ops.object.join()
    node = bpy.context.view_layer.objects.active
    node.name = name
    node["sf_import_lod"] = lod
    if parent is not None and node.parent is not parent:
        _reparent_keep_world(node, parent)
    return node


def _set_origin(obj, location):
    cursor = bpy.context.scene.cursor
    previous = cursor.location.copy()
    cursor.location = location
    _activate([obj])
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    cursor.location = previous


def split_bit_from_boom(imported, lod):
    """Recover the named cutter mesh from this LOD's merged boom role groups.

    Returns (updated_imported, bit_object). Raises when the frozen LOD source no longer
    presents the cutter as the loose parts measured at cycle 78 — a silent one-part or
    zero-part Bit must red the build, not ship a cutter the runtime cannot drive.
    """
    sources = []
    for stem in BIT_SOURCE_STEMS:
        target = f"LOD{lod}_{stem}"
        source = next(
            (o for o in imported
             if o.type == "MESH" and _strip_blender_dup(o.name) == target),
            None,
        )
        if source is None:
            raise RuntimeError(f"lod{lod}: boom role group {target} is missing from the LOD source")
        sources.append((target, source))

    # Snapshot the survivors of `imported` BEFORE any join runs: a join deletes every
    # non-active participant, so filtering afterwards would walk removed datablocks.
    consumed = [source for _target, source in sources]
    remaining = [o for o in imported if all(o is not used for used in consumed)]

    survivors = []
    bit_parts = []
    cutter_parts = 0
    residuals = {}
    for target, source in sources:
        components = _mesh_components(source)
        cutter_faces = set()
        cutter_count = 0
        residual_count = 0
        for record in components:
            if _on_bit_axis(record["centre"]):
                cutter_faces.update(record["faces"])
                cutter_count += 1
            else:
                residual_count += 1
        residuals[target] = residual_count
        cutter_parts += cutter_count
        if not cutter_faces:
            survivors.append(source)
            continue
        if residual_count == 0:
            # The whole role group is cutter (Scar_Boom is nothing but head + collar).
            bit_parts.append(source)
            continue
        piece = _separate_faces(source, cutter_faces, lod)
        piece.name = f"{target}__cutter"
        bit_parts.append(piece)
        survivors.append(source)

    if cutter_parts != BIT_LOOSE_PARTS:
        raise RuntimeError(
            f"lod{lod}: expected {BIT_LOOSE_PARTS} cutter parts on the bit axis, found "
            f"{cutter_parts} (residual parts {residuals}) — the LOD source changed shape"
        )
    steel_target = f"LOD{lod}_{BIT_SOURCE_STEMS[1]}"
    if residuals.get(steel_target, 0) < 1:
        raise RuntimeError(
            f"lod{lod}: the bit-axis filter swallowed the whole boom arm out of {steel_target}"
        )

    bit = _join_objects(bit_parts, f"LOD{lod}_{BIT_MESH_STEM}", bit_parts[0].parent, lod)
    low, high = _world_bounds(bit)
    centre = (low + high) * 0.5
    _set_origin(bit, Vector((high.x, centre.y, centre.z)))

    low, high = _world_bounds(bit)
    span = high - low
    centre = (low + high) * 0.5
    tip_x, tip_y, tip_z = mtx.BIT_TIP
    if not (BIT_SPAN_X[0] <= span.x <= BIT_SPAN_X[1]):
        raise RuntimeError(f"lod{lod}: cutter axial span {span.x:.3f} outside {BIT_SPAN_X}")
    if span.y > BIT_SPAN_LATERAL or span.z > BIT_SPAN_LATERAL:
        raise RuntimeError(
            f"lod{lod}: cutter lateral span ({span.y:.3f}, {span.z:.3f}) over {BIT_SPAN_LATERAL}"
        )
    if abs(centre.y - tip_y) > BIT_AXIS_TOLERANCE or abs(centre.z - tip_z) > BIT_AXIS_TOLERANCE:
        raise RuntimeError(
            f"lod{lod}: cutter centre ({centre.y:.3f}, {centre.z:.3f}) is off the bit axis "
            f"({tip_y:.3f}, {tip_z:.3f})"
        )
    if abs(bit.matrix_world.translation.x - high.x) > 1e-4:
        raise RuntimeError(f"lod{lod}: cutter origin is not at the cutting end")

    updated = list(remaining)
    updated.extend(survivors)
    updated.append(bit)
    print(json.dumps({
        "lod": lod,
        "bitParts": cutter_parts,
        "bitTriangles": sum(max(0, len(p.vertices) - 2) for p in bit.data.polygons),
        "bitResiduals": residuals,
        "bitOrigin": [round(v, 5) for v in bit.matrix_world.translation],
        "bitSpan": [round(span.x, 5), round(span.y, 5), round(span.z, 5)],
    }))
    return updated, bit


def combine_lods():
    _clear_scene()
    lod_paths = [SOURCE_DIR / f"rover_lod{lod}.glb" for lod in (0, 1, 2)]
    for path in lod_paths:
        if not path.exists():
            raise FileNotFoundError(f"missing LOD source {path}")

    root = bpy.data.objects.new(ASSET_ID, None)
    bpy.context.scene.collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.12

    sockets = {}
    lod_tri = {0: 0, 1: 0, 2: 0}
    mesh_names = []
    bit_meshes = []

    for lod, path in enumerate(lod_paths):
        imported = _import_lod(path, lod)
        imported, bit = split_bit_from_boom(imported, lod)
        bit_meshes.append(bit.name)
        for obj in imported:
            raw = _strip_blender_dup(obj.name)
            obj["_sf_raw"] = raw

        # Rename hook meshes first so empties can take the exact runtime names.
        for obj in imported:
            raw = obj["_sf_raw"]
            if obj.type == "MESH" and raw in HOOK_MESHES:
                obj.name = f"LOD{lod}_{raw}"

        if lod == 0:
            for obj in imported:
                raw = obj["_sf_raw"]
                if obj.type == "MESH":
                    continue
                if raw in EMPTY_HOOKS or raw in HOOK_NAMES:
                    obj.name = raw
                    sockets[raw] = obj
                    _stamp_socket(obj)
                    _reparent_keep_world(obj, root)
            for hook in HOOK_MESHES:
                mesh = next(
                    (o for o in imported if o.type == "MESH" and o["_sf_raw"] == hook),
                    None,
                )
                loc = _world_loc(mesh) if mesh is not None else Vector((0.0, 0.0, 0.0))
                sockets[hook] = _ensure_empty(hook, loc, root)
            boom = sockets.get("boom_pivot")
            tip = sockets.get("bit_tip")
            if boom and tip and tip.parent != boom:
                _reparent_keep_world(tip, boom)

        for obj in list(imported):
            raw = obj["_sf_raw"]
            if obj.type != "MESH":
                if lod > 0:
                    try:
                        bpy.data.objects.remove(obj, do_unlink=True)
                    except Exception:
                        pass
                continue
            if raw in HOOK_MESHES:
                obj.name = f"LOD{lod}_{raw}"
            elif not raw.upper().startswith(f"LOD{lod}_"):
                if raw.upper().startswith("LOD"):
                    obj.name = raw
                else:
                    obj.name = f"LOD{lod}_{raw}"
            else:
                obj.name = raw
            obj["spacefaceLod"] = f"lod{lod}"
            obj["spaceface"] = {"lod": f"lod{lod}"}
            tris = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) if obj.data else 0
            lod_tri[lod] += tris
            mesh_names.append(obj.name)
            parent = root
            if raw in HOOK_MESHES and raw in sockets:
                parent = sockets[raw]
            elif _lod_stem(raw) == BIT_MESH_STEM:
                # The cutter hangs off the socket the runtime spins, not off the arm.
                parent = sockets.get("bit_tip") or sockets.get("boom_pivot") or root
            elif "Boom" in raw or raw.startswith("Bit"):
                parent = sockets.get("boom_pivot") or root
            _reparent_keep_world(obj, parent)

    for stray in list(bpy.data.objects):
        if stray == root:
            continue
        if stray.name in {ASSET_ID, "COLLISION_HULL"} or stray.name in HOOK_NAMES:
            continue
        if stray.name.startswith("LOD"):
            continue
        if stray.parent is None or _strip_blender_dup(stray.name) == "rover":
            try:
                bpy.data.objects.remove(stray, do_unlink=True)
            except Exception:
                pass

    for hook in HOOK_NAMES:
        if hook not in sockets:
            sockets[hook] = _ensure_empty(hook, Vector((0.0, 0.0, 0.0)), root)

    chull = bpy.data.objects.new("COLLISION_HULL", None)
    bpy.context.scene.collection.objects.link(chull)
    chull.empty_display_type = "CUBE"
    chull.empty_display_size = 1.0
    chull.scale = Vector((0.935, 0.88, 0.495))
    chull["sf_collision"] = True
    chull["spaceface"] = {
        "collision": True,
        "helper": True,
        "nonRender": True,
        "role": "collision",
        "kind": "box",
    }
    chull["nonRender"] = True
    _reparent_keep_world(chull, root)

    contract = {
        "contractVersion": 1,
        "assetId": ASSET_ID,
        "partId": ASSET_ID,
        "liveId": ASSET_ID,
        "slot": "place",
        "category": "works",
        "family": "asteroid_works",
        "packet": "PQ-131.01",
        "role": "crewed gallery crawler — the only safety-yellow object in the mine",
        "forward": "+X",
        "up": "+Y",
        "starboard": "+Z",
        "unit": "metre",
        "normalConvention": "OpenGL",
        "ormChannels": "R=AO,G=Roughness,B=Metallic",
        "textureCompression": "PNG-source",
        "textureAuthorship": "deterministic 4x4 atlas PBR (livery/chevron/steel/track/glass/bit/lamp/rubble/scar)",
        "textureSize": 2048,
        "deliverableRole": "production_multi_lod",
        "lods": ["lod0", "lod1", "lod2"],
        "exportedLods": ["lod0", "lod1", "lod2"],
        "lodTriangles": {
            "lod0": int(lod_tri[0]),
            "lod1": int(lod_tri[1]),
            "lod2": int(lod_tri[2]),
        },
        "triangleCount": int(lod_tri[0]),
        "sockets": list(HOOK_NAMES),
        "hooks": list(HOOK_NAMES),
        "cutterSocket": "bit_tip",
        "cutterMeshes": list(bit_meshes),
        "wiringStatus": "promoted_source_pending_runtime_scatter",
        "blenderBasis": "Z-up works scale",
        "exportBasis": "Y-up glTF",
    }
    root["spacefaceAsset"] = contract
    bpy.context.scene["spacefaceAsset"] = contract

    bpy.ops.object.select_all(action="DESELECT")
    exportables = [root]
    stack = [root]
    while stack:
        node = stack.pop()
        for child in node.children:
            exportables.append(child)
            stack.append(child)
    for obj in exportables:
        try:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.hide_render = False
            obj.select_set(True)
        except Exception:
            pass
    bpy.context.view_layer.objects.active = root

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    combined_works = SOURCE_DIR / "rover.glb"
    combined_parts = PARTS_DIR / COMBINED_NAME
    tmp = SOURCE_DIR / "rover.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(tmp),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_image_format="AUTO",
    )
    mtx.sanitize_glb_floats(tmp)
    stamp_glb_contract(tmp, contract)
    if combined_works.exists():
        combined_works.unlink()
    shutil.move(str(tmp), str(combined_works))
    shutil.copy2(combined_works, combined_parts)
    inventory = {
        "assetId": ASSET_ID,
        "combined": str(combined_works.relative_to(ROOT)).replace("\\", "/"),
        "partsSource": str(combined_parts.relative_to(ROOT)).replace("\\", "/"),
        "lodTriangles": contract["lodTriangles"],
        "hooks": list(HOOK_NAMES),
        "cutterSocket": "bit_tip",
        "cutterMeshes": list(bit_meshes),
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
    }
    (SOURCE_DIR / "rover_inventory.json").write_text(
        json.dumps(inventory, indent=2) + "\n", encoding="utf-8",
    )
    print(json.dumps({"ok": True, **inventory}, indent=2))
    return inventory


def _read_glb(path: Path):
    data = bytearray(path.read_bytes())
    if data[:4] != b"glTF" or len(data) < 20:
        raise RuntimeError(f"not a GLB: {path}")
    json_len = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    json_end = json_start + json_len
    gltf = json.loads(bytes(data[json_start:json_end]).rstrip(b" \x00"))
    rest = bytes(data[json_end:])
    return gltf, rest


def _write_glb(path: Path, gltf: dict, rest: bytes) -> None:
    payload = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    while len(payload) % 4:
        payload += b" "
    header = bytearray()
    header += b"glTF"
    header += struct.pack("<I", 2)
    total = 12 + 8 + len(payload) + len(rest)
    header += struct.pack("<I", total)
    header += struct.pack("<I", len(payload))
    header += b"JSON"
    tmp = path.with_suffix(".glb.stamp-tmp")
    tmp.write_bytes(bytes(header) + payload + rest)
    tmp.replace(path)


def stamp_glb_contract(path: Path, contract: dict) -> None:
    gltf, rest = _read_glb(path)
    extras = dict(gltf.get("asset", {}).get("extras") or {})
    extras["assetId"] = ASSET_ID
    extras["partId"] = ASSET_ID
    extras["spacefaceAsset"] = contract
    gltf.setdefault("asset", {})["extras"] = extras
    scenes = gltf.get("scenes") or []
    if scenes:
        scene_extras = dict(scenes[0].get("extras") or {})
        scene_extras["assetId"] = ASSET_ID
        scene_extras["partId"] = ASSET_ID
        scene_extras["spacefaceAsset"] = contract
        scenes[0]["extras"] = scene_extras
    nodes = gltf.get("nodes") or []
    root = None
    for node in nodes:
        if node.get("name") == ASSET_ID:
            root = node
            break
    if root is None and nodes:
        # Prefer the node that owns the most children.
        root = max(nodes, key=lambda n: len(n.get("children") or []))
        root["name"] = ASSET_ID
    if root is not None:
        node_extras = dict(root.get("extras") or {})
        node_extras["spacefaceAsset"] = contract
        root["extras"] = node_extras
    hook_set = set(HOOK_NAMES)
    for node in nodes:
        name = node.get("name") or ""
        if name in hook_set and node.get("mesh") is None:
            extras = dict(node.get("extras") or {})
            extras["spacefaceSocket"] = True
            extras["socket"] = True
            space = dict(extras.get("spaceface") or {})
            space["socket"] = True
            space["role"] = "works_hook"
            extras["spaceface"] = space
            node["extras"] = extras
        if name.startswith("LOD") and "_" in name:
            extras = dict(node.get("extras") or {})
            lod = name.split("_", 1)[0].lower()
            extras["spacefaceLod"] = lod
            space = dict(extras.get("spaceface") or {})
            space["lod"] = lod
            extras["spaceface"] = space
            node["extras"] = extras
        if name == "COLLISION_HULL":
            extras = dict(node.get("extras") or {})
            extras["nonRender"] = True
            extras["sf_collision"] = True
            extras["spaceface"] = {
                "collision": True,
                "helper": True,
                "nonRender": True,
                "role": "collision",
                "kind": "box",
            }
            node["extras"] = extras
    _write_glb(path, gltf, rest)


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    combine_only = parse_args(argv)
    reports = None
    if not combine_only:
        reports = rebuild_lods()
    inventory = combine_lods()
    if reports:
        inventory["lodReports"] = [
            {
                "lod": r["lod"],
                "triangles": r["triangles"],
                "draws": r["draws"],
                "bbox": r.get("bbox"),
                "hooks": r.get("hooks"),
            }
            for r in reports
        ]
        (SOURCE_DIR / "rover_inventory.json").write_text(
            json.dumps(inventory, indent=2) + "\n", encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
