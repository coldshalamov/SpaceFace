"""PQ-050.03 Ranger MTX builder. Hitch untouched. --mtx-cycle N writes exact-GLB chase stills."""
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
    add_flared_bell,
    cover_loft_with_plates,
    add_manufactured_drive,
    add_overlap_plate,
    add_radiator_cassette,
    add_rcs_cluster,
    add_sensor_dish,
    apply_modifiers,
    center_loft,
    cut_open_bay,
    cut_slot_bank,
    densify_ring,
    loft_shell,
    station_ring,
)
from spaceface_chase_camera import (  # noqa: E402
    DISTANCE_CLOSE,
    DISTANCE_DEFAULT,
    render_chase_still,
    render_cycle_chase_stills,
)

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ranger"
TEX_DIR = FAMILY / "source" / "textures"
TEX = 512
CYCLE = 32
X_STRETCH = 1.33  # restores the authored Ranger's live 19 m longitudinal envelope
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
    """Unique Ranger maps. Not a tint of the shared fleet sheet."""
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
    base = write_pixels(f"ranger_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"ranger_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"ranger_{prefix}_normal", nrm, size, "Non-Color")
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
        "Material_Hull": ((0.34, 0.35, 0.34), 0.02, 0.44, "hull", 0.22, None),
        "Material_Secondary": ((0.20, 0.23, 0.25), 0.54, 0.34, "secondary", 0.10, None),
        "Material_Armor": ((0.030, 0.044, 0.052), 0.66, 0.28, "armor", 0.08, None),
        "Material_Mechanical": ((0.14, 0.16, 0.19), 0.92, 0.22, "mechanical", 0.0, None),
        "Material_Accent": ((0.028, 0.22, 0.30), 0.06, 0.28, "accent", 0.20, None),
        "Material_Warning": ((0.58, 0.24, 0.035), 0.02, 0.45, "warning", 0.08, None),
        "Material_Ceramic": ((0.52, 0.49, 0.41), 0.0, 0.65, "ceramic", 0.0, None),
        "Material_Radiator": ((0.085, 0.062, 0.048), 0.74, 0.48, "mechanical", 0.0, None),
        "Material_Canopy": ((0.016, 0.048, 0.060), 0.00, 0.085, "glass", 0.30, None),
        "Material_Thruster": ((0.012, 0.045, 0.065), 0.12, 0.22, "thruster", 0.0, ((0.10, 0.38, 0.52), 0.80)),
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
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.42
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.42
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.45
            bsdf.inputs["Alpha"].default_value = 0.48
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


def add_oval_prism(name, loc, rx, ry, half_z, material, collection, segments=28, warp=0.0):
    """Closed, slightly warped oval plate with real edge thickness."""
    cx, cy, cz = loc
    verts = []
    for z_offset in (-half_z, half_z):
        for index in range(segments):
            angle = math.tau * index / segments
            ripple = warp * math.sin(angle * 2.0)
            verts.append((cx + math.cos(angle) * rx, cy + math.sin(angle) * ry, cz + z_offset + ripple))
    bottom_center = len(verts)
    verts.append((cx, cy, cz - half_z))
    top_center = len(verts)
    verts.append((cx, cy, cz + half_z))
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.extend((
            (index, nxt, segments + nxt, segments + index),
            (bottom_center, nxt, index),
            (top_center, segments + index, segments + nxt),
        ))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, 0.018)


def add_formed_oval_face(name, loc, rx, ry, material, collection, segments=30):
    """A shallow formed sensor face with a real perimeter break and dish."""
    cx, cy, cz = loc
    verts = []
    for index in range(segments):
        angle = math.tau * index / segments
        warp = 0.025 * math.sin(angle * 2.0)
        verts.append((cx + math.cos(angle) * rx, cy + math.sin(angle) * ry, cz + warp))
    for index in range(segments):
        angle = math.tau * index / segments
        warp = 0.016 * math.sin(angle * 2.0)
        verts.append((cx + math.cos(angle) * rx * 0.82, cy + math.sin(angle) * ry * 0.78, cz + 0.035 + warp))
    center = len(verts)
    verts.append((cx - 0.06, cy, cz - 0.025))
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((index, nxt, segments + nxt, segments + index))
        faces.append((center, segments + index, segments + nxt))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, 0.010)


def add_array_paddle(name, loc, mats, collection, detail=0):
    """High flank survey array: a formed plate on a load-bearing gimbal.

    The Ranger fiction calls for a high, flat, slightly warped oval paddle. It
    must retain a plate read without collapsing to a paper disc at the abeam
    chase camera. A deep rolled rim, inset face, rear A-frame, and inboard
    service cassette provide the required section and attachment mass.
    """
    cx, cy, cz = loc
    sign = 1.0 if cy >= 0.0 else -1.0
    segments = 30 if detail == 0 else 22
    # C31: deeper rolled rim (half_z 0.20) exposes plate section at abeam camera.
    add_oval_prism(f"{name}_RolledRim", loc, 1.50, 0.72, 0.20, mats["Material_Secondary"], collection, segments, 0.045)
    add_formed_oval_face(f"{name}_SensorFace", (cx + 0.04, cy + 0.035 * sign, cz + 0.255), 1.22, 0.50, mats["Material_Ceramic"], collection, segments)

    # C31: three physical seams divide the replaceable face into quadrants
    # for a formed-panel read. Kept low contrast — structure, not decoration.
    for index, x_offset in enumerate((-0.58, 0.00, 0.38)):
        add_box(
            f"{name}_FaceSeam_{index}", (cx + x_offset, cy + 0.02 * sign, cz + 0.295),
            (0.020, 0.42, 0.011), mats["Material_Secondary"], collection, 0.004,
        )
    # Horizontal seam across the mid-height of the face.
    add_box(
        f"{name}_FaceSeamH", (cx - 0.06, cy + 0.02 * sign, cz + 0.295),
        (1.10, 0.022, 0.011), mats["Material_Secondary"], collection, 0.004,
    )

    # Inboard cassette and a visible rear A-frame carry the formed plate into
    # its dual-axis pivot. These sit below the face but remain visible in the
    # 60-degree chase and abeam views.
    root = (cx, cy - 0.54 * sign, cz - 0.10)
    add_box(f"{name}_ServiceCassette", root, (0.36, 0.24, 0.22), mats["Material_Armor"], collection, 0.018)
    for suffix, x_offset in (("Fore", 0.72), ("Aft", -0.72)):
        add_beam_between(
            f"{name}_TopYoke_{suffix}",
            (cx, cy - 0.70 * sign, cz + 0.12),
            (cx + x_offset, cy - 0.44 * sign, cz + 0.20),
            0.065, 0.055, mats["Material_Armor"], collection, 0.006,
        )
    for suffix, x_offset in (("Fore", 0.96), ("Aft", -0.96)):
        add_beam_between(
            f"{name}_RearTruss_{suffix}",
            (root[0] + 0.12, root[1], root[2] - 0.02),
            (cx + x_offset, cy + 0.10 * sign, cz - 0.17),
            0.058, 0.048, mats["Material_Mechanical"], collection, 0.006,
        )
    add_beam_between(
        f"{name}_RearCrossmember",
        (cx - 0.94, cy + 0.08 * sign, cz - 0.20),
        (cx + 0.94, cy + 0.08 * sign, cz - 0.20),
        0.050, 0.044, mats["Material_Mechanical"], collection, 0.005,
    )


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


def ellipse_ring(x, y, z, rx, rz, sides=16):
    return [
        (x, y + math.cos(math.tau * i / sides) * rx, z + math.sin(math.tau * i / sides) * rz)
        for i in range(sides)
    ]


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    s = scale
    ceramic, mech, armor = mats["Material_Ceramic"], mats["Material_Mechanical"], mats["Material_Armor"]
    rings = []
    for t, r in ((0.00, 0.48), (0.22, 0.40), (0.48, 0.28), (0.75, 0.20), (1.00, 0.16)):
        rings.append(ellipse_ring(x - 0.08 * s - t * 0.90 * s, y, z, r * s, r * s, 22))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.005, cap=False)
    apply_modifiers(outer)
    bpy.ops.mesh.primitive_cone_add(
        vertices=20, radius1=0.38 * s, radius2=0.07 * s, depth=1.00 * s,
        location=(x - 0.50 * s, y, z), rotation=(0, math.pi / 2, 0),
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
    add_cylinder(f"BellCollar_{tag}", (x - 0.10 * s, y, z), 0.24 * s, 0.11 * s, ceramic, collection, 18, 0.004)
    add_cylinder(f"BellFlange_{tag}", (x + 0.10 * s, y, z), 0.30 * s, 0.05 * s, armor, collection, 18, 0.003)
    add_cylinder(f"BellHub_{tag}", (x - 0.26 * s, y, z), 0.045 * s, 0.18 * s, mech, collection, 10, 0.002)
    for index in range(8):
        ang = math.tau * index / 8
        add_box(
            f"BellVane_{tag}_{index}",
            (x - 0.38 * s, y + math.cos(ang) * 0.16 * s, z + math.sin(ang) * 0.16 * s),
            (0.16 * s, 0.012 * s, 0.045 * s),
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


def add_beam_between(name, start, end, width, height, material, collection, bevel=0.008):
    """Rectangular formed boom between arbitrary points with a visible section."""
    a, b = Vector(start), Vector(end)
    direction = b - a
    if direction.length < 1e-6:
        raise ValueError(f"{name} beam endpoints coincide")
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("X", "Z").to_euler()
    obj.scale = (direction.length * 0.5, width, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)
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


def add_greenhouse(tag, x0, x1, deck_z, half_aft, half_fore, height, mats, collection, detail):
    """Five separate glass panes over a dark cut tub with a formed frame."""
    glass = mats["Material_Canopy"]
    mech = mats["Material_Mechanical"]
    armor = mats["Material_Armor"]
    cx = (x0 + x1) * 0.5
    length = x1 - x0
    zt = deck_z + height
    z0 = deck_z + 0.04
    ra, rf = half_aft * 0.74, half_fore * 0.72
    xa, xf = x0 + 0.26, x1 - 0.34
    add_folded_sheet(f"{tag}_Windscreen", (x1, -half_fore, z0), (x1, half_fore, z0), (xf, rf, zt), (xf, -rf, zt), 0.024, glass, collection, 0.003)
    add_folded_sheet(f"{tag}_Roof", (xf, -rf, zt), (xf, rf, zt), (xa, ra, zt), (xa, -ra, zt), 0.024, glass, collection, 0.003)
    add_folded_sheet(f"{tag}_AftPane", (xa, -ra, zt), (xa, ra, zt), (x0, half_aft, z0), (x0, -half_aft, z0), 0.024, glass, collection, 0.003)
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_folded_sheet(f"{tag}_Pane_{side}", (x1, sign * half_fore, z0), (xf, sign * rf, zt), (xa, sign * ra, zt), (x0, sign * half_aft, z0), 0.024, glass, collection, 0.003)
        add_folded_sheet(f"{tag}_Arch_{side}", (x1 + 0.01, sign * (half_fore + 0.012), z0), (xf, sign * (rf + 0.012), zt + 0.012), (xa, sign * (ra + 0.012), zt + 0.012), (x0 - 0.01, sign * (half_aft + 0.012), z0), 0.072, mech, collection, 0.004)
        add_folded_sheet(f"{tag}_Sill_{side}", (x1 + 0.05, sign * (half_fore + 0.03), deck_z - 0.01), (x0 - 0.05, sign * (half_aft + 0.03), deck_z - 0.01), (x0 - 0.05, sign * (half_aft + 0.03), deck_z + 0.075), (x1 + 0.05, sign * (half_fore + 0.03), deck_z + 0.075), 0.075, mech, collection, 0.004)
    add_box(f"{tag}_SillFore", (x1 + 0.055, 0.0, deck_z + 0.045), (0.070, half_fore + 0.08, 0.070), mech, collection, 0.005)
    add_box(f"{tag}_SillAft", (x0 - 0.055, 0.0, deck_z + 0.045), (0.070, half_aft + 0.08, 0.070), mech, collection, 0.005)
    add_box(f"{tag}_Header", (xf, 0.0, zt + 0.016), (0.062, rf + 0.03, 0.058), mech, collection, 0.004)
    add_box(f"{tag}_Coaming", (xa, 0.0, zt + 0.016), (0.055, ra + 0.03, 0.052), mech, collection, 0.004)
    add_box(f"{tag}_Spine", (cx - 0.04, 0.0, zt + 0.024), (length * 0.34, 0.042, 0.036), mech, collection, 0.004)
    if detail <= 1:
        for index, amount in enumerate((0.34, 0.62)):
            xm = x0 + length * amount
            width = half_aft + (half_fore - half_aft) * amount
            add_box(f"{tag}_Mullion_{index}", (xm, 0.0, zt + 0.008), (0.018, width * 0.66, 0.032), mech, collection, 0.003)
    # C31: deeper tub floor (-0.52) and side walls make the dark cavity
    # read at close-chase and expose genuine glass-over-void at 60-degree.
    add_box(f"{tag}_TubFloor", (cx, 0.0, deck_z - 0.52), (length * 0.44, half_aft * 0.84, 0.036), armor, collection, 0.004)
    add_box(f"{tag}_TubAft", (x0 + 0.18, 0.0, deck_z - 0.26), (0.042, half_aft * 0.76, 0.30), armor, collection, 0.004)
    # Tub side walls — give the greenhouse a perimeter ledge readable at abeam
    for sgn, sl in ((-1, "P"), (1, "S")):
        add_box(f"{tag}_TubSide_{sl}", (cx, sgn * half_aft * 0.91, deck_z - 0.24), (length * 0.38, 0.038, 0.28), armor, collection, 0.004)


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
    half, hw, hh = 9.0, 1.65, 0.92
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
        factor = 0.84 + 0.16 * op[i * 4]
        ap[i * 4] *= factor
        ap[i * 4 + 1] *= factor
        ap[i * 4 + 2] *= factor
    albedo.pixels = ap
    albedo.pack()


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"RANGER_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    secondary = mats["Material_Secondary"]
    warning, accent, ceramic = mats["Material_Warning"], mats["Material_Accent"], mats["Material_Ceramic"]
    radiator = mats["Material_Radiator"]
    half = 8.2
    root = add_empty(f"RANGER_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_RANGER_PRODUCTION_V1", "partId": "ranger_production_v1",
        "lod": f"lod{lod}", "slot": "hull", "category": "wholeships",
        "forward": "+X", "embeddedPlume": False,
    }
    # C23 explorer pressure shell: blunt optical cabin, hard shoulder, narrow
    # survey waist, then a flared drive bulkhead. Planform changes are large
    # enough to survive the D=144 player camera.
    hull_obj = loft_from_rings("Pressure_Hull", [
        densify_ring(station_ring(6.50, 0, 0.06, 0.36, 0.26, flat=0.30, box=0.18, keel=0.86)),
        densify_ring(station_ring(5.72, 0, 0.12, 0.88, 0.48, flat=0.48, box=0.30, keel=0.78)),
        densify_ring(station_ring(4.55, 0, 0.22, 1.48, 0.78, flat=0.76, box=0.48, keel=0.66)),
        densify_ring(station_ring(3.15, 0, 0.28, 1.72, 0.96, flat=0.94, box=0.58, keel=0.56)),
        densify_ring(station_ring(1.75, 0, 0.18, 1.58, 0.82, flat=0.78, box=0.70, keel=0.50)),
        densify_ring(station_ring(0.45, 0, 0.10, 1.08, 0.64, flat=0.50, box=0.82, keel=0.42)),
        densify_ring(station_ring(-0.82, 0, 0.08, 0.78, 0.54, flat=0.34, box=0.84, keel=0.38)),
        densify_ring(station_ring(-2.05, 0, 0.10, 1.18, 0.64, flat=0.42, box=0.86, keel=0.34)),
        densify_ring(station_ring(-3.25, 0, 0.12, 1.52, 0.68, flat=0.56, box=0.92, keel=0.26)),
        densify_ring(station_ring(-4.35, 0, 0.08, 0.82, 0.46, flat=0.48, box=0.88, keel=0.24)),
    ], hull, collection, 0.016)
    if lod <= 1:
        cut_open_bay(hull_obj, "Cockpit", (4.18, 0.0, 1.18), 1.58, 0.74, 0.70, (0, 0, 1), mats, collection, kit="empty", liner=False)
        cut_open_bay(hull_obj, "PulseCore", (-0.25, 0.0, 0.84), 0.95, 0.52, 0.56, (0, 0, 1), mats, collection, kit="empty", liner=False)
        cut_open_bay(hull_obj, "Cargo", (-0.20, 0.0, -0.72), 1.65, 0.62, 0.38, (0, 0, -1), mats, collection, kit="empty", liner=False)
        boolean_cut(hull_obj, "TransomRecess", (-5.68, 0.0, 0.08), (0.18, 0.24, 0.16))
        boolean_cut(hull_obj, "KeelChannel", (-2.40, 0.0, -0.78), (2.20, 0.10, 0.10))
        hull_obj.data.materials.clear()
        hull_obj.data.materials.append(hull)
    inset_large_faces(hull_obj, thickness=0.05, depth=0.02, min_area=0.16)
    # C13: hull-following chine plates, not floating deck boxes.
    add_folded_sheet(
        "Chine_P",
        (2.20, -1.00, 0.10), (-1.80, -1.04, 0.12),
        (-1.80, -0.92, 0.26), (2.20, -0.88, 0.24),
        0.024, armor, collection, 0.004,
    )
    add_folded_sheet(
        "Chine_S",
        (2.20, 1.00, 0.10), (2.20, 0.88, 0.24),
        (-1.80, 0.92, 0.26), (-1.80, 1.04, 0.12),
        0.024, armor, collection, 0.004,
    )
    add_greenhouse("Canopy", 2.58, 5.78, 0.88, 0.88, 0.54, 0.80, mats, collection, lod)
    # C31: shoulder plate extended aft and raised slightly to close the
    # gap between cabin and waist station at the close-chase camera.
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_folded_sheet(
            f"CabinShoulder_{side}",
            (5.42, 0.56 * sign, 0.56), (2.54, 0.92 * sign, 0.84),
            (2.46, 1.12 * sign, 0.58), (5.24, 0.80 * sign, 0.38),
            0.075, secondary, collection, 0.009,
        )
        # Small step plate bridging shoulder to waist — a manufactured seam
        # rather than a smooth taper between the two volumes.
        add_box(
            f"CabinShoulderStep_{side}",
            (2.62, 0.98 * sign, 0.64),
            (0.045, 0.22, 0.28),
            armor, collection, 0.008,
        )
    # Pulse-core well and open gel rack: dark utility volume plus three
    # mismatched replaceable housings immediately aft of the greenhouse.
    add_box("PulseCoreWellFloor", (-0.25, 0.0, 0.46), (1.02, 0.50, 0.035), mech, collection, 0.006)
    add_folded_sheet("PulseCoreRimP", (0.95, -0.66, 0.92), (-1.45, -0.66, 0.84), (-1.45, -0.52, 0.94), (0.95, -0.52, 1.02), 0.075, secondary, collection, 0.008)
    add_folded_sheet("PulseCoreRimS", (0.95, 0.52, 1.02), (-1.45, 0.52, 0.94), (-1.45, 0.66, 0.84), (0.95, 0.66, 0.92), 0.075, secondary, collection, 0.008)
    add_box("GelRackFloor", (1.62, -0.50, 1.00), (1.02, 0.36, 0.060), mech, collection, 0.008)
    add_box("GelRackRailOuter", (1.62, -0.91, 1.22), (1.06, 0.050, 0.24), armor, collection, 0.006)
    add_box("GelRackRailInner", (1.62, -0.09, 1.22), (1.06, 0.050, 0.24), armor, collection, 0.006)
    add_box("GelRackBraceFore", (2.66, -0.50, 1.22), (0.050, 0.41, 0.23), mech, collection, 0.005)
    add_box("GelRackBraceAft", (0.58, -0.50, 1.22), (0.050, 0.41, 0.23), mech, collection, 0.005)
    # Mismatched upright service canisters match the ship's open-rack fiction
    # and expose circular lids at the chase camera instead of collapsing into
    # one inline orange patch.
    # C31: drums moved outboard and raised to avoid z-fighting with rack floor.
    # Wider lid flanges and raised base-bands separate each cylinder visually.
    drum_specs = (
        (2.22, -0.64, 0.21, 0.44, ceramic),
        (1.72, -0.60, 0.24, 0.52, warning),
        (1.20, -0.64, 0.20, 0.40, secondary),
        (0.82, -0.40, 0.16, 0.33, radiator),
    )
    for index, (x, y, radius, depth, drum_mat) in enumerate(drum_specs):
        center_z = 1.10 + depth * 0.5
        add_cylinder(f"PulseGelDrum_{index}", (x, y, center_z), radius, depth, drum_mat, collection, vertices=20, bevel=0.010, rot=(0, 0, 0))
        # Wider lid flange reads as a distinct edge at close camera.
        add_cylinder(f"PulseGelLid_{index}", (x, y, 1.10 + depth + 0.025), radius + 0.040, 0.056, mech, collection, vertices=20, bevel=0.005, rot=(0, 0, 0))
        add_cylinder(f"PulseGelCap_{index}", (x, y, 1.10 + depth + 0.065), radius * 0.36, 0.038, drum_mat, collection, vertices=16, bevel=0.003, rot=(0, 0, 0))
        # Base band — a wider ring at the drum foot gives it a standing presence.
        add_cylinder(f"PulseGelBase_{index}", (x, y, 1.10 + 0.020), radius + 0.028, 0.038, mech, collection, vertices=20, bevel=0.004, rot=(0, 0, 0))
        add_box(f"PulseGelTie_{index}", (x, y, center_z), (radius + 0.055, 0.028, 0.042), mech, collection, 0.004)
    center_loft("AftDriveBridge", [
        (-1.55, 1.00, 0.02, 0.52),
        (-2.45, 1.46, -0.04, 0.64),
        (-3.35, 1.66, -0.06, 0.60),
        (-4.10, 0.90, -0.08, 0.42),
    ], secondary, collection, 0.016)
    # Four stepped pressure-backed spine bays with real joints. The gaps and
    # radiator ribs keep this from becoming one black rectangular trench.
    center_loft("SensorSpineFore", [
        (0.92, 0.32, 0.86, 1.34), (-0.94, 0.34, 0.88, 1.44),
    ], secondary, collection, 0.016)
    center_loft("SensorSpineMid", [
        (-1.10, 0.32, 0.86, 1.42), (-3.02, 0.28, 0.78, 1.34),
    ], secondary, collection, 0.016)
    center_loft("SensorSpineAft", [
        (-3.18, 0.27, 0.77, 1.31), (-5.14, 0.22, 0.68, 1.20),
    ], secondary, collection, 0.016)
    center_loft("SensorSpineTail", [
        (-5.30, 0.21, 0.67, 1.17), (-7.02, 0.14, 0.62, 1.02),
    ], secondary, collection, 0.016)
    for index, (x, width, z) in enumerate(((-1.02, 0.38, 1.16), (-3.10, 0.33, 1.06), (-5.22, 0.27, 0.94))):
        add_box(f"SensorSpineJoint_{index}", (x, 0.0, z), (0.065, width, 0.24), mech, collection, 0.008)
    # Distinct descending instrument housings turn the four pressure-backed
    # bays into an articulated survey spine rather than a continuous rail.
    for index, (x, half_x, half_y, z) in enumerate((
        (-0.28, 0.30, 0.40, 1.58),
        (-2.12, 0.36, 0.34, 1.51),
        (-4.16, 0.32, 0.28, 1.36),
        (-5.92, 0.26, 0.22, 1.18),
    )):
        add_box(f"SensorHead_{index}", (x, 0.0, z), (half_x, half_y, 0.16), armor, collection, 0.022)
        add_cylinder(f"SensorHeadCap_{index}", (x, 0.0, z + 0.18), min(half_x, half_y) * 0.42, 0.09, ceramic, collection, vertices=18, bevel=0.006, rot=(0, 0, 0))
    # C31: broken raceway segments — accent at each spine joint only,
    # not a continuous stripe. Reads as cable-management covers, not paint.
    raceway_caps = (
        (0.62, 0.14, 1.36),   # fore cap
        (-0.70, 0.14, 1.45),  # joint 0-1
        (-1.34, 0.13, 1.44),
        (-2.78, 0.11, 1.36),  # joint 1-2
        (-3.42, 0.11, 1.32),
        (-4.90, 0.09, 1.22),  # joint 2-3
        (-5.54, 0.09, 1.18),
        (-6.72, 0.06, 1.05),  # tail cap
    )
    for index, (xc, wc, zc) in enumerate(raceway_caps):
        add_box(
            f"SensorSpineRaceway_{index}",
            (xc, 0.0, zc),
            (0.14, wc * 0.62, 0.024),
            accent, collection, 0.005,
        )
    for index in range(6):
        x = -1.34 - index * 0.27
        add_box(f"SpineRadiatorRib_{index}", (x, 0.0, 1.465 - index * 0.010), (0.038, 0.29, 0.035), radiator, collection, 0.004)
    # Articulated cool survey pin. A broad turntable, paired box-section links,
    # and visible actuator keep the 90-degree crab boom structural at play size.
    add_box("SurveyBoomPedestal", (-6.72, 0.0, 0.76), (0.34, 0.31, 0.20), armor, collection, 0.020)
    add_cylinder("SurveyBoomTurntable", (-6.86, 0.0, 1.00), 0.31, 0.22, ceramic, collection, vertices=24, bevel=0.008, rot=(0, 0, 0))
    for suffix, z_offset in (("Upper", 0.10), ("Lower", -0.10)):
        add_beam_between(f"SurveyBoomPrimary_{suffix}", (-6.92, 0.0, 0.96 + z_offset), (-7.48, 0.38, 1.00 + z_offset), 0.115, 0.075, secondary, collection, 0.010)
        add_beam_between(f"SurveyBoomCrab_{suffix}", (-7.48, 0.38, 1.00 + z_offset), (-7.80, 1.42, 1.02 + z_offset), 0.100, 0.068, secondary, collection, 0.009)
    add_beam_between("SurveyBoomActuator", (-7.02, 0.02, 0.84), (-7.60, 1.12, 0.92), 0.045, 0.045, mech, collection, 0.005)
    add_cylinder("SurveyBoomShoulderPin", (-6.94, 0.0, 0.98), 0.20, 0.52, mech, collection, vertices=20, bevel=0.006, rot=(math.pi / 2, 0, 0))
    add_cylinder("SurveyBoomJoint", (-7.48, 0.38, 1.00), 0.22, 0.30, ceramic, collection, vertices=22, bevel=0.007, rot=(math.pi / 2, 0, 0))
    add_cylinder("SurveyPinHousing", (-7.80, 1.48, 1.02), 0.18, 0.40, armor, collection, vertices=20, bevel=0.007, rot=(math.pi / 2, 0, 0))
    add_cylinder("SurveyPinCoolTip", (-7.80, 1.75, 1.02), 0.070, 0.14, accent, collection, vertices=16, bevel=0.003, rot=(math.pi / 2, 0, 0))
    for sign, side in ((-1, "Port"), (1, "Starboard")):
        loft_from_rings(f"DriveHouse_{side}", [
            densify_ring(station_ring(-2.65, 1.54 * sign, 0.06, 0.46, 0.42, flat=0.34, box=0.72, keel=0.34)),
            densify_ring(station_ring(-3.60, 1.66 * sign, 0.05, 0.64, 0.60, flat=0.48, box=0.88, keel=0.24)),
            densify_ring(station_ring(-4.55, 1.70 * sign, 0.04, 0.68, 0.64, flat=0.58, box=0.92, keel=0.18)),
            densify_ring(station_ring(-5.20, 1.66 * sign, 0.04, 0.58, 0.57, flat=0.52, box=0.90, keel=0.20)),
        ], secondary, collection, 0.014)
        loft_shell(f"DriveSaddle_{side}", [
            (-2.75, 0.52 * sign, 0.98 * sign, -0.14, 0.30),
            (-3.60, 0.62 * sign, 1.24 * sign, -0.18, 0.34),
            (-4.55, 0.76 * sign, 1.38 * sign, -0.16, 0.32),
            (-5.30, 0.86 * sign, 1.42 * sign, -0.10, 0.26),
        ], mech, collection, 0.008)
        add_flared_bell(side, -5.18, 1.66 * sign, 0.04, 1.00, mats, collection, sides=32 if lod == 0 else 22)
        add_cylinder(f"DriveBandA_{side}", (-3.58, 1.66 * sign, 0.05), 0.68, 0.10, armor, collection, vertices=22, bevel=0.006)
        add_cylinder(f"DriveBandB_{side}", (-4.52, 1.70 * sign, 0.04), 0.71, 0.08, mech, collection, vertices=22, bevel=0.005)
        # Survey array roots carry the high oval paddles without fighter-wing
        # sweep or card-thin sections.
        loft_shell(f"ArrayRoot_{side}", [
            (0.82, 0.78 * sign, 1.30 * sign, 0.54, 1.16),
            (0.15, 0.90 * sign, 1.62 * sign, 0.62, 1.26),
            (-0.68, 1.02 * sign, 1.76 * sign, 0.72, 1.25),
        ], secondary, collection, 0.014)
        add_folded_sheet(
            f"ArrayGusset_{side}",
            (0.70, 0.88 * sign, 1.05), (-0.62, 1.34 * sign, 1.16),
            (-0.62, 1.72 * sign, 1.29), (0.70, 1.18 * sign, 1.28),
            0.075, armor, collection, 0.008,
        )
        add_cylinder(f"ArrayPivotOuter_{side}", (-0.28, 1.58 * sign, 1.24), 0.30, 0.42, ceramic, collection, vertices=24, bevel=0.009)
        add_cylinder(f"ArrayPivotInner_{side}", (-0.28, 1.42 * sign, 1.24), 0.18, 0.54, mech, collection, vertices=20, bevel=0.006)
        add_array_paddle(f"ArrayPaddle_{side}", (-0.28, 2.34 * sign, 1.25), mats, collection, lod)

    # Three discrete chin rods in a forward-splayed triangle: a ranging
    # cluster, never a drill. The splay lets their tips survive the 60° chase.
    chin_rods = (
        ((5.54, 0.00, -0.60), (7.14, 0.00, -1.12)),
        ((5.20, -0.38, -0.58), (6.62, -0.70, -1.05)),
        ((5.20, 0.38, -0.58), (6.62, 0.70, -1.05)),
    )
    for index, (start, end) in enumerate(chin_rods):
        add_beam_between(f"RangeMast_{index}", start, end, 0.035, 0.035, mech, collection, 0.004)
        add_cylinder(f"RangeMastTip_{index}", end, 0.065, 0.11, ceramic, collection, vertices=12, bevel=0.003, rot=(0, 0, 0))

    if False:  # C14 drop kit-on-loaf extras (was CYCLE >= 8)
        add_box("NacelleBandP", (-6.15, -1.20, 0.08), (0.05, 0.34, 0.22), armor, collection, 0.003)
        add_box("NacelleBandS", (-6.15, 1.20, 0.08), (0.05, 0.34, 0.22), armor, collection, 0.003)
        loft_from_rings("SurveyDish", [
            ellipse_ring(0.90, 0.0, 2.44, 0.06, 0.06, 16),
            ellipse_ring(0.98, 0.0, 2.46, 0.14, 0.14, 16),
            ellipse_ring(1.06, 0.0, 2.50, 0.18, 0.18, 16),
            ellipse_ring(1.10, 0.0, 2.54, 0.16, 0.16, 16),
        ], armor, collection, 0.003, cap=False)
    if False:  # C14 drop kit-on-loaf extras (was CYCLE >= 9)
        add_box("ChineCapP", (2.35, -0.98, 0.08), (1.25, 0.035, 0.045), armor, collection, 0.003)
        add_box("ChineCapS", (2.35, 0.98, 0.08), (1.25, 0.035, 0.045), armor, collection, 0.003)
        loft_from_rings("BowCheekP", [
            diamond_ring(6.40, -0.28, 0.04, 0.10, 0.08),
            diamond_ring(5.40, -0.42, 0.06, 0.12, 0.10),
            diamond_ring(4.40, -0.52, 0.08, 0.10, 0.08),
        ], armor, collection, 0.006)
        loft_from_rings("BowCheekS", [
            diamond_ring(6.40, 0.28, 0.04, 0.10, 0.08),
            diamond_ring(5.40, 0.42, 0.06, 0.12, 0.10),
            diamond_ring(4.40, 0.52, 0.08, 0.10, 0.08),
        ], armor, collection, 0.006)
    if False:  # C14 drop kit-on-loaf extras (was CYCLE >= 10)
        add_box("PatchTile2", (0.75, 0.42, 0.62), (0.20, 0.10, 0.008), armor, collection, 0.002)
        add_cylinder("MastYard", (0.85, 0.0, 2.28), 0.012, 0.32, mech, collection, 8, 0.001, rot=(0, 0, math.pi / 2))
        boolean_cut(hull_obj, "BowSensorWell", (6.85, 0.0, 0.18), (0.22, 0.10, 0.08))
    add_folded_sheet(
        "Keel_Spine",
        (1.40, -0.12, -0.82), (-1.60, -0.12, -0.76),
        (-1.60, 0.12, -0.76), (1.40, 0.12, -0.82),
        0.028, mech, collection, 0.004,
    )

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        # The Cycle 23 rebuild accidentally shortened Ranger to ~14 m while
        # its established live envelope is ~19 m. Stretch longitudinal form
        # only; array width and vertical clearance are already role-correct.
        for vertex in obj.data.vertices:
            vertex.co.x *= X_STRETCH
        obj.location.x *= X_STRETCH
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
    out = FAMILY / "source" / "wholeships" / f"ranger_production_v1_lod{lod}.glb"
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
    scene.view_settings.exposure = 0.65
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.042, 0.048, 0.056, 1)
    bg.inputs["Strength"].default_value = 0.72
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 9800, (0.90, 0.93, 1), 10),
        ("Fill", (4, 16, 8), 4200, (0.58, 0.65, 0.76), 8),
        ("ForeFill", (20, 2, 10), 4600, (0.72, 0.78, 0.88), 9),
        ("Rim", (-14, -5, 7), 4800, (0.76, 0.84, 0.96), 7),
        ("Kick", (-6, 10, -4), 2200, (0.72, 0.78, 0.88), 6),
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


def render_cycle(glb_path):
    """Render the legal review set from the exact finalized exported source GLB."""
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(glb_path))
    imported = list(bpy.context.scene.objects)
    for obj in imported:
        if obj.type == "MESH" and (obj.get("collision") or obj.get("nonRender") or "COLLISION" in obj.name.upper()):
            obj.hide_render = True
    meshes = [obj for obj in imported if obj.type == "MESH" and not obj.hide_render]
    if not meshes:
        raise RuntimeError(f"no visible Ranger meshes imported from {glb_path}")
    camera = setup_studio()
    out = FAMILY / "evidence" / "ranger" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    focus = (0.0, 0.0, 0.18)
    render_cycle_chase_stills(camera, out, focus=focus)

    backups = override_emission(meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    # Hard close-chase light exposes edge waves and manufactured section changes.
    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    prior_strength = world_bg.inputs["Strength"].default_value
    world_bg.inputs["Strength"].default_value = 0.12
    render_chase_still(camera, out / "grazing_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    world_bg.inputs["Strength"].default_value = prior_strength

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
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
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
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_emission(meshes, map_emit("normal"))
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    identity = {
        "schema": "spaceface.exactSourceEvidence.v1",
        "shipId": "ranger",
        "cycle": CYCLE,
        "source": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256(glb_path),
        "renderer": "tools/blender/build_ranger_mtx.py+spaceface_chase_camera.py",
        "views": [
            "play_chase.png", "play_chase_abeam.png", "play_chase_close.png",
            "clay_play_chase.png", "grazing_close.png", "orm_isolation.png",
            "normal_isolation.png", "id_or_material_id.png",
        ],
    }
    (out / "EVIDENCE_IDENTITY.json").write_text(json.dumps(identity, indent=2) + "\n", encoding="utf-8")
    return out


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    mats = create_materials()
    reports = []
    collections = []
    outputs = []
    for lod in (0, 1, 2):
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"ranger lod{lod} hull {report['hullTriangles']} < 800")
        collections.append(collection)
        outputs.append(output)
        reports.append(report)
    stills = render_cycle(outputs[0])
    report = {
        "schema": "spaceface.rangerMtx.cycle.v1",
        "shipId": "ranger",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
    }
    (FAMILY / "evidence" / "ranger").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "ranger" / f"cycle_{CYCLE:02d}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "cycle": CYCLE, "hull0": reports[0]["hullTriangles"], "tris0": reports[0]["triangles"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
