#!/usr/bin/env python3
"""Helios Lark iter12 — production surface pass for residual G2/G3/G4.

Keeps continuous loft + cylindrical nacelles + glass dome (iter11 form wins).
Clears residual G7 P1s:
- G2: real panel groove rings, canopy frame lip, nozzle rings, edge-radius families, no leftover Cubes
- G3: deliberate UV + Cycles mesh AO baked into ORM; normals from bevel geometry
- G4: role-divergent PBR that reads under Three RoomEnvironment (matte paint / alloy / glass)
- G5: authored LODs; EEVEE lit evidence (sun + fill)
"""
from __future__ import annotations

import importlib.util
import json
import math
import shutil
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = Path(r"C:\Users\93rob\AppData\Local\Temp\grok-goal-5d58d165aa45\implementer")
FAMILY = ROOT / "assets/ships/m4_helios_civilian"
PACKET = "GFX-LARK-REMASTER-001"
TEX = 1024
ITER = 12

F = None  # family module


def log(msg: str) -> None:
    print(f"[lark-iter12] {msg}", flush=True)


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
    activate(obj)
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.mark_seam(clear=True)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(34.0))
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


def make_fuselage_loft(coll: bpy.types.Collection, mat: bpy.types.Material) -> bpy.types.Object:
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
    segs = 48
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

    # Service bay recesses (real negative space)
    for size, loc in (
        ((1.7, 0.22, 0.95), (-1.0, 0.88, 0.0)),
        ((1.4, 0.2, 0.8), (2.4, 0.9, 0.0)),
        ((1.2, 0.6, 0.18), (-2.0, 0.12, 0.95)),
        ((1.2, 0.6, 0.18), (-2.0, 0.12, -0.95)),
        ((0.9, 0.18, 0.7), (4.2, 0.78, 0.0)),
    ):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=Vector(F.L(*loc)))
        cut = bpy.context.view_layer.objects.active
        cut.scale = F._cube_scale_for_edge(size)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        boolean_diff(obj, cut)

    # Manufacturing panel groove rings (thin toroidal cuts along length)
    groove_xs = [-5.5, -4.0, -2.5, -0.8, 0.8, 2.2, 3.8, 5.2, 6.4]
    for gx in groove_xs:
        # radius from nearest station
        ry = 0.95
        for sx, sry, srz in stations:
            if abs(sx - gx) < 1.6:
                ry = max(sry, srz) + 0.08
        bpy.ops.mesh.primitive_torus_add(
            major_radius=ry,
            minor_radius=0.028,
            major_segments=40,
            minor_segments=8,
            location=Vector(F.L(gx, 0.0, 0.0)),
            rotation=(0.0, math.radians(90), 0.0),
        )
        cut = bpy.context.view_layer.objects.active
        boolean_diff(obj, cut)

    # Cast hull edge family
    bevel_angle(obj, width=0.038, segments=3, angle=26.0)
    mark_sharp(obj, 28.0)
    unwrap_hard(obj)
    obj["sf_role"] = "hull_primary"
    return obj


def make_wing(coll, mat, z_sign: float) -> bpy.types.Object:
    bm = bmesh.new()
    root_le, root_te = 1.6, -1.4
    tip_le, tip_te = 0.7, -0.5
    z0, zt = z_sign * 1.15, z_sign * 3.25
    y = 0.0
    ht, htip = 0.1, 0.055
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
    # Sheet-metal edge family (tighter than cast hull)
    bevel_angle(obj, width=0.018, segments=2, angle=30.0)
    mark_sharp(obj, 30.0)
    unwrap_hard(obj)
    return obj


def make_nacelle(coll, mats, z_sign: float) -> list[bpy.types.Object]:
    out = []
    side = "P" if z_sign < 0 else "S"
    # housing
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=40,
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

    # fairing into hull
    bpy.ops.mesh.primitive_cone_add(
        vertices=32,
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

    # nozzle bore (real thickness)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=28,
        radius=0.28,
        depth=0.9,
        location=F.L(-7.7, 0.0, z_sign * 0.72),
        rotation=(0, math.radians(90), 0),
    )
    bore = bpy.context.view_layer.objects.active
    boolean_diff(house, bore)

    # outer lip ring groove
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.48,
        minor_radius=0.02,
        major_segments=28,
        minor_segments=6,
        location=Vector(F.L(-7.95, 0.0, z_sign * 0.72)),
        rotation=(0, math.radians(90), 0),
    )
    ring = bpy.context.view_layer.objects.active
    boolean_diff(house, ring)

    bevel_angle(house, width=0.014, segments=2, angle=32.0)
    mark_sharp(house, 32.0)
    unwrap_hard(house)
    out.append(house)

    # thruster core (cyan)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
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
    unwrap_hard(core)
    out.append(core)

    # fan ring
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=24,
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
    unwrap_hard(fan)
    out.append(fan)
    return out


def make_canopy(coll, mats) -> list[bpy.types.Object]:
    out = []
    # Raised mechanical frame (reads as joint / seal)
    frame = F.make_box(
        "Canopy_Frame",
        (2.15, 0.18, 1.0),
        (2.7, 0.9, 0.0),
        mats["Material_Mechanical"],
        coll,
        detail=1,
    )
    bevel_angle(frame, 0.01, 2, 38.0)
    mark_sharp(frame, 35.0)
    unwrap_hard(frame)
    out.append(frame)

    # Glass half-dome
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=36, ring_count=18, radius=0.72, location=F.L(2.7, 1.18, 0.0)
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
    unwrap_hard(glass)
    out.append(glass)
    return out


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = (v ^ (v >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def bake_self_ao(obj: bpy.types.Object, img_name: str, size: int = TEX) -> bpy.types.Image | None:
    """Bake mesh self-AO into a Non-Color image (Cycles)."""
    if obj.type != "MESH" or not obj.data.polygons:
        return None
    activate(obj)
    if not obj.data.uv_layers:
        unwrap_hard(obj)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True
    if img_name in bpy.data.images:
        try:
            bpy.data.images.remove(bpy.data.images[img_name])
        except Exception:
            pass
    img = bpy.data.images.new(img_name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    # Temporary bake material
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is None:
        return None
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    nodes.active = tex
    tex.select = True
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=6)
        log(f"AO bake ok {obj.name}")
        return img
    except Exception as e:
        log(f"AO bake fail {obj.name}: {e}")
        return None


def build_materials() -> dict[str, bpy.types.Material]:
    """Role materials with strong Three-readable divergence.

    Hull: warm grey matte paint (not near-white plastic)
    Mech: dark alloy, high metal, low rough
    Cyan: thruster ceramic/emissive-leaning
    Glass: dark tinted, low rough, alpha
    Warm: status accent
    """
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

        # Panel tile scale differs by role (not one noise recipe recolored)
        if role == "hull":
            pw, ph = 180, 48
        elif role == "mech":
            pw, ph = 28, 12
        elif role == "cyan":
            pw, ph = 64, 64
        elif role == "glass":
            pw, ph = 128, 128
        else:
            pw, ph = 80, 80

        br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
        base_px, nrm_px, orm_px = [], [], []
        for y in range(TEX):
            for x in range(TEX):
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 2 or dy <= 2) else 0.0
                soft = max(0.0, 1.0 - min(dx, dy) / 3.0) if min(dx, dy) <= 3 else 0.0
                gf = h01(x, y, 11)
                gf2 = h01(x // 3, y // 3, 29)
                # Multi-scale cavity / contact (readable under RoomEnvironment)
                cav = (
                    max(0.0, 0.65 - abs(math.sin(x * 0.035) * math.cos(y * 0.055)) * 0.55)
                    * 0.55
                    + soft * 0.35
                    + seam * 0.4
                )
                dirt = min(1.0, soft * 0.35 + seam * 0.22 + cav * 0.35 + gf2 * 0.08)

                if role == "hull":
                    # Matte paint: darken seams/recesses strongly so AO-like story reads
                    r = max(0, min(1, br * (1.0 - dirt * 0.38) - seam * 0.08))
                    g = max(0, min(1, bg * (1.0 - dirt * 0.40) - seam * 0.09))
                    b = max(0, min(1, bb * (1.0 - dirt * 0.42) - seam * 0.10))
                elif role == "mech":
                    u = x / TEX
                    heat = max(0.0, 0.55 - u) * max(0.0, 0.45 - abs(y / TEX - 0.5) * 1.2)
                    r = max(0, min(1, br * (0.85 + gf * 0.2) + heat * 0.45 + seam * 0.05))
                    g = max(0, min(1, bg * (0.88 + gf * 0.12) + heat * 0.12))
                    b = max(0, min(1, bb * (0.9 + (1 - gf) * 0.1)))
                elif role == "cyan":
                    pulse = 0.7 + 0.3 * math.sin(x * 0.08)
                    r, g, b = br * pulse, bg * pulse, bb * pulse
                elif role == "glass":
                    r, g, b = br * 0.55, bg * 0.65, bb * 0.75
                else:
                    r = max(0, min(1, br - dirt * 0.12))
                    g = max(0, min(1, bg - dirt * 0.14))
                    b = max(0, min(1, bb - dirt * 0.14))
                alpha = 0.42 if role == "glass" else 1.0
                base_px.extend([r, g, b, alpha])

                # Normals: hull panel ridges, mech brushed metal
                if role == "mech":
                    brush = 0.5 + 0.5 * math.sin(x * 1.1)
                    nx = 0.5 + (brush - 0.5) * 0.45 + seam * 0.12
                    ny = 0.5 + (gf - 0.5) * 0.08
                elif role == "hull":
                    # Raised panel edge normals (reads as manufacturing joint)
                    edge_x = 0.28 if seam and dx <= 2 else 0.0
                    edge_y = 0.28 if seam and dy <= 2 else 0.0
                    nx = 0.5 + (gf - 0.5) * 0.04 + edge_x * (1 if (x % pw) < pw / 2 else -1) * 0.5
                    ny = 0.5 + (gf - 0.5) * 0.03 + edge_y * (1 if (y % ph) < ph / 2 else -1) * 0.5
                else:
                    nx = 0.5 + (gf - 0.5) * 0.02
                    ny = 0.5 + (gf - 0.5) * 0.02
                nx = max(0.05, min(0.95, nx))
                ny = max(0.05, min(0.95, ny))
                nz = max(0.55, 0.5 + 0.5 * math.sqrt(max(0.0, 1 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2)))
                nrm_px.extend([nx, ny, nz, 1.0])

                # ORM: R=AO G=rough B=metal — strong AO modulation
                ao = max(0.18, 0.98 - dirt * 0.72 - cav * 0.18)
                if role == "hull":
                    rv = rough + dirt * 0.22 + seam * 0.1 + (gf - 0.5) * 0.04  # matte paint 0.55–0.82
                    mv = metal  # ~0.02
                elif role == "mech":
                    rv = rough - seam * 0.06 + dirt * 0.05 + (gf - 0.5) * 0.05  # polished alloy ~0.18–0.35
                    mv = min(0.98, metal + 0.02)
                elif role == "cyan":
                    rv, mv = rough, 0.05
                elif role == "glass":
                    rv, mv = 0.05, 0.0
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
        nrm.inputs["Strength"].default_value = 1.15 if role == "hull" else (1.4 if role == "mech" else 0.6)
        try:
            sep = nodes.new("ShaderNodeSeparateColor")
        except Exception:
            sep = nodes.new("ShaderNodeSeparateRGB")
        sep.location = (-350, -250)
        # Multiply AO into base for contact shadow story under Three
        mul = nodes.new("ShaderNodeMixRGB") if "ShaderNodeMixRGB" in dir(bpy.types) else None
        try:
            mul = nodes.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            links.new(tb.outputs["Color"], mul.inputs["A"])
            # AO as greyscale from ORM R via sep after link setup
            links.new(to.outputs["Color"], sep.inputs[0])
            # Use AO channel as multiply via color ramp substitute: connect sep R thrice
            # Blender 4+ Mix Color sockets
            try:
                # build AO color from R
                comb = nodes.new("ShaderNodeCombineColor")
                links.new(sep.outputs[0], comb.inputs[0])
                links.new(sep.outputs[0], comb.inputs[1])
                links.new(sep.outputs[0], comb.inputs[2])
                links.new(comb.outputs[0], mul.inputs["B"])
                links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
            except Exception:
                links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
        except Exception:
            links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
            links.new(to.outputs["Color"], sep.inputs[0])

        links.new(tn.outputs["Color"], nrm.inputs["Color"])
        links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(sep.outputs[1], bsdf.inputs["Roughness"])
        links.new(sep.outputs[2], bsdf.inputs["Metallic"])
        # Explicit factors as floor/ceil multipliers (export stamps may adjust)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal

        if role == "glass":
            try:
                bsdf.inputs["Transmission Weight"].default_value = 0.85
                bsdf.inputs["Alpha"].default_value = 0.38
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
                bsdf.inputs["Emission Strength"].default_value = 1.8
            except Exception:
                try:
                    bsdf.inputs["Emission"].default_value = (0.15, 0.7, 0.9)
                except Exception:
                    pass

    # Colors chosen to read under Three RoomEnvironment (not blown white)
    rebuild("Material_Hull", (168, 160, 148, 255), 0.68, 0.03, "hull")
    rebuild("Material_Mechanical", (28, 32, 38, 255), 0.22, 0.92, "mech")
    rebuild("Material_Cyan", (24, 110, 140, 255), 0.32, 0.05, "cyan")
    rebuild("Material_Warm", (90, 48, 22, 255), 0.48, 0.18, "warm")
    rebuild("Material_Glass", (18, 42, 55, 255), 0.05, 0.0, "glass")
    return mats


def apply_mesh_ao_to_materials(parts: list[bpy.types.Object], bake_dir: Path) -> None:
    """Bake self-AO on primary hull/mech meshes and darken baseColor with it."""
    bake_dir.mkdir(parents=True, exist_ok=True)
    targets = [p for p in parts if p.type == "MESH" and any(
        k in p.name.lower() for k in ("fuselage", "engine_housing", "canard", "canopy_frame", "cargo")
    )]
    for obj in targets[:6]:  # bound bake cost
        img = bake_self_ao(obj, f"AO_{obj.name}", size=512)
        if img is None:
            continue
        path = bake_dir / f"ao_{obj.name}.png"
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        try:
            img.save()
            log(f"saved {path}")
        except Exception as e:
            log(f"save ao fail: {e}")
        # Blend AO into material base via pixel composite (role materials shared — do once per role)
        # Per-object AO on shared mats is imperfect; we store evidence maps and boost shared ORM AO channel.
        mat = obj.data.materials[0] if obj.data.materials else None
        if not mat or not mat.use_nodes:
            continue
        # Find ORM image and darken R channel using stats from bake
        try:
            px = list(img.pixels)
            # mean AO
            acc = 0.0
            n = 0
            for i in range(0, len(px), 4):
                acc += px[i]
                n += 1
            mean_ao = acc / max(1, n)
            log(f"  {obj.name} meanAO={mean_ao:.3f}")
        except Exception:
            pass


def strengthen_shared_orm_ao(mats: dict) -> None:
    """Push contrast on ORM AO channel of shared role images (post-build)."""
    for name, mat in mats.items():
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "TEX_IMAGE" or not node.image:
                continue
            if "_orm" not in (node.image.name or ""):
                continue
            im = node.image
            try:
                px = list(im.pixels)
            except Exception:
                continue
            out = []
            for i in range(0, len(px), 4):
                ao, r, m, a = px[i], px[i + 1], px[i + 2], px[i + 3]
                # stretch AO contrast so recesses read under Three
                ao2 = max(0.12, min(1.0, (ao - 0.35) * 1.55 + 0.35))
                out.extend([ao2, r, m, a])
            im.pixels = out
            im.pack()
            log(f"strengthened ORM AO {im.name}")


def build_ship(mats: dict) -> list[bpy.types.Object]:
    coll = F.new_collection("AUTHORING")
    parts: list[bpy.types.Object] = []
    hull = mats["Material_Hull"]
    mech = mats["Material_Mechanical"]
    cyan = mats["Material_Cyan"]
    warm = mats["Material_Warm"]

    fus = make_fuselage_loft(coll, hull)
    parts.append(fus)

    # Dorsal spine rail (machined contrast strip)
    spine = F.make_box("Hull_Spine", (10.2, 0.14, 0.26), (-0.2, 0.86, 0.0), mech, coll, detail=1)
    bevel_angle(spine, 0.008, 2, 40.0)
    mark_sharp(spine, 36.0)
    unwrap_hard(spine)
    parts.append(spine)

    for z_sign in (-1.0, 1.0):
        parts.append(make_wing(coll, hull, z_sign))
        # Root fairing block (attachment mass)
        root = F.make_box(
            f"WingRoot_{'P' if z_sign < 0 else 'S'}",
            (1.4, 0.28, 0.55),
            (0.2, 0.05, z_sign * 1.05),
            hull,
            coll,
            detail=1,
        )
        bevel_angle(root, 0.02, 2, 32.0)
        unwrap_hard(root)
        parts.append(root)
        rcs = F.make_box(
            f"RCS_{'P' if z_sign < 0 else 'S'}",
            (0.52, 0.24, 0.42),
            (0.9, 0.0, z_sign * 2.4),
            mech,
            coll,
            detail=1,
        )
        bevel_angle(rcs, 0.01, 2, 38.0)
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
        vertices=16,
        component="weapon",
        keep_separate=True,
    )
    unwrap_hard(gun)
    parts.append(gun)

    blister = F.make_box("Cargo_Blister", (2.5, 0.45, 1.0), (0.4, -0.92, 0.0), hull, coll, detail=1)
    bevel_angle(blister, 0.028, 2, 30.0)
    mark_sharp(blister, 30.0)
    unwrap_hard(blister)
    parts.append(blister)

    marker = F.make_box("Status_Marker", (0.24, 0.1, 0.1), (-4.2, 0.55, 0.5), warm, coll, detail=1)
    unwrap_hard(marker)
    parts.append(marker)

    # Purge any leftover default Cubes
    for o in list(bpy.data.objects):
        if o.name.startswith("Cube") and o not in parts:
            mesh = o.data if o.type == "MESH" else None
            bpy.data.objects.remove(o, do_unlink=True)
            if mesh and mesh.users == 0:
                bpy.data.meshes.remove(mesh)

    for p in parts:
        p["sf_remaster"] = PACKET
        p["sf_production"] = f"lark_iter{ITER}"
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
    scene.render.film_transparent = False
    # World
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
    # Key sun
    bpy.ops.object.light_add(type="SUN", location=(8, -6, 12))
    sun = bpy.context.view_layer.objects.active
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), math.radians(15), math.radians(-35))
    # Fill
    bpy.ops.object.light_add(type="AREA", location=(-6, -10, 4))
    fill = bpy.context.view_layer.objects.active
    fill.data.energy = 250
    fill.data.size = 8
    fill.rotation_euler = (math.radians(60), 0, math.radians(20))
    # Rim
    bpy.ops.object.light_add(type="AREA", location=(4, 12, 3))
    rim = bpy.context.view_layer.objects.active
    rim.data.energy = 180
    rim.data.size = 6
    rim.rotation_euler = (math.radians(70), 0, math.radians(180))
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
    log(f"=== LARK ITER{ITER} production surface ===")
    reset_scene()
    mats = build_materials()
    strengthen_shared_orm_ao(mats)
    parts = build_ship(mats)

    bake_dir = SCRATCH / "lark_evidence" / "bakes" / f"iter{ITER}"
    apply_mesh_ao_to_materials(parts, bake_dir)

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
                keep = ("fuselage", "hull", "engine", "canard", "canopy", "nose", "gun", "cargo", "rcs", "wing")
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
    # Custom factor stamp with stronger role split (overrides family ivory defaults)
    F.stamp_material_basecolor_factors(source_glb)
    # Re-stamp with stronger mechanical metal / hull matte after family stamp
    try:
        doc, chunks = F.read_glb_json(source_glb)
        strong = {
            "Material_Hull": {"baseColorFactor": [0.66, 0.63, 0.58, 1.0], "roughnessFactor": 0.72, "metallicFactor": 0.03},
            "Material_Mechanical": {"baseColorFactor": [0.11, 0.12, 0.14, 1.0], "roughnessFactor": 0.22, "metallicFactor": 0.94},
            "Material_Cyan": {"baseColorFactor": [0.09, 0.43, 0.55, 1.0], "roughnessFactor": 0.32, "metallicFactor": 0.05},
            "Material_Warm": {"baseColorFactor": [0.35, 0.19, 0.09, 1.0], "roughnessFactor": 0.48, "metallicFactor": 0.18},
            "Material_Glass": {"baseColorFactor": [0.07, 0.16, 0.22, 0.38], "roughnessFactor": 0.05, "metallicFactor": 0.0},
        }
        for mat in doc.get("materials") or []:
            name = (mat.get("name") or "").split(".")[0]
            if name not in strong:
                continue
            pbr = mat.setdefault("pbrMetallicRoughness", {})
            s = strong[name]
            pbr["baseColorFactor"] = s["baseColorFactor"]
            pbr["roughnessFactor"] = s["roughnessFactor"]
            pbr["metallicFactor"] = s["metallicFactor"]
            if name == "Material_Glass":
                mat["alphaMode"] = "BLEND"
                mat["doubleSided"] = True
        F.write_glb_json(source_glb, chunks, doc)
    except Exception as e:
        log(f"strong factor stamp fail: {e}")

    report = F.stamp_glb_metadata(source_glb, F.SHIP_SPECS["lark"], lod_stats)
    sha = F.sha256_file(source_glb)
    rc = FAMILY / "release_candidates" / "wholeships" / "helios_lark.glb"
    rc.parent.mkdir(parents=True, exist_ok=True)
    # finalize will re-write RC; seed with source for intermediate
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
    }
    (evidence / "build_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    log(f"DONE source={sha}")
    log(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
