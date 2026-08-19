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
    add_overlap_plate,
    add_radiator_cassette,
    add_rcs_cluster,
    add_sensor_dish,
    add_service_hatch,
    add_tapered_vane,
    add_tile_bank,
    apply_modifiers,
    boolean_cut_box,
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
# LOD0 is 1024, not 2048, and that is a hardware finding rather than an art choice.
#
# 2048 renders fine on the sparse cycle-56 body (4,951 hull triangles) but crashes Blender in
# igc64.dll -- the Intel graphics compiler -- during render setup on the cycle-54 body (21,240 hull
# triangles). Reproduced twice in a row at the same point, after all three LODs had already
# exported cleanly, so it is the render step and not the export.
#
# 1024 gives about 96 px/m on a 10.7 m ship. That is triple the old 512 and still below MTX-17's
# 256 px/m floor, which needs roughly a 2740 px map. So the contract's density target is not
# reachable on this machine through this render path, and that limit belongs in the record rather
# than in a build that dies. Raise it on a machine that survives 2048, or split the bake out of
# the still-render pass.
# Restored to the intended ladder after a control run settled what the render crash is NOT.
#
# 2048 exports and renders cleanly (cycle 57). Later the same day 2048 crashed Blender in
# igc64.dll during render setup; so did 1024; and so did a control at 512 — cycle 54's exact
# configuration, which had rendered without complaint a few hours earlier. A configuration that
# worked and then stopped working, with nothing between, is the machine and not the build. Every
# one of those runs exported all three LODs correctly first, so the fault is confined to the
# still-render pass.
#
# Do not lower these to chase that crash. Take the stills on a fresh GPU state.
# LOD0 is 1024, and the reason is repository weight, not looks.
#
# 2048 gives about 191 px/m on a 10.7 m ship, the closest any setting here gets to MTX-17's
# 256 px/m floor. It also produces a 65.8 MB source GLB, which GitHub rejects as oversized
# (>50 MB) and which, across the 22 ships in this campaign, would add roughly 1.4 GB of permanent
# history. 1024 lands about 96 px/m in a ~33 MB file: triple the old 512, and affordable.
#
# So the contract's density target is not reachable through committed source at fleet scale, and
# that is a pipeline problem rather than an authoring one. The fix, when someone takes it, is to
# keep high maps out of git — bake at 2048 into the release artifact only, or stream them — not to
# quietly accept 34 px/m and keep asking reviewers why the hulls look like plastic.
TEX_BY_LOD = {0: 1024, 1: 512, 2: 512}
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
        "Material_Hull": ((0.38, 0.40, 0.42), 0.03, 0.54, "hull", 0.12, None),
        "Material_Armor": ((0.10, 0.11, 0.12), 0.58, 0.30, "armor", 0.08, None),
        "Material_Mechanical": ((0.50, 0.48, 0.44), 0.90, 0.22, "mechanical", 0.0, None),
        "Material_Accent": ((0.04, 0.40, 0.50), 0.10, 0.34, "accent", 0.2, None),
        "Material_Warning": ((0.70, 0.34, 0.05), 0.05, 0.46, "warning", 0.1, None),
        "Material_Ceramic": ((0.30, 0.16, 0.09), 0.0, 0.68, "ceramic", 0.0, None),
        "Material_Radiator": ((0.12, 0.10, 0.08), 0.62, 0.62, "mechanical", 0.0, None),
        "Material_Canopy": ((0.10, 0.16, 0.18), 0.00, 0.08, "glass", 0.35, ((0.05, 0.10, 0.12), 0.16)),
        "Material_Thruster": ((0.012, 0.014, 0.016), 0.08, 0.28, "thruster", 0.0, None),
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
            # Opaque dark dielectric. Transmission in this EEVEE studio reads as a
            # black tent or a hole to the backdrop; the frames and the tub carry the cockpit.
            if "Transmission Weight" in bsdf.inputs:
                bsdf.inputs["Transmission Weight"].default_value = 0.0
            elif "Transmission" in bsdf.inputs:
                bsdf.inputs["Transmission"].default_value = 0.0
            if "IOR" in bsdf.inputs:
                bsdf.inputs["IOR"].default_value = 1.45
            bsdf.inputs["Alpha"].default_value = 1.0
            if hasattr(material, "blend_method"):
                try:
                    material.blend_method = "OPAQUE"
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
    mod_name = mod.name
    bpy.ops.object.modifier_apply(modifier=mod_name)
    host.select_set(False)
    bpy.data.objects.remove(cutter, do_unlink=True)


def recalc_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.remove_doubles(threshold=0.0005)
    except TypeError:
        bpy.ops.mesh.merge_by_distance(distance=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def subdivide_mesh(obj, cuts=1):
    apply_modifiers(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=int(cuts))
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return obj


def thicken_shell(obj, thickness=0.10):
    """Give a paper loft a wall so later cuts are pockets, not tunnels."""
    apply_modifiers(obj)
    solid = obj.modifiers.new("HullSkin", "SOLIDIFY")
    solid.thickness = float(thickness)
    solid.offset = -1.0
    try:
        solid.use_even_offset = True
    except Exception:
        pass
    apply_modifiers(obj)
    return recalc_mesh(obj)


def report_shells(obj, tag):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen = set()
    islands = 0
    for vert in bm.verts:
        if vert.index in seen:
            continue
        stack = [vert]
        seen.add(vert.index)
        while stack:
            cur = stack.pop()
            for edge in cur.link_edges:
                other = edge.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        islands += 1
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    bm.free()
    print(f"{tag}: {islands} shells, {boundary} boundary")
    return islands, boundary


def add_five_wall_tub(tag, loc, inner, wall, material, collection):
    """Line a cut hole. inner is (hx, hy, hz) half-extents of the empty volume."""
    x, y, z = loc
    hx, hy, hz = inner
    t = float(wall)
    add_box(f"{tag}_Floor", (x, y, z - hz + t * 0.5), (hx, hy, t * 0.5), material, collection, 0.003)
    add_box(f"{tag}_Fore", (x + hx - t * 0.5, y, z), (t * 0.5, hy, hz), material, collection, 0.003)
    add_box(f"{tag}_Aft", (x - hx + t * 0.5, y, z), (t * 0.5, hy, hz), material, collection, 0.003)
    add_box(f"{tag}_Port", (x, y - hy + t * 0.5, z), (hx - t, t * 0.5, hz), material, collection, 0.003)
    add_box(f"{tag}_Stbd", (x, y + hy - t * 0.5, z), (hx - t, t * 0.5, hz), material, collection, 0.003)


def delete_faces_in_box(obj, x0, x1, y0, y1, z0, z1, normal=None, normal_min=0.35):
    """Open a well by deleting faces. Does not Exact-boolean the whole loft."""
    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    victims = []
    for face in bm.faces:
        center = face.calc_center_median()
        if not (x0 <= center.x <= x1 and y0 <= center.y <= y1 and z0 <= center.z <= z1):
            continue
        if normal == "z" and face.normal.z < normal_min:
            continue
        if normal == "y+" and face.normal.y < normal_min:
            continue
        if normal == "y-" and face.normal.y > -normal_min:
            continue
        victims.append(face)
    if victims:
        bmesh.ops.delete(bm, geom=victims, context="FACES")
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def add_hollow_bell(tag, x, y, z, scale, mats, collection):
    """Open spun bottle with wall thickness. No coin at the mouth. Back wall inboard."""
    s = scale
    ceramic, thruster, mech, armor = (
        mats["Material_Ceramic"], mats["Material_Thruster"],
        mats["Material_Mechanical"], mats["Material_Armor"],
    )
    rings = []
    for t, r, rz in (
        (0.00, 0.30, 0.30),
        (0.20, 0.38, 0.38),
        (0.45, 0.54, 0.54),
        (0.72, 0.72, 0.72),
        (1.00, 0.90, 0.90),
    ):
        xi = x - 0.10 * s - t * 1.70 * s
        rings.append(ellipse_ring(xi, y, z, r * s, rz * s, 48))
    outer = loft_from_rings(f"Bell_{tag}", rings, mech, collection, 0.010, cap=False)
    thicken_shell(outer, 0.080 * s)
    add_cylinder(f"BellBack_{tag}", (x - 0.22 * s, y, z), 0.13 * s, 0.04 * s, thruster, collection, 16, 0.002)
    add_cylinder(f"BellCollar_{tag}", (x - 0.02 * s, y, z), 0.38 * s, 0.14 * s, ceramic, collection, 22, 0.004)
    add_cylinder(f"BellClamp_{tag}", (x + 0.12 * s, y, z), 0.44 * s, 0.06 * s, armor, collection, 22, 0.003)
    add_cylinder(f"BellFlange_{tag}", (x + 0.26 * s, y, z), 0.50 * s, 0.08 * s, mech, collection, 22, 0.003)
    add_cylinder(f"BellHub_{tag}", (x - 0.48 * s, y, z), 0.08 * s, 0.16 * s, mech, collection, 12, 0.002)
    for index in range(8):
        ang = math.tau * index / 8
        add_cylinder(
            f"BellBolt_{tag}_{index}",
            (x + 0.26 * s, y + math.cos(ang) * 0.46 * s, z + math.sin(ang) * 0.46 * s),
            0.016 * s, 0.05 * s, mech, collection, 8, 0.001,
        )
    for index in range(10):
        ang = math.tau * index / 10
        add_tapered_vane(f"BellVane_{tag}_{index}", (x - 1.05 * s, y, z), armor, collection, ang, scale=s * 0.78)
        add_box(
            f"BellRoot_{tag}_{index}",
            (x - 0.52 * s, y + math.cos(ang) * 0.14 * s, z + math.sin(ang) * 0.14 * s),
            (0.07 * s, 0.030 * s, 0.024 * s),
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
    """Swept delta. Thick root buried in the beam, thin tip, separate flap with a slot."""
    s = float(sign)

    def station(y_abs, le, chord, thick, z):
        return airfoil_ring(le - chord * 0.42, y_abs * s, z, chord, thick)

    rings = [
        station(1.18, 1.28, 3.90, 0.78, 0.16),
        station(1.82, 0.95, 3.28, 0.46, 0.10),
        station(2.48, 0.40, 2.65, 0.26, 0.04),
        station(3.12, -0.12, 2.20, 0.14, -0.02),
        station(3.66, -0.50, 1.90, 0.10, -0.06),
    ]
    wing = loft_from_rings(name, rings, hull, collection, 0.014, cap=True)
    loft_from_rings(f"{name}_Flap", [
        airfoil_ring(-1.82, 1.62 * s, 0.02, 0.78, 0.16),
        airfoil_ring(-2.52, 3.12 * s, -0.06, 0.56, 0.09),
    ], armor, collection, 0.005)
    add_folded_sheet(
        f"{name}_Leading",
        (1.22, 1.20 * s, 0.22), (-0.18, 3.40 * s, 0.04),
        (-0.32, 3.40 * s, -0.08), (1.08, 1.20 * s, -0.08),
        0.060, hull, collection, 0.004,
    )
    add_folded_sheet(
        f"{name}_TipCap",
        (-0.28, 3.50 * s, 0.04), (-2.42, 3.64 * s, 0.00),
        (-2.50, 3.64 * s, -0.10), (-0.40, 3.50 * s, -0.10),
        0.048, hull, collection, 0.003,
    )
    add_overlap_plate(f"{name}_TileA", (0.30, 1.72 * s, 0.20), (0.30, 0.16, 0.016), armor, collection, 0.003)
    add_overlap_plate(f"{name}_TileB", (-0.40, 2.40 * s, 0.10), (0.26, 0.14, 0.014), armor, collection, 0.003)
    add_overlap_plate(f"{name}_TileC", (-1.10, 3.00 * s, 0.02), (0.22, 0.12, 0.012), armor, collection, 0.003)
    return wing


def add_merged_nacelle(tag, sign, lod, mats, collection):
    """Drive house grown out of the aft body. One bell per side, no stacked second drive."""
    hull = mats["Material_Hull"]
    y = 0.72 * sign
    nacelle = loft_from_rings(f"Nacelle_{tag}", [
        densify_ring(station_ring(-2.20, y, 0.06, 0.42, 0.48, flat=0.22, box=0.72, keel=0.18)),
        densify_ring(station_ring(-3.15, y, 0.08, 0.46, 0.54, flat=0.18, box=0.84, keel=0.12)),
        densify_ring(station_ring(-4.05, y, 0.10, 0.44, 0.52, flat=0.14, box=0.90, keel=0.10)),
        densify_ring(station_ring(-4.88, y, 0.12, 0.38, 0.46, flat=0.10, box=0.92, keel=0.08)),
    ], hull, collection, 0.010)
    add_hollow_bell(tag, -4.90, y, 0.12, 0.72, mats, collection)
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
    """Low framed shell over a cut tub. Peak stays a lip, not a tent."""
    canopy, armor, mech = mats["Material_Canopy"], mats["Material_Armor"], mats["Material_Mechanical"]
    rings = []
    for t, scale_h, scale_w, z_off in (
        (0.0, 0.18, 0.55, 0.00),
        (0.32, 0.72, 0.92, 0.00),
        (0.68, 1.00, 1.00, 0.00),
        (1.0, 0.22, 0.58, 0.01),
    ):
        xi = x + length * 0.5 - t * length
        h = height * scale_h
        w = width * scale_w
        rings.append([
            (xi, y - w, z + z_off),
            (xi, y - w * 0.70, z + z_off + h * 0.50),
            (xi, y - w * 0.16, z + z_off + h),
            (xi, y + w * 0.16, z + z_off + h),
            (xi, y + w * 0.70, z + z_off + h * 0.50),
            (xi, y + w, z + z_off),
        ])
    shell = loft_from_rings(f"{tag}_Shell", rings, canopy, collection, bevel=0.003, cap=False)
    solid = shell.modifiers.new("GlassShell", "SOLIDIFY")
    solid.thickness = 0.014
    solid.offset = 1.0
    add_box(f"{tag}_Sill", (x, y, z + 0.006), (length * 0.50, width * 0.94, 0.010), armor, collection, 0.002)
    add_box(f"{tag}_Brow", (x + length * 0.46, y, z + height * 0.18), (0.022, width * 0.48, height * 0.08), armor, collection, 0.002)
    add_box(f"{tag}_AftBulk", (x - length * 0.48, y, z + height * 0.14), (0.018, width * 0.58, height * 0.10), armor, collection, 0.002)
    add_box(f"{tag}_RailP", (x, y - width * 0.92, z + height * 0.12), (length * 0.34, 0.010, height * 0.08), armor, collection, 0.002)
    add_box(f"{tag}_RailS", (x, y + width * 0.92, z + height * 0.12), (length * 0.34, 0.010, height * 0.08), armor, collection, 0.002)
    add_box(f"{tag}_Mullion", (x + length * 0.02, y, z + height * 0.22), (0.010, width * 0.42, height * 0.06), armor, collection, 0.002)
    for i, ox in enumerate((-0.32, -0.08, 0.14, 0.34)):
        add_cylinder(f"{tag}_Rivet_{i}", (x + ox, y - width * 0.90, z + 0.016), 0.008, 0.014, mech, collection, vertices=6, bevel=0.001, rot=(0, 0, 0))
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

    Re-seated for the C59 raised interceptor. Names are the runtime contract.
    Envelope target: x -4.95 -> 5.60, span +/-3.64, z -1.05 -> 1.20.
    """
    return {
        "SOCKET_Weapon_Front": (5.28, 0.0, 0.14),
        "SOCKET_Mining_Front": (5.42, 0.0, -0.14),
        "SOCKET_Engine_Main": (-4.78, 0.0, 0.14),
        "SOCKET_Trail_Main": (-5.05, 0.0, 0.14),
        "SOCKET_Trail_Port": (-4.95, -1.20, 0.14),
        "SOCKET_Trail_Starboard": (-4.95, 1.20, 0.14),
        "SOCKET_Utility_Dorsal": (0.55, 0.0, 1.12),
        "SOCKET_Cargo_Ventral": (-0.40, 0.0, -0.98),
        "SOCKET_Camera_Focus": (0.80, 0.0, 0.28),
        "SOCKET_RCS_Port": (-1.20, -2.20, 0.10),
        "SOCKET_RCS_Starboard": (-1.20, 2.20, 0.10),
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
    # C61: C59 raised stations, then a real wall, then pocket cuts. Paper loft + face-delete
    # and paper loft + Exact boolean both became cages. Do not inset a zero-thickness shell.
    hull_obj = loft_from_rings("Pressure_Hull", [
        densify_ring(station_ring(5.60, 0, 0.16, 0.22, 0.32, flat=0.10, box=0.12, keel=0.88), 3),
        densify_ring(station_ring(5.22, 0, 0.20, 0.52, 0.58, flat=0.22, box=0.22, keel=0.72), 3),
        densify_ring(station_ring(4.72, 0, 0.24, 0.74, 0.80, flat=0.36, box=0.30, keel=0.58), 3),
        densify_ring(station_ring(4.18, 0, 0.28, 0.88, 0.92, flat=0.55, box=0.34, keel=0.50), 3),
        densify_ring(station_ring(3.68, 0, 0.32, 0.90, 1.05, flat=0.86, box=0.38, keel=0.42), 3),
        densify_ring(station_ring(3.15, 0, 0.30, 1.00, 1.12, flat=0.88, box=0.42, keel=0.40), 3),
        densify_ring(station_ring(2.55, 0, 0.22, 1.12, 1.00, flat=0.58, box=0.52, keel=0.36), 3),
        densify_ring(station_ring(1.80, 0, 0.16, 1.24, 0.98, flat=0.32, box=0.60, keel=0.34), 3),
        densify_ring(station_ring(1.20, 0, 0.14, 1.32, 1.00, flat=0.24, box=0.66, keel=0.32), 3),
        densify_ring(station_ring(0.30, 0, 0.12, 1.38, 1.05, flat=0.18, box=0.70, keel=0.30), 3),
        densify_ring(station_ring(-0.60, 0, 0.10, 1.40, 1.08, flat=0.16, box=0.74, keel=0.28), 3),
        densify_ring(station_ring(-1.40, 0, 0.10, 1.32, 1.02, flat=0.14, box=0.78, keel=0.24), 3),
        densify_ring(station_ring(-2.20, 0, 0.12, 1.22, 0.98, flat=0.14, box=0.82, keel=0.20), 3),
        densify_ring(station_ring(-3.05, 0, 0.14, 1.12, 0.96, flat=0.14, box=0.86, keel=0.14), 3),
        densify_ring(station_ring(-3.85, 0, 0.16, 1.02, 0.92, flat=0.12, box=0.90, keel=0.10), 3),
        densify_ring(station_ring(-4.50, 0, 0.16, 0.96, 0.86, flat=0.10, box=0.92, keel=0.08), 3),
        densify_ring(station_ring(-4.90, 0, 0.16, 0.90, 0.80, flat=0.08, box=0.92, keel=0.06), 3),
    ], hull, collection, 0.012, cap=True)
    thicken_shell(hull_obj, 0.10)
    subdivide_mesh(hull_obj, 1)
    report_shells(hull_obj, "hull after solidify")
    inset_large_faces(hull_obj, thickness=0.018, depth=0.0, min_area=0.14)
    report_shells(hull_obj, "hull after inset")

    boolean_cut_box(hull_obj, "Cut_Cockpit", (3.22, 0.0, 1.50), (0.40, 0.14, 0.055))
    boolean_cut_box(hull_obj, "Cut_Avionics", (0.85, -1.44, 0.22), (0.28, 0.055, 0.12))
    boolean_cut_box(hull_obj, "Cut_Radiator", (-3.05, 1.44, 0.16), (0.34, 0.055, 0.12))
    report_shells(hull_obj, "hull after pocket cuts")
    bevel = hull_obj.modifiers.new("HullBevel", "BEVEL")
    bevel.width = 0.018
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    wn = hull_obj.modifiers.new("HullWN", "WEIGHTED_NORMAL")
    wn.keep_sharp = True
    apply_modifiers(hull_obj)

    add_five_wall_tub("CockpitTub", (3.22, 0.0, 1.08), (0.46, 0.16, 0.28), 0.060, mech, collection)
    add_box("Cockpit_Seat", (3.10, 0.0, 0.88), (0.14, 0.09, 0.05), mech, collection, 0.003)
    add_box("Cockpit_Back", (2.92, 0.0, 0.98), (0.028, 0.09, 0.08), armor, collection, 0.002)
    add_box("Cockpit_Console", (3.48, 0.0, 0.96), (0.09, 0.12, 0.020), armor, collection, 0.002)
    add_greenhouse("Canopy", 3.22, 0.0, 1.22, 1.10, 0.38, 0.28, mats, collection)

    add_five_wall_tub("AvionicsTub", (0.85, -1.28, 0.22), (0.30, 0.12, 0.14), 0.050, mech, collection)
    add_box("AvionicsRack", (0.85, -1.28, 0.16), (0.20, 0.04, 0.06), armor, collection, 0.002)
    add_five_wall_tub("RadiatorTub", (-3.05, 1.28, 0.16), (0.38, 0.12, 0.14), 0.050, mech, collection)

    add_folded_sheet(
        "Chine_P",
        (2.40, -1.12, 0.04), (-2.10, -1.18, 0.02),
        (-2.10, -1.08, 0.36), (2.40, -1.00, 0.40),
        0.028, hull, collection, 0.004,
    )
    add_folded_sheet(
        "Chine_S",
        (2.40, 1.12, 0.04), (2.40, 1.00, 0.40),
        (-2.10, 1.08, 0.36), (-2.10, 1.18, 0.02),
        0.028, hull, collection, 0.004,
    )
    add_folded_sheet(
        "Keel_Spine",
        (1.60, -0.12, -0.98), (-2.00, -0.12, -0.90),
        (-2.00, 0.12, -0.90), (1.60, 0.12, -0.98),
        0.040, hull, collection, 0.004,
    )
    add_overlap_plate("Armor_CheekP", (0.70, -1.36, 0.22), (0.48, 0.032, 0.22), armor, collection, 0.006)
    add_overlap_plate("Armor_CheekS", (0.70, 1.36, 0.22), (0.48, 0.032, 0.22), armor, collection, 0.006)
    add_overlap_plate("Armor_NoseP", (4.55, -0.50, 0.28), (0.36, 0.026, 0.16), armor, collection, 0.004)
    add_overlap_plate("Armor_NoseS", (4.55, 0.50, 0.28), (0.36, 0.026, 0.16), armor, collection, 0.004)
    add_overlap_plate("Armor_HouseP", (-3.40, -1.02, 0.28), (0.55, 0.030, 0.20), armor, collection, 0.005)
    add_overlap_plate("Armor_HouseS", (-3.40, 1.02, 0.28), (0.55, 0.030, 0.20), armor, collection, 0.005)
    add_overlap_plate("Armor_KeelFore", (1.20, 0.00, -0.96), (0.50, 0.14, 0.024), hull, collection, 0.004)
    add_overlap_plate("Armor_KeelAft", (-1.10, 0.00, -0.90), (0.46, 0.12, 0.022), hull, collection, 0.004)
    add_box("Accent_WaistP", (0.15, -1.38, 0.18), (0.28, 0.010, 0.04), accent, collection, 0.002)
    add_box("Accent_WaistS", (0.15, 1.38, 0.18), (0.28, 0.010, 0.04), accent, collection, 0.002)
    add_box("TransomBulkhead", (-4.72, 0.0, 0.16), (0.060, 0.90, 0.76), hull, collection, 0.006)
    add_box("AftBulkhead", (-3.35, 0.0, 0.14), (0.045, 1.00, 0.80), hull, collection, 0.005)
    add_box("TransomPlate", (-4.92, 0.0, 0.14), (0.018, 0.32, 0.16), hull, collection, 0.003)

    add_tile_bank("FlankTiles_P", 1.40, -1.60, -1.32, 0.22, 3, 0.14, 0.022, 0.08, armor, collection, 0.03)
    add_tile_bank("FlankTiles_S", 1.40, -1.60, 1.32, 0.22, 3, 0.14, 0.022, 0.08, armor, collection, 0.03)
    add_tile_bank("KeelTiles", 1.40, -1.70, 0.00, -0.94, 3, 0.16, 0.09, 0.014, hull, collection, 0.03)

    for sign, side in ((-1, "Port"), (1, "Starboard")):
        add_blended_interceptor_wing(f"Wing_{side}", sign, hull, armor, collection)
        add_folded_sheet(
            f"GloveCheek_{side}",
            (1.18, 1.14 * sign, -0.08), (-0.10, 1.40 * sign, -0.10),
            (-0.10, 1.40 * sign, 0.32), (1.18, 1.14 * sign, 0.36),
            0.036, hull, collection, 0.004,
        )
        add_merged_nacelle(side, sign, lod, mats, collection)
        loft_from_rings(f"Canard_{side}", [
            airfoil_ring(4.55, 0.50 * sign, 0.10, 0.72, 0.16),
            airfoil_ring(4.22, 0.96 * sign, 0.08, 0.42, 0.08),
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
        add_radiator_cassette("PortFlank", (-3.05, -1.08, 0.16), lod, mats, collection, length=0.72, height=0.16, yaw=0.0)
        add_radiator_cassette("StbdFlank", (-3.05, 1.08, 0.16), lod, mats, collection, length=0.72, height=0.16, yaw=0.0)
    add_sensor_dish("Dorsal", (-0.15, 0.18, 1.18), mats, collection)
    add_service_hatch("Dorsal", (-1.15, 0.28, 1.06), mats, collection, sx=0.32, sy=0.22)
    add_overlap_plate("Repair_Patch", (0.85, -0.42, 1.10), (0.22, 0.10, 0.010), warning, collection, 0.002)
    if lod == 0:
        add_curve_hose(
            "Hose_RadStbd",
            [(-3.05, 1.18, 0.28), (-3.40, 1.10, 0.22), (-4.20, 0.88, 0.18), (-4.70, 0.72, 0.16)],
            mech, collection, 0.016,
        )
        add_curve_hose(
            "Hose_RadPort",
            [(-3.05, -1.18, 0.28), (-3.40, -1.10, 0.22), (-4.20, -0.88, 0.18), (-4.70, -0.72, 0.16)],
            mech, collection, 0.016,
        )
        add_folded_sheet(
            "ServicePad_P",
            (-0.40, -1.38, 0.04), (-0.18, -1.38, 0.04),
            (-0.18, -1.22, 0.14), (-0.40, -1.22, 0.14),
            0.012, mech, collection, 0.002,
        )
        add_folded_sheet(
            "ServicePad_S",
            (-0.40, 1.38, 0.04), (-0.40, 1.22, 0.14),
            (-0.18, 1.22, 0.14), (-0.18, 1.38, 0.04),
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
        (5.7, 0, 0.14), (0.2, -3.7, 0.12), (0.2, 3.7, 0.12),
        (-5.1, -1.2, 0.16), (-5.1, 1.2, 0.16),
        (1.2, -1.2, -1.05), (1.2, 1.2, -1.05),
        (3.2, 0, 1.22), (-0.6, 0, 1.18),
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
    try:
        scene.view_settings.look = "AgX - Medium Contrast"
    except TypeError:
        scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.95
    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.036, 0.040, 0.046, 1)
    bg.inputs["Strength"].default_value = 1.15
    cam_data = bpy.data.cameras.new("CycleCam")
    camera = bpy.data.objects.new("CycleCam", cam_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name, loc, energy, color, size in (
        ("Key", (16, -18, 12), 1400, (0.94, 0.96, 1), 22),
        ("Fill", (4, 16, 8), 2200, (0.76, 0.80, 0.84), 20),
        ("Rim", (-14, -5, 7), 700, (0.78, 0.84, 0.92), 14),
        ("Kick", (-6, 10, -4), 400, (0.74, 0.78, 0.84), 12),
        ("AftFill", (-18, -2, 6), 900, (0.80, 0.84, 0.88), 16),
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
        "three_quarter": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
        "starboard": ((0.35, 14.6, 2.8), (0.35, 0, 0.18), 32),
        "rear": ((-11.6, -4.6, 3.6), (-0.50, 0, 0.16), 36),
        "clay_three_quarter": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
        "grazing_close": ((6.6, -5.4, 2.0), (1.15, 0, 0.35), 48),
        "bay_interior": ((4.15, -1.35, 1.22), (3.22, 0.0, 0.88), 38),
        "drive_rear": ((-8.6, -2.2, 1.4), (-4.90, 0.72, 0.12), 50),
        "play_size": ((36, -32, 16), (0.20, 0, 0.16), 48),
        "orm_isolation": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
        "normal_isolation": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
        "id_or_material_id": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
        "material_three_quarter": ((10.8, -9.8, 5.2), (0.25, 0, 0.22), 36),
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
