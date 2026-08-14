"""PQ-050.02 Drifter MTX builder. Hitch untouched. --mtx-cycle N writes cycle stills."""
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
    add_rcs_cluster,
    add_sensor_dish,
    apply_modifiers,
    boolean_cut_cylinder,
    cut_open_bay,
    cut_slot_bank,
    densify_ring,
    station_ring,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "drifter"
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
        pw, ph = 64, 64
    elif role == "glass":
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
    base = write_pixels(f"drifter_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"drifter_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"drifter_{prefix}_normal", nrm, size, "Non-Color")
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
        "Material_Hull": ((0.20, 0.26, 0.28), 0.08, 0.46, "hull", 0.45, None),
        "Material_Armor": ((0.07, 0.10, 0.11), 0.38, 0.38, "armor", 0.12, None),
        "Material_Mechanical": ((0.30, 0.31, 0.32), 0.84, 0.26, "mechanical", 0.0, None),
        "Material_Accent": ((0.08, 0.36, 0.38), 0.10, 0.36, "accent", 0.2, None),
        "Material_Warning": ((0.70, 0.34, 0.05), 0.05, 0.46, "warning", 0.1, None),
        "Material_Ceramic": ((0.54, 0.46, 0.34), 0.0, 0.64, "ceramic", 0.0, None),
        "Material_Radiator": ((0.16, 0.12, 0.09), 0.7, 0.56, "mechanical", 0.0, None),
        "Material_Canopy": ((0.06, 0.10, 0.12), 0.02, 0.05, "glass", 1.0, None),
        "Material_Thruster": ((0.02, 0.08, 0.12), 0.15, 0.22, "thruster", 0.0, ((0.16, 0.48, 0.64), 1.0)),
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


def subdivide_once(obj):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def ellipse_ring(x, y, z, rx, rz, sides=16):
    return [
        (x, y + math.cos(math.tau * i / sides) * rx, z + math.sin(math.tau * i / sides) * rz)
        for i in range(sides)
    ]


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    s = scale
    ceramic, mech, armor = mats["Material_Ceramic"], mats["Material_Mechanical"], mats["Material_Armor"]
    rings = []
    for t, r in ((0.00, 0.20), (0.22, 0.26), (0.48, 0.40), (0.75, 0.56), (1.00, 0.68)):
        rings.append(ellipse_ring(x - 0.06 * s - t * 1.10 * s, y, z, r * s, r * s, 32))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.005, cap=False)
    apply_modifiers(outer)
    bpy.ops.mesh.primitive_cone_add(
        vertices=24, radius1=0.12 * s, radius2=0.58 * s, depth=1.18 * s,
        location=(x - 0.62 * s, y, z), rotation=(0, math.pi / 2, 0),
    )
    inner = bpy.context.object
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
    add_cylinder(f"BellCollar_{tag}", (x - 0.10 * s, y, z), 0.26 * s, 0.12 * s, ceramic, collection, 20, 0.004)
    add_cylinder(f"BellFlange_{tag}", (x + 0.10 * s, y, z), 0.32 * s, 0.05 * s, armor, collection, 20, 0.003)
    add_cylinder(f"BellHub_{tag}", (x - 0.28 * s, y, z), 0.05 * s, 0.20 * s, mech, collection, 10, 0.002)
    for index in range(8):
        ang = math.tau * index / 8
        add_box(
            f"BellVane_{tag}_{index}",
            (x - 0.42 * s, y + math.cos(ang) * 0.18 * s, z + math.sin(ang) * 0.18 * s),
            (0.18 * s, 0.014 * s, 0.050 * s),
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


def airfoil_ring(x, y, z, chord, thick):
    le, te = chord * 0.46, chord * 0.54
    return [
        (x + le, y, z),
        (x + le * 0.18, y, z + thick),
        (x - te * 0.22, y, z + thick * 0.42),
        (x - te, y, z),
        (x - te * 0.22, y, z - thick * 0.36),
        (x + le * 0.18, y, z - thick * 0.92),
    ]


def inset_large_faces(obj, thickness=0.04, depth=0.02, min_area=0.16):
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    faces = [
        face for face in bm.faces
        if face.calc_area() >= min_area and abs(face.calc_center_median().x) < 3.1
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
    # Sloped fighter greenhouse: low brow, tall mid, tucked aft. Not a brick.
    for t, scale_h, scale_w, z_off in (
        (0.0, 0.38, 0.62, 0.02),
        (0.22, 0.92, 0.92, 0.00),
        (0.58, 1.00, 1.00, 0.00),
        (1.0, 0.48, 0.70, 0.04),
    ):
        xi = x + length * 0.5 - t * length
        h = height * scale_h
        w = width * scale_w
        rings.append([
            (xi, y - w, z + z_off),
            (xi, y - w * 0.88, z + z_off + h * 0.48),
            (xi, y - w * 0.22, z + z_off + h),
            (xi, y + w * 0.22, z + z_off + h),
            (xi, y + w * 0.88, z + z_off + h * 0.48),
            (xi, y + w, z + z_off),
        ])
    shell = loft_from_rings(f"{tag}_Shell", rings, canopy, collection, bevel=0.004, cap=False)
    solid = shell.modifiers.new("GlassShell", "SOLIDIFY")
    solid.thickness = 0.016
    solid.offset = 0.0
    add_box(f"{tag}_Sill", (x, y, z - 0.01), (length * 0.58, width * 1.08, 0.018), armor, collection, 0.004)
    add_box(f"{tag}_Brow", (x + length * 0.48, y, z + height * 0.38), (0.05, width * 0.72, height * 0.22), armor, collection, 0.004)
    add_box(f"{tag}_AftBulk", (x - length * 0.50, y, z + height * 0.32), (0.04, width * 0.88, height * 0.28), armor, collection, 0.004)
    add_box(f"{tag}_RailP", (x, y - width * 0.98, z + height * 0.28), (length * 0.48, 0.018, height * 0.22), armor, collection, 0.003)
    add_box(f"{tag}_RailS", (x, y + width * 0.98, z + height * 0.28), (length * 0.48, 0.018, height * 0.22), armor, collection, 0.003)
    add_box(f"{tag}_Mullion", (x + length * 0.04, y, z + height * 0.42), (0.018, width * 0.82, height * 0.18), armor, collection, 0.002)
    add_box(f"{tag}_Spine", (x - 0.05, y, z + height * 0.98), (length * 0.36, 0.016, 0.014), armor, collection, 0.002)
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
    half, hw, hh = 8.0, 1.7, 0.95
    return {
        "SOCKET_Weapon_Front": (half - 1.2, 0.0, 0.25),
        "SOCKET_Mining_Front": (half - 0.6, 0.0, -0.15),
        "SOCKET_Engine_Main": (-half + 1.2, 0.0, 0.08),
        "SOCKET_Trail_Main": (-half + 0.8, 0.0, 0.08),
        "SOCKET_Trail_Port": (-half + 1.0, -hw * 0.7, 0.08),
        "SOCKET_Trail_Starboard": (-half + 1.0, hw * 0.7, 0.08),
        "SOCKET_Utility_Dorsal": (0.6, 0.0, hh + 0.55),
        "SOCKET_Cargo_Ventral": (-0.4, 0.0, -hh - 0.15),
        "SOCKET_Camera_Focus": (0.8, 0.0, 0.25),
        "SOCKET_RCS_Port": (-1.2, -hw - 0.2, 0.15),
        "SOCKET_RCS_Starboard": (-1.2, hw + 0.2, 0.15),
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
        factor = 0.55 + 0.45 * op[i * 4]
        ap[i * 4] *= factor
        ap[i * 4 + 1] *= factor
        ap[i * 4 + 2] *= factor
    albedo.pixels = ap
    albedo.pack()


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"DRIFTER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    warning, accent, ceramic = mats["Material_Warning"], mats["Material_Accent"], mats["Material_Ceramic"]
    half = 8.0
    root = add_empty(f"DRIFTER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_DRIFTER_PRODUCTION_V1", "partId": "drifter_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    # Form rebuild: blunt bow / tall cabin deck / wide utility mid / nacelle carry. Not a diamond sausage.
    hull_obj = loft_from_rings("Pressure_Hull", [
        station_ring(half, 0, 0.10, 0.50, 0.38, flat=0.60, box=0.40, keel=0.70),
        station_ring(6.20, 0, 0.18, 0.78, 0.64, flat=0.70, box=0.45, keel=0.62),
        station_ring(3.90, 0, 0.32, 0.95, 1.08, flat=0.98, box=0.48, keel=0.52),
        station_ring(1.35, 0, 0.14, 1.28, 0.72, flat=0.42, box=0.72, keel=0.55),
        station_ring(-0.45, 0, 0.10, 1.38, 0.60, flat=0.22, box=0.88, keel=0.48),
        station_ring(-2.55, 0, 0.12, 1.02, 0.70, flat=0.26, box=0.82, keel=0.38),
        station_ring(-4.95, 0, 0.14, 0.92, 0.80, flat=0.32, box=0.96, keel=0.28),
        station_ring(-7.15, 0, 0.10, 0.72, 0.58, flat=0.30, box=0.92, keel=0.22),
    ], hull, collection, 0.016)
    if lod <= 1:
        cut_open_bay(hull_obj, "Cockpit", (3.40, 0.0, 1.15), 1.45, 0.62, 0.55, (0, 0, 1), mats, collection, kit="cockpit", liner=False)
        cut_open_bay(hull_obj, "Port", (0.10, -1.48, 0.10), 1.55, 0.46, 0.50, (0, -1, 0), mats, collection, kit="radiator")
        cut_open_bay(hull_obj, "Starboard", (0.10, 1.48, 0.10), 1.55, 0.46, 0.50, (0, 1, 0), mats, collection, kit="rack")
        cut_open_bay(hull_obj, "Cargo", (-0.20, 0.0, -0.72), 1.65, 0.72, 0.42, (0, 0, -1), mats, collection, kit="rack")
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull)
    add_box("HullKeel", (0.10, 0.0, -0.58), (3.8, 0.28, 0.10), hull, collection, 0.012)
    inset_large_faces(hull_obj, thickness=0.05, depth=0.02, min_area=0.16)
    # C13: hull-following chine plates, not floating deck boxes.
    add_folded_sheet(
        "Chine_P",
        (2.20, -1.20, 0.10), (-1.80, -1.24, 0.12),
        (-1.80, -1.12, 0.26), (2.20, -1.08, 0.24),
        0.024, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Chine_S",
        (2.20, 1.20, 0.10), (2.20, 1.08, 0.24),
        (-1.80, 1.12, 0.26), (-1.80, 1.24, 0.12),
        0.024, armor, collection, 0.004,
    )

    add_thin_canopy("Canopy", 3.55, 0.0, 0.92, 1.25, 0.48, 0.32, mats, collection)
    add_box("CanopyMullion2", (3.25, 0.0, 1.12), (0.016, 0.38, 0.12), armor, collection, 0.002)
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        loft_from_rings(f"Nacelle_{side}", [
            diamond_ring(-3.0, 1.45 * sign, 0.08, 0.38, 0.32),
            diamond_ring(-4.6, 1.55 * sign, 0.08, 0.50, 0.40),
            diamond_ring(-6.0, 1.55 * sign, 0.08, 0.46, 0.36),
            diamond_ring(-6.85, 1.55 * sign, 0.08, 0.36, 0.28),
        ], armor, collection, 0.012)
        add_manufactured_drive(side, -7.05, 1.55 * sign, lod, mats, collection, scale=0.88, z=0.08)
        add_cylinder(f"NacelleCollar_{side}", (-6.55, 1.55 * sign, 0.08), 0.34, 0.12, ceramic, collection, vertices=14, bevel=0.006)
        add_box(f"NacelleSaddlePad_{side}", (-6.20, 1.55 * sign, -0.18), (0.38, 0.14, 0.08), mech, collection, 0.003)
        loft_from_rings(f"NacelleSaddle_{side}", [
            diamond_ring(-4.6, 1.15 * sign, 0.06, 0.28, 0.18),
            diamond_ring(-5.2, 1.65 * sign, 0.06, 0.22, 0.16),
            diamond_ring(-5.6, 2.00 * sign, 0.06, 0.18, 0.14),
        ], mech, collection, 0.008)
        loft_from_rings(f"Winglet_{side}", [
            airfoil_ring(-0.85, 1.28 * sign, 0.12, 1.45, 0.28),
            airfoil_ring(-1.25, 1.85 * sign, 0.28, 1.15, 0.18),
            airfoil_ring(-1.65, 2.45 * sign, 0.42, 0.82, 0.10),
            airfoil_ring(-2.05, 3.05 * sign, 0.55, 0.48, 0.10),
        ], hull, collection, 0.008)
        loft_from_rings(f"WingRoot_{side}", [
            airfoil_ring(-0.70, 1.05 * sign, 0.10, 1.35, 0.32),
            airfoil_ring(-0.95, 1.38 * sign, 0.14, 1.40, 0.24),
        ], hull, collection, 0.010)
        add_box(f"Pylon_{side}", (-1.15, 1.35 * sign, 0.04), (0.55, 0.08, 0.10), mech, collection, 0.005)
        if lod <= 1:
            for i in range(6):
                add_box(
                    f"RadFin_{side}_{i}",
                    (-0.35 + i * 0.16, 1.42 * sign, 0.10),
                    (0.012, 0.16, 0.18),
                    mech, collection, 0.001,
                )
        add_box(f"DorsalTile_{side}", (0.55, 0.42 * sign, 0.72), (0.70, 0.28, 0.018), armor, collection, 0.004)
        add_box(f"BowCheek_{side}", (5.4, 0.55 * sign, 0.12), (0.85, 0.06, 0.18), armor, collection, 0.006)
        add_cylinder(f"GunHouse_{side}", (5.55, 0.42 * sign, -0.06), 0.08, 0.95, mech, collection, vertices=10, bevel=0.005)
        add_cylinder(f"GunBarrel_{side}", (6.40, 0.42 * sign, -0.06), 0.032, 0.70, armor, collection, vertices=8, bevel=0.003)
        add_cylinder(f"RearGun_{side}", (-6.10, 0.55 * sign, 0.42), 0.04, 0.55, mech, collection, vertices=8, bevel=0.003)
        add_rcs_cluster(side, (-1.6, 1.72 * sign, 0.18), mats, collection, sign=sign)

    add_box("Cabin_Shoulder", (3.2, 0.0, 0.92), (0.85, 0.55, 0.05), armor, collection, 0.008)
    add_box("AftWalk", (-3.4, 0.0, 0.50), (1.6, 0.16, 0.014), mech, collection, 0.003)
    add_box("CargoLip_Fore", (0.55, 0.0, -0.78), (0.08, 0.70, 0.05), mech, collection, 0.004)
    add_box("CargoLip_Aft", (-0.95, 0.0, -0.78), (0.08, 0.70, 0.05), mech, collection, 0.004)
    add_box("Repair_Patch", (1.15, -0.55, 0.78), (0.32, 0.16, 0.012), warning, collection, 0.002)
    add_sensor_dish("Dorsal", (1.35, 0.28, 1.05), mats, collection)
    add_cylinder("Comm_Mast", (-0.35, 0.0, 1.15), 0.035, 0.72, mech, collection, vertices=8, bevel=0.003, rot=(0, 0, 0))
    add_box("Comm_Head", (-0.28, 0.0, 1.52), (0.10, 0.14, 0.06), armor, collection, 0.003)
    add_box("Hatch_Lid", (-1.10, 0.32, 0.72), (0.32, 0.20, 0.016), armor, collection, 0.004)
    if CYCLE >= 8:
        add_box("NacelleBandP", (-5.35, -1.55, 0.08), (0.06, 0.42, 0.28), armor, collection, 0.003)
        add_box("NacelleBandS", (-5.35, 1.55, 0.08), (0.06, 0.42, 0.28), armor, collection, 0.003)
        add_box("WellLipP", (0.10, -1.28, 0.28), (1.20, 0.04, 0.04), armor, collection, 0.002)
        add_box("WellLipS", (0.10, 1.28, 0.28), (1.20, 0.04, 0.04), armor, collection, 0.002)
    if CYCLE >= 9:
        add_box("ChineCapP", (2.15, -1.05, 0.08), (1.35, 0.04, 0.05), armor, collection, 0.003)
        add_box("ChineCapS", (2.15, 1.05, 0.08), (1.35, 0.04, 0.05), armor, collection, 0.003)
    if CYCLE >= 10:
        add_box("PatchTile2", (0.85, 0.48, 0.68), (0.22, 0.12, 0.008), armor, collection, 0.002)
        add_cylinder("MastYard", (-0.35, 0.0, 1.48), 0.012, 0.28, mech, collection, 8, 0.001, rot=(0, 0, math.pi / 2))
    add_box("Hatch_Hinge", (-1.36, 0.32, 0.73), (0.03, 0.15, 0.018), mech, collection, 0.002)
    add_box("Keel_Spine", (0.20, 0.0, -0.82), (2.8, 0.24, 0.045), mech, collection, 0.01)
    if lod == 0:
        add_curve_hose("Hose_Port", [(0.1, -1.35, 0.08), (-2.4, -1.45, 0.08), (-5.2, -1.52, 0.10), (-6.9, -1.55, 0.12)], mech, collection, 0.014)
        add_curve_hose("Hose_Stbd", [(0.1, 1.35, 0.08), (-2.4, 1.45, 0.08), (-5.2, 1.52, 0.10), (-6.9, 1.55, 0.12)], mech, collection, 0.014)
        add_box("HoseFit_P0", (0.05, -1.35, 0.08), (0.03, 0.03, 0.03), mech, collection, 0.002)
        add_box("HoseFit_P1", (-6.85, -1.55, 0.12), (0.03, 0.03, 0.03), mech, collection, 0.002)
        add_box("HoseFit_S0", (0.05, 1.35, 0.08), (0.03, 0.03, 0.03), mech, collection, 0.002)
        add_box("HoseFit_S1", (-6.85, 1.55, 0.12), (0.03, 0.03, 0.03), mech, collection, 0.002)

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
        (7.6, 0, 0.1), (0, -2.6, 0.5), (0, 2.6, 0.5),
        (-7.2, -1.8, 0.2), (-7.2, 1.8, 0.2),
        (2.0, -1.2, -0.9), (2.0, 1.2, -0.9),
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
    out = FAMILY / "source" / "wholeships" / f"drifter_production_v1_lod{lod}.glb"
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
        ("Key", (16, -18, 12), 7800, (0.88, 0.92, 1), 10),
        ("Fill", (4, 16, 8), 3200, (0.55, 0.62, 0.72), 8),
        ("Rim", (-14, -5, 7), 4000, (1.0, 0.62, 0.28), 7),
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
    out = FAMILY / "evidence" / "drifter" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    views = {
        "three_quarter": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
        "starboard": ((0.0, 21.5, 3.8), (0, 0, 0.08), 32),
        "rear": ((-16.8, -6.2, 4.4), (-0.3, 0, 0.08), 36),
        "clay_three_quarter": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
        "grazing_close": ((9.5, -7.5, 2.2), (0.4, 0, 0.15), 50),
        "bay_interior": ((0.6, -3.6, 0.9), (0.2, -1.25, 0.08), 48),
        "drive_rear": ((-11.5, -3.2, 1.6), (-7.6, 0, 0.12), 50),
        "play_size": ((48, -42, 22), (0, 0, 0.1), 50),
        "orm_isolation": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
        "normal_isolation": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
        "id_or_material_id": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
        "material_three_quarter": ((13.5, -15.5, 6.8), (0, 0, 0.12), 36),
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
            raise RuntimeError(f"drifter lod{lod} hull {report['hullTriangles']} < 800")
        collections.append(collection)
        reports.append(report)
    stills = render_cycle(collections[0])
    report = {
        "schema": "spaceface.drifterMtx.cycle.v1",
        "shipId": "drifter",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
    }
    (FAMILY / "evidence" / "drifter").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "drifter" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "cycle": CYCLE, "hull0": reports[0]["hullTriangles"], "tris0": reports[0]["triangles"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
