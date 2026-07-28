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
    if ship_key != "dart":
        return
    summary_path = FAMILY_ROOT / "evidence" / ship_key / "build_summary.json"
    source_path = FAMILY_ROOT / "source" / "wholeships" / "ashline_v2_dart.glb"
    if not summary_path.exists() or not source_path.exists():
        raise FileNotFoundError("Dart material-truth receipt inputs are missing")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
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
