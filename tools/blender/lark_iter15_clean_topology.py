#!/usr/bin/env python3
"""Helios Lark iter15 — clean topology (kill geometric spiderweb shade seams).

Root cause (iter14b proof): dark spiderweb lines on Three close-front persist with
*solid flat* textures → geometric/normal damage from torus/boolean diffs on loft.

Strategy:
- Continuous loft fuselage (no voxel remesh)
- NO torus boolean grooves on hull (those destroyed normals)
- Service/panel language as *separate* recessed mechanical parts (no host damage)
- Cylindrical nacelles + nozzle bore (bore only on engine, not hull)
- Post-mesh: merge-by-distance, clear custom split normals, recalc outside, weighted normals
- Soft role PBR (matte paint / alloy / glass) without hard UV tile seams
- Authored LODs + lit EEVEE + export
"""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(r"C:\Users\93rob\AppData\Local\Temp\grok-goal-5d58d165aa45\implementer")
FAMILY = ROOT / "assets/ships/m4_helios_civilian"
PACKET = "GFX-LARK-REMASTER-001"
TEX = 1024
ITER = 15

F = None


def log(msg: str) -> None:
    print(f"[lark-iter15] {msg}", flush=True)


def load_family():
    spec = importlib.util.spec_from_file_location(
        "family", ROOT / "tools/blender/build_m4_helios_civilian_family.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return mod


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


def heal_mesh(obj: bpy.types.Object, merge_dist: float = 0.0005) -> None:
    """Critical: remove boolean/loft normal damage that reads as spiderweb under Three."""
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.remove_doubles(threshold=merge_dist)
    except Exception:
        pass
    try:
        bpy.ops.mesh.normals_make_consistent(inside=False)
    except Exception:
        pass
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception:
        pass
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.object.mode_set(mode="OBJECT")
    # Auto smooth by angle (Blender 4+/5 API varies)
    mesh = obj.data
    try:
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(35.0)
    except Exception:
        pass
    try:
        # Blender 4.1+ smooth by angle modifier path
        if not any(m.type == "WEIGHTED_NORMAL" for m in obj.modifiers):
            wn = obj.modifiers.new("Heal_WN", "WEIGHTED_NORMAL")
            wn.mode = "FACE_AREA_WITH_ANGLE"
            wn.keep_sharp = False
            bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception as e:
        log(f"weighted normal warn {obj.name}: {e}")


def bevel_angle(obj: bpy.types.Object, width: float, segments: int = 2, angle: float = 30.0) -> None:
    activate(obj)
    mod = obj.modifiers.new("HS_Bevel", "BEVEL")
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.width = width
    mod.segments = segments
    mod.profile = 0.6
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        log(f"bevel warn {obj.name}: {e}")
    heal_mesh(obj)


def mark_sharp(obj: bpy.types.Object, angle_deg: float = 35.0) -> None:
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.faces_shade_smooth()
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(angle_deg))
    bpy.ops.mesh.mark_sharp()
    bpy.ops.object.mode_set(mode="OBJECT")


def unwrap_hard(obj: bpy.types.Object) -> None:
    activate(obj)
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.mark_seam(clear=True)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(40.0))
    bpy.ops.mesh.mark_seam(clear=False)
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
    except Exception:
        try:
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        except Exception as e:
            log(f"uv fail {obj.name}: {e}")
    try:
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def boolean_diff(host: bpy.types.Object, cutter: bpy.types.Object) -> None:
    activate(host)
    mod = host.modifiers.new("CUT", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        log(f"bool fail {host.name}: {e}")
        if mod.name in host.modifiers:
            host.modifiers.remove(mod)
    mesh = cutter.data
    bpy.data.objects.remove(cutter, do_unlink=True)
    if mesh and mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    heal_mesh(host)


def make_fuselage_loft(coll: bpy.types.Collection, mat: bpy.types.Material) -> bpy.types.Object:
    """Clean continuous loft — NO torus grooves (they caused spiderweb)."""
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
    segs = 36  # slightly lower density = cleaner shading
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
    # Cast edge family only — no boolean damage
    bevel_angle(obj, width=0.05, segments=3, angle=28.0)
    mark_sharp(obj, 32.0)
    heal_mesh(obj)
    unwrap_hard(obj)
    obj["sf_role"] = "hull_primary"
    return obj


def make_panel_plate(coll, mats, name: str, size, loc, mat_key="Material_Mechanical") -> bpy.types.Object:
    """Separate recessed plate — reads as manufacturing joint without host boolean."""
    obj = F.make_box(name, size, loc, mats[mat_key], coll, detail=1)
    # push slightly into hull surface for recess read
    bevel_angle(obj, width=0.01, segments=2, angle=35.0)
    mark_sharp(obj, 34.0)
    heal_mesh(obj)
    unwrap_hard(obj)
    return obj


def make_wing(coll, mat, z_sign: float) -> bpy.types.Object:
    bm = bmesh.new()
    root_le, root_te = 1.65, -1.45
    tip_le, tip_te = 0.75, -0.55
    z0, zt = z_sign * 1.15, z_sign * 3.25
    ht, htip = 0.16, 0.08
    y = 0.0
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
    bevel_angle(obj, width=0.014, segments=2, angle=28.0)
    mark_sharp(obj, 30.0)
    heal_mesh(obj)
    unwrap_hard(obj)
    return obj


def make_nacelle(coll, mats, z_sign: float) -> list[bpy.types.Object]:
    out = []
    side = "P" if z_sign < 0 else "S"
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=0.5,
        depth=2.5,
        location=F.L(-6.8, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    house = bpy.context.view_layer.objects.active
    house.name = f"Engine_Housing_{side}"
    link(house, coll)
    house.data.materials.clear()
    house.data.materials.append(mats["Material_Mechanical"])

    bpy.ops.mesh.primitive_cone_add(
        vertices=28,
        radius1=0.54,
        radius2=0.26,
        depth=1.05,
        location=F.L(-5.35, 0.0, z_sign * 0.72),
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

    # nozzle bore — only on engine housing (not hull)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
        radius=0.28,
        depth=0.9,
        location=F.L(-7.7, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    bore = bpy.context.view_layer.objects.active
    boolean_diff(house, bore)
    bevel_angle(house, width=0.014, segments=2, angle=32.0)
    mark_sharp(house, 32.0)
    heal_mesh(house)
    unwrap_hard(house)
    out.append(house)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20,
        radius=0.22,
        depth=0.38,
        location=F.L(-8.05, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    core = bpy.context.view_layer.objects.active
    core.name = f"Engine_Core_{side}"
    link(core, coll)
    core.data.materials.clear()
    core.data.materials.append(mats["Material_Cyan"])
    core["sf_keep_separate"] = True
    core["sf_component"] = "engine"
    heal_mesh(core)
    unwrap_hard(core)
    out.append(core)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20,
        radius=0.33,
        depth=0.1,
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
    heal_mesh(fan)
    unwrap_hard(fan)
    out.append(fan)
    return out


def make_canopy(coll, mats) -> list[bpy.types.Object]:
    out = []
    frame = F.make_box(
        "Canopy_Frame",
        (2.15, 0.18, 1.0),
        (2.7, 0.9, 0.0),
        mats["Material_Mechanical"],
        coll,
        detail=1,
    )
    bevel_angle(frame, 0.01, 2, 38.0)
    heal_mesh(frame)
    unwrap_hard(frame)
    out.append(frame)

    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=32, ring_count=16, radius=0.72, location=F.L(2.7, 1.18, 0.0)
    )
    glass = bpy.context.view_layer.objects.active
    glass.name = "Canopy_Glass"
    glass.scale = (1.4, 0.58, 0.9)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link(glass, coll)
    bpy.ops.mesh.primitive_cube_add(size=2.6, location=F.L(2.7, 0.52, 0.0))
    cut = bpy.context.view_layer.objects.active
    boolean_diff(glass, cut)
    glass.data.materials.clear()
    glass.data.materials.append(mats["Material_Glass"])
    bevel_angle(glass, width=0.04, segments=3, angle=45.0)
    heal_mesh(glass)
    unwrap_hard(glass)
    out.append(glass)
    return out


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = (v ^ (v >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def build_materials() -> dict[str, bpy.types.Material]:
    """Solid-ish role maps with soft micro variation — no hard UV panel tiles (no spiderweb)."""
    mats = F.create_canonical_materials()

    def rebuild(name: str, rgba: tuple, rough: float, metal: float, role: str) -> None:
        mat = mats[name]
        mat.use_nodes = True
        nt = mat.node_tree
        nodes = nt.nodes
        links = nt.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        out.location = (500, 0)
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (150, 0)
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

        br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
        base_px, nrm_px, orm_px = [], [], []
        for y in range(TEX):
            for x in range(TEX):
                g = h01(x, y, 11)
                g2 = h01(x // 5, y // 5, 29)
                # Soft micro only — no binary seams
                if role == "hull":
                    k = 0.94 + 0.1 * (g - 0.5) + 0.04 * (g2 - 0.5)
                    # gentle longitudinal streak (paint direction), not crack grid
                    streak = 0.03 * math.sin(x * 0.012 + g2)
                    r = max(0, min(1, br * k + streak))
                    g_ = max(0, min(1, bg * k + streak * 0.8))
                    b = max(0, min(1, bb * k + streak * 0.6))
                    rv = rough + (g - 0.5) * 0.04
                    mv = metal
                    ao = 0.88 + 0.1 * g2
                    nx = 0.5 + (g - 0.5) * 0.03
                    ny = 0.5 + (g2 - 0.5) * 0.03
                elif role == "mech":
                    brush = 0.5 + 0.5 * math.sin(x * 0.9)
                    k = 0.9 + 0.15 * (g - 0.5)
                    r = max(0, min(1, br * k + brush * 0.04))
                    g_ = max(0, min(1, bg * k))
                    b = max(0, min(1, bb * k))
                    rv = rough + (brush - 0.5) * 0.06
                    mv = metal
                    ao = 0.85 + 0.1 * g
                    nx = 0.5 + (brush - 0.5) * 0.35
                    ny = 0.5 + (g - 0.5) * 0.06
                elif role == "cyan":
                    pulse = 0.75 + 0.25 * math.sin(x * 0.07)
                    r, g_, b = br * pulse, bg * pulse, bb * pulse
                    rv, mv, ao = rough, 0.04, 0.95
                    nx = ny = 0.5
                elif role == "glass":
                    r, g_, b = br * 0.55, bg * 0.65, bb * 0.75
                    rv, mv, ao = 0.05, 0.0, 0.98
                    nx = ny = 0.5
                else:
                    r = max(0, min(1, br * (0.95 + 0.08 * (g - 0.5))))
                    g_ = max(0, min(1, bg * (0.95 + 0.08 * (g - 0.5))))
                    b = max(0, min(1, bb * (0.95 + 0.08 * (g - 0.5))))
                    rv, mv, ao = rough, metal, 0.9
                    nx = ny = 0.5
                alpha = 0.35 if role == "glass" else 1.0
                base_px.extend([r, g_, b, alpha])
                nz = max(0.55, 0.5 + 0.5 * math.sqrt(max(0.0, 1 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2)))
                nrm_px.extend([max(0.05, min(0.95, nx)), max(0.05, min(0.95, ny)), nz, 1.0])
                orm_px.extend([max(0.2, min(1.0, ao)), max(0.03, min(0.97, rv)), max(0.0, min(1.0, mv)), 1.0])

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
        nrm.inputs["Strength"].default_value = 0.85 if role == "hull" else (1.3 if role == "mech" else 0.4)
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
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if role == "glass":
            try:
                bsdf.inputs["Transmission Weight"].default_value = 0.85
                bsdf.inputs["Alpha"].default_value = 0.35
                bsdf.inputs["IOR"].default_value = 1.45
                mat.blend_method = "BLEND"
            except Exception:
                try:
                    bsdf.inputs["Transmission"].default_value = 0.85
                except Exception:
                    pass
            mat.use_backface_culling = False
        if role == "cyan":
            try:
                bsdf.inputs["Emission Color"].default_value = (0.1, 0.55, 0.75, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 1.6
            except Exception:
                pass

    rebuild("Material_Hull", (130, 124, 114, 255), 0.72, 0.02, "hull")
    rebuild("Material_Mechanical", (22, 24, 28, 255), 0.18, 0.95, "mech")
    rebuild("Material_Cyan", (18, 120, 150, 255), 0.28, 0.04, "cyan")
    rebuild("Material_Warm", (100, 52, 24, 255), 0.45, 0.2, "warm")
    rebuild("Material_Glass", (12, 30, 40, 255), 0.05, 0.0, "glass")
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

    # Manufacturing language as SEPARATE parts (no host boolean damage)
    parts.append(make_panel_plate(coll, mats, "Hull_Spine", (11.0, 0.26, 0.42), (-0.3, 0.96, 0.0)))
    parts.append(make_panel_plate(coll, mats, "Canopy_Coaming", (2.6, 0.18, 1.1), (2.7, 0.84, 0.0)))
    parts.append(make_panel_plate(coll, mats, "Dorsal_Bay_A", (1.8, 0.12, 0.9), (-1.0, 1.0, 0.0)))
    parts.append(make_panel_plate(coll, mats, "Dorsal_Bay_B", (1.4, 0.12, 0.75), (4.2, 0.88, 0.0)))
    for z_sign in (-1.0, 1.0):
        side = "P" if z_sign < 0 else "S"
        parts.append(
            make_panel_plate(
                coll, mats, f"Radiator_{side}", (3.0, 0.5, 0.1), (-0.5, 0.15, z_sign * 1.05)
            )
        )
        parts.append(
            make_panel_plate(
                coll, mats, f"SideAccess_{side}", (1.2, 0.55, 0.1), (-2.2, 0.12, z_sign * 1.0)
            )
        )

    for z_sign in (-1.0, 1.0):
        parts.append(make_wing(coll, hull, z_sign))
        root = make_panel_plate(
            coll,
            mats,
            f"WingRoot_{'P' if z_sign < 0 else 'S'}",
            (1.5, 0.3, 0.55),
            (0.2, 0.05, z_sign * 1.05),
        )
        parts.append(root)
        rcs = make_panel_plate(
            coll,
            mats,
            f"RCS_{'P' if z_sign < 0 else 'S'}",
            (0.55, 0.24, 0.42),
            (0.9, 0.0, z_sign * 2.4),
        )
        parts.append(rcs)
        parts.extend(make_nacelle(coll, mats, z_sign))

    parts.extend(make_canopy(coll, mats))

    tip = F.make_cone("Nose_Probe", 0.12, 0.03, 0.85, (9.2, 0.0, 0.0), cyan, coll, vertices=16)
    heal_mesh(tip)
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
    heal_mesh(gun)
    unwrap_hard(gun)
    parts.append(gun)

    blister = F.make_box("Cargo_Blister", (2.5, 0.42, 0.95), (0.4, -0.92, 0.0), hull, coll, detail=1)
    bevel_angle(blister, 0.028, 2, 30.0)
    heal_mesh(blister)
    unwrap_hard(blister)
    parts.append(blister)

    marker = F.make_box("Status_Marker", (0.24, 0.1, 0.1), (-4.2, 0.55, 0.5), warm, coll, detail=1)
    unwrap_hard(marker)
    parts.append(marker)

    # Final heal pass on all meshes
    for p in parts:
        if p.type == "MESH":
            heal_mesh(p)
            p["sf_remaster"] = PACKET
            p["sf_production"] = f"lark_iter{ITER}"

    # Purge leftover Cubes
    for o in list(bpy.data.objects):
        if o.name.startswith("Cube") and o not in parts:
            mesh = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)

    log(f"parts={len(parts)} tris={sum(F.tri_count_object(p) for p in parts if p.type == 'MESH')}")
    return parts


def setup_lit_eevee() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("World_Lit") if "World_Lit" not in bpy.data.worlds else bpy.data.worlds["World_Lit"]
    scene.world = world
    world.use_nodes = True
    wn = world.node_tree.nodes
    wl = world.node_tree.links
    wn.clear()
    out = wn.new("ShaderNodeOutputWorld")
    bg = wn.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (0.04, 0.045, 0.055, 1.0)
    bg.inputs[1].default_value = 0.35
    wl.new(bg.outputs[0], out.inputs[0])
    bpy.ops.object.light_add(type="SUN", location=(8, -6, 12))
    sun = bpy.context.view_layer.objects.active
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(-35))
    bpy.ops.object.light_add(type="AREA", location=(-6, -10, 4))
    fill = bpy.context.view_layer.objects.active
    fill.data.energy = 250
    fill.data.size = 8
    if scene.camera is None:
        bpy.ops.object.camera_add()
        scene.camera = bpy.context.view_layer.objects.active


def render_evidence(evidence: Path) -> None:
    evidence.mkdir(parents=True, exist_ok=True)
    setup_lit_eevee()
    scene = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == "MESH":
            o.hide_render = not o.name.startswith("LOD0")
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
    dist = max(size * 1.35, 14.0)
    for name, offset in (
        ("forward_34", Vector((dist * 0.75, -dist * 0.85, dist * 0.35))),
        ("grazing", Vector((dist * 0.2, -dist * 0.3, dist * 0.05))),
        ("side", Vector((0, -dist * 1.15, 0.06 * size))),
        ("rear", Vector((-dist * 0.85, -dist * 0.55, dist * 0.28))),
    ):
        cam.location = center + offset
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = evidence / f"{name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        log(f"render {path.name}")
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


def main() -> int:
    global F
    F = load_family()
    log(f"=== LARK ITER{ITER} clean topology ===")
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
                keep = ("fuselage", "hull", "engine", "canard", "canopy", "nose", "gun", "cargo", "rcs", "wing", "spine", "radiator")
                if not any(t in n for t in keep) and not F.classify_keep_separate(obj):
                    continue
            src.append(obj)
        _c, meshes, stats = F.build_lod_collection(src, lod_name, ratio, False, mats)
        for m in meshes:
            heal_mesh(m)
            unwrap_hard(m)
            F.ensure_normals(m)
            F.triangulate_object(m)
            F.ensure_mikktspace_tangents(m)
            heal_mesh(m)  # again after tri
        all_lod.extend(meshes)
        lod_stats.append(stats)
        log(f"  {lod_name}: {stats['triangles']} tris, {stats['mesh_count']} draws")

    export_coll = F.new_collection("EXPORT")
    root = F.create_root_and_sockets(export_coll, F.SHIP_SPECS["lark"])
    try:
        meta = dict(root.get("spacefaceAsset") or {})
        meta["remaster"] = PACKET
        meta["iter"] = ITER
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
    if collision is not None:
        try:
            collision.data.name = "COLLISION_HULL"
        except Exception:
            pass
        collision.name = "COLLISION_HULL"

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
    try:
        doc, chunks = F.read_glb_json(source_glb)
        strong = {
            "Material_Hull": {"baseColorFactor": [0.52, 0.49, 0.45, 1.0], "roughnessFactor": 0.74, "metallicFactor": 0.02},
            "Material_Mechanical": {"baseColorFactor": [0.09, 0.10, 0.12, 1.0], "roughnessFactor": 0.18, "metallicFactor": 0.95},
            "Material_Cyan": {"baseColorFactor": [0.08, 0.50, 0.62, 1.0], "roughnessFactor": 0.28, "metallicFactor": 0.04},
            "Material_Warm": {"baseColorFactor": [0.40, 0.20, 0.09, 1.0], "roughnessFactor": 0.45, "metallicFactor": 0.20},
            "Material_Glass": {"baseColorFactor": [0.05, 0.12, 0.18, 0.32], "roughnessFactor": 0.05, "metallicFactor": 0.0},
        }
        for mat in doc.get("materials") or []:
            name = (mat.get("name") or "").split(".")[0]
            if name not in strong:
                continue
            pbr = mat.setdefault("pbrMetallicRoughness", {})
            pbr.update(strong[name])
            if name == "Material_Glass":
                mat["alphaMode"] = "BLEND"
                mat["doubleSided"] = True
        F.write_glb_json(source_glb, chunks, doc)
    except Exception as e:
        log(f"factor stamp: {e}")

    report = F.stamp_glb_metadata(source_glb, F.SHIP_SPECS["lark"], lod_stats)
    sha = F.sha256_file(source_glb)
    rc = FAMILY / "release_candidates" / "wholeships" / "helios_lark.glb"
    rc.parent.mkdir(parents=True, exist_ok=True)
    rc.write_bytes(source_glb.read_bytes())

    evidence = SCRATCH / "lark_evidence" / f"iter{ITER}"
    try:
        render_evidence(evidence)
    except Exception as e:
        log(f"render warn: {e}")

    summary = {
        "iter": ITER,
        "sourceSha256": sha,
        "lodStats": lod_stats,
        "packet": PACKET,
        "glassPresent": any("glass" in (m.name or "").lower() for m in all_lod),
        "partCount": len(parts),
        "strategy": "no_torus_boolean_on_hull; separate panel plates; heal_mesh normals",
    }
    (evidence / "build_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    log(f"DONE source={sha}")
    log(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
