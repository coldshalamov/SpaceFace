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
base.CANONICAL_MATERIAL_NAMES = tuple(dict.fromkeys((
    *base.CANONICAL_MATERIAL_NAMES,
    "Material_RepairPrimer",
    "Material_HeatMetal",
    "Material_Refractory",
)))

ORIGINAL_CREATE_CANONICAL_MATERIALS = base.create_canonical_materials


def create_material_truth_materials() -> dict[str, bpy.types.Material]:
    mats = ORIGINAL_CREATE_CANONICAL_MATERIALS()
    # The legacy semantic slot remains available to runtime hooks, but the authored treatment is a
    # dim recessed energy cue rather than a glossy exterior neon part.
    base._wire_material_maps(
        mats["Material_Cyan"],
        (70, 12, 10, 255),
        0.45,
        0.02,
        (0.55, 0.02, 0.01),
        0.35,
    )
    additions = {
        # Chalked zinc/phosphate repair primer. It remains dielectric until physically chipped.
        "Material_RepairPrimer": ((132, 124, 108, 255), 0.82, 0.0, None, 0.0),
        # Nickel-superalloy hot sections and heat-darkened stainless shielding.
        "Material_HeatMetal": ((58, 48, 44, 255), 0.44, 0.92, None, 0.0),
        # Alumina/zirconia nozzle throats and optical collimators.
        "Material_Refractory": ((91, 86, 76, 255), 0.78, 0.0, None, 0.0),
    }
    for name, (rgba, rough, metal, emit, strength) in additions.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        base._wire_material_maps(mat, rgba, rough, metal, emit, strength)
        mats[name] = mat
    return mats


base.create_canonical_materials = create_material_truth_materials


def preserve_historical_render_paths(
    ship_key: str,
    _root: bpy.types.Object,
    _lod0_meshes: list[bpy.types.Object],
    evidence_dir: Path,
) -> list[str]:
    """Never overwrite unbound historical contacts during a source rebuild.

    Current material-truth evidence is produced by the separate exact-source renderer and bound
    through the evidence epoch. Reusing the old filenames here would create another mixed epoch.
    """
    renders = evidence_dir / "renders"
    if not renders.exists():
        return []
    return [
        str(path.relative_to(ROOT)).replace("\\", "/")
        for path in sorted(renders.glob("*.png"))
        if path.is_file()
    ]


base.render_evidence = preserve_historical_render_paths


def reset_scene_without_preferences() -> None:
    """Clear scene datablocks without resetting Blender preferences or the MCP add-on."""
    base.ensure_object_mode()
    base.deselect_all()
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


base.reset_scene = reset_scene_without_preferences

ORIGINAL_ENSURE_NORMALS = base.ensure_normals


def ensure_manufactured_normals(obj: bpy.types.Object) -> None:
    """Preserve rolled curvature while keeping folded and machined edges mechanically crisp."""
    if obj.type != "MESH":
        return
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(
            angle=math.radians(28.0),
            keep_sharp_edges=True,
        )
    except Exception:
        ORIGINAL_ENSURE_NORMALS(obj)
    finally:
        obj.select_set(False)


base.ensure_normals = ensure_manufactured_normals

ORIGINAL_TRIANGULATE_OBJECT = base.triangulate_object


def triangulate_and_validate(obj: bpy.types.Object) -> None:
    ORIGINAL_TRIANGULATE_OBJECT(obj)
    if obj.type == "MESH" and obj.data:
        # Blender's glTF exporter otherwise repairs invalid post-decimation custom data during
        # export and emits a warning. Repair it deterministically before evidence or export.
        obj.data.validate(clean_customdata=True)
        obj.data.update()


base.triangulate_object = triangulate_and_validate


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


def make_material_truth_mesh(
    name: str,
    vertices_rt: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Create an explicitly authored runtime-space mesh without primitive operator defaults."""
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata([base.L(*vertex) for vertex in vertices_rt], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    obj["sf_detail_level"] = detail
    obj["sf_source_adaptation_detail"] = True
    obj["sf_material_truth"] = True
    if close_only:
        obj["sf_close_only"] = True
    if component:
        obj["sf_component"] = component
    return obj


def make_runtime_box(
    name: str,
    size_rt: tuple[float, float, float],
    location_rt: tuple[float, float, float],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    sx, sy, sz = (value * 0.5 for value in size_rt)
    cx, cy, cz = location_rt
    vertices = [
        (cx + dx, cy + dy, cz + dz)
        for dx, dy, dz in (
            (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz), (-sx, sy, -sz),
            (sx, -sy, -sz), (sx, -sy, sz), (sx, sy, sz), (sx, sy, -sz),
        )
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_runtime_beveled_box(
    name: str,
    size_rt: tuple[float, float, float],
    location_rt: tuple[float, float, float],
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    bevel: float = 0.04,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Small manufactured block with explicit edge breaks; never use for primary silhouette masses."""
    obj = make_runtime_box(
        name, size_rt, location_rt, material, coll,
        detail=detail, close_only=close_only, component=component,
    )
    base.bevel_object(obj, bevel, 2)
    return obj


def make_chamfered_prism_x(
    name: str,
    x0: float,
    x1: float,
    center_y0: float,
    center_y1: float,
    center_z0: float,
    center_z1: float,
    height0: float,
    height1: float,
    width0: float,
    width1: float,
    chamfer_ratio: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Eight-sided changing section for receivers, girders, and housings with real edge breaks."""
    ratio = max(0.04, min(0.42, chamfer_ratio))
    vertices: list[tuple[float, float, float]] = []
    for x, cy, cz, height, width in (
        (x0, center_y0, center_z0, height0, width0),
        (x1, center_y1, center_z1, height1, width1),
    ):
        hy, hz = height * 0.5, width * 0.5
        dy, dz = height * ratio, width * ratio
        vertices.extend([
            (x, cy - hy + dy, cz - hz),
            (x, cy - hy, cz - hz + dz),
            (x, cy - hy, cz + hz - dz),
            (x, cy - hy + dy, cz + hz),
            (x, cy + hy - dy, cz + hz),
            (x, cy + hy, cz + hz - dz),
            (x, cy + hy, cz - hz + dz),
            (x, cy + hy - dy, cz - hz),
        ])
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(8))),
        tuple(8 + index for index in range(8)),
    ]
    for index in range(8):
        nxt = (index + 1) % 8
        faces.append((index, nxt, 8 + nxt, 8 + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_plate_outline_y(
    name: str,
    outline_xz: list[tuple[float, float]],
    y0: float,
    y1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Folded plate with an authored plan outline, avoiding rectangular decal-like slabs."""
    vertices = [
        (x, y, z)
        for y in (y0, y1)
        for x, z in outline_xz
    ]
    count = len(outline_xz)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_z(
    name: str,
    profile: list[tuple[float, float]],
    center_x: float,
    center_y: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 10,
    detail: int = 2,
    close_only: bool = True,
    component: str = "",
) -> bpy.types.Object:
    """Faceted bolt, bearing cap, or pin aligned to runtime Z."""
    vertices: list[tuple[float, float, float]] = []
    for z, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                center_x + math.cos(angle) * radius,
                center_y + math.sin(angle) * radius,
                z,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_y(
    name: str,
    profile: list[tuple[float, float]],
    center_x: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 8,
    detail: int = 2,
    close_only: bool = True,
    component: str = "",
) -> bpy.types.Object:
    """Faceted roof fastener or vertical pin aligned to runtime Y."""
    vertices: list[tuple[float, float, float]] = []
    for y, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                center_x + math.cos(angle) * radius,
                y,
                center_z + math.sin(angle) * radius,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_tapered_prism_x(
    name: str,
    x0: float,
    x1: float,
    center_y0: float,
    center_y1: float,
    center_z0: float,
    center_z1: float,
    height0: float,
    height1: float,
    width0: float,
    width1: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Closed folded/forged mass whose section changes along X instead of reading as a cuboid."""
    vertices: list[tuple[float, float, float]] = []
    for x, cy, cz, height, width in (
        (x0, center_y0, center_z0, height0, width0),
        (x1, center_y1, center_z1, height1, width1),
    ):
        hy, hz = height * 0.5, width * 0.5
        vertices.extend([
            (x, cy - hy, cz - hz),
            (x, cy - hy, cz + hz),
            (x, cy + hy, cz + hz),
            (x, cy + hy, cz - hz),
        ])
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_profile_x(
    name: str,
    profile: list[tuple[float, float]],
    center_y: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 12,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Faceted closed body of revolution along runtime +X."""
    vertices: list[tuple[float, float, float]] = []
    for x, radius in profile:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((
                x,
                center_y + math.cos(angle) * radius,
                center_z + math.sin(angle) * radius,
            ))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            a = ring * sides + index
            b = ring * sides + nxt
            c = (ring + 1) * sides + nxt
            d = (ring + 1) * sides + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(sides))))
    last = (len(profile) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_revolved_shell_x(
    name: str,
    profile: list[tuple[float, float, float]],
    center_y: float,
    center_z: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    sides: int = 12,
    detail: int = 0,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Faceted hollow shell with visible inner wall and open axial ends."""
    vertices: list[tuple[float, float, float]] = []
    for x, outer, inner in profile:
        for radius in (outer, inner):
            for index in range(sides):
                angle = math.tau * index / sides
                vertices.append((
                    x,
                    center_y + math.cos(angle) * radius,
                    center_z + math.sin(angle) * radius,
                ))
    faces: list[tuple[int, ...]] = []
    stride = sides * 2
    for ring in range(len(profile) - 1):
        for index in range(sides):
            nxt = (index + 1) % sides
            outer_a = ring * stride + index
            outer_b = ring * stride + nxt
            outer_c = (ring + 1) * stride + nxt
            outer_d = (ring + 1) * stride + index
            faces.append((outer_a, outer_b, outer_c, outer_d))
            inner_a = ring * stride + sides + index
            inner_b = (ring + 1) * stride + sides + index
            inner_c = (ring + 1) * stride + sides + nxt
            inner_d = ring * stride + sides + nxt
            faces.append((inner_a, inner_b, inner_c, inner_d))
    for ring in (0, len(profile) - 1):
        start = ring * stride
        for index in range(sides):
            nxt = (index + 1) % sides
            if ring == 0:
                faces.append((start + index, start + sides + index,
                              start + sides + nxt, start + nxt))
            else:
                faces.append((start + index, start + nxt,
                              start + sides + nxt, start + sides + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_segmented_clamp_x(
    name: str,
    x_center: float,
    depth: float,
    center_y: float,
    center_z: float,
    inner_radius: float,
    outer_radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    segments: int = 8,
    fill_ratio: float = 0.68,
    detail: int = 1,
    close_only: bool = False,
    component: str = "",
) -> bpy.types.Object:
    """Segmented clamp band; the gaps make assembly and service breaks explicit."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    x0, x1 = x_center - depth * 0.5, x_center + depth * 0.5
    for segment in range(segments):
        center = math.tau * (segment + 0.5) / segments
        half = math.pi * fill_ratio / segments
        a0, a1 = center - half, center + half
        base_index = len(vertices)
        for x in (x0, x1):
            for radius, angle in (
                (inner_radius, a0), (inner_radius, a1),
                (outer_radius, a1), (outer_radius, a0),
            ):
                vertices.append((
                    x,
                    center_y + math.cos(angle) * radius,
                    center_z + math.sin(angle) * radius,
                ))
        faces.extend([
            (base_index, base_index + 1, base_index + 2, base_index + 3),
            (base_index + 4, base_index + 7, base_index + 6, base_index + 5),
            (base_index, base_index + 4, base_index + 5, base_index + 1),
            (base_index + 1, base_index + 5, base_index + 6, base_index + 2),
            (base_index + 2, base_index + 6, base_index + 7, base_index + 3),
            (base_index + 3, base_index + 7, base_index + 4, base_index),
        ])
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only, component=component,
    )


def make_hat_section_x(
    name: str,
    x0: float,
    x1: float,
    center_y: float,
    center_z: float,
    height: float,
    width: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
) -> bpy.types.Object:
    """Folded sheet cover with feet, returns, and a raised center channel."""
    cross = [
        (0.0, -width * 0.50),
        (height * 0.18, -width * 0.50),
        (height * 0.18, -width * 0.34),
        (height, -width * 0.24),
        (height, width * 0.24),
        (height * 0.18, width * 0.34),
        (height * 0.18, width * 0.50),
        (0.0, width * 0.50),
    ]
    vertices = [
        (x, center_y + y, center_z + z)
        for x in (x0, x1)
        for y, z in cross
    ]
    count = len(cross)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only,
    )


def make_gusset(
    name: str,
    points_xy: tuple[tuple[float, float], tuple[float, float], tuple[float, float]],
    center_z: float,
    thickness: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 1,
    close_only: bool = False,
) -> bpy.types.Object:
    vertices = [
        (x, y, center_z + z)
        for z in (-thickness * 0.5, thickness * 0.5)
        for x, y in points_xy
    ]
    faces = [
        (0, 2, 1), (3, 4, 5),
        (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5),
    ]
    return make_material_truth_mesh(
        name, vertices, faces, material, coll,
        detail=detail, close_only=close_only,
    )


def make_service_line(
    name: str,
    points_rt: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    coll: bpy.types.Collection,
    *,
    detail: int = 2,
    close_only: bool = True,
) -> bpy.types.Object:
    """Low-sided rooted hose/hardline following an explicit service path."""
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 1
    curve.resolution_u = 1
    curve.resolution_v = 0
    spline = curve.splines.new("POLY")
    spline.points.add(len(points_rt) - 1)
    for point, runtime_point in zip(spline.points, points_rt):
        point.co = (*base.L(*runtime_point), 1.0)
    obj = bpy.data.objects.new(name, curve)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    base.ensure_object_mode()
    base.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj["sf_detail_level"] = detail
    obj["sf_source_adaptation_detail"] = True
    obj["sf_material_truth"] = True
    if close_only:
        obj["sf_close_only"] = True
    obj.select_set(False)
    return obj


def add_source_role_layer(ship_key: str, coll: bpy.types.Collection,
                          mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Add restrained functional hardware without replacing the coherent donor silhouette."""
    out: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    red = mats["Material_Red_Paint"]
    cyan = mats["Material_Cyan"]
    warm = mats["Material_Warm"]
    primer = mats["Material_RepairPrimer"]
    heat = mats["Material_HeatMetal"]
    refractory = mats["Material_Refractory"]
    if ship_key == "dart":
        # Vector Reaction Drive S: paired faceted pressure cases, explicit hot sections,
        # refractory bells, service gaps, clamps, load saddles, and rooted feed lines.
        for side, z in (("P", -2.15), ("S", 2.15)):
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_PressureCase_{side}",
                [(-7.58, 0.42), (-7.48, 0.50), (-6.68, 0.53), (-6.47, 0.45)],
                0.0, z, mech, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_HotSection_{side}",
                [(-7.94, 0.34), (-7.84, 0.44), (-7.57, 0.45), (-7.49, 0.37)],
                0.0, z, heat, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_shell_x(
                f"Dart_VRDS_NozzleBell_{side}",
                [(-8.29, 0.52, 0.41), (-8.08, 0.48, 0.35), (-7.86, 0.36, 0.25)],
                0.0, z, heat, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_shell_x(
                f"Dart_VRDS_RefractoryThroat_{side}",
                [(-8.27, 0.39, 0.31), (-8.07, 0.33, 0.26), (-7.88, 0.24, 0.17)],
                0.0, z, refractory, coll, sides=12, component="drive",
            ))
            out.append(make_revolved_profile_x(
                f"Dart_VRDS_RecessedEnergyCue_{side}",
                [(-7.73, 0.060), (-7.69, 0.060)],
                0.0, z, cyan, coll, sides=12, detail=2, close_only=True,
            ))
            for index, x in enumerate((-7.56, -6.67)):
                out.append(make_segmented_clamp_x(
                    f"Dart_VRDS_Clamp_{side}_{index}",
                    x, 0.11, 0.0, z, 0.49, 0.58, mech, coll,
                    segments=8, fill_ratio=0.66, detail=1, close_only=True,
                ))
            out.append(make_runtime_box(
                f"Dart_VRDS_LoadSaddle_{side}",
                (0.58, 0.34, 0.62), (-6.34, 0.0, z), mech, coll,
                detail=1, component="drive",
            ))
            out.append(make_gusset(
                f"Dart_VRDS_GussetUpper_{side}",
                ((-6.62, 0.10), (-5.96, 0.10), (-6.18, 0.48)),
                z, 0.12, mech, coll, detail=2, close_only=True,
            ))
            out.append(make_gusset(
                f"Dart_VRDS_GussetLower_{side}",
                ((-6.62, -0.10), (-6.18, -0.48), (-5.96, -0.10)),
                z, 0.12, mech, coll, detail=2, close_only=True,
            ))
            for line_index, y in enumerate((-0.25, 0.27)):
                out.append(make_service_line(
                    f"Dart_VRDS_FeedLine_{side}_{line_index}",
                    [(-5.72, y * 0.65, z * 0.72),
                     (-6.18, y, z * 0.86),
                     (-6.72, y, z)],
                    0.045 if line_index == 0 else 0.035,
                    heat if line_index == 0 else mech,
                    coll,
                ))
            for cover_index, (x0, x1) in enumerate((
                (-7.72, -7.48), (-7.40, -7.16), (-7.08, -6.84),
            )):
                out.append(make_hat_section_x(
                    f"Dart_VRDS_ThermalShield_{side}_{cover_index}",
                    x0, x1, 0.40, z, 0.10, 0.58, heat, coll,
                    detail=2, close_only=True,
                ))

        # Folded RCS/drive feed spines: a steel hardline under three unequal, lapped service covers.
        # Gaps expose the pipe and break the legacy row of identical red rectangular chiclets.
        for side, z in (("P", -1.55), ("S", 1.55)):
            out.append(make_service_line(
                f"Dart_FeedSpine_Pipe_{side}",
                [(-1.72, 0.65, z), (-0.62, 0.67, z), (0.62, 0.67, z), (1.82, 0.65, z)],
                0.055, mech, coll, detail=1, close_only=False,
            ))
            cover_layout = (
                ("A", -1.70, -1.02, 0.24, red),
                ("B", -0.75, 0.08, 0.20, hull),
                ("C", 0.43, 1.60, 0.27, red),
            )
            for cover_id, x0, x1, width, cover_material in cover_layout:
                out.append(make_hat_section_x(
                    f"Dart_FeedSpine_Cover_{side}_{cover_id}",
                    x0, x1, 0.65, z, 0.10, width, cover_material, coll,
                    detail=1,
                ))
                for flange_id, flange_x in (("L", x0 + 0.08), ("R", x1 - 0.08)):
                    out.append(make_runtime_box(
                        f"Dart_FeedSpine_Flange_{side}_{cover_id}_{flange_id}",
                        (0.11, 0.055, width + 0.08),
                        (flange_x, 0.625, z),
                        mech, coll, detail=2, close_only=True,
                    ))
            for foot_index, (x, width) in enumerate((
                (-1.40, 0.43), (-0.22, 0.36), (0.72, 0.40), (1.45, 0.46),
            )):
                out.append(make_runtime_box(
                    f"Dart_FeedSpine_Mount_{side}_{foot_index}",
                    (0.24, 0.16, width), (x, 0.58, z), mech, coll,
                    detail=2, close_only=True,
                ))

        # Fixed pulse projector S: a compact rooted optical assembly aligned to the existing
        # weapon socket. No recoil rail, magazine, ammunition feed, or accelerator geometry.
        out.append(make_runtime_box(
            "Dart_PulseProjector_LoadSaddle",
            (0.66, 0.30, 0.68), (5.92, 0.12, 0.25), mech, coll,
            detail=1, component="pulse_projector",
        ))
        out.append(make_gusset(
            "Dart_PulseProjector_GussetUpper",
            ((5.58, 0.08), (6.28, 0.08), (5.92, 0.48)),
            0.25, 0.12, mech, coll, detail=1,
        ))
        out.append(make_gusset(
            "Dart_PulseProjector_GussetLower",
            ((5.58, -0.02), (5.92, -0.36), (6.28, -0.02)),
            0.25, 0.12, mech, coll, detail=1,
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_OpticalBody",
            [(6.12, 0.23), (6.22, 0.30), (6.78, 0.30), (7.03, 0.22)],
            0.15, 0.25, mech, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_CoolingJacket",
            [(6.42, 0.31), (6.49, 0.36), (6.88, 0.36), (6.96, 0.27)],
            0.15, 0.25, heat, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_shell_x(
            "Dart_PulseProjector_RefractoryCollimator",
            [(6.96, 0.23, 0.13), (7.17, 0.21, 0.11), (7.32, 0.17, 0.09)],
            0.15, 0.25, refractory, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Dart_PulseProjector_RecessedAperture",
            [(7.16, 0.055), (7.19, 0.055)],
            0.15, 0.25, cyan, coll, sides=10, detail=2, close_only=True,
        ))
        out.append(make_segmented_clamp_x(
            "Dart_PulseProjector_RootGimbal",
            6.16, 0.14, 0.15, 0.25, 0.29, 0.39, mech, coll,
            segments=8, fill_ratio=0.62, detail=1,
        ))
        for rib_index, x in enumerate((6.52, 6.63, 6.74, 6.85)):
            out.append(make_segmented_clamp_x(
                f"Dart_PulseProjector_CoolingRib_{rib_index}",
                x, 0.045, 0.15, 0.25, 0.35, 0.40, heat, coll,
                segments=10, fill_ratio=0.72, detail=2, close_only=True,
            ))
        out.append(make_service_line(
            "Dart_PulseProjector_PowerFlex",
            [(5.54, 0.35, 0.07), (5.86, 0.31, 0.16), (6.22, 0.29, 0.25)],
            0.038, heat, coll,
        ))
        out.append(make_service_line(
            "Dart_PulseProjector_CoolantFlex",
            [(5.50, -0.02, 0.46), (5.82, 0.02, 0.38), (6.28, 0.03, 0.34)],
            0.032, mech, coll,
        ))
    elif ship_key == "lode":
        # The Lode is a broad industrial/security hull converted around two heavy-autocannon load
        # paths. Each casemate is an open steel machine bay: a radial cradle, framed aperture,
        # faceted receiver, exposed recoil cylinders, and replaceable folded weather plates.
        # None of the visible primary masses are allowed to be a plain cuboid.
        for side, z, outward in (("P", -3.55, -1.0), ("S", 3.55, 1.0)):
            component = f"autocannon_{side.lower()}"

            # Two changing-section longitudinal rails carry recoil into the donor hull.
            for beam_index, z_offset in enumerate((-0.44, 0.44)):
                out.append(make_chamfered_prism_x(
                    f"Lode_RadialLoadFrame_{side}_{beam_index}",
                    -2.60, 5.62,
                    -0.43, -0.30,
                    z + z_offset, z + z_offset * 0.72,
                    0.26, 0.20, 0.22, 0.16, 0.22,
                    mech, coll, detail=1, component=component,
                ))
            for cross_index, x in enumerate((-1.75, 0.10, 1.92, 3.70, 5.10)):
                out.append(make_runtime_beveled_box(
                    f"Lode_RadialLoadFrame_CrossMember_{side}_{cross_index}",
                    (0.18, 0.27, 1.04 - cross_index * 0.055),
                    (x, -0.36, z), mech, coll,
                    bevel=0.025, detail=2, close_only=True, component=component,
                ))
                out.append(make_gusset(
                    f"Lode_RadialLoadFrame_Gusset_{side}_{cross_index}",
                    ((x - 0.30, -0.31), (x + 0.30, -0.31), (x - 0.04, 0.15)),
                    z + outward * 0.55, 0.12, mech, coll,
                    detail=2, close_only=True,
                ))

            # Irregular folded weather plates bridge the open frame. Their plan outlines, lap
            # offsets, edge returns, and isolated repair colors prevent "one long roof slab".
            roof_layout = (
                ("Root", -1.62, -0.18, 0.62, 0.56, 0.54, 0.48,
                 hull),
                ("Service", 0.18, 1.62, 0.60, 0.53, 0.49, 0.43,
                 primer if side == "P" else hull),
                ("Forward", 1.98, 3.48, 0.55, 0.48, 0.45, 0.38,
                 hull),
                ("Trunnion", 3.82, 5.28, 0.50, 0.42, 0.42, 0.34,
                 hull),
            )
            for panel_id, x0, x1, y0, y1, half_width0, half_width1, panel_material in roof_layout:
                panel_center_z = z + outward * 0.03
                outline = [
                    (x0 + 0.10, panel_center_z - half_width0),
                    (x1 - 0.16, panel_center_z - half_width1),
                    (x1, panel_center_z - half_width1 * 0.62),
                    (x1 - 0.05, panel_center_z + half_width1),
                    (x0 + 0.20, panel_center_z + half_width0),
                    (x0, panel_center_z + half_width0 * 0.45),
                ]
                out.append(make_plate_outline_y(
                    f"Lode_CasemateShell_Roof_{side}_{panel_id}",
                    outline, max(y0, y1), max(y0, y1) + 0.065,
                    panel_material, coll, component=component,
                ))
                out.append(make_chamfered_prism_x(
                    f"Lode_CasemateShell_RoofFlange_{side}_{panel_id}",
                    x0 + 0.05, x1 - 0.10,
                    min(y0, y1) - 0.045, min(y0, y1) - 0.035,
                    panel_center_z + outward * (half_width0 + 0.035),
                    panel_center_z + outward * (half_width1 + 0.035),
                    0.09, 0.08, 0.10, 0.09, 0.22,
                    mech, coll, detail=2, close_only=True, component=component,
                ))
                for fastener_id, (fastener_x, fastener_z) in enumerate((
                    (x0 + (x1 - x0) * 0.24, panel_center_z + outward * half_width0 * 0.70),
                    (x0 + (x1 - x0) * 0.76, panel_center_z + outward * half_width1 * 0.70),
                )):
                    out.append(make_revolved_profile_y(
                        f"Lode_CasemateShell_RoofFastener_{side}_{panel_id}_{fastener_id}",
                        [(max(y0, y1) + 0.060, 0.050),
                         (max(y0, y1) + 0.115, 0.050)],
                        fastener_x, fastener_z, heat, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))

            # A low sill and two open perimeter rails expose the working mechanism. Small local
            # guards replace the former featureless wall panels.
            out.append(make_chamfered_prism_x(
                f"Lode_CasemateShell_FloorSill_{side}",
                -1.48, 5.42, -0.56, -0.42, z, z,
                0.18, 0.14, 1.36, 1.02, 0.18,
                hull, coll, component=component,
            ))
            for rail_id, y0, y1, width0, width1 in (
                ("UpperOuter", 0.48, 0.36, 0.17, 0.13),
                ("LowerOuter", -0.46, -0.36, 0.20, 0.15),
            ):
                out.append(make_chamfered_prism_x(
                    f"Lode_CasemateShell_FrameRail_{side}_{rail_id}",
                    -1.36, 5.38, y0, y1,
                    z + outward * 0.79, z + outward * 0.58,
                    0.18, 0.14, width0, width1, 0.22,
                    mech, coll, detail=1, component=component,
                ))
            for post_index, (x, lower_y, upper_y, outside_z) in enumerate((
                (-1.10, -0.43, 0.51, 0.77),
                (1.72, -0.41, 0.47, 0.69),
                (4.35, -0.36, 0.40, 0.60),
            )):
                out.append(make_service_line(
                    f"Lode_CasemateShell_FramePost_{side}_{post_index}",
                    [
                        (x - 0.20, lower_y, z + outward * outside_z),
                        (x + 0.02, (lower_y + upper_y) * 0.35,
                         z + outward * (outside_z + 0.06)),
                        (x + 0.26, upper_y, z + outward * (outside_z - 0.03)),
                    ],
                    0.075, mech, coll, detail=1, close_only=False,
                ))
                for bolt_y in (lower_y + 0.09, upper_y - 0.09):
                    cap_z0 = z + outward * (outside_z + 0.07)
                    cap_z1 = z + outward * (outside_z + 0.14)
                    out.append(make_revolved_profile_z(
                        f"Lode_CasemateShell_FrameBolt_{side}_{post_index}_{'U' if bolt_y > 0 else 'L'}",
                        [(min(cap_z0, cap_z1), 0.075), (max(cap_z0, cap_z1), 0.075)],
                        x, bolt_y, mech, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))
            out.append(make_plate_outline_y(
                f"Lode_CasemateShell_AccessPanel_{side}",
                [
                    (-0.74, z - 0.31), (0.96, z - 0.27),
                    (1.22, z - 0.12), (1.14, z + 0.28),
                    (-0.52, z + 0.34), (-0.82, z + 0.13),
                ],
                0.705, 0.785,
                red if side == "P" else primer, coll,
                detail=1, component=component,
            ))

            # Faceted receiver, removable feed cassette, trunnion bearings, and exposed fasteners.
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonBreech_{side}",
                3.20, 5.78, 0.02, 0.02, z, z,
                1.18, 0.86, 1.22, 0.94, 0.20,
                mech, coll, component=component,
            ))
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonFeedHousing_{side}",
                2.42, 3.42, 0.08, 0.04,
                z - outward * 0.04, z - outward * 0.02,
                0.92, 1.06, 1.05, 1.14, 0.18,
                mech, coll, detail=1, component=component,
            ))
            for trunnion_index, x in enumerate((3.58, 5.18)):
                out.append(make_segmented_clamp_x(
                    f"Lode_AutocannonTrunnion_{side}_{trunnion_index}",
                    x, 0.22, 0.02, z, 0.59, 0.75, mech, coll,
                    segments=8, fill_ratio=0.64, detail=1, component=component,
                ))
                for bearing_side, bearing_outward in (("Outer", outward), ("Inner", -outward)):
                    bearing_z0 = z + bearing_outward * 0.58
                    bearing_z1 = z + bearing_outward * 0.82
                    out.append(make_revolved_profile_z(
                        f"Lode_AutocannonTrunnionCap_{side}_{trunnion_index}_{bearing_side}",
                        [(min(bearing_z0, bearing_z1), 0.18),
                         (max(bearing_z0, bearing_z1), 0.18)],
                        x, 0.02, mech, coll, sides=10,
                        detail=1, close_only=False, component=component,
                    ))
                    pin_center = (bearing_z0 + bearing_z1) * 0.5
                    pin_half = 0.15
                    out.append(make_revolved_profile_z(
                        f"Lode_AutocannonTrunnionPin_{side}_{trunnion_index}_{bearing_side}",
                        [(pin_center - pin_half, 0.085), (pin_center + pin_half, 0.085)],
                        x, 0.02, heat, coll, sides=8,
                        detail=2, close_only=True, component=component,
                    ))
            out.append(make_chamfered_prism_x(
                f"Lode_AutocannonCassetteDoor_{side}",
                2.50, 3.30, 0.48, 0.50,
                z + outward * 0.10, z + outward * 0.10,
                0.13, 0.11, 0.76, 0.64, 0.18,
                primer if side == "S" else red, coll,
                detail=1, component=component,
            ))
            for fastener_index, (x, y) in enumerate((
                (2.62, 0.43), (3.14, 0.43), (2.64, -0.30), (3.16, -0.30),
            )):
                cap_z0 = z + outward * 0.58
                cap_z1 = z + outward * 0.69
                out.append(make_revolved_profile_z(
                    f"Lode_AutocannonReceiverFastener_{side}_{fastener_index}",
                    [(min(cap_z0, cap_z1), 0.065), (max(cap_z0, cap_z1), 0.065)],
                    x, y, heat, coll, sides=8, component=component,
                ))

            # Paired hydraulic dampers sit outside the receiver silhouette so the recoil path reads.
            for damper_index, (y, z_offset) in enumerate(((0.46, -0.48), (-0.43, 0.48))):
                damper_z = z + z_offset
                out.append(make_revolved_profile_x(
                    f"Lode_RecoilDamper_{side}_{damper_index}",
                    [(1.92, 0.12), (2.08, 0.20), (4.08, 0.20), (4.24, 0.14)],
                    y, damper_z, heat, coll, sides=10,
                    detail=1, component=component,
                ))
                out.append(make_revolved_profile_x(
                    f"Lode_RecoilDamper_Rod_{side}_{damper_index}",
                    [(4.18, 0.070), (5.34, 0.070)],
                    y, damper_z, mech, coll, sides=10,
                    detail=1, component=component,
                ))
                out.append(make_segmented_clamp_x(
                    f"Lode_RecoilDamper_Gland_{side}_{damper_index}",
                    4.15, 0.13, y, damper_z, 0.18, 0.25, mech, coll,
                    segments=8, fill_ratio=0.70, detail=2, close_only=True,
                ))
                out.append(make_service_line(
                    f"Lode_RecoilDamper_Service_{side}_{damper_index}",
                    [(2.08, y, damper_z), (1.56, y * 1.10, damper_z),
                     (0.82, y * 1.12, z + outward * 0.69)],
                    0.035, mech, coll,
                ))

            # Stepped barrel, replaceable heat shroud, and actual bore depth.
            out.append(make_revolved_profile_x(
                f"Lode_AutocannonBarrel_{side}",
                [(5.45, 0.34), (5.72, 0.42), (6.15, 0.38), (8.90, 0.28),
                 (10.36, 0.24)],
                0.02, z, mech, coll, sides=12, component=component,
            ))
            out.append(make_revolved_shell_x(
                f"Lode_AutocannonHeatShroud_{side}",
                [(6.02, 0.49, 0.40), (6.32, 0.50, 0.40), (8.72, 0.40, 0.32),
                 (8.96, 0.36, 0.29)],
                0.02, z, heat, coll, sides=12, component=component,
            ))
            for rib_index, (x, depth, outer, fill) in enumerate((
                (6.38, 0.13, 0.54, 0.70),
                (7.42, 0.09, 0.49, 0.46),
                (8.48, 0.16, 0.51, 0.60),
            )):
                out.append(make_segmented_clamp_x(
                    f"Lode_AutocannonCoolingRib_{side}_{rib_index}",
                    x, depth, 0.02, z, 0.42, outer, heat, coll,
                    segments=10, fill_ratio=fill, detail=2, close_only=True,
                ))
            for rail_index, (y_offset, z_offset) in enumerate((
                (0.36, 0.0), (-0.36, 0.0), (0.0, -0.36), (0.0, 0.36),
            )):
                out.append(make_service_line(
                    f"Lode_AutocannonShroudStringer_{side}_{rail_index}",
                    [(6.10, 0.02 + y_offset, z + z_offset),
                     (7.42, 0.02 + y_offset * 0.92, z + z_offset * 0.92),
                     (8.84, 0.02 + y_offset * 0.76, z + z_offset * 0.76)],
                    0.028, heat, coll, detail=2, close_only=True,
                ))
            out.append(make_revolved_shell_x(
                f"Lode_AutocannonMuzzle_{side}",
                [(10.24, 0.34, 0.19), (10.53, 0.36, 0.19), (10.82, 0.29, 0.18)],
                0.02, z, heat, coll, sides=12, component=component,
            ))

            # Two triangular trunnion cheeks leave the barrel, rods, and bearing caps visible.
            for cheek_id, cheek_z in (
                ("Outer", z + outward * 0.66),
                ("Inner", z - outward * 0.66),
            ):
                out.append(make_gusset(
                    f"Lode_AutocannonMantlet_{side}_{cheek_id}_Upper",
                    ((4.92, 0.17), (5.64, 0.15), (5.08, 0.48)),
                    cheek_z, 0.13, mech, coll, detail=1,
                ))
                out.append(make_gusset(
                    f"Lode_AutocannonMantlet_{side}_{cheek_id}_Lower",
                    ((4.94, -0.15), (5.66, -0.13), (5.10, -0.46)),
                    cheek_z, 0.13, mech, coll, detail=1,
                ))
                out.append(make_revolved_profile_z(
                    f"Lode_AutocannonMantletPivot_{side}_{cheek_id}",
                    [(cheek_z - 0.11, 0.20), (cheek_z + 0.11, 0.20)],
                    5.20, 0.02, heat, coll, sides=10,
                    detail=1, close_only=False, component=component,
                ))

        # Compact central pulse projector terminating immediately behind the existing socket.
        out.append(make_tapered_prism_x(
            "Lode_PulseProjector_LoadSaddle",
            7.85, 8.48,
            0.22, 0.29, 0.0, 0.0,
            0.46, 0.36, 0.78, 0.64,
            mech, coll, detail=1, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_OpticalBody",
            [(8.18, 0.22), (8.32, 0.30), (9.42, 0.30), (9.62, 0.23)],
            0.35, 0.0, mech, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_CoolingJacket",
            [(8.72, 0.31), (8.82, 0.37), (9.44, 0.37), (9.60, 0.26)],
            0.35, 0.0, heat, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_shell_x(
            "Lode_PulseProjector_RefractoryCollimator",
            [(9.58, 0.25, 0.14), (9.82, 0.23, 0.12), (10.02, 0.18, 0.09)],
            0.35, 0.0, refractory, coll, sides=10, component="pulse_projector",
        ))
        out.append(make_revolved_profile_x(
            "Lode_PulseProjector_RecessedAperture",
            [(9.83, 0.052), (9.87, 0.052)],
            0.35, 0.0, cyan, coll, sides=10, detail=2, close_only=True,
        ))
        out.append(make_service_line(
            "Lode_PulseProjector_PowerService",
            [(7.82, 0.58, -0.22), (8.24, 0.53, -0.18), (8.78, 0.46, -0.13)],
            0.038, heat, coll,
        ))
        out.append(make_service_line(
            "Lode_PulseProjector_CoolantService",
            [(7.76, 0.10, 0.30), (8.24, 0.14, 0.26), (8.76, 0.22, 0.18)],
            0.032, mech, coll,
        ))

        # Single open-cycle torch: explicit hot/cold sections, hollow bell, thrust frame,
        # asymmetric service packs, and a tiny energy cue buried inside the flow path.
        out.append(make_revolved_profile_x(
            "Lode_TorchPressureCase",
            [(-10.28, 0.82), (-10.10, 1.02), (-8.72, 1.08), (-8.42, 0.84)],
            0.0, 0.0, mech, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_profile_x(
            "Lode_TorchHotJacket",
            [(-10.72, 0.66), (-10.58, 0.85), (-10.20, 0.92), (-10.04, 0.76)],
            0.0, 0.0, heat, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchBell",
            [(-11.82, 1.20, 0.94), (-11.34, 1.06, 0.78), (-10.62, 0.69, 0.49)],
            0.0, 0.0, heat, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchRefractoryThroat",
            [(-11.78, 0.91, 0.72), (-11.32, 0.75, 0.57), (-10.66, 0.47, 0.32)],
            0.0, 0.0, refractory, coll, sides=14, component="drive",
        ))
        out.append(make_revolved_shell_x(
            "Lode_TorchSootedInnerLiner",
            [(-11.70, 0.69, 0.60), (-11.27, 0.54, 0.46), (-10.70, 0.29, 0.21)],
            0.0, 0.0, heat, coll, sides=14, detail=1, component="drive",
        ))
        out.append(make_revolved_profile_x(
            "Lode_TorchRecessedEnergyCue",
            [(-10.50, 0.035), (-10.46, 0.035)],
            0.0, 0.0, cyan, coll, sides=12, detail=2, close_only=True,
        ))
        for clamp_index, x in enumerate((-10.20, -8.80)):
            out.append(make_revolved_profile_x(
                f"Lode_TorchClamp_Band_{clamp_index}",
                [(x - 0.07, 1.105), (x + 0.07, 1.105)],
                0.0, 0.0, mech, coll, sides=14, detail=1, component="drive",
            ))
            for latch_id, y, z in (
                ("Upper", 1.12, 0.0),
                ("Lower", -1.12, 0.0),
                ("Port", 0.0, -1.12),
                ("Starboard", 0.0, 1.12),
            ):
                out.append(make_tapered_prism_x(
                    f"Lode_TorchClamp_Latch_{clamp_index}_{latch_id}",
                    x - 0.13, x + 0.13,
                    y, y * 1.02, z, z * 1.02,
                    0.20 if y else 0.26, 0.16 if y else 0.22,
                    0.26 if z else 0.20, 0.22 if z else 0.16,
                    mech, coll, detail=2, close_only=True, component="drive",
                ))
        for side, z in (("P", -1.20), ("S", 1.20)):
            out.append(make_tapered_prism_x(
                f"Lode_TorchThrustSaddle_{side}",
                -9.20, -7.65,
                -0.52, -0.40, z, z * 0.76,
                0.40, 0.30, 0.38, 0.32,
                mech, coll, detail=1, component="drive",
            ))
            out.append(make_gusset(
                f"Lode_TorchThrustGusset_{side}",
                ((-9.15, -0.40), (-7.45, -0.40), (-8.05, 0.34)),
                z, 0.18, mech, coll, detail=1,
            ))
        # The three pump/valve stations are mounted equipment, not anonymous boxes. Each station
        # has a faceted manifold, cylindrical accumulator, split clamp, valves, and rooted lines.
        for pack_id, y, z, size in (
            ("A", 0.72, -1.08, (0.62, 0.44, 0.42)),
            ("B", -0.56, 1.16, (0.54, 0.40, 0.52)),
            ("C", 0.36, 1.32, (0.44, 0.34, 0.34)),
        ):
            pack_material = heat if pack_id == "A" else mech
            out.append(make_chamfered_prism_x(
                f"Lode_TorchServicePack_{pack_id}",
                -9.76, -9.76 + size[0],
                y, y * 0.92, z, z,
                size[1], size[1] * 0.82, size[2], size[2] * 0.84, 0.24,
                pack_material, coll,
                detail=1, component="drive",
            ))
            accumulator_z = z + (0.26 if z < 0 else -0.26)
            out.append(make_revolved_profile_x(
                f"Lode_TorchAccumulator_{pack_id}",
                [(-9.70, 0.12), (-9.62, 0.17), (-9.22, 0.17), (-9.14, 0.12)],
                y * 0.82, accumulator_z, heat, coll, sides=10,
                detail=1, component="drive",
            ))
            out.append(make_segmented_clamp_x(
                f"Lode_TorchAccumulatorClamp_{pack_id}",
                -9.44, 0.10, y * 0.82, accumulator_z, 0.16, 0.21,
                mech, coll, segments=8, fill_ratio=0.66,
                detail=2, close_only=True, component="drive",
            ))
            for valve_index, (valve_x, valve_y) in enumerate((
                (-9.60, y + 0.22), (-9.28, y - 0.20),
            )):
                out.append(make_revolved_profile_z(
                    f"Lode_TorchValve_{pack_id}_{valve_index}",
                    [(z - 0.12, 0.075), (z + 0.12, 0.075)],
                    valve_x, valve_y, heat, coll, sides=8,
                    detail=2, close_only=True, component="drive",
                ))
            out.append(make_service_line(
                f"Lode_TorchServiceLine_{pack_id}",
                [(-8.16, y * 0.58, z * 0.52), (-8.72, y * 0.72, z * 0.72),
                 (-9.45, y, z)],
                0.045 if pack_id == "A" else 0.035,
                pack_material,
                coll, detail=1, close_only=False,
            ))
            out.append(make_service_line(
                f"Lode_TorchReturnLine_{pack_id}",
                [(-8.08, y * 0.48, z * 0.42), (-8.64, y * 0.58, z * 0.62),
                 (-9.18, y * 0.72, accumulator_z)],
                0.028, mech, coll, detail=2, close_only=True,
            ))

        # Longitudinal jacket stringers and inspection lugs break the "smooth leather tube"
        # reading while remaining visibly attached to the thrust case.
        for stringer_index, (y_factor, z_factor) in enumerate((
            (0.78, 0.0), (-0.78, 0.0), (0.0, 0.78), (0.0, -0.78),
            (0.55, 0.55), (-0.55, 0.55),
        )):
            out.append(make_service_line(
                f"Lode_TorchJacketStringer_{stringer_index}",
                [(-10.50, y_factor * 0.92, z_factor * 0.92),
                 (-9.62, y_factor * 1.02, z_factor * 1.02),
                 (-8.62, y_factor * 0.86, z_factor * 0.86)],
                0.035, mech, coll, detail=2, close_only=True,
            ))
        for lug_index, (x, y, z) in enumerate((
            (-10.08, 1.08, 0.36), (-10.08, -1.08, -0.36),
            (-8.92, 0.36, 1.08), (-8.92, -0.36, -1.08),
        )):
            out.append(make_runtime_beveled_box(
                f"Lode_TorchInspectionLug_{lug_index}",
                (0.24, 0.18, 0.14), (x, y, z), mech, coll,
                bevel=0.025, detail=2, close_only=True, component="drive",
            ))
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
ORIGINAL_CREATE_ROOT_AND_SOCKETS = base.create_root_and_sockets


def create_root_with_material_truth(
    export_coll: bpy.types.Collection,
    spec: dict[str, Any],
) -> bpy.types.Object:
    root = ORIGINAL_CREATE_ROOT_AND_SOCKETS(export_coll, spec)
    if spec["id"] == "ashline_v2_dart":
        asset = dict(root.get("spacefaceAsset", {}))
        asset["materialTruthRevision"] = "dart-material-truth-2026-07-28-v1"
        asset["driveProfileId"] = "drive_reaction_s"
        asset["weaponId"] = "wpn_pulse_laser_s"
        asset["weaponKind"] = "pulse_projector"
        root["spacefaceAsset"] = asset
        spaceface = dict(root.get("spaceface", {}))
        spaceface["materialTruth"] = {
            "revision": "dart-material-truth-2026-07-28-v1",
            "components": [
                "vector-reaction-drive-s-twin",
                "folded-feed-spines",
                "fixed-pulse-projector-s",
            ],
        }
        root["spaceface"] = spaceface
    elif spec["id"] == "ashline_v2_lode":
        asset = dict(root.get("spacefaceAsset", {}))
        asset["materialTruthRevision"] = "lode-material-truth-2026-07-28-v1"
        asset["driveProfileId"] = "drive_torch_l"
        asset["weaponIds"] = [
            "wpn_autocannon_m",
            "wpn_autocannon_m",
            "wpn_pulse_laser_s",
        ]
        root["spacefaceAsset"] = asset
        spaceface = dict(root.get("spaceface", {}))
        spaceface["materialTruth"] = {
            "revision": "lode-material-truth-2026-07-28-v1",
            "components": [
                "paired-heavy-autocannon-casemates",
                "radial-recoil-load-frames",
                "fixed-pulse-projector-s",
                "open-cycle-torch-l",
            ],
        }
        root["spaceface"] = spaceface
    return root


def export_with_compound_collision(path: Path, objects: list[bpy.types.Object]) -> None:
    expanded = list(objects)
    known = {o.name for o in expanded if o}
    for obj in bpy.data.objects:
        if obj.get('sf_collision') and obj.name not in known:
            expanded.append(obj)
    ORIGINAL_EXPORT_GLB(path, expanded)


base.create_collision_hull = create_compound_collision
base.export_glb = export_with_compound_collision
base.create_root_and_sockets = create_root_with_material_truth


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
    path = FAMILY_ROOT / "SOURCE_ADAPTATION.json"
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))
        if previous.get("createdAt"):
            created_at = previous["createdAt"]
    receipt: dict[str, Any] = {
        "schema": "spaceface.sourceAdaptationReceipt.v1",
        "packet": PACKET,
        "createdAt": created_at,
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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


def write_material_truth_receipt(ship_key: str) -> None:
    if ship_key not in {"dart", "lode"}:
        return
    summary_path = FAMILY_ROOT / "evidence" / ship_key / "build_summary.json"
    source_path = FAMILY_ROOT / "source" / "wholeships" / f"ashline_v2_{ship_key}.glb"
    if not summary_path.exists() or not source_path.exists():
        raise FileNotFoundError(f"{ship_key.title()} material-truth receipt inputs are missing")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if ship_key == "lode":
        summary["materialTruth"] = {
            "revision": "lode-material-truth-2026-07-28-v1",
            "sourceSha256": sha256(source_path),
            "driveProfileId": "drive_torch_l",
            "weaponIds": [
                "wpn_autocannon_m",
                "wpn_autocannon_m",
                "wpn_pulse_laser_s",
            ],
            "components": [
                "paired-heavy-autocannon-casemates",
                "radial-recoil-load-frames",
                "fixed-pulse-projector-s",
                "open-cycle-torch-l",
            ],
            "fictionalMaterials": {
                "Material_Hull": "coated-or-oxidized-armor-and-donor-structure",
                "Material_Mechanical": "nitrided-load-frame-trunnion-and-service-steel",
                "Material_Red_Paint": "non-metallic-reach-oxide-red-coating",
                "Material_RepairPrimer": "chalked-zinc-phosphate-dielectric-primer",
                "Material_HeatMetal": "nickel-hot-sections-and-heat-darkened-stainless",
                "Material_Refractory": "alumina-zirconia-ceramic",
                "Material_Cyan": "recessed-internal-energy-cue",
            },
            "acceptedComponentRoles": [
                "armor-shell", "autocannon-barrel", "autocannon-breech",
                "cassette-access", "hydraulic-recoil-damper", "mantlet",
                "open-cycle-torch", "pulse-projector", "radial-load-frame",
                "refractory-throat", "service-pack", "thrust-saddle", "trunnion",
            ],
            "lodPolicy": {
                "lod0": "full-component-construction",
                "lod1": "load-path-and-material-boundaries",
                "lod2": "donor-macro-hull-only",
            },
            "references": [
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "lode_autocannon_casemate_reference.png",
                "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
                "lode_open_cycle_torch_reference.png",
            ],
            "promotionBlockers": [
                "single-central-weapon-socket-versus-three-visible-weapons-needs-runtime-vfx-proof",
                "browser-electron-and-lod-transition-evidence-remains-external",
            ],
        }
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        return
    summary["materialTruth"] = {
        "revision": "dart-material-truth-2026-07-28-v1",
        "sourceSha256": sha256(source_path),
        "driveProfileId": "drive_reaction_s",
        "weaponId": "wpn_pulse_laser_s",
        "weaponKind": "pulse_projector",
        "components": [
            "fixed-pulse-projector-s",
            "folded-feed-spines",
            "vector-reaction-drive-s-twin",
        ],
        "fictionalMaterials": {
            "Material_Hull": "oxidized-or-coated-structural-steel",
            "Material_Mechanical": "nitrided-structural-steel",
            "Material_Red_Paint": "non-metallic-oxide-red-coating",
            "Material_HeatMetal": "nickel-superalloy-and-heat-darkened-stainless",
            "Material_Refractory": "alumina-zirconia-ceramic",
            "Material_Cyan": "recessed-internal-energy-cue",
        },
        "acceptedComponentRoles": [
            "cold-pressure-case",
            "cooling-jacket",
            "coolant-service",
            "feed-spine-cover",
            "feed-spine-mount",
            "feed-spine-pipe",
            "fixed-pulse-projector",
            "hot-section",
            "load-clevis-and-saddle",
            "optical-collimator",
            "power-service",
            "refractory-nozzle-throat",
            "segmented-clamp",
            "thermal-shield",
        ],
        "forbiddenWeaponRoles": [
            "ammo", "autocannon", "coilgun", "magazine",
            "projectile-accelerator", "recoil",
        ],
        "driveCentersRuntime": [
            {"x": -7.25, "y": 0.0, "z": -2.15},
            {"x": -7.25, "y": 0.0, "z": 2.15},
        ],
        "serviceTypes": ["coolant", "power"],
        "lodPolicy": {
            "lod0": "full-component-construction",
            "lod1": "load-path-and-material-boundaries",
            "lod2": "donor-macro-hull-only",
        },
        "references": [
            "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
            "dart_twin_drive_component_reference.png",
            "assets/ships/m4_ashline_v2/reference/material_truth_v2/"
            "dart_forward_pulse_projector_reference.png",
        ],
    }
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def requested_ship_keys() -> list[str]:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = base.parse_args(argv)
    return [args["only"]] if args["only"] else list(SHIP_CONFIG)


def family_metric_row(ship_key: str) -> dict[str, Any]:
    metrics_path = FAMILY_ROOT / "evidence" / ship_key / "production_metrics.json"
    if not metrics_path.exists():
        raise FileNotFoundError(f"missing {ship_key} production metrics: {metrics_path}")
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    report = metrics["report"]
    lod_breakdown = report["lodBreakdown"]
    source_path = FAMILY_ROOT / "source" / "wholeships" / f"ashline_v2_{ship_key}.glb"
    return {
        "key": ship_key,
        "id": f"ashline_v2_{ship_key}",
        "role": base.SHIP_SPECS[ship_key]["role"],
        "totalTriangles": report["totalTriangles"],
        "hullTriangles": report["hullTriangles"],
        "lodTriangles": {
            lod: lod_breakdown[lod]["triangles"]
            for lod in ("lod0", "lod1", "lod2")
        },
        "lod0AabbSize": report["lod0AabbSize"],
        "collisionBounds": report["collisionBounds"],
        "sockets": report["sockets"],
        "materials": report["materials"],
        "sha256": sha256(source_path),
        "sourceGlb": str(source_path.relative_to(ROOT)).replace("\\", "/"),
        "blend": metrics["blend"],
        "sourceBytes": source_path.stat().st_size,
        "evidenceEpoch": metrics.get("evidenceEpoch", {
            "status": "requires-post-finalize-epoch",
        }),
    }


def normalize_family_metrics() -> None:
    family_metrics = FAMILY_ROOT / "evidence" / "family" / "family_metrics.json"
    if not family_metrics.exists():
        raise FileNotFoundError(f"missing family metrics: {family_metrics}")
    data = json.loads(family_metrics.read_text(encoding="utf-8"))
    data["schema"] = "spaceface.m4AshlineSourceFamilyMetrics.v1"
    data["packet"] = PACKET
    data["familyId"] = "ashline_v2"
    data["ships"] = [family_metric_row(key) for key in SHIP_CONFIG]
    data["sourceAdaptationReceipt"] = "assets/ships/m4_ashline_v2/SOURCE_ADAPTATION.json"
    data["isolation"]["root"] = "assets/ships/m4_ashline_v2"
    family_metrics.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    write_source_receipt()
    built_keys = requested_ship_keys()
    code = int(base.main())
    if code == 0:
        for ship_key in built_keys:
            write_material_truth_receipt(ship_key)
        normalize_family_metrics()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
