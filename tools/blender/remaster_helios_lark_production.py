#!/usr/bin/env python3
"""Helios Lark production remaster (GFX pilot) — continuous form + UV/bake + authored LODs.

Runs inside Blender. Replaces the blockout ``build_lark_parts`` path with a production-oriented
construction while reusing family materials, sockets, export, and evidence harness.

Usage:
  blender --background --python tools/blender/remaster_helios_lark_production.py --

Does not touch cradle/span builders. Writes only under assets/ships/m4_helios_civilian/** and
evidence for Lark.
"""
from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path
from typing import Any

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
FAMILY_BUILDER = ROOT / "tools" / "blender" / "build_m4_helios_civilian_family.py"
REMASTER_TAG = "GFX-LARK-REMASTER-001"
TEX_SIZE = 1024


def _load_family():
    spec = importlib.util.spec_from_file_location("m4_helios_civilian_family", FAMILY_BUILDER)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


F = _load_family()


# ---------------------------------------------------------------------------
# Geometry helpers (production)
# ---------------------------------------------------------------------------

def _link(obj: bpy.types.Object, coll: bpy.types.Collection) -> bpy.types.Object:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def _apply(obj: bpy.types.Object) -> None:
    F.ensure_object_mode()
    F.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def _bmesh_to_object(name: str, bm: bmesh.types.BMesh, coll: bpy.types.Collection,
                     mat: bpy.types.Material | None = None,
                     loc_rt: tuple[float, float, float] = (0.0, 0.0, 0.0)) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    # Runtime +X fwd,+Y up,+Z stbd → Blender Z-up via F.L
    obj.location = Vector(F.L(*loc_rt))
    _link(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def make_fuselage_loft(
    name: str,
    stations: list[tuple[float, float, float]],
    segs: int,
    coll: bpy.types.Collection,
    mat: bpy.types.Material,
    *,
    cap_ends: bool = True,
) -> bpy.types.Object:
    """Continuous oval fuselage along runtime +X. stations: (x_rt, ry, rz)."""
    bm = bmesh.new()
    rings: list[list[bmesh.types.BMVert]] = []
    for x_rt, ry, rz in stations:
        # Blender coords: runtime (x,y,z) → F.L
        cx, cy, cz = F.L(x_rt, 0.0, 0.0)
        ring: list[bmesh.types.BMVert] = []
        for i in range(segs):
            a = (i / segs) * math.tau
            # oval in runtime Y-up / Z-stbd plane at fixed X
            y_rt = math.sin(a) * ry
            z_rt = math.cos(a) * rz
            bx, by, bz = F.L(x_rt, y_rt, z_rt)
            ring.append(bm.verts.new((bx, by, bz)))
        rings.append(ring)
    bm.verts.ensure_lookup_table()
    for ri in range(len(rings) - 1):
        a, b = rings[ri], rings[ri + 1]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((a[i], a[j], b[j], b[i]))
    if cap_ends and rings:
        # nose (max x) and tail (min x) — stations ordered aft→nose or any; detect
        # Use first/last ring face with consistent winding
        try:
            bm.faces.new(list(reversed(rings[0])))
        except ValueError:
            pass
        try:
            bm.faces.new(rings[-1])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _bmesh_to_object(name, bm, coll, mat)
    return obj


def make_wing_plate(
    name: str,
    *,
    length: float,
    root_chord: float,
    tip_chord: float,
    thickness: float,
    sweep: float,
    span: float,
    z_sign: float,
    coll: bpy.types.Collection,
    mat: bpy.types.Material,
    x0: float,
    y0: float,
    z0: float,
) -> bpy.types.Object:
    """Low-aspect continuous canard/fin solid (tapered plate), not stacked boxes."""
    bm = bmesh.new()
    # Local runtime space: root at z0, tip at z0+z_sign*span; chord along X, thickness Y
    half_t = thickness * 0.5
    # root LE/TE
    r_le = x0 + length * 0.15
    r_te = r_le - root_chord
    t_le = r_le - sweep
    t_te = t_le - tip_chord
    zs = z0
    zt = z0 + z_sign * span
    # 8 verts: root/tip × LE/TE × top/bottom
    pts = [
        (r_le, y0 + half_t, zs), (r_te, y0 + half_t, zs),
        (r_te, y0 - half_t, zs), (r_le, y0 - half_t, zs),
        (t_le, y0 + half_t * 0.55, zt), (t_te, y0 + half_t * 0.55, zt),
        (t_te, y0 - half_t * 0.55, zt), (t_le, y0 - half_t * 0.55, zt),
    ]
    vs = [bm.verts.new(F.L(*p)) for p in pts]
    bm.verts.ensure_lookup_table()
    faces = [
        (0, 1, 2, 3),  # root
        (4, 7, 6, 5),  # tip
        (0, 4, 5, 1),  # top
        (3, 2, 6, 7),  # bottom
        (0, 3, 7, 4),  # LE
        (1, 5, 6, 2),  # TE
    ]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Mild crease support: subdivide long edges once for bevel quality
    obj = _bmesh_to_object(name, bm, coll, mat)
    return obj


def boolean_union(target: bpy.types.Object, others: list[bpy.types.Object]) -> bpy.types.Object:
    F.ensure_object_mode()
    for other in others:
        if other is None or other == target:
            continue
        F.deselect_all()
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        mod = target.modifiers.new("BOOL_UNION", "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = other
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as exc:
            F.log(f"WARN union {target.name}+{other.name}: {exc}")
            if mod.name in target.modifiers:
                target.modifiers.remove(mod)
            continue
        # remove donor mesh object
        mesh = other.data
        bpy.data.objects.remove(other, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    return target


def boolean_diff(target: bpy.types.Object, cutter: bpy.types.Object) -> None:
    F.boolean_cut(target, cutter, op="DIFFERENCE")


def bevel_weighted(obj: bpy.types.Object, width: float, segments: int = 2,
                   angle: float = 30.0) -> None:
    """Angle-limited bevel — manufacturing-specific, not one global clay radius."""
    F.ensure_object_mode()
    F.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("HS_Bevel", "BEVEL")
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.width = width
    mod.segments = segments
    mod.profile = 0.55
    mod.miter_outer = "MITER_ARC"
    try:
        mod.affect = "EDGES"
    except Exception:
        pass
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        F.log(f"WARN bevel {obj.name}: {exc}")
    # Weighted normals for hard-surface stability
    try:
        wn = obj.modifiers.new("HS_WN", "WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        pass
    obj.select_set(False)


def mark_sharp_by_angle(obj: bpy.types.Object, angle_deg: float = 35.0) -> None:
    F.ensure_object_mode()
    F.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(angle_deg))
    bpy.ops.mesh.mark_sharp()
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def unwrap_deliberate(obj: bpy.types.Object, strategy: str = "smart_reviewed") -> None:
    """Deliberate UV: seam from sharp edges, unwrap, pack with padding. Not Smart Project alone."""
    if obj.type != "MESH":
        return
    F.ensure_object_mode()
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    F.deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Clear old seams then mark from sharp / angle
    bpy.ops.mesh.mark_seam(clear=True)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(40.0))
    bpy.ops.mesh.mark_seam(clear=False)
    bpy.ops.mesh.select_all(action="SELECT")
    if strategy == "cylinder":
        try:
            bpy.ops.uv.cylinder_project(direction="VIEW_ON_EQUATOR", correct_aspect=True)
        except Exception:
            bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
    else:
        try:
            bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.018)
        except Exception:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    try:
        bpy.ops.uv.average_islands_scale()
    except Exception:
        pass
    try:
        bpy.ops.uv.pack_islands(margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)


def make_detail_panel_cutter(
    size: tuple[float, float, float],
    loc_rt: tuple[float, float, float],
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=Vector(F.L(*loc_rt)))
    cut = bpy.context.active_object
    cut.name = "TMP_PanelCut"
    cut.scale = F._cube_scale_for_edge(size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return cut


# ---------------------------------------------------------------------------
# Bake: high detail → game maps (mesh-derived)
# ---------------------------------------------------------------------------

def bake_maps_selected_to_active(
    low: bpy.types.Object,
    high_objects: list[bpy.types.Object],
    out_dir: Path,
    prefix: str,
    size: int = TEX_SIZE,
) -> dict[str, Path]:
    """Bake tangent normal + AO from high to low. Returns map paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.bake_type = "NORMAL"
    # Ensure low has UV
    unwrap_deliberate(low)
    # Images
    paths: dict[str, Path] = {}
    results: dict[str, bpy.types.Image] = {}

    def _img(name: str, is_data: bool) -> bpy.types.Image:
        if name in bpy.data.images:
            try:
                bpy.data.images.remove(bpy.data.images[name])
            except Exception:
                pass
        img = bpy.data.images.new(name, width=size, height=size, alpha=True)
        img.colorspace_settings.name = "Non-Color" if is_data else "sRGB"
        return img

    # Material with image texture for bake target
    mat = low.data.materials[0] if low.data.materials else None
    if mat is None:
        mat = bpy.data.materials.new("BakeTarget")
        low.data.materials.append(mat)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    def bake_pass(pass_name: str, bake_type: str, non_color: bool) -> Path | None:
        img = _img(f"{prefix}_{pass_name}", non_color)
        # Ensure Image Texture node active
        tex = None
        for n in nodes:
            if n.type == "TEX_IMAGE":
                tex = n
                break
        if tex is None:
            tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        nodes.active = tex
        tex.select = True
        F.ensure_object_mode()
        F.deselect_all()
        for h in high_objects:
            if h and h.name in bpy.data.objects:
                h.select_set(True)
                h.hide_render = False
                h.hide_set(False)
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        scene.cycles.bake_type = bake_type
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.cage_extrusion = 0.08
        scene.render.bake.use_cage = False
        scene.render.bake.margin = 8
        if bake_type == "NORMAL":
            scene.render.bake.normal_space = "TANGENT"
            try:
                scene.render.bake.normal_r = "POS_X"
                scene.render.bake.normal_g = "POS_Y"
                scene.render.bake.normal_b = "POS_Z"
            except Exception:
                pass
        try:
            bpy.ops.object.bake(type=bake_type, use_clear=True, margin=8)
        except Exception as exc:
            F.log(f"WARN bake {pass_name}: {exc}")
            return None
        path = out_dir / f"{prefix}_{pass_name}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        paths[pass_name] = path
        results[pass_name] = img
        F.log(f"Baked {pass_name} → {path}")
        return path

    bake_pass("normal", "NORMAL", True)
    bake_pass("ao", "AO", True)
    return paths


def pack_orm(ao_img: bpy.types.Image | None, rough: float, metal: float,
             name: str, size: int = TEX_SIZE) -> bpy.types.Image:
    """Pack R=AO G=rough B=metal with micro variation."""
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    ao_px = None
    if ao_img is not None:
        try:
            ao_img.pixels  # force load
            ao_px = list(ao_img.pixels)
        except Exception:
            ao_px = None
    px: list[float] = []
    for y in range(size):
        for x in range(size):
            if ao_px and len(ao_px) >= size * size * 4:
                i = (y * size + x) * 4
                ao = ao_px[i]
            else:
                ao = 0.92
            # micro roughness variation (scale-correct, not cloudy paint)
            n = F._hash01(x, y, 7)
            g = max(0.04, min(0.96, rough + (n - 0.5) * 0.04))
            px.extend([ao, g, metal, 1.0])
    img.pixels = px
    img.pack()
    return img


# ---------------------------------------------------------------------------
# Production Lark form
# ---------------------------------------------------------------------------

def build_lark_parts_production(
    coll: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Continuous courier dart — fuselage loft, rooted canards/engines, service logic."""
    parts: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    cyan = mats["Material_Cyan"]
    glass = mats["Material_Glass"]
    warm = mats["Material_Warm"]

    # ---- Primary continuous fuselage (stations aft → nose) ----
    # Radii chosen so overall AABB ~18×3.3×7 matches family layout sockets.
    stations = [
        (-7.4, 0.55, 0.55),   # nozzle fairing start
        (-6.6, 0.95, 0.95),   # aft power max
        (-5.2, 1.05, 1.10),
        (-3.4, 0.98, 0.98),   # module frame region
        (-1.2, 0.88, 0.88),   # mid cargo slightly slimmer
        (1.0, 0.92, 0.95),
        (2.8, 0.98, 1.00),    # cabin
        (4.4, 0.95, 0.95),
        (5.6, 0.78, 0.80),    # nose collar
        (6.8, 0.48, 0.48),
        (8.0, 0.22, 0.22),
        (9.0, 0.06, 0.06),    # tip
    ]
    fuselage = make_fuselage_loft("Hull_Fuselage", stations, segs=40, coll=coll, mat=hull)
    # Panel / access recesses (boolean) — real negative space, not floating bars
    for i, (sx, sy, sz, lx, ly, lz) in enumerate((
        (1.8, 0.22, 1.1, -1.0, 0.85, 0.0),   # dorsal cargo access
        (1.4, 0.18, 0.9, 2.6, 0.9, 0.0),     # canopy bed recess
        (1.2, 0.7, 0.18, -2.0, 0.1, 0.95),   # stbd service
        (1.2, 0.7, 0.18, -2.0, 0.1, -0.95),  # port service
        (1.6, 0.35, 0.9, -5.0, 0.55, 0.0),   # aft service hatch
    )):
        cut = make_detail_panel_cutter((sx, sy, sz), (lx, ly, lz))
        boolean_diff(fuselage, cut)
    bevel_weighted(fuselage, width=0.045, segments=3, angle=28.0)
    mark_sharp_by_angle(fuselage, 32.0)
    fuselage["sf_role"] = "hull_primary"
    parts.append(fuselage)

    # ---- Structural spine / keel as shallow integrated rails (meso, not whole-hull blackout) ----
    spine = F.make_box("Hull_Spine_Core", (10.5, 0.18, 0.32), (-0.4, 0.78, 0.0), mech, coll, detail=1)
    bevel_weighted(spine, 0.015, 2, 40.0)
    parts.append(spine)
    keel = F.make_box("Hull_Keel_Core", (9.5, 0.18, 0.30), (0.2, -0.78, 0.0), mech, coll, detail=1)
    bevel_weighted(keel, 0.015, 2, 40.0)
    parts.append(keel)

    # ---- Canopy: framed glass bubble faired into cabin (softer glass edge family) ----
    canopy_frame = F.make_box("Canopy_Frame", (2.2, 0.18, 0.95), (2.85, 0.88, 0.0), mech, coll, detail=1)
    bevel_weighted(canopy_frame, 0.016, 2, 35.0)
    parts.append(canopy_frame)
    # Low cylinder segment as canopy bubble (less box-like)
    canopy = F.make_cylinder(
        "Canopy_Glass", 0.55, 1.9, (2.85, 1.05, 0.0), glass, coll,
        vertices=24, detail=1,
        rotation=(0.0, math.radians(90.0), 0.0),
    )
    # Flatten slightly for silhouette
    canopy.scale = (1.0, 0.55, 0.85)
    bpy.context.view_layer.objects.active = canopy
    canopy.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    canopy.select_set(False)
    bevel_weighted(canopy, 0.04, 3, 48.0)
    parts.append(canopy)

    # ---- Nose sensor ring + cyan tip (identity, not the whole primary mass) ----
    tip = F.make_cone("Nose_Probe", 0.14, 0.03, 0.9, (9.15, 0.0, 0.0), cyan, coll, vertices=20)
    parts.append(tip)
    sensor_ring = F.make_cylinder("Sensor_Ring", 0.32, 0.1, (6.55, 0.55, 0.0), mech, coll, vertices=20, detail=1)
    parts.append(sensor_ring)
    sensor_glass = F.make_box("Sensor_Window", (0.22, 0.35, 0.5), (6.7, 0.55, 0.0), glass, coll, detail=1)
    bevel_weighted(sensor_glass, 0.02, 2, 45.0)
    parts.append(sensor_glass)

    # ---- Continuous canards (shouldered into mid-body) ----
    for side, zsign in (("P", -1.0), ("S", 1.0)):
        bracket = F.make_box(
            f"Canard_RootFairing_{side}", (1.6, 0.55, 0.85),
            (0.9, 0.0, zsign * 1.05), hull, coll, detail=1,
        )
        bevel_weighted(bracket, 0.04, 3, 30.0)
        parts.append(bracket)
        canard = make_wing_plate(
            f"Canard_{side}",
            length=1.0, root_chord=3.0, tip_chord=1.4, thickness=0.18,
            sweep=0.85, span=2.15, z_sign=zsign,
            coll=coll, mat=hull, x0=0.4, y0=0.0, z0=zsign * 1.45,
        )
        bevel_weighted(canard, 0.03, 3, 28.0)
        mark_sharp_by_angle(canard, 30.0)
        parts.append(canard)
        # RCS thruster block seated on canard mid-span (socket still at family RCS coords)
        rcs = F.make_box(
            f"RCS_{side}", (0.55, 0.22, 0.48),
            (1.1, 0.0, zsign * 2.55), mech, coll, detail=1,
        )
        bevel_weighted(rcs, 0.012, 2, 40.0)
        parts.append(rcs)
        rcs_nozzle = F.make_cylinder(
            f"RCS_Nozzle_{side}", 0.08, 0.2,
            (1.1, 0.0, zsign * 2.85), mech, coll, vertices=12, detail=1,
        )
        parts.append(rcs_nozzle)

    # ---- Twin engines rooted into aft (housings penetrate fuselage volume) ----
    for side, zsign in (("P", -1.0), ("S", 1.0)):
        mount = F.make_box(
            f"Engine_Mount_{side}", (2.6, 1.15, 1.05),
            (-6.0, 0.0, zsign * 0.65), hull, coll, component="engine",
        )
        bevel_weighted(mount, 0.05, 3, 28.0)
        parts.append(mount)
        house = F.make_cylinder(
            f"Engine_Housing_{side}", 0.52, 2.5,
            (-7.1, 0.0, zsign * 0.65), mech, coll, vertices=32, component="engine",
        )
        bevel_weighted(house, 0.03, 3, 35.0)
        parts.append(house)
        collar = F.make_cylinder(
            f"Engine_Collar_{side}", 0.58, 0.22,
            (-5.95, 0.0, zsign * 0.65), hull, coll, vertices=24, component="engine", detail=1,
        )
        bevel_weighted(collar, 0.015, 2, 40.0)
        parts.append(collar)
        # Radiator bank (cooling language) as machined block with edge family
        rad = F.make_box(
            f"Radiator_{side}", (2.0, 0.7, 0.28),
            (-5.3, 0.55, zsign * 1.2), mech, coll, detail=1,
        )
        bevel_weighted(rad, 0.012, 2, 25.0)
        parts.append(rad)
        core = F.make_cylinder(
            f"Engine_Core_{side}", 0.26, 0.5,
            (-8.15, 0.0, zsign * 0.65), cyan, coll, vertices=20,
            component="engine", keep_separate=True,
        )
        parts.append(core)
        fan = F.make_cylinder(
            f"Engine_Fan_{side}", 0.36, 0.12,
            (-7.7, 0.0, zsign * 0.65), mech, coll, vertices=22,
            component="engine", keep_separate=True,
        )
        parts.append(fan)
        intake = F.make_box(
            f"Intake_{side}", (1.6, 0.42, 0.55),
            (-2.2, -0.05, zsign * 0.95), mech, coll, detail=1,
        )
        bevel_weighted(intake, 0.025, 2, 35.0)
        parts.append(intake)

    # ---- Cargo blister (ventral payload logic) ----
    blister = F.make_box("Cargo_Blister", (2.6, 0.48, 1.05), (0.5, -0.95, 0.0), hull, coll, detail=1)
    bevel_weighted(blister, 0.04, 3, 32.0)
    parts.append(blister)

    # ---- Forward gun (keep-separate hook) ----
    gun_base = F.make_box("Gun_Base", (1.0, 0.36, 0.42), (5.7, -0.05, 0.0), mech, coll)
    bevel_weighted(gun_base, 0.02, 2, 40.0)
    parts.append(gun_base)
    gun = F.make_cylinder(
        "Gun_Assembly", 0.1, 1.85, (6.85, 0.0, 0.0), mech, coll,
        vertices=16, component="weapon", keep_separate=True,
    )
    parts.append(gun)

    # ---- Service / identity / markings (meso, not micro camouflage) ----
    avionics = F.make_box("Courier_Avionics", (3.6, 0.22, 0.42), (-0.6, 0.92, 0.0), mech, coll, detail=1)
    bevel_weighted(avionics, 0.015, 2, 40.0)
    parts.append(avionics)
    parts.extend(F.add_identity_rails(coll, mats, length=7.5, y=0.35, x0=-3.2))
    for i, (sx, sy, sz, lx, ly, lz) in enumerate((
        (0.5, 0.07, 0.16, 2.0, 0.85, 0.48),
        (0.4, 0.07, 0.12, -2.8, 0.7, -0.48),
    )):
        bed = F.make_box(f"Serial_Bed_{i}", (sx + 0.1, 0.1, sz + 0.08), (lx, ly - 0.02, lz), mech, coll, detail=1)
        plate = F.make_box(f"Serial_Plate_{i}", (sx, sy, sz), (lx, ly + 0.03, lz), warm, coll, detail=1)
        parts.extend([bed, plate])
    marker = F.make_box(
        "Status_Marker_00", (0.24, 0.12, 0.12), (-4.4, 0.55, 0.55), warm, coll,
        detail=1, close_only=True,
    )
    parts.append(marker)
    # Close-only fasteners / micro (dropped at LOD1+)
    for i, x in enumerate((-3.5, -1.0, 1.5, 3.0)):
        bolt = F.make_cylinder(
            f"Fastener_{i}", 0.04, 0.06, (x, 0.88, 0.35), mech, coll,
            vertices=8, detail=2,
        )
        bolt["sf_close_only"] = True
        parts.append(bolt)

    # Tag remaster
    for p in parts:
        if p and p.type == "MESH":
            p["sf_remaster"] = REMASTER_TAG
            p["sf_production"] = "lark_v1"
    F.log(f"Lark production parts: {len(parts)} meshes, tris={sum(F.tri_count_object(p) for p in parts if p.type=='MESH')}")
    return parts


def author_lod_collection_lark(
    source_objects: list[bpy.types.Object],
    lod_name: str,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, list[bpy.types.Object], dict[str, Any]]:
    """Authored LODs by projected-size intent — not fixed-ratio decimation alone.

    LOD0: full production set
    LOD1: drop close-only micro; mild collapse only on secondary detail
    LOD2: silhouette anchors only (hull primary, engines, canopy, canards); aggressive simplify
    """
    drop_close = lod_name in ("lod1", "lod2")
    # Intentional ratios after authored filtering
    if lod_name == "lod0":
        ratio = 1.0
    elif lod_name == "lod1":
        ratio = 0.55  # after drop close-only — preserves silhouette better than 0.42 alone
    else:
        ratio = 0.28

    # Filter for LOD2: keep role anchors only
    filtered: list[bpy.types.Object] = []
    for obj in source_objects:
        if obj.type != "MESH":
            continue
        if drop_close and F.is_close_only(obj):
            continue
        n = obj.name.lower()
        if lod_name == "lod2":
            keep_tokens = (
                "fuselage", "hull_", "engine_", "canard", "canopy", "nose_",
                "cargo_blister", "gun_", "rcs_", "radiator", "mount",
            )
            if not any(t in n for t in keep_tokens):
                # still keep keep_separate hooks
                if not F.classify_keep_separate(obj):
                    continue
        filtered.append(obj)

    return F.build_lod_collection(filtered, lod_name, ratio, False, materials)


def wire_baked_normal_if_present(obj: bpy.types.Object, normal_path: Path | None) -> None:
    """Attach baked tangent normal WITHOUT replacing baseColor (iter1 bug: AO stole albedo)."""
    if not normal_path or not normal_path.exists() or obj.type != "MESH":
        return
    if not obj.data.materials:
        return
    mat = obj.data.materials[0]
    if mat is None or not mat.use_nodes:
        return
    img = bpy.data.images.load(str(normal_path), check_existing=True)
    img.colorspace_settings.name = "Non-Color"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return
    # Do not create a new TEX_IMAGE that becomes the active bake target for baseColor export.
    # Find existing normal chain or leave canonical material maps alone if bake is flat.
    try:
        from statistics import mean
        # Skip wiring near-flat bakes (failed cage)
        pixels = list(img.pixels)
        if pixels:
            # sample every 64th pixel R channel variance proxy
            sample = pixels[0::64 * 4]
            if sample and abs(mean(sample) - 0.5) < 0.02:
                # likely flat normal (R~0.5); check std roughly
                var = sum((v - 0.5) ** 2 for v in sample) / max(1, len(sample))
                if var < 0.0004:
                    F.log("Skip wiring flat baked normal (failed bake)")
                    return
    except Exception:
        pass
    # Only connect to Normal socket; never touch Base Color links
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.label = "BakedNormalOnly"
    tex.location = (-600, -200)
    nrm = nodes.new("ShaderNodeNormalMap")
    nrm.location = (-300, -200)
    links.new(tex.outputs["Color"], nrm.inputs["Color"])
    links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])


def _restore_canonical_material_slots(parts: list[bpy.types.Object], mats: dict[str, bpy.types.Material]) -> None:
    """Ensure every authoring mesh still points at the named family material (not bake temps)."""
    for p in parts:
        if p.type != "MESH":
            continue
        if not p.data.materials:
            p.data.materials.append(mats["Material_Hull"])
            continue
        # Prefer first slot name match
        cur = p.data.materials[0]
        name = (cur.name if cur else "").split(".")[0]
        if name in mats:
            p.data.materials[0] = mats[name]
        elif "glass" in p.name.lower():
            p.data.materials[0] = mats["Material_Glass"]
        elif any(t in p.name.lower() for t in ("engine_core", "nose_probe", "identity", "cyan")):
            p.data.materials[0] = mats["Material_Cyan"]
        elif any(t in p.name.lower() for t in ("serial_plate", "status_marker", "warm")):
            p.data.materials[0] = mats["Material_Warm"]
        elif any(t in p.name.lower() for t in ("engine", "spine", "keel", "radiator", "gun", "rcs", "intake", "avionics", "mechanical", "sensor", "hook", "fan", "mount")):
            p.data.materials[0] = mats["Material_Mechanical"]
        else:
            p.data.materials[0] = mats["Material_Hull"]


def build_one_ship_remaster(ship_key: str = "lark") -> dict[str, Any]:
    assert ship_key == "lark"
    spec = F.SHIP_SPECS[ship_key]
    F.log(f"=== REMASTER {spec['title']} ({REMASTER_TAG}) ===")
    F.reset_scene()
    mats = F.create_canonical_materials()
    authoring = F.new_collection("AUTHORING")
    parts = build_lark_parts_production(authoring, mats)

    # Deliberate UVs on authoring before LOD (game meshes re-unwrap after merge too)
    for p in parts:
        if p.type == "MESH":
            mark_sharp_by_angle(p, 35.0)
            unwrap_deliberate(p, "angle")

    # Diagnostic bakes only: bake to dedicated non-exported material slot images, never overwrite albedo.
    # Selected-to-active on the same mesh family is unreliable; keep maps as evidence artifacts.
    bake_dir = F.FAMILY_ROOT / "evidence" / "lark" / "bakes"
    bake_paths: dict[str, Path] = {}
    try:
        low_for_bake = next((p for p in parts if "Fuselage" in p.name), None)
        high_for_bake = [
            p for p in parts
            if p.type == "MESH" and any(
                t in p.name.lower()
                for t in ("canard", "engine_housing", "engine_mount", "canopy_frame", "radiator")
            )
        ]
        if low_for_bake and high_for_bake:
            # Duplicate low to isolated bake target so Material_Hull nodes stay clean
            F.ensure_object_mode()
            F.deselect_all()
            low_for_bake.select_set(True)
            bpy.context.view_layer.objects.active = low_for_bake
            bpy.ops.object.duplicate()
            bake_tgt = bpy.context.active_object
            bake_tgt.name = "BAKE_TARGET_Fuselage"
            bake_mat = bpy.data.materials.new("BakeIsolated")
            bake_mat.use_nodes = True
            bake_tgt.data.materials.clear()
            bake_tgt.data.materials.append(bake_mat)
            bake_paths = bake_maps_selected_to_active(bake_tgt, high_for_bake, bake_dir, "lark_hull")
            # Remove isolated bake target from export set
            bpy.data.objects.remove(bake_tgt, do_unlink=True)
        # Never wire failed/flat bakes into exported materials; keep canonical PBR stacks.
        F.log(f"Bake evidence paths: {bake_paths} (not wired over albedo)")
    except Exception as exc:
        F.log(f"WARN bake stage failed (continuing with material maps): {exc}")

    _restore_canonical_material_slots(parts, mats)

    all_lod_meshes: list[bpy.types.Object] = []
    lod_stats: list[dict] = []
    for lod_name in ("lod0", "lod1", "lod2"):
        _coll, meshes, stats = author_lod_collection_lark(parts, lod_name, mats)
        # Extra deliberate unwrap after merge
        for m in meshes:
            unwrap_deliberate(m, "angle")
            F.ensure_normals(m)
            F.triangulate_object(m)
            F.ensure_mikktspace_tangents(m)
        all_lod_meshes.extend(meshes)
        lod_stats.append(stats)
        F.log(f"  {lod_name}: {stats['triangles']} tris, {stats['mesh_count']} draws")

    export_coll = F.new_collection("EXPORT")
    root = F.create_root_and_sockets(export_coll, spec)
    # Stamp remaster on root metadata
    try:
        meta = dict(root.get("spacefaceAsset") or {})
        meta["remaster"] = REMASTER_TAG
        meta["productionState"] = "integration_candidate_pending"
        root["spacefaceAsset"] = meta
    except Exception:
        pass

    for o in all_lod_meshes:
        F.set_parent_keep_world(o, root)
        if o.name not in [x.name for x in export_coll.objects]:
            try:
                export_coll.objects.link(o)
            except Exception:
                pass
    collision = F.create_collision_hull(export_coll, root, all_lod_meshes)

    blend_path = F.FAMILY_ROOT / "blender" / f"{spec['id']}_production.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    F.log(f"Saved blend → {blend_path}")

    source_glb = F.FAMILY_ROOT / "source" / "wholeships" / f"{spec['id']}.glb"
    export_objects = [root] + all_lod_meshes
    for o in bpy.data.objects:
        if o.name.startswith("SOCKET_"):
            export_objects.append(o)
    if collision is not None:
        export_objects.append(collision)
    F.export_glb(source_glb, export_objects)
    F.stamp_material_basecolor_factors(source_glb)
    report = F.stamp_glb_metadata(source_glb, spec, lod_stats)
    F.stamp_material_basecolor_factors(source_glb)
    report["sha256"] = F.sha256_file(source_glb)
    cov = F.collision_coverage_ratios(report)
    report["collisionCoverage"] = cov
    report["remaster"] = REMASTER_TAG
    report["bakePaths"] = {k: str(v) for k, v in bake_paths.items()}

    rc_glb = F.FAMILY_ROOT / "release_candidates" / "wholeships" / f"{spec['id']}.glb"
    rc_glb.parent.mkdir(parents=True, exist_ok=True)
    rc_glb.write_bytes(source_glb.read_bytes())

    evidence_dir = F.FAMILY_ROOT / "evidence" / ship_key
    renders = F.render_evidence(
        ship_key, root,
        [m for m in all_lod_meshes if m.name.startswith("LOD0")],
        evidence_dir,
    )
    lod_renders = F.render_lod_continuity(ship_key, all_lod_meshes, evidence_dir)
    renders = list(renders) + list(lod_renders)

    # Clay / form diagnostic renders (no bloom; neutral)
    clay_paths = []
    try:
        F.set_material_diagnostic_mode("clay")
        clay_dir = evidence_dir / "renders"
        # reuse forward camera if present
        for cam_name, fname in (("CAM_forward_34", "clay_forward_34.png"), ("CAM_rear_34", "clay_rear_34.png")):
            cam = bpy.data.objects.get(cam_name)
            if cam is None:
                continue
            bpy.context.scene.camera = cam
            out = clay_dir / fname
            bpy.context.scene.render.filepath = str(out)
            bpy.ops.render.render(write_still=True)
            clay_paths.append(str(out))
        F.set_material_diagnostic_mode("lit")
    except Exception as exc:
        F.log(f"WARN clay render: {exc}")

    metrics = {
        "schema": "spaceface.m4HeliosCivilianShipMetrics.v1",
        "packet": F.PACKET,
        "remaster": REMASTER_TAG,
        "shipKey": ship_key,
        "spec": {
            "id": spec["id"],
            "assetId": spec["assetId"],
            "partId": spec["partId"],
            "role": spec["role"],
            "title": spec["title"],
        },
        "sourceGlb": str(source_glb.relative_to(F.ROOT)).replace("\\", "/"),
        "releaseCandidateGlb": str(rc_glb.relative_to(F.ROOT)).replace("\\", "/"),
        "blend": str(blend_path.relative_to(F.ROOT)).replace("\\", "/"),
        "sha256_source": F.sha256_file(source_glb),
        "report": report,
        "renders": renders,
        "clayRenders": clay_paths,
        "bakePaths": {k: str(v) for k, v in bake_paths.items()},
        "collisionCoverage": cov,
        "builtAt": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
    }
    (evidence_dir / "production_metrics.json").write_text(
        __import__("json").dumps(metrics, indent=2), encoding="utf-8"
    )

    summary = {
        "gateOk": report["hullTriangles"] >= 800 and report["totalTriangles"] > 0,
        "gateErrors": [],
        "remaster": REMASTER_TAG,
        "totalTriangles": report["totalTriangles"],
        "hullTriangles": report["hullTriangles"],
        "lodTriangles": {k: v["triangles"] for k, v in report["lodBreakdown"].items()},
        "drawEstimates": {k: v["drawEstimate"] for k, v in report["lodBreakdown"].items()},
        "sockets": report["sockets"],
        "materials": report["materials"],
        "tangentPrimitiveCount": report["tangentPrimitiveCount"],
        "uvPrimitiveCount": report["uvPrimitiveCount"],
        "lod0AabbSize": report.get("lod0AabbSize"),
        "collisionBounds": report.get("collisionBounds"),
        "collisionCoverage": cov,
        "sourceSha256": metrics["sha256_source"],
        "outGlb": str(source_glb),
        "outBlend": str(blend_path),
        "bakePaths": {k: str(v) for k, v in bake_paths.items()},
    }
    if report["hullTriangles"] < 800:
        summary["gateErrors"].append(f'hullTriangles {report["hullTriangles"]} < 800')
        summary["gateOk"] = False
    if len(report["sockets"]) < 9:
        summary["gateErrors"].append(f'sockets {len(report["sockets"])} < 9')
        summary["gateOk"] = False
    if not cov.get("pass"):
        summary["gateErrors"].append(f'collision coverage fail {cov}')
        summary["gateOk"] = False
    size = report.get("lod0AabbSize") or [0, 0, 0]
    if not (size[0] > size[1] and size[0] > size[2]):
        summary["gateErrors"].append(f"LOD0 AABB length not dominant on X: {size}")
        summary["gateOk"] = False
    (evidence_dir / "build_summary.json").write_text(
        __import__("json").dumps(summary, indent=2), encoding="utf-8"
    )
    F.log(
        f"Remaster gate ok={summary['gateOk']} tris={summary['totalTriangles']} "
        f"hull={summary['hullTriangles']} sha={summary['sourceSha256'][:12]}"
    )
    return metrics


def main() -> int:
    metrics = build_one_ship_remaster("lark")
    print("REMASTER_DONE", metrics.get("sha256_source"), metrics.get("report", {}).get("totalTriangles"))
    return 0 if metrics else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print("REMASTER_FAILED", exc)
        raise SystemExit(2)
