"""PQ-050.13 Ashline dart MTX builder. Hitch untouched. --mtx-cycle N writes cycle stills."""
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
    add_cockpit_glazing,
    add_flared_bell,
    add_folded_sheet,
    add_manufactured_drive,
    center_loft,
    loft_shell,
    add_panel_seams,
    add_rcs_cluster,
    add_sensor_dish,
    add_service_hatch,
    apply_modifiers,
    cut_open_bay,
    station_ring,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ashline_dart"
TEX_DIR = FAMILY / "source" / "textures"
TEX = 512
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


def role_maps(role, rgb, size=TEX, prefix=None):
    """Unique Ashline dart maps. Rust-red Reach interceptor, not a Wasp tint."""
    prefix = prefix or role
    br, bg, bb = rgb
    albedo, orm, nrm = [], [], []
    if role == "hull":
        pw, ph = 0, 0
    elif role == "armor":
        pw, ph = 88, 52
    elif role == "mechanical":
        pw, ph = 18, 9
    elif role == "ceramic":
        pw, ph = 56, 56
    else:
        pw, ph = 72, 72
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
            gf = h01(x, y, 17)
            gf2 = h01(x // 3, y // 3, 41)
            rust = max(0.0, gf2 * 0.55 - 0.18)
            cav = (0.12 + 0.22 * gf2) if pw == 0 else (
                max(0.0, 0.58 - abs(math.sin(x * 0.035) * math.cos(y * 0.04)) * 0.45) * 0.5 + soft * 0.28 + seam * 0.32
            )
            dirt = min(1.0, (0.16 * gf + 0.22 * gf2 + rust * 0.35) if pw == 0 else (soft * 0.30 + seam * 0.18 + cav * 0.30 + gf2 * 0.10))
            edge = 0.0 if pw == 0 else (1.0 if (dx <= 3 or dy <= 3) else 0.0)
            stencil = 0.0
            if role == "hull" and 40 <= x <= 200 and 150 <= y <= 310:
                col = x - 40
                row = y - 150
                if 18 <= col <= 70 and abs((row - 80) - (col - 18) * 0.55) <= 10:
                    stencil = 0.55
                if 70 <= col <= 122 and abs((row - 80) + (col - 70) * 0.55) <= 10:
                    stencil = 0.50
                if gf > 0.90:
                    stencil *= 0.25
            if role == "hull":
                chip = 1.0 if gf > 0.93 else 0.0
                r = max(0, min(1, br * (1.0 - dirt * 0.22) + rust * 0.16 + chip * 0.18))
                g = max(0, min(1, bg * (1.0 - dirt * 0.18) + rust * 0.05 + chip * 0.10))
                b = max(0, min(1, bb * (1.0 - dirt * 0.14) + chip * 0.08))
                if stencil > 0:
                    r = r * (1 - stencil) + 0.10 * stencil
                    g = g * (1 - stencil) + 0.10 * stencil
                    b = b * (1 - stencil) + 0.10 * stencil
                rough = 0.52 + dirt * 0.22 - edge * 0.04
                metal = 0.04 + chip * 0.55 + edge * 0.08
            elif role == "armor":
                r = max(0, min(1, br * (1.0 - dirt * 0.26) - seam * 0.05 + rust * 0.08))
                g = max(0, min(1, bg * (1.0 - dirt * 0.20) - seam * 0.03))
                b = max(0, min(1, bb * (1.0 - dirt * 0.16)))
                rough = 0.38 + dirt * 0.20
                metal = 0.28 + edge * 0.18
            elif role == "mechanical":
                heat = max(0.0, 0.55 - x / size) * 0.32
                r = max(0, min(1, br * (0.86 + gf * 0.16) + heat * 0.28))
                g = max(0, min(1, bg * (0.88 + gf * 0.10) + heat * 0.06))
                b = max(0, min(1, bb * (0.90 + (1 - gf) * 0.08)))
                rough = 0.26 + dirt * 0.22 + heat * 0.14
                metal = 0.88
            elif role == "ceramic":
                r = max(0, min(1, br * (0.9 + gf2 * 0.10) - dirt * 0.14))
                g = max(0, min(1, bg * (0.86 + gf * 0.08) - dirt * 0.12))
                b = max(0, min(1, bb * (0.78 - dirt * 0.10)))
                rough = 0.66 + dirt * 0.10
                metal = 0.0
            elif role == "accent":
                pulse = 0.72 + 0.28 * math.sin(x * 0.06)
                r, g, b = br * pulse, bg * pulse, bb * pulse
                rough, metal = 0.36, 0.08
            elif role == "warning":
                r, g, b = br * (1 - dirt * 0.18), bg * (1 - dirt * 0.14), bb
                rough, metal = 0.48, 0.04
            elif role == "glass":
                r, g, b = br, bg, bb
                rough, metal = 0.07, 0.02
            elif role == "thruster":
                r, g, b = br, bg, bb
                rough, metal = 0.24, 0.18
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.5, 0.2
            ao = max(0.16, 1.0 - cav * 0.52 - dirt * 0.22)
            nx = 0.5 + (dx / max(1, pw) - 0.5) * 0.08 * (1 if dx <= 4 else 0.2)
            ny = 0.5 + (dy / max(1, ph) - 0.5) * 0.08 * (1 if dy <= 4 else 0.2)
            albedo.extend((r, g, b, 1.0))
            orm.extend((ao, max(0.04, min(0.95, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((nx, ny, 1.0, 1.0))
    base = write_pixels(f"dart_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"dart_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"dart_{prefix}_normal", nrm, size, "Non-Color")
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
        bsdf.inputs["Coat Roughness"].default_value = 0.10
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]


def create_materials():
    specs = {
        "Material_Hull": ((0.22, 0.10, 0.08), 0.06, 0.54, "hull", 0.06, None),
        "Material_Armor": ((0.16, 0.08, 0.06), 0.08, 0.50, "armor", 0.04, None),
        "Material_Mechanical": ((0.28, 0.26, 0.24), 0.78, 0.36, "mechanical", 0.0, None),
        "Material_Accent": ((0.62, 0.48, 0.10), 0.04, 0.46, "warning", 0.04, None),
        "Material_Warning": ((0.78, 0.52, 0.08), 0.04, 0.48, "warning", 0.04, None),
        "Material_Ceramic": ((0.32, 0.26, 0.18), 0.0, 0.76, "ceramic", 0.0, None),
        "Material_Radiator": ((0.08, 0.10, 0.16), 0.10, 0.62, "mechanical", 0.0, None),
        "Material_Canopy": ((0.08, 0.16, 0.18), 0.02, 0.10, "glass", 0.35, None),
        "Material_Thruster": ((0.02, 0.03, 0.04), 0.08, 0.58, "thruster", 0.0, None),
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
        if role == "glass" and "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.16
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.48
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


def barge_ring(x, yc, zc, hw, deck, keel):
    """Hard-chine workboat: flat deck, hard chine, flat-ish keel. Not a scaled diamond."""
    deck_z = zc + deck
    keel_z = zc - keel
    chine_z = zc + deck * 0.02
    return [
        (x, yc + 0.00, deck_z),
        (x, yc + hw * 0.48, deck_z),
        (x, yc + hw * 0.92, deck_z - 0.02),
        (x, yc + hw, chine_z),
        (x, yc + hw * 0.70, zc - keel * 0.22),
        (x, yc + 0.00, keel_z),
        (x, yc - hw * 0.70, zc - keel * 0.22),
        (x, yc - hw, chine_z),
        (x, yc - hw * 0.92, deck_z - 0.02),
        (x, yc - hw * 0.48, deck_z),
    ]


def ellipse_ring(x, y, z, rx, rz, sides=12):
    ring = []
    for i in range(sides):
        ang = math.tau * i / sides
        ring.append((x, y + math.cos(ang) * rx, z + math.sin(ang) * rz))
    return ring


def dart_ring(x, yc, zc, hw, deck, keel):
    """Hard-chine fighter section: flat-ish deck, hard chine, keel. Not a sausage."""
    return [
        (x, yc + 0.00, zc + deck),
        (x, yc + hw * 0.38, zc + deck * 0.90),
        (x, yc + hw * 0.92, zc + deck * 0.18),
        (x, yc + hw, zc - keel * 0.08),
        (x, yc + hw * 0.52, zc - keel * 0.62),
        (x, yc + 0.00, zc - keel),
        (x, yc - hw * 0.52, zc - keel * 0.62),
        (x, yc - hw, zc - keel * 0.08),
        (x, yc - hw * 0.92, zc + deck * 0.18),
        (x, yc - hw * 0.38, zc + deck * 0.90),
    ]


def wing_station(x_le, y, z, chord, thick):
    """Eight-point airfoil, not a four-point card."""
    return [
        (x_le, y, z),
        (x_le - chord * 0.14, y, z + thick * 0.82),
        (x_le - chord * 0.38, y, z + thick),
        (x_le - chord * 0.70, y, z + thick * 0.52),
        (x_le - chord * 0.96, y, z + thick * 0.10),
        (x_le - chord, y, z),
        (x_le - chord * 0.72, y, z - thick * 0.58),
        (x_le - chord * 0.22, y, z - thick * 0.42),
    ]


def inset_large_faces(obj, thickness=0.05, depth=0.022, min_area=0.22):
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


def boolean_cut_cyl(host, cutter_name, loc, radius, depth, rot=(0, math.pi / 2, 0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    cutter = bpy.context.object
    cutter.name = cutter_name
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
    """Spun bottle: lofted outer, deep throat, ceramic collar, vanes to a hub."""
    s = scale
    ceramic, thruster, mech, armor = (
        mats["Material_Ceramic"], mats["Material_Thruster"],
        mats["Material_Mechanical"], mats["Material_Armor"],
    )
    rings = []
    for t, r, rz in (
        (0.00, 0.52, 0.52),
        (0.18, 0.44, 0.44),
        (0.42, 0.30, 0.30),
        (0.68, 0.22, 0.22),
        (1.00, 0.18, 0.18),
    ):
        xi = x - 0.08 * s - t * 0.95 * s
        rings.append(ellipse_ring(xi, y, z, r * s, rz * s, 28))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.005, cap=False)
    apply_modifiers(outer)
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.42 * s, radius2=0.08 * s, depth=1.12 * s,
        location=(x - 0.55 * s, y, z), rotation=(0, math.pi / 2, 0),
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
    add_cylinder(f"BellCollar_{tag}", (x - 0.10 * s, y, z), 0.26 * s, 0.12 * s, ceramic, collection, 22, 0.004)
    add_cylinder(f"BellClamp_{tag}", (x + 0.02 * s, y, z), 0.30 * s, 0.045 * s, armor, collection, 22, 0.003)
    add_cylinder(f"BellFlange_{tag}", (x + 0.12 * s, y, z), 0.32 * s, 0.05 * s, mech, collection, 22, 0.003)
    add_cylinder(f"BellDeep_{tag}", (x + 0.16 * s, y, z), 0.08 * s, 0.05 * s, thruster, collection, 14, 0.002)
    add_cylinder(f"BellHub_{tag}", (x - 0.28 * s, y, z), 0.05 * s, 0.22 * s, mech, collection, 12, 0.002)
    for index in range(10):
        ang = math.tau * index / 10
        add_box(
            f"BellVane_{tag}_{index}",
            (x - 0.42 * s, y + math.cos(ang) * 0.18 * s, z + math.sin(ang) * 0.18 * s),
            (0.20 * s, 0.014 * s, 0.055 * s),
            mech, collection, 0.002, (ang, 0, 0),
        )
    return outer


def add_cargo_pod(tag, x, y, z, length, radius, mats, collection, lod):
    """Formed pressure vessel in saddles, not a primitive cylinder."""
    hull, armor, mech, warning = (
        mats["Material_Hull"], mats["Material_Armor"],
        mats["Material_Mechanical"], mats["Material_Warning"],
    )
    rings = []
    for t, rs in ((0.0, 0.16), (0.08, 0.62), (0.18, 0.94), (0.50, 1.00), (0.82, 0.94), (0.92, 0.62), (1.0, 0.16)):
        xi = x + length * 0.5 - t * length
        rings.append(ellipse_ring(xi, y, z, radius * rs, radius * rs * 0.86, 20))
    tank = loft_from_rings(f"Pod_{tag}", rings, hull, collection, 0.010)
    add_cylinder(f"PodFlangeF_{tag}", (x + length * 0.46, y, z), radius * 0.55, 0.05, mech, collection, 18, 0.003)
    add_cylinder(f"PodFlangeA_{tag}", (x - length * 0.46, y, z), radius * 0.55, 0.05, mech, collection, 18, 0.003)
    add_cylinder(f"PodCapF_{tag}", (x + length * 0.52, y, z), radius * 0.20, 0.08, armor, collection, 16, 0.003)
    add_cylinder(f"PodCapA_{tag}", (x - length * 0.52, y, z), radius * 0.20, 0.08, armor, collection, 16, 0.003)
    for i, ox in enumerate((-0.30, 0.0, 0.30)):
        add_cylinder(
            f"PodBand_{tag}_{i}", (x + ox * length, y, z), radius * 1.04, 0.045,
            mech, collection, 18, 0.003,
        )
    add_box(f"PodSaddleP_{tag}", (x, y - radius * 0.58, z - radius * 0.88), (length * 0.22, 0.08, 0.12), mech, collection, 0.005)
    add_box(f"PodSaddleS_{tag}", (x, y + radius * 0.58, z - radius * 0.88), (length * 0.22, 0.08, 0.12), mech, collection, 0.005)
    add_box(f"PodSaddleK_{tag}", (x, y, z - radius * 1.02), (length * 0.18, 0.16, 0.07), armor, collection, 0.004)
    add_box(f"PodManway_{tag}", (x + length * 0.12, y, z + radius * 0.92), (0.14, 0.14, 0.04), mech, collection, 0.003)
    add_cylinder(f"PodManLid_{tag}", (x + length * 0.12, y, z + radius * 0.98), 0.07, 0.03, armor, collection, 12, 0.002, rot=(0, 0, 0))
    if lod == 0:
        add_box(f"PodValve_{tag}", (x + length * 0.22, y + radius * 0.12, z + radius * 0.88), (0.07, 0.05, 0.06), mech, collection, 0.002)
        add_box(f"PodPatch_{tag}", (x - length * 0.10, y + radius * 0.70, z + 0.04), (0.16, 0.018, 0.09), warning, collection, 0.002)
    return tank


def add_thin_canopy(tag, x, y, z, length, width, height, mats, collection):
    """Framed greenhouse over a cut tub. Thin panes, metal cage, not a brick."""
    canopy, armor, mech = mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"]
    rings = []
    for t, scale_h, scale_w, z_off in (
        (0.0, 0.55, 0.78, 0.00),
        (0.28, 1.00, 1.00, 0.00),
        (0.62, 0.96, 0.96, 0.02),
        (1.0, 0.62, 0.80, 0.04),
    ):
        xi = x + length * 0.5 - t * length
        h = height * scale_h
        w = width * scale_w
        rings.append([
            (xi, y - w, z + z_off),
            (xi, y - w * 0.90, z + z_off + h * 0.52),
            (xi, y - w * 0.28, z + z_off + h),
            (xi, y + w * 0.28, z + z_off + h),
            (xi, y + w * 0.90, z + z_off + h * 0.52),
            (xi, y + w, z + z_off),
        ])
    shell = loft_from_rings(f"{tag}_Shell", rings, canopy, collection, bevel=0.004, cap=False)
    solid = shell.modifiers.new("GlassShell", "SOLIDIFY")
    solid.thickness = 0.016
    solid.offset = 0.0
    add_box(f"{tag}_Sill", (x, y, z - 0.01), (length * 0.58, width * 1.10, 0.018), armor, collection, 0.004)
    add_box(f"{tag}_Brow", (x + length * 0.48, y, z + height * 0.42), (0.05, width * 0.78, height * 0.24), armor, collection, 0.004)
    add_box(f"{tag}_AftBulk", (x - length * 0.50, y, z + height * 0.34), (0.05, width * 0.90, height * 0.30), armor, collection, 0.004)
    add_box(f"{tag}_RailP", (x, y - width * 1.00, z + height * 0.30), (length * 0.48, 0.018, height * 0.22), armor, collection, 0.003)
    add_box(f"{tag}_RailS", (x, y + width * 1.00, z + height * 0.30), (length * 0.48, 0.018, height * 0.22), armor, collection, 0.003)
    add_box(f"{tag}_Mullion", (x + length * 0.02, y, z + height * 0.44), (0.018, width * 0.84, height * 0.20), armor, collection, 0.002)
    add_box(f"{tag}_Spine", (x - 0.04, y, z + height * 0.98), (length * 0.36, 0.018, 0.016), armor, collection, 0.002)
    for i, ox in enumerate((-0.42, -0.14, 0.14, 0.40)):
        add_cylinder(f"{tag}_Rivet_{i}", (x + ox, y - width * 0.94, z + 0.02), 0.01, 0.018, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0))
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
    # Frozen factory dart sockets (length 12, halfW 1.6, height 0.55).
    return {
        "SOCKET_Weapon_Front": (4.8, 0.0, 0.25),
        "SOCKET_Mining_Front": (5.4, 0.0, -0.15),
        "SOCKET_Engine_Main": (-4.8, 0.0, 0.08),
        "SOCKET_Trail_Main": (-5.2, 0.0, 0.08),
        "SOCKET_Trail_Port": (-5.0, -1.12, 0.08),
        "SOCKET_Trail_Starboard": (-5.0, 1.12, 0.08),
        "SOCKET_Utility_Dorsal": (0.6, 0.0, 1.10),
        "SOCKET_Cargo_Ventral": (-0.4, 0.0, -0.70),
        "SOCKET_Camera_Focus": (0.8, 0.0, 0.25),
        "SOCKET_RCS_Port": (-1.2, -1.80, 0.15),
        "SOCKET_RCS_Starboard": (-1.2, 1.80, 0.15),
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


def bake_ao_into_albedo(obj, samples=12, size=TEX):
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
    collection = bpy.data.collections.new(f"DART_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    warning, accent = mats["Material_Warning"], mats["Material_Accent"]
    root = add_empty(f"DART_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_ASHLINE_DART_V1", "partId": "ashline_dart_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    # 12 m Reach interceptor: needle, shoulder, waist, single tail drive. Not Wasp.
    hull_obj = loft_from_rings("Pressure_Hull", [
        station_ring(6.0, 0, 0.06, 0.20, 0.16, flat=0.05, box=0.05, keel=1.00),
        station_ring(3.6, 0, 0.10, 0.92, 0.48, flat=0.55, box=0.30, keel=0.80),
        station_ring(1.2, 0, 0.08, 1.48, 0.52, flat=0.25, box=0.70, keel=0.55),
        station_ring(-1.2, 0, 0.08, 1.58, 0.55, flat=0.22, box=0.85, keel=0.45),
        station_ring(-3.6, 0, 0.06, 1.05, 0.48, flat=0.20, box=0.90, keel=0.35),
        station_ring(-5.65, 0, 0.04, 0.50, 0.32, flat=0.18, box=0.90, keel=0.25),
    ], hull, collection, 0.010, cap="both")
    if lod <= 1:
        cut_open_bay(hull_obj, "Cockpit", (1.85, 0.0, 0.68), 1.15, 0.38, 0.30, (0, 0, 1), mats, collection, kit="cockpit", liner=False)
        cut_open_bay(hull_obj, "RadPort", (0.2, -1.48, 0.08), 1.05, 0.28, 0.22, (0, -1, 0), mats, collection, kit="empty", liner=False)
        cut_open_bay(hull_obj, "RadStbd", (0.2, 1.48, 0.08), 1.05, 0.28, 0.22, (0, 1, 0), mats, collection, kit="empty", liner=False)
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull)
    inset_large_faces(hull_obj, thickness=0.022, depth=0.010, min_area=0.55)

    loft_shell("Cheek_P", [
        (3.40, -0.22, -0.78, -0.06, 0.28),
        (1.20, -0.42, -1.28, -0.08, 0.32),
        (-1.20, -0.32, -1.18, -0.06, 0.26),
    ], hull, collection, 0.008)
    loft_shell("Cheek_S", [
        (3.40, 0.22, 0.78, -0.06, 0.28),
        (1.20, 0.42, 1.28, -0.08, 0.32),
        (-1.20, 0.32, 1.18, -0.06, 0.26),
    ], hull, collection, 0.008)
    center_loft("Spine", [
        (2.80, 0.18, 0.22, 0.48),
        (0.40, 0.28, 0.18, 0.52),
        (-2.20, 0.16, 0.12, 0.36),
    ], hull, collection, 0.006)
    add_box("TransomPlate", (-5.58, 0.0, 0.04), (0.04, 0.42, 0.26), armor, collection, 0.003)
    add_thin_canopy("Canopy", 1.85, 0.0, 0.66, 1.22, 0.34, 0.24, mats, collection)
    boolean_cut_cyl(hull_obj, "NoseIntake", (5.55, 0.0, 0.04), 0.12, 0.85)
    add_sensor_dish("Dorsal", (0.55, 0.0, 0.92), mats, collection)

    for sign, side in ((-1, "Port"), (1, "Starboard")):
        loft_from_rings(f"Wing_{side}", [
            wing_station(1.35, 1.42 * sign, 0.04, 2.15, 0.40),
            wing_station(0.25, 2.35 * sign, 0.02, 1.75, 0.26),
            wing_station(-0.75, 3.25 * sign, 0.00, 1.25, 0.16),
            wing_station(-1.55, 3.90 * sign, -0.02, 0.82, 0.10),
        ], hull, collection, 0.005, cap=True)
        loft_from_rings(f"Canard_{side}", [
            wing_station(3.55, 0.78 * sign, 0.10, 0.95, 0.16),
            wing_station(3.05, 1.38 * sign, 0.08, 0.68, 0.10),
        ], armor, collection, 0.004, cap=True)
        add_cylinder(f"WingLE_{side}", (0.15, 2.40 * sign, 0.08), 0.045, 1.55, armor, collection, 10, 0.002, rot=(math.pi / 2, 0.10 * sign, 0))
        add_box(f"WingRoot_{side}", (0.55, 1.38 * sign, 0.08), (0.72, 0.16, 0.12), mech, collection, 0.003)
        add_box(f"WingFlap_{side}", (-1.15, 3.05 * sign, -0.01), (0.28, 0.42, 0.025), armor, collection, 0.002)
        add_box(f"WingFence_{side}", (-0.35, 2.55 * sign, 0.12), (0.42, 0.012, 0.10), armor, collection, 0.002)
        add_box(f"GunCheek_{side}", (3.85, 0.42 * sign, 0.16), (0.55, 0.12, 0.08), armor, collection, 0.003)
        add_box(f"GunReceiver_{side}", (4.35, 0.38 * sign, 0.18), (0.22, 0.08, 0.07), mech, collection, 0.002)
        add_cylinder(f"GunJacket_{side}", (4.95, 0.38 * sign, 0.18), 0.038, 0.62, armor, collection, 10, 0.002)
        add_cylinder(f"GunBarrel_{side}", (5.45, 0.38 * sign, 0.18), 0.020, 0.38, mech, collection, 8, 0.001)
        add_rcs_cluster(side, (-1.2, 1.78 * sign, 0.12), mats, collection, sign=sign)
        add_box(f"Warn_{side}", (0.15, 1.62 * sign, 0.18), (0.18, 0.06, 0.016), warning, collection, 0.002)

    add_cylinder("DriveCoupling", (-5.62, 0.0, 0.06), 0.32, 0.16, mech, collection, 14, 0.003)
    add_cylinder("DriveCasing", (-5.05, 0.0, 0.06), 0.30, 0.55, mech, collection, 14, 0.004)
    add_manufactured_drive("Main", -5.35, 0.0, lod, mats, collection, scale=0.72, z=0.06)
    add_box("DorsalSpine", (-0.4, 0.0, 0.58), (2.4, 0.08, 0.03), armor, collection, 0.003)
    add_cylinder("NoseLip", (5.72, 0.0, 0.04), 0.16, 0.05, mech, collection, 12, 0.002)
    loft_from_rings("TailFin", [
        wing_station(-3.85, 0.0, 0.42, 1.15, 0.08),
        [
            (-3.55, 0.0, 0.55), (-3.85, 0.0, 1.05), (-4.55, 0.0, 1.18), (-4.95, 0.0, 1.02),
            (-5.05, 0.0, 0.72), (-4.65, 0.0, 0.48), (-4.15, 0.0, 0.38), (-3.75, 0.0, 0.40),
        ],
    ], armor, collection, 0.003, cap=True)
    add_box("Hatch_Lid", (-0.35, 0.22, 0.58), (0.22, 0.12, 0.012), armor, collection, 0.002)
    add_box("Repair_Patch", (0.85, -0.42, 0.52), (0.18, 0.08, 0.008), warning, collection, 0.002)
    add_box("VentralKeel", (-0.8, 0.0, -0.42), (2.8, 0.10, 0.04), armor, collection, 0.003)
    add_box("GunFairP", (3.55, -0.52, 0.12), (0.85, 0.06, 0.05), armor, collection, 0.003)
    add_box("GunFairS", (3.55, 0.52, 0.12), (0.85, 0.06, 0.05), armor, collection, 0.003)
    for i in range(5):
        add_box(f"SideSlat_{i}", (0.4 - i * 0.22, -1.52, 0.16), (0.08, 0.012, 0.10), mats["Material_Radiator"], collection, 0.002)
    add_service_hatch("Dorsal", (-1.15, 0.0, 0.58), mats, collection, sx=0.28, sy=0.18)
    add_box("HardpointP", (-0.15, -2.35, -0.16), (0.28, 0.05, 0.06), mech, collection, 0.002)
    add_box("HardpointS", (-0.15, 2.35, -0.16), (0.28, 0.05, 0.06), mech, collection, 0.002)
    add_panel_seams("Hull", [2.4, 0.8, -0.8, -2.4], 1.05, 0.48, mech, collection)

    if lod == 0:
        add_curve_hose("Hose_Port", [(0.6, -0.85, 0.08), (-2.4, -0.95, 0.10), (-5.0, -0.28, 0.08)], mech, collection, 0.012)
        add_curve_hose("Hose_Stbd", [(0.6, 0.85, 0.08), (-2.4, 0.95, 0.10), (-5.0, 0.28, 0.08)], mech, collection, 0.012)
    if CYCLE >= 6 and lod <= 1:
        boolean_cut(hull_obj, "TransomRecess", (-5.95, 0.0, 0.06), (0.12, 0.28, 0.18))
    if CYCLE >= 7:
        add_box("CanopyMullion", (1.85, 0.0, 0.72), (0.018, 0.22, 0.06), armor, collection, 0.002)
        if lod <= 1:
            for sign, side in ((-1, "Port"), (1, "Starboard")):
                for i in range(4):
                    add_box(
                        f"WingRad_{side}_{i}",
                        (-1.15 + i * 0.16, 1.85 * sign, 0.12),
                        (0.010, 0.12, 0.10),
                        mech, collection, 0.001,
                    )
    if CYCLE >= 8:
        add_box("DriveBand", (-5.15, 0.0, 0.06), (0.05, 0.28, 0.14), armor, collection, 0.003)
    if CYCLE >= 9:
        add_box("ChineCapP", (1.15, -1.05, -0.08), (1.05, 0.028, 0.032), armor, collection, 0.003)
        add_box("ChineCapS", (1.15, 1.05, -0.08), (1.05, 0.028, 0.032), armor, collection, 0.003)
    if CYCLE >= 10:
        add_box("PatchTile2", (0.85, 0.28, 0.62), (0.16, 0.08, 0.008), armor, collection, 0.002)
        add_box("CanopyStayP", (1.55, -0.14, 0.58), (0.14, 0.012, 0.012), mech, collection, 0.002)
        add_box("CanopyStayS", (1.55, 0.14, 0.58), (0.14, 0.012, 0.012), mech, collection, 0.002)

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
        if lod == 0 and material_name in {"Material_Mechanical"}:
            bake_ao_into_albedo(active)
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in [
        (5.8, 0, 0.1), (1.2, -1.7, 0.5), (1.2, 1.7, 0.5),
        (-5.4, -0.8, 0.2), (-5.4, 0.8, 0.2),
        (0.2, -3.9, 0.1), (0.2, 3.9, 0.1),
        (1.8, 0, 0.9),
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
    out = FAMILY / "source" / "wholeships" / f"ashline_dart_production_v1_lod{lod}.glb"
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


def look_at(obj, target=(0, 0, 0.15)):
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
    scene.view_settings.exposure = 1.05
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.012, 0.014, 0.018, 1)
    bg.inputs["Strength"].default_value = 0.4
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (18, -20, 13), 8600, (0.90, 0.88, 0.82), 11),
        ("Fill", (5, 18, 9), 3400, (0.52, 0.60, 0.70), 9),
        ("Rim", (-16, -6, 8), 3600, (0.72, 0.74, 0.82), 8),
        ("Kick", (-7, 12, -4), 1900, (0.68, 0.74, 0.82), 6),
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
    out = FAMILY / "evidence" / "ashline_dart" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    views = {
        "three_quarter": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
        "starboard": ((0.0, 16.5, 3.2), (0, 0, 0.10), 30),
        "rear": ((-12.4, -5.4, 3.4), (-0.4, 0, 0.10), 30),
        "clay_three_quarter": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
        "grazing_close": ((6.2, -5.2, 1.6), (0.6, 0, 0.16), 46),
        "bay_interior": ((1.9, -2.8, 0.9), (1.8, 0.0, 0.55), 40),
        "drive_rear": ((-8.8, -3.8, 1.2), (-5.4, 0, 0.06), 42),
        "play_size": ((34, -30, 14), (0, 0, 0.08), 48),
        "orm_isolation": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
        "normal_isolation": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
        "id_or_material_id": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
        "material_three_quarter": ((10.2, -12.4, 4.4), (0, 0, 0.12), 32),
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
        "Hull": (0.72, 0.62, 0.42), "Armor": (0.42, 0.22, 0.10), "Mechanical": (0.45, 0.45, 0.48),
        "Canopy": (0.04, 0.10, 0.08), "Accent": (0.08, 0.55, 0.42), "Warning": (0.9, 0.45, 0.06),
        "Ceramic": (0.7, 0.55, 0.35), "Thruster": (0.25, 0.55, 0.7), "Radiator": (0.32, 0.20, 0.12),
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
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    mats = create_materials()
    reports = []
    collections = []
    for lod in (0, 1, 2):
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"ashline_dart lod{lod} hull {report['hullTriangles']} < 800")
        collections.append(collection)
        reports.append(report)
    stills = render_cycle(collections[0])
    report = {
        "schema": "spaceface.ashlineDartMtx.cycle.v1",
        "shipId": "ashline_dart",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
    }
    (FAMILY / "evidence" / "ashline_dart").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "ashline_dart" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "cycle": CYCLE, "hull0": reports[0]["hullTriangles"], "tris0": reports[0]["triangles"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
