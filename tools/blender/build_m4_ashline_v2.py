#!/usr/bin/env python3
"""M4 Ashline V2 source-adaptation builder.

This wrapper deliberately reuses the proven SpaceFace export/evidence contract from
``build_m4_ashline_family.py`` while replacing its primitive macro hulls with coherent
CC0 Quaternius Ultimate Spaceships source meshes.  Every output is isolated under
``assets/ships/m4_ashline_v2``; this script never promotes or wires runtime assets.

Blender authoring is Z-up. Export is glTF Y-up with +X forward.
"""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
BASE_SCRIPT = ROOT / "tools" / "blender" / "build_m4_ashline_family.py"
FAMILY_ROOT = ROOT / "assets" / "ships" / "m4_ashline_v2"
SOURCE_ROOT = FAMILY_ROOT / "source" / "reference" / "quaternius_ultimate_spaceships"
PACKET = "M4-ASHLINE-SOURCE-FAMILY-V2-001"


def load_base():
    spec = importlib.util.spec_from_file_location("spaceface_m4_ashline_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base()
base.FAMILY_ROOT = FAMILY_ROOT
base.PACKET = PACKET
base.FAMILY_ID = "ashline_v2"
base.LOD_RECIPES = (
    ("lod0", 1.0, False),
    ("lod1", 0.52, True),
    ("lod2", 0.20, True),
)


SHIP_CONFIG: dict[str, dict[str, Any]] = {
    "dart": {
        "donorHints": ("insurgent",),
        "targetLength": 15.6,
        "sourceScale": (1.12, 0.82, 0.72),
        "title": "Ashline V2 Dart",
    },
    "lode": {
        "donorHints": ("pancake",),
        "targetLength": 24.0,
        "sourceScale": (1.00, 1.16, 1.22),
        "title": "Ashline V2 Maul",
    },
    "rig": {
        "donorHints": ("striker",),
        "targetLength": 18.5,
        "sourceScale": (1.00, 1.04, 1.12),
        "title": "Ashline V2 Hook",
    },
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def source_candidates() -> list[Path]:
    preferred = {".glb": 0, ".gltf": 1, ".fbx": 2, ".obj": 3, ".blend": 4}
    files = [p for p in SOURCE_ROOT.rglob("*") if p.is_file() and p.suffix.lower() in preferred]
    return sorted(files, key=lambda p: (preferred[p.suffix.lower()], len(p.parts), str(p).lower()))


def resolve_donor(ship_key: str) -> Path:
    files = source_candidates()
    if not files:
        raise FileNotFoundError(f"No supported Quaternius source models beneath {SOURCE_ROOT}")
    hints = SHIP_CONFIG[ship_key]["donorHints"]
    for hint in hints:
        matches = [p for p in files if hint in str(p).lower()]
        if matches:
            # Prefer the base/red variation when the pack contains material variants.
            preferred = {".glb": 0, ".gltf": 1, ".fbx": 2, ".obj": 3, ".blend": 4}
            matches.sort(key=lambda p: (preferred[p.suffix.lower()], len(str(p))))
            return matches[0]
    raise FileNotFoundError(f"No donor matching {hints}; available={files[:20]}")


def import_source(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    ext = path.suffix.lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif ext == ".blend":
        with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
            data_to.objects = list(data_from.objects)
        for obj in data_to.objects:
            if obj is not None:
                bpy.context.scene.collection.objects.link(obj)
    imported = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not imported:
        raise RuntimeError(f"Source imported no mesh objects: {path}")
    return imported


def join_imported(imported: list[bpy.types.Object], coll: bpy.types.Collection) -> bpy.types.Object:
    base.ensure_object_mode()
    base.deselect_all()
    for obj in imported:
        # Preserve evaluated source topology while removing fragile parent transforms.
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    # Bake import-space rotations/scales before joining so bounds and +X normalization operate
    # on the actual visible geometry rather than the glTF scene-root transform.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(imported) > 1:
        bpy.ops.object.join()
    hull = bpy.context.active_object
    hull.name = "SourceAdapted_MacroHull"
    for owner in list(hull.users_collection):
        owner.objects.unlink(hull)
    coll.objects.link(hull)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return hull


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    pts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return (
        Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
        Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))),
    )


def orient_and_scale(hull: bpy.types.Object, ship_key: str) -> None:
    lo, hi = bounds(hull)
    dims = hi - lo
    major = max(range(3), key=lambda i: dims[i])
    if major == 1:
        hull.data.transform(Matrix.Rotation(-math.pi / 2.0, 4, 'Z'))
    elif major == 2:
        hull.data.transform(Matrix.Rotation(math.pi / 2.0, 4, 'Y'))
    hull.data.update()

    lo, hi = bounds(hull)
    dims = hi - lo
    if dims.x <= 0.001:
        raise RuntimeError("Degenerate donor length")
    target = float(SHIP_CONFIG[ship_key]["targetLength"])
    uniform = target / dims.x
    sx, sy, sz = SHIP_CONFIG[ship_key]["sourceScale"]
    hull.data.transform(Matrix.Diagonal((uniform * sx, uniform * sy, uniform * sz, 1.0)))
    hull.data.update()

    # Place geometric center at origin. Source role hardware and sockets are authored around it.
    lo, hi = bounds(hull)
    center = (lo + hi) * 0.5
    hull.data.transform(Matrix.Translation(-center))
    hull.data.update()

    # Infer nose direction from end-cap radial mass; the narrower end points forward.
    verts = [v.co.copy() for v in hull.data.vertices]
    xs = [v.x for v in verts]
    xmin, xmax = min(xs), max(xs)
    band = max(0.05, (xmax - xmin) * 0.13)
    neg = [math.hypot(v.y, v.z) for v in verts if v.x <= xmin + band]
    pos = [math.hypot(v.y, v.z) for v in verts if v.x >= xmax - band]
    neg_radius = sum(neg) / max(1, len(neg))
    pos_radius = sum(pos) / max(1, len(pos))
    if neg_radius < pos_radius:
        hull.data.transform(Matrix.Rotation(math.pi, 4, 'Z'))
        hull.data.update()


def add_source_role_layer(ship_key: str, coll: bpy.types.Collection,
                          mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Add restrained functional hardware without replacing the coherent donor silhouette."""
    out: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    red = mats["Material_Red_Paint"]
    cyan = mats["Material_Cyan"]
    warm = mats["Material_Warm"]
    if ship_key == "dart":
        for z in (-2.15, 2.15):
            out.append(base.make_cylinder(f"Dart_Engine_{z}", 0.55, 1.35, (-7.15, 0.0, z), mech, coll,
                                          vertices=32, component="engine", keep_separate=True))
            out.append(base.make_cylinder(f"Dart_Core_{z}", 0.34, 0.18, (-7.86, 0.0, z), cyan, coll,
                                          vertices=28, component="engine", keep_separate=True))
            rail = base.make_box(f"Dart_ThreatRail_{z}", (5.8, 0.12, 0.16), (0.1, 0.72, z * 0.72), red, coll)
            base.bevel_object(rail, 0.025, 2); out.append(rail)
        gun = base.make_cylinder("Dart_Gun", 0.19, 2.0, (7.35, -0.08, 0.0), mech, coll,
                                 vertices=24, component="weapon", keep_separate=True)
        out.append(gun)
    elif ship_key == "lode":
        for z in (-3.35, 3.35):
            pod = base.make_box(f"Maul_Casemate_{z}", (6.8, 1.35, 1.55), (0.0, 0.1, z), hull, coll)
            base.bevel_object(pod, 0.12, 3); out.append(pod)
            gun = base.make_cylinder(f"Maul_Gun_{z}", 0.28, 2.4, (10.6, 0.1, z), mech, coll,
                                     vertices=28, component="weapon", keep_separate=True)
            out.append(gun)
            rail = base.make_box(f"Maul_Rail_{z}", (6.2, 0.14, 0.18), (1.0, 1.0, z), red, coll)
            base.bevel_object(rail, 0.025, 2); out.append(rail)
        out.append(base.make_cylinder("Maul_Engine", 1.2, 1.8, (-11.0, 0.0, 0.0), cyan, coll,
                                      vertices=36, component="engine", keep_separate=True))
    else:
        boom = base.make_box("Hook_CaptureBoom", (8.2, 0.72, 0.82), (3.9, -0.65, -2.65), hull, coll)
        base.bevel_object(boom, 0.10, 3); out.append(boom)
        jaw = base.make_box("Hook_CaptureJaw", (1.6, 1.5, 0.65), (8.0, -0.55, -2.65), warm, coll,
                            component="tether", keep_separate=True)
        base.bevel_object(jaw, 0.08, 3); out.append(jaw)
        spool = base.make_cylinder("HOOK_TETHER_SPOOL", 1.05, 1.7, (1.4, -0.8, -2.1), warm, coll,
                                   vertices=40, rotation=base.ROT_ALONG_Y_PORT,
                                   component="tether", keep_separate=True)
        out.append(spool)
        for z in (-2.0, 1.7):
            out.append(base.make_cylinder(f"Hook_Engine_{z}", 0.72, 1.55, (-8.0, 0.0, z), mech, coll,
                                          vertices=32, component="engine", keep_separate=True))
            out.append(base.make_cylinder(f"Hook_Core_{z}", 0.42, 0.20, (-8.82, 0.0, z), cyan, coll,
                                          vertices=28, component="engine", keep_separate=True))
        rail = base.make_box("Hook_ThreatRail", (6.5, 0.13, 0.18), (0.2, 1.0, 1.55), red, coll)
        base.bevel_object(rail, 0.025, 2); out.append(rail)
    for obj in out:
        obj["sf_source_adaptation_detail"] = True
    return out


def create_compound_collision(export_coll: bpy.types.Collection, root: bpy.types.Object,
                              mesh_objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    lod0 = [o for o in mesh_objects if o.type == 'MESH' and 'lod0' in o.name.lower()]
    if not lod0:
        return None
    points = []
    for obj in lod0:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    size = hi - lo
    segment = size.x / 3.0
    helpers = []
    for index in range(3):
        center = Vector((lo.x + segment * (index + 0.5), (lo.y + hi.y) * 0.5, (lo.z + hi.z) * 0.5))
        bpy.ops.mesh.primitive_cube_add(size=2.0, location=center)
        helper = bpy.context.active_object
        helper.name = f'COLLISION_HULL_{index:02d}'
        # Slight overlap prevents high-speed seams while remaining far tighter than one AABB.
        helper.scale = (segment * 0.54, size.y * (0.42 + 0.04 * (index == 1)), size.z * (0.42 + 0.04 * (index == 1)))
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for owner in list(helper.users_collection):
            owner.objects.unlink(helper)
        export_coll.objects.link(helper)
        base.set_parent_keep_world(helper, root)
        helper.hide_render = True
        helper['spaceface'] = {
            'collision': True, 'compound': True, 'compoundIndex': index,
            'compoundCount': 3, 'helper': True, 'nonRender': True, 'role': 'collision',
        }
        helper['sf_collision'] = True
        helper['sf_non_render'] = True
        base.ensure_uvs_force(helper)
        base.triangulate_object(helper)
        helpers.append(helper)
    return helpers[0]


ORIGINAL_EXPORT_GLB = base.export_glb


def export_with_compound_collision(path: Path, objects: list[bpy.types.Object]) -> None:
    expanded = list(objects)
    known = {o.name for o in expanded if o}
    for obj in bpy.data.objects:
        if obj.get('sf_collision') and obj.name not in known:
            expanded.append(obj)
    ORIGINAL_EXPORT_GLB(path, expanded)


base.create_collision_hull = create_compound_collision
base.export_glb = export_with_compound_collision


def adapt_donor(ship_key: str, coll: bpy.types.Collection,
                mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    source = resolve_donor(ship_key)
    imported = import_source(source)
    hull = join_imported(imported, coll)
    orient_and_scale(hull, ship_key)

    hull.data.materials.clear()
    hull.data.materials.append(mats["Material_Hull"])
    hull["sf_detail_level"] = 0
    hull["sf_lod2_core"] = True
    hull["sf_source_family"] = "Quaternius Ultimate Spaceships Pack"
    hull["sf_source_file"] = str(source.relative_to(ROOT)).replace("\\", "/")
    hull["sf_source_sha256"] = sha256(source)
    base.bevel_object(hull, 0.055 if ship_key == "dart" else 0.075, 3)

    # Add only restrained functional hardware; the source mesh remains the macro authority.
    parts = [hull]
    parts.extend(add_source_role_layer(ship_key, coll, mats))
    for obj in parts:
        if obj.type == "MESH":
            base.ensure_uvs_force(obj)
            base.ensure_normals(obj)
    return parts


for key, config in SHIP_CONFIG.items():
    spec = copy.deepcopy(base.SHIP_SPECS[key])
    spec["id"] = f"ashline_v2_{key}"
    spec["assetId"] = f"SF_WHOLESHIP_ASHLINE_V2_{key.upper()}"
    spec["partId"] = f"wholeship_ashline_v2_{key}"
    spec["title"] = config["title"]
    spec["rootName"] = f"SF_M4_ASHLINE_V2_{key.upper()}_ROOT"
    # Keep exactly the stable nine-socket contract. The Hook spool is visual-only.
    spec["sockets"] = [s for s in spec["sockets"] if s[0] != "SOCKET_Tether_Front"]
    base.SHIP_SPECS[key] = spec
    base.BUILDERS[key] = lambda coll, mats, k=key: adapt_donor(k, coll, mats)


# The base build adds its parity layer after BUILDERS; our adapter already added it once.
base.add_quality_parity_layer = lambda ship_key, coll, mats: []


def write_source_receipt() -> None:
    receipt: dict[str, Any] = {
        "schema": "spaceface.sourceAdaptationReceipt.v1",
        "packet": PACKET,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceFamily": "Quaternius Ultimate Spaceships Pack",
        "sourcePage": "https://quaternius.com/packs/ultimatespaceships.html",
        "license": "CC0-1.0",
        "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
        "ships": {},
        "isolation": {
            "root": "assets/ships/m4_ashline_v2",
            "runtimePromotion": False,
            "touchesExistingAshline": False,
        },
    }
    for key in SHIP_CONFIG:
        donor = resolve_donor(key)
        receipt["ships"][key] = {
            "donor": str(donor.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256(donor),
            "hints": list(SHIP_CONFIG[key]["donorHints"]),
        }
    path = FAMILY_ROOT / "SOURCE_ADAPTATION.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    write_source_receipt()
    code = int(base.main())
    if code == 0:
        family_metrics = FAMILY_ROOT / "evidence" / "family" / "family_metrics.json"
        if family_metrics.exists():
            data = json.loads(family_metrics.read_text(encoding="utf-8"))
            data["schema"] = "spaceface.m4AshlineSourceFamilyMetrics.v1"
            data["packet"] = PACKET
            data["familyId"] = "ashline_v2"
            data["sourceAdaptationReceipt"] = "assets/ships/m4_ashline_v2/SOURCE_ADAPTATION.json"
            data["isolation"]["root"] = "assets/ships/m4_ashline_v2"
            family_metrics.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
