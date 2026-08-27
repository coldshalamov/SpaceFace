"""PQ-050.04 Ironback MTX builder. Hitch untouched. --mtx-cycle N writes exact-GLB chase stills.

Cycle 27 is the minimum shared correction from the three Cycle 26 visual reviews.
It keeps the open-well salvage-barge identity, framed cab, four rooted arm
stations, drill cone, four-tine grab, flank seam continuity, aft U-pockets, and
exact-source evidence machinery. It replaces the catamaran sponson gap with one
lofted barge shell and a real hopper cavity, builds chase-countable process,
matches the pulse pair, rebuilds saw/crusher heads, and reclassifies oxide /
ceramic / gunmetal maps. Cycle 18–26 source/evidence stay byte-for-byte
untouched. Close occupancy is the locked +X length axis at 41.28 WU under the
derived D=58 band; do not shorten, dolly, hide geometry, or fake width.

Usage::

  blender --background --python tools/blender/build_ironback_mtx.py -- --mtx-cycle 27
"""

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
    add_hoop_frame,
    add_radiator_cassette,
    add_rcs_cluster,
    apply_modifiers,
    boolean_cut_box,
    boolean_cut_cylinder,
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

FAMILY = ROOT / "assets" / "ships" / "fleet_player_bodies_v1" / "ironback"
TEX_DIR = FAMILY / "source" / "textures"
TEX = 1024
CYCLE = 27
ASSEMBLY_HULL_UNITS = 1.72
IRONBACK_COLLISION_RADIUS = 24.0
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


def _smoothstep(t):
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    return t * t * (3.0 - 2.0 * t)


def _ramped_plate(coord, period, seam, bevel, recess=0.10, plate=0.88):
    """Broad signed plate: seam valley, then a real bevel ramp, then a flat.

    1-pixel height cliffs become thin lavender seams in normal isolation. A
    32–48 px ramp is what the chase cameras can actually see as panel relief.
    """
    c = coord % period
    if c < seam:
        return recess
    dist = min(c - seam, period - c)
    return recess + (plate - recess) * _smoothstep(dist / max(1.0, bevel))


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


def role_height(role, x, y, size):
    """Pass 1: role-specific height. Plate bevels stay on paint; metal and ceramic do not share that grid."""
    u = x / max(1, size - 1)
    v = y / max(1, size - 1)
    if role == "hull":
        along = _ramped_plate(y, 220.0, 32.0, 56.0, 0.04, 0.94)
        frame = _ramped_plate(x, 260.0, 24.0, 48.0, 0.06, 0.92)
        weld = 0.06 * math.sin(u * math.tau * 2.4) * math.sin(v * math.tau * 1.7)
        return max(0.0, min(1.0, min(along, frame) + weld))
    if role == "armor":
        mill = ((x % 28) / 28.0)
        land = 0.42 + 0.46 * _smoothstep(abs(mill - 0.5) * 2.0)
        flute = 0.16 if (y % 64) < 6 else 0.0
        return max(0.0, min(1.0, land - flute))
    if role == "mechanical":
        turn = _ramped_plate(x, 22.0, 3.0, 6.0, 0.18, 0.86)
        heat = 0.22 * (1.0 - u)
        return max(0.0, min(1.0, turn * 0.78 + heat))
    if role == "ceramic":
        g1 = h01(x // 3, y // 3, 11)
        g2 = h01(x // 7, y // 5, 23)
        g3 = h01(x, y, 41)
        pit = 0.22 if h01(x // 13, y // 11, 7) < 0.10 else 0.0
        return max(0.0, min(1.0, 0.38 + g1 * 0.32 + g2 * 0.18 + g3 * 0.16 - pit))
    if role == "radiator":
        louver = _ramped_plate(y, 88.0, 16.0, 24.0, 0.08, 0.76)
        header = _ramped_plate(x, 160.0, 14.0, 26.0, 0.10, 0.48)
        return max(0.0, min(1.0, max(louver, header)))
    if role == "warning":
        return 0.22 * _smoothstep(0.5 + 0.5 * math.sin((x + y) / 42.0))
    if role == "glass":
        return 0.03 * (0.5 + 0.5 * math.sin(u * math.tau * 2.0))
    if role == "thruster":
        flow = 0.22 + 0.62 * (u ** 1.15)
        channel = 0.55 * _smoothstep((math.sin(v * math.tau * 4.0) + 1.0) * 0.5)
        cavity = 0.34 * (1.0 - _smoothstep(min(u, v) * 1.5))
        return max(0.0, min(1.0, flow * 0.42 + channel * 0.28 + cavity))
    return 0.0


def role_maps(role, rgb, size=TEX, prefix=None):
    """Two-pass maps: height field, then central-difference signed tangent normals."""
    prefix = prefix or role
    br, bg, bb = rgb
    height = [0.0] * (size * size)
    for y in range(size):
        for x in range(size):
            height[y * size + x] = role_height(role, x, y, size)
    albedo, orm, nrm = [], [], []
    slope = {
        "hull": 22.0,
        "armor": 26.0,
        "mechanical": 28.0,
        "ceramic": 16.0,
        "radiator": 24.0,
        "warning": 10.0,
        "glass": 4.0,
        "thruster": 20.0,
    }.get(role, 18.0)
    for y in range(size):
        for x in range(size):
            h = height[y * size + x]
            xm = height[y * size + ((x - 1) % size)]
            xp = height[y * size + ((x + 1) % size)]
            ym = height[((y - 1) % size) * size + x]
            yp = height[((y + 1) % size) * size + x]
            dx = (xp - xm) * 0.5
            dy = (yp - ym) * 0.5
            nx, ny, nz = -dx * slope, -dy * slope, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            nx, ny, nz = nx * inv, ny * inv, nz * inv
            gf2 = h01(x // 8, y // 8, 29)
            if role == "hull":
                dirt = min(1.0, (1.0 - h) * 0.42 + gf2 * 0.03)
                r = max(0, min(1, br * (0.88 + h * 0.08) * (1.0 - dirt * 0.28)))
                g = max(0, min(1, bg * (0.90 + h * 0.06) * (1.0 - dirt * 0.18)))
                b = max(0, min(1, bb * (0.92 + h * 0.04) * (1.0 - dirt * 0.10)))
                rough = 0.72 + dirt * 0.10
                metal = 0.0
            elif role == "armor":
                mill = min(1.0, h)
                r = max(0, min(1, br * (0.90 + mill * 0.10)))
                g = max(0, min(1, bg * (0.90 + mill * 0.08)))
                b = max(0, min(1, bb * (0.92 + mill * 0.06)))
                rough = 0.34 + (1.0 - mill) * 0.10
                metal = 1.0
            elif role == "mechanical":
                mix = min(1.0, h)
                heat = max(0.0, 0.70 - x / size) * 0.55
                r = max(0, min(1, br * (0.82 + mix * 0.12) + heat * 0.42))
                g = max(0, min(1, bg * (0.86 + mix * 0.08) + heat * 0.12))
                b = max(0, min(1, bb * (0.90 + (1 - mix) * 0.04)))
                rough = 0.28 + (1 - mix) * 0.10
                metal = 1.0
            elif role == "ceramic":
                grain = min(1.0, h)
                r = max(0, min(1, br * (0.78 + grain * 0.10)))
                g = max(0, min(1, bg * (0.76 + grain * 0.08)))
                b = max(0, min(1, bb * (0.70 + grain * 0.06)))
                rough = 0.82 + (1.0 - grain) * 0.08
                metal = 0.0
            elif role == "radiator":
                louver = 1.0 if h > 0.30 else 0.0
                r = max(0, min(1, br * (0.7 + louver * 0.28)))
                g = max(0, min(1, bg * (0.7 + louver * 0.18)))
                b = max(0, min(1, bb * (0.72 + louver * 0.10)))
                rough = 0.42 + (1 - louver) * 0.16
                metal = 1.0
            elif role == "warning":
                chev = 1.0 if h > 0.08 else 0.0
                r = br * (0.40 + 0.60 * chev) * (1 - gf2 * 0.08)
                g = bg * (0.32 + 0.50 * chev) * (1 - gf2 * 0.06)
                b = bb * (0.16 + 0.18 * chev)
                rough = 0.52
                metal = 0.0
            elif role == "glass":
                r, g, b = br, bg, bb
                rough = 0.08
                metal = 0.0
            elif role == "thruster":
                soot = min(1.0, 0.22 + h * 0.78)
                r = max(0, min(1, 0.22 * (1.05 - soot * 0.40) + 0.08 * (1.0 - soot)))
                g = max(0, min(1, 0.10 * (1.02 - soot * 0.32)))
                b = max(0, min(1, 0.045 * (1.00 - soot * 0.22)))
                rough = 0.40 + soot * 0.22
                metal = 0.78
            else:
                r, g, b = br, bg, bb
                rough, metal = 0.5, 0.0
            # Placeholder AO; real baked geometry AO replaces ORM red after join.
            albedo.extend((r, g, b, 1.0))
            orm.extend((0.92, max(0.04, min(0.95, rough)), max(0.0, min(1.0, metal)), 1.0))
            nrm.extend((0.5 + 0.5 * nx, 0.5 + 0.5 * ny, 0.5 + 0.5 * nz, 1.0))
    base = write_pixels(f"ironback_{prefix}_basecolor", albedo, size, "sRGB")
    orm_img = write_pixels(f"ironback_{prefix}_orm", orm, size, "Non-Color")
    nrm_img = write_pixels(f"ironback_{prefix}_normal", nrm, size, "Non-Color")
    return base, orm_img, nrm_img


def principled(material):
    material.use_nodes = True
    material.node_tree.nodes.clear()
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = material.node_tree.nodes.new("ShaderNodeBsdfPrincipled")
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return bsdf


def ensure_gltf_occlusion_group():
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        try:
            group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        except Exception:
            if hasattr(group, "inputs") and group.inputs.get("Occlusion") is None:
                group.inputs.new("NodeSocketFloat", "Occlusion")
        if not group.nodes:
            group.nodes.new("NodeGroupInput")
            group.nodes.new("NodeGroupOutput")
    return group


def wire_maps(material, bsdf, maps, coat=0.0, emission=None, nrm_strength=1.28, coat_rough=0.55):
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
    if "Ambient Occlusion" in bsdf.inputs:
        links.new(sep.outputs["Red"], bsdf.inputs["Ambient Occlusion"])
    gltf_out = nodes.new("ShaderNodeGroup")
    gltf_out.name = "SF_glTF_Occlusion"
    gltf_out.node_tree = ensure_gltf_occlusion_group()
    if "Occlusion" in gltf_out.inputs:
        links.new(sep.outputs["Red"], gltf_out.inputs["Occlusion"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.space = "TANGENT"
    nmap.inputs["Strength"].default_value = nrm_strength
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if "Coat Weight" in bsdf.inputs and coat > 0:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = coat_rough
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission[0], 1)
        bsdf.inputs["Emission Strength"].default_value = emission[1]


def create_materials():
    specs = {
        "Material_Hull": ((0.28, 0.135, 0.062), 0.00, 0.74, "hull", 0.04, None, 1.22, 0.62, 0.16),
        "Material_Armor": ((0.13, 0.14, 0.15), 1.00, 0.36, "armor", 0.0, None, 1.48, 0.40, 0.48),
        "Material_Mechanical": ((0.17, 0.155, 0.145), 1.00, 0.32, "mechanical", 0.0, None, 1.52, 0.36, 0.50),
        "Material_Warning": ((0.62, 0.28, 0.05), 0.00, 0.54, "warning", 0.0, None, 1.05, 0.50, 0.22),
        "Material_Ceramic": ((0.36, 0.30, 0.22), 0.00, 0.84, "ceramic", 0.0, None, 1.18, 0.70, 0.12),
        "Material_Radiator": ((0.14, 0.10, 0.07), 1.00, 0.48, "radiator", 0.0, None, 1.30, 0.48, 0.42),
        "Material_Canopy": ((0.024, 0.042, 0.064), 0.00, 0.10, "glass", 0.0, None, 0.85, 0.08, 0.35),
        "Material_Thruster": ((0.16, 0.072, 0.032), 0.78, 0.48, "thruster", 0.0, None, 1.32, 0.45, 0.42),
    }
    mats = {}
    for name, (rgb, metal, rough, role, coat, emit, nrm, coat_r, spec) in specs.items():
        material = bpy.data.materials.new(name)
        bsdf = principled(material)
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = spec
        elif "Specular" in bsdf.inputs:
            bsdf.inputs["Specular"].default_value = spec
        maps = role_maps(role, rgb, prefix=name.replace("Material_", "").lower())
        wire_maps(material, bsdf, maps, coat=coat, emission=emit, nrm_strength=nrm, coat_rough=coat_r)
        if name == "Material_Canopy":
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.42
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.42
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.52
            bsdf.inputs["Alpha"].default_value = 0.48
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = 0.0
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


def finish_mesh(obj, material, bevel=0.012):
    """Bevel at authored cm-class radii, then weighted normals. Apply before join."""
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
    if hasattr(wn, "weight"):
        wn.weight = 50
    if hasattr(wn, "use_face_influence"):
        wn.use_face_influence = True
    obj["spacefaceRole"] = material.get("spacefaceRole", "static")
    return obj


def inset_large_faces(obj, thickness=0.06, depth=0.030, min_area=0.30, bevel=0.014):
    """Cut real panel gaps into large host faces. Not a texture seam."""
    apply_modifiers(obj)
    if obj.type != "MESH" or not obj.data.polygons:
        return obj
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
    mat = obj.data.materials[0] if obj.data.materials else None
    if mat is not None:
        finish_mesh(obj, mat, bevel=bevel)
    return obj


def add_box(name, loc, scale, material, collection, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel)


def add_subdivided_box(name, loc, scale, material, collection, cuts=3, bevel=0.03):
    """Formed pressure block with enough faces for real well/drive cuts."""
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.subdivide(number_cuts=cuts)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_cylinder(name, loc, radius, depth, material, collection, vertices=18, bevel=0.02, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_cone(name, loc, radius1, radius2, depth, material, collection, vertices=12, bevel=0.003, rot=(0, math.pi / 2, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=loc, rotation=rot,
    )
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    return finish_mesh(obj, material, bevel)


def add_axis_cylinder(name, start, end, radius, material, collection, vertices=10, bevel=0.003):
    a, b = Vector(start), Vector(end)
    axis = b - a
    depth = max(axis.length, 1e-3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=tuple((a + b) * 0.5))
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.rotation_euler = axis.normalized().to_track_quat("Z", "Y").to_euler()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_hydraulic(name, start, end, mats, collection):
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    a, b = Vector(start), Vector(end)
    if (b - a).length < 0.08:
        return
    d = b - a
    barrel_end = a + d * 0.62
    add_axis_cylinder(f"{name}_Barrel", a, barrel_end, 0.075, armor, collection, 10, 0.004)
    add_axis_cylinder(f"{name}_Rod", a + d * 0.48, b, 0.036, mech, collection, 8, 0.002)
    add_cylinder(f"{name}_Clevis", tuple(a), 0.055, 0.08, mech, collection, 8, 0.002, (0, 0, 0))


def add_mesh(name, verts, faces, material, collection, bevel=0.012):
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.validate(verbose=False)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return finish_mesh(obj, material, bevel)


def add_section_mesh(name, stations, material, collection, bevel=0.012, cap=True):
    """Connect chamfered/sloped 2D section rings into real faces with normals.

    Each station is an equal-length list of (x, y, z) verts. Consecutive rings
    become quads. This is a formed shell, not a subdivided cube.
    """
    if len(stations) < 2:
        raise ValueError(f"{name}: need >= 2 section stations")
    sides = len(stations[0])
    if sides < 3:
        raise ValueError(f"{name}: each section needs >= 3 verts")
    for index, ring in enumerate(stations):
        if len(ring) != sides:
            raise ValueError(f"{name}: station {index} has {len(ring)} verts, expected {sides}")
    verts = [vert for ring in stations for vert in ring]
    faces = []
    if cap is True or cap == "both":
        faces.append(tuple(range(sides - 1, -1, -1)))
        faces.append(tuple(range((len(stations) - 1) * sides, len(stations) * sides)))
    elif cap == "front":
        faces.append(tuple(range(sides - 1, -1, -1)))
    elif cap == "aft":
        faces.append(tuple(range((len(stations) - 1) * sides, len(stations) * sides)))
    for station in range(len(stations) - 1):
        a = station * sides
        b = (station + 1) * sides
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((a + i, a + j, b + j, b + i))
    return add_mesh(name, verts, faces, material, collection, bevel)


def formed_hull_ring(x, hw, deck_z, keel_z, chamfer):
    """Hard-chine pressure section: flat deck, outer chamfer, waist, keel."""
    deck_hw = max(0.18, hw - chamfer)
    chine_z = keel_z + (deck_z - keel_z) * 0.34
    return [
        (x, 0.0, deck_z),
        (x, deck_hw * 0.52, deck_z),
        (x, hw * 0.90, deck_z - 0.10),
        (x, hw, chine_z),
        (x, hw * 0.70, keel_z + 0.10),
        (x, 0.0, keel_z),
        (x, -hw * 0.70, keel_z + 0.10),
        (x, -hw, chine_z),
        (x, -hw * 0.90, deck_z - 0.10),
        (x, -deck_hw * 0.52, deck_z),
    ]


def barge_cavity_ring(x, hw, well_hy, deck_z, floor_z, keel_z, wall=0.10, chamfer=0.16):
    """One barge section with a dorsal hopper cavity: outer shell, keel, floor, 8–12 cm walls.

    The ring never opens the keel. Abeam cannot see studio through the hull.
    """
    yi = max(0.28, well_hy)
    yo = yi + max(0.08, min(0.12, wall))
    chine_z = keel_z + (deck_z - keel_z) * 0.34
    rim_z = deck_z + 0.05
    mid = floor_z + (rim_z - floor_z) * 0.46
    return [
        (x, -yo, deck_z),
        (x, -hw * 0.52, deck_z),
        (x, -hw * 0.90, deck_z - 0.08),
        (x, -hw, chine_z),
        (x, -hw * 0.68, keel_z + 0.08),
        (x, 0.0, keel_z),
        (x, hw * 0.68, keel_z + 0.08),
        (x, hw, chine_z),
        (x, hw * 0.90, deck_z - 0.08),
        (x, hw * 0.52, deck_z),
        (x, yo, deck_z),
        (x, yo, rim_z),
        (x, yi, rim_z),
        (x, yi, mid),
        (x, yi * 0.42, floor_z + 0.03),
        (x, 0.0, floor_z),
        (x, -yi * 0.42, floor_z + 0.03),
        (x, -yi, mid),
        (x, -yi, rim_z),
        (x, -yo, rim_z),
    ]


def sponson_ring(x, yc, sign, hw_out, hw_in, deck_z, keel_z, chamfer):
    """Formed sponson: chamfered deck, outer shoulder, inner waist, keel."""
    yo = yc + sign * hw_out
    yi = yc - sign * hw_in
    yd_o = yc + sign * max(0.12, hw_out - chamfer)
    chine_z = keel_z + (deck_z - keel_z) * 0.30
    return [
        (x, yi + sign * 0.05, deck_z),
        (x, yd_o, deck_z),
        (x, yo, deck_z - 0.14),
        (x, yo, chine_z),
        (x, yc + sign * hw_out * 0.78, keel_z),
        (x, yi, keel_z + 0.06),
        (x, yi, chine_z),
        (x, yi, deck_z - 0.16),
    ]


def hopper_trough_ring(x, inner_hy, floor_z, rim_z, wall=0.28):
    """Open-top U liner: sloped inner walls, outer shell, real well void."""
    yi = inner_hy
    yo = inner_hy + wall
    mid = floor_z + (rim_z - floor_z) * 0.38
    return [
        (x, -yi, rim_z),
        (x, -yi * 0.62, mid),
        (x, -yi * 0.28, floor_z + 0.04),
        (x, yi * 0.28, floor_z + 0.04),
        (x, yi * 0.62, mid),
        (x, yi, rim_z),
        (x, yo, rim_z + 0.05),
        (x, yo * 0.70, floor_z - 0.10),
        (x, 0.0, floor_z - 0.16),
        (x, -yo * 0.70, floor_z - 0.10),
        (x, -yo, rim_z + 0.05),
    ]


def greenhouse_frame_ring(x, hw, roof_z, sill_z, brow=0.10):
    """Open greenhouse cage section: roof rails and sills, not a filled gem."""
    return [
        (x, -hw * 0.12, roof_z),
        (x, hw * 0.12, roof_z),
        (x, hw * 0.62, roof_z - 0.04),
        (x, hw, sill_z + 0.38),
        (x, hw * 0.92, sill_z),
        (x, hw * 0.18, sill_z - 0.04),
        (x, -hw * 0.18, sill_z - 0.04),
        (x, -hw * 0.92, sill_z),
        (x, -hw, sill_z + 0.38),
        (x, -hw * 0.62, roof_z - 0.04),
    ]


def apply_euler(obj, euler):
    """Bake a local tilt so tool heads keep distinct contours in both legal headings."""
    obj.rotation_euler = euler
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return obj


def pulse_house_ring(x, yc, inner_hy, floor_z, rim_z, wall=0.22):
    """Rectangular pulse house: flat shoulders, vertical walls, open dorsal U."""
    yi, yo = inner_hy, inner_hy + wall
    return [
        (x, yc - yi, rim_z),
        (x, yc - yi, floor_z + 0.12),
        (x, yc - yi * 0.18, floor_z),
        (x, yc + yi * 0.18, floor_z),
        (x, yc + yi, floor_z + 0.12),
        (x, yc + yi, rim_z),
        (x, yc + yo, rim_z + 0.02),
        (x, yc + yo, floor_z - 0.06),
        (x, yc + yo * 0.52, floor_z - 0.16),
        (x, yc - yo * 0.52, floor_z - 0.16),
        (x, yc - yo, floor_z - 0.06),
        (x, yc - yo, rim_z + 0.02),
    ]


def pulse_case_ring(x, yc, inner_hy, floor_z, rim_z, wall=0.26):
    """Formed pulse house: thick U casing open on top, rooted outboard."""
    return pulse_house_ring(x, yc, inner_hy, floor_z, rim_z, wall)


def plate_follow_ring(x, y0, y1, z0, z1, thickness=0.10):
    """Armor/paint course with real thickness that can follow a shell station."""
    ym = (y0 + y1) * 0.5
    zt = z1
    zb = z0
    return [
        (x, y0, zb),
        (x, y0, zt),
        (x, ym, zt),
        (x, y1, zt - 0.02),
        (x, y1, zb + thickness * 0.4),
        (x, ym, zb),
    ]


def sponson_from_beam(x, y_outer, y_inner, deck_z, keel_z, chamfer, sign):
    """Sponson ring from centerline outer/inner beam so the silhouette can change."""
    yc = 0.5 * (y_outer + y_inner)
    ho = abs(y_outer - yc)
    hi = abs(yc - y_inner)
    return sponson_ring(x, sign * yc, sign, ho, hi, deck_z, keel_z, chamfer)


def mirror_object_y(obj, new_name, collection):
    dup = obj.copy()
    dup.data = obj.data.copy()
    dup.name = new_name
    collection.objects.link(dup)
    for vert in dup.data.vertices:
        vert.co.y *= -1.0
    dup.data.update()
    return dup


def pulse_u_ring(x, yc, inner_hy, floor_z, rim_z, wall=0.18):
    """Open-top U chamber. Void is the well, not a solid fake gap."""
    yi, yo = inner_hy, inner_hy + wall
    return [
        (x, yc - yi, rim_z),
        (x, yc - yi, floor_z + 0.10),
        (x, yc - yi * 0.22, floor_z),
        (x, yc + yi * 0.22, floor_z),
        (x, yc + yi, floor_z + 0.10),
        (x, yc + yi, rim_z),
        (x, yc + yo, rim_z + 0.04),
        (x, yc + yo, floor_z - 0.12),
        (x, yc, floor_z - 0.18),
        (x, yc - yo, floor_z - 0.12),
        (x, yc - yo, rim_z + 0.04),
    ]


def load_path_ring(x, y0, y1, z0, z1):
    """Broad armor course with real height, not a decal-thick overlap plate."""
    ym = (y0 + y1) * 0.5
    return [
        (x, y0, z0),
        (x, y0, z1),
        (x, ym, z1),
        (x, y1, z1 - 0.04),
        (x, y1, z0 + 0.06),
        (x, ym, z0),
    ]


def add_oriented_box(name, start, end, yz, material, collection, bevel=0.008):
    a, b = Vector(start), Vector(end)
    mid = (a + b) * 0.5
    axis = b - a
    length = max(axis.length, 1e-4)
    bpy.ops.mesh.primitive_cube_add(location=tuple(mid))
    obj = link_object(bpy.context.object, collection)
    obj.name = name
    obj.scale = (length * 0.5, yz[0], yz[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = axis.normalized().to_track_quat("X", "Z").to_euler()
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return finish_mesh(obj, material, bevel)


def add_hat_boom(name, start, end, width, height, material, collection, bevel=0.006):
    """Folded hat-section boom: web plus two flanges."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    if axis.length < 1e-4:
        return add_box(name, tuple(a), (0.1, width, height), material, collection, bevel)
    mid = (a + b) * 0.5
    x_axis = axis.normalized()
    up = Vector((0.0, 0.0, 1.0))
    side = x_axis.cross(up)
    if side.length < 0.15:
        side = x_axis.cross(Vector((0.0, 1.0, 0.0)))
    side.normalize()
    up = side.cross(x_axis).normalized()
    hw, hh, fl = width * 0.5, height, width * 0.22
    profile = ((-hw, hh * 0.18), (-hw, hh), (-hw + fl, hh), (-hw + fl, 0.0), (hw - fl, 0.0), (hw - fl, hh), (hw, hh), (hw, hh * 0.18))
    verts = []
    for end_pt in (a, b):
        for sy, sz in profile:
            verts.append(tuple(end_pt + side * sy + up * sz))
    faces = [(0, 1, 2, 3, 4, 5, 6, 7), (15, 14, 13, 12, 11, 10, 9, 8)]
    for i in range(8):
        j = (i + 1) % 8
        faces.append((i, j, j + 8, i + 8))
    return add_mesh(name, verts, faces, material, collection, bevel)


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
    half, hw, hh = 8.5, 2.6, 1.35
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
    uv_map = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers[0]
    uv_map.active = True
    uv_map.active_render = True
    if "UV1" in obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers["UV1"])
    uv1 = obj.data.uv_layers.new(name="UV1")
    for loop in obj.data.loops:
        uv1.data[loop.index].uv = uv_map.data[loop.index].uv * 8.0
    uv_map.active = True
    uv_map.active_render = True
    obj.select_set(False)


def bake_ao_into_orm(obj, samples=20, size=TEX):
    """Pack baked geometry AO into ORM red. Fail closed if the target cannot bind."""
    if obj.type != "MESH" or not obj.data.polygons:
        raise RuntimeError(f"ironback AO bake: {obj.name} has no mesh")
    if "UVMap" in obj.data.uv_layers:
        obj.data.uv_layers["UVMap"].active = True
        obj.data.uv_layers["UVMap"].active_render = True
    if not obj.data.uv_layers.active:
        raise RuntimeError(f"ironback AO bake: {obj.name} has no UV")
    if not obj.data.materials:
        raise RuntimeError(f"ironback AO bake: {obj.name} has no material")
    keep = obj.data.materials[0]
    obj.data.materials.clear()
    obj.data.materials.append(keep)
    obj.active_material_index = 0
    mat = obj.active_material or (obj.data.materials[0] if obj.data.materials else None)
    if mat is None or not mat.use_nodes or mat.node_tree is None:
        raise RuntimeError(f"ironback AO bake: {obj.name} material cannot bind")
    orm = next(
        (n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "_orm" in n.image.name),
        None,
    )
    if orm is None:
        raise RuntimeError(f"ironback AO bake: {obj.name} cannot bind ORM image")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 6
    if hasattr(scene.render.bake, "target"):
        scene.render.bake.target = "IMAGE_TEXTURES"
    img_name = f"AO_{obj.name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    ao = bpy.data.images.new(img_name, width=size, height=size, alpha=False)
    ao.colorspace_settings.name = "Non-Color"
    if hasattr(ao, "generated_color"):
        ao.generated_color = (1.0, 1.0, 1.0, 1.0)
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = ao
    node.name = "SF_AO_TARGET"
    for victim in mat.node_tree.nodes:
        victim.select = False
    node.select = True
    mat.node_tree.nodes.active = node
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        result = bpy.ops.object.bake(type="AO", use_clear=True, margin=6)
        if result != {"FINISHED"}:
            raise RuntimeError(f"bake returned {result}")
    except Exception as exc:
        raise RuntimeError(f"ironback AO bake failed on {obj.name}: {exc}") from exc
    finally:
        for victim in [n for n in mat.node_tree.nodes if n.name == "SF_AO_TARGET"]:
            mat.node_tree.nodes.remove(victim)
    op = list(ao.pixels)
    rp = list(orm.pixels)
    n = min(len(rp) // 4, len(op) // 4)
    if n <= 0:
        raise RuntimeError(f"ironback AO bake: {obj.name} produced empty pixels")
    for i in range(n):
        rp[i * 4] = max(0.10, min(1.0, op[i * 4]))
    orm.pixels = rp
    orm.pack()
    if orm.filepath_raw:
        try:
            orm.save()
        except Exception as exc:
            raise RuntimeError(f"ironback AO bake: {obj.name} ORM save failed: {exc}") from exc


def add_processing_hopper(lod, mats, collection):
    """Open well cavity process: ceramic apron, air, three Y-drums, proud V-jaws, dark throat."""
    hull, armor, mech = mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"]
    warning, ceramic, thruster = (mats["Material_Warning"], mats["Material_Ceramic"], mats["Material_Thruster"])
    cx, hy, hx = -0.07, 1.12, 2.16
    rim_z, floor_z = 1.10, 0.08
    add_cylinder("Hopper_RimRollP", (cx, -hy - 0.02, rim_z + 0.04), 0.11, hx * 1.72, armor, collection, 12, 0.004, (0, math.pi / 2, 0))
    add_cylinder("Hopper_RimRollS", (cx, hy + 0.02, rim_z + 0.04), 0.11, hx * 1.72, armor, collection, 12, 0.004, (0, math.pi / 2, 0))
    add_box("Hopper_RimFore", (cx + hx + 0.02, 0.0, rim_z + 0.06), (0.08, hy * 0.90, 0.07), armor, collection, 0.003)
    add_box("Hopper_RimAft", (cx - hx - 0.02, 0.0, rim_z + 0.04), (0.08, hy * 0.62, 0.06), armor, collection, 0.003)
    add_box("Hopper_HazardP", (cx + 0.55, -hy - 0.04, rim_z + 0.14), (0.42, 0.04, 0.02), warning, collection, 0.002)
    add_box("Hopper_HazardS", (cx + 0.55, hy + 0.04, rim_z + 0.14), (0.42, 0.04, 0.02), warning, collection, 0.002)
    n_rib = 3 if lod <= 1 else 2
    for i in range(n_rib):
        rx = cx - hx * 0.42 + i * 1.00
        rib = [
            [(rx, -hy + 0.04, rim_z - 0.02), (rx, -hy + 0.16, rim_z - 0.02), (rx, -hy + 0.16, floor_z + 0.08), (rx, -hy + 0.04, floor_z + 0.08)],
            [(rx + 0.08, -hy + 0.04, rim_z - 0.02), (rx + 0.08, -hy + 0.16, rim_z - 0.02), (rx + 0.08, -hy + 0.16, floor_z + 0.08), (rx + 0.08, -hy + 0.04, floor_z + 0.08)],
        ]
        add_section_mesh(f"Hopper_RibP_{i}", rib, armor, collection, 0.003, cap=True)
        rib_s = [[(px, -py, pz) for px, py, pz in ring] for ring in rib]
        add_section_mesh(f"Hopper_RibS_{i}", rib_s, armor, collection, 0.003, cap=True)
    add_folded_sheet(
        "Hopper_RimLipP",
        (cx + hx - 0.10, -hy + 0.02, rim_z + 0.02),
        (cx - hx + 0.16, -hy + 0.02, rim_z + 0.02),
        (cx - hx + 0.16, -hy + 0.20, rim_z - 0.04),
        (cx + hx - 0.10, -hy + 0.20, rim_z - 0.04),
        0.08, armor, collection, 0.003,
    )
    add_folded_sheet(
        "Hopper_RimLipS",
        (cx + hx - 0.10, hy - 0.02, rim_z + 0.02),
        (cx + hx - 0.10, hy - 0.20, rim_z - 0.04),
        (cx - hx + 0.16, hy - 0.20, rim_z - 0.04),
        (cx - hx + 0.16, hy - 0.02, rim_z + 0.02),
        0.08, armor, collection, 0.003,
    )
    add_folded_sheet(
        "Hopper_LinerP",
        (cx + hx - 0.12, -hy + 0.02, rim_z - 0.04),
        (cx - hx + 0.18, -hy + 0.02, rim_z - 0.04),
        (cx - hx + 0.18, -hy + 0.02, floor_z + 0.10),
        (cx + hx - 0.12, -hy + 0.02, floor_z + 0.16),
        0.09, ceramic, collection, 0.003,
    )
    add_folded_sheet(
        "Hopper_LinerS",
        (cx + hx - 0.12, hy - 0.02, rim_z - 0.04),
        (cx + hx - 0.12, hy - 0.02, floor_z + 0.16),
        (cx - hx + 0.18, hy - 0.02, floor_z + 0.10),
        (cx - hx + 0.18, hy - 0.02, rim_z - 0.04),
        0.09, ceramic, collection, 0.003,
    )
    # Hull floor courses live on the cavity shell so AO/normals are not a ceramic island.
    n_floor = 4 if lod <= 1 else 3
    for i in range(n_floor):
        fx = cx + hx * 0.38 - i * (hx * 0.70 / max(1, n_floor - 1))
        add_box(f"Hopper_FloorBar_{i}", (fx, 0.0, floor_z + 0.07), (0.10, hy * 0.72, 0.04), hull, collection, 0.003)
    add_folded_sheet(
        "Hopper_ApronP",
        (cx + hx - 0.06, -hy + 0.20, rim_z - 0.10),
        (cx + hx - 0.06, -0.10, rim_z - 0.10),
        (cx + 0.72, -0.16, floor_z + 0.22),
        (cx + 0.72, -hy + 0.28, floor_z + 0.22),
        0.08, ceramic, collection, 0.004,
    )
    add_folded_sheet(
        "Hopper_ApronS",
        (cx + hx - 0.06, 0.10, rim_z - 0.10),
        (cx + hx - 0.06, hy - 0.20, rim_z - 0.10),
        (cx + 0.72, hy - 0.28, floor_z + 0.22),
        (cx + 0.72, 0.16, floor_z + 0.22),
        0.08, ceramic, collection, 0.004,
    )
    n_roll = 3 if lod <= 1 else 2
    drum_xs = (0.18, -0.70, -1.52) if n_roll == 3 else (0.08, -1.24)
    drum_r, drum_z = 0.38, 0.72
    for i, rx in enumerate(drum_xs):
        add_cylinder(f"Hopper_Drum_{i}", (rx, 0.0, drum_z), drum_r, hy * 1.62, mech, collection, 16, 0.006, (math.pi / 2, 0, 0))
        add_cylinder(f"Hopper_DrumHub_{i}", (rx, 0.0, drum_z), 0.14, hy * 1.86, armor, collection, 10, 0.003, (math.pi / 2, 0, 0))
        add_box(f"Hopper_DrumBrgP_{i}", (rx, -hy + 0.10, drum_z), (0.18, 0.11, 0.18), armor, collection, 0.003)
        add_box(f"Hopper_DrumBrgS_{i}", (rx, hy - 0.10, drum_z), (0.18, 0.11, 0.18), armor, collection, 0.003)
        add_cylinder(f"Hopper_DrumAxle_{i}", (rx, 0.0, drum_z), 0.055, hy * 1.96, mech, collection, 8, 0.002, (math.pi / 2, 0, 0))
    for tag, y_sign in (("P", -1.0), ("S", 1.0)):
        jaw = []
        for t, xw in enumerate((-1.78, -2.00, -2.20)):
            spread = 0.16 + t * 0.44
            y_outer = y_sign * (0.12 + spread)
            y_inner = y_sign * max(0.06, spread - 0.22)
            jaw.append([
                (xw, y_outer, rim_z + 0.58),
                (xw, y_inner, rim_z + 0.42),
                (xw, y_inner, floor_z + 0.18),
                (xw, y_outer, floor_z + 0.28),
            ])
        add_section_mesh(f"Hopper_Jaw{tag}", jaw, armor, collection, 0.006, cap=True)
        edge = [
            [(-1.82, y_sign * 0.18, rim_z + 0.56), (-1.82, y_sign * 0.08, rim_z + 0.48), (-1.82, y_sign * 0.08, rim_z + 0.18), (-1.82, y_sign * 0.18, rim_z + 0.24)],
            [(-2.18, y_sign * 0.54, rim_z + 0.52), (-2.18, y_sign * 0.34, rim_z + 0.44), (-2.18, y_sign * 0.34, rim_z + 0.16), (-2.18, y_sign * 0.54, rim_z + 0.22)],
        ]
        add_section_mesh(f"Hopper_JawEdge{tag}", edge, ceramic, collection, 0.003, cap=True)
    add_cylinder("Hopper_JawHinge", (-1.70, 0.0, rim_z + 0.08), 0.10, 0.36, mech, collection, 10, 0.003, (math.pi / 2, 0, 0))
    throat = [
        hopper_trough_ring(cx - hx + 0.06, 0.36, floor_z - 0.08, 0.42, 0.12),
        hopper_trough_ring(cx - hx - 0.22, 0.22, floor_z + 0.02, 0.22, 0.10),
        hopper_trough_ring(cx - hx - 0.48, 0.14, floor_z + 0.08, 0.12, 0.08),
    ]
    add_section_mesh("Hopper_Throat", throat, thruster, collection, 0.005, cap=False)


def add_command_cage(lod, mats, collection):
    """Glass over a hole: thin dielectric panes, metal cage, deep dark CabWell."""
    canopy, armor = mats["Material_Canopy"], mats["Material_Armor"]
    thruster, mech = mats["Material_Thruster"], mats["Material_Mechanical"]
    # Short gunmetal pressure collar — not an orange gem wrapping the glass.
    collar = [
        formed_hull_ring(4.62, 0.88, 0.78, 0.28, 0.14),
        formed_hull_ring(4.98, 0.94, 0.82, 0.30, 0.14),
        formed_hull_ring(5.22, 0.90, 0.76, 0.32, 0.12),
    ]
    add_section_mesh("Cab_Collar", collar, armor, collection, 0.008, cap=True)
    # Deep CabWell / tub volume the chase camera looks into through the panes.
    tub = [
        hopper_trough_ring(5.38, 1.02, 0.12, 1.18, 0.16),
        hopper_trough_ring(6.08, 1.16, 0.04, 1.24, 0.16),
        hopper_trough_ring(6.78, 1.18, 0.02, 1.22, 0.14),
        hopper_trough_ring(7.28, 0.92, 0.14, 1.10, 0.12),
    ]
    add_section_mesh("Cab_Tub", tub, thruster, collection, 0.006, cap=False)
    add_box("Cab_TubFloor", (6.28, 0.0, 0.10), (0.92, 0.86, 0.03), armor, collection, 0.003)
    add_box("Cab_TubAft", (5.42, 0.0, 0.58), (0.05, 0.92, 0.42), armor, collection, 0.003)
    # Thin metal brow, sill, posts, mullions. Glass sits inside these members, not in orange fill.
    add_section_mesh(
        "Cab_Brow",
        [
            [(7.02, -1.08, 1.52), (7.02, 1.08, 1.52), (7.02, 1.08, 1.36), (7.02, -1.08, 1.36)],
            [(7.22, -0.92, 1.44), (7.22, 0.92, 1.44), (7.22, 0.92, 1.22), (7.22, -0.92, 1.22)],
        ],
        armor, collection, 0.006, cap=True,
    )
    add_section_mesh(
        "Cab_Sill",
        [
            [(5.36, -1.16, 1.02), (5.36, 1.16, 1.02), (5.36, 1.16, 0.88), (5.36, -1.16, 0.88)],
            [(5.58, -1.04, 1.04), (5.58, 1.04, 1.04), (5.58, 1.04, 0.90), (5.58, -1.04, 0.90)],
        ],
        armor, collection, 0.006, cap=True,
    )
    for tag, y in (("P", -1.12), ("S", 1.12)):
        add_section_mesh(
            f"Cab_RoofRail{tag}",
            [
                [(5.46, y - 0.055, 1.48), (5.46, y + 0.055, 1.48), (5.46, y + 0.055, 1.32), (5.46, y - 0.055, 1.32)],
                [(7.00, y - 0.050, 1.42), (7.00, y + 0.050, 1.42), (7.00, y + 0.050, 1.26), (7.00, y - 0.050, 1.26)],
            ],
            armor, collection, 0.004, cap=True,
        )
        add_box(f"Cab_PostFore{tag}", (6.96, y, 1.14), (0.055, 0.055, 0.30), mech, collection, 0.003)
        add_box(f"Cab_PostAft{tag}", (5.50, y, 1.10), (0.055, 0.055, 0.28), mech, collection, 0.003)
    add_section_mesh(
        "Cab_MullionC",
        [
            [(5.48, -0.07, 1.48), (5.48, 0.07, 1.48), (5.48, 0.07, 0.92), (5.48, -0.07, 0.92)],
            [(6.98, -0.06, 1.42), (6.98, 0.06, 1.42), (6.98, 0.06, 0.92), (6.98, -0.06, 0.92)],
        ],
        mech, collection, 0.003, cap=True,
    )
    add_section_mesh(
        "Cab_MullionX",
        [
            [(6.16, -1.10, 1.46), (6.16, 1.10, 1.46), (6.16, 1.10, 1.34), (6.16, -1.10, 1.34)],
            [(6.30, -1.06, 1.46), (6.30, 1.06, 1.46), (6.30, 1.06, 1.34), (6.30, -1.06, 1.34)],
        ],
        mech, collection, 0.003, cap=True,
    )
    # Thin dielectric panes recessed inside the metal cage, over the dark tub.
    glass_t = 0.012
    inset = 0.28
    add_folded_sheet(
        "Cab_RoofPaneP",
        (5.58, -1.04, 1.34 - inset),
        (6.90, -0.94, 1.26 - inset),
        (6.90, -0.12, 1.26 - inset),
        (5.58, -0.12, 1.34 - inset),
        glass_t, canopy, collection, 0.001,
    )
    add_folded_sheet(
        "Cab_RoofPaneS",
        (5.58, 0.12, 1.34 - inset),
        (6.90, 0.12, 1.26 - inset),
        (6.90, 0.94, 1.26 - inset),
        (5.58, 1.04, 1.34 - inset),
        glass_t, canopy, collection, 0.001,
    )
    add_folded_sheet(
        "Cab_Windshield",
        (7.12 - inset, -0.86, 1.34),
        (7.12 - inset, 0.86, 1.34),
        (7.12 - inset, 0.76, 0.98),
        (7.12 - inset, -0.76, 0.98),
        glass_t, canopy, collection, 0.001,
    )
    if lod <= 1:
        add_folded_sheet(
            "Cab_SidePaneP",
            (5.58, -1.22 + inset, 1.34),
            (6.90, -1.06 + inset, 1.26),
            (6.90, -1.06 + inset, 0.96),
            (5.58, -1.22 + inset, 0.96),
            glass_t, canopy, collection, 0.001,
        )
        add_folded_sheet(
            "Cab_SidePaneS",
            (5.58, 1.22 - inset, 1.34),
            (5.58, 1.22 - inset, 0.96),
            (6.90, 1.06 - inset, 0.96),
            (6.90, 1.06 - inset, 1.26),
            glass_t, canopy, collection, 0.001,
        )
        add_hoop_frame("Cab_HoopFore", 6.90, 0.96, 0.22, 1.12, armor, collection, thick=0.032, half_w=0.045)
        add_hoop_frame("Cab_HoopAft", 5.52, 1.06, 0.22, 1.08, armor, collection, thick=0.032, half_w=0.045)


def add_pulse_plate_drive(lod, mats, collection):
    """One manufactured U-section pulse house, mirrored. Gunmetal jacket, dry collar, dark throat."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, thruster = mats["Material_Ceramic"], mats["Material_Thruster"]
    y, x, z = 1.62, -6.48, 0.18
    side = "Starboard"
    n_st = 4 if lod <= 1 else 3
    xs = (-7.28, -6.82, -6.32, -5.88)[:n_st]
    saddle = [
        plate_follow_ring(xs[0] + 0.10, y - 0.78, y + 0.78, z - 0.22, z + 0.06, 0.14),
        plate_follow_ring(x, y - 0.86, y + 0.86, z - 0.26, z + 0.10, 0.16),
        plate_follow_ring(xs[-1] - 0.04, y - 0.74, y + 0.74, z - 0.20, z + 0.04, 0.14),
    ]
    add_section_mesh(f"PulseSaddle_{side}", saddle, mech, collection, 0.006, cap=True)
    casing = [pulse_u_ring(px, y, 0.40, z - 0.42, z + 0.52, 0.22) for px in xs]
    add_section_mesh(f"PulseCase_{side}", casing, armor, collection, 0.010, cap=False)
    jacket = [
        plate_follow_ring(xs[0] + 0.06, y + 0.44, y + 0.72, z - 0.18, z + 0.38, 0.08),
        plate_follow_ring(xs[-1] - 0.04, y + 0.40, y + 0.68, z - 0.14, z + 0.34, 0.08),
    ]
    add_section_mesh(f"PulseJacketOut_{side}", jacket, mech, collection, 0.004, cap=True)
    jacket_in = [
        plate_follow_ring(xs[0] + 0.06, y - 0.72, y - 0.44, z - 0.18, z + 0.38, 0.08),
        plate_follow_ring(xs[-1] - 0.04, y - 0.68, y - 0.40, z - 0.14, z + 0.34, 0.08),
    ]
    add_section_mesh(f"PulseJacketIn_{side}", jacket_in, mech, collection, 0.004, cap=True)
    chamber = [pulse_u_ring(px, y, 0.28, z - 0.28, z + 0.22, 0.08) for px in xs]
    add_section_mesh(f"PulseChamber_{side}", chamber, thruster, collection, 0.005, cap=False)
    # Dry refractory collar INSIDE the U, below the rim — not a blown-white cap.
    add_section_mesh(
        f"PulseCollar_{side}",
        [
            pulse_u_ring(xs[0] + 0.10, y, 0.30, z - 0.16, z + 0.08, 0.06),
            pulse_u_ring(xs[0] + 0.28, y, 0.28, z - 0.14, z + 0.04, 0.06),
        ],
        ceramic, collection, 0.003, cap=True,
    )
    add_section_mesh(
        f"DriveClamp_{side}",
        [
            [(x + 0.42, y - 0.78, z + 0.12), (x + 0.42, y + 0.78, z + 0.12), (x + 0.42, y + 0.78, z + 0.32), (x + 0.42, y - 0.78, z + 0.32)],
            [(x + 0.62, y - 0.72, z + 0.10), (x + 0.62, y + 0.72, z + 0.10), (x + 0.62, y + 0.72, z + 0.30), (x + 0.62, y - 0.72, z + 0.30)],
        ],
        mech, collection, 0.004, cap=True,
    )
    add_box(f"DriveClampPin_{side}", (x + 0.52, y, z + 0.36), (0.08, 0.64, 0.04), armor, collection, 0.003)
    n_vanes = 3 if lod <= 1 else 2
    vane_span = 0.20 if n_vanes == 3 else 0.26
    for i in range(n_vanes):
        yy = y + (i - (n_vanes - 1) * 0.5) * vane_span
        rings = []
        for hy in (-0.022, 0.022):
            rings.append([
                (xs[-1] + 0.02, yy + hy, z - 0.18),
                (xs[-1] + 0.02, yy + hy, z + 0.12),
                (xs[0] + 0.16, yy + hy, z + 0.06),
                (xs[0] + 0.16, yy + hy, z - 0.12),
            ])
        add_section_mesh(f"PulseVane_{side}_{i}", rings, mech, collection, 0.002, cap=True)
    throat = [
        pulse_u_ring(x - 0.86, y, 0.24, z - 0.24, z - 0.02, 0.12),
        pulse_u_ring(x - 1.22, y, 0.16, z - 0.14, z - 0.08, 0.10),
    ]
    add_section_mesh(f"PulseThroat_{side}", throat, thruster, collection, 0.004, cap=False)
    built = [
        obj for obj in collection.objects
        if "Starboard" in obj.name and obj.name.startswith(("Pulse", "DriveClamp"))
    ]
    for obj in built:
        mirror_object_y(obj, obj.name.replace("Starboard", "Port"), collection)


def add_cutter_arm(tag, root, out_sign, along, head, lod, mats, collection, repair=False):
    """Rooted manipulator. Four camera-facing tool silhouettes, slim common kit."""
    armor, mech = mats["Material_Armor"], mats["Material_Mechanical"]
    ceramic, warning = mats["Material_Ceramic"], mats["Material_Warning"]
    thruster = mats["Material_Thruster"]
    x, y, z = root
    add_cylinder(f"Turntable_{tag}", (x, y, z - 0.02), 0.44, 0.16, armor, collection, 14, 0.006, (0, 0, 0))
    add_cylinder(f"WellFloor_{tag}", (x, y, z - 0.10), 0.36, 0.05, thruster, collection, 12, 0.003, (0, 0, 0))
    add_cylinder(f"TurntableRing_{tag}", (x, y, z + 0.10), 0.34, 0.06, mech, collection, 10, 0.003, (0, 0, 0))
    add_cylinder(f"TurntablePin_{tag}", (x, y, z + 0.16), 0.12, 0.10, mech, collection, 8, 0.002, (0, 0, 0))
    add_box(f"YokeBase_{tag}", (x + 0.04 * along, y + 0.02 * out_sign, z + 0.26), (0.30, 0.24, 0.10), armor, collection, 0.005)
    add_box(f"YokeGusset_{tag}", (x - 0.06 * along, y + 0.02 * out_sign, z + 0.14), (0.12, 0.16, 0.08), armor, collection, 0.003)
    add_box(f"YokeCheekA_{tag}", (x + 0.06 * along, y - 0.12 * out_sign, z + 0.38), (0.18, 0.07, 0.16), mech, collection, 0.003)
    add_box(f"YokeCheekB_{tag}", (x + 0.06 * along, y + 0.10 * out_sign, z + 0.38), (0.18, 0.07, 0.16), mech, collection, 0.003)
    add_cylinder(f"YokePin_{tag}", (x + 0.08 * along, y + 0.02 * out_sign, z + 0.38), 0.055, 0.26, mech, collection, 8, 0.002, (math.pi / 2, 0, 0))
    if head == "saw":
        reach, out, lift = 1.18, 1.42, 0.42
    elif head == "crusher":
        reach, out, lift = 0.92, 1.22, 0.28
    elif head == "drill":
        reach, out, lift = 0.78, 1.52, 0.18
    else:
        reach, out, lift = 1.08, 1.28, 0.12
    p0 = (x + 0.16 * along, y + 0.06 * out_sign, z + 0.38)
    p1 = (x + reach * 0.55 * along, y + out * 0.52 * out_sign, z + 0.20 + lift * 0.4)
    add_hat_boom(f"Boom1_{tag}", p0, p1, 0.34, 0.24, mech, collection, 0.005)
    add_cylinder(f"Elbow_{tag}", p1, 0.14, 0.22, armor, collection, 10, 0.003, (math.pi / 2, 0, 0))
    p2 = (x + reach * along, y + out * out_sign, z + lift)
    if lod <= 1:
        add_hat_boom(f"Boom2_{tag}", p1, p2, 0.26, 0.18, mech, collection, 0.003)
        add_cylinder(f"Wrist_{tag}", p2, 0.11, 0.18, armor, collection, 8, 0.003, (math.pi / 2, 0, 0))
        add_hydraulic(f"Piston_{tag}", (x + 0.08 * along, y + 0.04 * out_sign, z + 0.10), (p1[0], p1[1], p1[2] - 0.08), mats, collection)
    else:
        add_oriented_box(f"Boom2_{tag}", p1, p2, (0.18, 0.14), mech, collection, 0.003)
    hx, hy, hz = p2[0], p2[1], p2[2]
    if head == "saw":
        # Open gunmetal cutting disc with a C-guard and rooted hub. Hole keeps it from reading as a pad.
        n = 16 if lod == 0 else 12
        r0, r1 = 0.26, 1.02
        disk = []
        for i in range(n + 1):
            ang = (i / n) * math.tau
            c, s = math.cos(ang), math.sin(ang)
            disk.append([
                (hx + c * r0, hy + s * r0, hz - 0.045),
                (hx + c * r0, hy + s * r0, hz + 0.045),
                (hx + c * r1, hy + s * r1, hz + 0.032),
                (hx + c * r1, hy + s * r1, hz - 0.032),
            ])
        saw = add_section_mesh(f"SawArc_{tag}", disk, armor, collection, 0.003, cap=False)
        hub = add_cylinder(f"SawHub_{tag}", (hx, hy, hz), 0.20, 0.16, mech, collection, 12, 0.004, (0, 0, 0))
        arbor = add_cylinder(f"SawArbor_{tag}", (hx, hy, hz), 0.08, 0.22, mech, collection, 8, 0.002, (0, 0, 0))
        guard = []
        g0, g1 = math.radians(200.0), math.radians(350.0)
        gn = 6 if lod == 0 else 5
        for i in range(gn):
            ang = g0 + (g1 - g0) * (i / max(1, gn - 1))
            c, s = math.cos(ang), math.sin(ang)
            guard.append([
                (hx + c * 0.42, hy + s * 0.42, hz - 0.16),
                (hx + c * 1.08, hy + s * 1.08, hz - 0.10),
                (hx + c * 1.08, hy + s * 1.08, hz + 0.12),
                (hx + c * 0.42, hy + s * 0.42, hz + 0.16),
            ])
        grd = add_section_mesh(f"SawGuard_{tag}", guard, mech, collection, 0.004, cap=True)
        tilt = (0.18 * along, 0.32 * out_sign, 0.12 * along)
        for obj in (saw, hub, arbor, grd):
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY")
            obj.select_set(False)
            apply_euler(obj, tilt)
    elif head == "crusher":
        # Two opposed plan-view wedges forming a V in the legal camera plane. Gunmetal, not a beige pad.
        add_cylinder(f"CrushPivot_{tag}", (hx, hy, hz + 0.08), 0.12, 0.22, mech, collection, 10, 0.003, (0, 0, 0))
        for jaw, y_sign in (("A", -1.0), ("B", 1.0)):
            rings = []
            for t, along_t in enumerate((0.04, 0.38, 0.88)):
                spread = 0.10 + t * 0.58
                w = 0.12
                rings.append([
                    (hx + along_t * along, hy + y_sign * (spread - w), hz + 0.04),
                    (hx + along_t * along, hy + y_sign * (spread + w), hz + 0.04),
                    (hx + along_t * along, hy + y_sign * (spread + w), hz + 0.46),
                    (hx + along_t * along, hy + y_sign * (spread - w), hz + 0.46),
                ])
            add_section_mesh(f"CrushJaw_{jaw}_{tag}", rings, armor, collection, 0.006, cap=True)
            edge = [
                [(hx + 0.22 * along, hy + y_sign * 0.18, hz + 0.20), (hx + 0.22 * along, hy + y_sign * 0.32, hz + 0.20), (hx + 0.22 * along, hy + y_sign * 0.32, hz + 0.38), (hx + 0.22 * along, hy + y_sign * 0.18, hz + 0.38)],
                [(hx + 0.86 * along, hy + y_sign * 0.58, hz + 0.16), (hx + 0.86 * along, hy + y_sign * 0.74, hz + 0.16), (hx + 0.86 * along, hy + y_sign * 0.74, hz + 0.36), (hx + 0.86 * along, hy + y_sign * 0.58, hz + 0.36)],
            ]
            add_section_mesh(f"CrushEdge_{jaw}_{tag}", edge, ceramic, collection, 0.003, cap=True)
    elif head == "drill":
        n = 8 if lod == 0 else 6
        drill = []
        for i in range(n):
            t = i / max(1, n - 1)
            rad = 0.28 * (1.0 - t * 0.94)
            px = hx + t * 0.55 * along
            py = hy + (0.08 + t * 1.42) * out_sign
            pz = hz + t * 0.22
            drill.append([
                (px + rad, py, pz),
                (px, py, pz + rad),
                (px - rad, py, pz),
                (px, py, pz - rad),
            ])
        add_section_mesh(f"DrillSpike_{tag}", drill, ceramic, collection, 0.004, cap=True)
        add_cylinder(f"DrillCollar_{tag}", (hx + 0.04 * along, hy + 0.06 * out_sign, hz + 0.04), 0.30, 0.16, armor, collection, 12, 0.004, (math.pi / 2, 0, 0))
    else:
        # Open four-tine grab with pads, fanned in Y/Z so it is not a two-prong blob.
        tine_plan = ((-0.38, 0.16), (-0.14, -0.12), (0.14, 0.12), (0.38, -0.16))
        for fork, (x_off, z_off) in enumerate(tine_plan):
            rings = []
            for t, out_t in enumerate((0.0, 0.32, 0.68, 1.08)):
                w = 0.055
                pad = 0.14 if t == 3 else 0.055
                py = hy + out_t * out_sign
                pz = hz + z_off * (0.35 + t * 0.22)
                rings.append([
                    (hx + x_off - pad, py, pz + w),
                    (hx + x_off + pad, py, pz + w),
                    (hx + x_off + pad, py, pz - w * 0.4),
                    (hx + x_off - pad, py, pz - w * 0.4),
                ])
            add_section_mesh(f"GrabTine_{fork}_{tag}", rings, mech, collection, 0.003, cap=True)
            py = hy + 1.04 * out_sign
            pz = hz + z_off * 0.95
            add_section_mesh(
                f"GrabPad_{fork}_{tag}",
                [
                    [(hx + x_off - 0.16, py, pz + 0.08), (hx + x_off + 0.16, py, pz + 0.08), (hx + x_off + 0.16, py, pz - 0.05), (hx + x_off - 0.16, py, pz - 0.05)],
                    [(hx + x_off - 0.18, py + 0.14 * out_sign, pz + 0.10), (hx + x_off + 0.18, py + 0.14 * out_sign, pz + 0.10), (hx + x_off + 0.18, py + 0.14 * out_sign, pz - 0.05), (hx + x_off - 0.18, py + 0.14 * out_sign, pz - 0.05)],
                ],
                ceramic, collection, 0.003, cap=True,
            )
    if repair:
        add_box(f"ArmRepair_{tag}", ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, p1[2] + 0.10), (0.18, 0.06, 0.025), warning, collection, 0.002)


def add_winch_cluster(mats, collection):
    mech, armor, warning = (mats["Material_Mechanical"], mats["Material_Armor"], mats["Material_Warning"])
    x, y, z = 1.05, -2.55, 0.92
    add_box("WinchFrame", (x, y, z - 0.08), (0.42, 0.28, 0.16), armor, collection, 0.006)
    add_cylinder("WinchDrum", (x, y, z + 0.08), 0.18, 0.36, mech, collection, 14, 0.004, (math.pi / 2, 0, 0))
    add_box("WinchFairlead", (x + 0.38, y, z + 0.02), (0.10, 0.16, 0.10), mech, collection, 0.003)
    add_box("WinchGuard", (x, y, z + 0.22), (0.32, 0.22, 0.03), armor, collection, 0.003)
    add_box("CableSpool", (x - 0.55, y + 0.35, z - 0.04), (0.16, 0.16, 0.14), warning, collection, 0.004)
    add_cylinder("SpoolHub", (x - 0.55, y + 0.35, z + 0.08), 0.05, 0.12, mech, collection, 8, 0.002, (0, 0, 0))


def build_lod(lod, mats):
    collection = bpy.data.collections.new(f"IRONBACK_LOD{lod}")
    bpy.context.scene.collection.children.link(collection)
    hull, armor, mech = (mats["Material_Hull"], mats["Material_Armor"], mats["Material_Mechanical"])
    warning, ceramic = mats["Material_Warning"], mats["Material_Ceramic"]
    root = add_empty(f"IRONBACK_LOD{lod}_ROOT", (0, 0, 0), collection)
    root["spacefaceAsset"] = {
        "assetId": "SF_IRONBACK_PRODUCTION_V1",
        "partId": "ironback_production_v1",
        "lod": f"lod{lod}",
        "slot": "hull",
        "category": "wholeships",
        "forward": "+X",
        "embeddedPlume": False,
    }

    # One lofted barge shell. Hopper span is a real dorsal cavity with floor and
    # 8–12 cm walls; bow/stern are solid formed closures. Abeam cannot see studio
    # through the hull. Side armor is stepped plate on that shell, not twin boxes.
    n_hull = 5 if lod == 0 else (4 if lod == 1 else 3)
    hop_specs = [
        (2.14, 2.62, 1.02, 1.12, 0.20, -0.86, 0.10, 0.14),
        (0.92, 2.46, 1.14, 1.06, 0.10, -0.92, 0.11, 0.16),
        (-0.18, 2.36, 1.18, 1.02, 0.04, -0.96, 0.12, 0.18),
        (-1.32, 2.58, 1.08, 1.08, 0.08, -0.90, 0.11, 0.16),
        (-2.24, 2.74, 0.88, 1.14, 0.16, -0.84, 0.10, 0.14),
    ]
    if n_hull == 4:
        hop_specs = [hop_specs[0], hop_specs[1], hop_specs[2], hop_specs[4]]
    elif n_hull == 3:
        hop_specs = [hop_specs[0], hop_specs[2], hop_specs[4]]
    shell_hop = add_section_mesh(
        "Shell_Hopper",
        [barge_cavity_ring(x, hw, well, dk, fl, kl, wall, ch) for x, hw, well, dk, fl, kl, wall, ch in hop_specs],
        hull, collection, 0.016, cap=True,
    )
    spon_y = 2.52
    boolean_cut_cylinder(shell_hop, "ArmWell_ForeP", (2.08, -spon_y, 0.62), 0.68, 0.44, (0, 0, 0), 14)
    boolean_cut_cylinder(shell_hop, "ArmWell_AftP", (-1.35, -spon_y, 0.62), 0.68, 0.44, (0, 0, 0), 14)
    boolean_cut_cylinder(shell_hop, "ArmWell_ForeS", (2.08, spon_y, 0.62), 0.68, 0.44, (0, 0, 0), 14)
    boolean_cut_cylinder(shell_hop, "ArmWell_AftS", (-1.35, spon_y, 0.62), 0.68, 0.44, (0, 0, 0), 14)

    fore_all = [
        (2.16, 2.62, 1.12, -0.86, 0.14),
        (4.18, 2.92, 1.18, -0.70, 0.16),
        (5.88, 2.16, 0.98, -0.48, 0.18),
        (7.12, 1.28, 0.66, -0.26, 0.16),
        (8.18, 0.90, 0.38, -0.10, 0.12),
    ]
    if n_hull <= 3:
        fore_specs = [fore_all[0], fore_all[2], fore_all[4]]
    elif n_hull <= 4:
        fore_specs = [fore_all[0], fore_all[1], fore_all[2], fore_all[4]]
    else:
        fore_specs = fore_all
    fore = add_section_mesh(
        "Shell_Fore",
        [formed_hull_ring(x, hw, dk, kl, ch) for x, hw, dk, kl, ch in fore_specs],
        hull, collection, 0.016, cap=True,
    )
    boolean_cut_box(fore, "CabWell", (6.42, 0.0, 0.92), (1.72, 1.18, 0.92))

    aft_all = [
        (-2.26, 2.74, 1.14, -0.84, 0.14),
        (-4.32, 3.08, 1.20, -0.76, 0.16),
        (-6.12, 2.52, 0.92, -0.68, 0.14),
        (-7.28, 1.62, 0.56, -0.38, 0.12),
        (-8.18, 1.02, 0.34, -0.14, 0.10),
    ]
    if n_hull <= 3:
        aft_specs = [aft_all[0], aft_all[2], aft_all[4]]
    elif n_hull <= 4:
        aft_specs = [aft_all[0], aft_all[1], aft_all[2], aft_all[4]]
    else:
        aft_specs = aft_all
    aft = add_section_mesh(
        "Shell_Aft",
        [formed_hull_ring(x, hw, dk, kl, ch) for x, hw, dk, kl, ch in aft_specs],
        hull, collection, 0.014, cap=True,
    )
    print(f"lod{lod} aft pre-cut verts={len(aft.data.vertices)}")
    boolean_cut_box(aft, "AftTrench", (-5.55, 0.0, 0.78), (1.35, 0.16, 0.18))
    boolean_cut_box(aft, "PulsePocketP", (-6.48, -1.62, 0.28), (1.00, 0.64, 0.58))
    boolean_cut_box(aft, "PulsePocketS", (-6.48, 1.62, 0.28), (1.00, 0.64, 0.58))
    boolean_cut_box(aft, "AftCornerP", (-7.95, -1.08, 0.26), (0.26, 0.16, 0.24))
    boolean_cut_box(aft, "AftCornerS", (-7.95, 1.08, 0.26), (0.26, 0.16, 0.24))
    print(
        f"lod{lod} shell verts: hop={len(shell_hop.data.vertices)} "
        f"fore={len(fore.data.vertices)} aft={len(aft.data.vertices)}"
    )
    if len(aft.data.vertices) < 40:
        raise RuntimeError(f"ironback lod{lod} Shell_Aft collapsed to {len(aft.data.vertices)} verts")
    if len(shell_hop.data.vertices) < 40 or len(fore.data.vertices) < 40:
        raise RuntimeError(f"ironback lod{lod} formed host collapsed")

    add_hoop_frame("Frame_ForeStep", 2.15, 1.48, 0.82, 0.06, armor, collection, thick=0.040, half_w=0.06)
    add_hoop_frame("Frame_AftStep", -2.25, 1.52, 0.78, 0.04, armor, collection, thick=0.040, half_w=0.06)

    add_folded_sheet("BowPlate", (8.05, -1.28, 0.42), (8.18, -0.85, -0.18), (8.18, 0.85, -0.18), (8.05, 1.28, 0.42), 0.08, armor, collection, 0.005)
    add_box("BowRam", (7.92, 0.0, -0.08), (0.22, 1.22, 0.32), armor, collection, 0.006)
    add_box("Transom", (-8.12, 0.0, 0.02), (0.10, 1.35, 0.42), armor, collection, 0.006)

    # Stepped oxide armor on the shell: thickness, gaps, rooted shoulders, quiet waist.
    plate_courses = (
        ("ForeShoulder", 3.55, 5.15, 2.12, 2.88, 0.18, 1.02),
        ("WaistQuiet", -0.35, 1.45, 2.02, 2.42, 0.28, 0.88),
        ("AftShoulder", -4.85, -2.75, 2.18, 3.02, 0.14, 1.08),
    )
    for tag, x0, x1, yi, yo, z0, z1 in plate_courses:
        add_section_mesh(
            f"Armor_{tag}_S",
            [
                plate_follow_ring(x0, yi, yo, z0, z1, 0.10),
                plate_follow_ring(x1, yi - 0.04, yo - 0.06, z0, z1 - 0.04, 0.10),
            ],
            hull, collection, 0.006, cap=True,
        )
        add_section_mesh(
            f"Armor_{tag}_P",
            [
                plate_follow_ring(x0, -yo, -yi, z0, z1, 0.10),
                plate_follow_ring(x1, -yo + 0.06, -yi + 0.04, z0, z1 - 0.04, 0.10),
            ],
            hull, collection, 0.006, cap=True,
        )

    add_box("AftTrenchFloor", (-5.55, 0.0, 0.50), (1.45, 0.14, 0.05), mech, collection, 0.003)
    add_box("AftTrenchRailP", (-5.55, -0.20, 0.68), (1.35, 0.035, 0.05), armor, collection, 0.002)
    add_box("AftTrenchRailS", (-5.55, 0.20, 0.68), (1.35, 0.035, 0.05), armor, collection, 0.002)

    add_processing_hopper(lod, mats, collection)
    add_command_cage(lod, mats, collection)
    add_pulse_plate_drive(lod, mats, collection)

    add_cutter_arm("ForeP", (2.08, -spon_y, 0.54), -1, 1, "saw", lod, mats, collection)
    add_cutter_arm("ForeS", (2.08, spon_y, 0.54), 1, 1, "crusher", lod, mats, collection)
    add_cutter_arm("AftP", (-1.35, -spon_y, 0.54), -1, -1, "drill", lod, mats, collection)
    add_cutter_arm("AftS", (-1.35, spon_y, 0.54), 1, -1, "grab", lod, mats, collection, repair=True)

    add_winch_cluster(mats, collection)
    add_box("RepairPatch", (1.65, 2.25, 0.98), (0.36, 0.18, 0.03), warning, collection, 0.003)
    add_box("KeelSpine", (0.10, 0.0, -1.32), (5.2, 0.32, 0.09), mech, collection, 0.008)
    add_box("Skid_P", (0.20, -1.35, -1.40), (4.2, 0.14, 0.07), armor, collection, 0.005)
    add_box("Skid_S", (0.20, 1.35, -1.40), (4.2, 0.14, 0.07), armor, collection, 0.005)
    add_box("CargoHardP", (-0.40, -0.95, -1.50), (0.48, 0.16, 0.07), mech, collection, 0.003)
    add_box("CargoHardS", (-0.40, 0.95, -1.50), (0.48, 0.16, 0.07), mech, collection, 0.003)

    if lod <= 1:
        add_radiator_cassette("P", (0.55, -2.35, 0.42), lod, mats, collection, length=1.35, height=0.34)
        add_radiator_cassette("S", (0.55, 2.35, 0.42), lod, mats, collection, length=1.35, height=0.34)
        add_section_mesh(
            "ThermalRest",
            [
                plate_follow_ring(-5.72, -0.28, 0.28, 0.62, 0.78, 0.08),
                plate_follow_ring(-6.18, -0.22, 0.22, 0.58, 0.74, 0.08),
            ],
            mech, collection, 0.004, cap=True,
        )
        add_section_mesh(
            "ThermalSponP",
            [
                plate_follow_ring(-6.05, -2.55, -1.95, 0.70, 0.92, 0.08),
                plate_follow_ring(-6.55, -2.42, -1.88, 0.66, 0.88, 0.08),
            ],
            ceramic, collection, 0.004, cap=True,
        )
        add_section_mesh(
            "ThermalSponS",
            [
                plate_follow_ring(-6.05, 1.95, 2.55, 0.70, 0.92, 0.08),
                plate_follow_ring(-6.55, 1.88, 2.42, 0.66, 0.88, 0.08),
            ],
            ceramic, collection, 0.004, cap=True,
        )
        add_rcs_cluster("P", (-1.2, -2.75, 0.12), mats, collection, sign=-1)
        add_rcs_cluster("S", (-1.2, 2.75, 0.12), mats, collection, sign=1)
        add_cylinder("TurretRing", (3.55, 0.0, 1.12), 0.26, 0.08, mech, collection, 12, 0.004, (0, 0, 0))
        add_box("TurretHead", (3.68, 0.0, 1.24), (0.22, 0.14, 0.06), armor, collection, 0.003)
        add_box("HatchLid", (3.15, 0.72, 0.96), (0.32, 0.20, 0.035), armor, collection, 0.003)
        add_box("HatchHinge", (2.92, 0.72, 0.98), (0.035, 0.14, 0.025), mech, collection, 0.002)
    else:
        add_box("Radiator_LOD2_P", (0.55, -2.35, 0.42), (0.72, 0.07, 0.18), mats["Material_Radiator"], collection, 0.005)
        add_box("Radiator_LOD2_S", (0.55, 2.35, 0.42), (0.72, 0.07, 0.18), mats["Material_Radiator"], collection, 0.005)
    if lod == 0:
        add_box("CatwalkAft", (-3.35, 0.0, 0.92), (0.85, 0.12, 0.025), mech, collection, 0.002)
        add_box("LightP", (2.85, -2.95, 0.78), (0.07, 0.07, 0.05), warning, collection, 0.002)
        add_box("LightS", (2.85, 2.95, 0.78), (0.07, 0.07, 0.05), warning, collection, 0.002)
        add_cylinder("CommMast", (3.85, 0.48, 1.28), 0.035, 0.42, mech, collection, 8, 0.002, (0, 0, 0))

    mesh_objects = [obj for obj in collection.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        apply_modifiers(obj)
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
        active.data.name = active.name
        active.parent = root
        shade_and_uv(active)
        wn = active.modifiers.new("JoinedWN", "WEIGHTED_NORMAL")
        wn.keep_sharp = True
        if hasattr(wn, "weight"):
            wn.weight = 50
        if hasattr(wn, "use_face_influence"):
            wn.use_face_influence = True
        apply_modifiers(active)
        tri = active.modifiers.new("ExportTriangulate", "TRIANGULATE")
        tri.quad_method = "BEAUTY"
        bpy.context.view_layer.objects.active = active
        active.select_set(True)
        bpy.ops.object.modifier_apply(modifier=tri.name)
        if lod == 0:
            bake_ao_into_orm(active)
        merged.append(active)

    for name, loc in sockets().items():
        add_empty(name, loc, collection, root)
    bm = bmesh.new()
    for point in [
        (8.1, 0, 0.2),
        (0, -4.3, 0.3),
        (0, 4.3, 0.3),
        (-8.0, -2.0, 0.2),
        (-8.0, 2.0, 0.2),
        (2.2, -1.8, -1.35),
        (2.2, 1.8, -1.35),
        (2.6, -4.3, -0.2),
        (2.6, 4.3, -0.2),
        (-2.0, -4.3, -0.2),
        (-2.0, 4.3, -0.2),
        (7.6, -1.8, 0.4),
        (7.6, 1.8, 0.4),
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
    out = FAMILY / "source" / "wholeships" / f"ironback_production_v1_lod{lod}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.all_objects:
        obj.hide_viewport = False
        obj.hide_set(False)
        obj.select_set(True)
    tmp = out.with_suffix(".tmp.glb")
    bpy.ops.export_scene.gltf(
        filepath=str(tmp),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_image_format="AUTO",
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
    scene.view_settings.exposure = 0.72
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.038, 0.044, 0.052, 1)
    bg.inputs["Strength"].default_value = 0.68
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 9200, (0.90, 0.93, 1), 10),
        ("Fill", (4, 16, 8), 4000, (0.58, 0.65, 0.76), 8),
        ("ForeFill", (20, 2, 10), 4200, (0.72, 0.78, 0.88), 9),
        ("Rim", (-14, -5, 7), 4600, (0.76, 0.84, 0.96), 7),
        ("Kick", (-6, 10, -4), 2000, (0.72, 0.78, 0.88), 6),
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


def override_map_isolation(meshes, suffix):
    backups = {}
    for obj in meshes:
        backups[obj.name] = [slot.material for slot in obj.material_slots]
        src = obj.data.materials[0] if obj.data.materials else None
        img = None
        if src and src.use_nodes:
            img = next((n.image for n in src.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and suffix in n.image.name), None)
        mat = bpy.data.materials.new(f"ISO_{suffix}_{obj.name}")
        mat.use_nodes = True
        mat.node_tree.nodes.clear()
        out = mat.node_tree.nodes.new("ShaderNodeOutputMaterial")
        emit = mat.node_tree.nodes.new("ShaderNodeEmission")
        emit.inputs["Strength"].default_value = 1.0
        if img:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = img
            mat.node_tree.links.new(tex.outputs["Color"], emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = (0.3, 0.3, 0.3, 1)
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


def runtime_display_scale(objects):
    """Match live play size: hull targetLength 1.72 * Ironback collisionRadius 24."""
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    extent_x = maxs.x - mins.x
    if extent_x < 1e-6:
        raise RuntimeError("ironback render import has no measurable +X extent")
    target = ASSEMBLY_HULL_UNITS * IRONBACK_COLLISION_RADIUS
    scale = target / extent_x
    print(f"runtime display scale {scale:.3f} (authored {extent_x:.2f} -> {target:.1f} WU)")
    return scale


def apply_render_scale(scale):
    pivot = bpy.data.objects.new("RuntimeDisplayScale", None)
    bpy.context.scene.collection.objects.link(pivot)
    for obj in list(bpy.context.scene.objects):
        if obj.parent is not None or obj.name == "RuntimeDisplayScale":
            continue
        if obj.type in {"CAMERA", "LIGHT"}:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = pivot
        obj.matrix_world = matrix
    pivot.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    return pivot


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
        raise RuntimeError("ironback occupancy: no projected vertices")
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
            rec["widthFrac"],
            close=name == "play_chase_close",
            cropped=rec["cropped"],
        )
        measured[name] = rec
        print(f"occupancy {name}: {rec['widthPx1600']:.1f}px ({rec['widthFrac']*100:.2f}%) crop={rec['cropped']}")
        if rec["cropped"]:
            failures.append(f"{name} crops the mesh (ndc x={rec['minX']:.3f}..{rec['maxX']:.3f} y={rec['minY']:.3f}..{rec['maxY']:.3f})")
        if not (band[0] <= rec["widthFrac"] <= band[1]):
            failures.append(f"{name} width {rec['widthFrac']*100:.2f}% outside {band[0]*100:.0f}-{band[1]*100:.0f}%")
    return measured, failures


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
        raise RuntimeError(f"no visible Ironback meshes imported from {glb_path}")
    display_scale = runtime_display_scale(meshes)
    apply_render_scale(display_scale)
    camera = setup_studio()
    out = FAMILY / "evidence" / "ironback" / "cycles" / f"cycle_{CYCLE:02d}"
    out.mkdir(parents=True, exist_ok=True)
    focus = (0.0, 0.0, 0.18 * display_scale)
    occupancy, occupancy_failures = measure_supported_occupancy(camera, meshes, focus)
    render_cycle_chase_stills(camera, out, focus=focus)

    backups = override_emission(meshes, lambda _o: ((0.46, 0.46, 0.47), 1.0), clay=True)
    render_chase_still(camera, out / "clay_play_chase.png", distance=DISTANCE_DEFAULT, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    world_bg = bpy.context.scene.world.node_tree.nodes.get("Background")
    prior_strength = world_bg.inputs["Strength"].default_value
    world_bg.inputs["Strength"].default_value = 0.12
    render_chase_still(camera, out / "grazing_close.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    world_bg.inputs["Strength"].default_value = prior_strength

    ids = {
        "Hull": (0.75, 0.42, 0.22),
        "Armor": (0.08, 0.16, 0.18),
        "Mechanical": (0.45, 0.45, 0.48),
        "Canopy": (0.02, 0.08, 0.1),
        "Warning": (0.9, 0.4, 0.05),
        "Ceramic": (0.7, 0.55, 0.35),
        "Thruster": (0.55, 0.22, 0.08),
        "Radiator": (0.35, 0.22, 0.12),
    }

    def id_color(obj):
        for key, color in ids.items():
            if key.lower() in obj.name.lower():
                return color, 1.0
        return (0.4, 0.4, 0.4), 1.0

    backups = override_emission(meshes, id_color)
    render_chase_still(camera, out / "id_or_material_id.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    backups = override_map_isolation(meshes, "orm")
    render_chase_still(camera, out / "orm_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)
    backups = override_map_isolation(meshes, "normal")
    render_chase_still(camera, out / "normal_isolation.png", distance=DISTANCE_CLOSE, heading_deg=0.0, focus=focus)
    restore_mats(meshes, backups)

    still_hashes = {path.name: sha256(path) for path in sorted(out.glob("*.png"))}
    identity = {
        "schema": "spaceface.exactSourceEvidence.v1",
        "shipId": "ironback",
        "cycle": CYCLE,
        "source": str(glb_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": sha256(glb_path),
        "renderer": "tools/blender/build_ironback_mtx.py+spaceface_chase_camera.py",
        "cameraContract": {
            "module": "tools/blender/spaceface_chase_camera.py",
            "fov_v_deg": FOV_V_DEG,
            "tilt_deg": TILT_DEG,
            "play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0},
            "play_chase_abeam": {"distance": DISTANCE_DEFAULT, "heading_deg": 90.0},
            "play_chase_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "runtimeDisplayScale": display_scale,
            "runtimeDisplayTargetWU": ASSEMBLY_HULL_UNITS * IRONBACK_COLLISION_RADIUS,
            "clay_play_chase": {"distance": DISTANCE_DEFAULT, "heading_deg": 0.0, "material": "neutral_clay"},
            "grazing_close": {"distance": DISTANCE_CLOSE, "heading_deg": 0.0},
            "diagnostics": ["id_or_material_id.png", "orm_isolation.png", "normal_isolation.png"],
        },
        "occupancy": occupancy,
        "occupancyFailures": occupancy_failures,
        "views": ["play_chase.png", "play_chase_abeam.png", "play_chase_close.png", "clay_play_chase.png", "grazing_close.png", "orm_isolation.png", "normal_isolation.png", "id_or_material_id.png"],
        "stillSha256": still_hashes,
    }
    (out / "EVIDENCE_IDENTITY.json").write_bytes((json.dumps(identity, indent=2) + "\n").encode("utf-8"))
    return out, identity


def main():
    FAMILY.mkdir(parents=True, exist_ok=True)
    reset_scene()
    mats = create_materials()
    reports = []
    outputs = []
    for lod in (0, 1, 2):
        collection, report = build_lod(lod, mats)
        output = export_lod(collection, lod)
        report.update({"path": str(output.relative_to(FAMILY)).replace("\\", "/"), "bytes": output.stat().st_size, "sha256": sha256(output)})
        if report["hullTriangles"] < 800:
            raise RuntimeError(f"ironback lod{lod} hull {report['hullTriangles']} < 800")
        outputs.append(output)
        reports.append(report)
    stills, identity = render_cycle(outputs[0])
    occupancy = identity.get("occupancy", {})
    occupancy_failures = identity.get("occupancyFailures", [])
    report = {
        "schema": "spaceface.ironbackMtx.cycle.v1",
        "shipId": "ironback",
        "cycle": CYCLE,
        "lods": reports,
        "stills": str(stills.relative_to(FAMILY)).replace("\\", "/"),
        "sourceSha256": identity["sourceSha256"],
        "renderer": identity["renderer"],
        "cameraContract": identity["cameraContract"],
        "occupancy": occupancy,
        "stillSha256": identity["stillSha256"],
        "disposition": "revise",
        "method": "formed_cavity_shell_barge",
    }
    (FAMILY / "evidence" / "ironback").mkdir(parents=True, exist_ok=True)
    (FAMILY / "evidence" / "ironback" / f"cycle_{CYCLE:02d}.json").write_bytes((json.dumps(report, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({
        "ok": True,
        "cycle": CYCLE,
        "hull0": reports[0]["hullTriangles"],
        "tris0": reports[0]["triangles"],
        "sha0": reports[0]["sha256"],
        "occupancy": {name: rec.get("widthFrac") for name, rec in occupancy.items()},
        "occupancyFailures": occupancy_failures,
    }, indent=2))
    if occupancy_failures:
        raise RuntimeError("ironback occupancy failed: " + "; ".join(occupancy_failures))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
