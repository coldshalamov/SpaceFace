#!/usr/bin/env python3
"""Helios Lark iter11 — hard-surface continuous form WITHOUT voxel remesh.

Addresses G7 P1s:
- G2: continuous loft hull + cylindrical nacelles + bubble canopy; angle-limited bevel families
- G3: deliberate UVs + packed maps that actually modulate
- G4: role materials diverge by roughness/metallic/response (not tint alone)
- G5: authored LODs
No voxel remesh. No greeble camouflage.
"""
from __future__ import annotations

import importlib.util
import math
import struct
import json
import time
from pathlib import Path
from typing import Any

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(r"C:\Users\93rob\AppData\Local\Temp\grok-goal-5d58d165aa45\implementer")
FAMILY = ROOT / "assets/ships/m4_helios_civilian"
PACKET = "GFX-LARK-REMASTER-001"
TEX = 1024


def load_family():
    spec = importlib.util.spec_from_file_location(
        "family", ROOT / "tools/blender/build_m4_helios_civilian_family.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


F = None  # set in main


def log(msg: str) -> None:
    print(f"[lark-iter11] {msg}", flush=True)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def deselect() -> None:
    bpy.ops.object.select_all(action="DESELECT")


def activate(obj: bpy.types.Object) -> None:
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    deselect()
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def link(obj: bpy.types.Object, coll: bpy.types.Collection) -> bpy.types.Object:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def bevel_angle(obj: bpy.types.Object, width: float, segments: int = 2, angle: float = 30.0) -> None:
    activate(obj)
    mod = obj.modifiers.new("HS_Bevel", "BEVEL")
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.width = width
    mod.segments = segments
    mod.profile = 0.55
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        log(f"bevel warn {obj.name}: {e}")
    try:
        wn = obj.modifiers.new("HS_WN", "WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA_WITH_ANGLE"
        wn.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        pass


def mark_sharp(obj: bpy.types.Object, angle_deg: float = 32.0) -> None:
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(angle_deg))
    bpy.ops.mesh.mark_sharp()
    bpy.ops.object.mode_set(mode="OBJECT")


def unwrap_hard(obj: bpy.types.Object) -> None:
    """Seams from sharp edges + angle unwrap + pack. Not Smart Project alone."""
    activate(obj)
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.mark_seam(clear=True)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(35.0))
    bpy.ops.mesh.mark_seam(clear=False)
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.018)
    except Exception:
        try:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        except Exception as e:
            log(f"uv fail {obj.name}: {e}")
    try:
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(margin=0.018)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def make_fuselage_loft(coll: bpy.types.Collection, mat: bpy.types.Material) -> bpy.types.Object:
    """Continuous oval fuselage along runtime +X. stations: (x_rt, ry, rz)."""
    stations = [
        (-7.2, 0.52, 0.52),
        (-6.4, 0.92, 0.92),
        (-5.0, 1.02, 1.05),
        (-3.2, 0.96, 0.96),
        (-1.0, 0.88, 0.88),
        (1.2, 0.92, 0.94),
        (3.0, 0.98, 0.98),
        (4.6, 0.92, 0.92),
        (5.8, 0.72, 0.74),
        (7.0, 0.42, 0.42),
        (8.2, 0.18, 0.18),
        (9.1, 0.05, 0.05),
    ]
    segs = 40
    bm = bmesh.new()
    rings: list[list] = []
    for x_rt, ry, rz in stations:
        ring = []
        for i in range(segs):
            a = (i / segs) * math.tau
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
    try:
        bm.faces.new(list(reversed(rings[0])))
    except ValueError:
        pass
    try:
        bm.faces.new(rings[-1])
    except ValueError:
        pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Hull_Fuselage")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new("Hull_Fuselage", mesh)
    link(obj, coll)
    obj.data.materials.append(mat)
    # Panel recesses via boolean (real negative space)
    for size, loc in (
        ((1.6, 0.18, 0.9), (-1.0, 0.85, 0.0)),
        ((1.3, 0.16, 0.75), (2.4, 0.88, 0.0)),
        ((1.1, 0.55, 0.14), (-2.0, 0.1, 0.92)),
        ((1.1, 0.55, 0.14), (-2.0, 0.1, -0.92)),
    ):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=Vector(F.L(*loc)))
        cut = bpy.context.view_layer.objects.active
        cut.scale = F._cube_scale_for_edge(size)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        activate(obj)
        mod = obj.modifiers.new("CUT", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cut
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            if mod.name in obj.modifiers:
                obj.modifiers.remove(mod)
        mesh = cut.data
        bpy.data.objects.remove(cut, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    # Cast hull edge family (larger)
    bevel_angle(obj, width=0.045, segments=3, angle=28.0)
    mark_sharp(obj, 30.0)
    unwrap_hard(obj)
    obj["sf_role"] = "hull_primary"
    return obj


def make_wing(coll, mat, z_sign: float) -> bpy.types.Object:
    bm = bmesh.new()
    # continuous tapered plate
    root_le, root_te = 1.6, -1.4
    tip_le, tip_te = 0.7, -0.5
    z0, zt = z_sign * 1.15, z_sign * 3.25
    y = 0.0
    ht, htip = 0.09, 0.05
    pts = [
        (root_le, y + ht, z0),
        (root_te, y + ht, z0),
        (root_te, y - ht, z0),
        (root_le, y - ht, z0),
        (tip_le, y + htip, zt),
        (tip_te, y + htip, zt),
        (tip_te, y - htip, zt),
        (tip_le, y - htip, zt),
    ]
    vs = [bm.verts.new(F.L(*p)) for p in pts]
    bm.verts.ensure_lookup_table()
    for f in (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
    ):
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"Canard_{'P' if z_sign < 0 else 'S'}")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(mesh.name, mesh)
    link(obj, coll)
    obj.data.materials.append(mat)
    # Panel / sheet edge family (smaller than cast hull)
    bevel_angle(obj, width=0.025, segments=2, angle=30.0)
    mark_sharp(obj, 32.0)
    unwrap_hard(obj)
    return obj


def make_nacelle(coll, mats, z_sign: float) -> list[bpy.types.Object]:
    out = []
    side = "P" if z_sign < 0 else "S"
    y = z_sign * 0.72  # blender Y after L for runtime Z
    # housing cylinder along X
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=36,
        radius=0.5,
        depth=2.4,
        location=F.L(-6.8, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    house = bpy.context.view_layer.objects.active
    house.name = f"Engine_Housing_{side}"
    link(house, coll)
    house.data.materials.clear()
    house.data.materials.append(mats["Material_Mechanical"])
    # fairing cone into hull
    bpy.ops.mesh.primitive_cone_add(
        vertices=28,
        radius1=0.52,
        radius2=0.28,
        depth=1.0,
        location=F.L(-5.4, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    fair = bpy.context.view_layer.objects.active
    fair.name = f"Engine_Fairing_{side}"
    link(fair, coll)
    fair.data.materials.clear()
    fair.data.materials.append(mats["Material_Mechanical"])
    activate(house)
    mod = house.modifiers.new("U", "BOOLEAN")
    mod.operation = "UNION"
    mod.solver = "EXACT"
    mod.object = fair
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mesh = fair.data
        bpy.data.objects.remove(fair, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    except Exception as e:
        log(f"nacelle union {side}: {e}")
    # machined edge family
    bevel_angle(house, width=0.02, segments=2, angle=35.0)
    mark_sharp(house, 35.0)
    unwrap_hard(house)
    out.append(house)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20,
        radius=0.24,
        depth=0.42,
        location=F.L(-8.0, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    core = bpy.context.view_layer.objects.active
    core.name = f"Engine_Core_{side}"
    link(core, coll)
    core.data.materials.clear()
    core.data.materials.append(mats["Material_Cyan"])
    core["sf_keep_separate"] = True
    core["sf_component"] = "engine"
    unwrap_hard(core)
    out.append(core)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=22,
        radius=0.34,
        depth=0.12,
        location=F.L(-7.55, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    fan = bpy.context.view_layer.objects.active
    fan.name = f"Engine_Fan_{side}"
    link(fan, coll)
    fan.data.materials.clear()
    fan.data.materials.append(mats["Material_Mechanical"])
    fan["sf_keep_separate"] = True
    fan["sf_component"] = "engine"
    unwrap_hard(fan)
    out.append(fan)
    return out


def make_canopy(coll, mats) -> list[bpy.types.Object]:
    out = []
    # Frame as low-profile ring of mechanical
    frame = F.make_box("Canopy_Frame", (2.1, 0.14, 0.95), (2.7, 0.92, 0.0), mats["Material_Mechanical"], coll, detail=1)
    bevel_angle(frame, 0.012, 2, 40.0)
    unwrap_hard(frame)
    out.append(frame)
    # Glass bubble from sphere cut
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.7, location=F.L(2.7, 1.15, 0.0))
    glass = bpy.context.view_layer.objects.active
    glass.name = "Canopy_Glass"
    glass.scale = (1.35, 0.55, 0.85)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(glass, coll)
    bpy.ops.mesh.primitive_cube_add(size=2.5, location=F.L(2.7, 0.55, 0.0))
    cut = bpy.context.view_layer.objects.active
    activate(glass)
    mod = glass.modifiers.new("CUT", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cut
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        log(f"canopy cut: {e}")
    mesh = cut.data
    bpy.data.objects.remove(cut, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    glass.data.materials.clear()
    glass.data.materials.append(mats["Material_Glass"])
    # glass edge family (softer/larger)
    bevel_angle(glass, width=0.05, segments=3, angle=48.0)
    unwrap_hard(glass)
    out.append(glass)
    return out


def build_materials() -> dict[str, bpy.types.Material]:
    """Role materials that differ by roughness/metallic/normal — not tint alone.
    Uses elongated panel masks so UV reads as panels, not lathe rings.
    """
    # Force recreate via family then rebuild images with strong role divergence
    mats = F.create_canonical_materials()

    def rebuild(name: str, rgba: tuple, rough: float, metal: float, role: str) -> None:
        mat = mats[name]
        mat.use_nodes = True
        nt = mat.node_tree
        nodes = nt.nodes
        links = nt.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        out.location = (400, 0)
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (100, 0)
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        def h01(x, y, s=0):
            v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
            v = (v ^ (v >> 13)) * 1274126177 & 0xFFFFFFFF
            return ((v ^ (v >> 16)) & 255) / 255.0

        if role == "hull":
            pw, ph = 220, 56  # long panels along U
        elif role == "mech":
            pw, ph = 32, 10
        elif role == "cyan":
            pw, ph = 160, 160
        elif role == "glass":
            pw, ph = 256, 256
        else:
            pw, ph = 96, 96

        br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
        base_px, nrm_px, orm_px = [], [], []
        for y in range(TEX):
            for x in range(TEX):
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                soft = max(0.0, 1.0 - min(dx, dy) / 2.5) if min(dx, dy) <= 2 else 0.0
                gf = h01(x, y, 11)
                # synthetic cavity from multi-scale noise (readable, not raw flat)
                cav = max(0.0, 0.55 - abs(math.sin(x * 0.04) * math.cos(y * 0.07)) * 0.4)
                dirt = soft * 0.18 + seam * 0.1 + cav * 0.22
                heat = 0.0
                if role == "mech":
                    u = x / TEX
                    heat = max(0.0, 0.45 - u) * max(0.0, 0.4 - abs(y / TEX - 0.5))
                if role == "hull":
                    r = max(0, min(1, br - dirt * 0.14))
                    g = max(0, min(1, bg - dirt * 0.16))
                    b = max(0, min(1, bb - dirt * 0.18))
                elif role == "mech":
                    r = max(0, min(1, br * (0.9 + gf * 0.12) + heat * 0.35))
                    g = max(0, min(1, bg * (0.92 + gf * 0.08) + heat * 0.1))
                    b = max(0, min(1, bb * (0.95 + (1 - gf) * 0.06)))
                elif role == "cyan":
                    r, g, b = br, bg, bb
                elif role == "glass":
                    r, g, b = br * 0.4, bg * 0.5, bb * 0.55
                else:
                    r = max(0, min(1, br - dirt * 0.1))
                    g = max(0, min(1, bg - dirt * 0.12))
                    b = max(0, min(1, bb - dirt * 0.12))
                base_px.extend([r, g, b, 1.0 if role != "glass" else 0.5])

                if role == "mech":
                    brush = 0.5 + 0.5 * math.sin(x * 0.95)
                    nx = 0.5 + (brush - 0.5) * 0.32 + seam * 0.08
                    ny = 0.5 + (gf - 0.5) * 0.06
                elif role == "hull":
                    nx = 0.5 + (gf - 0.5) * 0.025 + (0.2 if seam and dx <= 1 else 0)
                    ny = 0.5 + (gf - 0.5) * 0.02 + (0.2 if seam and dy <= 1 else 0)
                else:
                    nx = 0.5 + (gf - 0.5) * 0.01
                    ny = 0.5 + (gf - 0.5) * 0.01
                nz = max(0.55, 0.5 + 0.5 * math.sqrt(max(0.0, 1 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2)))
                nrm_px.extend([max(0, min(1, nx)), max(0, min(1, ny)), max(0, min(1, nz)), 1.0])

                ao = max(0.2, 0.98 - dirt * 0.55 - cav * 0.25)
                if role == "hull":
                    rv = rough + dirt * 0.18 + seam * 0.06 + (gf - 0.5) * 0.03  # ~0.55-0.75 matte
                    mv = metal  # ~0
                elif role == "mech":
                    rv = rough + heat * 0.12 - seam * 0.05 + (gf - 0.5) * 0.04  # low ~0.25-0.4
                    mv = min(0.98, metal + heat * 0.05)  # high metal
                elif role == "cyan":
                    rv = rough  # mid
                    mv = 0.0
                elif role == "glass":
                    rv = 0.06
                    mv = 0.0
                else:
                    rv = rough + dirt * 0.1
                    mv = metal
                orm_px.extend([ao, max(0.03, min(0.97, rv)), max(0.0, min(1.0, mv)), 1.0])

        def img(n, px, non_color):
            old = bpy.data.images.get(n)
            if old:
                try:
                    bpy.data.images.remove(old)
                except Exception:
                    pass
            im = bpy.data.images.new(n, TEX, TEX, alpha=True)
            if non_color:
                im.colorspace_settings.name = "Non-Color"
            im.pixels = px
            im.pack()
            return im

        ib = img(f"{name}_baseColor", base_px, False)
        inn = img(f"{name}_normal", nrm_px, True)
        io = img(f"{name}_orm", orm_px, True)
        tb = nodes.new("ShaderNodeTexImage")
        tb.image = ib
        tb.location = (-700, 250)
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = inn
        tn.location = (-700, 0)
        to = nodes.new("ShaderNodeTexImage")
        to.image = io
        to.location = (-700, -250)
        nrm = nodes.new("ShaderNodeNormalMap")
        nrm.location = (-350, 0)
        try:
            sep = nodes.new("ShaderNodeSeparateColor")
        except Exception:
            sep = nodes.new("ShaderNodeSeparateRGB")
        sep.location = (-350, -250)
        links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(tn.outputs["Color"], nrm.inputs["Color"])
        links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(to.outputs["Color"], sep.inputs[0])
        links.new(sep.outputs[1], bsdf.inputs["Roughness"])
        links.new(sep.outputs[2], bsdf.inputs["Metallic"])
        if role == "glass":
            try:
                bsdf.inputs["Transmission Weight"].default_value = 0.9
                bsdf.inputs["Alpha"].default_value = 0.4
                bsdf.inputs["IOR"].default_value = 1.45
                mat.blend_method = "BLEND"
            except Exception:
                try:
                    bsdf.inputs["Transmission"].default_value = 0.9
                except Exception:
                    pass
            mat.use_backface_culling = False

    rebuild("Material_Hull", (196, 184, 164, 255), 0.62, 0.04, "hull")
    rebuild("Material_Mechanical", (22, 26, 30, 255), 0.28, 0.88, "mech")
    rebuild("Material_Cyan", (30, 90, 110, 255), 0.35, 0.0, "cyan")
    rebuild("Material_Warm", (70, 42, 22, 255), 0.45, 0.15, "warm")
    rebuild("Material_Glass", (40, 80, 100, 255), 0.06, 0.0, "glass")
    return mats


def build_ship(mats: dict) -> list[bpy.types.Object]:
    coll = F.new_collection("AUTHORING")
    parts: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    cyan = mats["Material_Cyan"]
    warm = mats["Material_Warm"]

    fus = make_fuselage_loft(coll, hull)
    parts.append(fus)

    # shallow spine (machined) as separate for material contrast, slight inset look
    spine = F.make_box("Hull_Spine", (10.0, 0.16, 0.28), (-0.3, 0.82, 0.0), mech, coll, detail=1)
    bevel_angle(spine, 0.01, 2, 40.0)
    unwrap_hard(spine)
    parts.append(spine)

    for z_sign in (-1.0, 1.0):
        parts.append(make_wing(coll, hull, z_sign))
        # RCS rooted block on canard mid
        rcs = F.make_box(
            f"RCS_{'P' if z_sign < 0 else 'S'}",
            (0.5, 0.22, 0.4),
            (0.9, 0.0, z_sign * 2.4),
            mech,
            coll,
            detail=1,
        )
        bevel_angle(rcs, 0.012, 2, 40.0)
        unwrap_hard(rcs)
        parts.append(rcs)
        parts.extend(make_nacelle(coll, mats, z_sign))

    parts.extend(make_canopy(coll, mats))

    tip = F.make_cone("Nose_Probe", 0.12, 0.03, 0.85, (9.2, 0.0, 0.0), cyan, coll, vertices=18)
    unwrap_hard(tip)
    parts.append(tip)

    gun = F.make_cylinder(
        "Gun_Assembly",
        0.1,
        1.7,
        (6.7, 0.0, 0.0),
        mech,
        coll,
        vertices=14,
        component="weapon",
        keep_separate=True,
    )
    unwrap_hard(gun)
    parts.append(gun)

    blister = F.make_box("Cargo_Blister", (2.4, 0.42, 0.95), (0.4, -0.9, 0.0), hull, coll, detail=1)
    bevel_angle(blister, 0.03, 2, 32.0)
    unwrap_hard(blister)
    parts.append(blister)

    marker = F.make_box("Status_Marker", (0.22, 0.1, 0.1), (-4.2, 0.55, 0.5), warm, coll, detail=1)
    unwrap_hard(marker)
    parts.append(marker)

    for p in parts:
        p["sf_remaster"] = PACKET
        p["sf_production"] = "lark_iter11"
    log(f"parts={len(parts)} tris={sum(F.tri_count_object(p) for p in parts if p.type=='MESH')}")
    return parts


def main() -> int:
    global F
    F = load_family()
    log("=== LARK ITER11 hard-surface rebuild ===")
    reset_scene()
    mats = build_materials()
    parts = build_ship(mats)

    all_lod = []
    lod_stats = []
    for lod_name, ratio, drop in (("lod0", 1.0, False), ("lod1", 0.52, True), ("lod2", 0.26, True)):
        src = []
        for obj in parts:
            if obj.type != "MESH":
                continue
            if drop and F.is_close_only(obj):
                continue
            n = obj.name.lower()
            if lod_name == "lod2":
                keep = ("fuselage", "hull", "engine", "canard", "canopy", "nose", "gun", "cargo", "rcs")
                if not any(t in n for t in keep) and not F.classify_keep_separate(obj):
                    continue
            src.append(obj)
        _c, meshes, stats = F.build_lod_collection(src, lod_name, ratio, False, mats)
        for m in meshes:
            unwrap_hard(m)
            F.ensure_normals(m)
            F.triangulate_object(m)
            F.ensure_mikktspace_tangents(m)
        all_lod.extend(meshes)
        lod_stats.append(stats)
        log(f"  {lod_name}: {stats['triangles']} tris, {stats['mesh_count']} draws")

    export_coll = F.new_collection("EXPORT")
    root = F.create_root_and_sockets(export_coll, F.SHIP_SPECS["lark"])
    try:
        meta = dict(root.get("spacefaceAsset") or {})
        meta["remaster"] = PACKET
        meta["iter"] = 11
        root["spacefaceAsset"] = meta
    except Exception:
        pass
    for o in all_lod:
        F.set_parent_keep_world(o, root)
        try:
            export_coll.objects.link(o)
        except Exception:
            pass
    collision = F.create_collision_hull(export_coll, root, all_lod)

    blend = FAMILY / "blender" / "helios_lark_production.blend"
    blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))

    source_glb = FAMILY / "source" / "wholeships" / "helios_lark.glb"
    export_objects = [root] + all_lod
    for o in bpy.data.objects:
        if o.name.startswith("SOCKET_"):
            export_objects.append(o)
    if collision:
        export_objects.append(collision)
    F.export_glb(source_glb, export_objects)
    F.stamp_material_basecolor_factors(source_glb)
    report = F.stamp_glb_metadata(source_glb, F.SHIP_SPECS["lark"], lod_stats)
    F.stamp_material_basecolor_factors(source_glb)
    sha = F.sha256_file(source_glb)
    rc = FAMILY / "release_candidates" / "wholeships" / "helios_lark.glb"
    rc.parent.mkdir(parents=True, exist_ok=True)
    rc.write_bytes(source_glb.read_bytes())

    # Evidence renders
    evidence = SCRATCH / "lark_evidence" / "iter11"
    evidence.mkdir(parents=True, exist_ok=True)
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = not o.name.startswith("LOD0")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    if scene.camera is None:
        bpy.ops.object.camera_add()
        scene.camera = bpy.context.view_layer.objects.active
    cam = scene.camera
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for o in bpy.data.objects:
        if not o.name.startswith("LOD0") or o.type != "MESH":
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mins.x = min(mins.x, w.x)
            mins.y = min(mins.y, w.y)
            mins.z = min(mins.z, w.z)
            maxs.x = max(maxs.x, w.x)
            maxs.y = max(maxs.y, w.y)
            maxs.z = max(maxs.z, w.z)
    center = (mins + maxs) * 0.5
    size = (maxs - mins).length
    dist = max(size * 1.3, 12.0)
    for name, offset in (
        ("forward_34", Vector((dist * 0.75, -dist * 0.85, dist * 0.35))),
        ("grazing", Vector((dist * 0.15, -dist * 0.25, dist * 0.04))),
        ("side", Vector((0, -dist * 1.1, 0.05 * size))),
        ("rear", Vector((-dist * 0.8, -dist * 0.5, dist * 0.25))),
    ):
        cam.location = center + offset
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = evidence / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    for lod in ("LOD0", "LOD1", "LOD2"):
        for o in bpy.data.objects:
            if o.type != "MESH":
                continue
            o.hide_render = not o.name.startswith(lod)
        cam.location = center + Vector((dist * 0.75, -dist * 0.85, dist * 0.35))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = evidence / f"lod_{lod.lower()}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    summary = {
        "sha256": sha,
        "totalTriangles": report.get("totalTriangles"),
        "hullTriangles": report.get("hullTriangles"),
        "lod": {s["lod"]: s["triangles"] for s in lod_stats},
        "draws": {s["lod"]: s["draw_estimate"] for s in lod_stats},
        "sockets": report.get("sockets"),
        "materials": report.get("materials"),
        "iter": 11,
        "no_voxel_remesh": True,
    }
    (evidence / "build_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    log(f"DONE {sha} tris={summary['totalTriangles']} lod={summary['lod']}")
    print("ITER11_DONE", sha, summary["totalTriangles"])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        import traceback

        traceback.print_exc()
        print("ITER11_FAILED", exc)
        raise SystemExit(2)
