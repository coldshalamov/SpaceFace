"""PQ-049.01 Massline express-liner source builder — cycle 30.

Civic pressure-drum liner, not a Mule rename and not a Lark courier.
Chase-camera evidence only. No seats. No studio three-quarter cycle stills.
Cycle 30 form correction: manufactured 1.8–2.0:1 length-to-beam barrel so
legal abeam occupancy lands in 8–12%. Not a global stretch. Not a saucer.

Run from repo root. Do not pass --cycle (Blender steals it as --cycles-*). Use:

  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python ^
    assets/ships/massline_express_liner_v1/scripts/build_massline_express_liner_v1.py -- --mtx-cycle=30
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
    cut_open_bay,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    FOV_V_DEG,
    PLAY_CHASE_CLOSE_WIDTH_FRAC,
    PLAY_CHASE_WIDTH_FRAC,
    TILT_DEG,
    apply_chase_camera,
    occupancy_in_band,
    render_chase_still,
    render_cycle_chase_stills,
)

TEX_DIR = FAMILY / "source" / "textures"
TEX_BY_LOD = {0: 1024, 1: 512, 2: 256}
TEX = 1024
CYCLE = 30
PROBE_OCCUPANCY = False
RENDER_ONLY = False
for i, tok in enumerate(sys.argv):
    if tok.startswith("--cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])
    elif tok.startswith("--mtx-cycle="):
        CYCLE = int(tok.split("=", 1)[1])
    elif tok == "--mtx-cycle" and i + 1 < len(sys.argv):
        CYCLE = int(sys.argv[i + 1])
    elif tok in ("--probe-occupancy", "--probe"):
        PROBE_OCCUPANCY = True
    elif tok in ("--render-only", "--stills-only"):
        RENDER_ONLY = True

# Cycle 30 manufactured envelope. Metres, +X forward. Not a uniform scale.
# Length ~34.7 m, beam ~19.2 m → L/B ~1.81. Abeam occupancy tracks beam.
DRIVE_Y = 8.05
DRIVE_Z = 0.48
DRIVE_R_FORE = 1.62
DRIVE_R_AFT = 1.12
BOARD_X, BOARD_Z = 11.55, 2.62
MID_HW, MID_HH = 8.15, 3.55

ASSET_ID = "SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1"
PART_ID = "massline_express_liner_v1"
SHADE_ANGLE = 28.0
BEVEL_HULL = 0.018
BEVEL_FRAME = 0.008
BEVEL_HIGH = 0.006
CAGE_INFLATE = 0.055
BAKE_AO_SAMPLES = 8

ROLE_RGB = {
    "ceramic": (0.82, 0.74, 0.62),
    "frame": (0.30, 0.31, 0.34),
    "keel": (0.070, 0.074, 0.080),
    "glass": (0.14, 0.22, 0.26),
    "primer": (0.38, 0.40, 0.34),
    "refractory": (0.58, 0.42, 0.26),
    "cyan": (0.10, 0.58, 0.62),
    "amber": (0.74, 0.44, 0.12),
    "throat": (0.085, 0.090, 0.098),
}


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
    """Unique civic maps. Not a Lark/Mule/Wasp tint. Fallback until unique bake."""
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
            if role == "ceramic":
                chip = 1.0 if gf > 0.955 and (x < 90 or y > size - 70) else 0.0
                r = max(0, min(1, br * (1.0 - dirt * 0.10) + chip * 0.10))
                g = max(0, min(1, bg * (1.0 - dirt * 0.08) + chip * 0.06))
                b = max(0, min(1, bb * (1.0 - dirt * 0.06) + chip * 0.04))
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
            nx = 0.5 + (0.10 if edge else 0.02) * (0.5 - (dx / max(1, pw)))
            ny = 0.5 + (0.10 if edge else 0.02) * (0.5 - (dy / max(1, ph)))
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
    nmap.inputs["Strength"].default_value = 1.0
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
        "Material_Hull": ((0.82, 0.74, 0.62), "ceramic", 0.18, None, 0.0, "ceramic"),
        "Material_Armor": ((0.30, 0.31, 0.34), "frame", 0.04, None, 0.0, "frame"),
        "Material_Mechanical": ((0.070, 0.074, 0.080), "keel", 0.0, None, 0.0, "keel"),
        "Material_Canopy": ((0.14, 0.22, 0.26), "glass", 0.22, None, 0.0, "glass"),
        "Material_Radiator": ((0.38, 0.40, 0.34), "primer", 0.0, None, 0.0, "primer"),
        "Material_Ceramic": ((0.58, 0.42, 0.26), "refractory", 0.0, None, 0.0, "refractory"),
        "Material_Accent": ((0.10, 0.58, 0.62), "cyan", 0.0, ((0.12, 0.64, 0.68), 0.35), 0.0, "cyan"),
        "Material_Warning": ((0.74, 0.44, 0.12), "amber", 0.0, ((0.78, 0.42, 0.10), 0.28), 0.0, "amber"),
        "Material_Thruster": ((0.085, 0.090, 0.098), "throat", 0.0, None, 0.0, "throat"),
    }
    mats = {}
    for name, (rgb, role, coat, emit, trans, prefix) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
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


def loft_hollow(name, outer_rings, inner_rings, material, collection, bevel, close_front=True):
    """Thick-walled open tube. Front may close with an inner bulkhead; the aft mouth stays open."""
    sides = len(outer_rings[0])
    stations = len(outer_rings)
    if len(inner_rings) != stations or len(inner_rings[0]) != sides:
        raise ValueError("loft_hollow rings must match")
    verts = [vert for ring in outer_rings for vert in ring]
    verts.extend(vert for ring in inner_rings for vert in ring)
    inner0 = stations * sides
    faces = []
    for station in range(stations - 1):
        a = station * sides
        b = (station + 1) * sides
        ia = inner0 + a
        ib = inner0 + b
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
            faces.append((ia + j, ia + i, ib + i, ib + j))
    last = (stations - 1) * sides
    inn_last = inner0 + last
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((last + i, last + j, inn_last + j, inn_last + i))
        faces.append((j, i, inner0 + i, inner0 + j))
    if close_front:
        faces.append(tuple(range(inner0 + sides - 1, inner0 - 1, -1)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def civic_pressure_ring(x, yc, zc, hw, hh, crown=0.55, wall=0.72, belly=0.35):
    """12-point civic pressure station with a flat deck the chase camera can see."""
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


def regular_ring(x, y, z, radius, sides=10):
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


def add_boarding_well(hull, lod, mats, collection):
    """Framed open embarkation pit. Chase must see a dark well with rim thickness."""
    glass, frame, cyan, hull_mat = (
        mats["Material_Canopy"], mats["Material_Armor"],
        mats["Material_Accent"], mats["Material_Hull"],
    )
    x, z = BOARD_X, BOARD_Z
    surface = (x, 0.0, z - 0.18)
    try_cut_bay(hull, "BoardWell", surface, 4.20, 3.55, 1.22, (0.0, 0.0, 1.0), mats, collection, "empty")
    add_box("Board_CoamingFore", (x + 2.18, 0.0, z), (0.30, 2.05, 0.16), hull_mat, collection, 0.004)
    add_box("Board_CoamingAft", (x - 2.18, 0.0, z), (0.30, 2.05, 0.16), hull_mat, collection, 0.004)
    add_box("Board_CoamingP", (x, -1.92, z), (2.05, 0.22, 0.16), hull_mat, collection, 0.004)
    add_box("Board_CoamingS", (x, 1.92, z), (2.05, 0.22, 0.16), hull_mat, collection, 0.004)
    add_box("Board_FrameFore", (x + 1.95, 0.0, z - 0.42), (0.08, 1.62, 0.30), frame, collection, 0.002)
    add_box("Board_FrameAft", (x - 1.95, 0.0, z - 0.42), (0.08, 1.62, 0.30), frame, collection, 0.002)
    add_box("Board_FrameP", (x, -1.58, z - 0.42), (1.78, 0.08, 0.30), frame, collection, 0.002)
    add_box("Board_FrameS", (x, 1.58, z - 0.42), (1.78, 0.08, 0.30), frame, collection, 0.002)
    add_box("Board_GlassP", (x, -1.46, z - 0.68), (1.65, 0.018, 0.44), glass, collection, 0.001)
    add_box("Board_GlassS", (x, 1.46, z - 0.68), (1.65, 0.018, 0.44), glass, collection, 0.001)
    add_box("Board_GlassFore", (x + 1.86, 0.0, z - 0.70), (0.018, 1.38, 0.40), glass, collection, 0.001)
    add_box("Board_CyanP", (x, -1.52, z - 0.28), (1.48, 0.035, 0.04), cyan, collection, 0.001)
    add_box("Board_CyanS", (x, 1.52, z - 0.28), (1.48, 0.035, 0.04), cyan, collection, 0.001)
    if lod == 0:
        add_box("Board_Mullion", (x, 0.0, z - 0.58), (0.07, 1.38, 0.10), frame, collection, 0.002)


def add_ops_wedge(hull, mats, collection):
    """Framed operations glass at the bow. Direction, not a black nose cap."""
    glass, frame, hull_mat = mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Hull"]
    try:
        boolean_cut_box(hull, "OpsCut", (15.45, 0.0, 0.82), (1.12, 1.15, 0.78))
    except Exception as exc:
        print(f"ops cut skip: {exc}")
    add_box("Ops_FrameCrown", (15.58, 0.0, 1.32), (0.55, 0.98, 0.06), frame, collection, 0.002)
    add_box("Ops_FrameP", (15.58, -0.88, 0.72), (0.55, 0.06, 0.52), frame, collection, 0.002)
    add_box("Ops_FrameS", (15.58, 0.88, 0.72), (0.55, 0.06, 0.52), frame, collection, 0.002)
    add_box("Ops_Glass", (15.64, 0.0, 0.78), (0.04, 0.82, 0.46), glass, collection, 0.001)
    add_box("Ops_Brow", (15.82, 0.0, 1.42), (0.22, 0.68, 0.08), hull_mat, collection, 0.003)


def add_observation_belt(hull, lod, mats, collection):
    """Dorsal-shoulder glass trenches on the wide barrel. Passenger belt, not a stripe decal."""
    glass, frame = mats["Material_Canopy"], mats["Material_Armor"]
    for tag, y in (("P", -6.55), ("S", 6.55)):
        try:
            boolean_cut_box(hull, f"ObsCut_{tag}", (2.15, y, 3.22), (8.40, 1.05, 0.46))
        except Exception as exc:
            print(f"obs cut skip {tag}: {exc}")
        add_box(f"ObsGlass_{tag}", (2.15, y, 3.04), (8.05, 0.88, 0.048), glass, collection, 0.001)
        add_box(f"ObsRailOut_{tag}", (2.15, y + (0.50 if y > 0 else -0.50), 3.22), (8.20, 0.07, 0.08), frame, collection, 0.002)
        add_box(f"ObsRailIn_{tag}", (2.15, y - (0.50 if y > 0 else -0.50), 3.22), (8.20, 0.07, 0.08), frame, collection, 0.002)
        if lod == 0:
            for i in range(6):
                add_box(
                    f"ObsMull_{tag}_{i}",
                    (-1.35 + i * 1.40, y, 3.04),
                    (0.05, 0.70, 0.06),
                    frame, collection, 0.001,
                )


def add_bulkhead_collar(name, x, hw, hh, mats, collection, crown=0.55, wall=0.78, belly=0.32):
    """Dark anodized join ring. Breaks the sausage in clay."""
    frame = mats["Material_Armor"]
    loft_from_rings(name, [
        civic_pressure_ring(x - 0.16, 0, 0.22, hw * 1.045, hh * 1.035, crown, wall, belly),
        civic_pressure_ring(x + 0.16, 0, 0.22, hw * 1.045, hh * 1.035, crown, wall, belly),
    ], frame, collection, 0.006, cap="both")


def add_dorsal_spine(lod, mats, collection):
    hull, primer, mech = mats["Material_Hull"], mats["Material_Radiator"], mats["Material_Mechanical"]
    covers = (
        ((7.20, 1.85, 3.55, 4.02), (3.40, 2.05, 3.78, 4.22)),
        ((2.40, 2.12, 3.85, 4.28), (-1.20, 1.92, 3.62, 4.02)),
        ((-2.40, 1.72, 3.38, 3.72), (-6.40, 1.28, 2.72, 3.08)),
    )
    for index, ((x0, h0, d0, t0), (x1, h1, d1, t1)) in enumerate(covers):
        hat = loft_from_rings(f"Spine_Hat_{index}", [
            [(x0, -h0, d0), (x0, -h0 * 0.38, t0), (x0, h0 * 0.38, t0), (x0, h0, d0)],
            [(x1, -h1, d1), (x1, -h1 * 0.38, t1), (x1, h1 * 0.38, t1), (x1, h1, d1)],
        ], hull, collection, 0.005, cap="both")
        try:
            boolean_cut_box(
                hat, f"SpineSlot_{index}",
                ((x0 + x1) * 0.5, 0.0, (t0 + t1) * 0.5 + 0.02),
                (1.45, 0.42, 0.18),
            )
        except Exception as exc:
            print(f"spine slot skip {index}: {exc}")
        add_box(
            f"SpineSlotLiner_{index}",
            ((x0 + x1) * 0.5, 0.0, (t0 + t1) * 0.5 - 0.05),
            (1.22, 0.28, 0.045),
            mech, collection, 0.001,
        )
        if lod <= 1:
            for i in range(4):
                add_box(
                    f"SpineFin_{index}_{i}",
                    ((x0 + x1) * 0.5 - 0.45 + i * 0.30, 0.0, (t0 + t1) * 0.5 - 0.02),
                    (0.018, 0.24, 0.09),
                    primer, collection, 0.001,
                )
    add_box("Spine_FeedAft", (-10.4, 0.0, 1.95), (1.85, 0.28, 0.16), mech, collection, 0.004)
    if lod == 0:
        add_box("Spine_RootFore", (4.8, 0.0, 3.55), (0.32, 0.28, 0.10), mech, collection, 0.003)
        add_box("Spine_RootAft", (-4.2, 0.0, 3.18), (0.32, 0.24, 0.10), mech, collection, 0.003)


def add_service_cassette(lod, mats, collection):
    primer, mech = mats["Material_Radiator"], mats["Material_Mechanical"]
    loft_from_rings("Cassette_Body", [
        civic_pressure_ring(6.6, 0, -3.35, 2.85, 0.52, crown=0.88, wall=0.96, belly=0.82),
        civic_pressure_ring(1.2, 0, -3.52, 3.25, 0.60, crown=0.92, wall=0.96, belly=0.88),
        civic_pressure_ring(-3.2, 0, -3.42, 2.95, 0.54, crown=0.88, wall=0.95, belly=0.84),
        civic_pressure_ring(-6.8, 0, -3.12, 2.05, 0.42, crown=0.78, wall=0.94, belly=0.72),
    ], primer, collection, 0.006, cap="both")
    add_box("Cassette_Seam", (1.15, 0.0, -2.82), (0.045, 2.45, 0.10), mech, collection, 0.002)
    if lod == 0:
        add_box("Cassette_BayA", (4.1, 0.0, -2.78), (1.55, 1.45, 0.045), primer, collection, 0.003)
        add_box("Cassette_BayB", (-2.2, 0.0, -2.78), (1.45, 1.32, 0.045), primer, collection, 0.003)
        for name, loc in (("LatchA", (3.05, 0.92, -2.72)), ("LatchB", (3.05, -0.92, -2.72)),
                          ("LatchC", (-1.05, 0.86, -2.72)), ("LatchD", (-1.05, -0.86, -2.72))):
            add_box(name, loc, (0.12, 0.055, 0.038), mech, collection, 0.002)


def add_keel_and_saddle(lod, mats, collection):
    keel, frame = mats["Material_Mechanical"], mats["Material_Armor"]
    loft_from_rings("Keel_Beam", [
        civic_pressure_ring(8.0, 0, -2.85, 0.48, 0.36, crown=0.18, wall=0.96, belly=0.90),
        civic_pressure_ring(1.2, 0, -3.62, 0.78, 0.62, crown=0.12, wall=0.96, belly=0.94),
        civic_pressure_ring(-3.8, 0, -3.52, 0.70, 0.56, crown=0.12, wall=0.96, belly=0.92),
        civic_pressure_ring(-11.6, 0, -2.35, 0.42, 0.30, crown=0.10, wall=0.95, belly=0.84),
    ], keel, collection, 0.006, cap="both")
    add_folded_sheet(
        "Saddle_CheekP",
        (1.25, -1.18, -3.95), (-0.55, -1.18, -3.95),
        (-0.25, -0.32, -2.72), (1.00, -0.32, -2.72),
        0.055, keel, collection, 0.004,
    )
    add_folded_sheet(
        "Saddle_CheekS",
        (1.25, 1.18, -3.95), (1.00, 0.32, -2.72),
        (-0.25, 0.32, -2.72), (-0.55, 1.18, -3.95),
        0.055, keel, collection, 0.004,
    )
    add_box("Saddle_Pad", (0.30, 0.0, -4.05), (0.98, 0.64, 0.075), keel, collection, 0.004)
    add_folded_sheet(
        "Saddle_GussetP",
        (1.05, -0.32, -2.85), (-0.18, -0.32, -2.85),
        (-0.62, -0.98, -3.82), (1.32, -0.98, -3.82),
        0.030, frame, collection, 0.003,
    )
    add_folded_sheet(
        "Saddle_GussetS",
        (1.05, 0.32, -2.85), (1.32, 0.98, -3.82),
        (-0.62, 0.98, -3.82), (-0.18, 0.32, -2.85),
        0.030, frame, collection, 0.003,
    )
    add_cylinder("Saddle_Pin", (0.30, 0.0, -3.82), 0.080, 0.32, frame, collection, 10, 0.002, (0, 0, 0))
    if lod == 0:
        add_corner_fasteners("Saddle", (0.30, 0.0, -3.92), (0.62, 0.42, 0.025), frame, collection)


def gallery_ring(x, y, z, hw, hh):
    """Octagonal service-gallery section. Walkable pressure corridor, not a fin."""
    return [
        (x, y - hw, z + hh * 0.32),
        (x, y - hw * 0.42, z + hh),
        (x, y + hw * 0.42, z + hh),
        (x, y + hw, z + hh * 0.32),
        (x, y + hw, z - hh * 0.32),
        (x, y + hw * 0.42, z - hh),
        (x, y - hw * 0.42, z - hh),
        (x, y - hw, z - hh * 0.32),
    ]


def add_side_galleries(lod, mats, collection):
    """Equatorial service galleries rooted into the barrel chine. Load-bearing, glazed."""
    frame, glass, hull, primer = (
        mats["Material_Armor"], mats["Material_Canopy"],
        mats["Material_Hull"], mats["Material_Radiator"],
    )
    for tag, sign in (("P", -1.0), ("S", 1.0)):
        y = sign * 8.72
        loft_from_rings(f"Gallery_{tag}", [
            gallery_ring(8.15, y, 0.38, 0.62, 0.78),
            gallery_ring(4.40, y * 1.018, 0.42, 0.70, 0.88),
            gallery_ring(1.20, y * 1.035, 0.44, 0.74, 0.92),
            gallery_ring(-2.40, y * 1.012, 0.40, 0.68, 0.84),
            gallery_ring(-5.20, y * 0.92, 0.32, 0.52, 0.68),
        ], hull, collection, 0.008, cap="both")
        add_box(f"GalleryFrame_{tag}", (1.35, y + sign * 0.68, 0.44), (6.40, 0.055, 1.12), frame, collection, 0.003)
        add_box(f"GalleryGlass_{tag}", (1.55, y + sign * 0.72, 0.52), (5.85, 0.022, 0.62), glass, collection, 0.001)
        if lod <= 1:
            for i in range(4):
                add_box(
                    f"GalleryStanchion_{tag}_{i}",
                    (6.2 - i * 2.55, y + sign * 0.18, 0.38),
                    (0.08, 0.55, 0.90),
                    frame, collection, 0.002,
                )
        if lod == 0:
            add_box(f"GalleryPlate_{tag}", (1.35, y + sign * 0.22, -0.42), (2.15, 0.22, 0.06), primer, collection, 0.002)


def add_drive_root_fairing(tag, y, mats, collection):
    """Ceramic shoulder from the tapered aft drum toward the dark drive case. Not a union."""
    sign = 1.0 if y > 0 else -1.0
    hull = mats["Material_Hull"]
    rings = []
    for x, inner, outer, z0, z1 in (
        (-10.85, 2.55, 4.15, -0.62, 1.38),
        (-12.15, 4.85, 6.35, -0.42, 1.18),
        (-13.20, 6.55, 7.55, -0.22, 0.98),
    ):
        rings.append([
            (x, sign * inner, z0),
            (x, sign * outer, z0),
            (x, sign * outer, z1),
            (x, sign * inner, z1),
        ])
    return loft_from_rings(f"DriveFairing_{tag}", rings, hull, collection, 0.010, cap="both")


def add_drive_saddles(tag, y, lod, mats, collection):
    """Load-bearing drive saddles and struts. Negative space between spine and case."""
    frame, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    sign = 1.0 if y > 0 else -1.0
    z = DRIVE_Z
    add_folded_sheet(
        f"DriveStrutUpper_{tag}",
        (-10.85, sign * 2.55, 1.15), (-12.40, y - sign * 0.85, z + 0.92),
        (-13.10, y - sign * 0.55, z + 0.55), (-11.20, sign * 2.20, 0.62),
        0.085, frame, collection, 0.004,
    )
    add_folded_sheet(
        f"DriveStrutLower_{tag}",
        (-10.85, sign * 2.40, -0.55), (-11.20, sign * 2.05, -0.12),
        (-13.10, y - sign * 0.55, z - 0.72), (-12.40, y - sign * 0.85, z - 0.95),
        0.085, frame, collection, 0.004,
    )
    add_box(f"DriveSaddle_{tag}", (-12.55, y - sign * 0.95, z), (1.35, 0.55, 0.72), mech, collection, 0.005)
    add_box(f"DriveShoe_{tag}", (-13.05, y, z - 1.22), (0.95, 0.48, 0.20), frame, collection, 0.003)
    if lod == 0:
        add_service_pipe(
            f"DriveLine_{tag}",
            (-10.4, sign * 0.28, 1.95),
            (-14.35, y, z + 0.92),
            mech, collection, 0.030,
        )
        add_cylinder(f"DriveFitting_{tag}", (-14.35, y, z + 0.92), 0.048, 0.08, mech, collection, 8, 0.001, (0, 0, 0))


def add_civic_drive(tag, y, lod, mats, collection):
    """Open-aft manufactured case with a real cavity. Never a capped disc. Never unioned into the drum."""
    frame, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    refractory, core = mats["Material_Ceramic"], mats["Material_Accent"]
    throat = mats["Material_Thruster"]
    z = DRIVE_Z
    sides = 10
    x0, x1, x2, x3, x4 = -11.85, -13.45, -15.25, -16.95, -18.50
    r0, r1, r2, r3, r4 = DRIVE_R_FORE, 1.48, 1.32, 1.18, DRIVE_R_AFT
    case = loft_hollow(
        f"Boom_{tag}",
        [
            regular_ring(x0, y, z, r0, sides),
            regular_ring(x1, y, z, r1, sides),
            regular_ring(x2, y, z, r2, sides),
            regular_ring(x3, y, z, r3, sides),
            regular_ring(x4, y, z, r4, sides),
        ],
        [
            regular_ring(x0, y, z, r0 - 0.52, sides),
            regular_ring(x1, y, z, r1 - 0.46, sides),
            regular_ring(x2, y, z, r2 - 0.38, sides),
            regular_ring(x3, y, z, r3 - 0.32, sides),
            regular_ring(x4, y, z, r4 - 0.30, sides),
        ],
        frame, collection, 0.010, close_front=True,
    )
    loft_hollow(
        f"Liner_{tag}",
        [
            regular_ring(-14.75, y, z, 0.92, 12),
            regular_ring(-16.45, y, z, 0.84, 12),
            regular_ring(-18.25, y, z, 0.76, 12),
        ],
        [
            regular_ring(-14.75, y, z, 0.66, 12),
            regular_ring(-16.45, y, z, 0.56, 12),
            regular_ring(-18.25, y, z, 0.50, 12),
        ],
        refractory, collection, 0.003, close_front=True,
    )
    loft_hollow(
        f"Collar_{tag}",
        [
            regular_ring(-18.15, y, z, 1.18, 12),
            regular_ring(-18.65, y, z, 1.26, 12),
        ],
        [
            regular_ring(-18.15, y, z, 0.80, 12),
            regular_ring(-18.65, y, z, 0.82, 12),
        ],
        refractory, collection, 0.004, close_front=False,
    )
    loft_hollow(
        f"Flange_{tag}",
        [
            regular_ring(-13.55, y, z, 1.58, 12),
            regular_ring(-13.92, y, z, 1.68, 12),
        ],
        [
            regular_ring(-13.55, y, z, 1.08, 12),
            regular_ring(-13.92, y, z, 1.10, 12),
        ],
        mech, collection, 0.005, close_front=False,
    )
    add_cylinder(f"ThroatFloor_{tag}", (-14.65, y, z), 0.58, 0.10, throat, collection, 12, 0.002)
    add_cylinder(f"Hub_{tag}", (-16.05, y, z), 0.20, 0.55, throat, collection, 12, 0.002)
    add_cylinder(f"Core_{tag}", (-15.85, y, z), 0.08, 0.14, core, collection, 12, 0.001)
    add_drive_saddles(tag, y, lod, mats, collection)
    if lod <= 1:
        for index in range(8):
            ang = math.tau * index / 8
            add_box(
                f"Clamp_{tag}_{index}",
                (-13.75, y + math.cos(ang) * 1.52, z + math.sin(ang) * 1.52),
                (0.070, 0.048, 0.034),
                mech, collection, 0.002, (0, 0, ang),
            )
    if lod == 0:
        for index in range(10):
            add_tapered_vane(
                f"Vane_{tag}_{index}", (-18.05, y, z), refractory, collection,
                math.tau * index / 10, scale=1.95,
            )
    return case


def add_dock_hardware(tag, loc, mats, collection, lod, cyan=True):
    frame, accent = mats["Material_Armor"], (
        mats["Material_Accent"] if cyan else mats["Material_Warning"]
    )
    x, y, z = loc
    sign = 1.0 if y > 0 else -1.0
    add_box(f"Dock_Jamb_{tag}", (x, y, z), (1.15, 0.055, 0.78), frame, collection, 0.003)
    add_box(f"Dock_Frame_{tag}", (x, y + 0.05 * sign, z), (1.28, 0.034, 0.88), frame, collection, 0.002)
    add_box(f"Dock_Plate_{tag}", (x + 0.52, y + 0.03 * sign, z - 0.04), (0.16, 0.032, 0.22), mats["Material_Radiator"], collection, 0.002)
    add_cylinder(f"Dock_Lamp_{tag}", (x, y + 0.07 * sign, z + 0.22), 0.028, 0.04, accent, collection, 10, 0.001, (math.pi / 2, 0, 0))
    if lod == 0:
        for i, (ox, oz) in enumerate(((-0.78, -0.52), (-0.78, 0.52), (0.78, -0.52), (0.78, 0.52))):
            add_cylinder(
                f"Dock_Bolt_{tag}_{i}",
                (x + ox, y + 0.09 * sign, z + oz),
                0.016, 0.034, mats["Material_Mechanical"], collection, 6, 0.001, (math.pi / 2, 0, 0),
            )


def sockets():
    return {
        "SOCKET_Weapon_Front": (15.25, 0.0, 0.42),
        "SOCKET_Engine_Main": (-17.85, 0.0, DRIVE_Z),
        "SOCKET_Trail_Main": (-18.65, 0.0, DRIVE_Z),
        "SOCKET_Trail_Port": (-18.65, -DRIVE_Y, DRIVE_Z),
        "SOCKET_Trail_Starboard": (-18.65, DRIVE_Y, DRIVE_Z),
        "SOCKET_Utility_Dorsal": (0.4, 0.0, 4.35),
        "SOCKET_Cargo_Ventral": (0.30, 0.0, -4.05),
        "SOCKET_Camera_Focus": (0.4, 0.0, 0.35),
        "SOCKET_RCS_Port": (8.8, -8.55, 0.85),
        "SOCKET_RCS_Starboard": (8.8, 8.55, 0.85),
        "SOCKET_Dock_Port": (3.40, -9.35, 0.38),
        "SOCKET_Service_Starboard": (-1.80, 9.20, 0.38),
        "SOCKET_Tether_Keel": (0.30, 0.0, -4.05),
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
    bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.014, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    uv0 = obj.data.uv_layers.active
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv0.data[loop.index].uv * 7.0
    obj.select_set(False)


def drum_stations(lod):
    """Stepped civic barrel. Three longitudinal beats; mid is not a scaled bow.

    Beat 1 bow/boarding, beat 2 parallel passenger barrel, beat 3 transfer/drive
    root. Wider than Cycle 29 by manufactured section, not a non-uniform scale.
    """
    if lod >= 2:
        return [
            civic_pressure_ring(16.45, 0, 0.12, 1.15, 0.82, crown=0.10, wall=0.16, belly=0.12),
            civic_pressure_ring(11.55, 0, 0.26, 5.85, 2.55, crown=0.78, wall=0.55, belly=0.32),
            civic_pressure_ring(1.35, 0, 0.38, MID_HW, MID_HH, crown=0.96, wall=0.92, belly=0.58),
            civic_pressure_ring(-7.10, 0, 0.24, 5.40, 2.45, crown=0.42, wall=0.78, belly=0.32),
            civic_pressure_ring(-14.20, 0, 0.16, 2.25, 1.22, crown=0.14, wall=0.62, belly=0.12),
        ]
    return [
        civic_pressure_ring(16.45, 0, 0.10, 1.05, 0.78, crown=0.06, wall=0.12, belly=0.10),
        civic_pressure_ring(14.55, 0, 0.16, 2.35, 1.35, crown=0.22, wall=0.28, belly=0.16),
        civic_pressure_ring(11.55, 0, 0.26, 5.85, 2.55, crown=0.78, wall=0.55, belly=0.32),
        civic_pressure_ring(7.40, 0, 0.32, 7.55, 3.25, crown=0.88, wall=0.84, belly=0.48),
        civic_pressure_ring(1.35, 0, 0.38, MID_HW, MID_HH, crown=0.96, wall=0.92, belly=0.58),
        civic_pressure_ring(-3.10, 0, 0.32, 7.45, 3.20, crown=0.72, wall=0.86, belly=0.50),
        civic_pressure_ring(-7.10, 0, 0.24, 5.40, 2.45, crown=0.42, wall=0.78, belly=0.32),
        civic_pressure_ring(-11.20, 0, 0.18, 3.15, 1.65, crown=0.22, wall=0.68, belly=0.18),
        civic_pressure_ring(-14.20, 0, 0.14, 2.25, 1.22, crown=0.14, wall=0.62, belly=0.12),
    ]


def duplicate_object(obj, name, collection):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = name
    collection.objects.link(dup)
    return dup


def inflate_mesh(obj, distance):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    for vert in bm.verts:
        vert.co += vert.normal * distance
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def raise_high_source(obj):
    """Genuinely higher than the game mesh: tighter bevels and extra panel steps."""
    try:
        inset_large_faces(obj, thickness=0.022, depth=0.010, min_area=0.28)
    except Exception as exc:
        print(f"high inset skip {obj.name}: {exc}")
    mod = obj.modifiers.new("HighBevel", "BEVEL")
    mod.width = BEVEL_HIGH
    mod.segments = 3
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(28)
    apply_modifiers(obj)


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_AO_SAMPLES
    scene.cycles.use_denoising = False
    if hasattr(scene.cycles, "preview_samples"):
        scene.cycles.preview_samples = 4


def bake_pass(low, highs, cage, img, bake_type):
    mat = low.data.materials[0]
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.name = "SF_BAKE_TARGET"
    nodes.active = tex
    tex.select = True
    bpy.ops.object.select_all(action="DESELECT")
    for high in highs:
        high.hide_render = False
        high.hide_set(False)
        high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scene = bpy.context.scene
    scene.cycles.bake_type = bake_type
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.use_cage = True
    try:
        scene.render.bake.cage_object = cage.name
    except TypeError:
        scene.render.bake.cage_object = cage
    scene.render.bake.cage_extrusion = 0.0
    scene.render.bake.margin = 8
    if bake_type == "NORMAL":
        scene.render.bake.normal_space = "TANGENT"
        try:
            scene.render.bake.normal_r = "POS_X"
            scene.render.bake.normal_g = "POS_Y"
            scene.render.bake.normal_b = "POS_Z"
        except Exception:
            pass
    bpy.ops.object.bake(type=bake_type, use_clear=True, margin=8)
    for node in [n for n in nodes if n.name == "SF_BAKE_TARGET"]:
        nodes.remove(node)
    img.pack()
    return img


def pointiness_material(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    geom = nodes.new("ShaderNodeNewGeometry")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.42
    ramp.color_ramp.elements[0].color = (0.08, 0.08, 0.08, 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (0.92, 0.92, 0.92, 1)
    links.new(geom.outputs["Pointiness"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emit.inputs["Color"])
    links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def bake_curvature(high, low, cage, img):
    backup = [slot.material for slot in high.material_slots]
    mat = pointiness_material(f"CURV_{high.name}")
    if high.material_slots:
        high.material_slots[0].material = mat
    else:
        high.data.materials.append(mat)
    try:
        bake_pass(low, [high], cage, img, "EMIT")
    finally:
        if backup and high.material_slots:
            high.material_slots[0].material = backup[0]


def composite_unique(role, rgb, ao_img, curv_img, nrm_img, size, prefix):
    ao = list(ao_img.pixels) if ao_img else []
    curv = list(curv_img.pixels) if curv_img else []
    nrm = list(nrm_img.pixels) if nrm_img else []
    albedo, orm = [], []
    br, bg, bb = rgb
    metal_base = {
        "ceramic": 0.03, "frame": 0.88, "keel": 0.92, "primer": 0.16,
        "refractory": 0.04, "glass": 0.02, "cyan": 0.06, "amber": 0.04, "throat": 0.70,
    }.get(role, 0.12)
    rough_base = {
        "ceramic": 0.48, "frame": 0.32, "keel": 0.28, "primer": 0.58,
        "refractory": 0.66, "glass": 0.08, "cyan": 0.22, "amber": 0.36, "throat": 0.42,
    }.get(role, 0.45)
    count = size * size
    for i in range(count):
        a = ao[i * 4] if ao else 0.85
        if role in ("glass", "cyan", "amber"):
            a = max(0.55, a)
        elif role == "refractory":
            a = max(0.32, a)
        elif role == "throat":
            a = max(0.28, a)
        c = curv[i * 4] if curv else 0.5
        cavity = max(0.0, 0.45 - c) * 2.0
        edge = max(0.0, c - 0.62) * 2.2
        r = max(0, min(1, br * (0.55 + 0.45 * a) * (1.0 - cavity * 0.22) + edge * 0.08))
        g = max(0, min(1, bg * (0.55 + 0.45 * a) * (1.0 - cavity * 0.18) + edge * 0.06))
        b = max(0, min(1, bb * (0.55 + 0.45 * a) * (1.0 - cavity * 0.14) + edge * 0.04))
        rough = max(0.05, min(0.94, rough_base + cavity * 0.16 - edge * 0.10))
        metal = max(0.0, min(1.0, metal_base + edge * (0.55 if role == "ceramic" else 0.08)))
        albedo.extend((r, g, b, 1.0))
        orm.extend((max(0.12, min(1.0, a)), rough, metal, 1.0))
        if not nrm:
            continue
    base = write_pixels(f"liner_{prefix}_{size}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"liner_{prefix}_{size}_orm", orm, size, "Non-Color")
    if nrm:
        nrm_out = write_pixels(f"liner_{prefix}_{size}_normal", nrm, size, "Non-Color")
    else:
        nrm_out = write_pixels(
            f"liner_{prefix}_{size}_normal",
            [0.5, 0.5, 1.0, 1.0] * count,
            size, "Non-Color",
        )
    return base, orm_img, nrm_out


def extra_high_bolts(low, collection, material):
    extras = []
    bbox = [Vector(c) for c in low.bound_box]
    center = sum(bbox, Vector((0, 0, 0))) / 8.0
    size = (max(v.x for v in bbox) - min(v.x for v in bbox),
            max(v.y for v in bbox) - min(v.y for v in bbox),
            max(v.z for v in bbox) - min(v.z for v in bbox))
    world = low.matrix_world @ center
    for i, (ox, oy) in enumerate(((-0.32, -0.28), (-0.32, 0.28), (0.32, -0.28), (0.32, 0.28))):
        loc = (world.x + ox * size[0], world.y + oy * size[1], world.z + size[2] * 0.42)
        extras.append(add_cylinder(
            f"{low.name}_HighBolt_{i}", loc, 0.012, 0.018, material, collection, 6, 0.0, (0, 0, 0),
        ))
    return extras


def bake_lod0_unique(merged, collection, mats):
    """High-to-low cage bake onto unique UV0. MTX-20/21/22/23/24/25."""
    ensure_cycles()
    bake_roles = {
        "Hull": ("ceramic", ROLE_RGB["ceramic"], mats["Material_Hull"], 1024),
        "Armor": ("frame", ROLE_RGB["frame"], mats["Material_Armor"], 512),
        "Mechanical": ("keel", ROLE_RGB["keel"], mats["Material_Mechanical"], 512),
        "Ceramic": ("refractory", ROLE_RGB["refractory"], mats["Material_Ceramic"], 512),
        "Radiator": ("primer", ROLE_RGB["primer"], mats["Material_Radiator"], 512),
        "Thruster": ("throat", ROLE_RGB["throat"], mats["Material_Thruster"], 512),
        "Canopy": ("glass", ROLE_RGB["glass"], mats["Material_Canopy"], 512),
    }
    report = {"baked": [], "failed": []}
    leftovers = []
    for obj in list(merged):
        key = next((name for name in bake_roles if name in obj.name), None)
        if key is None:
            continue
        role, rgb, material, size = bake_roles[key]
        prefix = f"lod0_{key.lower()}"
        high = duplicate_object(obj, f"{obj.name}_HIGH", collection)
        raise_high_source(high)
        extras = extra_high_bolts(high, collection, material)
        if extras:
            bpy.ops.object.select_all(action="DESELECT")
            for extra in extras:
                apply_modifiers(extra)
                extra.select_set(True)
            high.select_set(True)
            bpy.context.view_layer.objects.active = high
            bpy.ops.object.join()
            high = bpy.context.object
            high.name = f"{obj.name}_HIGH"
        cage = duplicate_object(obj, f"{obj.name}_CAGE", collection)
        inflate_mesh(cage, CAGE_INFLATE)
        cage.hide_render = True
        ao = bpy.data.images.new(f"BAKE_AO_{obj.name}", width=size, height=size, alpha=True)
        ao.colorspace_settings.name = "Non-Color"
        nrm = bpy.data.images.new(f"BAKE_NRM_{obj.name}", width=size, height=size, alpha=True)
        nrm.colorspace_settings.name = "Non-Color"
        curv = bpy.data.images.new(f"BAKE_CURV_{obj.name}", width=size, height=size, alpha=True)
        curv.colorspace_settings.name = "Non-Color"
        try:
            bake_pass(obj, [high], cage, nrm, "NORMAL")
            bake_pass(obj, [high], cage, ao, "AO")
            bake_curvature(high, obj, cage, curv)
            maps = composite_unique(role, rgb, ao, curv, nrm, size, prefix)
            bsdf = next((n for n in obj.data.materials[0].node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                bsdf = principled(obj.data.materials[0])
            else:
                for node in list(obj.data.materials[0].node_tree.nodes):
                    if node.type != "OUTPUT_MATERIAL" and node != bsdf:
                        obj.data.materials[0].node_tree.nodes.remove(node)
            coat = 0.18 if key == "Hull" else (0.22 if key == "Canopy" else 0.04 if key == "Armor" else 0.0)
            wire_maps(obj.data.materials[0], bsdf, maps, coat=coat)
            report["baked"].append(obj.name)
            print(f"baked {obj.name} size={size}")
        except Exception as exc:
            report["failed"].append(f"{obj.name}: {exc}")
            print(f"bake fail {obj.name}: {exc}")
        leftovers.extend((high, cage))
    for victim in leftovers:
        try:
            bpy.data.objects.remove(victim, do_unlink=True)
        except Exception:
            pass
    return report


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"LINER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull_mat = mats["Material_Hull"]
    root = add_empty(f"LINER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": ASSET_ID, "partId": PART_ID, "lod": f"lod{lod}",
        "slot": "hull", "category": "wholeships", "forward": "+X", "embeddedPlume": False,
        "role": "civic_pressure_drum_liner",
    }
    hull_obj = loft_from_rings("Pressure_Drum", drum_stations(lod), hull_mat, collection, BEVEL_HULL, cap="both")
    if lod <= 1:
        add_ops_wedge(hull_obj, mats, collection)
        add_boarding_well(hull_obj, lod, mats, collection)
        add_observation_belt(hull_obj, lod, mats, collection)
        try_cut_bay(hull_obj, "PortDock", (3.40, -7.85, 0.28), 2.95, 1.72, 0.68, (0, -1, 0), mats, collection, "empty")
        try_cut_bay(hull_obj, "StbdService", (-1.80, 7.65, 0.28), 2.65, 1.58, 0.64, (0, 1, 0), mats, collection, "empty")
        add_dock_hardware("Port", (3.40, -9.22, 0.38), mats, collection, lod, cyan=True)
        add_dock_hardware("Stbd", (-1.80, 9.08, 0.38), mats, collection, lod, cyan=False)
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull_mat)
        add_dorsal_spine(lod, mats, collection)
        add_side_galleries(lod, mats, collection)
        add_bulkhead_collar("Collar_Shoulder", 7.40, 7.55, 3.25, mats, collection, 0.88, 0.84, 0.48)
        add_bulkhead_collar("Collar_Waist", -3.10, 7.45, 3.20, mats, collection, 0.72, 0.86, 0.50)
        add_bulkhead_collar("Collar_Drive", -11.20, 3.15, 1.65, mats, collection, 0.22, 0.68, 0.18)
        try:
            boolean_cut_box(hull_obj, "RadFore", (1.70, 0.0, 3.55), (1.35, 0.62, 0.22))
        except Exception as exc:
            print(f"rad fore skip: {exc}")
        try:
            boolean_cut_box(hull_obj, "RadAft", (-4.60, 0.0, 3.18), (1.22, 0.54, 0.20))
        except Exception as exc:
            print(f"rad aft skip: {exc}")
        rad = mats["Material_Radiator"]
        for i in range(5):
            add_box(f"RadFin_Fore_{i}", (0.70 + i * 0.50, 0.0, 3.42), (0.016, 0.44, 0.12), rad, collection, 0.001)
            add_box(f"RadFin_Aft_{i}", (-5.35 + i * 0.42, 0.0, 3.02), (0.014, 0.38, 0.10), rad, collection, 0.001)
        try:
            inset_large_faces(hull_obj, thickness=0.085, depth=0.024, min_area=2.4)
        except Exception as exc:
            print(f"inset skip: {exc}")
    add_service_cassette(lod, mats, collection)
    add_keel_and_saddle(lod, mats, collection)
    add_civic_drive("Port", -DRIVE_Y, lod, mats, collection)
    add_civic_drive("Stbd", DRIVE_Y, lod, mats, collection)
    add_drive_root_fairing("Port", -DRIVE_Y, mats, collection)
    add_drive_root_fairing("Stbd", DRIVE_Y, mats, collection)
    add_box("NoseCap", (16.62, 0.0, 0.28), (0.14, 0.78, 0.52), hull_mat, collection, 0.003)
    if lod == 0:
        add_curve_hose(
            "Service_Hose",
            [(6.2, 1.35, -2.65), (1.2, 1.55, -1.55), (-9.4, 1.05, 0.42), (-15.9, DRIVE_Y, DRIVE_Z)],
            mats["Material_Mechanical"], collection, 0.024,
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
        merged.append(active)
    bake_report = {"baked": [], "failed": []}
    if lod == 0 and not PROBE_OCCUPANCY:
        bake_report = bake_lod0_unique(merged, collection, mats)
    for active in merged:
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        active.select_set(False)
    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in (
        (16.8, 0, 0.2), (11.4, -5.6, 1.8), (11.4, 5.6, 1.8),
        (1.2, -9.4, 0.4), (1.2, 9.4, 0.4),
        (-12.2, -7.2, 0.3), (-12.2, 7.2, 0.3),
        (-18.8, -DRIVE_Y, DRIVE_Z), (-18.8, DRIVE_Y, DRIVE_Z),
        (0.30, 0, -4.1), (0.8, 0, 4.2),
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
        "bake": bake_report,
    }


def export_lod(collection, lod):
    out = FAMILY / "source" / "wholeships" / f"{PART_ID}_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        if obj.name.endswith("_HIGH") or obj.name.endswith("_CAGE"):
            obj.select_set(False)
            continue
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
    scene.render.film_transparent = False
    set_view(standard=False, exposure=0.85)
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
    bg.inputs["Color"].default_value = (0.048, 0.052, 0.058, 1)
    bg.inputs["Strength"].default_value = 1.55
    for obj in list(scene.objects):
        if obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (18, -22, 16), 720, (0.96, 0.97, 1.00), 24),
        ("Fill", (4, 18, 10), 1100, (0.78, 0.82, 0.86), 22),
        ("Top", (2, 4, 22), 780, (0.90, 0.92, 0.96), 18),
        ("Rim", (-16, -8, 8), 640, (0.78, 0.84, 0.92), 16),
        ("Kick", (-8, 12, -5), 320, (0.74, 0.78, 0.84), 12),
        ("AftFill", (-14, -14, 9), 520, (0.80, 0.84, 0.90), 16),
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


def visible_imported_meshes():
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.upper()
        if "COLLISION" in name or obj.get("collision") or obj.get("nonRender"):
            obj.hide_render = True
            continue
        if name.startswith("LOD1_") or name.startswith("LOD2_"):
            obj.hide_render = True
            continue
        meshes.append(obj)
    has_lod0 = any(obj.name.upper().startswith("LOD0_") for obj in meshes)
    if has_lod0:
        for obj in list(meshes):
            if not obj.name.upper().startswith("LOD0_"):
                obj.hide_render = True
        meshes = [obj for obj in meshes if obj.name.upper().startswith("LOD0_")]
    return meshes


def mesh_center(meshes):
    low = Vector((1e12, 1e12, 1e12))
    high = Vector((-1e12, -1e12, -1e12))
    for obj in meshes:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return (low + high) * 0.5, high - low


def projected_occupancy(scene, camera, meshes):
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    xs, ys = [], []
    for obj in meshes:
        mesh = obj.data
        if not mesh or not mesh.vertices:
            continue
        mw = obj.matrix_world
        step = max(1, len(mesh.vertices) // 6000)
        for index, vert in enumerate(mesh.vertices):
            if index % step:
                continue
            ndc = world_to_camera_view(scene, camera, mw @ vert.co)
            if ndc.z < 0.0:
                continue
            xs.append(ndc.x)
            ys.append(ndc.y)
    if not xs:
        raise RuntimeError("occupancy: no projected vertices")
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    return {
        "minX": round(min_x, 5),
        "maxX": round(max_x, 5),
        "minY": round(min_y, 5),
        "maxY": round(max_y, 5),
        "widthFrac": round(max_x - min_x, 5),
        "heightFrac": round(max_y - min_y, 5),
        "widthPx1600": round((max_x - min_x) * 1600.0, 1),
        "cropped": bool(min_x < 0.0 or max_x > 1.0 or min_y < 0.0 or max_y > 1.0),
    }


def measure_supported_occupancy(camera, meshes, focus):
    scene = bpy.context.scene
    poses = {
        "play_chase": (DISTANCE_DEFAULT, 0.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_abeam": (DISTANCE_DEFAULT, 90.0, PLAY_CHASE_WIDTH_FRAC),
        "play_chase_close": (DISTANCE_CLOSE, 0.0, PLAY_CHASE_CLOSE_WIDTH_FRAC),
    }
    measured = {}
    failures = []
    for name, (distance, heading, band) in poses.items():
        apply_chase_camera(camera, distance=distance, heading_deg=heading, focus=focus)
        rec = projected_occupancy(scene, camera, meshes)
        rec["band"] = [band[0], band[1]]
        rec["inBand"] = occupancy_in_band(
            rec["widthFrac"], close=name == "play_chase_close", cropped=rec["cropped"],
        )
        measured[name] = rec
        print(f"occupancy {name}: {rec['widthPx1600']:.1f}px ({rec['widthFrac']*100:.2f}%) crop={rec['cropped']}")
        if rec["cropped"]:
            failures.append(f"{name} crops")
        if not (band[0] <= rec["widthFrac"] <= band[1]):
            failures.append(f"{name} width {rec['widthFrac']*100:.2f}% outside band")
    return measured, failures


def assign_all_slots(obj, mat):
    if not obj.material_slots:
        obj.data.materials.append(mat)
        return
    for slot in obj.material_slots:
        slot.material = mat


def set_view(standard=False, exposure=0.85):
    scene = bpy.context.scene
    if standard:
        scene.view_settings.view_transform = "Standard"
        try:
            scene.view_settings.look = "None"
        except TypeError:
            pass
        scene.view_settings.exposure = 0.0
        scene.view_settings.gamma = 1.0
        return
    try:
        scene.view_settings.view_transform = "AgX"
    except TypeError:
        pass
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except TypeError:
            pass
    scene.view_settings.exposure = exposure
    scene.view_settings.gamma = 1.0


def override_emission(meshes, color_fn, clay=False):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        mat = bpy.data.materials.new(f"ISO_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        if clay:
            bsdf = mat.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
            bsdf.inputs["Base Color"].default_value = (0.70, 0.70, 0.71, 1)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.52
            mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        else:
            emit = mat.node_tree.nodes.new("ShaderNodeEmission")
            color, strength = color_fn(obj)
            emit.inputs["Color"].default_value = (*color, 1)
            emit.inputs["Strength"].default_value = strength
            mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        assign_all_slots(obj, mat)
    return backups


def override_map_isolation(meshes, suffix):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        src = None
        for slot in obj.material_slots:
            if slot.material and slot.material.use_nodes:
                src = slot.material
                break
        if src is None and obj.data.materials:
            src = obj.data.materials[0]
        img = None
        if src and src.use_nodes:
            img = next(
                (n.image for n in src.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name.lower()),
                None,
            )
        mat = bpy.data.materials.new(f"ISO_{suffix}_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        emit = mat.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        if img:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            tex.image.colorspace_settings.name = "Non-Color"
            uv = mat.node_tree.nodes.new("ShaderNodeUVMap")
            uv.uv_map = obj.data.uv_layers[0].name if obj.data.uv_layers else "UVMap"
            mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
            mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = (0.18, 0.18, 0.18, 1)
        mat.node_tree.links.new(emit.outputs["Emission"], out.inputs["Surface"])
        assign_all_slots(obj, mat)
    return backups


def restore_mats(meshes, backups):
    for obj in meshes:
        mats = backups.get(obj.name, [])
        for index, material in enumerate(mats):
            if index < len(obj.material_slots):
                obj.material_slots[index].material = material


def render_cycle_from_glb(glb_path):
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    meshes = visible_imported_meshes()
    if not meshes:
        raise RuntimeError(f"no visible meshes imported from {glb_path}")
    center, size = mesh_center(meshes)
    focus = (float(center.x), float(center.y), float(center.z))
    camera = setup_studio()
    for lamp in [obj for obj in bpy.context.scene.objects if obj.type == "LIGHT"]:
        lamp.location = Vector(focus) + (lamp.location - Vector((0.4, 0.0, 0.3)))
        look_at(lamp, focus)
    out = FAMILY / "evidence" / "massline_express_liner_v1" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    occupancy, occupancy_failures = measure_supported_occupancy(camera, meshes, focus)
    render_cycle_chase_stills(camera, out, focus=focus)

    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    prior_strength = world_bg.inputs["Strength"].default_value
    prior_color = tuple(world_bg.inputs["Color"].default_value)
    world_bg.inputs["Color"].default_value = (0.030, 0.032, 0.036, 1)
    world_bg.inputs["Strength"].default_value = 1.15
    clay_sun = bpy.data.lights.new("ClayKey", "SUN")
    clay_sun.energy = 4.2
    clay_sun.color = (1.0, 0.98, 0.96)
    clay_sun_obj = bpy.data.objects.new("ClayKey", clay_sun)
    bpy.context.scene.collection.objects.link(clay_sun_obj)
    clay_sun_obj.location = Vector(focus) + Vector((12.0, -16.0, 18.0))
    look_at(clay_sun_obj, focus)
    backups = override_emission(meshes, lambda _o: ((0.70, 0.70, 0.71), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    bpy.data.objects.remove(clay_sun_obj, do_unlink=True)
    bpy.data.lights.remove(clay_sun)
    world_bg.inputs["Color"].default_value = prior_color
    world_bg.inputs["Strength"].default_value = prior_strength

    camera.location = Vector(focus) + Vector((8.5, -11.2, 2.4))
    camera.data.lens_unit = "MILLIMETERS"
    camera.data.lens = 48
    look_at(camera, focus)
    bpy.context.scene.render.filepath = str(out / "grazing_close.png")
    bpy.ops.render.render(write_still=True)

    bore = bpy.data.lights.new("BoreFill", "AREA")
    bore.energy = 1400
    bore.color = (1.0, 0.90, 0.78)
    bore.size = 3.2
    bore_obj = bpy.data.objects.new("BoreFill", bore)
    bpy.context.scene.collection.objects.link(bore_obj)
    throat = (focus[0] - 16.6, focus[1] - DRIVE_Y, focus[2] + DRIVE_Z)
    bore_obj.location = (throat[0] - 6.4, throat[1] - 1.15, throat[2] + 0.55)
    look_at(bore_obj, throat)
    camera.location = (throat[0] - 7.4, throat[1] - 2.15, throat[2] + 1.15)
    camera.data.lens = 55
    look_at(camera, throat)
    bpy.context.scene.render.filepath = str(out / "drive_rear.png")
    bpy.ops.render.render(write_still=True)

    ids = {
        "Hull": (0.78, 0.70, 0.56), "Armor": (0.16, 0.17, 0.20), "Mechanical": (0.08, 0.09, 0.10),
        "Canopy": (0.18, 0.38, 0.44), "Accent": (0.08, 0.72, 0.76), "Warning": (0.78, 0.42, 0.10),
        "Ceramic": (0.62, 0.38, 0.18), "Thruster": (0.06, 0.06, 0.08), "Radiator": (0.40, 0.42, 0.34),
    }

    def id_color(obj):
        names = [obj.name] + [slot.material.name for slot in obj.material_slots if slot.material]
        blob = " ".join(names).lower()
        for key, color in ids.items():
            if key.lower() in blob:
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    set_view(standard=True)
    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "orm")
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "normal")
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    set_view(standard=False, exposure=0.85)

    still_hashes = {path.name: sha256(path) for path in sorted(out.glob("*.png"))}
    identity = {
        "schema": "spaceface.exactSourceEvidence.v1",
        "assetId": ASSET_ID,
        "shipId": PART_ID,
        "cycle": CYCLE,
        "source": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256(glb_path),
        "renderer": "assets/ships/massline_express_liner_v1/scripts/build_massline_express_liner_v1.py+tools/blender/spaceface_chase_camera.py",
        "cameraContract": {
            "module": "tools/blender/spaceface_chase_camera.py",
            "fov_v_deg": FOV_V_DEG,
            "tilt_deg": TILT_DEG,
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading_deg": 90.0},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "clay_play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0, "material": "neutral_clay"},
            "grazing_close": {"kind": "diagnostic", "lens_mm": 48},
            "drive_rear": {"kind": "diagnostic", "lens_mm": 55},
            "diagnostics": ["id_or_material_id.png", "orm_isolation.png", "normal_isolation.png"],
        },
        "boundsSizeM": [round(float(size.x), 4), round(float(size.y), 4), round(float(size.z), 4)],
        "lengthToBeam": round(float(size.x) / max(1e-6, float(size.y)), 4),
        "occupancy": occupancy,
        "occupancyFailures": occupancy_failures,
        "views": [
            "play_chase.png", "play_chase_abeam.png", "play_chase_close.png",
            "clay_play_chase.png", "grazing_close.png", "drive_rear.png",
            "orm_isolation.png", "normal_isolation.png", "id_or_material_id.png",
        ],
        "stillSha256": still_hashes,
        "producer": "build_massline_express_liner_v1.py",
        "verdict": "review_pending",
        "gateState": "evidence_ready",
    }
    (out / "EVIDENCE_IDENTITY.json").write_text(json.dumps(identity, indent=2) + "\n", encoding="utf-8")
    return out, identity


def save_blend():
    path = FAMILY / "blender" / f"{PART_ID}.blend"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    return path


def probe_occupancy_from_scene(collection):
    meshes = [
        obj for obj in collection.objects
        if obj.type == "MESH" and not obj.get("collision") and not obj.get("nonRender")
        and "COLLISION" not in obj.name.upper()
    ]
    if not meshes:
        raise RuntimeError("probe: no visible meshes")
    center, size = mesh_center(meshes)
    focus = (float(center.x), float(center.y), float(center.z))
    camera = setup_studio()
    occupancy, failures = measure_supported_occupancy(camera, meshes, focus)
    ratio = float(size.x) / max(1e-6, float(size.y))
    result = {
        "boundsSizeM": [round(float(size.x), 4), round(float(size.y), 4), round(float(size.z), 4)],
        "lengthToBeam": round(ratio, 4),
        "occupancy": occupancy,
        "occupancyFailures": failures,
    }
    print(json.dumps(result, indent=2))
    return result


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    lod0 = FAMILY / "source" / "wholeships" / f"{PART_ID}_lod0.glb"
    if RENDER_ONLY:
        if not lod0.exists():
            raise FileNotFoundError(lod0)
        stills, identity = render_cycle_from_glb(lod0)
        evidence = FAMILY / "evidence" / "massline_express_liner_v1"
        report_path = evidence / f"cycle_{CYCLE:02d}.json"
        if report_path.exists():
            report = json.loads(report_path.read_text(encoding="utf-8"))
            report["sourceSha256"] = identity["sourceSha256"]
            report["boundsSizeM"] = identity.get("boundsSizeM")
            report["lengthToBeam"] = identity.get("lengthToBeam")
            report["occupancy"] = identity["occupancy"]
            report["occupancyFailures"] = identity["occupancyFailures"]
            report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({k: identity[k] for k in ("sourceSha256", "boundsSizeM", "lengthToBeam")}, indent=2))
        return
    reset_scene()
    reports = []
    collections = []
    global TEX
    outputs = []
    lods = (0,) if PROBE_OCCUPANCY else (0, 1, 2)
    for lod in lods:
        TEX = TEX_BY_LOD[lod]
        mats = create_materials()
        collection, report = build_lod(lod, mats)
        if PROBE_OCCUPANCY:
            probe_occupancy_from_scene(collection)
            print(f"lod{lod} tris={report['triangles']} hull={report['hullTriangles']} draws={report['draws']}")
            return
        output = export_lod(collection, lod)
        report.update({
            "path": str(output.relative_to(FAMILY)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
        })
        collections.append(collection)
        outputs.append(output)
        reports.append(report)
        print(f"lod{lod} tris={report['triangles']} hull={report['hullTriangles']} draws={report['draws']}")
    blend = save_blend()
    stills, identity = render_cycle_from_glb(outputs[0])
    evidence = FAMILY / "evidence" / "massline_express_liner_v1"
    evidence.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "spaceface.masslineExpressLiner.cycle.v1",
        "assetId": ASSET_ID,
        "shipId": PART_ID,
        "cycle": CYCLE,
        "blend": str(blend.relative_to(FAMILY)).replace("\\", "/"),
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
        "sourceSha256": identity["sourceSha256"],
        "boundsSizeM": identity.get("boundsSizeM"),
        "lengthToBeam": identity.get("lengthToBeam"),
        "occupancy": identity["occupancy"],
        "occupancyFailures": identity["occupancyFailures"],
        "cameras": {
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading": 0, "fov": 50, "tilt": 60},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading": 90, "fov": 50, "tilt": 60},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading": 0, "fov": 50, "tilt": 60},
        },
        "notes": "Source candidate only. Not wired to traffic, manifests, or partsLibrary.",
        "implementingAgentVerdict": "review_pending",
        "evidenceState": "evidence_ready",
    }
    (evidence / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("assetId", "cycle", "stills", "sourceSha256")}, indent=2))


if __name__ == "__main__":
    main()
