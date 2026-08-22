"""PQ-049.01 Massline express-liner source builder.

Civic pressure-drum liner, not a Mule rename and not a Lark courier.
Chase-camera evidence only. No seats. No studio three-quarter cycle stills.

Run from repo root. Do not pass --cycle (Blender steals it as --cycles-*). Use:

  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python ^
    assets/ships/massline_express_liner_v1/scripts/build_massline_express_liner_v1.py -- --mtx-cycle=14
"""
from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
import time
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

SCRIPT = Path(__file__).resolve()
FAMILY = SCRIPT.parents[1]
ROOT = SCRIPT.parents[4]
TOOLS = ROOT / "tools" / "blender"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from fleet_construction import (  # noqa: E402
    add_corner_fasteners,
    add_folded_sheet,
    add_service_pipe,
    add_tapered_vane,
    apply_modifiers,
    boolean_cut_box,
    boolean_cut_cylinder,
    boolean_union,
    cut_open_bay,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

TEX_DIR = FAMILY / "source" / "textures"
TEX_BY_LOD = {0: 512, 1: 256, 2: 128}
TEX = 512
CYCLE = 1
for i, tok in enumerate(sys.argv):
    if tok.startswith("--cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--cycle" and i + 1 < sys.argv:
        CYCLE = int(sys.argv[i + 1])
    elif tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < sys.argv:
        CYCLE = int(sys.argv[i + 1])

ASSET_ID = "SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1"
PART_ID = "massline_express_liner_v1"
SHADE_ANGLE = 28.0
BEVEL_HULL = 0.018
BEVEL_FRAME = 0.008


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for bucket in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.cameras, bpy.data.lights, bpy.data.images,
    ):
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
    tmp = TEX_DIR / f"{name}.tmp.png"
    img.file_format = "PNG"
    last_error = None
    for attempt in range(8):
        try:
            img.filepath_raw = str(tmp)
            img.save()
            if path.exists():
                try:
                    path.unlink()
                except OSError:
                    time.sleep(0.25 * (attempt + 1))
                    path.unlink()
            tmp.replace(path)
            img.filepath_raw = str(path)
            img.pack()
            return img
        except Exception as exc:
            last_error = exc
            time.sleep(0.35 * (attempt + 1))
    raise last_error


def role_maps(role, rgb, size=TEX, prefix=None):
    """Unique civic maps. Not a Lark/Mule/Wasp tint."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    if role == "ceramic":
        pw, ph = 96, 64
    elif role == "frame":
        pw, ph = 28, 14
    elif role == "primer":
        pw, ph = 40, 22
    elif role == "keel":
        pw, ph = 22, 10
    elif role == "refractory":
        pw, ph = 48, 48
    elif role == "glass":
        pw, ph = 0, 0
    else:
        pw, ph = 0, 0
    for y in range(size):
        for x in range(size):
            gf = h01(x, y, 19)
            gf2 = h01(x // 3, y // 3, 47)
            if pw == 0:
                dx = dy = 99
                seam = soft = 0.0
            else:
                dx = min(x % pw, pw - (x % pw))
                dy = min(y % ph, ph - (y % ph))
                seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
                soft = max(0.0, 1.0 - min(dx, dy) / 3.0) if min(dx, dy) <= 3 else 0.0
            edge = 1.0 if pw and (dx <= 2 or dy <= 2) else 0.0
            dirt = min(1.0, soft * 0.22 + seam * 0.12 + gf2 * 0.06)
            stencil = 0.0
            if role == "ceramic" and 70 <= x <= 210 and 180 <= y <= 300:
                col, row = x - 70, y - 180
                if 20 <= col <= 48 and abs(row - 60) <= 7:
                    stencil = 0.62
                if 52 <= col <= 88 and abs((row - 60) - (col - 52) * 0.7) <= 6:
                    stencil = 0.55
                if gf > 0.92:
                    stencil *= 0.28
            if role == "ceramic":
                chip = 1.0 if gf > 0.955 and (x < 90 or y > size - 70) else 0.0
                r = max(0, min(1, br * (1.0 - dirt * 0.10) + chip * 0.10))
                g = max(0, min(1, bg * (1.0 - dirt * 0.08) + chip * 0.06))
                b = max(0, min(1, bb * (1.0 - dirt * 0.06) + chip * 0.04))
                if stencil:
                    r = r * (1 - stencil) + 0.12 * stencil
                    g = g * (1 - stencil) + 0.13 * stencil
                    b = b * (1 - stencil) + 0.15 * stencil
                rough = 0.46 + dirt * 0.12 - edge * 0.03
                metal = 0.02 + chip * 0.42
            elif role == "frame":
                brush = abs(math.sin((x + y * 0.15) * 0.42)) * 0.08
                r = max(0, min(1, br * (0.92 + gf * 0.10) + brush))
                g = max(0, min(1, bg * (0.92 + gf * 0.08) + brush * 0.7))
                b = max(0, min(1, bb * (0.94 + gf * 0.06)))
                rough = 0.32 + dirt * 0.16 + brush
                metal = 0.86 + edge * 0.08
            elif role == "primer":
                flake = 0.08 * gf2
                r = max(0, min(1, br * (0.90 + gf * 0.08) + flake))
                g = max(0, min(1, bg * (0.88 + gf * 0.08) + flake * 0.6))
                b = max(0, min(1, bb * (0.84 + gf * 0.06)))
                rough = 0.58 + dirt * 0.14
                metal = 0.18 + edge * 0.10
            elif role == "keel":
                brush = abs(math.sin(x * 0.55)) * 0.10
                r = max(0, min(1, br * (0.88 + gf * 0.12) + brush * 0.4))
                g = max(0, min(1, bg * (0.88 + gf * 0.10)))
                b = max(0, min(1, bb * (0.90 + gf * 0.08)))
                rough = 0.28 + dirt * 0.18
                metal = 0.92
            elif role == "refractory":
                heat = max(0.0, 0.62 - x / size) * 0.34
                grain = gf2 * 0.16
                r = max(0, min(1, br * (0.86 + grain) + heat * 0.30))
                g = max(0, min(1, bg * (0.80 + grain * 0.5) + heat * 0.08))
                b = max(0, min(1, bb * (0.72 - heat * 0.10)))
                rough = 0.64 + dirt * 0.12 + grain
                metal = 0.04
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal = 0.08, 0.02
            elif role == "cyan":
                pulse = 0.78 + 0.22 * math.sin(x * 0.04)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal = 0.22, 0.06
            elif role == "amber":
                r, g, b = br, bg, bb
                rough, metal = 0.36, 0.04
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.48, 0.12
            ao = max(0.22, 1.0 - seam * 0.28 - dirt * 0.16 - soft * 0.10)
            nx = 0.5 + (0.08 if edge else 0.02) * (0.5 - (dx / max(1, pw)))
            ny = 0.5 + (0.08 if edge else 0.02) * (0.5 - (dy / max(1, ph)))
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.05, min(0.94, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((nx, ny, 1.0, 1.0))
    base = write_pixels(f"liner_{prefix}_{size}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"liner_{prefix}_{size}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"liner_{prefix}_{size}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def wire_maps(material, bsdf, maps, coat=0.0, emission=None, transmission=0.0):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    uv0 = nodes.new("ShaderNodeUVMap")
    uv0.uv_map = "UVMap"
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
    nmap.inputs["Strength"].default_value = 0.22
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.12
    if emission:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]
    if transmission and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        if "IOR" in bsdf.inputs:
            bsdf.inputs["IOR"].default_value = 1.48


def create_materials():
    specs = {
        "Material_Hull": ((0.96, 0.90, 0.78), "ceramic", 0.08, None, 0.0, "ceramic"),
        "Material_Armor": ((0.12, 0.13, 0.14), "frame", 0.04, None, 0.0, "frame"),
        "Material_Mechanical": ((0.055, 0.058, 0.062), "keel", 0.0, None, 0.0, "keel"),
        "Material_Canopy": ((0.018, 0.028, 0.032), "glass", 0.18, None, 0.0, "glass"),
        "Material_Radiator": ((0.40, 0.42, 0.38), "primer", 0.0, None, 0.0, "primer"),
        "Material_Ceramic": ((0.30, 0.24, 0.18), "refractory", 0.0, None, 0.0, "refractory"),
        "Material_Accent": ((0.08, 0.52, 0.56), "cyan", 0.0, ((0.10, 0.62, 0.66), 0.55), 0.0, "cyan"),
        "Material_Warning": ((0.74, 0.44, 0.12), "amber", 0.0, ((0.78, 0.42, 0.10), 0.35), 0.0, "amber"),
        "Material_Thruster": ((0.04, 0.05, 0.06), "keel", 0.0, None, 0.0, "throat"),
    }
    mats = {}
    for name, (rgb, role, coat, emit, trans, prefix) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        if name == "Material_Hull":
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 0.50
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.03
            if "Coat Weight" in bsdf.inputs and coat > 0:
                bsdf.inputs["Coat Weight"].default_value = coat
        else:
            maps = role_maps(role, rgb, prefix=prefix)
            wire_maps(material, bsdf, maps, coat=coat, emission=emit, transmission=trans)
        material["spacefaceRole"] = role
        if name == "Material_Canopy":
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.0
            if "Alpha" in bsdf.inputs:
                bsdf.inputs["Alpha"].default_value = 1.0
            try:
                material.blend_method = "OPAQUE"
            except Exception:
                pass
            if hasattr(material, "use_screen_refraction"):
                material.use_screen_refraction = False
        mats[name] = material
    return mats


def link_object(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    return obj


def finish_mesh(obj, material, bevel=0.012):
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


def add_box(name, loc, scale, material, collection, bevel=0.012, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=16, bevel=0.008, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_empty(name, loc, collection, parent=None):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.location = loc
    obj.empty_display_size = 0.18
    if parent is not None:
        obj.parent = parent
    return obj


def loft_from_rings(name, rings, material, collection, bevel, cap=True):
    sides = len(rings[0])
    verts = [vert for ring in rings for vert in ring]
    faces = []
    if cap is True or cap == "both":
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
    elif cap == "front":
        faces.append(tuple(range(sides - 1, -1, -1)))
    elif cap == "aft":
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


def civic_pressure_ring(x, yc, zc, hw, hh, crown=0.55, wall=0.72, belly=0.35):
    """12-point civic pressure station with a flat deck the chase camera can see.

    Mid station must change crown/wall/belly, not just hw/hh. Not a regular pipe.
    """
    crown = max(0.0, min(1.0, float(crown)))
    wall = max(0.0, min(1.0, float(wall)))
    belly = max(0.0, min(1.0, float(belly)))
    deck_half = hw * (0.42 + 0.46 * crown)
    deck_z = zc + hh * (0.78 + 0.16 * crown)
    wall_z = zc + hh * (0.28 + 0.12 * wall)
    chine_y = hw
    chine_z = zc + hh * (0.04 - 0.14 * wall)
    lower_y = hw * (0.82 - 0.08 * wall)
    lower_z = zc - hh * (0.22 + 0.10 * belly)
    belly_y = hw * (0.28 + 0.40 * belly)
    belly_z = zc - hh * (0.68 + 0.14 * belly)
    keel_z = zc - hh
    return [
        (x, yc - deck_half, deck_z),
        (x, yc - deck_half * 0.50, deck_z),
        (x, yc, deck_z),
        (x, yc + deck_half * 0.50, deck_z),
        (x, yc + deck_half, deck_z),
        (x, yc + hw * (0.88 + 0.06 * wall), wall_z + hh * 0.18),
        (x, yc + hw * (0.78 + 0.10 * wall), wall_z),
        (x, yc + chine_y, chine_z),
        (x, yc + lower_y, lower_z),
        (x, yc + belly_y, belly_z),
        (x, yc, keel_z),
        (x, yc - belly_y, belly_z),
        (x, yc - lower_y, lower_z),
        (x, yc - chine_y, chine_z),
        (x, yc - hw * (0.78 + 0.10 * wall), wall_z),
        (x, yc - hw * (0.88 + 0.06 * wall), wall_z + hh * 0.18),
    ]


def regular_ring(x, y, z, radius, sides=8):
    return [
        (x, y + math.cos(math.tau * i / sides) * radius, z + math.sin(math.tau * i / sides) * radius)
        for i in range(sides)
    ]


def inset_large_faces(obj, thickness=0.045, depth=0.016, min_area=0.55):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    faces = [face for face in bm.faces if face.calc_area() >= min_area]
    if faces:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0004)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    finish_mesh(obj, obj.data.materials[0], bevel=0.010)


def add_curve_hose(name, points, material, collection, radius=0.022):
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
    return finish_mesh(obj, material, bevel=0.002)


def try_cut_bay(hull, tag, surface, length, width, depth, outward, mats, collection, kit="empty"):
    try:
        cut_open_bay(hull, tag, surface, length, width, depth, outward, mats, collection, kit=kit, liner=True)
        return True
    except Exception as exc:
        print(f"bay skip {tag}: {exc}")
        return False


def add_boarding_glass(mats, collection):
    """Solid framed boarding house on the forward deck. Opaque smoked panes, no hull hole."""
    glass, frame = mats["Material_Canopy"], mats["Material_Armor"]
    house = []
    for x, half, z_deck, z_roof in (
        (15.85, 1.12, 0.95, 1.88),
        (14.05, 1.72, 1.28, 2.35),
        (12.15, 2.05, 1.62, 2.62),
        (10.05, 1.78, 1.95, 2.72),
    ):
        house.append([
            (x, -half, z_deck),
            (x, -half * 0.55, z_roof),
            (x, half * 0.55, z_roof),
            (x, half, z_deck),
        ])
    shell = loft_from_rings("Board_Glass", house, glass, collection, 0.004, cap="both")
    add_box("Board_Floor", (12.95, 0.0, 1.42), (2.85, 1.92, 0.070), frame, collection, 0.004)
    add_box("Board_Sill", (12.95, 0.0, 1.58), (2.75, 2.05, 0.055), frame, collection, 0.004)
    add_box("Board_Brow", (15.72, 0.0, 1.52), (0.16, 1.15, 0.52), frame, collection, 0.003)
    add_box("Board_AftFrame", (10.12, 0.0, 2.38), (0.16, 1.88, 0.42), frame, collection, 0.003)
    add_box("Board_RailP", (12.95, -2.02, 2.12), (2.55, 0.070, 0.26), frame, collection, 0.002)
    add_box("Board_RailS", (12.95, 2.02, 2.12), (2.55, 0.070, 0.26), frame, collection, 0.002)
    add_box("Board_Mullion", (12.95, 0.0, 2.28), (0.070, 1.72, 0.22), frame, collection, 0.002)
    add_box("Board_MullionFore", (14.45, 0.0, 2.02), (0.055, 1.38, 0.18), frame, collection, 0.002)
    return shell


def add_dorsal_spine(lod, mats, collection):
    """One lofted hat-section ridge. Not three boxes on a tube."""
    frame, primer, mech = mats["Material_Armor"], mats["Material_Radiator"], mats["Material_Mechanical"]
    hat = []
    for x, half, z_deck, z_top in (
        (6.40, 0.95, 3.05, 3.62),
        (2.20, 1.15, 3.22, 3.82),
        (-2.40, 1.05, 3.10, 3.68),
        (-6.80, 0.82, 2.55, 3.05),
    ):
        hat.append([
            (x, -half, z_deck),
            (x, -half * 0.42, z_top),
            (x, half * 0.42, z_top),
            (x, half, z_deck),
        ])
    loft_from_rings("Spine_Hat", hat, frame, collection, 0.006, cap="both")
    add_folded_sheet(
        "Spine_CheekP",
        (6.20, -1.12, 2.85), (-6.40, -0.88, 2.35),
        (-6.40, -0.62, 2.95), (6.20, -0.78, 3.45),
        0.032, primer, collection, 0.003,
    )
    add_folded_sheet(
        "Spine_CheekS",
        (6.20, 1.12, 2.85), (6.20, 0.78, 3.45),
        (-6.40, 0.62, 2.95), (-6.40, 0.88, 2.35),
        0.032, primer, collection, 0.003,
    )
    add_box("Spine_FeedAft", (-10.4, 0.0, 1.85), (1.65, 0.22, 0.14), mech, collection, 0.004)
    if lod == 0:
        add_box("Spine_RootFore", (4.8, 0.0, 3.05), (0.32, 0.24, 0.10), mech, collection, 0.003)
        add_box("Spine_RootAft", (-4.6, 0.0, 2.85), (0.32, 0.22, 0.10), mech, collection, 0.003)


def add_service_cassette(lod, mats, collection):
    primer, mech = mats["Material_Radiator"], mats["Material_Mechanical"]
    loft_from_rings("Cassette_Body", [
        civic_pressure_ring(6.8, 0, -2.95, 2.05, 0.48, crown=0.88, wall=0.96, belly=0.82),
        civic_pressure_ring(1.2, 0, -3.08, 2.35, 0.55, crown=0.92, wall=0.96, belly=0.88),
        civic_pressure_ring(-3.6, 0, -3.02, 2.15, 0.50, crown=0.88, wall=0.95, belly=0.84),
        civic_pressure_ring(-7.4, 0, -2.82, 1.55, 0.38, crown=0.78, wall=0.94, belly=0.72),
    ], primer, collection, 0.006, cap="both")
    add_box("Cassette_Seam", (1.15, 0.0, -2.48), (0.045, 1.85, 0.10), mech, collection, 0.002)
    if lod == 0:
        add_box("Cassette_BayA", (4.2, 0.0, -2.42), (1.55, 1.15, 0.045), primer, collection, 0.003)
        add_box("Cassette_BayB", (-2.4, 0.0, -2.42), (1.45, 1.05, 0.045), primer, collection, 0.003)
        for name, loc in (("LatchA", (3.15, 0.72, -2.38)), ("LatchB", (3.15, -0.72, -2.38)),
                          ("LatchC", (-1.15, 0.68, -2.38)), ("LatchD", (-1.15, -0.68, -2.38))):
            add_box(name, loc, (0.12, 0.055, 0.038), mech, collection, 0.002)


def add_keel_and_saddle(lod, mats, collection):
    keel, frame = mats["Material_Mechanical"], mats["Material_Armor"]
    loft_from_rings("Keel_Beam", [
        civic_pressure_ring(8.4, 0, -2.55, 0.42, 0.34, crown=0.18, wall=0.96, belly=0.90),
        civic_pressure_ring(1.4, 0, -3.22, 0.68, 0.58, crown=0.12, wall=0.96, belly=0.94),
        civic_pressure_ring(-4.2, 0, -3.15, 0.62, 0.52, crown=0.12, wall=0.96, belly=0.92),
        civic_pressure_ring(-12.2, 0, -2.15, 0.38, 0.28, crown=0.10, wall=0.95, belly=0.84),
    ], keel, collection, 0.006, cap="both")
    add_folded_sheet(
        "Saddle_CheekP",
        (1.35, -1.05, -3.55), (-0.55, -1.05, -3.55),
        (-0.25, -0.28, -2.45), (1.05, -0.28, -2.45),
        0.055, keel, collection, 0.004,
    )
    add_folded_sheet(
        "Saddle_CheekS",
        (1.35, 1.05, -3.55), (1.05, 0.28, -2.45),
        (-0.25, 0.28, -2.45), (-0.55, 1.05, -3.55),
        0.055, keel, collection, 0.004,
    )
    add_box("Saddle_Pad", (0.35, 0.0, -3.62), (0.92, 0.58, 0.075), keel, collection, 0.004)
    add_folded_sheet(
        "Saddle_GussetP",
        (1.10, -0.28, -2.55), (-0.18, -0.28, -2.55),
        (-0.62, -0.88, -3.42), (1.40, -0.88, -3.42),
        0.030, frame, collection, 0.003,
    )
    add_folded_sheet(
        "Saddle_GussetS",
        (1.10, 0.28, -2.55), (1.40, 0.88, -3.42),
        (-0.62, 0.88, -3.42), (-0.18, 0.28, -2.55),
        0.030, frame, collection, 0.003,
    )
    add_cylinder("Saddle_Pin", (0.35, 0.0, -3.42), 0.080, 0.32, frame, collection, 10, 0.002, (0, 0, 0))
    if lod == 0:
        add_corner_fasteners("Saddle", (0.35, 0.0, -3.52), (0.62, 0.40, 0.025), frame, collection)


def add_drive_root_cheek(tag, y, mats, collection):
    """Solid cheek from the wide aft drum into the boom. Same ceramic as the drum."""
    sign = 1.0 if y > 0 else -1.0
    hull = mats["Material_Hull"]
    rings = []
    for x, inner, outer, z0, z1 in (
        (-10.20, 1.05, 4.55, -0.95, 1.72),
        (-12.80, 1.35, 4.45, -0.78, 1.58),
        (-15.40, 1.65, 4.15, -0.48, 1.28),
        (-16.80, 1.85, 3.85, -0.28, 1.05),
    ):
        rings.append([
            (x, sign * inner, z0),
            (x, sign * outer, z0),
            (x, sign * outer, z1),
            (x, sign * inner, z1),
        ])
    return loft_from_rings(f"DriveCheek_{tag}", rings, hull, collection, 0.010, cap="both")


def add_civic_drive(tag, y, lod, mats, collection):
    """Octagonal civic boom buried in the wide aft drum. Hull ceramic, dark throat only."""
    hull, frame, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    refractory, core = mats["Material_Ceramic"], mats["Material_Accent"]
    z = 0.42
    x0 = -13.20
    boom = loft_from_rings(f"Boom_{tag}", [
        regular_ring(x0 + 2.40, y, z, 1.95, 8),
        regular_ring(x0 + 0.40, y, z, 1.72, 8),
        regular_ring(x0 - 1.40, y, z, 1.48, 8),
        regular_ring(x0 - 3.20, y, z, 1.28, 8),
        regular_ring(x0 - 5.10, y, z, 1.08, 8),
    ], hull, collection, 0.010, cap="both")
    loft_from_rings(f"Liner_{tag}", [
        regular_ring(x0 - 4.35, y, z, 0.40, 12),
        regular_ring(x0 - 4.85, y, z, 0.52, 12),
        regular_ring(x0 - 5.25, y, z, 0.64, 12),
    ], refractory, collection, 0.003, cap=False)
    add_cylinder(f"ThroatRim_{tag}", (x0 - 5.15, y, z), 0.82, 0.10, mech, collection, 16, 0.003)
    add_cylinder(f"Core_{tag}", (x0 - 4.55, y, z), 0.11, 0.14, core, collection, 12, 0.002)
    add_cylinder(f"Flange_{tag}", (x0 + 0.55, y, z), 1.62, 0.22, mech, collection, 16, 0.006)
    add_box(f"BoomRoot_{tag}", (x0 + 1.35, y * 0.48, z - 0.06), (1.15, 0.55, 0.38), mech, collection, 0.004)
    add_box(f"BoomSaddle_{tag}", (x0 + 0.85, y, z - 0.85), (0.85, 0.32, 0.24), frame, collection, 0.003)
    if lod <= 1:
        for index in range(8):
            ang = math.tau * index / 8
            add_box(
                f"Clamp_{tag}_{index}",
                (x0 - 0.10, y + math.cos(ang) * 1.38, z + math.sin(ang) * 1.38),
                (0.060, 0.045, 0.032),
                mech, collection, 0.002, (0, 0, ang),
            )
    if lod == 0:
        for index in range(10):
            add_tapered_vane(
                f"Vane_{tag}_{index}", (x0 - 3.05, y, z), refractory, collection,
                math.tau * index / 10, scale=0.88,
            )
    return boom


def add_dock_hardware(tag, loc, mats, collection, lod, cyan=True):
    frame, hull, accent = mats["Material_Armor"], mats["Material_Hull"], (
        mats["Material_Accent"] if cyan else mats["Material_Warning"]
    )
    x, y, z = loc
    sign = 1.0 if y > 0 else -1.0
    add_box(f"Dock_Jamb_{tag}", (x, y, z), (1.45, 0.09, 0.95), frame, collection, 0.004)
    add_box(f"Dock_Frame_{tag}", (x, y + 0.07 * sign, z), (1.58, 0.045, 1.05), frame, collection, 0.003)
    add_box(f"Dock_Plate_{tag}", (x + 0.78, y + 0.03 * sign, z - 0.04), (0.22, 0.045, 0.28), mats["Material_Radiator"], collection, 0.002)
    add_cylinder(f"Dock_Lamp_{tag}", (x, y + 0.10 * sign, z + 0.28), 0.036, 0.05, accent, collection, 10, 0.001, (math.pi / 2, 0, 0))
    if lod == 0:
        for i, (ox, oz) in enumerate(((-0.72, -0.48), (-0.72, 0.48), (0.72, -0.48), (0.72, 0.48))):
            add_cylinder(
                f"Dock_Bolt_{tag}_{i}",
                (x + ox, y + 0.08 * sign, z + oz),
                0.016, 0.034, mats["Material_Mechanical"], collection, 6, 0.001, (math.pi / 2, 0, 0),
            )


def sockets():
    return {
        "SOCKET_Weapon_Front": (15.2, 0.0, 0.35),
        "SOCKET_Engine_Main": (-17.8, 0.0, 0.35),
        "SOCKET_Trail_Main": (-18.0, 0.0, 0.35),
        "SOCKET_Trail_Port": (-18.6, -2.65, 0.42),
        "SOCKET_Trail_Starboard": (-18.6, 2.65, 0.42),
        "SOCKET_Utility_Dorsal": (0.4, 0.0, 3.82),
        "SOCKET_Cargo_Ventral": (0.35, 0.0, -3.62),
        "SOCKET_Camera_Focus": (0.4, 0.0, 0.30),
        "SOCKET_RCS_Port": (9.5, -4.20, 0.80),
        "SOCKET_RCS_Starboard": (9.5, 4.20, 0.80),
        "SOCKET_Dock_Port": (3.20, -5.15, 0.30),
        "SOCKET_Service_Starboard": (-2.00, 5.05, 0.30),
        "SOCKET_Tether_Keel": (0.35, 0.0, -3.62),
    }


def shade_and_uv(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    apply_modifiers(obj)
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(SHADE_ANGLE))
    except Exception:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.cube_project(cube_size=6.0, correct_aspect=True, scale_to_bounds=True)
    except Exception:
        bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.016, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers.active
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 7.0
    obj.select_set(False)


def drum_stations(lod):
    """Stepped civic drum. Aft stays as wide as the drive roots so they cannot float."""
    if lod >= 2:
        return [
            civic_pressure_ring(16.55, 0, 0.12, 1.15, 0.95, crown=0.12, wall=0.18, belly=0.12),
            civic_pressure_ring(11.40, 0, 0.22, 3.65, 2.25, crown=0.55, wall=0.58, belly=0.38),
            civic_pressure_ring(0.20, 0, 0.28, 5.05, 2.85, crown=0.92, wall=0.88, belly=0.55),
            civic_pressure_ring(-8.40, 0, 0.22, 4.35, 2.55, crown=0.70, wall=0.86, belly=0.42),
            civic_pressure_ring(-16.40, 0, 0.18, 4.55, 2.35, crown=0.38, wall=0.82, belly=0.28),
        ]
    return [
        civic_pressure_ring(16.55, 0, 0.12, 1.18, 0.98, crown=0.10, wall=0.16, belly=0.12),
        civic_pressure_ring(14.20, 0, 0.18, 2.45, 1.55, crown=0.28, wall=0.32, belly=0.22),
        civic_pressure_ring(11.40, 0, 0.22, 3.65, 2.25, crown=0.55, wall=0.58, belly=0.38),
        civic_pressure_ring(5.40, 0, 0.26, 4.85, 2.72, crown=0.82, wall=0.86, belly=0.50),
        civic_pressure_ring(0.20, 0, 0.28, 5.05, 2.85, crown=0.92, wall=0.88, belly=0.55),
        civic_pressure_ring(-5.20, 0, 0.24, 4.75, 2.68, crown=0.78, wall=0.86, belly=0.48),
        civic_pressure_ring(-8.80, 0, 0.22, 4.25, 2.48, crown=0.62, wall=0.84, belly=0.40),
        civic_pressure_ring(-12.80, 0, 0.20, 4.65, 2.42, crown=0.42, wall=0.84, belly=0.32),
        civic_pressure_ring(-16.40, 0, 0.18, 4.55, 2.35, crown=0.36, wall=0.82, belly=0.28),
    ]


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"LINER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, frame, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    root = add_empty(f"LINER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": ASSET_ID, "partId": PART_ID, "lod": f"lod{lod}",
        "slot": "hull", "category": "wholeships", "forward": "+X", "embeddedPlume": False,
        "role": "civic_pressure_drum_liner",
    }
    hull_obj = loft_from_rings("Pressure_Drum", drum_stations(lod), hull, collection, BEVEL_HULL, cap="both")
    if lod <= 1:
        try_cut_bay(hull_obj, "PortDock", (3.40, -4.85, 0.28), 2.40, 1.35, 0.42, (0, -1, 0), mats, collection, "empty")
        try_cut_bay(hull_obj, "StbdService", (-2.20, 4.75, 0.28), 2.10, 1.22, 0.40, (0, 1, 0), mats, collection, "empty")
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull)
        add_boarding_glass(mats, collection)
        add_dock_hardware("Port", (3.20, -5.15, 0.32), mats, collection, lod, cyan=True)
        add_dock_hardware("Stbd", (-2.00, 5.05, 0.32), mats, collection, lod, cyan=False)
        add_dorsal_spine(lod, mats, collection)
        add_box("RadPanel_Fore", (1.60, 0.0, 3.22), (1.35, 0.42, 0.055), mats["Material_Radiator"], collection, 0.003)
        add_box("RadPanel_Aft", (-5.00, 0.0, 2.95), (1.15, 0.36, 0.050), mats["Material_Radiator"], collection, 0.003)
        loft_from_rings("Bulk_Fore", [
            civic_pressure_ring(11.28, 0, 0.22, 3.72, 2.30, crown=0.55, wall=0.58, belly=0.38),
            civic_pressure_ring(11.42, 0, 0.22, 3.72, 2.30, crown=0.55, wall=0.58, belly=0.38),
        ], frame, collection, 0.004, cap="both")
        loft_from_rings("Bulk_Aft", [
            civic_pressure_ring(-8.72, 0, 0.22, 4.28, 2.50, crown=0.62, wall=0.84, belly=0.40),
            civic_pressure_ring(-8.86, 0, 0.22, 4.28, 2.50, crown=0.62, wall=0.84, belly=0.40),
        ], frame, collection, 0.004, cap="both")
        loft_from_rings("Bulk_Drive", [
            civic_pressure_ring(-12.72, 0, 0.20, 4.68, 2.44, crown=0.42, wall=0.84, belly=0.32),
            civic_pressure_ring(-12.86, 0, 0.20, 4.68, 2.44, crown=0.42, wall=0.84, belly=0.32),
        ], frame, collection, 0.004, cap="both")
    add_service_cassette(lod, mats, collection)
    add_keel_and_saddle(lod, mats, collection)
    boom_p = add_civic_drive("Port", -2.65, lod, mats, collection)
    boom_s = add_civic_drive("Stbd", 2.65, lod, mats, collection)
    cheek_p = add_drive_root_cheek("Port", -2.65, mats, collection)
    cheek_s = add_drive_root_cheek("Stbd", 2.65, mats, collection)
    fair_p = add_box("BoomFairing_Port", (-13.4, -1.85, 0.38), (3.15, 1.15, 0.85), hull, collection, 0.010)
    fair_s = add_box("BoomFairing_Stbd", (-13.4, 1.85, 0.38), (3.15, 1.15, 0.85), hull, collection, 0.010)
    transom = add_box("Transom", (-16.52, 0.0, 0.18), (0.12, 3.85, 1.55), hull, collection, 0.004)
    nose = add_box("NoseCap", (16.68, 0.0, 0.22), (0.14, 0.72, 0.55), hull, collection, 0.003)
    for donor in (cheek_p, cheek_s, boom_p, boom_s, fair_p, fair_s, transom, nose):
        boolean_union(hull_obj, donor)
    for tag, y in (("Port", -2.65), ("Stbd", 2.65)):
        try:
            boolean_cut_cylinder(hull_obj, f"ThroatCut_{tag}", (-17.95, y, 0.42), 0.52, 1.05, vertices=16)
        except Exception as exc:
            print(f"throat cut skip {tag}: {exc}")
        try:
            boolean_cut_box(hull_obj, f"BoomWell_{tag}", (-15.55, y, 1.58), (1.05, 0.62, 0.22))
        except Exception as exc:
            print(f"boom well skip {tag}: {exc}")
    if lod == 0:
        add_curve_hose(
            "Service_Hose",
            [(6.4, 0.95, -2.35), (1.2, 1.05, -1.35), (-9.2, 0.72, 0.35), (-16.2, 2.85, 0.42)],
            mech, collection, 0.024,
        )
        add_service_pipe("Feed_P", (-10.2, -0.32, 2.05), (-16.2, -2.65, 0.42), mech, collection, 0.026)
        add_service_pipe("Feed_S", (-10.2, 0.32, 2.05), (-16.2, 2.65, 0.42), mech, collection, 0.026)

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
        merged.append(active)
    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in (
        (17.2, 0, 0.2), (11.2, -2.9, 1.6), (11.2, 2.9, 1.6),
        (0.8, -5.3, 0.3), (0.8, 5.3, 0.3),
        (-16.4, -4.2, 0.2), (-16.4, 4.2, 0.2),
        (-18.6, -2.7, 0.4), (-18.6, 2.7, 0.4),
        (0.35, 0, -3.6), (0.8, 0, 3.3),
    ):
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
    hull_tris = next(
        (sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged if "Hull" in obj.name),
        0,
    )
    return collection, {
        "lod": lod,
        "triangles": sum(sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons) for obj in merged),
        "hullTriangles": hull_tris,
        "draws": len(merged),
        "materials": sorted(groups),
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"{PART_ID}_lod{lod}.glb"
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
            time.sleep(0.35 * (attempt + 1))
    return out


def look_at(obj, target=(0, 0, 0.2)):
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
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.28
    eevee = getattr(scene, "eevee", None)
    if eevee:
        for attr, val in (
            ("use_ssr", True), ("use_ssr_refraction", False),
            ("use_raytracing", False), ("use_shadows", True),
        ):
            if hasattr(eevee, attr):
                try:
                    setattr(eevee, attr, val)
                except Exception:
                    pass
    world = scene.world or bpy.data.worlds.new("LinerWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.070, 0.074, 0.080, 1)
    bg.inputs["Strength"].default_value = 2.05
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (6, 52, 36), 4200, (0.97, 0.98, 1.00), 36),
        ("Fill", (2, 38, 22), 2800, (0.86, 0.90, 0.94), 30),
        ("Top", (2, 6, 34), 1600, (0.92, 0.93, 0.96), 24),
        ("Rim", (-22, -12, 14), 900, (0.78, 0.84, 0.92), 18),
        ("Kick", (-10, 18, -6), 480, (0.74, 0.78, 0.84), 14),
        ("AftFill", (-18, 20, 16), 1100, (0.80, 0.84, 0.90), 20),
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
    camera.data.lens_unit = "MILLIMETERS"
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


def collection_meshes(collection):
    return [obj for obj in collection.all_objects if obj.type == "MESH" and not obj.get("collision")]


def render_cycle(collection):
    for other in bpy.data.collections:
        other.hide_render = other is not collection
    camera = setup_studio()
    out = FAMILY / "evidence" / "massline_express_liner_v1" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    focus = (0.4, 0.0, 0.30)
    render_cycle_chase_stills(camera, out, focus=focus)
    snap(camera, out / "grazing_close.png", (11.2, -9.4, 3.2), (1.6, 0.0, 0.45), 48)
    snap(camera, out / "drive_rear.png", (-24.8, -6.2, 2.8), (-16.4, 0.0, 0.18), 42)
    meshes = collection_meshes(collection)
    backups = override_emission(meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    render_chase_still(camera, out / "clay_play_chase_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    ids = {
        "Hull": (0.76, 0.70, 0.60), "Armor": (0.16, 0.17, 0.20), "Mechanical": (0.10, 0.11, 0.12),
        "Canopy": (0.04, 0.10, 0.12), "Accent": (0.08, 0.55, 0.58), "Warning": (0.78, 0.42, 0.10),
        "Ceramic": (0.42, 0.30, 0.20), "Thruster": (0.08, 0.08, 0.10), "Radiator": (0.40, 0.42, 0.36),
    }

    def id_color(obj):
        for key, color in ids.items():
            if key.lower() in obj.name.lower():
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    def map_emit(suffix):
        def fn(obj):
            mat = obj.data.materials[0] if obj.data.materials else None
            if not mat or not mat.use_nodes:
                return (0.5, 0.5, 0.5), 1.0
            img = next(
                (n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name),
                None,
            )
            if img is None:
                return (0.3, 0.3, 0.3), 1.0
            return (0.55, 0.55, 0.55) if suffix == "orm" else (0.5, 0.5, 1.0), 1.0
        return fn

    backups = override_emission(meshes, map_emit("orm"))
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_emission(meshes, map_emit("normal"))
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    return out


def save_blend():
    path = FAMILY / "blender" / f"{PART_ID}.blend"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return path


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    reports = []
    collections = []
    global TEX
    for lod in (0, 1, 2):
        TEX = TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        })
        collections.append(collection)
        reports.append(report)
        print(f"lod{lod} tris={report['triangles']} hull={report['hullTriangles']} draws={report['draws']}")
    blend = save_blend()
    stills = render_cycle(collections[0])
    evidence = FAMILY / "evidence" / "massline_express_liner_v1"
    evidence.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "spaceface.masslineExpressLiner.cycle.v1",
        "assetId": ASSET_ID,
        "shipId": "massline_express_liner_v1",
        "cycle": CYCLE,
        "blend": str(blend.relative_to(FAMILY)).replace("\\", "/"),
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
        "cameras": {
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading": 0, "fov": 50, "tilt": 60},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading": 90, "fov": 50, "tilt": 60},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading": 0, "fov": 50, "tilt": 60},
        },
        "notes": "Source candidate only. Not wired to traffic, manifests, or partsLibrary.",
    }
    (evidence / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("assetId", "cycle", "stills")}, indent=2))


if __name__ == "__main__":
    main()
