"""PQ-131.01 Works rover — production builder.

Rebuilds the three LOD sources (via the cycle-78 MTX form), then exports ONE
Y-up glTF with:

- LOD roots named LOD0_* / LOD1_* / LOD2_*
- named sockets the runtime drives (boom_pivot, bit_tip, hopper_fill_0..4,
  hopper_lid, lamp_socket, vent_stack, track_L, track_R, scar_plate)
- one named LOD<n>_Bit cutter mesh per LOD, parented beneath bit_tip
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
CUTTER_SOCKET = "bit_tip"
CUTTER_STEM = "Bit"
CUTTER_NAMES = tuple(f"LOD{lod}_{CUTTER_STEM}" for lod in (0, 1, 2))


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


def _join_cutter(imported, lod: int):
    """Keep the complete forged head and bright point as one runtime-driven cutter."""
    expected = {
        f"LOD{lod}_Merged_Material_Scar_Boom",
        f"LOD{lod}_Merged_Material_Bit_Boom",
    }
    parts = [
        obj for obj in imported
        if obj.type == "MESH" and obj.get("_sf_raw") in expected
    ]
    found = {obj.get("_sf_raw") for obj in parts}
    if found != expected:
        raise RuntimeError(
            f"LOD{lod} cutter requires forged and tool-steel meshes; "
            f"expected {sorted(expected)}, found {sorted(found)}"
        )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    cutter = next(
        obj for obj in parts
        if obj.get("_sf_raw") == f"LOD{lod}_Merged_Material_Bit_Boom"
    )
    bpy.context.view_layer.objects.active = cutter
    bpy.ops.object.join()
    cutter.name = CUTTER_NAMES[lod]
    cutter["_sf_raw"] = CUTTER_NAMES[lod]
    cutter["_sf_cutter"] = True
    # Joining removes the other Blender object, so rebuild the imported list from
    # live data instead of retaining an invalid StructRNA handle.
    return [
        obj for obj in bpy.data.objects
        if obj.get("sf_import_lod") == lod
    ]


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

    for lod, path in enumerate(lod_paths):
        imported = _import_lod(path, lod)
        for obj in imported:
            raw = _strip_blender_dup(obj.name)
            obj["_sf_raw"] = raw
        imported = _join_cutter(imported, lod)

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
            cutter = bool(obj.get("_sf_cutter"))
            if cutter:
                obj.name = CUTTER_NAMES[lod]
            elif raw in HOOK_MESHES:
                obj.name = f"LOD{lod}_{raw}"
            elif not raw.upper().startswith(f"LOD{lod}_"):
                if raw.upper().startswith("LOD"):
                    obj.name = raw
                else:
                    obj.name = f"LOD{lod}_{raw}"
            else:
                obj.name = raw
            obj["spacefaceLod"] = f"lod{lod}"
            obj["spaceface"] = {
                "lod": f"lod{lod}",
                **({"cutter": True, "socket": CUTTER_SOCKET} if cutter else {}),
            }
            if cutter:
                obj["spacefaceCutter"] = True
            tris = sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) if obj.data else 0
            lod_tri[lod] += tris
            mesh_names.append(obj.name)
            parent = root
            if cutter:
                parent = sockets.get(CUTTER_SOCKET) or sockets.get("boom_pivot") or root
            elif raw in HOOK_MESHES and raw in sockets:
                parent = sockets[raw]
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
        "cutterSocket": CUTTER_SOCKET,
        "cutterMeshes": list(CUTTER_NAMES),
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
        "meshNames": sorted(mesh_names),
        "bytes": combined_works.stat().st_size,
        "sha256": sha256(combined_works),
    }
    (SOURCE_DIR / "rover_inventory.json").write_bytes(
        (json.dumps(inventory, indent=2) + "\n").encode("utf-8"),
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
        (SOURCE_DIR / "rover_inventory.json").write_bytes(
            (json.dumps(inventory, indent=2) + "\n").encode("utf-8"),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
