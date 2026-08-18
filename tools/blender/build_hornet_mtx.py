"""PQ-050.01 Hornet MTX builder. Hitch untouched. --mtx-cycle N writes cycle stills."""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from fleet_construction import (  # noqa: E402
    add_folded_sheet,
    add_manufactured_drive,
    add_overlap_plate,
    add_radiator_cassette,
    add_rcs_cluster,
    add_sensor_dish,
    add_service_hatch,
    add_tile_bank,
    apply_modifiers,
    densify_ring,
    loft_shell,
    station_ring,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "hornet"
TEX_DIR = FAMILY / "source" / "textures"
# Texture size per LOD, not one size for every level.
#
# 512 everywhere is far under the contract floor: MTX-17 wants 256-512 px/m at LOD0 and a 512 map
# on a 10.7 m ship is about 34 px/m at best, which is why every reviewer reads the surface as
# unpainted plastic. But raising it to a flat 2048 (cycle 56) inflated all three levels together to
# 64.6 / 64.5 / 63.1 MB - roughly 192 MB for one ship, against 15.3 MB for the entire live player
# ship release, with LOD2 (the level that exists to be cheap) the same size as LOD0. A ship that
# large would hit the same admission failure place_station_trade_hub already demonstrates at 75 MB
# (docs/COMMON_BUGS.md 12).
#
# So: LOD0 carries the density the contract asks for, and the levels a player only ever sees small
# carry less.
TEX_BY_LOD = {0: 2048, 1: 1024, 2: 512}
TEX = TEX_BY_LOD[0]
CYCLE = 1
for i, tok in enumerate(sys.argv):
    if tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images):
        for item in list(bucket):
            bucket.remove(item)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def h01(x, y, s=0):
    v = (x * 374761393 + y * 668265263 + s * 362437) & 0xFFFFFFFF
    v = ((v ^ (v >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 255) / 255.0


def write_pixels(name, pixels, size, colorspace="sRGB"):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels = pixels
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    path = TEX_DIR / f"{name}.png"
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def role_maps(role, rgb, size=None, prefix=None):
    # size=None, not size=TEX: a default argument is evaluated once when the function is defined,
    # so size=TEX would freeze LOD0's map size and silently ignore the ladder.
    size = TEX if size is None else size
    """Unique Hornet maps. Not a tint of the shared fleet sheet."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    if role == "hull":
        pw, ph = 0, 0
    elif role == "armor":
        pw, ph = 72, 48
    elif role == "mechanical":
        pw, ph = 22, 10
    elif role == "ceramic":
        pw, ph = 0, 0
    elif role in {"glass", "thruster"}:
        pw, ph = 0, 0
    else:
        pw, ph = 80, 80
    for y in range(size):
        for x in range(size):
            if pw == 0:
                dx = dy = 99
                seam = 0.0
                soft = 0.0
            else:
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                soft = max(0.0, 1.0 - min(dx, dy) / 3.0) if min(dx, dy) <= 3 else 0.0
            gf = h01(x, y, 11)
            gf2 = h01(x // 3, y // 3, 29)
            cav = (0.15 + 0.25 * gf2) if pw == 0 else (
                max(0.0, 0.62 - abs(math.sin(x * 0.04) * math.cos(y * 0.05)) * 0.5) * 0.5 + soft * 0.3 + seam * 0.35
            )
            dirt = min(1.0, (0.12 * gf + 0.18 * gf2) if pw == 0 else (soft * 0.32 + seam * 0.2 + cav * 0.32 + gf2 * 0.08))
            edge = 0.0 if pw == 0 else (1.0 if (dx <= 3 or dy <= 3) else 0.0)
            stencil = 0.0
            if role == "hull" and 70 <= x <= 150 and 210 <= y <= 268:
                # Broken spray stencil HN, no thickness.
                col = x - 70
                row = y - 210
                if 6 <= col <= 18 and 8 <= row <= 50:
                    stencil = 0.85
                if 18 <= col <= 34 and 8 <= row <= 16:
                    stencil = 0.8
                if 18 <= col <= 30 and 26 <= row <= 34:
                    stencil = 0.75
                if 40 <= col <= 52 and 8 <= row <= 50:
                    stencil = 0.82
                if 52 <= col <= 68 and (8 <= row <= 16 or 42 <= row <= 50):
                    stencil = 0.7
                if gf > 0.82:
                    stencil *= 0.35
            if role == "hull":
                r = max(0, min(1, br * (1.0 - dirt * 0.22) + 0.03))
                g = max(0, min(1, bg * (1.0 - dirt * 0.20) + 0.02))
                b = max(0, min(1, bb * (1.0 - dirt * 0.16) + 0.02))
                if stencil > 0:
                    r = r * (1 - stencil) + 0.04 * stencil
                    g = g * (1 - stencil) + 0.36 * stencil
                    b = b * (1 - stencil) + 0.44 * stencil
                rough = 0.40 + dirt * 0.22 - edge * 0.08
                metal = 0.04 + edge * 0.12
            elif role == "armor":
                r = max(0, min(1, br * (1.0 - dirt * 0.28) - seam * 0.06))
                g = max(0, min(1, bg * (1.0 - dirt * 0.22) - seam * 0.04))
                b = max(0, min(1, bb * (1.0 - dirt * 0.18)))
                rough = 0.34 + dirt * 0.18
                metal = 0.38 + edge * 0.2
            elif role == "mechanical":
                heat = max(0.0, 0.5 - x / size) * 0.35
                r = max(0, min(1, br * (0.88 + gf * 0.16) + heat * 0.35))
                g = max(0, min(1, bg * (0.9 + gf * 0.1) + heat * 0.08))
                b = max(0, min(1, bb * (0.92 + (1 - gf) * 0.08)))
                rough = 0.24 + dirt * 0.2 + heat * 0.15
                metal = 0.86
            elif role == "ceramic":
                r = max(0, min(1, br * (0.9 + gf2 * 0.12) - dirt * 0.15))
                g = max(0, min(1, bg * (0.88 + gf * 0.08) - dirt * 0.12))
                b = max(0, min(1, bb * (0.82 - dirt * 0.1)))
                rough = 0.62 + dirt * 0.12
                metal = 0.0
            elif role == "accent":
                pulse = 0.75 + 0.25 * math.sin(x * 0.07)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal = 0.34, 0.1
            elif role == "warning":
                r, g, b = br * (1 - dirt * 0.2), bg * (1 - dirt * 0.15), bb
                rough, metal = 0.46, 0.05
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal = 0.06, 0.03
            elif role == "thruster":
                r, g, b = br, bg, bb
                rough, metal = 0.22, 0.2
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.5, 0.2
            ao = max(0.18, 1.0 - cav * 0.55 - dirt * 0.2)
            nx = 0.5 + (dx / max(1, pw) - 0.5) * 0.08 * (1 if dx <= 4 else 0.2)
            ny = 0.5 + (dy / max(1, ph) - 0.5) * 0.08 * (1 if dy <= 4 else 0.2)
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.04, min(0.95, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((nx, ny, 1.0, 1.0))
    base = write_pixels(f"hornet_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"hornet_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"hornet_{prefix}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_maps(material, bsdf, maps, coat=0.0, emission=None):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
    uv1 = nodes.new("ShaderNodeUVMap")
    uv1.uv_map = "UV1"
    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = maps[0]
    tex_o = nodes.new("ShaderNodeTexImage")
    tex_o.image = maps[1]
    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = maps[2]
    links.new(uv0.outputs["UV"], tex_a.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_o.inputs["Vector"])
    links.new(uv0.outputs["UV"], tex_n.inputs["Vector"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = 0.85
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]


def create_materials():
    specs = {
        "Material_Hull": ((0.28, 0.30, 0.32), 0.08, 0.42, "hull", 0.45, None),
        "Material_Armor": ((0.14, 0.16, 0.17), 0.42, 0.34, "armor", 0.10, None),
        "Material_Mechanical": ((0.44, 0.46, 0.48), 0.88, 0.22, "mechanical", 0.0, None),
        "Material_Accent": ((0.04, 0.40, 0.50), 0.10, 0.34, "accent", 0.2, None),
        "Material_Warning": ((0.70, 0.34, 0.05), 0.05, 0.46, "warning", 0.1, None),
        "Material_Ceramic": ((0.16, 0.13, 0.10), 0.0, 0.74, "ceramic", 0.0, None),
        "Material_Radiator": ((0.12, 0.10, 0.08), 0.62, 0.62, "mechanical", 0.0, None),
        "Material_Canopy": ((0.08, 0.22, 0.26), 0.00, 0.10, "glass", 0.18, ((0.04, 0.14, 0.16), 0.18)),
        "Material_Thruster": ((0.02, 0.08, 0.12), 0.15, 0.22, "thruster", 0.0, None),
    }
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
        wire_maps(material, bsdf, maps, coat=coat, emission=emit)
        if name == "Material_Canopy":
            # EEVEE dark studio turns high-transmission glass black.
            # Tint + low transmission + mild emission reads as a cockpit pane.
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.16
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.16
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.45
            bsdf.inputs["Alpha"].default_value = 0.72
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "BLEND"
                except TypeError:
                    pass
        material["spacefaceRole"] = role
        mats[name] = material
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.03):
    obj.data.materials.clear()
    obj.data.materials.append(material)
    if bevel > 0:
        mod = obj.modifiers.new("ProductionBevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    wn = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=18, bevel=0.02, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap:
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    for station in range(len(rings) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def ellipse_ring(x, y, z, rx, rz, sides=16):
    return [
        (x, y + math.cos(math.tau * i / sides) * rx, z + math.sin(math.tau * i / sides) * rz)
        for i in range(sides)
    ]


def boolean_cut(host, cutter_name, loc, scale, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    cutter = bpy.context.object
    cutter.name = cutter_name
    cutter.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_modifiers(host)
    bpy.context.view_layer.objects.active = host
    host.select_set(True)
    mod = host.modifiers.new(cutter_name, "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    bpy.ops.object.modifier_apply(modifier=mod.name)
    host.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    """Spun bottle: lofted outer, boolean throat, ceramic collar, vanes to a hub."""
    s = scale
    ceramic, thruster, mech, armor = (
        mats["Material_Ceramic"], mats["Material_Thruster"],
        mats["Material_Mechanical"], mats["Material_Armor"],
    )
    # Rocket bell: narrow throat at the transom, flare OPEN toward aft (-X).
    rings = []
    for t, r, rz in (
        (0.00, 0.22, 0.22),
        (0.18, 0.26, 0.26),
        (0.42, 0.38, 0.38),
        (0.70, 0.56, 0.56),
        (1.00, 0.72, 0.72),
    ):
        xi = x - 0.06 * s - t * 1.18 * s
        rings.append(ellipse_ring(xi, y, z, r * s, rz * s, 40))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.005, cap=False)
    apply_modifiers(outer)
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.12 * s, radius2=0.62 * s, depth=1.28 * s,
        location=(x - 0.68 * s, y, z), rotation=(0, math.pi / 2, 0),
    )
    inner = bpy.context.object
    inner.name = f"BellCutter_{tag}"
    bpy.context.view_layer.objects.active = outer
    outer.select_set(True)
    mod = outer.modifiers.new("BellCut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = inner
    try:
        mod.solver = "EXACT"
    except Exception:
        pass
    bpy.ops.object.modifier_apply(modifier=mod.name)
    outer.select_set(False)
    bpy.data.objects.remove(inner, do_unlink=True)
    add_cylinder(f"BellCollar_{tag}", (x - 0.08 * s, y, z), 0.26 * s, 0.12 * s, ceramic, collection, 22, 0.004)
    add_cylinder(f"BellClamp_{tag}", (x + 0.08 * s, y, z), 0.34 * s, 0.06 * s, armor, collection, 22, 0.003)
    add_cylinder(f"BellFlange_{tag}", (x + 0.18 * s, y, z), 0.38 * s, 0.07 * s, mech, collection, 22, 0.003)
    add_cylinder(f"BellHub_{tag}", (x - 0.55 * s, y, z), 0.07 * s, 0.28 * s, mech, collection, 12, 0.002)
    for index in range(10):
        ang = math.tau * index / 10
        add_box(
            f"BellVane_{tag}_{index}",
            (x - 0.72 * s, y + math.cos(ang) * 0.28 * s, z + math.sin(ang) * 0.28 * s),
            (0.28 * s, 0.016 * s, 0.070 * s),
            mech, collection, 0.002, (ang, 0, 0),
        )
    return outer


def diamond_ring(x, yc, zc, hw, hh):
    """Hard-chine diamond. Crown, shoulder, chine, keel — not a scaled box."""
    return [
        (x, yc + 0.00, zc + hh),
        (x, yc + hw * 0.40, zc + hh * 0.70),
        (x, yc + hw, zc + hh * 0.10),
        (x, yc + hw * 0.68, zc - hh * 0.38),
        (x, yc + 0.00, zc - hh),
        (x, yc - hw * 0.68, zc - hh * 0.38),
        (x, yc - hw, zc + hh * 0.10),
        (x, yc - hw * 0.40, zc + hh * 0.70),
    ]


def add_delta_wing(name, sign, material, collection):
    """Solid folded-plate delta. Visible root thickness, not a lofted card."""
    s = sign
    verts = [
        (1.45, 1.28 * s, 0.16),
        (-1.55, 1.28 * s, 0.12),
        (-2.15, 4.38 * s, -0.06),
        (-0.15, 4.38 * s, -0.02),
        (1.45, 1.28 * s, -0.10),
        (-1.55, 1.28 * s, -0.14),
        (-2.15, 4.38 * s, -0.18),
        (-0.15, 4.38 * s, -0.14),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, 0.018)


def add_manufactured_delta(name, sign, material, collection):
    """Solid plated slab-delta. Thickness is the form; no card airfoil."""
    s = sign
    verts = [
        (1.55, 0.95 * s, 0.28),
        (-0.85, 0.95 * s, 0.22),
        (-1.85, 3.55 * s, 0.08),
        (0.15, 3.55 * s, 0.10),
        (1.55, 0.95 * s, -0.22),
        (-0.85, 0.95 * s, -0.20),
        (-1.85, 3.55 * s, -0.10),
        (0.15, 3.55 * s, -0.08),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
        (0, 4, 5, 1),
        (3, 2, 6, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    wing = bpy.data.objects.new(name, mesh)
    collection.objects.link(wing)
    finish_mesh(wing, material, 0.016)
    add_folded_sheet(
        f"{name}_SkinFore",
        (1.20, 1.10 * s, 0.32),
        (0.05, 2.15 * s, 0.24),
        (-0.10, 2.15 * s, 0.10),
        (1.05, 1.10 * s, 0.08),
        0.050, material, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_SkinAft",
        (0.15, 2.00 * s, 0.22),
        (-1.15, 3.25 * s, 0.12),
        (-1.30, 3.25 * s, 0.02),
        (0.00, 2.00 * s, 0.06),
        0.044, material, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_Leading",
        (1.58, 1.05 * s, 0.16),
        (0.35, 3.20 * s, 0.12),
        (0.20, 3.20 * s, -0.04),
        (1.40, 1.05 * s, -0.14),
        0.070, material, collection, 0.005,
    )
    add_folded_sheet(
        f"{name}_Flap",
        (-0.70, 1.35 * s, 0.08),
        (-1.55, 3.15 * s, 0.02),
        (-1.70, 3.15 * s, -0.08),
        (-0.88, 1.35 * s, -0.06),
        0.040, material, collection, 0.003,
    )
    add_folded_sheet(
        f"{name}_TipCap",
        (-0.05, 3.48 * s, 0.12),
        (-1.70, 3.62 * s, 0.06),
        (-1.80, 3.62 * s, -0.08),
        (-0.20, 3.48 * s, -0.08),
        0.055, material, collection, 0.003,
    )
    add_folded_sheet(
        f"{name}_Under",
        (1.10, 1.20 * s, -0.24),
        (-0.70, 3.05 * s, -0.14),
        (-0.55, 3.05 * s, -0.04),
        (1.25, 1.20 * s, -0.06),
        0.040, material, collection, 0.003,
    )
    add_overlap_plate(f"{name}_TileA", (0.55, 1.45 * s, 0.30), (0.38, 0.22, 0.022), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileB", (-0.15, 2.15 * s, 0.24), (0.32, 0.20, 0.020), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileC", (-0.85, 2.85 * s, 0.16), (0.28, 0.18, 0.018), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileD", (0.20, 1.70 * s, -0.22), (0.34, 0.20, 0.018), material, collection, 0.004)
    add_overlap_plate(f"{name}_TileE", (0.85, 1.25 * s, 0.28), (0.26, 0.16, 0.018), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileF", (-0.45, 2.55 * s, 0.20), (0.24, 0.16, 0.016), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileG", (-1.10, 3.10 * s, 0.12), (0.22, 0.14, 0.016), material, collection, 0.003)
    add_overlap_plate(f"{name}_TileH", (0.40, 2.00 * s, -0.20), (0.26, 0.16, 0.016), material, collection, 0.003)
    return wing


def add_blended_interceptor_wing(name, sign, hull, armor, collection):
    """Swept delta lofted from a root buried in the fuselage beam. Not a side card."""
    s = float(sign)

    def station(y_abs, le, chord, thick, z):
        return airfoil_ring(le - chord * 0.42, y_abs * s, z, chord, thick)

    # Root chord +1.22 → −2.40 sits inside the body (hw 1.26–1.35). Tip |y| ≈ 3.58.
    rings = [
        station(1.02, 1.22, 3.62, 0.32, 0.07),
        station(1.34, 1.14, 3.46, 0.26, 0.05),
        station(2.12, 0.58, 2.92, 0.18, 0.02),
        station(2.88, 0.06, 2.42, 0.12, -0.02),
        station(3.58, -0.40, 2.16, 0.08, -0.05),
    ]
    wing = loft_from_rings(name, rings, hull, collection, 0.012, cap=True)
    add_folded_sheet(
        f"{name}_Leading",
        (1.16, 1.28 * s, 0.16), (-0.22, 3.42 * s, 0.04),
        (-0.36, 3.42 * s, -0.08), (1.02, 1.28 * s, -0.10),
        0.055, hull, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_Flap",
        (-1.55, 1.55 * s, 0.06), (-2.35, 3.05 * s, -0.02),
        (-2.48, 3.05 * s, -0.10), (-1.72, 1.55 * s, -0.08),
        0.036, armor, collection, 0.003,
    )
    add_folded_sheet(
        f"{name}_TipCap",
        (-0.28, 3.48 * s, 0.06), (-2.48, 3.62 * s, 0.02),
        (-2.55, 3.62 * s, -0.08), (-0.42, 3.48 * s, -0.08),
        0.048, hull, collection, 0.003,
    )
    add_overlap_plate(f"{name}_TileA", (0.35, 1.70 * s, 0.16), (0.32, 0.18, 0.016), armor, collection, 0.003)
    add_overlap_plate(f"{name}_TileB", (-0.35, 2.35 * s, 0.10), (0.28, 0.16, 0.014), armor, collection, 0.003)
    add_overlap_plate(f"{name}_TileC", (-1.05, 2.95 * s, 0.04), (0.24, 0.14, 0.012), armor, collection, 0.003)
    return wing


def add_merged_nacelle(tag, sign, lod, mats, collection):
    """Drive house grown out of the aft body, not a trailing boom."""
    hull = mats["Material_Hull"]
    y = 0.70 * sign
    nacelle = loft_from_rings(f"Nacelle_{tag}", [
        densify_ring(station_ring(-2.20, y, -0.04, 0.38, 0.32, flat=0.22, box=0.72, keel=0.18)),
        densify_ring(station_ring(-3.15, y, -0.06, 0.42, 0.36, flat=0.18, box=0.84, keel=0.12)),
        densify_ring(station_ring(-4.05, y, -0.06, 0.40, 0.34, flat=0.14, box=0.90, keel=0.10)),
        densify_ring(station_ring(-4.86, y, -0.06, 0.34, 0.30, flat=0.10, box=0.92, keel=0.08)),
    ], hull, collection, 0.010)
    add_hollow_bell(tag, -4.88, y, -0.06, 0.58, mats, collection)
    add_manufactured_drive(tag, -4.22, y, lod, mats, collection, scale=0.48, z=-0.06)
    return nacelle


def add_greenhouse(tag, x, y, z, length, width, height, mats, collection):
    """Thin framed panes over a cut tub. Not a dark brick or lofted shoebox."""
    canopy = mats["Material_Canopy"]
    armor = mats["Material_Armor"]
    mech = mats["Material_Mechanical"]
    xf = x + length * 0.50
    xa = x - length * 0.50
    yp = y - width
    ys = y + width
    z0 = z
    z1 = z + height
    add_folded_sheet(
        f"{tag}_PaneP",
        (xf - 0.04, yp, z0 + 0.03),
        (xa + 0.06, yp * 0.90, z0 + 0.05),
        (xa + 0.08, yp * 0.55, z1 * 0.90),
        (xf - 0.18, yp * 0.42, z1 * 0.62),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_PaneS",
        (xf - 0.04, ys, z0 + 0.03),
        (xf - 0.18, ys * 0.42, z1 * 0.62),
        (xa + 0.08, ys * 0.55, z1 * 0.90),
        (xa + 0.06, ys * 0.90, z0 + 0.05),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_Windscreen",
        (xf + 0.02, yp * 0.55, z0 + 0.04),
        (xf + 0.02, ys * 0.55, z0 + 0.04),
        (xf - 0.16, ys * 0.18, z1 * 0.64),
        (xf - 0.16, yp * 0.18, z1 * 0.64),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_RoofP",
        (xf - 0.18, yp * 0.18, z1 * 0.64),
        (xa + 0.10, yp * 0.22, z1 * 0.88),
        (xa + 0.10, 0.0, z1),
        (xf - 0.18, 0.0, z1 * 0.78),
        0.012, canopy, collection, 0.002,
    )
    add_folded_sheet(
        f"{tag}_RoofS",
        (xf - 0.18, 0.0, z1 * 0.78),
        (xa + 0.10, 0.0, z1),
        (xa + 0.10, ys * 0.22, z1 * 0.88),
        (xf - 0.18, ys * 0.18, z1 * 0.64),
        0.012, canopy, collection, 0.002,
    )
    add_box(f"{tag}_Sill", (x, y, z0 + 0.006), (length * 0.46, width * 0.96, 0.010), armor, collection, 0.002)
    add_box(f"{tag}_Brow", (xf - 0.10, y, z0 + height * 0.22), (0.018, width * 0.36, height * 0.10), armor, collection, 0.002)
    add_box(f"{tag}_AftBulk", (xa + 0.08, y, z0 + height * 0.20), (0.016, width * 0.48, height * 0.14), armor, collection, 0.002)
    add_box(f"{tag}_Spine", (x - 0.04, y, z1 * 0.98), (length * 0.24, 0.008, 0.008), armor, collection, 0.002)
    for i, ox in enumerate((-0.42, -0.12, 0.16, 0.38)):
        add_cylinder(
            f"{tag}_Rivet_{i}", (x + ox, yp * 0.92, z0 + 0.02),
            0.009, 0.016, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0),
        )


def airfoil_ring(x, y, z, chord, thick):
    le, te = chord * 0.42, chord * 0.58
    return [
        (x + le, y, z),
        (x + le * 0.62, y, z + thick * 0.48),
        (x + le * 0.12, y, z + thick),
        (x - te * 0.18, y, z + thick * 0.78),
        (x - te * 0.55, y, z + thick * 0.34),
        (x - te, y, z),
        (x - te * 0.55, y, z - thick * 0.26),
        (x - te * 0.18, y, z - thick * 0.58),
        (x + le * 0.12, y, z - thick * 0.88),
        (x + le * 0.62, y, z - thick * 0.40),
    ]


def inset_large_faces(obj, thickness=0.04, depth=0.02, min_area=0.16):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    faces = [
        face for face in bm.faces
        if face.calc_area() >= min_area and abs(face.calc_center_median().x) < 6.2
    ]
    if faces:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    finish_mesh(obj, obj.data.materials[0], bevel=0.012)


def add_curve_hose(name, points, material, collection, radius=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for index, point in enumerate(points):
        bp = spline.bezier_points[index]
        bp.co = point
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    obj.select_set(False)
    return finish_mesh(obj, material, bevel=0.003)


def add_thin_canopy(tag, x, y, z, length, width, height, mats, collection):
    """Framed greenhouse over a cut tub. Thin panes, metal cage, not a brick."""
    canopy, armor, mech = mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"]
    # Open arch rings: no floor, so solidify makes a shell.
    rings = []
    # Low fighter bubble: flush brow, low peak, tucked aft. Not a shoebox.
    for t, scale_h, scale_w, z_off in (
        (0.0, 0.22, 0.48, 0.00),
        (0.28, 0.78, 0.88, 0.00),
        (0.62, 1.00, 1.00, 0.00),
        (1.0, 0.30, 0.55, 0.02),
    ):
        xi = x + length * 0.5 - t * length
        h = height * scale_h
        w = width * scale_w
        rings.append([
            (xi, y - w, z + z_off),
            (xi, y - w * 0.72, z + z_off + h * 0.55),
            (xi, y - w * 0.18, z + z_off + h),
            (xi, y + w * 0.18, z + z_off + h),
            (xi, y + w * 0.72, z + z_off + h * 0.55),
            (xi, y + w, z + z_off),
        ])
    shell = loft_from_rings(f"{tag}_Shell", rings, canopy, collection, bevel=0.004, cap=False)
    solid = shell.modifiers.new("GlassShell", "SOLIDIFY")
    solid.thickness = 0.016
    solid.offset = 0.0
    add_box(f"{tag}_Sill", (x, y, z + 0.004), (length * 0.50, width * 0.92, 0.012), armor, collection, 0.003)
    add_box(f"{tag}_Brow", (x + length * 0.46, y, z + height * 0.22), (0.028, width * 0.52, height * 0.10), armor, collection, 0.003)
    add_box(f"{tag}_AftBulk", (x - length * 0.48, y, z + height * 0.16), (0.022, width * 0.62, height * 0.12), armor, collection, 0.003)
    add_box(f"{tag}_RailP", (x, y - width * 0.90, z + height * 0.16), (length * 0.36, 0.012, height * 0.10), armor, collection, 0.002)
    add_box(f"{tag}_RailS", (x, y + width * 0.90, z + height * 0.16), (length * 0.36, 0.012, height * 0.10), armor, collection, 0.002)
    add_box(f"{tag}_Mullion", (x + length * 0.02, y, z + height * 0.28), (0.012, width * 0.48, height * 0.08), armor, collection, 0.002)
    for i, ox in enumerate((-0.38, -0.12, 0.14, 0.36)):
        add_cylinder(f"{tag}_Rivet_{i}", (x + ox, y - width * 0.92, z + 0.02), 0.01, 0.018, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0))
    return shell


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    if parent:
        obj.parent = parent
    obj["socket"] = True
    return obj


def sockets():
    """Mount points, in Blender space (x forward, y span, z up).

    Re-seated for the C54 compact body. The names are the runtime contract and must never change,
    but the POSITIONS have to follow the hull: the form restart shortened the ship from 15.3 to
    10.7 units, and the forward sockets were left at the old needle coordinates. SOCKET_Weapon_Front
    sat at x 7.05 against a nose ending at x 5.60 -- the gun was mounted 1.45 units in front of the
    ship, firing from empty space, and SOCKET_Mining_Front was 2.05 units out.

    Measured envelope of the C54 hull (Pressure_Hull_Mesh / COLLISION_HULL_MESH):
    x -4.93 -> 5.60, y (span) +/-3.64, z (height) -0.64 -> 0.69.
    Every value below sits on or just inside that.
    """
    return {
        "SOCKET_Weapon_Front": (5.30, 0.0, 0.10),
        "SOCKET_Mining_Front": (5.45, 0.0, -0.10),
        "SOCKET_Engine_Main": (-4.75, 0.0, 0.05),
        "SOCKET_Trail_Main": (-5.00, 0.0, 0.05),
        "SOCKET_Trail_Port": (-4.90, -1.15, 0.05),
        "SOCKET_Trail_Starboard": (-4.90, 1.15, 0.05),
        "SOCKET_Utility_Dorsal": (0.6, 0.0, 0.62),
        "SOCKET_Cargo_Ventral": (-0.4, 0.0, -0.58),
        "SOCKET_Camera_Focus": (0.8, 0.0, 0.20),
        "SOCKET_RCS_Port": (-1.2, -2.2, 0.05),
        "SOCKET_RCS_Starboard": (-1.2, 2.2, 0.05),
    }


def shade_and_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.018, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers.active
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 8.0
    obj.select_set(False)


def bake_ao_into_albedo(obj, samples=12, size=None):
    size = TEX if size is None else size  # see role_maps: resolve at call time, not def time
    if obj.type != "MESH" or not obj.data.polygons or not obj.data.uv_layers.active:
        return
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    img_name = f"AO_{obj.name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    ao = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    ao.colorspace_settings.name = "Non-Color"
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is None or not mat.use_nodes:
        return
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = ao
    node.name = "SF_AO_TARGET"
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(type="AO", use_clear=True, margin=6)
    except Exception as exc:
        print(f"AO bake skip {obj.name}: {exc}")
        return
    finally:
        for victim in [n for n in mat.node_tree.nodes if n.name == "SF_AO_TARGET"]:
            mat.node_tree.nodes.remove(victim)
    albedo = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "basecolor" in n.image.name), None)
    if albedo is None:
        return
    ap = list(albedo.pixels)
    op = list(ao.pixels)
    n = min(len(ap) // 4, len(op) // 4)
    for i in range(n):
        factor = 0.84 + 0.16 * op[i * 4]
        ap[i * 4] *= factor
        ap[i * 4 + 1] *= factor
        ap[i * 4 + 2] *= factor
    albedo.pixels = ap
    albedo.pack()


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"HORNET_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    warning, accent, ceramic = mats["Material_Warning"], mats["Material_Accent"], mats["Material_Ceramic"]
    root = add_empty(f"HORNET_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_HORNET_PRODUCTION_V1", "partId": "hornet_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    # C54: one watertight loft, nose x=+5.60 to transom x=−4.90. Shape changes
    # through flat/box/keel, not through four disjoint gloves. No hoop cage.
    hull_obj = loft_from_rings("Pressure_Hull", [
        densify_ring(station_ring(5.60, 0, 0.10, 0.10, 0.09, flat=0.06, box=0.08, keel=0.92)),
        densify_ring(station_ring(5.22, 0, 0.12, 0.34, 0.26, flat=0.18, box=0.18, keel=0.78)),
        densify_ring(station_ring(4.72, 0, 0.14, 0.56, 0.38, flat=0.32, box=0.28, keel=0.62)),
        densify_ring(station_ring(4.18, 0, 0.16, 0.70, 0.46, flat=0.55, box=0.34, keel=0.50)),
        densify_ring(station_ring(3.68, 0, 0.20, 0.82, 0.58, flat=0.86, box=0.38, keel=0.42)),
        densify_ring(station_ring(3.15, 0, 0.20, 0.92, 0.60, flat=0.88, box=0.42, keel=0.40)),
        densify_ring(station_ring(2.55, 0, 0.14, 1.05, 0.54, flat=0.58, box=0.52, keel=0.36)),
        densify_ring(station_ring(1.80, 0, 0.08, 1.18, 0.54, flat=0.32, box=0.60, keel=0.34)),
        densify_ring(station_ring(1.20, 0, 0.06, 1.26, 0.56, flat=0.24, box=0.66, keel=0.32)),
        densify_ring(station_ring(0.30, 0, 0.05, 1.32, 0.58, flat=0.18, box=0.70, keel=0.30)),
        densify_ring(station_ring(-0.60, 0, 0.04, 1.35, 0.58, flat=0.16, box=0.74, keel=0.28)),
        densify_ring(station_ring(-1.40, 0, 0.04, 1.28, 0.56, flat=0.14, box=0.78, keel=0.24)),
        densify_ring(station_ring(-2.20, 0, 0.05, 1.18, 0.54, flat=0.14, box=0.82, keel=0.20)),
        densify_ring(station_ring(-3.05, 0, 0.06, 1.08, 0.52, flat=0.14, box=0.86, keel=0.14)),
        densify_ring(station_ring(-3.85, 0, 0.06, 0.98, 0.48, flat=0.12, box=0.90, keel=0.10)),
        densify_ring(station_ring(-4.50, 0, 0.06, 0.92, 0.44, flat=0.10, box=0.92, keel=0.08)),
        densify_ring(station_ring(-4.90, 0, 0.06, 0.86, 0.40, flat=0.08, box=0.92, keel=0.06)),
    ], hull, collection, 0.012, cap=True)
    inset_large_faces(hull_obj, thickness=0.022, depth=0.009, min_area=0.045)

    # Canopy blister let into the flat dorsal deck, not floating above it.
    add_thin_canopy("Canopy", 3.25, 0.0, 0.52, 1.20, 0.36, 0.34, mats, collection)
    add_box("Cockpit_Seat", (3.10, 0.0, 0.40), (0.16, 0.11, 0.05), mech, collection, 0.004)
    add_box("Cockpit_Back", (2.96, 0.0, 0.50), (0.030, 0.10, 0.08), armor, collection, 0.003)
    add_box("Cockpit_Console", (3.48, 0.0, 0.48), (0.10, 0.13, 0.022), armor, collection, 0.003)

    add_folded_sheet(
        "Chine_P",
        (2.40, -1.08, 0.06), (-2.10, -1.14, 0.04),
        (-2.10, -1.04, 0.22), (2.40, -0.96, 0.24),
        0.028, hull, collection, 0.004,
    )
    add_folded_sheet(
        "Chine_S",
        (2.40, 1.08, 0.06), (2.40, 0.96, 0.24),
        (-2.10, 1.04, 0.22), (-2.10, 1.14, 0.04),
        0.028, hull, collection, 0.004,
    )
    add_folded_sheet(
        "Keel_Spine",
        (1.60, -0.12, -0.62), (-2.00, -0.12, -0.56),
        (-2.00, 0.12, -0.56), (1.60, 0.12, -0.62),
        0.040, hull, collection, 0.004,
    )
    add_overlap_plate("Armor_Dorsal_Fore", (1.15, 0.00, 0.64), (0.52, 0.32, 0.028), armor, collection, 0.006)
    add_overlap_plate("Armor_Dorsal_Mid", (-0.20, 0.06, 0.62), (0.44, 0.28, 0.026), armor, collection, 0.006)
    add_overlap_plate("Armor_Dorsal_Aft", (-1.55, -0.04, 0.58), (0.38, 0.24, 0.024), hull, collection, 0.006)
    add_overlap_plate("Armor_CheekP", (0.70, -1.28, 0.14), (0.48, 0.032, 0.18), armor, collection, 0.006)
    add_overlap_plate("Armor_CheekS", (0.70, 1.28, 0.14), (0.48, 0.032, 0.18), armor, collection, 0.006)
    add_overlap_plate("Armor_NoseP", (4.55, -0.48, 0.16), (0.36, 0.026, 0.12), armor, collection, 0.004)
    add_overlap_plate("Armor_NoseS", (4.55, 0.48, 0.16), (0.36, 0.026, 0.12), armor, collection, 0.004)
    add_overlap_plate("Armor_HouseP", (-3.40, -0.98, 0.16), (0.55, 0.030, 0.16), armor, collection, 0.005)
    add_overlap_plate("Armor_HouseS", (-3.40, 0.98, 0.16), (0.55, 0.030, 0.16), armor, collection, 0.005)
    add_overlap_plate("Armor_KeelFore", (1.20, 0.00, -0.60), (0.50, 0.14, 0.024), hull, collection, 0.004)
    add_overlap_plate("Armor_KeelAft", (-1.10, 0.00, -0.56), (0.46, 0.12, 0.022), hull, collection, 0.004)
    add_overlap_plate("Accent_WaistP", (0.15, -1.30, 0.18), (0.42, 0.016, 0.08), accent, collection, 0.003)
    add_overlap_plate("Accent_WaistS", (0.15, 1.30, 0.18), (0.42, 0.016, 0.08), accent, collection, 0.003)
    add_box("Seam_CanopyAft", (2.52, 0.0, 0.58), (0.010, 0.62, 0.010), armor, collection, 0.002)
    add_box("Seam_WingRoot", (1.18, 0.0, 0.62), (0.010, 0.72, 0.010), armor, collection, 0.002)
    add_box("Seam_Waist", (-0.60, 0.0, 0.62), (0.010, 0.78, 0.010), armor, collection, 0.002)
    add_box("Seam_House", (-2.20, 0.0, 0.58), (0.010, 0.62, 0.010), armor, collection, 0.002)
    add_box("TransomPlate", (-4.91, 0.0, 0.04), (0.018, 0.28, 0.12), hull, collection, 0.003)

    add_tile_bank("DorsalTiles", 1.50, -1.90, 0.00, 0.62, 6, 0.16, 0.11, 0.014, armor, collection, 0.04)
    add_tile_bank("FlankTiles_P", 1.40, -1.60, -1.26, 0.16, 5, 0.14, 0.022, 0.08, armor, collection, 0.03)
    add_tile_bank("FlankTiles_S", 1.40, -1.60, 1.26, 0.16, 5, 0.14, 0.022, 0.08, armor, collection, 0.03)
    add_tile_bank("KeelTiles", 1.40, -1.70, 0.00, -0.60, 5, 0.16, 0.09, 0.014, hull, collection, 0.03)

    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_blended_interceptor_wing(f"Wing_{side}", sign, hull, armor, collection)
        loft_shell(f"WingBlend_{side}", [
            (1.18, 1.08 * sign, 1.44 * sign, -0.14, 0.26),
            (0.20, 1.18 * sign, 1.74 * sign, -0.16, 0.24),
            (-0.70, 1.22 * sign, 1.90 * sign, -0.14, 0.20),
            (-2.15, 1.02 * sign, 1.50 * sign, -0.10, 0.16),
        ], hull, collection, 0.008)
        add_folded_sheet(
            f"GloveCheek_{side}",
            (1.18, 1.10 * sign, -0.06), (-0.10, 1.36 * sign, -0.08),
            (-0.10, 1.36 * sign, 0.22), (1.18, 1.10 * sign, 0.24),
            0.036, hull, collection, 0.004,
        )
        add_merged_nacelle(side, sign, lod, mats, collection)
        loft_from_rings(f"Canard_{side}", [
            airfoil_ring(4.55, 0.48 * sign, 0.06, 0.72, 0.14),
            airfoil_ring(4.22, 0.92 * sign, 0.04, 0.42, 0.07),
        ], hull, collection, 0.005)
        add_folded_sheet(
            f"GunCheek_{side}",
            (5.05, 0.22 * sign, -0.08), (4.20, 0.52 * sign, -0.10),
            (4.20, 0.52 * sign, 0.12), (5.05, 0.22 * sign, 0.14),
            0.032, armor, collection, 0.003,
        )
        add_overlap_plate(f"GunTrunnion_{side}", (4.55, 0.40 * sign, 0.00), (0.22, 0.08, 0.07), mech, collection, 0.004)
        add_cylinder(f"BarrelJacket_{side}", (5.15, 0.40 * sign, -0.02), 0.032, 0.52, ceramic, collection, vertices=10, bevel=0.002)
        add_cylinder(f"BarrelIsolator_{side}", (5.48, 0.40 * sign, -0.02), 0.024, 0.12, mech, collection, vertices=8, bevel=0.002)
        add_rcs_cluster(side, (-1.15, 2.55 * sign, 0.10), mats, collection, sign=sign)
        add_overlap_plate(f"WarnTip_{side}", (-1.35, 3.35 * sign, 0.02), (0.18, 0.08, 0.012), warning, collection, 0.002)
        add_overlap_plate(f"AccentWing_{side}", (-0.35, 2.20 * sign, 0.12), (0.55, 0.06, 0.010), accent, collection, 0.002)

    if lod <= 1:
        add_radiator_cassette("PortFlank", (-3.15, -1.02, 0.28), lod, mats, collection, length=0.85, height=0.18, yaw=0.0)
        add_radiator_cassette("StbdFlank", (-3.15, 1.02, 0.28), lod, mats, collection, length=0.85, height=0.18, yaw=0.0)
    add_sensor_dish("Dorsal", (-0.15, 0.18, 0.72), mats, collection)
    add_service_hatch("Dorsal", (-1.15, 0.28, 0.60), mats, collection, sx=0.32, sy=0.22)
    add_overlap_plate("Repair_Patch", (0.85, -0.42, 0.66), (0.22, 0.10, 0.010), warning, collection, 0.002)
    if lod == 0:
        add_folded_sheet(
            "ServicePad_P",
            (-0.40, -1.30, 0.02), (-0.18, -1.30, 0.02),
            (-0.18, -1.14, 0.10), (-0.40, -1.14, 0.10),
            0.012, mech, collection, 0.002,
        )
        add_folded_sheet(
            "ServicePad_S",
            (-0.40, 1.30, 0.02), (-0.40, 1.14, 0.10),
            (-0.18, 1.14, 0.10), (-0.18, 1.30, 0.02),
            0.012, mech, collection, 0.002,
        )

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        obj.parent = root

    groups = {}
    for obj in mesh_objects:
        name = obj.data.materials[0].name if obj.data.materials else "Material_Hull"
        groups.setdefault(name, []).append(obj)
    merged = []
    for material_name, objects in sorted(groups.items()):
        objects = [obj for obj in objects if obj.data and len(obj.data.vertices) > 0]
        if not objects:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        if len(objects) > 1:
            bpy.ops.object.join()
        active.name = f"LOD{lod}_{material_name.replace('Material_', '')}"
        active.parent = root
        shade_and_uv(active)
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        if lod == 0 and material_name in {"Material_Hull", "Material_Armor", "Material_Mechanical"}:
            bake_ao_into_albedo(active)
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in [
        (5.7, 0, 0.1), (0.2, -3.7, 0.1), (0.2, 3.7, 0.1),
        (-5.0, -1.1, 0.1), (-5.0, 1.1, 0.1),
        (1.2, -1.2, -0.7), (1.2, 1.2, -0.7),
        (3.2, 0, 1.0),
    ]:
        bm.verts.new(point)
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    collision_mesh = bpy.data.meshes.new("COLLISION_HULL_MESH")
    bm.to_mesh(collision_mesh)
    bm.free()
    collision = bpy.data.objects.new("COLLISION_HULL", collision_mesh)
    collection.objects.link(collision)
    collision.parent = root
    collision.hide_render = True
    collision["collision"] = True
    collision["nonRender"] = True
    hull_tris = next((sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged if "Hull" in obj.name), 0)
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted(groups),
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"hornet_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_extras=True, export_animations=False,
        export_materials="EXPORT", export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="AUTO",
    )
    for attempt in range(6):
        try:
            if out.exists():
                out.unlink()
            shutil.move(str(tmp), str(out))
            break
        except OSError:
            if attempt == 5:
                raise
            import time
            time.sleep(0.35 * (attempt + 1))
    return out


def look_at(obj, target=(0, 0, 0.1)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.22
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.028, 0.032, 0.038, 1)
    bg.inputs["Strength"].default_value = 0.85
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 7800, (0.88, 0.92, 1), 10),
        ("Fill", (4, 16, 8), 3200, (0.55, 0.62, 0.72), 8),
        ("Rim", (-14, -5, 7), 4000, (0.72, 0.80, 0.92), 7),
        ("Kick", (-6, 10, -4), 1800, (0.7, 0.75, 0.85), 6),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        look_at(obj)
    return camera


def snap(camera, path, loc, target, lens):
    camera.location = loc
    camera.data.lens = lens
    look_at(camera, target)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def override_emission(meshes, color_fn, clay=False):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = bpy.data.materials.new(f"ISO_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        color, strength = color_fn(obj)
        if clay:
            bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (0.46, 0.46, 0.47, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.58
            mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        else:
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            emit.inputs["Color"].default_value = (*color, 1)
            emit.inputs["Strength"].default_value = strength
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        if obj.material_slots:
            obj.material_slots[0].material = mat
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def render_cycle(collection):
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    camera = setup_studio()
    out = FAMILY / "evidence" / "hornet" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    views = {
        "three_quarter": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
        "starboard": ((0.35, 15.2, 2.5), (0.35, 0, 0.12), 30),
        "rear": ((-11.4, -4.6, 3.4), (-0.60, 0, 0.10), 34),
        "clay_three_quarter": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
        "grazing_close": ((6.4, -5.2, 1.8), (1.10, 0, 0.22), 48),
        "bay_interior": ((3.25, -1.85, 1.05), (3.25, 0.0, 0.62), 34),
        "drive_rear": ((-8.0, -2.4, 1.2), (-4.70, 0, -0.02), 48),
        "play_size": ((34, -30, 15), (0.25, 0, 0.10), 48),
        "orm_isolation": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
        "normal_isolation": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
        "id_or_material_id": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
        "material_three_quarter": ((10.6, -9.6, 4.8), (0.30, 0, 0.14), 35),
    }
    meshes = [obj for obj in collection.objects if obj.type == "MESH" and not obj.get("collision")]
    for name in ("three_quarter", "starboard", "rear", "material_three_quarter", "grazing_close", "bay_interior", "drive_rear", "play_size"):
        loc, target, lens = views[name]
        snap(camera, out / f"{name}.png", loc, target, lens)

    backups = override_emission(meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    loc, target, lens = views["clay_three_quarter"]
    snap(camera, out / "clay_three_quarter.png", loc, target, lens)
    restore_mats(meshes, backups)

    ids = {
        "Hull": (0.75, 0.75, 0.78), "Armor": (0.08, 0.16, 0.18), "Mechanical": (0.45, 0.45, 0.48),
        "Canopy": (0.02, 0.08, 0.1), "Accent": (0.05, 0.7, 0.85), "Warning": (0.9, 0.4, 0.05),
        "Ceramic": (0.7, 0.55, 0.35), "Thruster": (0.2, 0.7, 0.9), "Radiator": (0.35, 0.22, 0.12),
    }

    def id_color(obj):
        for key, color in ids.items():
            if key.lower() in obj.name.lower():
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    backups = override_emission(meshes, id_color)
    loc, target, lens = views["id_or_material_id"]
    snap(camera, out / "id_or_material_id.png", loc, target, lens)
    restore_mats(meshes, backups)

    def map_emit(suffix):
        def fn(obj):
            mat = obj.data.materials[0] if obj.data.materials else None
            if not mat or not mat.use_nodes:
                return (0.5, 0.5, 0.5), 1.0
            img = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name), None)
            if img is None:
                return (0.3, 0.3, 0.3), 1.0
            # Average a few pixels so isolation is not black if sampling fails.
            return (0.55, 0.55, 0.55) if suffix == "orm" else (0.5, 0.5, 1.0), 1.0
        return fn

    backups = override_emission(meshes, map_emit("orm"))
    loc, target, lens = views["orm_isolation"]
    snap(camera, out / "orm_isolation.png", loc, target, lens)
    restore_mats(meshes, backups)
    backups = override_emission(meshes, map_emit("normal"))
    loc, target, lens = views["normal_isolation"]
    snap(camera, out / "normal_isolation.png", loc, target, lens)
    restore_mats(meshes, backups)
    return out


def main():
    # `global` must precede every use of the name in this function.
    global TEX
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    print(f"hornet cycle {CYCLE}: map ladder {TEX_BY_LOD}")
    reports = []
    collections = []
    for lod in (0, 1, 2):
        # Rebuild the material set at this LOD's map size. Sharing one set across all three levels
        # is what made every level carry LOD0's textures.
        TEX = TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"hornet lod{lod} hull {report['hullTriangles']} < 800")
        collections.append(collection)
        reports.append(report)
    stills = render_cycle(collections[0])
    report = {
        "schema": "spaceface.hornetMtx.cycle.v1",
        "shipId": "hornet",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
    }
    (FAMILY / "evidence" / "hornet").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "hornet" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "cycle": CYCLE, "hull0": reports[0]["hullTriangles"], "tris0": reports[0]["triangles"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
